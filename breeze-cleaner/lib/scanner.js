'use strict';
// Real scanning logic. Every size and path returned here comes from the live
// filesystem. The main process keeps the authoritative id -> path map so the
// renderer can only ever ask to clean something that was actually scanned.
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { execFile } = require('child_process');
const { HOME } = require('./safety');

const h = (...p) => path.join(HOME, ...p);
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };

// --- authoritative registry: id -> absolute path (per session) ---
const registry = new Map();
function register(p) {
  const id = crypto.randomUUID();
  registry.set(id, path.resolve(p));
  return id;
}
function resolveId(id) { return registry.get(id); }

// --- size helpers ---
function du(target, timeoutMs = 20000) {
  // `du -sk` is fast and accurate for directory trees on macOS.
  return new Promise(resolve => {
    execFile('du', ['-sk', target], { timeout: timeoutMs, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err || !stdout) return resolve(0);
      const kb = parseInt(String(stdout).split(/\s+/)[0], 10);
      resolve(Number.isFinite(kb) ? kb * 1024 : 0);
    });
  });
}

async function mapPool(items, worker, concurrency = 6) {
  const out = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx], idx); } catch { out[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, run));
  return out.filter(Boolean);
}

function item(name, fullPath, size, tag) {
  return { id: register(fullPath), name, path: prettyPath(fullPath), size, tag };
}
function prettyPath(p) {
  return p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p;
}

// List immediate children of a directory as cleanable items (each sized).
async function childrenAsItems(dir, tag = 'safe', minBytes = 1) {
  if (!exists(dir)) return [];
  let names;
  try { names = await fsp.readdir(dir); } catch { return []; }
  names = names.filter(n => !n.startsWith('.') || n === '.Trash');
  const sized = await mapPool(names, async name => {
    const full = path.join(dir, name);
    let st;
    try { st = await fsp.lstat(full); } catch { return null; }
    if (st.isSymbolicLink()) return null;
    const size = st.isDirectory() ? await du(full) : st.size;
    if (size < minBytes) return null;
    return item(name, full, size, tag);
  });
  return sized.sort((a, b) => b.size - a.size);
}

// --- category definitions ---
const CACHE_ROOTS = [
  h('Library', 'Caches'),
];
const LOG_ROOTS = [
  h('Library', 'Logs'),
];
const DEV_ROOTS = [
  h('Library', 'Developer', 'Xcode', 'DerivedData'),
  h('Library', 'Developer', 'Xcode', 'iOS DeviceSupport'),
  h('Library', 'Developer', 'CoreSimulator', 'Caches'),
  h('.npm', '_cacache'),
  h('Library', 'pnpm', 'store'),
];
const LARGE_DIRS = [h('Downloads'), h('Desktop'), h('Movies')];
const DUP_DIRS = [h('Downloads'), h('Desktop')];
const PRIVACY_TARGETS = [
  { name: 'Safari cache', dir: h('Library', 'Caches', 'com.apple.Safari') },
  { name: 'Chrome cache', dir: h('Library', 'Caches', 'Google', 'Chrome') },
  { name: 'Chrome code cache', dir: h('Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Code Cache') },
  { name: 'Firefox cache', dir: h('Library', 'Caches', 'Firefox') },
  { name: 'Edge cache', dir: h('Library', 'Caches', 'Microsoft Edge') },
];

async function scanJunk() {
  const groups = [];
  for (const root of CACHE_ROOTS) {
    const items = await childrenAsItems(root, 'safe', 1 << 20); // >= 1MB
    if (items.length) groups.push({ name: 'Application caches', items: items.slice(0, 60) });
  }
  for (const root of LOG_ROOTS) {
    const items = await childrenAsItems(root, 'safe', 1 << 18);
    if (items.length) groups.push({ name: 'Logs', items: items.slice(0, 40) });
  }
  const devItems = [];
  for (const root of DEV_ROOTS) {
    if (!exists(root)) continue;
    const size = await du(root);
    if (size > 0) devItems.push(item(path.basename(path.dirname(root)) + ' › ' + path.basename(root), root, size, 'safe'));
  }
  if (devItems.length) groups.push({ name: 'Developer junk', items: devItems.sort((a, b) => b.size - a.size) });
  return { groups };
}

async function scanLarge(minBytes = 200 * (1 << 20)) {
  const found = [];
  for (const dir of LARGE_DIRS) {
    if (!exists(dir)) continue;
    const files = await walkFiles(dir, 3, 4000);
    for (const f of files) {
      if (f.size >= minBytes) found.push(item(path.basename(f.path), f.path, f.size, 'keep'));
    }
  }
  found.sort((a, b) => b.size - a.size);
  return { items: found.slice(0, 80) };
}

async function scanPrivacy() {
  const groups = [];
  for (const t of PRIVACY_TARGETS) {
    if (!exists(t.dir)) continue;
    const size = await du(t.dir);
    if (size > 0) groups.push({ name: t.name, items: [item(path.basename(t.dir), t.dir, size, 'safe')] });
  }
  return { groups };
}

// --- duplicate finder: real content hashing ---
async function walkFiles(dir, maxDepth, cap) {
  const out = [];
  async function rec(d, depth) {
    if (depth > maxDepth || out.length >= cap) return;
    let entries;
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= cap) return;
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      let st;
      try { st = await fsp.lstat(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) await rec(full, depth + 1);
      else if (st.isFile()) out.push({ path: full, size: st.size });
    }
  }
  await rec(dir, 0);
  return out;
}

function hashFile(p, bytes = 4 << 20) {
  return new Promise(resolve => {
    const hash = crypto.createHash('sha1');
    const s = fs.createReadStream(p, { start: 0, end: bytes - 1 });
    s.on('data', d => hash.update(d));
    s.on('end', () => resolve(hash.digest('hex')));
    s.on('error', () => resolve(null));
  });
}

async function scanDuplicates(minBytes = 1 << 20) {
  let files = [];
  for (const dir of DUP_DIRS) {
    if (exists(dir)) files = files.concat(await walkFiles(dir, 4, 6000));
  }
  files = files.filter(f => f.size >= minBytes);
  // group by size first (cheap), only hash within size collisions
  const bySize = new Map();
  for (const f of files) { (bySize.get(f.size) || bySize.set(f.size, []).get(f.size)).push(f); }
  const candidates = [...bySize.values()].filter(g => g.length > 1).flat();
  const byHash = new Map();
  await mapPool(candidates, async f => {
    const hsh = await hashFile(f.path);
    if (!hsh) return;
    const key = f.size + ':' + hsh;
    (byHash.get(key) || byHash.set(key, []).get(key)).push(f);
  }, 4);
  const groups = [];
  for (const dupes of byHash.values()) {
    if (dupes.length < 2) continue;
    dupes.sort((a, b) => a.path.localeCompare(b.path));
    const items = dupes.map((f, idx) =>
      item(path.basename(f.path), f.path, f.size, idx === 0 ? 'keep' : 'safe'));
    // keep the first copy unselected by default
    groups.push({ name: `${path.basename(dupes[0].path)} — ${dupes.length} copies`, items, _firstKeep: true });
  }
  groups.sort((a, b) => b.items[0].size - a.items[0].size);
  return { groups: groups.slice(0, 40) };
}


// --- photo manager (real: screenshots + perceptual similar/duplicate grouping) ---
// ~/Pictures is the one common photo location macOS does NOT gate behind a
// permission prompt, so it is the default. Desktop, Downloads and Documents
// each trigger their own TCC prompt, so they are opt-in (includeAll).
const PHOTO_SCAN_DIRS_BASE = [h('Pictures')];
const PHOTO_SCAN_DIRS_EXTRA = [h('Desktop'), h('Downloads'), h('Documents')];
const IMAGE_RE = /\.(jpe?g|png|heic|heif|gif|tiff?|bmp|webp)$/i;
const { tmpdir } = os;

// Resolve ImageMagick once. A double-clicked .app gets a minimal PATH that omits
// Homebrew, so check the usual install locations too. null => perceptual
// similar-photo matching is unavailable; duplicates and screenshots still work.
let MAGICK; // undefined = not probed, null = absent, string = path
function magickPath() {
  if (MAGICK !== undefined) return MAGICK;
  const cands = [];
  for (const dir of (process.env.PATH || '').split(':')) { if (dir) cands.push(path.join(dir, 'magick')); }
  cands.push('/opt/homebrew/bin/magick', '/usr/local/bin/magick', '/opt/local/bin/magick');
  MAGICK = cands.find(exists) || null;
  return MAGICK;
}

// Perceptual difference-hash. ImageMagick resizes to 9x8 grayscale; each of the
// 8 rows yields 8 bits by comparing adjacent pixels. Returns a 8-byte Buffer or null.
function dhash(file) {
  const mg = magickPath();
  if (!mg) return Promise.resolve(null);
  return new Promise(resolve => {
    execFile(mg, [file + '[0]', '-auto-orient', '-resize', '9x8!', '-colorspace', 'Gray', '-depth', '8', 'GRAY:-'],
      { timeout: 15000, maxBuffer: 1 << 16, encoding: 'buffer' }, (err, stdout) => {
        if (err || !stdout || stdout.length < 72) return resolve(null);
        const bits = Buffer.alloc(8);
        let bit = 0;
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const left = stdout[row * 9 + col];
            const right = stdout[row * 9 + col + 1];
            if (left > right) bits[bit >> 3] |= (1 << (bit & 7));
            bit++;
          }
        }
        resolve(bits);
      });
  });
}
function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < 8; i++) {
    let x = a[i] ^ b[i];
    while (x) { d++; x &= x - 1; }
  }
  return d;
}

function screenshotPaths(root) {
  return new Promise(resolve => {
    execFile('mdfind', ['-onlyin', root, 'kMDItemIsScreenCapture == 1'],
      { timeout: 15000, maxBuffer: 1 << 22 }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        resolve(String(stdout).split('\n').map(s => s.trim()).filter(Boolean));
      });
  });
}

// opts.includeAll = true also scans Desktop, Downloads and Documents (each of
// which asks macOS for folder access). The default stays in ~/Pictures, which
// needs no permission prompt.
async function scanPhotos(opts = {}) {
  const includeAll = !!opts.includeAll;
  const scanDirs = includeAll ? [...PHOTO_SCAN_DIRS_BASE, ...PHOTO_SCAN_DIRS_EXTRA] : PHOTO_SCAN_DIRS_BASE;
  const groups = [];

  // 1) Screenshots (Spotlight-tagged capture files). Restricted to the folders
  // we already have access to, so this adds no extra prompt.
  let shots = includeAll ? await screenshotPaths(HOME) : await screenshotPaths(h('Pictures'));
  const shotItems = [];
  const seen = new Set();
  for (const p of shots) {
    if (seen.has(p) || !IMAGE_RE.test(p)) continue;
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    seen.add(p);
    shotItems.push(item(path.basename(p), p, st.size, 'safe'));
    if (shotItems.length >= 300) break;
  }
  if (shotItems.length) {
    shotItems.sort((a, b) => b.size - a.size);
    groups.push({ name: `Screenshots — ${shotItems.length}`, items: shotItems, kind: 'screenshots' });
  }

  // Gather candidate image files.
  let files = [];
  for (const dir of scanDirs) {
    if (exists(dir)) files = files.concat(await walkFiles(dir, 4, 4000));
  }
  files = files.filter(f => IMAGE_RE.test(f.path) && !seen.has(f.path) && f.size >= 40 * 1024);
  files.sort((a, b) => b.size - a.size);
  files = files.slice(0, 800); // perf cap

  // 2) Exact duplicate photos — byte-identical, proven by content hash. These
  // are 100% safe to collapse, so extras are pre-selected.
  const bySize = new Map();
  for (const f of files) { (bySize.get(f.size) || bySize.set(f.size, []).get(f.size)).push(f); }
  const dupCandidates = [...bySize.values()].filter(g => g.length > 1).flat();
  const byHash = new Map();
  await mapPool(dupCandidates, async f => {
    const hsh = await hashFile(f.path);
    if (!hsh) return;
    const key = f.size + ':' + hsh;
    (byHash.get(key) || byHash.set(key, []).get(key)).push(f);
  }, 4);
  const exactDupPaths = new Set();
  const dupGroups = [];
  for (const dupes of byHash.values()) {
    if (dupes.length < 2) continue;
    dupes.sort((a, b) => a.path.localeCompare(b.path));
    dupes.forEach(d => exactDupPaths.add(d.path));
    const items = dupes.map((f, idx) => item(path.basename(f.path), f.path, f.size, idx === 0 ? 'keep' : 'safe'));
    dupGroups.push({ name: `Duplicate — ${dupes.length} copies`, items, kind: 'duplicate', _size: dupes[0].size * (dupes.length - 1) });
  }
  dupGroups.sort((a, b) => b._size - a._size);
  for (const g of dupGroups.slice(0, 40)) groups.push(g);

  // 3) Similar photos — perceptual match. A best-effort suggestion, so nothing
  // here is pre-selected: every item is tagged "keep" and the user chooses.
  const perceptual = files.filter(f => !exactDupPaths.has(f.path));
  const popcount = buf => { let d = 0; for (let i = 0; i < 8; i++) { let x = buf[i]; while (x) { d++; x &= x - 1; } } return d; };
  const hashed = (await mapPool(perceptual, async f => {
    const hsh = await dhash(f.path);
    if (!hsh) return null;
    const bits = popcount(hsh);
    if (bits < 16 || bits > 48) return null; // skip low-detail images that match everything
    return { ...f, hsh };
  }, 6)).filter(Boolean);

  // Cluster with a tight threshold AND verify every member is close to every
  // other member (no chaining), so only genuine near-duplicate frames group.
  const THRESHOLD = 3;
  const clusters = [];
  for (const f of hashed) {
    let placed = false;
    for (const c of clusters) {
      if (c.members.length < 40 && c.members.every(m => hamming(f.hsh, m.hsh) <= THRESHOLD)) {
        c.members.push(f); placed = true; break;
      }
    }
    if (!placed) clusters.push({ members: [f] });
  }
  const simGroups = clusters.filter(c => c.members.length > 1).map(c => {
    c.members.sort((a, b) => b.size - a.size);
    const items = c.members.map(f => item(path.basename(f.path), f.path, f.size, 'keep'));
    return { name: `Similar — ${c.members.length} photos`, items, kind: 'similar', _size: c.members.reduce((a, m) => a + m.size, 0) };
  });
  simGroups.sort((a, b) => b._size - a._size);
  for (const g of simGroups.slice(0, 50)) groups.push(g);

  return { groups, includeAll };
}

// --- app uninstaller (real) ---
async function scanApps() {
  const appsDir = '/Applications';
  let names;
  try { names = await fsp.readdir(appsDir); } catch { return { items: [] }; }
  names = names.filter(n => n.endsWith('.app'));
  const items = await mapPool(names, async name => {
    const full = path.join(appsDir, name);
    const bundleId = await readBundleId(full);
    const appSize = await du(full, 30000);
    const lastUsed = await appLastUsed(full);
    const leftovers = bundleId ? await leftoverPaths(bundleId, name) : [];
    let leftoverSize = 0;
    for (const lp of leftovers) leftoverSize += await du(lp);
    const daysIdle = lastUsed == null ? null : Math.floor((Date.now() - lastUsed) / 86400000);
    return {
      id: register(full),
      name: name.replace(/\.app$/, ''),
      path: full,
      bundleId: bundleId || '',
      size: appSize,
      leftoverSize,
      lastUsed,              // epoch ms, or null if never/unknown
      daysIdle,             // whole days since last use, or null
      leftovers: leftovers.map(p => ({ id: register(p), path: prettyPath(p) })),
    };
  }, 4);
  // Surface unused apps first: never-used, then longest-idle, then by size.
  const rank = a => (a.daysIdle == null ? 1e9 : a.daysIdle);
  items.sort((a, b) => rank(b) - rank(a) || (b.size + b.leftoverSize) - (a.size + a.leftoverSize));
  return { items };
}

function readBundleId(appPath) {
  return new Promise(resolve => {
    execFile('defaults', ['read', path.join(appPath, 'Contents', 'Info'), 'CFBundleIdentifier'],
      { timeout: 5000 }, (err, out) => resolve(err ? null : String(out).trim()));
  });
}

// When macOS Spotlight last recorded this app being opened. Returns epoch ms, or
// null if never used / not indexed. `mdls` is a system binary (available even in
// a minimal PATH), so this works in a packaged, double-clicked app.
function appLastUsed(appPath) {
  return new Promise(resolve => {
    execFile('mdls', ['-name', 'kMDItemLastUsedDate', '-raw', appPath],
      { timeout: 5000 }, (err, out) => {
        if (err) return resolve(null);
        const s = String(out).trim();
        if (!s || s === '(null)') return resolve(null);
        const t = Date.parse(s);
        resolve(Number.isFinite(t) ? t : null);
      });
  });
}

async function leftoverPaths(bundleId, appName) {
  const base = appName.replace(/\.app$/, '');
  const candidates = [
    h('Library', 'Application Support', bundleId),
    h('Library', 'Application Support', base),
    h('Library', 'Caches', bundleId),
    h('Library', 'Preferences', bundleId + '.plist'),
    h('Library', 'Logs', base),
    h('Library', 'Saved Application State', bundleId + '.savedState'),
    h('Library', 'Containers', bundleId),
    h('Library', 'HTTPStorages', bundleId),
  ];
  return candidates.filter(exists);
}

// --- system info (read-only) ---
function diskUsage() {
  return new Promise(resolve => {
    execFile('df', ['-k', '/System/Volumes/Data'], { timeout: 5000 }, (err, out) => {
      if (err) return execFile('df', ['-k', '/'], { timeout: 5000 }, (e2, o2) => resolve(parseDf(o2)));
      resolve(parseDf(out));
    });
  });
}
function parseDf(out) {
  try {
    const line = String(out).trim().split('\n').pop().split(/\s+/);
    const total = parseInt(line[1], 10) * 1024;
    const used = parseInt(line[2], 10) * 1024;
    const avail = parseInt(line[3], 10) * 1024;
    return { total, used, avail };
  } catch { return { total: 0, used: 0, avail: 0 }; }
}

function memoryInfo() {
  return new Promise(resolve => {
    const total = os.totalmem();
    execFile('vm_stat', [], { timeout: 5000 }, (err, out) => {
      if (err) return resolve({ total, free: os.freemem(), details: [] });
      const m = {};
      String(out).split('\n').forEach(l => {
        const mm = l.match(/"?([\w\s]+)"?:\s+(\d+)\./);
        if (mm) m[mm[1].trim()] = parseInt(mm[2], 10);
      });
      const page = 16384; // Apple Silicon page size
      const b = n => (m[n] || 0) * page;
      resolve({
        total,
        wired: b('Pages wired down'),
        active: b('Pages active'),
        compressed: b('Pages occupied by compressor'),
        inactive: b('Pages inactive'),
        cached: b('File-backed pages'),
        free: b('Pages free') + b('Pages speculative'),
      });
    });
  });
}

function loginItems() {
  return new Promise(resolve => {
    const out = [];
    // user LaunchAgents
    const laDir = h('Library', 'LaunchAgents');
    if (exists(laDir)) {
      try {
        fs.readdirSync(laDir).filter(n => n.endsWith('.plist')).forEach(n =>
          out.push({ name: n.replace(/\.plist$/, ''), kind: 'Launch Agent' }));
      } catch {}
    }
    execFile('osascript', ['-e', 'tell application "System Events" to get the name of every login item'],
      { timeout: 6000 }, (err, stdout) => {
        if (!err && stdout) {
          String(stdout).trim().split(', ').filter(Boolean).forEach(name =>
            out.push({ name: name.trim(), kind: 'Login Item' }));
        }
        resolve(out);
      });
  });
}

module.exports = {
  resolveId,
  scanJunk, scanLarge, scanPrivacy, scanDuplicates, scanApps, scanPhotos,
  diskUsage, memoryInfo, loginItems,
};
