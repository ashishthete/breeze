'use strict';
// PostgreSQL access for the agent, via the standard `psql` client (no npm
// drivers). Read paths list databases and their activity; the two write paths
// (DROP / VACUUM) accept ONLY an already-validated, already-quoted identifier
// from lib/dbsafety — never a raw name — and re-check its shape here as well.
const { execFile } = require('child_process');

const QUOTED_IDENT = /^"[A-Za-z0-9_][A-Za-z0-9_$]{0,62}"$/;
const UNIT = '\x1f'; // field separator unlikely to appear in identifiers

function envFor(conn = {}) {
  const e = Object.assign({}, process.env);
  if (conn.host) e.PGHOST = String(conn.host);
  if (conn.port) e.PGPORT = String(conn.port);
  if (conn.user) e.PGUSER = String(conn.user);
  if (conn.password != null) e.PGPASSWORD = String(conn.password);
  if (conn.passfile) e.PGPASSFILE = String(conn.passfile);
  e.PGDATABASE = String(conn.adminDb || conn.database || 'postgres');
  e.PGCONNECT_TIMEOUT = String(conn.connectTimeout || 8);
  if (conn.sslmode) e.PGSSLMODE = String(conn.sslmode);
  e.PGCLIENTENCODING = 'UTF8';
  return e;
}

function psql(conn, sql, { timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-X', '-q', '-A', '-t', '-F', UNIT, '-v', 'ON_ERROR_STOP=1', '-c', sql];
    execFile('psql', args, { env: envFor(conn), timeout, maxBuffer: 16 << 20 }, (err, out, serr) => {
      if (err) return reject(new Error(`psql: ${(serr || err.message || '').trim()}`));
      resolve(String(out));
    });
  });
}

const INVENTORY_SQL = `
SELECT d.datname,
       pg_database_size(d.datname),
       coalesce((SELECT count(*) FROM pg_stat_activity a WHERE a.datname = d.datname), 0),
       coalesce(s.xact_commit,0), coalesce(s.xact_rollback,0),
       coalesce(s.tup_inserted,0), coalesce(s.tup_updated,0), coalesce(s.tup_deleted,0),
       coalesce(extract(epoch from s.stats_reset)::bigint, 0)
FROM pg_database d
LEFT JOIN pg_stat_database s ON s.datname = d.datname
WHERE d.datistemplate = false
ORDER BY pg_database_size(d.datname) DESC;`;

async function listDatabases(conn) {
  const out = await psql(conn, INVENTORY_SQL);
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const f = line.split(UNIT);
    return {
      name: f[0],
      sizeBytes: Number(f[1]) || 0,
      numBackends: Number(f[2]) || 0,
      xactCommit: Number(f[3]) || 0,
      xactRollback: Number(f[4]) || 0,
      tupInserted: Number(f[5]) || 0,
      tupUpdated: Number(f[6]) || 0,
      tupDeleted: Number(f[7]) || 0,
      statsReset: Number(f[8]) || 0,
    };
  });
}

async function serverInfo(conn) {
  const out = await psql(conn, `SELECT current_setting('server_version'), coalesce(host(inet_server_addr()),'local');`);
  const f = (out.split('\n')[0] || '').trim().split(UNIT);
  return { version: f[0] || 'unknown', address: f[1] || 'local' };
}

async function dropDatabase(quotedIdent, conn, { dryRun = true } = {}) {
  if (!QUOTED_IDENT.test(quotedIdent)) throw new Error('refused: unsafe identifier passed to dropDatabase');
  const sql = `DROP DATABASE IF EXISTS ${quotedIdent};`;
  if (dryRun) return { executed: false, dryRun: true, sql };
  await psql(conn, sql, { timeout: 120000 });
  return { executed: true, dryRun: false, sql };
}

async function vacuumDatabase(quotedIdent, conn, { dryRun = true, full = false } = {}) {
  if (!QUOTED_IDENT.test(quotedIdent)) throw new Error('refused: unsafe identifier passed to vacuumDatabase');
  // VACUUM runs against the target DB itself, not the admin DB.
  const target = Object.assign({}, conn, { adminDb: quotedIdent.slice(1, -1) });
  const sql = `VACUUM (ANALYZE${full ? ', FULL' : ''});`;
  if (dryRun) return { executed: false, dryRun: true, sql: `-- in ${quotedIdent}: ${sql}` };
  await psql(target, sql, { timeout: 600000 });
  return { executed: true, dryRun: false, sql };
}

module.exports = { listDatabases, serverInfo, dropDatabase, vacuumDatabase, psql, QUOTED_IDENT };
