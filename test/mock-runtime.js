// Mock of the claude.ai artifact runtime (db with rules, user, assets, sample, downloads) for end-to-end tests.
(function () {
  const me = JSON.parse(localStorage.getItem('mockme') || 'null');
  const people = JSON.parse(localStorage.getItem('mockpeople') || '{}');
  const flags = JSON.parse(localStorage.getItem('mockflags') || '{}');
  window.__sampleCalls = []; window.__downloads = []; window.__dbWrites = 0;
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const KEY = 'mockdb';
  let data = JSON.parse(localStorage.getItem(KEY) || '{}');
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const listeners = new Set();
  let pending = false;
  const notify = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; for (const l of Array.from(listeners)) { try { l(); } catch (e) { console.error(e); } } }, 5); };
  const isOwner = () => !!(me && me.isOwner);
  const canRead = p => !(p.startsWith('finance/') && !isOwner());
  const canWrite = p => {
    if (!me || me.viewOnly) return false;
    if (p.startsWith('finance/') && !isOwner()) return false;
    if (p.startsWith('members/') && !isOwner() && p !== 'members/' + me.id) return false;
    if (p.startsWith('audit/') && window.__auditOffline) return false;
    return true;
  };
  const deny = () => Promise.reject({ code: 'invalid_argument', message: 'write refused' });
  function deepMerge(a, b) {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b)) { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v); else out[k] = clone(v); }
    return out;
  }
  const size = o => JSON.stringify(o).length;
  function snap(p) { const ex = !!data[p] && canRead(p); const d = ex ? clone(data[p]) : undefined; return { id: p.split('/').pop(), exists: ex, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function docRef(p) {
    if (p.split('/').length % 2) throw new TypeError('bad doc path ' + p);
    return {
      id: p.split('/').pop(), path: p,
      get: async () => snap(p),
      set: async d => { if (!canWrite(p)) return deny(); if (size(d) > 256 * 1024) return deny(); data[p] = clone(d); save(); window.__dbWrites++; notify(); },
      update: async d => { if (!canWrite(p) || !data[p]) return deny(); const m = deepMerge(data[p], d); if (size(m) > 256 * 1024) return deny(); data[p] = m; save(); window.__dbWrites++; notify(); },
      delete: async () => { if (!canWrite(p)) return deny(); delete data[p]; save(); notify(); },
      acquire: async () => ({ acquired: true, version: 1, expiresAt: new Date(Date.now() + 4000).toISOString() }),
      onSnapshot(next) { const l = () => next(snap(p)); listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); },
      collection: sub => colRef(p + '/' + sub),
    };
  }
  function colRef(cp, q) {
    q = q || {};
    const seg = cp.split('/').length;
    const docs = () => {
      let ds = Object.keys(data).filter(p => p.startsWith(cp + '/') && p.split('/').length === seg + 1 && canRead(p)).map(snap);
      for (const [f, op, v] of (q.where || [])) ds = ds.filter(s => { const x = s.data()[f]; return op === '<' ? x < v : op === '>' ? x > v : op === '==' ? x === v : op === '<=' ? x <= v : op === '>=' ? x >= v : true; });
      if (q.order) { const [f, dir] = q.order; ds.sort((a, b) => { const x = a.data()[f], y = b.data()[f]; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); }); } else ds.sort((a, b) => a.id < b.id ? -1 : 1);
      if (q.limit) ds = ds.slice(0, q.limit);
      return ds;
    };
    const qs = ds => ({ docs: ds, size: ds.length, empty: !ds.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
    return {
      path: cp,
      doc: id => docRef(cp + '/' + (id || Math.random().toString(36).slice(2))),
      add: async d => { const r = docRef(cp + '/' + Math.random().toString(36).slice(2)); await r.set(d); return r; },
      where: (f, op, v) => colRef(cp, Object.assign({}, q, { where: (q.where || []).concat([[f, op, v]]) })),
      orderBy: (f, dir) => colRef(cp, Object.assign({}, q, { order: [f, dir || 'asc'] })),
      limit: n => colRef(cp, Object.assign({}, q, { limit: n })),
      get: async () => qs(docs()),
      onSnapshot(next) { const l = () => next(qs(docs())); listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); },
    };
  }
  const db = { doc: p => docRef(p), collection: p => colRef(p) };
  const avatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#8899aa"/></svg>');
  const user = me ? {
    me: async () => ({ id: me.id, name: me.name, email: me.emailHidden ? null : me.email, avatarUrl: avatar, color: '#889', isOwner: !!me.isOwner, canEdit: true }),
    profiles: async ids => { const out = {}; (Array.isArray(ids) ? ids : [ids]).forEach(id => { const p = people[id]; out[id] = { id, name: p ? p.name : '', email: p && !p.emailHidden ? p.email : null, avatarUrl: avatar, color: '#889', isMe: id === me.id, guest: !!(p && p.guest) }; }); return out; },
    id: async () => me.id, isOwner: async () => !!me.isOwner, canEdit: async () => true, can: async () => null, name: async () => me.name, email: async () => me.email, search: async () => [],
  } : null;
  const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'application/json', 'text/csv', 'text/plain', 'text/markdown'];
  const assets = (me && !me.viewOnly) ? {
    upload: async (blob, opt) => {
      const type = (opt && opt.type) || blob.type;
      if (!ACCEPT.includes(type)) throw { code: 'unsupported_type', message: type };
      if (blob.size > 20 * 1048576) throw { code: 'too_large', message: 'big' };
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      await window.__putBlob(id, btoa(bin), type, window.__corruptNext ? 1 : 0);
      if (window.__corruptNext) window.__corruptNext--;
      return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: type };
    },
    list: async () => { const l = JSON.parse(await window.__listBlobs()); return { assets: l, usage: { files: l.length, bytes: l.reduce((t, a) => t + a.sizeBytes, 0), maxFiles: 5000, maxBytes: 1073741824 } }; },
    delete: async id => ({ deleted: !!(await window.__delBlob(id)) }),
  } : null;
  const sample = me ? Object.assign(async () => ({ text: 'ok', truncated: false, modelTierApplied: 'default' }), {
    limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 20000000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] }, tools: { maxCount: 8 } }),
    json: async (prompt, opts) => {
      window.__sampleCalls.push({ prompt, images: opts && opts.images ? opts.images.length : 0 });
      await new Promise(r => setTimeout(r, 30));
      if (/summarize the partnership/.test(prompt)) {
        return { headline: 'Vaseline and Elidor summer campaign with nano and micro creators', overview: 'Debrief asks for Reels and Stories.' + (prompt.includes('DEBRIEF-MARKER') ? ' Marker seen.' : ' Marker missing.'), objectives: ['Awareness', 'Trial'], audience: 'Women 18-34', key_messages: ['Glow all summer'], deliverables: ['20 Reels'], timeline: 'June-August', kpis: ['2M views'], budget: '1.250.000 TL', mandatories: ['#reklam'], restrictions: ['No competitor brands'], open_questions: ['Usage rights period?'], documents: [{ name: 'debrief.pdf', summary: 'Client debrief' }] };
      }
      if (/performance reports/.test(prompt)) {
        const ids = Array.from(prompt.matchAll(/- id ([a-z0-9]+) \|/g)).map(m => m[1]);
        return { items: ids.map((id, i) => ({ assignmentId: id, views: 120000 + i * 1000, reach: 90000, impressions: null, likes: '5,4B', comments: 210, shares: 80, saves: 150, er: null, note: 'from sheet' })) };
      }
      return {};
    },
  }) : null;
  const downloads = me ? { save: async ({ filename, data }) => { let text = null; if (typeof data === 'string') text = data; else if (data instanceof Blob) text = '[blob ' + data.size + ']'; window.__downloads.push({ filename, text, size: typeof data === 'string' ? data.length : data.size }); return { status: 'saved' }; } } : null;
  window.__mcpCalls = [];
  const mcp = me ? { callTool: async (server, tool, input) => { if (window.__mcpFail) throw { code: window.__mcpFail, message: 'x' }; window.__mcpCalls.push({ server, tool, input }); return { content: [{ type: 'text', text: '{"id":"m1"}' }], payload: { id: 'm1' } }; }, listTools: async () => ({ servers: [{ server: 'Gmail', authStatus: 'connected', tools: [{ name: 'send_message', description: '' }] }] }) } : null;
  const caps = { db: me ? db : null, user, assets, sample, downloads, mcp };
  window.claude = { use: name => new Promise(r => setTimeout(() => r(caps[name] || null), 20)) };
  window.__mockdb = { get: () => data, set: d => { data = d; save(); notify(); } };
})();
