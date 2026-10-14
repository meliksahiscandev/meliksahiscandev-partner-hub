// Reliability and load test for the hosted server (local `wrangler dev --config wrangler.test.toml`, stub providers).
// Part 1 injects provider failures (529 overloaded, 429, 5xx, timeouts, dropped connections) and checks that
// transient ones are retried and permanent ones fail fast with a clear message. Part 2 measures the server
// under concurrent sync, writes, same-document updates, WebSocket fan-out and a large upload.
// Usage: node test/reliability.mjs [http://localhost:8787]   (writes test/out-hosted/reliability.json)
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8787';
const OWNER = ['owner@test.local', 'owner-pass-123'];
const results = []; const metrics = {};
const check = (ok, label) => { results.push([!!ok, label]); console.log((ok ? '  PASS ' : '  FAIL ') + label); };
const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let cookie = '';
async function api(path, body, opts = {}) {
  const t0 = performance.now();
  const init = { method: opts.method || (body !== undefined ? 'POST' : 'GET'), headers: Object.assign({ cookie }, opts.headers || {}) };
  if (body !== undefined) { if (opts.raw) init.body = body; else { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; } }
  let res, data = null, bytes = 0;
  try {
    res = await fetch(BASE + path, init);
    const buf = Buffer.from(await res.arrayBuffer()); bytes = buf.length;
    if (opts.binary) data = buf; else { try { data = JSON.parse(buf.toString('utf8')); } catch (e) { data = null; } }
  } catch (e) { return { status: 0, error: String(e), ms: performance.now() - t0 }; }
  return { status: res.status, body: data, ms: performance.now() - t0, bytes, headers: res.headers };
}
async function login() {
  const res = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: OWNER[0], password: OWNER[1] }) });
  const c = (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')]).find(x => x && x.startsWith('ph_session='));
  if (!c) throw new Error('login failed: ' + res.status);
  cookie = c.split(';')[0];
}
const fault = (provider, queue) => api('/api/test/fault', { provider, queue });

async function main() {
  await login();
  const st = (await api('/api/db/sync?since=0')).body;
  const docs = {}; for (const d of st.docs) { const [c, id] = d.path.split('/'); (docs[c] = docs[c] || {})[id] = d.data; }
  const PID = Object.entries(docs.partnerships || {}).find(([, v]) => v.name === 'Unilever')[0];
  const errBase = (await api('/api/health')).body.errors24h;

  console.log('1. Claude: retries on overload, fails fast on bad requests');
  await fault('claude', [529, 529]);
  let r = await api('/api/claude', { prompt: 'summarize the partnership', json: true });
  check(r.status === 200 && r.body.attempts === 3, 'two 529 overloaded answers are retried; third attempt succeeds (attempts ' + (r.body && r.body.attempts) + ')');
  await fault('claude', [529, 529, 529]);
  r = await api('/api/claude', { prompt: 'x' });
  check(r.status === 502 && /529/.test(r.body.message), 'persistent overload ends as 502 with the provider status in the message');
  await fault('claude', [400]);
  r = await api('/api/claude', { prompt: 'x' });
  check(r.status === 502 && /400/.test(r.body.message), 'a bad request (400) is not retried');
  await fault('claude', ['timeout']);
  r = await api('/api/claude', { prompt: 'x' });
  check(r.status === 504 && /4 minutes/.test(r.body.message), 'a Claude timeout is reported as 504 and not repeated');
  await fault('claude', ['network']);
  r = await api('/api/claude', { prompt: 'summarize the partnership' });
  check(r.status === 200 && r.body.attempts === 2, 'a dropped connection is retried');

  console.log('2. Apify lookups');
  await fault('apify', [503]);
  r = await api('/api/social/profile', { platform: 'instagram', handle: 'elif.yilmaz' });
  check(r.status === 200 && r.body.followers === 48200, 'Apify 503 retried once, profile returned');
  await fault('apify', [402]);
  r = await api('/api/social/profile', { platform: 'instagram', handle: 'elif.yilmaz' });
  check(r.status === 502 && /402/.test(r.body.message), 'Apify 402 (plan or credit limit) fails at once with the reason');
  await fault('apify', [429, 429]);
  r = await api('/api/social/profile', { platform: 'tiktok', handle: 'cem.tt' });
  check(r.status === 429, 'Apify rate limit after retry is passed on as 429');
  await fault('apify', ['timeout']);
  r = await api('/api/social/post', { url: 'https://www.instagram.com/p/ABC123/' });
  check(r.status === 502 && /longer than/.test(r.body.message), 'a lookup timeout is explained and not repeated');
  const handles = Array.from({ length: 25 }, (_, i) => 'creator.' + i);
  r = await api('/api/social/profiles', { platform: 'instagram', handles });
  check(r.status === 200 && Object.keys(r.body.results).length === 25 && r.body.results['creator.7'].followers === 48200, 'batch lookup: 25 creators in one run');
  r = await api('/api/social/profiles', { platform: 'instagram', handles: handles.concat(['one.more']) });
  check(r.status === 400, 'batch lookup capped at 25 per request');

  console.log('3. Email and screenshots');
  const invId = 'reltest' + Date.now().toString(36);
  await api('/api/db/op', { op: 'set', path: 'invites/' + invId, data: { email: 'probe@reliability.test', accountType: 'agency', accountId: 'agency', role: 'member', access: 'view', status: 'pending', codeHash: 'x', createdAt: new Date().toISOString() } });
  await fault('email', ['network', 'timeout']);
  r = await api('/api/email', { to: ['probe@reliability.test'], subject: 'Reliability test', body: 'Hello' });
  check(r.status === 200, 'email: dropped connection and timeout retried, third attempt sent');
  await fault('email', [403]);
  r = await api('/api/email', { to: ['probe@reliability.test'], subject: 'Reliability test', body: 'Hello' });
  check(r.status === 502 && /403/.test(r.body.message), 'email: 403 (e.g. unverified domain) returned at once');
  await fault('screenshot', [429]);
  r = await api('/api/social/capture', { url: 'https://www.instagram.com/p/ABC123/' }, { binary: true });
  check(r.status === 200, 'screenshot: browser limit hit once, second launch succeeds');
  await fault('screenshot', [429, 429]);
  r = await api('/api/social/capture', { url: 'https://www.instagram.com/p/ABC123/' });
  check(r.status === 503 && /busy or over its limit/.test(r.body.message), 'screenshot: still over the limit → 503 with advice to retry or upload');
  await api('/api/db/op', { op: 'delete', path: 'invites/' + invId });

  console.log('4. Health shows provider reliability');
  const h = (await api('/api/health')).body;
  const pv = h.providers || {};
  check(pv.claude && pv.claude.calls24h >= 5 && pv.claude.failed24h >= 3 && pv.claude.retried24h >= 3, 'health.providers.claude counts calls, failures and retries');
  check(pv.apify && pv.email && pv.screenshot && typeof pv.apify.p95ms === 'number', 'health.providers has apify, email and screenshot with latency');
  check(!JSON.stringify(h).match(/Injected|probe@|password|token/i), 'health exposes numbers only, no messages or addresses');

  console.log('5. Load: concurrent writes of realistic creator records');
  // A realistic creator record (two platforms, fetched stats, comments, three assignments with review and metrics) ≈ 2 KB.
  const rec = (w, j) => ({ name: 'Load creator ' + w + '.' + j, partnershipId: PID, projectId: 'load-test', removed: true, tier: 'micro', state: 'approved', order: j, createdAt: new Date().toISOString(),
    platforms: { instagram: { enabled: true, handle: 'load.creator.' + w + '.' + j, followers: 48200 + j, er: 3.4, fSource: 'apify', erSource: 'apify', fetched: { followers: 48200, er: 3.4, at: new Date().toISOString(), sample: 12, source: 'apify:instagram-profile-scraper' } },
      tiktok: { enabled: true, handle: 'load.tt.' + w + '.' + j, followers: 23400, er: 5.2, fSource: 'apify', erSource: 'apify' } },
    comments: { a1: { text: 'Audience fits the brief, please keep the tone light.', by: 'u1', role: 'customer', at: new Date().toISOString() }, a2: { text: 'Noted, will brief the creator.', by: 'u2', role: 'agency:member', at: new Date().toISOString() } },
    assignments: Object.fromEntries([1, 2, 3].map(n => ['as' + n, { platform: n === 3 ? 'tiktok' : 'instagram', type: n === 2 ? 'story' : 'reel', review: { status: 'approved', round: 2, files: ['f' + n], at: new Date().toISOString() }, live: { url: 'https://www.instagram.com/p/LOAD' + n + '/', at: new Date().toISOString(), shotId: 'abcdef0123456789abcdef0123456789' }, perf: { views: 88000, reach: 61000, likes: 4100, comments: 120, shares: 60, saves: 90 } }])) });
  const W = 25, PER = 40; const wMs = []; let wErr = 0; const ids = [];
  await Promise.all(Array.from({ length: W }, async (_, w) => {
    for (let j = 0; j < PER; j++) {
      const id = 'load' + w + '_' + j; ids.push(id);
      const x = await api('/api/db/op', { op: 'set', path: 'influencers/' + id, data: rec(w, j) });
      if (x.status !== 200) wErr++; else wMs.push(x.ms);
    }
  }));
  metrics.writes = { writes: W * PER, concurrency: W, errors: wErr, p50ms: Math.round(pct(wMs, 0.5)), p95ms: Math.round(pct(wMs, 0.95)), recordKB: Math.round(JSON.stringify(rec(0, 0)).length / 102.4) / 10 };
  check(wErr === 0, W * PER + ' writes from ' + W + ' clients at once, none lost (p50 ' + metrics.writes.p50ms + ' ms, p95 ' + metrics.writes.p95ms + ' ms)');

  console.log('6. Load: sync with ' + W * PER + ' extra creator records');
  const N = 20, ROUNDS = 3; const syncMs = []; let syncErr = 0, syncBytes = 0, seq = 0;
  for (let k = 0; k < ROUNDS; k++) {
    const rs = await Promise.all(Array.from({ length: N }, () => api('/api/db/sync?since=0')));
    for (const x of rs) { if (x.status !== 200) syncErr++; else { syncMs.push(x.ms); syncBytes = x.bytes; seq = Math.max(seq, x.body.seq || 0); } }
  }
  const dMs = []; let dErr = 0;
  for (let k = 0; k < 3; k++) { const rs = await Promise.all(Array.from({ length: 50 }, () => api('/api/db/sync?since=' + seq))); for (const x of rs) { if (x.status !== 200) dErr++; else dMs.push(x.ms); } }
  metrics.sync = { fullSync: { requests: N * ROUNDS, concurrency: N, errors: syncErr, p50ms: Math.round(pct(syncMs, 0.5)), p95ms: Math.round(pct(syncMs, 0.95)), payloadKB: Math.round(syncBytes / 1024) }, deltaSync: { requests: 150, concurrency: 50, errors: dErr, p50ms: Math.round(pct(dMs, 0.5)), p95ms: Math.round(pct(dMs, 0.95)) } };
  check(syncErr === 0, 'full sync (first load): ' + N * ROUNDS + ' requests, ' + N + ' at a time, no errors (p50 ' + metrics.sync.fullSync.p50ms + ' ms, p95 ' + metrics.sync.fullSync.p95ms + ' ms, ' + metrics.sync.fullSync.payloadKB + ' KB each)');
  check(dErr === 0, 'change sync (every live update): 150 requests, 50 at a time, no errors (p50 ' + metrics.sync.deltaSync.p50ms + ' ms, p95 ' + metrics.sync.deltaSync.p95ms + ' ms)');

  const target = 'influencers/' + ids[0];
  const same = await Promise.all(Array.from({ length: 30 }, (_, k) => api('/api/db/op', { op: 'update', path: target, data: { comments: { ['c' + k]: { text: 'note ' + k, by: 'load', at: new Date().toISOString() } } } })));
  const after = (await api('/api/db/doc?path=' + target)).body;
  check(same.every(x => x.status === 200) && Object.keys((after.data || {}).comments || {}).filter(k => /^c\d+$/.test(k)).length === 30, '30 simultaneous updates to one document all kept (no lost update)');

  console.log('7. Load: live update fan-out over WebSocket');
  const S = 25; const sockets = []; let got = 0; const t0 = { v: 0 }; const lat = [];
  await Promise.all(Array.from({ length: S }, () => new Promise((resolve) => {
    const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws', { headers: { cookie } });
    ws.onopen = () => resolve(); ws.onerror = () => resolve();
    ws.onmessage = ev => { if (String(ev.data) !== 'pong' && t0.v) { got++; lat.push(performance.now() - t0.v); } };
    sockets.push(ws);
  })));
  const open = sockets.filter(w => w.readyState === 1).length;
  await sleep(300); t0.v = performance.now();
  await api('/api/db/op', { op: 'update', path: target, data: { updatedAt: new Date().toISOString() } });
  for (let k = 0; k < 40 && got < open; k++) await sleep(50);
  metrics.fanout = { sockets: open, notified: got, p95ms: Math.round(pct(lat, 0.95) || 0) };
  check(open === S && got >= S, S + ' open sockets all notified of one change (p95 ' + metrics.fanout.p95ms + ' ms)');
  sockets.forEach(w => { try { w.close(); } catch (e) { } });

  console.log('8. Large upload integrity');
  const big = Buffer.alloc(15 * 1048576); for (let i = 0; i < big.length; i += 4096) big[i] = (i / 4096) % 251;
  const up = await api('/api/assets', big, { raw: true, headers: { 'x-content-type': 'application/pdf', 'content-type': 'application/octet-stream' } });
  const down = up.body && up.body.url ? await api(up.body.url, undefined, { binary: true }) : { status: 0 };
  const same15 = down.status === 200 && createHash('sha256').update(down.body).digest('hex') === createHash('sha256').update(big).digest('hex');
  metrics.upload = { mb: 15, uploadMs: Math.round(up.ms), downloadMs: Math.round(down.ms || 0) };
  check(up.status === 200 && same15, '15 MB file stored in chunks and read back byte-identical (up ' + metrics.upload.uploadMs + ' ms, down ' + metrics.upload.downloadMs + ' ms)');
  if (up.body && up.body.id) await api('/api/assets/' + up.body.id, undefined, { method: 'DELETE' });
  const over = await api('/api/assets', Buffer.alloc(21 * 1048576), { raw: true, headers: { 'x-content-type': 'application/pdf', 'content-type': 'application/octet-stream' } });
  check(over.status === 413, 'files over 20 MB refused with 413');

  for (const id of ids) await api('/api/db/op', { op: 'delete', path: 'influencers/' + id });
  const h2 = (await api('/api/health')).body;
  // 8 failures were injected on purpose and must be logged (Claude 3, Apify 3, email 1, screenshot 1); anything more is a real server error.
  check(h2.ok && h2.errors24h - errBase === 8, 'exactly the 8 intended provider failures were logged, no unexpected server errors (' + (h2.errors24h - errBase) + ')');
  mkdirSync(new URL('./out-hosted/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./out-hosted/reliability.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), base: BASE, metrics, providers: h2.providers, results }, null, 2));
  const passed = results.filter(x => x[0]).length;
  console.log('\nMETRICS ' + JSON.stringify(metrics));
  console.log('\nRESULT: ' + passed + ' passed, ' + (results.length - passed) + ' failed');
  process.exit(passed === results.length ? 0 : 1);
}
main().catch(e => { console.error('ERROR', e); process.exit(1); });
