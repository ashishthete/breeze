#!/usr/bin/env node
'use strict';
// Breeze Fleet Agent — runs on (or near) a Postgres host. Every interval it:
//   1. inventories databases + activity and REPORTS them to the hub,
//   2. polls the hub for human-APPROVED cleanup actions and executes them,
//      re-validating each against the staging safety gate at execution time.
//
// Destructive actions are dry-run unless BOTH the approval says "apply" AND
// this agent was started with apply enabled (config.apply / --apply / BREEZE_APPLY=1).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const pg = require('../lib/pg');
const dbsafety = require('../lib/dbsafety');

// ---- config ----
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--config') a.config = argv[++i];
    else if (t === '--once') a.once = true;
    else if (t === '--apply') a.apply = true;
    else if (t === '--interval') a.interval = Number(argv[++i]);
    else a._.push(t);
  }
  return a;
}
const ARGS = parseArgs(process.argv.slice(2));
let fileConf = {};
if (ARGS.config) { try { fileConf = JSON.parse(fs.readFileSync(ARGS.config, 'utf8')); } catch (e) { console.error('config read failed:', e.message); process.exit(1); } }

const CONF = {
  hostName: fileConf.hostName || process.env.BREEZE_HOSTNAME || os.hostname(),
  env: process.env.BREEZE_ENV || fileConf.env || 'unknown',
  hub: process.env.BREEZE_HUB || fileConf.hub || 'http://127.0.0.1:47700',
  token: process.env.BREEZE_TOKEN || fileConf.token || '',
  intervalSec: ARGS.interval || Number(process.env.BREEZE_INTERVAL) || fileConf.intervalSec || 300,
  apply: !!(ARGS.apply || process.env.BREEZE_APPLY === '1' || fileConf.apply),
  pg: fileConf.pg || {},
  policy: Object.assign({ env: process.env.BREEZE_ENV || fileConf.env || 'unknown' }, fileConf.policy || {}),
};
CONF.policy.env = CONF.env;

// Stable host id, persisted so the hub tracks one logical host across restarts.
const RUNDIR = path.join(os.homedir(), '.breeze-fleet');
const IDFILE = path.join(RUNDIR, 'host-id');
function hostId() {
  try { return fs.readFileSync(IDFILE, 'utf8').trim(); } catch {}
  const id = crypto.createHash('sha256').update(os.hostname() + '|' + (CONF.pg.host || '') + '|' + crypto.randomBytes(6).toString('hex')).digest('hex').slice(0, 16);
  try { fs.mkdirSync(RUNDIR, { recursive: true, mode: 0o700 }); fs.writeFileSync(IDFILE, id, { mode: 0o600 }); } catch {}
  return id;
}
const HOST_ID = hostId();

// ---- tiny http client ----
function request(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const req = lib.request(u, { method, headers: Object.assign(
      { 'X-Breeze-Token': CONF.token }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, json: d ? JSON.parse(d) : {} }); } catch { resolve({ status: res.statusCode, json: {} }); } }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

function sysStats() {
  const load = os.loadavg();
  return { load1: load[0], cpus: os.cpus().length, memUsed: os.totalmem() - os.freemem(), memTotal: os.totalmem(), uptime: os.uptime() };
}

async function inventory() {
  const dbs = await pg.listDatabases(CONF.pg);
  return dbs.map(db => { const c = dbsafety.classify(db.name, CONF.policy); return Object.assign({}, db, { isStaging: c.isStaging, classifyReasons: c.reasons }); });
}

async function reportCycle() {
  let databases = [], serverErr = null, server = null;
  try { databases = await inventory(); server = await pg.serverInfo(CONF.pg); }
  catch (e) { serverErr = e.message; }
  const payload = { hostId: HOST_ID, hostName: CONF.hostName, env: CONF.env, interval: CONF.intervalSec,
    at: Date.now(), pg: server ? { address: server.address, version: server.version, host: CONF.pg.host || 'local' } : { error: serverErr },
    policy: CONF.policy, databases, system: sysStats() };
  try {
    const r = await request('POST', CONF.hub + '/api/agent/report', payload);
    if (r.status !== 200) console.error('report rejected:', r.status, JSON.stringify(r.json));
    else console.log(`[${new Date().toISOString()}] reported ${databases.length} db(s)${serverErr ? ' (pg error: ' + serverErr + ')' : ''} to hub`);
  } catch (e) { console.error('report failed:', e.message); }
}

async function executeAction(a, liveDbs) {
  const db = liveDbs.find(d => d.name === a.dbName);
  if (!db) throw new Error(`database ${a.dbName} no longer present`);
  // Approval says apply, but the agent must ALSO be in apply mode to touch data.
  const dryRun = a.mode !== 'apply' || !CONF.apply;
  if (a.op === 'drop') {
    const ident = dbsafety.assertDroppable(db, CONF.policy); // throws unless safe right now
    const r = await pg.dropDatabase(ident, CONF.pg, { dryRun });
    return Object.assign({ op: 'drop', db: a.dbName, applyRequested: a.mode === 'apply', agentApply: CONF.apply }, r);
  }
  if (a.op === 'vacuum') {
    const ident = dbsafety.assertVacuumable(db, CONF.policy);
    const r = await pg.vacuumDatabase(ident, CONF.pg, { dryRun });
    return Object.assign({ op: 'vacuum', db: a.dbName, applyRequested: a.mode === 'apply', agentApply: CONF.apply }, r);
  }
  throw new Error('unknown op ' + a.op);
}

async function actionCycle() {
  let r;
  try { r = await request('GET', CONF.hub + `/api/agent/actions?hostId=${HOST_ID}`); } catch (e) { return console.error('poll failed:', e.message); }
  const actions = (r.json && r.json.actions) || [];
  if (!actions.length) return;
  let liveDbs;
  try { liveDbs = await inventory(); } catch (e) { return console.error('cannot re-inventory before executing:', e.message); }
  for (const a of actions) {
    let status = 'done', result;
    try { result = await executeAction(a, liveDbs); console.log(`action ${a.id} ${a.op} ${a.dbName}: ${result.dryRun ? 'DRY-RUN' : 'EXECUTED'}`); }
    catch (e) { status = 'failed'; result = { error: e.message }; console.error(`action ${a.id} refused/failed:`, e.message); }
    try { await request('POST', CONF.hub + '/api/agent/result', { id: a.id, status, result }); } catch (e) { console.error('result post failed:', e.message); }
  }
}

async function cycle() { await reportCycle(); await actionCycle(); }

async function main() {
  if (!CONF.token) { console.error('No enrollment token. Set BREEZE_TOKEN or put "token" in the config.'); process.exit(1); }
  console.log(`Breeze Fleet Agent  host=${CONF.hostName}  id=${HOST_ID}  env=${CONF.env}  apply=${CONF.apply ? 'ON' : 'off (dry-run)'}  hub=${CONF.hub}`);
  if (CONF.env !== 'staging') console.log('  note: env is not "staging" — all destructive actions will be refused by the safety gate.');
  await cycle();
  if (ARGS.once) return;
  setInterval(() => cycle().catch(e => console.error('cycle error:', e.message)), CONF.intervalSec * 1000);
}
main().catch(e => { console.error(e); process.exit(1); });
