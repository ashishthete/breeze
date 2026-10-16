'use strict';
// Microsoft Entra ID (Azure AD) sign-in for the hub dashboard and the human
// approval endpoints. OAuth 2.0 authorization-code flow, built on Node's https
// + crypto only (no MSAL dependency). The id_token's RS256 signature is
// verified against the tenant JWKS, and issuer / audience / expiry / nonce are
// all checked before a session is created.
//
// Config comes from env (the operator supplies their own app registration):
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_REDIRECT_URI
//   SESSION_SECRET                (random string; signs session cookies)
//   AZURE_ALLOWED_GROUP           (optional: required group object id)
// If the first four are absent, isConfigured() is false and the hub runs in a
// clearly-labelled token-only DEV mode instead.
const https = require('https');
const crypto = require('crypto');

const CFG = {
  tenant: process.env.AZURE_TENANT_ID || '',
  clientId: process.env.AZURE_CLIENT_ID || '',
  clientSecret: process.env.AZURE_CLIENT_SECRET || '',
  redirectUri: process.env.AZURE_REDIRECT_URI || '',
  allowedGroup: process.env.AZURE_ALLOWED_GROUP || '',
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
};
function isConfigured() { return !!(CFG.tenant && CFG.clientId && CFG.clientSecret && CFG.redirectUri); }
const base = () => `https://login.microsoftonline.com/${encodeURIComponent(CFG.tenant)}`;

// ---- transient state (CSRF) + sessions ----
const pending = new Map(); // state -> { nonce, at }
const sessions = new Map(); // sid -> { user, exp }
const SESSION_TTL = 8 * 3600 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > 600000) pending.delete(k);
  for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k);
}, 60000).unref();

function authorizeUrl() {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  pending.set(state, { nonce, at: Date.now() });
  const q = new URLSearchParams({
    client_id: CFG.clientId, response_type: 'code', redirect_uri: CFG.redirectUri,
    response_mode: 'query', scope: 'openid profile email', state, nonce,
  });
  return `${base()}/oauth2/v2.0/token`.replace('/token', '/authorize') + '?' + q.toString();
}

function postForm(url, form) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const u = new URL(url);
    const req = https.request(u, { method: 'POST', headers: {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body),
    } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => {
      try { const j = JSON.parse(d); res.statusCode >= 400 ? reject(new Error(j.error_description || j.error || 'token error')) : resolve(j); }
      catch (e) { reject(e); }
    }); });
    req.on('error', reject); req.write(body); req.end();
  });
}
function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject);
  });
}

let jwksCache = { at: 0, keys: [] };
async function jwks() {
  if (Date.now() - jwksCache.at < 3600000 && jwksCache.keys.length) return jwksCache.keys;
  const j = await getJson(`${base()}/discovery/v2.0/keys`);
  jwksCache = { at: Date.now(), keys: j.keys || [] };
  return jwksCache.keys;
}
const b64url = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

async function verifyIdToken(idToken, expectedNonce) {
  const [h, p, s] = idToken.split('.');
  if (!h || !p || !s) throw new Error('malformed id_token');
  const header = JSON.parse(b64url(h).toString());
  const claims = JSON.parse(b64url(p).toString());
  const key = (await jwks()).find(k => k.kid === header.kid);
  if (!key) throw new Error('signing key not found in JWKS');
  const pub = crypto.createPublicKey({ key, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, b64url(s));
  if (!ok) throw new Error('bad id_token signature');
  if (claims.aud !== CFG.clientId) throw new Error('wrong audience');
  if (!String(claims.iss || '').includes(CFG.tenant)) throw new Error('wrong issuer');
  if (claims.exp * 1000 < Date.now()) throw new Error('id_token expired');
  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error('nonce mismatch');
  if (CFG.allowedGroup && !(claims.groups || []).includes(CFG.allowedGroup))
    throw new Error('user is not in the required group');
  return claims;
}

async function handleCallback(code, state) {
  const pend = pending.get(state);
  if (!pend) throw new Error('unknown or expired state');
  pending.delete(state);
  const tok = await postForm(`${base()}/oauth2/v2.0/token`, {
    client_id: CFG.clientId, client_secret: CFG.clientSecret, grant_type: 'authorization_code',
    code, redirect_uri: CFG.redirectUri, scope: 'openid profile email',
  });
  const claims = await verifyIdToken(tok.id_token, pend.nonce);
  return { name: claims.name || claims.preferred_username || 'user', email: claims.preferred_username || claims.email || '', oid: claims.oid || '' };
}

// ---- session cookies (signed) ----
function createSession(user) {
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { user, exp: Date.now() + SESSION_TTL });
  const sig = crypto.createHmac('sha256', CFG.sessionSecret).update(sid).digest('hex').slice(0, 32);
  return `${sid}.${sig}`;
}
function readSession(cookieHeader) {
  const m = /(?:^|;\s*)bz_sess=([^;]+)/.exec(cookieHeader || '');
  if (!m) return null;
  const [sid, sig] = decodeURIComponent(m[1]).split('.');
  if (!sid || !sig) return null;
  const want = crypto.createHmac('sha256', CFG.sessionSecret).update(sid).digest('hex').slice(0, 32);
  if (sig !== want) return null;
  const s = sessions.get(sid);
  if (!s || s.exp < Date.now()) return null;
  return s.user;
}
function destroySession(cookieHeader) {
  const m = /(?:^|;\s*)bz_sess=([^;]+)/.exec(cookieHeader || '');
  if (m) { const sid = decodeURIComponent(m[1]).split('.')[0]; sessions.delete(sid); }
}
const cookie = (val, maxAge) => `bz_sess=${encodeURIComponent(val)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

module.exports = { CFG, isConfigured, authorizeUrl, handleCallback, createSession, readSession, destroySession, cookie };
