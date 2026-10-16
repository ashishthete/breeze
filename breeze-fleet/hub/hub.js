'use strict';
// Breeze Fleet Hub — the central server.
//
//  * Agents (token-authenticated) POST inventory reports and poll for and
//    report back on approved cleanup actions.
//  * Humans (Entra SSO, or dev token when SSO is unconfigured) view the fleet
//    dashboard and APPROVE individual cleanup actions. Nothing destructive
//    happens without an explicit per-database human approval recorded here.
//
// Pure Node, no external deps. State persists to ~/.breeze-fleet/.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const auth = require('./auth');
const { score, appendHistory } = require('../lib/candidates');

const RUNDIR = path.join(os.homedir(), '.breeze-fleet');
const STATE_FILE = path.join(RUNDIR, 'hub-state.json');
const CONF_FILE = path.join(RUNDIR, 'hub.json');
const PUBLIC = path.join(__dirname, 'public');

function loadConf() {
  try { return JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')); } catch {}
  const conf = { token: process.env.BREEZE_TOKEN || crypto.randomBytes(24).toString('hex') };
  try { fs.mkdirSync(RUNDIR, { recursive: true, mode: 0o700 }); fs.writeFileSync(CONF_FILE, JSON.stringify(conf), { mode: 0o600 }); } catch {}
  return conf;
}
const CONF = loadConf();
const TOKEN = CONF.token; // enrollment token shared with agents

const state = { hosts: {}, actions: [] };
try { Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch {}
let saveTimer = null;
function saveSoon() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 }); } catch {} }, 1500); }

function ingest(r) {
  if (!r || !r.hostId) throw new Error('missing hostId');
  let h = state.hosts[r.hostId];
  if (!h) { h = state.hosts[r.hostId] = { id: r.hostId, firstSeen: Date.now(), dbHistory: {} }; }
  h.name = r.hostName || h.name || r.hostId;
  h.env = r.env || h.env || 'unknown';
  h.pg = r.pg || h.pg || null;
  h.policy = r.policy || h.policy || {};
  h.interval = r.interval || h.interval || 300;
  h.lastSeen = Date.now();
  h.latest = { at: r.at || Date.now(), databases: r.databases || [], system: r.system || null };
  const now = Date.now();
  for (const db of r.databases || []) if (db.isStaging) h.dbHistory[db.name] = appendHistory(h.dbHistory[db.name], db, now);
  // prune history for databases that no longer exist
  const live = new Set((r.databases || []).map(d => d.name));
  for (const k of Object.keys(h.dbHistory)) if (!live.has(k)) delete h.dbHistory[k];
  saveSoon();
  return h;
}

function hostView(h) {
  const now = Date.now();
  return {
    id: h.id, name: h.name, env: h.env, pg: h.pg, interval: h.interval,
    firstSeen: h.firstSeen, lastSeen: h.lastSeen,
    online: now - h.lastSeen < Math.max(2.5 * (h.interval || 300) * 1000, 120000),
    system: h.latest && h.latest.system,
    databases: score(h, h.policy),
    policy: h.policy,
  };
}

function send(res, code, body, type = 'application/json', extra) {
  const data = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra || {}));
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => { let b = '', n = 0;
    req.on('data', c => { n += c.length; if (n > 4 << 20) { req.destroy(); reject(new Error('too large')); } b += c; });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } }); });
}
const agentAuthed = req => (req.headers['x-breeze-token'] || '') === TOKEN;

// Human auth: real SSO session when configured, else dev token in the query.
function humanUser(req, url) {
  if (auth.isConfigured()) return auth.readSession(req.headers.cookie);
  return (url.searchParams.get('token') === TOKEN) ? { name: 'dev (SSO off)', email: '', dev: true } : null;
}

const STATIC = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'application/javascript'], '/styles.css': ['styles.css', 'text/css'] };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    // ---- SSO endpoints ----
    if (p === '/auth/login') {
      if (!auth.isConfigured()) return send(res, 400, 'SSO not configured (dev mode). Append ?token=… to the URL.', 'text/plain');
      return send(res, 302, '', 'text/plain', { Location: auth.authorizeUrl() });
    }
    if (p === '/auth/callback') {
      try {
        const user = await auth.handleCallback(url.searchParams.get('code'), url.searchParams.get('state'));
        return send(res, 302, '', 'text/plain', { Location: '/', 'Set-Cookie': auth.cookie(auth.createSession(user), 28800) });
      } catch (e) { return send(res, 403, 'Sign-in failed: ' + e.message, 'text/plain'); }
    }
    if (p === '/auth/logout') { auth.destroySession(req.headers.cookie); return send(res, 302, '', 'text/plain', { Location: '/', 'Set-Cookie': auth.cookie('', 0) }); }

    // ---- static dashboard ----
    if (req.method === 'GET' && STATIC[p]) {
      let body = fs.readFileSync(path.join(PUBLIC, STATIC[p][0]), 'utf8');
      if (STATIC[p][0] === 'index.html') body = body.replace('__SSO__', auth.isConfigured() ? 'on' : 'off');
      return send(res, 200, body, STATIC[p][1]);
    }

    // ---- agent API (token) ----
    if (p.startsWith('/api/agent/')) {
      if (!agentAuthed(req)) return send(res, 403, { error: 'bad token' });
      if (req.method === 'POST' && p === '/api/agent/report') { const h = ingest(await readBody(req)); return send(res, 200, { ok: true, id: h.id }); }
      if (req.method === 'GET' && p === '/api/agent/actions') {
        const hostId = url.searchParams.get('hostId');
        return send(res, 200, { actions: state.actions.filter(a => a.hostId === hostId && a.status === 'approved') });
      }
      if (req.method === 'POST' && p === '/api/agent/result') {
        const { id, status, result } = await readBody(req);
        const a = state.actions.find(x => x.id === id);
        if (a) { a.status = status === 'done' ? 'done' : 'failed'; a.result = result || null; a.resolvedAt = Date.now(); saveSoon(); }
        return send(res, 200, { ok: !!a });
      }
      return send(res, 404, { error: 'not found' });
    }

    // ---- human API (SSO / dev token) ----
    if (p.startsWith('/api/')) {
      const user = humanUser(req, url);
      if (!user) return send(res, 401, { error: 'login required', ssoConfigured: auth.isConfigured() });
      if (req.method === 'GET' && p === '/api/me') return send(res, 200, { user });
      if (req.method === 'GET' && p === '/api/hosts')
        return send(res, 200, { now: Date.now(), ssoConfigured: auth.isConfigured(), hosts: Object.values(state.hosts).map(hostView).sort((a, b) => (a.name || '').localeCompare(b.name || '')) });
      if (req.method === 'GET' && p === '/api/actions')
        return send(res, 200, { actions: state.actions.slice(-200).reverse() });
      if (req.method === 'POST' && p === '/api/approve') {
        const { hostId, dbName, op, mode } = await readBody(req);
        const h = state.hosts[hostId];
        if (!h) return send(res, 404, { error: 'unknown host' });
        if (!['drop', 'vacuum'].includes(op)) return send(res, 400, { error: 'bad op' });
        // Validate against the live scored candidate — only a current candidate
        // (for drop) or staging db (for vacuum) can be approved.
        const scored = score(h, h.policy).find(d => d.name === dbName);
        if (!scored) return send(res, 404, { error: 'unknown database' });
        if (op === 'drop' && scored.state !== 'candidate') return send(res, 409, { error: `not a drop candidate (state: ${scored.state})` });
        if (!scored.isStaging) return send(res, 409, { error: 'not a staging database' });
        const action = { id: crypto.randomBytes(8).toString('hex'), hostId, dbName, op,
          mode: mode === 'apply' ? 'apply' : 'dry', status: 'approved',
          requestedBy: user.email || user.name, requestedAt: Date.now(), result: null };
        state.actions.push(action); saveSoon();
        return send(res, 200, { ok: true, action });
      }
      if (req.method === 'POST' && p === '/api/forget') { const { id } = await readBody(req); delete state.hosts[id]; saveSoon(); return send(res, 200, { ok: true }); }
      return send(res, 404, { error: 'not found' });
    }
    return send(res, 404, 'Not found', 'text/plain');
  } catch (err) { send(res, 500, { error: String(err && err.message || err) }); }
});

function start(port = Number(process.env.BREEZE_HUB_PORT) || 47700, bind = process.env.BREEZE_HUB_BIND || '127.0.0.1') {
  server.on('error', e => { if (e.code === 'EADDRINUSE') { console.error(`Port ${port} busy — trying ${port + 1}`); return start(port + 1, bind); } console.error('Hub error:', e.message); process.exit(1); });
  server.listen(port, bind, () => {
    const host = bind === '0.0.0.0' ? os.hostname() : '127.0.0.1';
    console.log(`\n  Breeze Fleet Hub  ·  ${bind}:${port}  ·  ${Object.keys(state.hosts).length} host(s) known`);
    console.log(`  SSO: ${auth.isConfigured() ? 'Microsoft Entra (enabled)' : 'DEV MODE — token only (set AZURE_* + SESSION_SECRET to enable)'}`);
    console.log(auth.isConfigured() ? `  Dashboard:  http://${host}:${port}/` : `  Dashboard:  http://${host}:${port}/?token=${TOKEN}`);
    console.log(`  Enroll an agent:\n    BREEZE_TOKEN=${TOKEN} BREEZE_HUB=http://${host}:${port} node agent/agent.js --config agent.config.json\n`);
  });
}
if (require.main === module) start();
module.exports = { start, ingest, state };
