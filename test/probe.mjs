// Live provider probe: calls the real Claude, Apify and Resend APIs with the repository secrets (in GitHub Actions only)
// and the public health endpoint of the live site. Measures success and latency; prints numbers only, never keys or bodies.
// Cost per run is a few cents (a handful of tiny Claude calls, one ~20k-token call, ~12 Apify results). No email is sent.
// Usage (CI): node test/probe.mjs   → job summary + ::notice/::warning annotations; exit 1 if a configured provider is down.
import { appendFileSync, readFileSync } from 'node:fs';

const env = process.env;
const SITE = (env.SITE || readFileSync(new URL('../agents/site.url', import.meta.url), 'utf8')).trim().replace(/\/$/, '');
const MODEL = env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const rows = []; const notes = []; let down = false;
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const secs = ms => ms === null || ms === undefined ? '—' : (ms / 1000).toFixed(1) + ' s';
async function timed(url, init, timeoutMs) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, Object.assign({}, init, { signal: AbortSignal.timeout(timeoutMs || 60000) }));
    const txt = await res.text(); let body = null; try { body = JSON.parse(txt); } catch (e) { }
    return { status: res.status, ms: performance.now() - t0, body, headers: res.headers };
  } catch (e) { return { status: 0, ms: performance.now() - t0, error: e.name === 'TimeoutError' ? 'timeout' : String(e.message || e).slice(0, 120) }; }
}
// Provider error type + message (these never contain the key); trimmed.
const errOf = r => r.error || [r.body && r.body.error && r.body.error.type, r.body && ((r.body.error && r.body.error.message) || r.body.message)].filter(Boolean).join(': ').slice(0, 220);
const ok2 = r => r.status >= 200 && r.status < 300;
function row(provider, test, n, ok, lat, note) { rows.push({ provider, test, n, ok, p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: lat.length ? Math.max(...lat) : null, note: note || '' }); }

async function site() {
  const lat = []; let ok = 0, h = null;
  for (let i = 0; i < 5; i++) { const r = await timed(SITE + '/api/health', {}, 15000); lat.push(r.ms); if (r.status === 200 && r.body && r.body.ok) { ok++; h = r.body; } }
  const lg = await timed(SITE + '/login', {}, 15000);
  row('Live site', '/api/health ×5, /login', 6, ok + (lg.status === 200 ? 1 : 0), lat, h ? 'version ' + h.version + ', errors24h ' + h.errors24h + ', ' + h.storage.files + ' files / ' + h.storage.mb + ' MB' : 'unreachable');
  if (ok < 5 || lg.status !== 200) down = true;
  if (h && h.providers) for (const [k, v] of Object.entries(h.providers)) notes.push('Live ' + k + ' last 24 h: ' + v.calls24h + ' calls, ' + v.failed24h + ' failed, ' + v.retried24h + ' retried, p95 ' + secs(v.p95ms));
  return h;
}

async function claude() {
  if (!env.ANTHROPIC_API_KEY) { row('Claude', 'not configured', 0, 0, [], 'ANTHROPIC_API_KEY missing'); return; }
  const H = { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  const lat = []; let ok = 0; const errs = []; let limits = '';
  for (let i = 0; i < 6; i++) {
    const r = await timed('https://api.anthropic.com/v1/messages', { method: 'POST', headers: H, body: JSON.stringify({ model: MODEL, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] }) }, 60000);
    lat.push(r.ms); if (r.status === 200) ok++; else errs.push(r.status + ' ' + errOf(r));
    if (r.headers && !limits) { const g = k => r.headers.get(k); if (g('anthropic-ratelimit-requests-limit')) limits = 'limits: ' + g('anthropic-ratelimit-requests-limit') + ' req/min, ' + g('anthropic-ratelimit-input-tokens-limit') + ' input tok/min, ' + g('anthropic-ratelimit-output-tokens-limit') + ' output tok/min'; }
  }
  row('Claude', 'short call ×6 (' + MODEL + ')', 6, ok, lat, (errs.length ? 'errors: ' + errs.join('; ') + '. ' : '') + limits);
  // A summary-sized call: ~20k input tokens of brief text, 700 output tokens.
  const para = 'The brand wants awareness for the summer range among 18-34 year olds in Turkey, with Instagram Reels and TikTok videos, nano and micro creators, mandatory #reklam disclosure, no competitor products, and weekly reporting of views, reach and engagement. ';
  const doc = Array.from({ length: 420 }, (_, i) => 'Section ' + (i + 1) + '. ' + para).join('\n');
  const r = await timed('https://api.anthropic.com/v1/messages', { method: 'POST', headers: H, body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content: 'Summarize this campaign brief in 5 bullet points.\n\n' + doc }] }) }, 240000);
  const u = (r.body && r.body.usage) || {};
  row('Claude', 'brief-sized call (~' + Math.round((u.input_tokens || 0) / 1000) + 'k in / ' + (u.output_tokens || 0) + ' out)', 1, r.status === 200 ? 1 : 0, [r.ms], r.status === 200 ? '' : r.status + ' ' + errOf(r));
  if (ok < 4 && r.status !== 200) down = true;
}

async function apify() {
  if (!env.APIFY_TOKEN) { row('Apify', 'not configured', 0, 0, [], 'APIFY_TOKEN missing'); return; }
  const H = { authorization: 'Bearer ' + env.APIFY_TOKEN, 'content-type': 'application/json' };
  const run = (actor, input, secs) => timed('https://api.apify.com/v2/acts/' + actor + '/run-sync-get-dataset-items?timeout=' + secs, { method: 'POST', headers: H, body: JSON.stringify(input) }, (secs + 40) * 1000);
  const me = await timed('https://api.apify.com/v2/users/me/limits', { headers: H }, 20000);
  if (me.status === 200 && me.body && me.body.data) { const d = me.body.data; const used = d.current && d.current.monthlyUsageUsd; const max = d.limits && d.limits.maxMonthlyUsageUsd; notes.push('Apify this month: $' + (used !== undefined ? (+used).toFixed(2) : '?') + ' used of $' + (max !== undefined ? max : '?') + (d.limits && d.limits.maxConcurrentActorJobs ? ', max ' + d.limits.maxConcurrentActorJobs + ' concurrent runs' : '')); }
  let okAll = 0;
  const ig = await run('apify~instagram-profile-scraper', { usernames: ['natgeo', 'nasa', 'instagram'] }, 120);
  const igItems = Array.isArray(ig.body) ? ig.body.filter(x => x && x.username) : [];
  row('Apify', 'Instagram profiles, 3 in one run', 3, igItems.length, [ig.ms], ok2(ig) ? (igItems.length < 3 ? 'some profiles missing' : '') : ig.status + ' ' + errOf(ig)); if (igItems.length) okAll++;
  const tt = await run('clockworks~tiktok-profile-scraper', { profiles: ['tiktok', 'nba'], resultsPerPage: 3, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false }, 120);
  const ttItems = Array.isArray(tt.body) ? tt.body : [];
  const ttProfiles = new Set(ttItems.map(x => x && x.authorMeta && String(x.authorMeta.name).toLowerCase()).filter(Boolean));
  row('Apify', 'TikTok profiles, 2 in one run', 2, ttProfiles.size, [tt.ms], ok2(tt) ? ttItems.length + ' videos returned' : tt.status + ' ' + errOf(tt)); if (ttProfiles.size) okAll++;
  const postUrl = (igItems.find(x => x.latestPosts && x.latestPosts.length) || { latestPosts: [{}] }).latestPosts[0].url;
  if (postUrl) {
    const p = await run('apify~instagram-scraper', { directUrls: [postUrl], resultsType: 'posts', resultsLimit: 1, addParentData: false }, 120);
    const it = Array.isArray(p.body) ? p.body[0] : null;
    row('Apify', 'Instagram post metrics', 1, it && it.likesCount !== undefined ? 1 : 0, [p.ms], ok2(p) ? '' : p.status + ' ' + errOf(p)); if (it) okAll++;
  }
  const vid = (ttItems.find(x => x && x.webVideoUrl) || {}).webVideoUrl;
  if (vid) {
    const p = await run('clockworks~tiktok-scraper', { postURLs: [vid], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false }, 120);
    const it = Array.isArray(p.body) ? p.body[0] : null;
    row('Apify', 'TikTok video metrics', 1, it && it.playCount !== undefined ? 1 : 0, [p.ms], ok2(p) ? '' : p.status + ' ' + errOf(p)); if (it) okAll++;
  }
  if (!okAll) down = true;
}

async function resend() {
  if (!env.RESEND_API_KEY) { row('Resend', 'not configured', 0, 0, [], 'RESEND_API_KEY missing'); return; }
  const r = await timed('https://api.resend.com/domains', { headers: { authorization: 'Bearer ' + env.RESEND_API_KEY } }, 20000);
  if (r.status === 200) {
    const ds = (r.body && r.body.data) || []; const ver = ds.filter(d => d.status === 'verified');
    row('Resend', 'API reachable, domains', 1, 1, [r.ms], ds.length ? ds.map(d => d.name + ': ' + d.status).join(', ') : 'no domain added: invitations reach only the Resend account address');
    if (!ver.length) notes.push('Resend: no verified domain yet. Until one is verified, invitation emails go only to the account owner\'s address.');
  } else if (r.status === 401 || r.status === 403) {
    row('Resend', 'API reachable', 1, 1, [r.ms], 'key is send-only (cannot list domains); email sending itself is checked by the live site');
  } else { row('Resend', 'API reachable', 1, 0, [r.ms], r.status + ' ' + errOf(r)); down = true; }
}

const health = await site();
await claude();
await apify();
await resend();

const md = ['## Provider probe ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', '', '| Provider | Test | OK | p50 | p95 | max | Note |', '|---|---|---|---|---|---|---|']
  .concat(rows.map(r => '| ' + [r.provider, r.test, r.ok + '/' + r.n, secs(r.p50), secs(r.p95), secs(r.max), r.note.replace(/\|/g, '/')].join(' | ') + ' |'))
  .concat(notes.length ? ['', ...notes.map(n => '- ' + n)] : []).join('\n');
console.log(md);
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, md + '\n');
const enc = s => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
for (const r of rows) console.log('::' + (r.ok < r.n ? 'warning' : 'notice') + ' title=' + r.provider + ' · ' + r.test.replace(/[,:]/g, ' ') + '::' + enc(r.ok + '/' + r.n + ' ok · p50 ' + secs(r.p50) + ' · p95 ' + secs(r.p95) + ' · max ' + secs(r.max) + (r.note ? ' · ' + r.note : '')));
if (notes.length) console.log('::notice title=Probe notes::' + enc(notes.join('\n')));
process.exit(down ? 1 : 0);
