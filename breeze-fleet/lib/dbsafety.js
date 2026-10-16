'use strict';
// Safety gate for staging-database cleanup. Dropping a database is IRREVERSIBLE
// (unlike the desktop app's move-to-Trash), so every destructive action must
// pass through here. The rules are deny-by-default and layered:
//
//   1. The host/connection must be explicitly marked env === "staging".
//   2. The database name must match the operator's staging allow patterns.
//   3. The name must NOT match any protect pattern (prod, templates, etc).
//   4. The name must be a plain identifier (so it can be safely quoted).
//   5. A database with live backends is never dropped (reported instead).
//
// None of these alone is trusted; a drop requires all of them to hold at the
// moment of execution, re-checked on the agent even after a human approval.

const SAFE_IDENT = /^[A-Za-z0-9_][A-Za-z0-9_$]{0,62}$/;

// Always-protected, regardless of operator config.
const ALWAYS_PROTECT = ['postgres', 'template0', 'template1', 'rdsadmin'];

const DEFAULT_PROTECT = [
  'prod', 'production', 'main', 'master', 'app', 'default',
];

function toRegexList(patterns) {
  return (patterns || []).map(p => {
    try { return new RegExp(p); } catch { return null; }
  }).filter(Boolean);
}

function normPolicy(policy = {}) {
  return {
    env: policy.env || 'unknown',
    allow: toRegexList(policy.allow && policy.allow.length ? policy.allow
      : ['^pr_', '^branch_', '^ci_', '^tmp_', '^test_', '_staging$', '_stg$']),
    protect: toRegexList([...(policy.protect || DEFAULT_PROTECT)]),
    idleDays: Number(policy.idleDays) >= 0 ? Number(policy.idleDays) : 7,
    minSizeMB: Number(policy.minSizeMB) || 0,
  };
}

// Is this a database name the policy is even willing to consider cleaning?
function classify(name, policy) {
  const P = normPolicy(policy);
  const reasons = [];
  if (!SAFE_IDENT.test(name)) reasons.push('name is not a plain identifier');
  if (ALWAYS_PROTECT.includes(name.toLowerCase())) reasons.push('system database');
  if (P.protect.some(r => r.test(name))) reasons.push('matches a protect pattern');
  const matchedAllow = P.allow.some(r => r.test(name));
  if (!matchedAllow) reasons.push('does not match any staging pattern');
  return { name, isStaging: matchedAllow && reasons.length === 0, reasons };
}

// Throws unless it is safe to DROP this database right now. `db` is a live stat
// row from lib/pg (so we can refuse when backends are connected).
function assertDroppable(db, policy) {
  const P = normPolicy(policy);
  if (P.env !== 'staging')
    throw new Error(`refused: host env is "${P.env}", not "staging"`);
  const c = classify(db.name, P);
  if (!c.isStaging)
    throw new Error(`refused: ${db.name} — ${c.reasons.join('; ')}`);
  if (db.numBackends > 0)
    throw new Error(`refused: ${db.name} has ${db.numBackends} active connection(s)`);
  // Safe to quote: validated plain identifier, no embedded quotes possible.
  return `"${db.name}"`;
}

// VACUUM is non-destructive, but still staging-only and identifier-checked.
function assertVacuumable(db, policy) {
  const P = normPolicy(policy);
  if (P.env !== 'staging')
    throw new Error(`refused: host env is "${P.env}", not "staging"`);
  if (!SAFE_IDENT.test(db.name))
    throw new Error(`refused: ${db.name} is not a plain identifier`);
  if (ALWAYS_PROTECT.includes(db.name.toLowerCase()))
    throw new Error(`refused: ${db.name} is a system database`);
  return `"${db.name}"`;
}

module.exports = { SAFE_IDENT, ALWAYS_PROTECT, DEFAULT_PROTECT, normPolicy, classify, assertDroppable, assertVacuumable };
