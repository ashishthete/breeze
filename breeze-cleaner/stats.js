'use strict';
// Live system stats for the menu-bar widget. Everything here reads only
// aggregate OS counters (no file contents, no user data) using system binaries
// available in a minimal PATH (netstat, pmset) plus pure-Node CPU/memory. It
// NEVER trashes or modifies anything — it is strictly read-only telemetry.
const os = require('os');
const { execFile } = require('child_process');

// ---- CPU: delta of os.cpus() tick counters between calls ----
let prevCpu = null;
function cpuPercent() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const c of cpus) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  let pct = 0;
  if (prevCpu) {
    const dIdle = idle - prevCpu.idle;
    const dTotal = total - prevCpu.total;
    pct = dTotal > 0 ? Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)) : 0;
  }
  prevCpu = { idle, total };
  return pct;
}

// ---- Memory: used = active + wired + compressed (what macOS shows), via vm_stat ----
function memory() {
  const total = os.totalmem();
  return new Promise(resolve => {
    execFile('vm_stat', [], { timeout: 4000 }, (err, out) => {
      if (err) return resolve({ used: total - os.freemem(), total });
      const m = {};
      String(out).split('\n').forEach(l => {
        const mm = l.match(/"?([\w\s-]+)"?:\s+(\d+)\./);
        if (mm) m[mm[1].trim()] = parseInt(mm[2], 10);
      });
      const page = 16384; // Apple Silicon page size
      const b = n => (m[n] || 0) * page;
      const used = b('Pages active') + b('Pages wired down') + b('Pages occupied by compressor');
      resolve({ used: used || (total - os.freemem()), total });
    });
  });
}

// ---- Network: delta of per-interface byte counters from `netstat -ibn` ----
let prevNet = null;
function networkThroughput() {
  return new Promise(resolve => {
    execFile('netstat', ['-ibn'], { timeout: 4000, maxBuffer: 1 << 20 }, (err, out) => {
      if (err) return resolve({ up: 0, down: 0 });
      let rx = 0, tx = 0;
      const seen = new Set();
      for (const line of String(out).split('\n')) {
        const f = line.trim().split(/\s+/);
        // Columns: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
        // The per-interface aggregate is the "<Link#N>" row (its Network column is
        // "<Link#N>"). The Address/MAC column is present for some interfaces and
        // absent for others (lo0, utun…), which shifts the byte columns, so we read
        // the trailing counters from the end of the row instead of fixed offsets:
        //   Coll=f[len-1] Obytes=f[len-2] Oerrs=f[len-3] Opkts=f[len-4] Ibytes=f[len-5]
        const linkIdx = f.findIndex(x => /^<Link#\d+>$/.test(x));
        if (linkIdx < 0 || f.length < 7) continue;
        const iface = f[0];
        if (iface === 'lo0' || seen.has(iface)) continue;
        const ib = Number(f[f.length - 5]), ob = Number(f[f.length - 2]);
        if (!Number.isFinite(ib) || !Number.isFinite(ob)) continue;
        seen.add(iface);
        rx += ib;
        tx += ob;
      }
      const now = Date.now();
      let up = 0, down = 0;
      if (prevNet) {
        const dt = (now - prevNet.t) / 1000;
        if (dt > 0) {
          down = Math.max(0, (rx - prevNet.rx) / dt);
          up = Math.max(0, (tx - prevNet.tx) / dt);
        }
      }
      prevNet = { rx, tx, t: now };
      resolve({ up, down });
    });
  });
}

// ---- Trash size: `du -sk ~/.Trash` (reports KiB). READ-ONLY: we only measure
// the size, we never empty or modify the Trash. Missing/empty/no-permission → 0.
function trashSize() {
  const dir = os.homedir() + '/.Trash';
  return new Promise(resolve => {
    execFile('du', ['-sk', dir], { timeout: 4000, maxBuffer: 1 << 20 }, (err, out) => {
      const m = String(out || '').trim().match(/^(\d+)/);
      const kib = m ? parseInt(m[1], 10) : 0;
      resolve({ size: Number.isFinite(kib) ? kib * 1024 : 0 });
    });
  });
}

// ---- Battery: parse `pmset -g batt` ----
function battery() {
  return new Promise(resolve => {
    execFile('pmset', ['-g', 'batt'], { timeout: 4000 }, (err, out) => {
      if (err) return resolve(null);
      const s = String(out);
      const pm = s.match(/(\d+)%/);
      if (!pm) return resolve(null);
      const percent = Number(pm[1]);
      let state = 'discharging';
      if (/\bcharged\b/i.test(s) || /\bAC Power\b/.test(s) && percent >= 100) state = 'charged';
      else if (/\bcharging\b/i.test(s)) state = 'charging';
      else if (/\bAC Power\b/.test(s)) state = 'charged';
      const tm = s.match(/(\d+:\d{2})\s+remaining/);
      resolve({ percent, state, time: tm ? tm[1] : null });
    });
  });
}

// One combined snapshot. CPU/network percentages are meaningful only from the
// second call onward (they need a prior sample), which the UI polls for.
async function liveStats() {
  const [net, batt, mem, trash] = await Promise.all([networkThroughput(), battery(), memory(), trashSize()]);
  return { cpu: cpuPercent(), memory: mem, net, battery: batt, trash, at: Date.now() };
}

module.exports = { liveStats };
