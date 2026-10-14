// Partner Hub · hosted backend (Cloudflare Worker + one SQLite-backed Durable Object).
// The Durable Object is the single source of truth: accounts, sessions, documents, files and the audit log.
// Every read and write is checked against the caller's role on the server.
import { DurableObject } from 'cloudflare:workers';
import puppeteer from '@cloudflare/puppeteer';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const SECURITY_HEADERS = { 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin', 'x-content-type-options': 'nosniff' };
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...SECURITY_HEADERS, ...headers } });
const fail = (code, message, status = 400) => json({ code, message }, status);
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'application/json', 'text/csv', 'text/plain', 'text/markdown']);
const CHUNK = 1024 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const PBKDF2_ITER = 100000;
const SESSION_DAYS = 30;
const enc = new TextEncoder();

const LAZY = new Set(['filetext']); // large collections fetched on demand, not pushed in sync
function csp(host) {
  return ["default-src 'self'", "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self' wss://" + host + ' ws://' + host, "worker-src 'self' blob:",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_blob/') || url.pathname === '/ws') {
      const stub = env.WORKSPACE.get(env.WORKSPACE.idFromName('main'));
      return stub.fetch(req);
    }
    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
    if ((out.headers.get('content-type') || '').includes('text/html')) {
      out.headers.set('content-security-policy', csp(url.host));
      out.headers.set('cache-control', 'no-cache');
      out.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    }
    if (url.protocol === 'https:') out.headers.set('strict-transport-security', 'max-age=31536000');
    return out;
  },
};

/* ---------------- helpers ---------------- */
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async data => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
const rid = (n = 12) => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const r = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of r) s += a[x % 36]; return s; };
const nowIso = () => new Date().toISOString();
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const normEmail = e => String(e || '').trim().toLowerCase();
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const onlyKeys = (obj, keys) => obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).every(k => keys.includes(k));
const PATH_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){1,15}$/;
function deepMerge(a, b) {
  const out = Object.assign({}, a);
  for (const k of Object.keys(b)) {
    const v = b[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}
async function hashPassword(pw, saltB64) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(saltB64), iterations: PBKDF2_ITER }, key, 256);
  return b64e(new Uint8Array(bits));
}
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function cookieOf(req, name) { const c = req.headers.get('cookie') || ''; for (const part of c.split(/;\s*/)) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1)); } return null; }
const decidedOk = (d, uid) => onlyKeys(d, ['by', 'role', 'at']) && d.by === uid;
// Customers may add their own comments and mark existing ones resolved, never rewrite someone else's text.
function commentsOk(next, cur, uid) {
  if (!next || typeof next !== 'object' || Array.isArray(next)) return false;
  for (const [id, c] of Object.entries(next)) {
    if (!c || typeof c !== 'object') return false;
    if (cur && cur[id]) { if (!onlyKeys(c, ['resolved', 'resolvedBy', 'resolvedAt']) || (c.resolvedBy && c.resolvedBy !== uid)) return false; }
    else if (!onlyKeys(c, ['text', 'kind', 'resolved', 'round', 'version', 'by', 'role', 'at']) || c.by !== uid || typeof c.text !== 'string' || c.text.length > 5000) return false;
  }
  return true;
}
const num = (...vals) => { for (const v of vals) { if (v === null || v === undefined || v === '') continue; const n = Number(v); if (isFinite(n)) return n; } return null; };

/* ---------------- the workspace ---------------- */
export class Workspace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.env = env;
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) { }
    ctx.blockConcurrencyWhile(async () => { this.migrate(); await this.seed(); });
  }
  q(sql, ...args) { return this.sql.exec(sql, ...args).toArray(); }
  one(sql, ...args) { const r = this.q(sql, ...args); return r.length ? r[0] : null; }
  migrate() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, pw TEXT, salt TEXT, is_owner INTEGER DEFAULT 0, created_at TEXT, disabled INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(tok TEXT PRIMARY KEY, user_id TEXT, expires INTEGER, created_at TEXT);
      CREATE TABLE IF NOT EXISTS docs(path TEXT PRIMARY KEY, col TEXT, data TEXT, version INTEGER, seq INTEGER, deleted INTEGER DEFAULT 0);
      CREATE INDEX IF NOT EXISTS docs_seq ON docs(seq);
      CREATE TABLE IF NOT EXISTS blobs(id TEXT, idx INTEGER, data BLOB, PRIMARY KEY(id, idx));
      CREATE TABLE IF NOT EXISTS blob_meta(id TEXT PRIMARY KEY, type TEXT, size INTEGER, created_at TEXT, created_by TEXT);
      CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS throttle(k TEXT PRIMARY KEY, n INTEGER, until INTEGER);`);
  }
  async seed() {
    if (this.one('SELECT id FROM users LIMIT 1')) return;
    let seed = null;
    try { seed = JSON.parse(this.env.SEED || 'null'); } catch (e) { seed = null; }
    if (!seed || !seed.owner) return;
    const ownerId = 'u_' + rid(22), custId = 'u_' + rid(22), pid = rid(), invId = rid();
    this.sql.exec('INSERT INTO users(id,email,name,pw,salt,is_owner,created_at) VALUES(?,?,?,?,?,1,?)', ownerId, normEmail(seed.owner.email), seed.owner.name, seed.owner.hash, seed.owner.salt, nowIso());
    this.putDoc('settings/workspace', { agencyName: seed.agencyName || 'Games Medya', ownerId, createdAt: nowIso() });
    if (seed.customer) {
      this.sql.exec('INSERT INTO users(id,email,name,pw,salt,is_owner,created_at) VALUES(?,?,?,?,?,0,?)', custId, normEmail(seed.customer.email), seed.customer.name, seed.customer.hash, seed.customer.salt, nowIso());
      this.putDoc('partnerships/' + pid, { name: seed.customerCompany || 'Unilever', status: 'active', msas: {}, summary: null, createdAt: nowIso(), createdBy: ownerId });
      this.putDoc('invites/' + invId, { email: normEmail(seed.customer.email), accountType: 'customer', accountId: pid, role: 'admin', status: 'accepted', codeHash: '', invitedBy: ownerId, createdAt: nowIso(), acceptedBy: custId, acceptedAt: nowIso(), verifiedVia: 'seed' });
      this.putDoc('members/' + custId, { inviteIds: { [invId]: true }, email: normEmail(seed.customer.email), joinedAt: nowIso() });
    }
    this.audit({ by: ownerId, role: 'agency:owner', act: 'workspace.create', scope: 'agency', text: 'Workspace created with the agency owner account' + (seed.customer ? ' and the ' + (seed.customerCompany || 'Unilever') + ' customer account' : '') });
  }

  /* ---------- documents ---------- */
  nextSeq() { const r = this.one("SELECT v FROM meta WHERE k='seq'"); const n = (r ? +r.v : 0) + 1; this.sql.exec("INSERT INTO meta(k,v) VALUES('seq',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(n)); return n; }
  getDoc(path) { const r = this.one('SELECT data, version, deleted FROM docs WHERE path=?', path); if (!r || r.deleted) return null; return { data: JSON.parse(r.data), version: r.version }; }
  putDoc(path, data) {
    const seq = this.nextSeq(); const col = path.split('/').slice(0, -1).join('/');
    const cur = this.one('SELECT version FROM docs WHERE path=?', path); const version = (cur ? cur.version : 0) + 1;
    this.sql.exec('INSERT INTO docs(path,col,data,version,seq,deleted) VALUES(?,?,?,?,?,0) ON CONFLICT(path) DO UPDATE SET data=excluded.data, version=excluded.version, seq=excluded.seq, deleted=0', path, col, JSON.stringify(data), version, seq);
    this.dirty = true; this.lastWrite = true;
    this.sql.exec("INSERT INTO meta(k,v) VALUES('lastWrite',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", nowIso());
    return { version, seq };
  }
  delDoc(path) { const seq = this.nextSeq(); this.sql.exec("UPDATE docs SET deleted=1, data='null', seq=?, version=version+1 WHERE path=?", seq, path); this.dirty = true; return { seq }; }
  broadcast() {
    if (!this.dirty) return; this.dirty = false;
    const msg = JSON.stringify({ t: 'chg', at: Date.now() });
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch (e) { } }
  }
  audit(ev) {
    const at = nowIso(); const day = at.slice(0, 10).replace(/-/g, '');
    const e = Object.assign({ at }, ev); const id = Date.now().toString(36) + rid(5);
    for (let shard = 0; shard < 50; shard++) {
      const path = 'audit/' + day + '_' + String(shard).padStart(2, '0');
      const cur = this.getDoc(path);
      if (!cur) { this.putDoc(path, { date: at.slice(0, 10), shard, createdAt: at, events: { [id]: e } }); return; }
      if (Object.keys(cur.data.events || {}).length < 600) { cur.data.events = Object.assign(cur.data.events || {}, { [id]: e }); this.putDoc(path, cur.data); return; }
    }
  }

  /* ---------- identity & access ---------- */
  async sessionUser(req) {
    const tok = cookieOf(req, 'ph_session'); if (!tok) return null;
    const row = this.one('SELECT s.user_id, s.expires, u.id, u.email, u.name, u.is_owner, u.disabled FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.tok = ?', await sha256(tok));
    if (!row || row.expires < Date.now() || row.disabled) return null;
    return { id: row.id, email: row.email, name: row.name, is_owner: !!row.is_owner };
  }
  access(user) {
    if (!user) return { type: null, accounts: {} };
    if (user.is_owner) return { type: 'agency', role: 'owner', accounts: {} };
    const mem = this.getDoc('members/' + user.id);
    const ids = mem ? Object.keys(mem.data.inviteIds || {}) : [];
    let agencyRole = null; const accounts = {};
    for (const id of ids) {
      const inv = this.getDoc('invites/' + id); if (!inv) continue; const i = inv.data;
      if (i.status !== 'accepted' || i.acceptedBy !== user.id) continue;
      if (i.accountType === 'agency') agencyRole = i.role || 'member';
      else { const p = this.getDoc('partnerships/' + i.accountId); if (p && (p.data.status || 'active') === 'active') accounts[i.accountId] = i.role || 'viewer'; }
    }
    if (agencyRole) return { type: 'agency', role: agencyRole, accounts: {} };
    if (Object.keys(accounts).length) return { type: 'customer', accounts };
    return { type: null, accounts: {} };
  }
  readFilter(acc, user, path, data) {
    const [col, id] = path.split('/');
    if (col === 'finance') return acc.type === 'agency' && acc.role === 'owner' ? data : undefined;
    if (acc.type === 'agency') { if (col === 'invites' && !['owner', 'admin'].includes(acc.role)) { const c = Object.assign({}, data); delete c.codeHash; return c; } return data; }
    if (col === 'settings') { const c = Object.assign({}, data); return c; }
    if (col === 'members') return id === user.id ? data : undefined;
    if (col === 'invites') {
      const mine = data.email === user.email;
      const acct = acc.type === 'customer' && data.accountType === 'customer' && acc.accounts[data.accountId];
      if (!mine && !acct) return undefined;
      const c = Object.assign({}, data); delete c.codeHash;
      if (mine && data.accountType === 'customer') { const pd = this.getDoc('partnerships/' + data.accountId); if (pd) c.accountName = pd.data.name; }
      return c;
    }
    if (acc.type !== 'customer') return undefined;
    const A = acc.accounts;
    if (col === 'partnerships') { if (!A[id]) return undefined; const c = clone(data); if (c.summary && c.summary.data) c.summary.data.budget = ''; return c; }
    if (col === 'influencers') {
      if (!A[data.partnershipId]) return undefined;
      // Where a number came from (fetched or typed by the agency) is agency-internal.
      const c = clone(data);
      for (const k of Object.keys(c.platforms || {})) { const x = c.platforms[k]; if (x && typeof x === 'object') { delete x.fetched; delete x.fSource; delete x.erSource; } }
      return c;
    }
    if (col === 'projects' || col === 'files' || col === 'filetext') return A[data.partnershipId] ? data : undefined;
    if (col === 'audit') { const ev = {}; for (const [k, e] of Object.entries(data.events || {})) if (e && e.pid && A[e.pid] && e.scope !== 'agency') ev[k] = e; return Object.assign({}, data, { events: ev }); }
    return undefined;
  }
  canWrite(acc, user, op, path, data, cur) {
    const [col, id] = path.split('/');
    const isAg = acc.type === 'agency', owner = isAg && acc.role === 'owner', admin = isAg && (acc.role === 'owner' || acc.role === 'admin');
    if (col === 'finance') return owner;
    if (col === 'audit') {
      if (op === 'delete') return false;
      if (!acc.type) return false;
      if (op === 'set' && cur) return admin;
      for (const [k, e] of Object.entries((data && data.events) || {})) {
        if (!e || typeof e !== 'object') return false;
        if (cur && cur.data.events && cur.data.events[k] && !admin) return false;
        if (acc.type === 'customer' && e.pid && !acc.accounts[e.pid]) return false;
      }
      return op !== 'update' || onlyKeys(data, ['events']);
    }
    if (col === 'members') return id === user.id || owner;
    if (col === 'settings') return admin;
    if (col === 'invites') {
      if (admin) return true;
      if (acc.type === 'customer' && op !== 'delete') { const t = Object.assign({}, cur ? cur.data : {}, data); return t.accountType === 'customer' && acc.accounts[t.accountId] === 'admin' && (!data.status || ['pending', 'revoked', 'accepted'].includes(data.status)) && (!data.acceptedBy || (cur && cur.data.acceptedBy === data.acceptedBy)); }
      return false;
    }
    if (isAg) return true;
    if (acc.type !== 'customer' || op !== 'update' || !cur) return false;
    const r = acc.accounts[cur.data.partnershipId];
    if (r !== 'admin' && r !== 'approver') return false;
    if (col === 'projects') return onlyKeys(data, ['masterfile', 'updatedAt']) && onlyKeys(data.masterfile || {}, ['status', 'approvedAt', 'approvedBy', 'approvedRole']) && (!data.masterfile || !data.masterfile.status || data.masterfile.status === 'approved') && (cur.data.masterfile || {}).status === 'in_review';
    if (col === 'influencers') {
      if (!onlyKeys(data, ['state', 'decided', 'comments', 'assignments', 'updatedAt'])) return false;
      const mf = ((this.getDoc('projects/' + cur.data.projectId) || { data: {} }).data.masterfile) || {};
      if (data.state) { if (!['approved', 'commented'].includes(data.state) || mf.status !== 'in_review' || cur.data.state === 'draft') return false; }
      if (data.decided && !decidedOk(data.decided, user.id)) return false;
      if (data.comments && !commentsOk(data.comments, cur.data.comments, user.id)) return false;
      for (const [aid, a] of Object.entries(data.assignments || {})) {
        const ca = (cur.data.assignments || {})[aid]; if (!ca || ca.removed) return false;
        if (!onlyKeys(a, ['review'])) return false;
        const rv = a.review || {}; const crv = ca.review || {};
        if (!onlyKeys(rv, ['status', 'decided', 'comments'])) return false;
        if (rv.status && (!['approved', 'changes'].includes(rv.status) || crv.status !== 'submitted')) return false;
        if (rv.decided && !decidedOk(rv.decided, user.id)) return false;
        if (rv.comments && !commentsOk(rv.comments, crv.comments, user.id)) return false;
      }
      return true;
    }
    return false;
  }

  /* ---------- request router ---------- */
  async fetch(req) {
    const url = new URL(req.url); const p = url.pathname; const m = req.method;
    try {
      if (m !== 'GET' && m !== 'HEAD' && p !== '/ws') {
        const origin = req.headers.get('origin');
        if (origin && origin !== url.origin) return fail('forbidden', 'Cross-site request refused.', 403);
      }
      if (p === '/api/login' && m === 'POST') return await this.login(req);
      if (p === '/api/register' && m === 'POST') return await this.register(req);
      if (p === '/api/health') return this.health();
      const user = await this.sessionUser(req);
      if (!user) return fail('unauthenticated', 'Sign in to continue.', 401);
      if (p === '/ws') {
        if (req.headers.get('upgrade') !== 'websocket') return fail('bad_request', 'Expected a WebSocket.', 426);
        const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1], [user.id]);
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      if (p === '/api/logout' && m === 'POST') { const tok = cookieOf(req, 'ph_session'); if (tok) this.sql.exec('DELETE FROM sessions WHERE tok=?', await sha256(tok)); return json({ ok: true }, 200, { 'set-cookie': 'ph_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' }); }
      if (p === '/api/me') return json({ id: user.id, name: user.name, email: user.email, isOwner: user.is_owner, access: this.access(user), features: this.features() });
      if (p === '/api/password' && m === 'POST') return await this.changePassword(req, user);
      if (p === '/api/profiles' && m === 'POST') return await this.profiles(req, user);
      if (p === '/api/db/sync') return this.sync(user, +url.searchParams.get('since') || 0);
      if (p === '/api/db/doc') return this.readDoc(user, url.searchParams.get('path'));
      if (p === '/api/db/list') return this.listCol(user, url.searchParams.get('col'));
      if (p === '/api/db/op' && m === 'POST') { const r = await this.op(req, user); this.broadcast(); return r; }
      if (p === '/api/invites/redeem' && m === 'POST') { const r = await this.redeem(req, user); this.broadcast(); return r; }
      if (p === '/api/invites/accept' && m === 'POST') { const r = await this.acceptById(req, user); this.broadcast(); return r; }
      if (p === '/api/assets' && m === 'POST') return await this.upload(req, user);
      if (p === '/api/assets' && m === 'GET') return this.listAssets(user);
      if (p.startsWith('/api/assets/') && m === 'DELETE') return this.deleteAsset(user, p.slice(12));
      if (p.startsWith('/_blob/')) return this.serveBlob(user, p.slice(7));
      if (p === '/api/claude' && m === 'POST') return await this.claude(req, user);
      if (p === '/api/social/profile' && m === 'POST') return await this.socialProfile(req, user);
      if (p === '/api/social/post' && m === 'POST') return await this.socialPost(req, user);
      if (p === '/api/social/capture' && m === 'POST') return await this.capture(req, user);
      if (p === '/api/email' && m === 'POST') { const r = await this.email(req, user); this.broadcast(); return r; }
      return fail('not_found', 'Unknown endpoint.', 404);
    } catch (e) {
      console.error(e && e.stack || e);
      this.noteError(p, e);
      return fail('unavailable', 'Server error: ' + (e && e.message || e), 500);
    }
  }
  health() {
    const last = this.one("SELECT v FROM meta WHERE k='lastWrite'");
    const err = this.one("SELECT v FROM meta WHERE k='errors'");
    let errors = []; try { errors = JSON.parse(err ? err.v : '[]'); } catch (e) { }
    const day = Date.now() - 86400000;
    const blob = this.one('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS b FROM blob_meta');
    return json({
      ok: true, version: this.env.APP_VERSION || 'dev', time: nowIso(),
      seeded: !!this.one('SELECT id FROM users LIMIT 1'),
      features: this.features(),
      lastWriteAt: last ? last.v : null,
      errors24h: errors.filter(e => Date.parse(e.at) > day).length,
      lastError: errors.length ? { at: errors[errors.length - 1].at, where: errors[errors.length - 1].where } : null,
      storage: { files: blob.n, mb: Math.round(blob.b / 104857.6) / 10 },
      counts: Object.fromEntries(this.q("SELECT col, COUNT(*) AS n FROM docs WHERE deleted=0 AND col IN ('partnerships','projects','influencers','files','invites') GROUP BY col").map(r => [r.col, r.n]).concat([['users', this.one('SELECT COUNT(*) AS n FROM users').n]])),
      pending: { masterfileReviews: this.q("SELECT COUNT(*) AS n FROM docs WHERE col='projects' AND deleted=0 AND json_extract(data,'$.masterfile.status')='in_review'")[0].n },
      sockets: this.ctx.getWebSockets().length,
    }, 200, { 'access-control-allow-origin': '*' });
  }
  noteError(where, e) {
    try {
      const r = this.one("SELECT v FROM meta WHERE k='errors'"); let list = []; try { list = JSON.parse(r ? r.v : '[]'); } catch (x) { }
      list.push({ at: nowIso(), where, msg: String((e && e.message) || e).slice(0, 300) }); list = list.slice(-50);
      this.sql.exec("INSERT INTO meta(k,v) VALUES('errors',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", JSON.stringify(list));
    } catch (x) { }
  }
  webSocketMessage(ws, msg) { if (msg === 'ping') { try { ws.send('pong'); } catch (e) { } } }
  webSocketClose(ws) { try { ws.close(); } catch (e) { } }
  features() { const e = this.env; return { claude: !!e.ANTHROPIC_API_KEY || e.STUB_PROVIDERS === '1', apify: !!e.APIFY_TOKEN || e.STUB_PROVIDERS === '1', screenshots: !!e.BROWSER || e.STUB_PROVIDERS === '1', email: !!e.RESEND_API_KEY || e.STUB_PROVIDERS === '1' }; }

  /* ---------- auth ---------- */
  throttle(key, max, windowMs) {
    const now = Date.now(); const r = this.one('SELECT n, until FROM throttle WHERE k=?', key);
    if (r && r.until > now && r.n >= max) return false;
    if (!r || r.until <= now) this.sql.exec('INSERT INTO throttle(k,n,until) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=1, until=excluded.until', key, now + windowMs);
    else this.sql.exec('UPDATE throttle SET n=n+1 WHERE k=?', key);
    return true;
  }
  async startSession(userId) {
    const tok = b64e(crypto.getRandomValues(new Uint8Array(32))).replace(/[^A-Za-z0-9]/g, '');
    this.sql.exec('INSERT INTO sessions(tok,user_id,expires,created_at) VALUES(?,?,?,?)', await sha256(tok), userId, Date.now() + SESSION_DAYS * 86400000, nowIso());
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', Date.now());
    return 'ph_session=' + encodeURIComponent(tok) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400;
  }
  async login(req) {
    const b = await req.json().catch(() => ({}));
    const email = normEmail(b.email); const ip = req.headers.get('cf-connecting-ip') || 'local';
    if (!this.throttle('login:' + email, 8, 15 * 60000) || !this.throttle('ip:' + ip, 40, 15 * 60000)) return fail('rate_limited', 'Too many attempts. Wait 15 minutes and try again.', 429);
    const u = this.one('SELECT * FROM users WHERE email=?', email);
    const computed = await hashPassword(String(b.password || ''), u ? u.salt : 'AAAAAAAAAAAAAAAAAAAAAA==');
    const ok = u && !u.disabled && safeEqual(computed, u.pw);
    if (!ok) return fail('invalid_credentials', 'Email or password is not correct.', 401);
    this.sql.exec('DELETE FROM throttle WHERE k=?', 'login:' + email);
    const cookie = await this.startSession(u.id);
    this.audit({ by: u.id, role: u.is_owner ? 'agency:owner' : 'account', act: 'auth.login', scope: 'agency', text: 'Signed in' }); this.broadcast();
    return json({ ok: true }, 200, { 'set-cookie': cookie });
  }
  async register(req) {
    const b = await req.json().catch(() => ({}));
    const email = normEmail(b.email), code = normCode(b.code), name = String(b.name || '').trim().slice(0, 80), pw = String(b.password || '');
    const ip = req.headers.get('cf-connecting-ip') || 'local';
    if (!this.throttle('reg:' + ip, 15, 15 * 60000)) return fail('rate_limited', 'Too many attempts. Wait 15 minutes and try again.', 429);
    if (!email || code.length < 8 || !name || pw.length < 10) return fail('bad_request', 'Enter your invited email, the invitation code, your name and a password of at least 10 characters.');
    if (this.one('SELECT id FROM users WHERE email=?', email)) return fail('exists', 'An account with this email already exists. Sign in instead, then enter the code.', 409);
    const inv = await this.findInvite(code, email);
    if (!inv) return fail('invalid_code', 'This code does not match an open invitation for this email address.', 400);
    const id = 'u_' + rid(22); const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
    this.sql.exec('INSERT INTO users(id,email,name,pw,salt,is_owner,created_at) VALUES(?,?,?,?,?,0,?)', id, email, name, await hashPassword(pw, salt), salt, nowIso());
    this.acceptInvite(inv, { id, email, name }, 'code');
    const cookie = await this.startSession(id); this.broadcast();
    return json({ ok: true }, 200, { 'set-cookie': cookie });
  }
  async findInvite(code, email) {
    const rows = this.q("SELECT path, data FROM docs WHERE col='invites' AND deleted=0");
    for (const r of rows) {
      const d = JSON.parse(r.data); const id = r.path.split('/')[1];
      if (d.status !== 'pending' || d.email !== email || !d.codeHash) continue;
      if ((await sha256(id + ':' + code)) === d.codeHash) return { id, data: d };
    }
    return null;
  }
  acceptInvite(inv, user, via) {
    const cur = this.getDoc('members/' + user.id);
    const inviteIds = Object.assign({}, cur ? cur.data.inviteIds : {}, { [inv.id]: true });
    this.putDoc('members/' + user.id, { inviteIds, email: user.email, joinedAt: cur ? cur.data.joinedAt : nowIso(), updatedAt: nowIso() });
    this.putDoc('invites/' + inv.id, Object.assign({}, inv.data, { status: 'accepted', acceptedBy: user.id, acceptedAt: nowIso(), verifiedVia: via, acceptedEmail: user.email }));
    const acct = inv.data.accountType === 'agency' ? 'the agency team' : ((this.getDoc('partnerships/' + inv.data.accountId) || { data: {} }).data.name || 'a customer account');
    this.audit({ by: user.id, role: inv.data.accountType === 'agency' ? 'agency:' + inv.data.role : 'customer', act: 'member.join', pid: inv.data.accountType === 'customer' ? inv.data.accountId : undefined, scope: inv.data.accountType === 'agency' ? 'agency' : undefined, ref: inv.id, refName: user.email, text: (user.name || user.email) + ' joined ' + acct + ' (email verified with the invitation code)' });
  }
  async redeem(req, user) {
    const b = await req.json().catch(() => ({}));
    if (!this.throttle('redeem:' + user.id, 10, 15 * 60000)) return fail('rate_limited', 'Too many attempts. Wait 15 minutes and try again.', 429);
    const inv = await this.findInvite(normCode(b.code), user.email);
    if (!inv) return fail('invalid_code', 'This code does not match an open invitation for ' + user.email + '.', 400);
    this.acceptInvite(inv, user, 'code');
    return json({ ok: true, invite: inv.id });
  }
  async acceptById(req, user) {
    const b = await req.json().catch(() => ({}));
    const cur = this.getDoc('invites/' + String(b.id || ''));
    if (!cur || cur.data.email !== user.email || !(cur.data.status === 'pending' || (cur.data.status === 'accepted' && cur.data.acceptedBy === user.id))) return fail('invalid_argument', 'This invitation is not open for your account.', 400);
    this.acceptInvite({ id: b.id, data: cur.data }, user, 'email');
    return json({ ok: true });
  }
  async changePassword(req, user) {
    const b = await req.json().catch(() => ({}));
    const u = this.one('SELECT * FROM users WHERE id=?', user.id);
    if (!safeEqual(await hashPassword(String(b.current || ''), u.salt), u.pw)) return fail('invalid_credentials', 'Your current password is not correct.', 400);
    if (String(b.next || '').length < 10) return fail('bad_request', 'Choose a password of at least 10 characters.');
    const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
    this.sql.exec('UPDATE users SET pw=?, salt=? WHERE id=?', await hashPassword(String(b.next), salt), salt, user.id);
    const tok = cookieOf(req, 'ph_session'); const keep = tok ? await sha256(tok) : '';
    this.sql.exec('DELETE FROM sessions WHERE user_id=? AND tok<>?', user.id, keep);
    this.audit({ by: user.id, role: 'account', act: 'auth.password', scope: 'agency', text: 'Changed password' }); this.broadcast();
    return json({ ok: true });
  }
  async profiles(req, user) {
    const b = await req.json().catch(() => ({}));
    const acc = this.access(user); const out = {};
    for (const id of (Array.isArray(b.ids) ? b.ids : []).slice(0, 200)) {
      const u = this.one('SELECT id, name, email FROM users WHERE id=?', String(id));
      out[id] = { id, name: u ? u.name : '', email: u && (acc.type === 'agency' || u.id === user.id) ? u.email : null, guest: false, isMe: id === user.id };
    }
    return json(out);
  }

  /* ---------- data ---------- */
  sync(user, since) {
    const acc = this.access(user);
    const rows = this.q('SELECT path, col, data, version, seq, deleted FROM docs WHERE seq > ? ORDER BY seq', since);
    const seqRow = this.one("SELECT v FROM meta WHERE k='seq'");
    const docs = [];
    for (const r of rows) {
      if (LAZY.has(r.col)) continue;
      if (r.deleted) { if (since) docs.push({ path: r.path, deleted: true, version: r.version }); continue; }
      const d = this.readFilter(acc, user, r.path, JSON.parse(r.data));
      if (d === undefined) { if (since) docs.push({ path: r.path, deleted: true }); continue; }
      docs.push({ path: r.path, data: d, version: r.version });
    }
    return json({ seq: seqRow ? +seqRow.v : 0, docs, access: acc });
  }
  readDoc(user, path) {
    if (!PATH_RE.test(String(path || ''))) return fail('invalid_argument', 'Malformed path.');
    const cur = this.getDoc(path); if (!cur) return json({ exists: false });
    const d = this.readFilter(this.access(user), user, path, cur.data);
    return json(d === undefined ? { exists: false } : { exists: true, data: d, version: cur.version });
  }
  listCol(user, col) {
    if (!/^[A-Za-z0-9_\-]{1,60}$/.test(String(col || ''))) return fail('invalid_argument', 'Malformed collection.');
    const acc = this.access(user); const out = [];
    for (const r of this.q('SELECT path, data, version FROM docs WHERE col=? AND deleted=0 ORDER BY path LIMIT 5000', col)) {
      const d = this.readFilter(acc, user, r.path, JSON.parse(r.data)); if (d !== undefined) out.push({ path: r.path, data: d, version: r.version });
    }
    return json({ docs: out });
  }
  async op(req, user) {
    const b = await req.json().catch(() => null);
    if (!b || !['set', 'update', 'delete'].includes(b.op) || !PATH_RE.test(String(b.path || '')) || String(b.path).split('/').length % 2) return fail('invalid_argument', 'Malformed write.');
    if (b.op !== 'delete' && (!b.data || typeof b.data !== 'object' || Array.isArray(b.data))) return fail('invalid_argument', 'Document body must be an object.');
    const acc = this.access(user); const cur = this.getDoc(b.path);
    if (b.op === 'update' && !cur) return fail('invalid_argument', 'Document does not exist.', 404);
    if (!this.canWrite(acc, user, b.op, b.path, b.data, cur)) return fail('invalid_argument', 'Write refused for your role.', 403);
    if (b.op === 'delete') { if (cur) this.delDoc(b.path); return json({ ok: true }); }
    const isAudit = b.path.startsWith('audit/');
    if (isAudit && !(acc.type === 'agency' && ['owner', 'admin'].includes(acc.role))) for (const e of Object.values(b.data.events || {})) { e.by = user.id; if (acc.type === 'customer') e.role = 'customer'; }
    const next = b.op === 'set' ? b.data : deepMerge(cur.data, b.data);
    const size = JSON.stringify(next).length; if (size > (isAudit ? 1000 : 256) * 1024) return fail('invalid_argument', 'Document over the size limit.', 413);
    const r = this.putDoc(b.path, next);
    return json({ ok: true, version: r.version, seq: r.seq, data: this.readFilter(acc, user, b.path, next) });
  }

  /* ---------- files ---------- */
  async upload(req, user) {
    const acc = this.access(user); if (acc.type !== 'agency') return fail('not_granted', 'Only the agency can upload files.', 403);
    const type = String(req.headers.get('x-content-type') || '').toLowerCase();
    if (!ACCEPTED_TYPES.has(type)) return fail('unsupported_type', 'This file type cannot be stored.', 415);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return fail('invalid_request', 'Empty file.');
    if (buf.byteLength > MAX_FILE) return fail('too_large', 'Files are limited to 20 MB.', 413);
    const id = hex(crypto.getRandomValues(new Uint8Array(16)));
    for (let i = 0, k = 0; i < buf.byteLength; i += CHUNK, k++) this.sql.exec('INSERT INTO blobs(id,idx,data) VALUES(?,?,?)', id, k, buf.slice(i, i + CHUNK));
    this.sql.exec('INSERT INTO blob_meta(id,type,size,created_at,created_by) VALUES(?,?,?,?,?)', id, type, buf.byteLength, nowIso(), user.id);
    return json({ id, url: '/_blob/' + id, sizeBytes: buf.byteLength, contentType: type });
  }
  listAssets(user) {
    const acc = this.access(user); if (acc.type !== 'agency') return fail('not_granted', 'Only the agency can list storage.', 403);
    const rows = this.q('SELECT id, type, size, created_at FROM blob_meta ORDER BY created_at');
    const assets = rows.map(r => ({ id: r.id, url: '/_blob/' + r.id, contentType: r.type, sizeBytes: r.size, createdAt: r.created_at }));
    return json({ assets, usage: { files: assets.length, bytes: assets.reduce((t, a) => t + a.sizeBytes, 0), maxFiles: 20000, maxBytes: 1024 * 1024 * 1024 } });
  }
  deleteAsset(user, id) {
    const acc = this.access(user); if (acc.type !== 'agency') return fail('not_granted', 'Only the agency can delete files.', 403);
    const had = this.one('SELECT id FROM blob_meta WHERE id=?', id);
    this.sql.exec('DELETE FROM blobs WHERE id=?', id); this.sql.exec('DELETE FROM blob_meta WHERE id=?', id);
    return json({ deleted: !!had });
  }
  serveBlob(user, id) {
    if (!/^[a-f0-9]{32}$/.test(id)) return fail('not_found', 'No such file.', 404);
    const meta = this.one('SELECT type, size FROM blob_meta WHERE id=?', id); if (!meta) return fail('not_found', 'No such file.', 404);
    const acc = this.access(user);
    if (acc.type !== 'agency') {
      const ref = this.q("SELECT data FROM docs WHERE col='files' AND deleted=0 AND json_extract(data,'$.assetId')=?", id);
      if (!ref.some(r => { const d = JSON.parse(r.data); return acc.accounts[d.partnershipId]; })) return fail('not_found', 'No such file.', 404);
    }
    const chunks = this.q('SELECT data FROM blobs WHERE id=? ORDER BY idx', id);
    const out = new Uint8Array(meta.size); let o = 0;
    for (const c of chunks) { const u = new Uint8Array(c.data); out.set(u, o); o += u.length; }
    return new Response(out, { headers: { 'content-type': meta.type, 'cache-control': 'private, max-age=3600', ...SECURITY_HEADERS } });
  }

  /* ---------- Claude ---------- */
  async claude(req, user) {
    const acc = this.access(user); if (acc.type !== 'agency') return fail('not_granted', 'Claude features are for the agency.', 403);
    const b = await req.json().catch(() => ({}));
    const prompt = String(b.prompt || ''); if (!prompt) return fail('invalid_request', 'Empty prompt.');
    if (!this.throttle('claude:' + user.id, 120, 60 * 60000)) return fail('rate_limited', 'Claude limit reached for this hour.', 429);
    if (this.env.STUB_PROVIDERS === '1') return json({ text: stubClaude(prompt, (b.images || []).filter(im => im && im.data && /^image\//.test(im.media_type)).length) });
    if (!this.env.ANTHROPIC_API_KEY) return fail('sampling_disabled', 'Add the ANTHROPIC_API_KEY secret to enable Claude.', 501);
    const content = [];
    for (const im of (b.images || []).slice(0, 5)) if (im && im.data && /^image\/(png|jpeg|webp|gif)$/.test(im.media_type)) content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } });
    content.push({ type: 'text', text: prompt + (b.json ? '\n\nReply with the JSON only.' : '') });
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': this.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: this.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 6000, messages: [{ role: 'user', content }] }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { this.noteError('claude', (j.error && j.error.message) || res.status); return fail(res.status === 429 ? 'rate_limited' : 'upstream_error', (j.error && j.error.message) || ('Claude API error ' + res.status), res.status === 429 ? 429 : 502); }
    return json({ text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(''), model: j.model, truncated: j.stop_reason === 'max_tokens' });
  }

  /* ---------- social data (Apify) ---------- */
  async apify(actor, input) {
    const res = await fetch('https://api.apify.com/v2/acts/' + actor + '/run-sync-get-dataset-items?timeout=120&token=' + encodeURIComponent(this.env.APIFY_TOKEN), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const j = await res.json().catch(() => null);
    if (!res.ok) { const msg = (j && j.error && j.error.message) || ('Apify error ' + res.status); this.noteError('apify:' + actor, msg); throw { code: 'upstream_error', message: msg }; }
    return Array.isArray(j) ? j : [];
  }
  async socialProfile(req, user) {
    const acc = this.access(user); if (acc.type !== 'agency') return fail('not_granted', 'Agency only.', 403);
    const b = await req.json().catch(() => ({}));
    const platform = b.platform === 'tiktok' ? 'tiktok' : 'instagram'; const handle = String(b.handle || '').replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9._]{1,40}$/.test(handle)) return fail('bad_request', 'Enter a valid username.');
    if (this.env.STUB_PROVIDERS === '1') return json(stubProfile(platform, handle));
    if (!this.env.APIFY_TOKEN) return fail('not_configured', 'Add the APIFY_TOKEN secret to fetch followers automatically.', 501);
    if (!this.throttle('apify:' + user.id, 300, 60 * 60000)) return fail('rate_limited', 'Lookup limit reached for this hour.', 429);
    try {
      if (platform === 'instagram') {
        const items = await this.apify('apify~instagram-profile-scraper', { usernames: [handle] });
        const it = items[0]; if (!it || it.error) return fail('not_found', 'Instagram profile @' + handle + ' was not found or is private.', 404);
        const followers = num(it.followersCount, it.followers);
        const posts = (it.latestPosts || []).slice(0, 12);
        const engs = posts.map(x => (num(x.likesCount, x.likes) || 0) + (num(x.commentsCount, x.comments) || 0)).filter(n => n >= 0);
        const er = followers && engs.length ? (engs.reduce((t, n) => t + n, 0) / engs.length) / followers * 100 : null;
        return json({ platform, handle, followers, er: er === null ? null : Math.round(er * 100) / 100, posts: num(it.postsCount), fullName: it.fullName || '', private: !!it.private, sample: posts.length, source: 'apify:instagram-profile-scraper' });
      }
      const items = await this.apify('clockworks~tiktok-profile-scraper', { profiles: [handle], resultsPerPage: 12, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false });
      const first = items.find(x => x && x.authorMeta) || items.find(x => x && !x.error) || null;
      if (!first) return fail('not_found', 'TikTok profile @' + handle + ' was not found or has no public videos.', 404);
      const am = first.authorMeta || first.author || first;
      const followers = num(am.fans, am.followers, am.followerCount, (am.stats || {}).followerCount);
      const vids = items.filter(x => x && (x.playCount !== undefined || x.diggCount !== undefined)).slice(0, 12);
      const engs = vids.map(x => (num(x.diggCount) || 0) + (num(x.commentCount) || 0) + (num(x.shareCount) || 0));
      const er = followers && engs.length ? (engs.reduce((t, n) => t + n, 0) / engs.length) / followers * 100 : null;
      return json({ platform, handle, followers, er: er === null ? null : Math.round(er * 100) / 100, posts: num(am.video), fullName: am.nickName || am.name || '', sample: vids.length, source: 'apify:tiktok-profile-scraper' });
    } catch (e) { return fail(e.code || 'upstream_error', 'Could not fetch the profile: ' + (e.message || e), 502); }
  }
  async socialPost(req, user) {
    const acc = this.access(user); if (acc.type !== 'agency') return fail('not_granted', 'Agency only.', 403);
    const b = await req.json().catch(() => ({}));
    let u; try { u = new URL(String(b.url || '')); } catch (e) { return fail('bad_request', 'Enter the post link.'); }
    const platform = /tiktok\.com$/i.test(u.hostname) ? 'tiktok' : /instagram\.com$/i.test(u.hostname) ? 'instagram' : null;
    if (!platform) return fail('bad_request', 'Only Instagram and TikTok links are supported.');
    if (this.env.STUB_PROVIDERS === '1') return json(stubPost(platform));
    if (!this.env.APIFY_TOKEN) return fail('not_configured', 'Add the APIFY_TOKEN secret to read post metrics automatically.', 501);
    if (!this.throttle('apify:' + user.id, 300, 60 * 60000)) return fail('rate_limited', 'Lookup limit reached for this hour.', 429);
    try {
      if (platform === 'instagram') {
        const items = await this.apify('apify~instagram-scraper', { directUrls: [u.href], resultsType: 'posts', resultsLimit: 1, addParentData: false });
        const it = items[0]; if (!it || it.error) return fail('not_found', 'The post could not be read (it may be private or removed).', 404);
        return json({ platform, metrics: { views: num(it.videoPlayCount, it.videoViewCount, it.igPlayCount), likes: num(it.likesCount), comments: num(it.commentsCount), shares: null, saves: null }, postedAt: it.timestamp || null, owner: it.ownerUsername || '', source: 'apify:instagram-scraper' });
      }
      const items = await this.apify('clockworks~tiktok-scraper', { postURLs: [u.href], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false });
      const it = items[0]; if (!it) return fail('not_found', 'The video could not be read (it may be private or removed).', 404);
      return json({ platform, metrics: { views: num(it.playCount), likes: num(it.diggCount), comments: num(it.commentCount), shares: num(it.shareCount), saves: num(it.collectCount) }, postedAt: it.createTimeISO || null, owner: (it.authorMeta || {}).name || '', source: 'apify:tiktok-scraper' });
    } catch (e) { return fail(e.code || 'upstream_error', 'Could not read the post: ' + (e.message || e), 502); }
  }
  async capture(req, user) {
    const acc = this.access(user); if (acc.type !== 'agency') return fail('not_granted', 'Agency only.', 403);
    const b = await req.json().catch(() => ({}));
    let u; try { u = new URL(String(b.url || '')); } catch (e) { return fail('bad_request', 'Enter the post link.'); }
    if (!/(^|\.)(instagram|tiktok)\.com$/i.test(u.hostname)) return fail('bad_request', 'Only Instagram and TikTok links can be captured.');
    if (this.env.STUB_PROVIDERS === '1') return new Response(b64d(STUB_PNG), { headers: { 'content-type': 'image/png', ...SECURITY_HEADERS } });
    if (!this.env.BROWSER) return fail('not_configured', 'Screenshots need the Browser Rendering binding.', 501);
    if (!this.throttle('cap:' + user.id, 30, 60 * 60000)) return fail('rate_limited', 'Screenshot limit reached for this hour.', 429);
    let browser;
    try {
      browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1500, deviceScaleFactor: 1 });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36');
      await page.goto(u.href, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
      await new Promise(r => setTimeout(r, 2500));
      await page.keyboard.press('Escape').catch(() => { });
      await page.evaluate(() => {
        for (const sel of ['[role="dialog"]', 'div[class*="LoginModal"]', 'div[id*="login"]', 'div[class*="DivModalContainer"]']) document.querySelectorAll(sel).forEach(e => e.remove());
        document.querySelectorAll('div').forEach(e => { const s = getComputedStyle(e); if (s.position === 'fixed' && +s.zIndex > 10 && e.offsetHeight > window.innerHeight * 0.5) e.remove(); });
        document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto';
      }).catch(() => { });
      const img = await page.screenshot({ type: 'png', fullPage: false });
      return new Response(img, { headers: { 'content-type': 'image/png', 'x-captured-at': nowIso(), ...SECURITY_HEADERS } });
    } catch (e) { this.noteError('capture', e); return fail('upstream_error', 'The page could not be captured: ' + (e.message || e), 502); }
    finally { if (browser) { try { await browser.close(); } catch (e) { } } }
  }

  /* ---------- email (Resend) ---------- */
  async email(req, user) {
    const acc = this.access(user);
    const b = await req.json().catch(() => ({}));
    const to = (Array.isArray(b.to) ? b.to : []).map(normEmail).filter(Boolean);
    if (!to.length || !b.subject || !b.body) return fail('bad_request', 'Recipient, subject and body are required.');
    const invites = this.q("SELECT data FROM docs WHERE col='invites' AND deleted=0").map(r => JSON.parse(r.data));
    for (const t of to) {
      const inv = invites.find(i => i.email === t);
      if (!inv) return fail('bad_request', 'Emails can only be sent to invited addresses.', 403);
      const admin = acc.type === 'agency' && ['owner', 'admin'].includes(acc.role);
      const custAdmin = acc.type === 'customer' && inv.accountType === 'customer' && acc.accounts[inv.accountId] === 'admin';
      if (!admin && !custAdmin) return fail('not_granted', 'Only admins can send invitations.', 403);
    }
    if (this.env.STUB_PROVIDERS === '1') { this.lastEmail = { to, subject: b.subject, body: b.body }; return json({ ok: true, id: 'stub', stub: true }); }
    if (!this.env.RESEND_API_KEY) return fail('not_configured', 'Add the RESEND_API_KEY secret to send email. Until then, copy the invitation and send it yourself.', 501);
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + this.env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: this.env.MAIL_FROM || 'Partner Hub <onboarding@resend.dev>', to, subject: String(b.subject).slice(0, 200), text: String(b.body).slice(0, 10000) }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return fail('tool_error', (j && (j.message || (j.error && j.error.message))) || ('Email service error ' + res.status), 502);
    return json({ ok: true, id: j.id });
  }
}

/* ---------------- stubs for local testing ---------------- */
const STUB_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function stubProfile(platform, handle) { return { platform, handle, followers: platform === 'tiktok' ? 23400 : 48200, er: 4.37, posts: 312, fullName: 'Stub ' + handle, sample: 12, source: 'stub' }; }
function stubPost(platform) { return { platform, metrics: { views: 88000, likes: 4100, comments: 120, shares: platform === 'tiktok' ? 60 : null, saves: platform === 'tiktok' ? 90 : null }, postedAt: nowIso(), owner: 'stub', source: 'stub' }; }
function stubClaude(prompt, images) {
  if (/summarize the partnership/.test(prompt)) return JSON.stringify({ headline: 'Stub summary of the partnership', overview: 'Generated without calling Claude (test mode). Images read: ' + (images || 0) + '. Text marker: ' + (prompt.includes('DEBRIEF-MARKER') ? 'seen' : 'missing') + '.', objectives: ['Awareness'], audience: '', key_messages: [], deliverables: [], timeline: '', kpis: [], budget: '', mandatories: [], restrictions: [], open_questions: [], documents: [] });
  if (/performance reports/.test(prompt)) { const ids = Array.from(prompt.matchAll(/- id ([a-z0-9]+) \|/g)).map(m => m[1]); return JSON.stringify({ items: ids.map(id => ({ assignmentId: id, views: 50000, reach: 40000, likes: 2000, comments: 80, shares: 20, saves: 40, er: null, note: 'stub' })) }); }
  return '{}';
}
