'use strict';
// Decide which staging databases are cleanup CANDIDATES. This never deletes
// anything — it produces a report the dashboard shows and a human approves.
//
// pg_stat_database transaction counters are monotonic, so a database is idle
// when its activity count as of `idleDays` ago equals the current count, with
// no stats reset in between. A candidate must also match staging naming (done
// on the agent), have no live backends, and clear the size floor.
const DAY = 86400000;

function score(host, policy = {}) {
  const idleDays = Number(policy.idleDays) >= 0 ? Number(policy.idleDays) : 7;
  const minSize = (Number(policy.minSizeMB) || 0) * 1024 * 1024;
  const dbs = (host.latest && host.latest.databases) || [];
  const hist = host.dbHistory || {}; // name -> [{at, activity, reset}]
  const now = Date.now();
  const cutoff = now - idleDays * DAY;

  return dbs.map(db => {
    const activity = db.xactCommit + db.xactRollback;
    const series = hist[db.name] || [];
    const older = series.filter(p => p.at <= cutoff);
    const base = older.length ? older[older.length - 1] : null;
    const ageDays = series.length ? Math.round((now - series[0].at) / DAY) : 0;

    const out = { ...db, activity, state: 'keep', idle: false, idleDays: 0, reasons: [] };
    if (!db.isStaging) { out.reasons.push('not a staging database'); return out; }
    if (db.sizeBytes < minSize) { out.reasons.push('below size threshold'); return out; }
    if (db.numBackends > 0) { out.state = 'active'; out.reasons.push(`${db.numBackends} active connection(s)`); return out; }
    if (!base) { out.state = 'watching'; out.reasons.push(`need ${idleDays}d of history (have ${ageDays}d)`); return out; }
    if (base.reset !== db.statsReset) { out.state = 'watching'; out.reasons.push('stats were reset'); return out; }
    if (base.activity === activity) {
      out.state = 'candidate'; out.idle = true; out.idleDays = Math.round((now - base.at) / DAY);
      out.reasons.push(`no transactions in ${out.idleDays}d`);
    } else {
      out.state = 'watching';
      out.reasons.push(`${activity - base.activity} transactions in last ${idleDays}d`);
    }
    return out;
  });
}

// Compact history: record a point only when activity or the reset marker
// changes, or once an hour, so a week of samples stays small.
function appendHistory(series, db, now, cap = 2000) {
  series = series || [];
  const activity = db.xactCommit + db.xactRollback;
  const last = series[series.length - 1];
  if (!last || last.activity !== activity || last.reset !== db.statsReset || now - last.at > 3600000)
    series.push({ at: now, activity, reset: db.statsReset, size: db.sizeBytes });
  if (series.length > cap) series.splice(0, series.length - cap);
  return series;
}

module.exports = { score, appendHistory };
