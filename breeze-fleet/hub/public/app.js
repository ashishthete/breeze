'use strict';
// Dashboard client. Talks to the hub's operator API. The shared token from
// the URL (?token=…) is forwarded on each call.
const TOKEN = new URLSearchParams(location.search).get('token') || '';
const q = sel => document.querySelector(sel);

function api(path, opts = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const url = TOKEN ? path + sep + 'token=' + encodeURIComponent(TOKEN) : path;
  return fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
}
function toast(msg, err) { const t = q('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3800); }
function fmtBytes(b) { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(b) / Math.log(1024)); return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i]; }
function ago(ms) { const s = (Date.now() - ms) / 1000; if (s < 60) return Math.round(s) + 's ago'; if (s < 3600) return Math.round(s / 60) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function showLogin() {
  q('#app').hidden = true; q('#auth').hidden = false;
  q('#auth').innerHTML = `<h1>Breeze Fleet</h1><p>Access required.</p>
       <p class="devnote">Open the dashboard with the <code>?token=…</code> the hub printed at startup.</p>`;
}

async function approve(hostId, dbName, op, mode) {
  if (op === 'drop' && mode === 'apply' && !confirmInline(dbName)) return;
  const r = await api('/api/approve', { method: 'POST', body: JSON.stringify({ hostId, dbName, op, mode }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return toast(j.error || 'approval failed', true);
  toast(`${op} ${mode === 'apply' ? 'APPROVED (apply)' : 'queued (dry-run)'} for ${dbName}`);
  load();
}
// The frame blocks window.confirm(); use an inline typed confirmation instead.
function confirmInline(dbName) {
  const typed = prompt ? null : null; // prompt() also blocked in some frames
  return window.__armed === dbName; // require a prior "arm" click
}

function dbRow(h, db) {
  const canDrop = db.state === 'candidate';
  let actions = '';
  if (canDrop) actions += `<button class="btn sm warn" data-act="drop" data-mode="dry" data-host="${h.id}" data-db="${esc(db.name)}">Dry-run drop</button>
    <button class="btn sm danger" data-act="drop" data-mode="apply" data-host="${h.id}" data-db="${esc(db.name)}">Drop</button>`;
  // VACUUM (ANALYZE) is non-destructive — offer it on every staging database to reclaim space.
  if (db.isStaging) actions += `<button class="btn sm ghost" data-act="vacuum" data-mode="apply" data-host="${h.id}" data-db="${esc(db.name)}" title="VACUUM (ANALYZE) — reclaim space, non-destructive">Vacuum</button>`;
  return `<tr>
    <td><b>${esc(db.name)}</b></td>
    <td><span class="st ${db.state}">${db.state}</span></td>
    <td>${fmtBytes(db.sizeBytes)}</td>
    <td class="why">${esc((db.reasons || []).join('; '))}</td>
    <td><div class="row-actions">${actions}</div></td>
  </tr>`;
}

function hostCard(h) {
  const dbs = (h.databases || []).slice().sort((a, b) => b.sizeBytes - a.sizeBytes);
  const envBad = /prod/i.test(h.env);
  return `<div class="host">
    <div class="h">
      <span class="dot ${h.online ? 'on' : 'off'}"></span>
      <span class="name">${esc(h.name)}</span>
      <span class="badge env ${envBad ? 'prod' : ''}">${esc(h.env)}</span>
      ${h.pg && h.pg.version ? `<span class="meta">PostgreSQL ${esc(h.pg.version)} · ${esc(h.pg.host || h.pg.address || '')}</span>` : `<span class="meta">${h.pg && h.pg.error ? 'pg error: ' + esc(h.pg.error) : ''}</span>`}
      <span class="meta" style="margin-left:auto">seen ${ago(h.lastSeen)} · every ${h.interval}s</span>
    </div>
    <table><thead><tr><th>Database</th><th>State</th><th>Size</th><th>Why</th><th></th></tr></thead>
    <tbody>${dbs.length ? dbs.map(d => dbRow(h, d)).join('') : '<tr><td colspan="5" class="empty">No databases reported</td></tr>'}</tbody></table>
  </div>`;
}

function logRow(a) {
  const r = a.result || {};
  const detail = r.error ? 'error: ' + r.error : r.dryRun ? 'DRY-RUN · ' + (r.sql || '') : (r.executed ? 'EXECUTED · ' + (r.sql || '') : '');
  return `<div class="logrow"><span class="op">${esc(a.op)} ${esc(a.dbName)}</span>
    <span class="s-${a.status}">${a.status}${a.mode === 'apply' ? ' (apply)' : ' (dry)'}</span>
    <span class="why">${esc(detail)}</span>
    <span class="why" style="margin-left:auto">${esc(a.requestedBy || '')} · ${ago(a.requestedAt)}</span></div>`;
}

async function load() {
  const r = await api('/api/hosts');
  if (r.status === 401) return showLogin();
  const j = await r.json();
  q('#auth').hidden = true; q('#app').hidden = false;
  const hosts = j.hosts || [];
  let cands = 0, reclaim = 0;
  for (const h of hosts) for (const d of h.databases || []) if (d.state === 'candidate') { cands++; reclaim += d.sizeBytes; }
  q('#hostCount').textContent = hosts.length;
  q('#candCount').textContent = cands;
  q('#reclaim').textContent = fmtBytes(reclaim);
  q('#hosts').innerHTML = hosts.length ? hosts.map(hostCard).join('') : '<div class="empty">No hosts have reported yet. Start an agent pointed at this hub.</div>';
  const me = await api('/api/me').then(x => x.ok ? x.json() : null).catch(() => null);
  q('#who').innerHTML = me && me.user ? esc(me.user.name) : '';
  const la = await api('/api/actions').then(x => x.json()).catch(() => ({ actions: [] }));
  q('#log').innerHTML = (la.actions || []).length ? la.actions.map(logRow).join('') : '<div class="empty">No actions yet.</div>';
}

document.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const { act, mode, host, db } = b.dataset;
  // Two-step arm for a real drop (window.confirm is blocked in the frame).
  if (act === 'drop' && mode === 'apply' && window.__armed !== db) {
    window.__armed = db; b.textContent = 'Click again to drop'; b.classList.add('danger');
    setTimeout(() => { if (window.__armed === db) { window.__armed = null; b.textContent = 'Drop'; } }, 4000);
    return;
  }
  window.__armed = null;
  approve(host, db, act, mode);
});
q('#refresh').onclick = load;
let timer = setInterval(() => { if (q('#autorefresh').checked) load(); }, 5000);
load();
