'use strict';
const api = window.breeze;

/* ----------------------------- icons ----------------------------- */
const I = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  junk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
  large: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M9 9h6v6H9z"/></svg>',
  dupes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>',
  privacy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>',
  photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.8"/><path d="M3 17l5-4 4 3 3-2 6 4"/></svg>',
  apps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  startup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/></svg>',
  memory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="10" rx="2"/><path d="M8 7V4M12 7V4M16 7V4M8 20v-3M12 20v-3M16 20v-3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  spin: '<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
};

/* ----------------------------- helpers ----------------------------- */
const GB = 1024 ** 3, MB = 1024 ** 2, KB = 1024;
function fmt(b) {
  if (!b) return '0 B';
  if (b >= GB) return (b / GB).toFixed(b >= 10 * GB ? 0 : 1) + ' GB';
  if (b >= MB) return (b / MB).toFixed(b >= 10 * MB ? 0 : 1) + ' MB';
  if (b >= KB) return (b / KB).toFixed(0) + ' KB';
  return b + ' B';
}
function ext(name) { const m = name.match(/\.([a-z0-9]{1,5})$/i); return m ? m[1].toUpperCase() : 'DIR'; }
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ----------------------------- state ----------------------------- */
const CATS = {
  junk: { title: 'System Junk', icon: 'junk', sub: 'Caches, logs and leftover developer data', kind: 'scan' },
  large: { title: 'Large & Old Files', icon: 'large', sub: 'Big files in Downloads, Desktop and Movies', kind: 'scan' },
  dupes: { title: 'Duplicate Finder', icon: 'dupes', sub: 'Byte-identical copies, verified by content hash', kind: 'scan' },
  privacy: { title: 'Privacy', icon: 'privacy', sub: 'Browser caches that rebuild on next launch', kind: 'scan' },
  photos: { title: 'Photo Manager', icon: 'photos', sub: 'Screenshots, exact duplicates and similar photos', kind: 'photos' },
  apps: { title: 'App Uninstaller', icon: 'apps', sub: 'Remove apps and the support files they leave behind', kind: 'apps' },
};
const state = {};           // cat -> scan result (normalized)
let disk = { total: 0, used: 0, avail: 0 };
let totalFreed = 0;
let current = 'overview';
let busy = false;
let dryRun = loadDry();
let photosIncludeAll = false;

// Synthesized "move to Trash" sound — a short noise swoosh with a downward
// filter sweep and a soft low thump. Generated so no audio asset is needed and
// nothing is loaded over the network. Silently no-ops if audio is unavailable.
let _audioCtx = null;
function playTrashSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    _audioCtx = _audioCtx || new AC();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;

    // Noise swoosh (the "crumple").
    const dur = 0.28;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(380, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    noise.connect(bp).connect(ng).connect(ctx.destination);
    noise.start(t); noise.stop(t + dur);

    // Soft low thump (the item "landing").
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t + 0.12); osc.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t + 0.12);
    og.gain.exponentialRampToValueAtTime(0.22, t + 0.16);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(og).connect(ctx.destination);
    osc.start(t + 0.12); osc.stop(t + 0.34);
  } catch { /* audio not available — ignore */ }
}

function loadDry() { try { return localStorage.getItem('breeze-dry') === '1'; } catch { return false; } }
function saveDry(v) { try { localStorage.setItem('breeze-dry', v ? '1' : '0'); } catch {} }

/* ----------------------------- nav ----------------------------- */
const NAV = [
  { group: 'Smart' }, { id: 'overview', label: 'Overview', icon: 'overview' },
  { group: 'Cleanup' },
  { id: 'junk', label: 'System Junk', icon: 'junk' },
  { id: 'large', label: 'Large & Old Files', icon: 'large' },
  { id: 'dupes', label: 'Duplicate Finder', icon: 'dupes' },
  { id: 'privacy', label: 'Privacy', icon: 'privacy' },
  { id: 'photos', label: 'Photo Manager', icon: 'photos' },
  { group: 'Optimize' },
  { id: 'apps', label: 'App Uninstaller', icon: 'apps' },
  { id: 'startup', label: 'Startup Items', icon: 'startup' },
  { id: 'memory', label: 'Memory', icon: 'memory' },
];

function renderNav() {
  const nav = $('#nav'); nav.innerHTML = '';
  for (const n of NAV) {
    if (n.group) { const li = document.createElement('li'); li.className = 'group-label'; li.textContent = n.group; nav.appendChild(li); continue; }
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.setAttribute('aria-current', current === n.id ? 'true' : 'false');
    let badge = '';
    const r = state[n.id];
    if (r) { const f = foundBytes(r); if (f > 0) badge = `<span class="badge num">${fmt(f)}</span>`; }
    b.innerHTML = `<span class="ic">${I[n.icon]}</span><span>${n.label}</span>${badge}`;
    b.onclick = () => { if (!busy) { current = n.id; render(); } };
    li.appendChild(b); nav.appendChild(li);
  }
}

/* ----------------------------- normalize scan results ----------------------------- */
function normalize(cat, res) {
  // produce a flat .items array with {id,name,path,size,tag,sel} + optional .groups
  if (cat === 'apps') {
    res.items.forEach(a => { a.sel = false; });
    return res;
  }
  const setSel = it => { it.sel = it.tag !== 'keep'; };
  if (res.groups) res.groups.forEach(g => g.items.forEach(setSel));
  if (res.items) res.items.forEach(setSel);
  return res;
}
function allItems(r) {
  if (!r) return [];
  if (r.items && !r.groups) return r.items;
  if (r.groups) return r.groups.flatMap(g => g.items);
  return [];
}
function foundBytes(r) {
  if (!r) return 0;
  if (CATS_apps(r)) return r.items.reduce((a, x) => a + x.size + (x.leftoverSize || 0), 0);
  return allItems(r).reduce((a, i) => a + i.size, 0);
}
function CATS_apps(r) { return r && r.items && r.items[0] && 'leftoverSize' in r.items[0]; }
function selectedItems(r) { return allItems(r).filter(i => i.sel); }
function selectedBytes(r) { return selectedItems(r).reduce((a, i) => a + i.size, 0); }

/* ----------------------------- toast ----------------------------- */
function toast(msg, warn) {
  const t = document.createElement('div');
  t.className = 'toast' + (warn ? ' warn' : '');
  t.innerHTML = `${I.check}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

/* ----------------------------- disk / store bar ----------------------------- */
async function refreshDisk() {
  try { disk = await api.disk(); } catch {}
  const usedPct = disk.total ? (disk.used / disk.total * 100) : 0;
  $('#storeBar').style.width = usedPct + '%';
  $('#storeLabel').textContent = disk.total ? `Macintosh HD · ${fmt(disk.avail)} free` : 'Disk unavailable';
}

/* ----------------------------- scanning progress (indeterminate, real timing) ----------------------------- */
function fakeProgress(container, onTick) {
  const prog = container.querySelector('.progress i');
  const pct = container.querySelector('.pct');
  const pathEl = container.querySelector('.path');
  const paths = ['~/Library/Caches', '~/Library/Logs', '~/Downloads', '~/Library/Developer/Xcode', '~/Desktop', '~/Library/Application Support'];
  let v = 0;
  const t = setInterval(() => {
    v = Math.min(v + Math.random() * 6 + 2, 92); // creep toward 92, finish on real completion
    if (prog) prog.style.width = v + '%';
    if (pct) pct.textContent = Math.floor(v) + '%';
    if (pathEl) pathEl.textContent = paths[Math.floor(Math.random() * paths.length)];
  }, 180);
  return () => { clearInterval(t); if (prog) prog.style.width = '100%'; if (pct) pct.textContent = '100%'; };
}

async function doScan(cat) {
  if (busy) return;
  busy = true; renderNav();
  const main = $('#main');

  // Give the re-scan / scan button an active spinner so the click registers.
  const sbtn = $('#rescanBtn') || $('#scanBtn');
  if (sbtn) { sbtn.disabled = true; sbtn.dataset.html = sbtn.innerHTML; sbtn.innerHTML = `${I.spin} Scanning…`; }

  // Where to animate the progress bar. The empty/initial view has an inline
  // .progress-wrap; the results view does not, so overlay one over the card and
  // dim the stale results until the fresh scan lands.
  let pw = main.querySelector('.progress-wrap');
  let overlay = null;
  if (pw) {
    pw.hidden = false;
    const emptyBox = main.querySelector('.empty'); if (emptyBox) emptyBox.style.opacity = '.4';
  } else {
    const card = main.querySelector('.result-card') || main.querySelector('.card');
    if (card) {
      card.classList.add('rescanning');
      overlay = document.createElement('div');
      overlay.className = 'scan-overlay';
      overlay.innerHTML = `<div class="scan-overlay-inner">${I.spin}<span>Re-scanning…</span><div class="progress-wrap"><div class="progress"><i></i></div><div class="progress-status"><span class="path"></span><span class="pct num">0%</span></div></div></div>`;
      card.appendChild(overlay);
      pw = overlay.querySelector('.progress-wrap');
    }
  }
  const stop = pw ? fakeProgress(pw) : () => {};
  try {
    const opts = cat === 'photos' ? { includeAll: photosIncludeAll } : undefined;
    const res = normalize(cat, await api.scan(cat, opts));
    state[cat] = res;
    stop();
    busy = false;
    render();
    toast(`${CATS[cat].title}: ${fmt(foundBytes(res))} ${cat === 'apps' ? 'removable' : 'found'}`);
  } catch (err) {
    stop(); busy = false; render();
    toast('Scan failed: ' + err.message, true);
  }
}

/* ----------------------------- clean ----------------------------- */
async function doClean(cat, ids, label) {
  if (busy || !ids.length) return;
  busy = true;
  const btn = $('#cleanBtn'); if (btn) { btn.disabled = true; btn.innerHTML = `${I.spin} ${dryRun ? 'Previewing…' : 'Moving to Trash…'}`; }
  try {
    const res = await api.clean(ids, { dryRun, mode: cat === 'photos' ? 'photos' : undefined });
    if (!dryRun) {
      const gone = new Set(res.trashed.map(t => t.id));
      const r = state[cat];
      if (r.groups) { r.groups.forEach(g => g.items = g.items.filter(it => !gone.has(it.id))); r.groups = r.groups.filter(g => g.items.length); }
      if (r.items) r.items = r.items.filter(it => !gone.has(it.id));
      totalFreed += res.freed;
      if (res.trashed.length) playTrashSound();
      await refreshDisk();
    }
    busy = false; render();
    if (res.errors.length) toast(`${dryRun ? 'Preview' : 'Cleaned'} with ${res.errors.length} skipped · ${fmt(res.freed)}`, true);
    else toast(`${dryRun ? 'Would free' : 'Freed'} ${fmt(res.freed)}${dryRun ? ' (dry run — nothing removed)' : ''}`);
  } catch (err) {
    busy = false; render();
    toast('Clean failed: ' + err.message, true);
  }
}
let selectedById = new Set();

/* ----------------------------- render dispatch ----------------------------- */
function render() {
  renderNav();
  $('#main').scrollTop = 0;
  if (current === 'overview') return renderOverview();
  if (current === 'memory') return renderMemory();
  if (current === 'startup') return renderStartup();
  if (current === 'apps') return renderApps();
  if (current === 'photos') return renderPhotos();
  return renderScanner(current);
}
function headHTML(title, sub, chip) {
  const c = chip === 'pro' ? '<span class="pro-chip">REAL</span>' : chip === 'ro' ? '<span class="ro-chip">READ-ONLY</span>' : '';
  return `<div class="head"><div><h1>${esc(title)}${c}</h1><p>${esc(sub)}</p></div></div>`;
}
function progressWrapHTML() {
  return `<div class="progress-wrap" hidden><div class="progress"><i></i></div><div class="progress-status"><span class="path"></span><span class="pct num">0%</span></div></div>`;
}

/* ----------------------------- overview ----------------------------- */
function renderOverview() {
  const usedPct = disk.total ? Math.round(disk.used / disk.total * 100) : 0;
  const freePct = 100 - usedPct;
  const R = 78, C = 2 * Math.PI * R;
  const usedFrac = disk.total ? disk.used / disk.total : 0;
  const donut = `
    <circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--surface-3)" stroke-width="20"/>
    <circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--accent)" stroke-width="20" stroke-linecap="round"
      stroke-dasharray="${(usedFrac * C).toFixed(1)} ${C.toFixed(1)}"/>`;

  const reclaimable = Object.keys(CATS).reduce((a, c) => a + (state[c] ? foundBytes(state[c]) : 0), 0);
  const scannedAny = Object.keys(CATS).some(c => state[c]);

  const cats = Object.keys(CATS).map(id => {
    const c = CATS[id], r = state[id];
    const found = r ? foundBytes(r) : 0;
    const line = !r ? `<div class="foundline none">Not scanned yet</div>`
      : found > 0 ? `<div class="foundline has num">${fmt(found)} ${id === 'apps' ? 'removable' : 'found'}</div>`
        : `<div class="foundline none">Clean</div>`;
    return `<button class="cat" data-go="${id}"><div class="top"><span class="ico">${I[c.icon]}</span><h3>${c.title}</h3></div><p class="sub">${c.sub}</p>${line}</button>`;
  }).join('');

  $('#main').innerHTML = `<div class="panel">
    ${headHTML('Overview', 'Live view of this Mac. Scans read the real filesystem; cleaning moves items to the Trash.')}
    <div class="callout">${I.info}<div>Cleaning never deletes permanently. Everything goes to the macOS Trash and can be restored with Put Back. ${dryRun ? '<b>Dry run is on</b> — scans and previews only, nothing is moved.' : ''}</div></div>
    <div class="grid-top">
      <div class="card disk-card">
        <div class="donut"><svg width="180" height="180" viewBox="0 0 180 180">${donut}</svg>
          <div class="center"><b class="num">${freePct}%</b><span>free of ${fmt(disk.total)}</span></div></div>
        <div class="legend">
          <div class="row"><span class="dot" style="background:var(--accent)"></span>Used<span class="amt num">${fmt(disk.used)}</span></div>
          <div class="row"><span class="dot" style="background:var(--surface-3)"></span>Free<span class="amt num">${fmt(disk.avail)}</span></div>
        </div>
      </div>
      <div class="card smart">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <span style="display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:var(--accent-soft);color:var(--accent)">${I.spark}</span>
          <div><div style="font-weight:700;font-size:16px;letter-spacing:-.3px">Smart Scan</div><div style="color:var(--muted);font-size:12.5px">Inspect caches, large files, duplicates, privacy traces and apps</div></div>
        </div>
        ${progressWrapHTML()}
        <div class="stat-grid" style="margin-top:14px">
          <div class="stat"><div class="k">Reclaimable</div><div class="v num">${scannedAny ? fmt(reclaimable) : '—'}</div></div>
          <div class="stat"><div class="k">Freed this session</div><div class="v num" style="color:var(--good)">${totalFreed ? fmt(totalFreed) : '—'}</div></div>
          <div class="stat"><div class="k">Free now</div><div class="v num">${disk.total ? fmt(disk.avail) : '—'}</div></div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn primary" id="smartBtn" ${busy ? 'disabled' : ''}>${I.scan} ${scannedAny ? 'Re-scan all' : 'Run Smart Scan'}</button>
          <label class="dry"><input type="checkbox" class="cb" id="dryTop" ${dryRun ? 'checked' : ''}> Dry run (no deletions)</label>
        </div>
      </div>
    </div>
    <div class="cat-grid">${cats}</div>
  </div>`;

  $('#main').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { current = b.dataset.go; render(); });
  $('#dryTop').onchange = e => { dryRun = e.target.checked; saveDry(dryRun); render(); };
  $('#smartBtn').onclick = () => smartScan();
}

async function smartScan() {
  if (busy) return;
  busy = true;
  const pw = $('#main .progress-wrap'); if (pw) pw.hidden = false;
  const stop = pw ? fakeProgress(pw) : () => {};
  const cats = ['junk', 'large', 'dupes', 'privacy', 'photos', 'apps'];
  try {
    for (const c of cats) state[c] = normalize(c, await api.scan(c));
    stop(); busy = false; render();
    const total = cats.reduce((a, c) => a + foundBytes(state[c]), 0);
    toast(`Smart Scan complete — ${fmt(total)} reclaimable`);
  } catch (err) { stop(); busy = false; render(); toast('Smart Scan failed: ' + err.message, true); }
}

/* ----------------------------- scanner panels ----------------------------- */
function renderScanner(cat) {
  const c = CATS[cat];
  const r = state[cat];
  const main = $('#main');
  if (!r) {
    main.innerHTML = `<div class="panel">${headHTML(c.title, c.sub, 'pro')}
      <div class="card">${progressWrapHTML()}
        <div class="empty"><div class="big">${I[c.icon]}</div><h3>Ready to scan</h3><p>${esc(c.sub)}.</p>
        <div style="margin-top:16px"><button class="btn primary" id="scanBtn" ${busy ? 'disabled' : ''}>${I.scan} Scan now</button></div></div>
      </div></div>`;
    $('#scanBtn').onclick = () => doScan(cat);
    return;
  }

  const items = allItems(r);
  const allSel = items.length && items.every(i => i.sel);
  const rows = r.groups
    ? r.groups.map(g => `<div class="group-title">${esc(g.name)}</div>${g.items.map(itemRow).join('')}`).join('')
    : items.map(itemRow).join('');

  main.innerHTML = `<div class="panel">${headHTML(c.title, c.sub, 'pro')}
    <div class="toolbar">
      <button class="btn ghost" id="rescanBtn" ${busy ? 'disabled' : ''}>${I.scan} Re-scan</button>
      <div class="selinfo"><b class="num">${selectedItems(r).length}</b> of ${items.length} selected</div>
      <div class="spacer"></div>
      <label class="dry"><input type="checkbox" class="cb" id="dryPanel" ${dryRun ? 'checked' : ''}> Dry run</label>
    </div>
    <div class="card result-card">
      <div class="rc-head"><label><input type="checkbox" class="cb" id="selAll" ${allSel ? 'checked' : ''}> Select all</label><span class="count num">${fmt(foundBytes(r))} found</span></div>
      <ul class="items ${r.groups ? 'group' : ''}">${rows || '<li class="item"><div class="meta"><div class="name">Nothing found — this area is already clean.</div></div></li>'}</ul>
    </div>
    <div class="sticky-foot"><div class="tot">Selected: <b class="num">${fmt(selectedBytes(r))}</b></div><div class="spacer"></div>
      <button class="btn danger" id="cleanBtn" ${selectedBytes(r) === 0 || busy ? 'disabled' : ''}>${I.check} ${dryRun ? 'Preview' : 'Move to Trash'} ${fmt(selectedBytes(r))}</button></div>
    <div class="hint">${I.info} Items tagged <b style="color:var(--danger)">Keep</b> are originals or files you chose; review before removing. Cleaning moves to Trash (reversible).</div>
  </div>`;

  $('#rescanBtn').onclick = () => { state[cat] = null; doScan(cat); };
  $('#dryPanel').onchange = e => { dryRun = e.target.checked; saveDry(dryRun); render(); };
  $('#selAll').onchange = e => { items.forEach(i => i.sel = e.target.checked); render(); };
  main.querySelectorAll('.item .cb[data-id]').forEach(cb => cb.onchange = () => {
    const it = items.find(i => i.id === cb.dataset.id); if (it) it.sel = cb.checked; render();
  });
  $('#cleanBtn').onclick = () => {
    const sel = selectedItems(r);
    selectedById = new Set(sel.map(i => i.id));
    doClean(cat, sel.map(i => i.id));
  };
}
function itemRow(i) {
  const tag = i.tag === 'safe' ? '<span class="tag safe">Safe</span>' : i.tag === 'keep' ? '<span class="tag keep">Keep</span>' : '';
  return `<li class="item"><input type="checkbox" class="cb" data-id="${i.id}" ${i.sel ? 'checked' : ''}>
    <span class="ficon">${ext(i.name)}</span>
    <div class="meta"><div class="name">${esc(i.name)}</div><div class="path">${esc(i.path)}</div></div>
    ${tag}<span class="size num">${fmt(i.size)}</span></li>`;
}

/* ----------------------------- app uninstaller ----------------------------- */
// Human idle label + severity from an app's daysIdle (null = never used/unknown).
function usageInfo(a) {
  const d = a.daysIdle;
  if (d == null) return { text: 'Never opened', level: 'danger', idle: true };
  if (d < 30) return { text: d <= 1 ? 'Used today' : `Used ${d}d ago`, level: 'good', idle: false };
  if (d < 90) return { text: `Idle ${Math.round(d / 30)}mo`, level: 'warn', idle: false };
  if (d < 365) return { text: `Unused · ${Math.round(d / 30)}mo`, level: 'danger', idle: true };
  const y = (d / 365).toFixed(d < 730 ? 1 : 0);
  return { text: `Unused · ${y}yr`, level: 'danger', idle: true };
}
let appsUnusedOnly = false;

function renderApps() {
  const r = state.apps;
  const main = $('#main');
  if (!r) {
    main.innerHTML = `<div class="panel">${headHTML('App Uninstaller', CATS.apps.sub, 'pro')}
      <div class="card">${progressWrapHTML()}
      <div class="empty"><div class="big">${I.apps}</div><h3>Scan installed apps</h3><p>Reads /Applications and finds each app's leftover support files.</p>
      <div style="margin-top:16px"><button class="btn primary" id="scanBtn" ${busy ? 'disabled' : ''}>${I.scan} Scan now</button></div></div></div></div>`;
    $('#scanBtn').onclick = () => doScan('apps');
    return;
  }
  const unusedCount = r.items.filter(a => usageInfo(a).idle).length;
  const shown = appsUnusedOnly ? r.items.filter(a => usageInfo(a).idle) : r.items;
  const sel = r.items.filter(a => a.sel);
  const selBytes = sel.reduce((s, a) => s + a.size + a.leftoverSize, 0);
  const rows = shown.map((a) => {
    const idx = r.items.indexOf(a);
    const u = usageInfo(a);
    return `<li class="item">
    <input type="checkbox" class="cb" data-i="${idx}" ${a.sel ? 'checked' : ''}>
    <span class="ficon" style="background:var(--accent-soft);color:var(--accent)">${esc(a.name.slice(0, 2).toUpperCase())}</span>
    <div class="meta"><div class="name">${esc(a.name)} <span class="usetag ${u.level}">${esc(u.text)}</span></div><div class="path">${esc(a.path)}${a.leftovers.length ? ' · ' + a.leftovers.length + ' leftover item' + (a.leftovers.length > 1 ? 's' : '') : ''}</div></div>
    ${a.leftoverSize ? `<span class="tag">+${fmt(a.leftoverSize)} leftovers</span>` : ''}
    <span class="size num">${fmt(a.size + a.leftoverSize)}</span></li>`;
  }).join('');

  main.innerHTML = `<div class="panel">${headHTML('App Uninstaller', CATS.apps.sub, 'pro')}
    <div class="toolbar"><button class="btn ghost" id="rescanBtn" ${busy ? 'disabled' : ''}>${I.scan} Re-scan</button>
      <label class="dry"><input type="checkbox" class="cb" id="unusedOnly" ${appsUnusedOnly ? 'checked' : ''}> Unused only${unusedCount ? ` (${unusedCount})` : ''}</label>
      <div class="selinfo"><b class="num">${sel.length}</b> of ${r.items.length} selected</div><div class="spacer"></div>
      <label class="dry"><input type="checkbox" class="cb" id="dryPanel" ${dryRun ? 'checked' : ''}> Dry run</label></div>
    <div class="card result-card"><div class="rc-head"><label><input type="checkbox" class="cb" id="selAll" ${shown.length && shown.every(a => a.sel) ? 'checked' : ''}> Select ${appsUnusedOnly ? 'shown' : 'all'}</label><span class="count">Sorted by longest unused · App + leftover size</span></div>
      <ul class="items">${rows || `<li class="item"><div class="meta"><div class="path">No apps match this filter.</div></div></li>`}</ul></div>
    <div class="sticky-foot"><div class="tot">Will move to Trash: <b class="num">${fmt(selBytes)}</b></div><div class="spacer"></div>
      <button class="btn danger" id="cleanBtn" ${sel.length === 0 || busy ? 'disabled' : ''}>${I.check} ${dryRun ? 'Preview' : 'Uninstall'} ${sel.length || ''}</button></div>
    <div class="hint">${I.info} Uninstalling moves the app and its support, cache, preference and container files to the Trash.</div>
  </div>`;

  $('#rescanBtn').onclick = () => { state.apps = null; doScan('apps'); };
  $('#dryPanel').onchange = e => { dryRun = e.target.checked; saveDry(dryRun); render(); };
  $('#unusedOnly').onchange = e => { appsUnusedOnly = e.target.checked; render(); };
  $('#selAll').onchange = e => { shown.forEach(a => a.sel = e.target.checked); render(); };
  main.querySelectorAll('.item .cb[data-i]').forEach(cb => cb.onchange = () => { r.items[+cb.dataset.i].sel = cb.checked; render(); });
  $('#cleanBtn').onclick = () => {
    const chosen = r.items.filter(a => a.sel);
    const ids = chosen.flatMap(a => [a.id, ...a.leftovers.map(l => l.id)]);
    selectedById = new Set(ids);
    doCleanApps(chosen, ids);
  };
}
async function doCleanApps(chosen, ids) {
  if (busy || !ids.length) return;
  busy = true;
  const btn = $('#cleanBtn'); if (btn) { btn.disabled = true; btn.innerHTML = `${I.spin} ${dryRun ? 'Previewing…' : 'Uninstalling…'}`; }
  try {
    const res = await api.clean(ids, { dryRun, mode: 'apps' });
    if (!dryRun) {
      const gone = new Set(res.trashed.map(t => t.id));
      state.apps.items = state.apps.items.filter(a => !gone.has(a.id));
      totalFreed += res.freed;
      if (res.trashed.length) playTrashSound();
      await refreshDisk();
    }
    busy = false; render();
    toast(`${dryRun ? 'Would free' : 'Uninstalled · freed'} ${fmt(res.freed)}${res.errors.length ? ' · ' + res.errors.length + ' skipped' : ''}`, res.errors.length > 0);
  } catch (err) { busy = false; render(); toast('Uninstall failed: ' + err.message, true); }
}

/* ----------------------------- photo manager ----------------------------- */
const thumbCache = new Map();       // id -> dataURL (or 'none')
let thumbRun = 0;                   // cancels stale loader passes

function renderPhotos() {
  const cat = 'photos';
  const r = state[cat];
  const main = $('#main');
  if (!r) {
    main.innerHTML = `<div class="panel">${headHTML('Photo Manager', CATS.photos.sub, 'pro')}
      <div class="card">${progressWrapHTML()}
        <div class="empty"><div class="big">${I.photos}</div><h3>Organize your photos</h3>
        <p>Finds screenshots, byte-identical duplicates and visually similar shots. Scans your <b>Pictures</b> folder — no permission prompt needed. The managed Photos library is never touched.</p>
        <label class="dry incl"><input type="checkbox" class="cb" id="inclAll" ${photosIncludeAll ? 'checked' : ''}> Also scan Desktop, Downloads &amp; Documents <span class="pnote">(asks macOS for folder access)</span></label>
        <div style="margin-top:16px"><button class="btn primary" id="scanBtn" ${busy ? 'disabled' : ''}>${I.scan} Scan photos</button></div></div>
      </div></div>`;
    $('#inclAll').onchange = e => { photosIncludeAll = e.target.checked; };
    $('#scanBtn').onclick = () => doScan(cat);
    return;
  }

  const groups = r.groups || [];
  const items = groups.flatMap(g => g.items);
  const sel = items.filter(i => i.sel);

  const groupHTML = g => {
    const tiles = g.items.map(i => `
      <div class="ptile ${i.sel ? 'on' : ''}" data-id="${i.id}">
        <div class="pthumb" data-thumb="${i.id}">${I.photos}</div>
        <span class="pcheck">${i.sel ? I.check : ''}</span>
        ${i.tag === 'keep' ? '<span class="pkeep">Keep</span>' : ''}
        <div class="pmeta"><span class="pname">${esc(i.name)}</span><span class="psize num">${fmt(i.size)}</span></div>
      </div>`).join('');
    const kindNote = g.kind === 'screenshots' ? 'All selected — screenshots are safe to remove.'
      : g.kind === 'duplicate' ? 'Identical copies. One original is kept; extras selected.'
        : 'Looks alike. Nothing selected — pick the ones to remove.';
    return `<div class="pgroup"><div class="pgroup-head"><b>${esc(g.name)}</b><span class="pnote">${kindNote}</span>
      <button class="btn ghost tiny" data-gtoggle="${g.kind}:${esc(g.name)}">Toggle group</button></div>
      <div class="photo-grid">${tiles}</div></div>`;
  };

  main.innerHTML = `<div class="panel">${headHTML('Photo Manager', CATS.photos.sub, 'pro')}
    <div class="toolbar"><button class="btn ghost" id="rescanBtn" ${busy ? 'disabled' : ''}>${I.scan} Re-scan</button>
      <label class="dry"><input type="checkbox" class="cb" id="inclAll" ${photosIncludeAll ? 'checked' : ''}> Include Desktop/Downloads/Documents</label>
      <div class="selinfo"><b class="num">${sel.length}</b> of ${items.length} selected</div><div class="spacer"></div>
      <label class="dry"><input type="checkbox" class="cb" id="dryPanel" ${dryRun ? 'checked' : ''}> Dry run</label></div>
    ${groups.length ? groups.map(groupHTML).join('') : '<div class="card"><div class="empty"><div class="big">' + I.check + '</div><h3>No duplicates or screenshots found</h3><p>Your photo folders look tidy.</p></div></div>'}
    <div class="sticky-foot"><div class="tot">Selected: <b class="num">${fmt(sel.reduce((a, i) => a + i.size, 0))}</b></div><div class="spacer"></div>
      <button class="btn danger" id="cleanBtn" ${sel.length === 0 || busy ? 'disabled' : ''}>${I.check} ${dryRun ? 'Preview' : 'Move to Trash'} ${sel.length || ''}</button></div>
    <div class="hint">${I.info} Removal moves photos to the Trash (reversible). The managed Photos library is never scanned or touched.</div>
  </div>`;

  $('#rescanBtn').onclick = () => { state.photos = null; doScan(cat); };
  $('#inclAll').onchange = e => { photosIncludeAll = e.target.checked; state.photos = null; doScan(cat); };
  $('#dryPanel').onchange = e => { dryRun = e.target.checked; saveDry(dryRun); render(); };
  main.querySelectorAll('.ptile').forEach(t => t.onclick = e => {
    if (e.target.closest('[data-gtoggle]')) return;
    const it = items.find(i => i.id === t.dataset.id); if (it) { it.sel = !it.sel; render(); }
  });
  main.querySelectorAll('[data-gtoggle]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const g = groups.find(x => (x.kind + ':' + x.name) === b.dataset.gtoggle);
    if (!g) return;
    const anyOff = g.items.some(i => !i.sel);
    g.items.forEach(i => i.sel = anyOff);
    render();
  });
  $('#cleanBtn').onclick = () => doClean(cat, sel.map(i => i.id));
  loadThumbs();
}

async function loadThumbs() {
  const run = ++thumbRun;
  const nodes = [...document.querySelectorAll('[data-thumb]')];
  for (const node of nodes) {
    if (run !== thumbRun) return; // a newer render superseded us
    const id = node.dataset.thumb;
    let url = thumbCache.get(id);
    if (url === undefined) {
      try { url = await api.thumb(id); } catch { url = null; }
      thumbCache.set(id, url || 'none');
      url = url || 'none';
    }
    if (run !== thumbRun) return;
    if (url && url !== 'none') node.style.backgroundImage = `url("${url}")`, node.classList.add('loaded');
  }
}

/* ----------------------------- memory (read-only) ----------------------------- */
async function renderMemory() {
  const main = $('#main');
  main.innerHTML = `<div class="panel">${headHTML('Memory', 'Live memory pressure from vm_stat.', 'ro')}<div class="card" style="padding:28px;text-align:center;color:var(--muted)">${I.spin} Reading memory…</div></div>`;
  let m;
  try { m = await api.memory(); } catch { m = null; }
  if (!m) { main.innerHTML = `<div class="panel">${headHTML('Memory', 'Live memory pressure.', 'ro')}<div class="card" style="padding:24px">Memory data unavailable.</div></div>`; return; }
  const used = (m.wired || 0) + (m.active || 0) + (m.compressed || 0);
  const segs = [
    { k: 'App memory (active)', v: m.active || 0, c: 'var(--accent)' },
    { k: 'Wired (system)', v: m.wired || 0, c: '#8a93a3' },
    { k: 'Compressed', v: m.compressed || 0, c: 'var(--warn)' },
    { k: 'Cached files', v: m.cached || 0, c: 'var(--good)' },
    { k: 'Free', v: m.free || 0, c: 'var(--surface-3)' },
  ];
  const R = 70, C = 2 * Math.PI * R; let acc = 0;
  const ring = segs.map(s => { const f = m.total ? s.v / m.total : 0; const el = `<circle r="${R}" cx="82" cy="82" fill="none" stroke="${s.c}" stroke-width="18" stroke-dasharray="${(f * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-acc * C).toFixed(1)}"/>`; acc += f; return el; }).join('');
  const pressurePct = m.total ? Math.round(used / m.total * 100) : 0;
  const bars = segs.map(s => `<div class="mbar"><div class="lab"><span>${s.k}</span><span class="num">${fmt(s.v)}</span></div><div class="track"><i style="width:${m.total ? (s.v / m.total * 100).toFixed(1) : 0}%;background:${s.c}"></i></div></div>`).join('');

  main.innerHTML = `<div class="panel">${headHTML('Memory', 'Live memory pressure from vm_stat. Read-only in this version.', 'ro')}
    <div class="card" style="padding:20px"><div class="mem-wrap">
      <div style="display:grid;place-items:center"><div class="donut" style="width:164px;height:164px"><svg width="164" height="164" viewBox="0 0 164 164">${ring}</svg><div class="center"><b class="num">${pressurePct}%</b><span>in use</span></div></div></div>
      <div><div class="mbars">${bars}</div>
      <div style="margin-top:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn" id="refreshMem">${I.scan} Refresh</button><span style="color:var(--muted);font-size:12.5px">${fmt(m.total)} installed</span></div></div>
    </div></div>
    <div class="hint">${I.info} Purging inactive memory needs elevated privileges, so Breeze reports it rather than forcing it. Quit idle apps to recover RAM.</div></div>`;
  $('#refreshMem').onclick = () => renderMemory();
}

/* ----------------------------- startup (read-only) ----------------------------- */
async function renderStartup() {
  const main = $('#main');
  main.innerHTML = `<div class="panel">${headHTML('Startup Items', 'Apps and agents that launch at login.', 'ro')}<div class="card" style="padding:28px;text-align:center;color:var(--muted)">${I.spin} Reading login items…</div></div>`;
  let items;
  try { items = await api.loginItems(); } catch { items = []; }
  const rows = items.length ? items.map(s => `<li class="item">
    <span class="ficon" style="background:var(--surface-3)">${esc(s.name.slice(0, 2).toUpperCase())}</span>
    <div class="meta"><div class="name">${esc(s.name)}</div><div class="path">${esc(s.kind)}</div></div>
    <span class="tag safe">Enabled</span></li>`).join('')
    : '<li class="item"><div class="meta"><div class="name">No user login items or launch agents found.</div></div></li>';

  main.innerHTML = `<div class="panel">${headHTML('Startup Items', 'Apps and agents that launch at login. Read-only in this version.', 'ro')}
    <div class="callout">${I.info}<div>Breeze lists real login items and user launch agents. Toggling them off automatically can destabilize a system, so v1 shows them for review. Disable in System Settings → General → Login Items.</div></div>
    <div class="card result-card"><ul class="items">${rows}</ul></div></div>`;
}

/* ----------------------------- theme ----------------------------- */
function applyThemeButton() {
  const explicit = document.documentElement.getAttribute('data-theme');
  const dark = explicit ? explicit === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('#themeBtn').innerHTML = dark ? I.sun : I.moon;
}
function initTheme() {
  let saved = null; try { saved = localStorage.getItem('breeze-theme'); } catch {}
  if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  applyThemeButton();
  $('#themeBtn').onclick = () => {
    const explicit = document.documentElement.getAttribute('data-theme');
    const dark = explicit ? explicit === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('breeze-theme', next); } catch {}
    applyThemeButton();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyThemeButton);
}

/* ----------------------------- boot ----------------------------- */
initTheme();
render();
refreshDisk().then(render);
