'use strict';
// Menu-bar popover: live, read-only system monitor plus a one-tap junk clean.
// All data comes from window.breeze (main process); this view never touches fs.
const api = window.breeze;
const $ = s => document.querySelector(s);
const cpuHist = [];
let junk = null;          // { ids:[], size } once scanned
let scanning = false, cleaning = false;

function gb(b) { return (b / 1e9).toFixed(b >= 1e10 ? 0 : 1); }
function hbytes(b) {
  b = b || 0;
  if (b >= 1e9) return { v: (b / 1e9).toFixed(b >= 1e10 ? 0 : 1), u: 'GB' };
  if (b >= 1e6) return { v: (b / 1e6).toFixed(b >= 1e8 ? 0 : 1), u: 'MB' };
  return { v: (b / 1e3).toFixed(0), u: 'KB' };
}
function kbs(b) {
  if (b >= 1024 * 1024) return (b / 1048576).toFixed(1) + ' MB/s';
  return (b / 1024).toFixed(b >= 102400 ? 0 : 1) + ' KB/s';
}

function render(s) {
  const mem = s.memory, memPct = mem.total ? Math.round(mem.used / mem.total * 100) : 0;
  const cpu = Math.round(s.cpu);
  cpuHist.push(cpu); if (cpuHist.length > 16) cpuHist.shift();
  const bars = cpuHist.map(v => `<i style="height:${Math.max(6, v)}%"></i>`).join('');
  const trashSz = hbytes(s.trash ? s.trash.size : 0);
  const b = s.battery;
  const battColor = b && b.percent <= 20 && b.state === 'discharging' ? 'var(--danger)' : 'var(--good)';
  const battFoot = !b ? 'No battery' : b.state === 'charging' ? (b.time ? b.time + ' to full' : 'Charging')
    : b.state === 'charged' ? 'Charged' : (b.time ? b.time + ' left' : 'On battery');

  const junkCard = scanning
    ? `<div class="card junk"><div><div class="lbl">Junk Files</div><div class="val"><span class="spin">◠</span></div></div>
         <div class="foot" style="margin-left:auto">Scanning caches…</div></div>`
    : junk
      ? `<div class="card junk"><div><div class="lbl">Junk Files</div><div class="val">${gb(junk.size)}<small> GB</small></div></div>
         <button class="btn clean" id="cleanJunk" ${cleaning || !junk.size ? 'disabled' : ''}>${cleaning ? 'Cleaning…' : 'Clean'}</button></div>`
      : `<div class="card junk"><div><div class="lbl">Junk Files</div><div class="val" style="color:var(--muted);font-size:15px">Not scanned</div></div>
         <button class="btn scan" id="scanJunk">Scan</button></div>`;

  $('#grid').innerHTML = `
    <div class="card">
      <div class="lbl">Memory</div>
      <div class="ringwrap"><div class="ring" style="--p:${memPct};--rc:${memPct>85?'var(--danger)':memPct>65?'var(--warn)':'var(--accent)'}"></div>
        <div><div class="big">${gb(mem.used)}<small style="font-size:12px;color:var(--muted)"> GB</small></div><div class="foot">${memPct}% of ${gb(mem.total)} GB</div></div></div>
    </div>
    <div class="card">
      <div class="lbl">CPU <span style="color:var(--fg)">${cpu}%</span></div>
      <div class="spark">${bars}</div>
    </div>
    <div class="card" style="grid-column:1/-1">
      <div class="lbl">Network</div>
      <div class="net">
        <div><span>↑ Upload</span><br><span class="up">${kbs(s.net.up)}</span></div>
        <div><span>↓ Download</span><br><span class="down">${kbs(s.net.down)}</span></div>
      </div>
    </div>
    <div class="card trash" style="grid-column:1/-1;display:flex;align-items:center;gap:12px">
      <div><div class="lbl">Trash</div><div class="val">${trashSz.v}<small> ${trashSz.u}</small></div></div>
      <div class="foot" style="margin-left:auto">${trashSz.v === '0' && trashSz.u === 'KB' ? 'Empty' : 'In ~/.Trash'}</div>
    </div>
    ${junkCard}
    <div class="card batt">
      <span>Battery</span><div class="bar"><i style="width:${b?b.percent:0}%;background:${battColor}"></i></div>
      <b>${b?b.percent+'%':'—'}</b><span>${battFoot}</span>
    </div>`;

  const sj = $('#scanJunk'); if (sj) sj.onclick = scanJunk;
  const cj = $('#cleanJunk'); if (cj) cj.onclick = cleanJunk;
}

async function scanJunk() {
  if (scanning) return;
  scanning = true; refresh();
  try {
    const r = await api.scan('junk');
    const ids = r.items.filter(x => x.tag !== 'keep').map(x => x.id);
    const size = r.items.filter(x => x.tag !== 'keep').reduce((a, x) => a + (x.size || 0), 0);
    junk = { ids, size };
  } catch { junk = { ids: [], size: 0 }; }
  scanning = false; refresh();
}

async function cleanJunk() {
  if (cleaning || !junk || !junk.ids.length) return;
  cleaning = true; refresh();
  try {
    const res = await api.clean(junk.ids, { dryRun: false });
    if (res.trashed && res.trashed.length) playTrashSound();
    junk = { ids: [], size: 0 };
    cleaning = false; refresh();
  } catch { cleaning = false; refresh(); }
}

let _ac = null;
function playTrashSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    _ac = _ac || new AC(); const ctx = _ac; if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime, dur = 0.26;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(ctx.destination); src.start(t); src.stop(t + dur);
  } catch {}
}

let last = null;
function refresh() { if (last) render(last); }

async function tick() {
  try { last = await api.stats(); render(last); } catch {}
}

$('#openMain').onclick = () => api.openMain();
tick();
setInterval(tick, 1600);
