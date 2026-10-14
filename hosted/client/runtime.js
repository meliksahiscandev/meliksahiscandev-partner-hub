/* Partner Hub · hosted runtime.
   Provides the same window.claude.use(name) capability API the app uses inside Claude, backed by the Partner Hub server:
   a synced document store (pushed over a WebSocket), accounts, file storage, Claude, downloads and the hosted extras
   (sign out, password, invitations, email, Apify lookups and screenshots). */
(function () {
  'use strict';
  window.__HOSTED__ = true;
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  let redirecting = false;
  function toLogin() {
    if (redirecting) return; redirecting = true;
    location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash));
  }
  function apiErr(j, status) {
    const code = (j && j.code) || (status === 413 ? 'too_large' : status === 429 ? 'rate_limited' : 'unavailable');
    const message = (j && j.message) || ('The server returned an error (' + status + ').');
    return { code, message, friendly: message, status };
  }
  async function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), credentials: 'same-origin', headers: Object.assign({}, opts.headers || {}), signal: opts.signal };
    if (opts.body !== undefined) {
      if (opts.raw) init.body = opts.body;
      else { init.body = JSON.stringify(opts.body); init.headers['content-type'] = 'application/json'; }
    }
    let res;
    try { res = await fetch(path, init); }
    catch (e) {
      if (e && e.name === 'AbortError') throw { code: 'cancelled', message: 'Cancelled' };
      throw { code: 'unavailable', message: 'Connection problem. Check your connection and try again.', friendly: 'Connection problem. Check your connection and try again.' };
    }
    if (res.status === 401 && !opts.noRedirect) { toLogin(); throw { code: 'unauthenticated', friendly: 'Your session ended. Sign in again.' }; }
    if (opts.blob) {
      if (!res.ok) { let j = null; try { j = await res.json(); } catch (e) { } throw apiErr(j, res.status); }
      return res.blob();
    }
    let j = null; try { j = await res.json(); } catch (e) { }
    if (!res.ok) throw apiErr(j, res.status);
    return j;
  }

  /* ---------- session ---------- */
  let meP = null;
  const getMe = () => meP || (meP = api('/api/me').catch(e => { meP = null; throw e; }));

  /* ---------- document store ---------- */
  const LAZY = new Set(['filetext']);
  const docs = new Map(); // path -> { data, version }
  let seq = 0, accessSig = null, firstDone = false, syncing = null, again = false;
  let readyResolve; const ready = new Promise(r => { readyResolve = r; });
  const subs = new Set();
  const colOf = p => p.split('/').slice(0, -1).join('/');

  async function syncOnce() {
    const r = await api('/api/db/sync?since=' + seq);
    const sig = JSON.stringify(r.access || null);
    if (accessSig !== null && sig !== accessSig && seq) { accessSig = sig; seq = 0; docs.clear(); return syncOnce(); }
    accessSig = sig;
    let changed = 0;
    for (const d of r.docs || []) {
      const cur = docs.get(d.path);
      if (d.deleted) { if (cur && !(d.version && cur.version > d.version)) { docs.delete(d.path); changed++; } continue; }
      if (cur && cur.version > d.version) continue;
      if (!cur || cur.version !== d.version) changed++;
      docs.set(d.path, { data: d.data, version: d.version });
    }
    seq = r.seq || seq;
    return changed;
  }
  function sync() {
    if (syncing) { again = true; return syncing; }
    syncing = (async () => {
      try {
        do { again = false; const n = await syncOnce(); if (n || !firstDone) { firstDone = true; readyResolve(); notify(); } } while (again);
      } catch (e) {
        if (e && e.code !== 'unauthenticated') { console.warn('sync failed', e); setTimeout(sync, 4000); }
        if (!firstDone && e && e.code !== 'unauthenticated') { for (const s of subs) if (s.error) try { s.error(e); } catch (x) { } }
      } finally { syncing = null; }
    })();
    return syncing;
  }

  function snapOf(path) {
    const d = docs.get(path);
    const data = d ? clone(d.data) : undefined;
    return { id: path.split('/').pop(), exists: !!d, data: () => clone(data), metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function cmp(x, y) { return x < y ? -1 : x > y ? 1 : 0; }
  function queryDocs(col, q) {
    let list = [];
    for (const [p, d] of docs) if (colOf(p) === col) list.push({ id: p.split('/').pop(), path: p, d });
    for (const [f, op, v] of (q.where || [])) list = list.filter(x => { const val = x.d.data ? x.d.data[f] : undefined; return op === '<' ? val < v : op === '>' ? val > v : op === '==' ? val === v : op === '<=' ? val <= v : op === '>=' ? val >= v : op === '!=' ? val !== v : true; });
    if (q.order) { const [f, dir] = q.order; list.sort((a, b) => cmp((a.d.data || {})[f], (b.d.data || {})[f]) * (dir === 'desc' ? -1 : 1)); }
    else list.sort((a, b) => cmp(a.id, b.id));
    if (q.limit) list = list.slice(0, q.limit);
    return list;
  }
  function qsnap(list) {
    const ds = list.map(x => { const data = clone(x.d.data); return { id: x.id, exists: true, data: () => clone(data), ref: docRef(x.path) }; });
    return { docs: ds, size: ds.length, empty: !ds.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function fire(s) {
    try {
      if (s.kind === 'doc') { const d = docs.get(s.path); const sig = d ? String(d.version) : '-'; if (sig === s.sig) return; s.sig = sig; s.next(snapOf(s.path)); }
      else { const list = queryDocs(s.col, s.q); const sig = list.map(x => x.path + '@' + x.d.version).join('|'); if (sig === s.sig) return; s.sig = sig; s.next(qsnap(list)); }
    } catch (e) { console.error(e); }
  }
  let notifyQueued = false;
  function notify() { if (notifyQueued) return; notifyQueued = true; setTimeout(() => { notifyQueued = false; for (const s of Array.from(subs)) fire(s); }, 0); }

  async function op(kind, path, data) {
    const r = await api('/api/db/op', { body: { op: kind, path, data } });
    if (!LAZY.has(colOf(path))) {
      if (kind === 'delete') docs.delete(path);
      else if (r && r.data !== undefined && r.data !== null) { const cur = docs.get(path); if (!cur || !(cur.version > r.version)) docs.set(path, { data: r.data, version: r.version }); }
      notify();
    }
    return undefined;
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      get: async () => {
        if (LAZY.has(colOf(path))) { const r = await api('/api/db/doc?path=' + encodeURIComponent(path)); const data = r.exists ? r.data : undefined; return { id: path.split('/').pop(), exists: !!r.exists, data: () => clone(data), metadata: { fromCache: false, hasPendingWrites: false } }; }
        await ready; return snapOf(path);
      },
      set: d => op('set', path, d),
      update: d => op('update', path, d),
      delete: () => op('delete', path),
      acquire: async () => ({ acquired: true, version: 1, expiresAt: new Date(Date.now() + 4000).toISOString() }),
      onSnapshot(next, error) { const s = { kind: 'doc', path, next, error, sig: null }; subs.add(s); ready.then(() => fire(s)); return () => subs.delete(s); },
      collection: sub => colRef(path + '/' + sub),
    };
  }
  function colRef(col, q) {
    q = q || {};
    return {
      path: col,
      doc: id => docRef(col + '/' + (id || Math.random().toString(36).slice(2))),
      add: async d => { const r = docRef(col + '/' + Math.random().toString(36).slice(2, 14)); await r.set(d); return r; },
      where: (f, o, v) => colRef(col, Object.assign({}, q, { where: (q.where || []).concat([[f, o, v]]) })),
      orderBy: (f, dir) => colRef(col, Object.assign({}, q, { order: [f, dir || 'asc'] })),
      limit: n => colRef(col, Object.assign({}, q, { limit: n })),
      get: async () => {
        if (LAZY.has(col)) {
          const r = await api('/api/db/list?col=' + encodeURIComponent(col));
          const list = (r.docs || []).map(x => ({ id: x.path.split('/').pop(), path: x.path, d: { data: x.data, version: x.version } }));
          return qsnap(q.limit ? list.slice(0, q.limit) : list);
        }
        await ready; return qsnap(queryDocs(col, q));
      },
      onSnapshot(next, error) { const s = { kind: 'col', col, q, next, error, sig: null }; subs.add(s); ready.then(() => fire(s)); return () => subs.delete(s); },
    };
  }
  const db = { doc: p => docRef(p), collection: p => colRef(p) };

  /* live updates */
  let ws = null, wsTimer = null, backoff = 1000;
  function connect() {
    clearTimeout(wsTimer);
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); }
    catch (e) { scheduleWs(); return; }
    ws.onopen = () => { backoff = 1000; sync(); };
    ws.onmessage = ev => { if (ev.data !== 'pong') sync(); };
    ws.onclose = () => { ws = null; scheduleWs(); };
    ws.onerror = () => { try { ws && ws.close(); } catch (e) { } };
  }
  function scheduleWs() { clearTimeout(wsTimer); wsTimer = setTimeout(connect, backoff); backoff = Math.min(30000, backoff * 2); }
  setInterval(() => { if (ws && ws.readyState === 1) { try { ws.send('ping'); } catch (e) { } } }, 25000);
  setInterval(() => { if (document.visibilityState === 'visible' && (!ws || ws.readyState !== 1)) sync(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('online', () => sync());

  /* ---------- user ---------- */
  const profCache = {};
  const user = {
    me: async () => { const m = await getMe(); return { id: m.id, name: m.name, email: m.email, avatarUrl: '', color: '#4b5d82', isOwner: !!m.isOwner, canEdit: true }; },
    profiles: async ids => {
      ids = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      const need = ids.filter(id => !profCache[id]);
      if (need.length) { try { const r = await api('/api/profiles', { body: { ids: need } }); Object.assign(profCache, r || {}); } catch (e) { } }
      const out = {}; ids.forEach(id => { out[id] = profCache[id] || { id, name: '', email: null, isMe: false, guest: false }; }); return out;
    },
    id: async () => (await getMe()).id, isOwner: async () => !!(await getMe()).isOwner, canEdit: async () => true, can: async () => null,
    name: async () => (await getMe()).name, email: async () => (await getMe()).email, search: async () => [],
  };

  /* ---------- files ---------- */
  const assets = {
    upload: async (blob, opt) => {
      const type = (opt && opt.type) || blob.type || 'application/octet-stream';
      return api('/api/assets', { body: blob, raw: true, headers: { 'x-content-type': type } });
    },
    list: () => api('/api/assets'),
    delete: id => api('/api/assets/' + encodeURIComponent(id), { method: 'DELETE' }),
  };

  /* ---------- Claude ---------- */
  function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(',') + 1)); }; r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
  async function shrinkImage(blob) {
    // Claude reads images up to ~1568px on the long edge; larger ones only cost more and can exceed the 5 MB limit.
    try {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && blob.size < 3.5 * 1048576 && /^image\/(png|jpeg|webp|gif)$/.test(blob.type)) return { media_type: blob.type, data: await blobToB64(blob) };
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      return { media_type: 'image/jpeg', data: await blobToB64(out) };
    } catch (e) { return { media_type: blob.type || 'image/png', data: await blobToB64(blob) }; }
  }
  function parseLoose(text) {
    let t = String(text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) t = fence[1].trim();
    try { return JSON.parse(t); } catch (e) { }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a > -1 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { } }
    throw { code: 'invalid_json', message: 'Claude replied in an unexpected format.' };
  }
  async function callClaude(prompt, opts, asJson) {
    opts = opts || {};
    const images = [];
    for (const im of (opts.images || []).slice(0, 5)) images.push(await shrinkImage(im));
    return api('/api/claude', { body: { prompt, images, json: !!asJson }, signal: opts.signal });
  }
  const sample = Object.assign(async (input, opts) => {
    const prompt = typeof input === 'string' ? input : (input || []).map(m => (m.role === 'assistant' ? 'Assistant: ' : '') + m.content).join('\n\n');
    const r = await callClaude(prompt, opts, false);
    if (opts && opts.onText) { try { opts.onText({ text: r.text, delta: r.text }); } catch (e) { } }
    return { text: r.text, truncated: !!r.truncated, modelTierApplied: 'default', modelApplied: r.model };
  }, {
    limits: async () => ({ maxPromptBytes: 900000, images: { maxCount: 5, maxInputBytes: 20000000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] }, tools: { maxCount: 0 } }),
    json: async (prompt, opts) => { const r = await callClaude(prompt, opts, true); return parseLoose(r.text); },
  });

  /* ---------- downloads ---------- */
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename || 'download'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: 'saved' };
    },
  };

  /* ---------- hosted extras ---------- */
  const hosted = {
    me: getMe,
    logout: async () => { try { await api('/api/logout', { body: {}, noRedirect: true }); } catch (e) { } location.replace('/login'); },
    password: (current, next) => api('/api/password', { body: { current, next } }),
    redeem: code => api('/api/invites/redeem', { body: { code } }),
    accept: id => api('/api/invites/accept', { body: { id } }),
    email: (to, subject, body) => api('/api/email', { body: { to, subject, body } }),
    social: {
      profile: (platform, handle) => api('/api/social/profile', { body: { platform, handle } }),
      profiles: (platform, handles) => api('/api/social/profiles', { body: { platform, handles } }),
      post: url => api('/api/social/post', { body: { url } }),
      capture: url => api('/api/social/capture', { body: { url }, blob: true }),
    },
    resync: () => sync(),
  };

  /* ---------- capability resolution ---------- */
  let started = false;
  async function resolve(name) {
    let me;
    try { me = await getMe(); } catch (e) { return null; }
    if (!started) { started = true; sync(); connect(); }
    const agency = me.access && me.access.type === 'agency';
    switch (name) {
      case 'db': return db;
      case 'user': return user;
      case 'assets': return agency ? assets : null;
      case 'sample': return agency && me.features && me.features.claude ? sample : null;
      case 'downloads': return downloads;
      case 'hosted': return hosted;
      default: return null;
    }
  }
  window.claude = Object.freeze({ use: name => resolve(name) });
})();
