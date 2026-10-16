#!/usr/bin/env node
'use strict';
// Breeze Fleet CLI — a thin client for the hub's human API. Read-only views
// plus the ability to approve a cleanup (same guardrails as the dashboard, as
// the hub enforces them). Auth: BREEZE_TOKEN (dev mode) or a session is not
// available from the CLI, so SSO-protected hubs accept only the dev token path.
const http = require('http');
const https = require('https');

const HUB = process.env.BREEZE_HUB || 'http://127.0.0.1:47700';
const TOKEN = process.env.BREEZE_TOKEN || '';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const sep = path.includes('?') ? '&' : '?';
    const url = new URL(HUB + path + (TOKEN ? sep + 'token=' + encodeURIComponent(TOKEN) : ''));
    const lib = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const r = lib.request(url, { method, headers: Object.assign({ 'X-Breeze-Token': TOKEN }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = {}; try { j = d ? JSON.parse(d) : {}; } catch {} resolve({ status: res.statusCode, json: j }); }); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const B = n => { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(n) / Math.log(1024)); return (n / 1024 ** i).toFixed(i ? 1 : 0) + u[i]; };
const pad = (s, n) => String(s).padEnd(n);

async function hosts(jsonOut) {
  const r = await req('GET', '/api/hosts');
  if (r.status === 401) { console.error('Unauthorized. Set BREEZE_TOKEN (dev mode). SSO-only hubs need the dashboard.'); process.exit(1); }
  if (jsonOut) return console.log(JSON.stringify(r.json, null, 2));
  const hs = r.json.hosts || [];
  if (!hs.length) return console.log('No hosts have reported yet.');
  for (const h of hs) {
    console.log(`\n● ${h.online ? '' : '(offline) '}${h.name}  [${h.env}]  ${h.pg && h.pg.version ? 'pg ' + h.pg.version : ''}`);
    console.log(`  ${pad('DATABASE', 28)} ${pad('STATE', 11)} ${pad('SIZE', 10)} WHY`);
    for (const d of (h.databases || []).sort((a, b) => b.sizeBytes - a.sizeBytes))
      console.log(`  ${pad(d.name, 28)} ${pad(d.state, 11)} ${pad(B(d.sizeBytes), 10)} ${(d.reasons || []).join('; ')}`);
  }
}
async function candidates(jsonOut) {
  const r = await req('GET', '/api/hosts');
  const out = [];
  for (const h of r.json.hosts || []) for (const d of h.databases || []) if (d.state === 'candidate') out.push({ host: h.name, hostId: h.id, db: d.name, size: d.sizeBytes, idleDays: d.idleDays });
  if (jsonOut) return console.log(JSON.stringify(out, null, 2));
  if (!out.length) return console.log('No drop candidates.');
  let total = 0;
  for (const c of out) { total += c.size; console.log(`${pad(c.host, 18)} ${pad(c.db, 28)} ${pad(B(c.size), 10)} idle ${c.idleDays}d`); }
  console.log(`\n${out.length} candidate(s), ${B(total)} reclaimable`);
}
async function approve(hostId, db, op, mode) {
  const r = await req('POST', '/api/approve', { hostId, dbName: db, op: op || 'drop', mode: mode === 'apply' ? 'apply' : 'dry' });
  console.log(r.status === 200 ? `Approved: ${op || 'drop'} ${db} (${mode === 'apply' ? 'apply' : 'dry-run'})` : 'Error: ' + (r.json.error || r.status));
}
async function actions(jsonOut) {
  const r = await req('GET', '/api/actions');
  if (jsonOut) return console.log(JSON.stringify(r.json, null, 2));
  for (const a of (r.json.actions || []).slice(0, 40).reverse())
    console.log(`${pad(a.status, 9)} ${pad(a.op, 7)} ${pad(a.dbName, 26)} ${a.mode} ${a.result && a.result.error ? '· ' + a.result.error : a.result && a.result.sql ? '· ' + a.result.sql : ''}`);
}

function usage() {
  console.log(`Breeze Fleet CLI  (hub: ${HUB})
  breeze-fleet hosts [--json]              list hosts and their databases
  breeze-fleet candidates [--json]         list drop candidates across the fleet
  breeze-fleet actions [--json]            recent approved/executed actions
  breeze-fleet approve <hostId> <db> [drop|vacuum] [dry|apply]
Environment: BREEZE_HUB (default ${HUB}), BREEZE_TOKEN (dev-mode auth token)`);
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const jsonOut = rest.includes('--json');
  try {
    if (cmd === 'hosts') await hosts(jsonOut);
    else if (cmd === 'candidates') await candidates(jsonOut);
    else if (cmd === 'actions') await actions(jsonOut);
    else if (cmd === 'approve') await approve(rest[0], rest[1], rest[2], rest[3]);
    else usage();
  } catch (e) { console.error('Error:', e.message); process.exit(1); }
})();
