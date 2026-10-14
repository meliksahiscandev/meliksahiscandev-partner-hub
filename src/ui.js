/* ===================== ui: icons, primitives, shell, sign-in ===================== */
const ICONS = {
  plus: 'M12 5v14M5 12h14', out: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10', key: 'M14.5 9.5a4 4 0 1 0-1 2.6L20 18.6V21h-2.5v-1.5H16V18h-1.5l-1-1.5', camera: 'M4 8h3l2-2.5h6L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', check: 'M5 12.5l4.5 4.5L19 7', x: 'M6 6l12 12M18 6L6 18', chev: 'M9 6l6 6-6 6',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14', down: 'M12 4v12M7 11l5 5 5-5M5 20h14', folder: 'M3 6.5h6l2 2h10V19H3z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4', lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z', menu: 'M4 7h16M4 12h16M4 17h16',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  comment: 'M4 5h16v11H9l-5 4z', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4', ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6', stop: 'M7 7h10v10H7z',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', pulse: 'M3 12h4l3-7 4 14 3-7h4', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M18 21v-1a6 6 0 0 0-3-5.2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9.5h4.5a2 2 0 0 1 0 4H9M11 8v8',
  restore: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5', db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1', mail: 'M3 5h18v14H3zM3 6l9 7 9-7', alert: 'M12 3l10 18H2zM12 10v5M12 18v.5', archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
};
function Icon({ n, s }) { s = s || 16; return html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d=${ICONS[n] || ''}></path></svg>`; }
function Plat({ p, t }) { return html`<span className=${'plat plat-' + p}>${PLATFORMS[p] ? PLATFORMS[p].short : p}${t ? html`<span className="pt">${TYPE_LABEL[t] || t}</span>` : null}</span>`; }
function Badge({ cls, children, nodot }) { return html`<span className=${'badge ' + (cls || '') + (nodot ? ' nodot' : '')}>${children}</span>`; }
function Avatar({ src, name, cls }) { const ini = String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'; return src ? html`<img className=${cls || ''} src=${src} alt=/>` : html`<span className=${'av ' + (cls || '')} aria-hidden="true">${ini}</span>`; }
function Spin() { return html`<span className="spin" aria-hidden="true"></span>`; }
function Card({ title, sub, actions, children, flush, id }) {
  return html`<section className="card" id=${id}>${title || actions ? html`<div className="card-head"><div>${typeof title === 'string' ? html`<h2>${title}</h2>` : title}${sub ? html`<div className="sub">${sub}</div>` : null}</div>${actions ? html`<div className="row">${actions}</div>` : null}</div>` : null}<div className=${'card-body' + (flush ? ' flush' : '')}>${children}</div></section>`;
}
function PageHead({ eyebrow, title, meta, actions }) {
  return html`<header className="page-head"><div style=${{ minWidth: 0 }}>${eyebrow ? html`<div className="eyebrow">${eyebrow}</div>` : null}<h1 style=${{ marginTop: eyebrow ? '4px' : 0 }}>${title}</h1>${meta ? html`<div className="meta">${meta}</div>` : null}</div>${actions ? html`<div className="row">${actions}</div>` : null}</header>`;
}
function Empty({ title, children, action }) { return html`<div className="empty">${title ? html`<h3>${title}</h3>` : null}${children ? html`<p>${children}</p>` : null}${action || null}</div>`; }
function Kpi({ l, v, s, cls, onClick }) { return onClick ? html`<button className=${'kpi click ' + (cls || '')} onClick=${onClick}><span className="l">${l}</span><span className="v">${v}</span>${s ? html`<span className="s">${s}</span>` : null}</button>` : html`<div className=${'kpi ' + (cls || '')}><span className="l">${l}</span><span className="v">${v}</span>${s ? html`<span className="s">${s}</span>` : null}</div>`; }

const Ctx = React.createContext(null);
const useCtx = () => React.useContext(Ctx);
const VIEWS = ['home', 'partnerships', 'dashboards', 'activity', 'files', 'team', 'finance', 'settings'];
function readHash() {
  try { const h = (location.hash || '').slice(1); const parts = h.split('.'); if (parts[0] === 'p' && parts[1]) return { view: 'partnership', id: parts[1], tab: parts[2] }; if (parts[0] === 'j' && parts[1]) return { view: 'project', id: parts[1], tab: parts[2] }; if (parts[0] === 'd' && parts[1]) return { view: 'dashboards', id: parts[1] }; if (VIEWS.includes(parts[0])) return { view: parts[0] }; } catch (e) { }
  return { view: 'home' };
}
function writeHash(r) { try { const h = r.view === 'partnership' ? 'p.' + r.id + (r.tab ? '.' + r.tab : '') : r.view === 'project' ? 'j.' + r.id + (r.tab ? '.' + r.tab : '') : r.view === 'dashboards' && r.id ? 'd.' + r.id : r.view === 'home' ? '' : r.view; history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { } }

/* ---------- modal & feedback ---------- */
function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return html`<div className="modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div className="modal-head"><h2>${title}</h2><button className="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} n="x"/></button></div>
      <div className="modal-body">${children}</div>
      ${footer ? html`<div className="modal-foot">${footer}</div>` : null}
    </div></div>`;
}
function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, typeToConfirm }) {
  const { closeModal } = useCtx(); const [busy, setBusy] = useState(false); const [typed, setTyped] = useState('');
  const blocked = typeToConfirm && typed.trim() !== typeToConfirm;
  const go = async () => { setBusy(true); const ok = await act(onConfirm); if (ok !== false) closeModal(); else setBusy(false); };
  return html`<${Modal} title=${title} onClose=${closeModal} footer=${html`<${Fragment}><button className="btn" onClick=${closeModal}>Cancel</button><button className=${'btn ' + (danger ? 'btn-danger' : 'btn-primary')} disabled=${busy || blocked} onClick=${go}>${busy ? html`<${Spin}/> Working…` : (confirmLabel || 'Confirm')}</button><//>`}>
    <p className="t2">${body}</p>
    ${typeToConfirm ? html`<label className="field"><span>Type <span className="mono">${typeToConfirm}</span> to confirm</span><input className="input" id="confirm-type" value=${typed} onChange=${e => setTyped(e.target.value)}/></label>` : null}
  <//>`;
}
function ImageModal({ src, name }) { const { closeModal } = useCtx(); return html`<${Modal} title=${name || 'Screenshot'} onClose=${closeModal} wide=${true}><div className="lightbox"><img src=${src} alt=${name || 'Screenshot'}/></div><//>`; }
function Toasts() { const s = useStore(); return html`<div className="toasts" role="status" aria-live="polite">${s.toasts.map(t => html`<div key=${t.id} className=${'toast ' + (t.kind || '')}>${t.msg}</div>`)}</div>`; }
function Tabs({ tabs, value, onChange }) {
  return html`<div className="tabs" role="tablist">${tabs.map(t => html`<button key=${t.key} role="tab" aria-selected=${value === t.key} className=${'tab' + (value === t.key ? ' on' : '')} onClick=${() => onChange(t.key)}>${t.step ? html`<span className="st">${t.step}</span>` : null}${t.label}${t.count ? html`<span className=${'n' + (t.hot ? ' hot' : '')}>${t.count}</span>` : null}</button>`)}</div>`;
}
function FileButton({ label, accept, multiple, onFiles, cls, icon, disabled }) {
  const ref = useRef(null);
  return html`<${Fragment}><button className=${'btn ' + (cls || '')} disabled=${disabled} onClick=${() => ref.current && ref.current.click()}>${icon !== false ? html`<${Icon} n=${icon || 'upload'} s=${15}/>` : null}${label}</button><input ref=${ref} type="file" hidden=${true} accept=${accept} multiple=${!!multiple} onChange=${e => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) onFiles(fs); }}/><//>`;
}
function MiniTrack({ m }) { return html`<div className="mini" title=${'Overall ' + Math.round(m.overall * 100) + '%'}>${m.stages.map(st => html`<span key=${st.key} className=${'mini-seg' + (st.pct >= 1 ? ' done' : '')} title=${st.label + ': ' + Math.round(st.pct * 100) + '%'}><i style=${{ width: (st.pct * 100) + '%' }}></i></span>`)}</div>`; }
function copyText(t) {
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Select the text and copy it.', 'warn'); } ta.remove(); };
  try { navigator.clipboard.writeText(t).then(() => toast('Copied'), fallback); } catch (e) { fallback(); }
}
function Comments({ comments, canResolve, onResolve }) {
  const list = cmtList(comments);
  usePeople(list.map(c => c.by).concat(list.map(c => c.resolvedBy)));
  if (!list.length) return null;
  return html`<div className="thread">${list.map(c => html`<div key=${c.id} className=${'cmt ' + (c.kind || '') + (c.resolved ? ' resolved' : '')}>
    <div className="c-meta"><span className="who">${personName(c.by)}</span><${Badge} cls=${c.role === 'customer' ? 'warn' : 'primary'} nodot=${true}>${roleText(c.role)}<//><span>${fmtWhen(c.at)}</span>${c.round ? html`<span className="mono">R${c.round}</span>` : null}
      ${c.kind === 'change' ? (c.resolved ? html`<${Badge} cls="ok">Resolved${c.resolvedBy ? ' by ' + personName(c.resolvedBy) : ''}<//>` : html`<${Badge} cls="crit">Open<//>`) : null}
      ${c.kind === 'change' && !c.resolved && canResolve ? html`<button className="btn btn-sm" onClick=${() => onResolve(c.id)}><${Icon} n="check" s=${13}/>Mark resolved</button>` : null}</div>
    <div className="c-text">${c.text}</div></div>`)}</div>`;
}
function CommentBox({ placeholder, label, onSubmit, onCancel }) {
  const [t, setT] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { if (!t.trim()) return; setBusy(true); const ok = await act(() => onSubmit(t.trim())); setBusy(false); if (ok !== false) { setT(''); onCancel && onCancel(); } };
  return html`<div className="stack s8"><textarea className="input" value=${t} onChange=${e => setT(e.target.value)} placeholder=${placeholder || 'Write a comment'} aria-label=${placeholder || 'Comment'}></textarea>
    <div className="row"><button className="btn btn-primary btn-sm" disabled=${busy || !t.trim()} onClick=${go}>${busy ? 'Sending…' : (label || 'Send comment')}</button>${onCancel ? html`<button className="btn btn-ghost btn-sm" onClick=${onCancel}>Cancel</button>` : null}</div></div>`;
}

/* ---------- shell ---------- */
function App() {
  const s = useStore();
  const [route, setRoute] = useState(readHash);
  const [modal, setModal] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const role = getRole(s);
  currentRole = role;
  const go = useCallback(r => { setRoute(r); setNavOpen(false); setModal(null); writeHash(r); try { window.scrollTo(0, 0); } catch (e) { } }, []);
  const openModal = useCallback((type, props) => setModal({ type, props: props || {} }), []);
  const closeModal = useCallback(() => setModal(null), []);
  useEffect(() => { const h = () => { setRoute(readHash()); setModal(null); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const ctx = { s, role, route, go, openModal, closeModal };
  const gated = role.status !== 'ok';
  return html`<${Ctx.Provider} value=${ctx}>
    <div className=${'app' + (navOpen ? ' nav-open' : '')}>
      <${Sidebar}/>
      <div className="main">
        <${Topbar} onMenu=${() => setNavOpen(v => !v)}/>
        <main className="page" id="main">${gated ? html`<${Gate}/>` : html`<${Router}/>`}</main>
      </div>
      <div className="scrim" onClick=${() => setNavOpen(false)}></div>
    </div>
    <${ModalHost} modal=${modal}/>
    <${Toasts}/>
  <//>`;
}
function Router() {
  const { route, role } = useCtx();
  const v = route.view;
  if (v === 'partnership') return html`<${PartnershipView} key=${route.id} id=${route.id} tab=${route.tab || 'overview'}/>`;
  if (v === 'project') return html`<${ProjectView} key=${route.id} id=${route.id} tab=${route.tab || 'masterfile'}/>`;
  if (v === 'partnerships') return html`<${PartnershipsPage}/>`;
  if (v === 'dashboards') return route.id && route.id.indexOf('i-') === 0 ? html`<${CreatorDashboard} key=${route.id} infId=${route.id.slice(2)}/>` : html`<${DashboardsPage} key=${route.id || 'all'} id=${route.id || null}/>`;
  if (v === 'activity') return html`<${ActivityPage}/>`;
  if (v === 'files') return html`<${FilesPage}/>`;
  if (v === 'team' && role.isAdmin) return html`<${TeamPage}/>`;
  if (v === 'finance' && role.canFinance) return html`<${FinancePage}/>`;
  if (v === 'settings' && role.isAdmin) return html`<${SettingsPage}/>`;
  return html`<${Overview}/>`;
}
function Sidebar() {
  const { s, role, route, go, openModal } = useCtx();
  const ok = role.status === 'ok';
  const parts = ok ? visibleParts(s, role) : [];
  const agency = accountName('agency');
  const initials = agency.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const activeP = route.view === 'partnership' ? route.id : route.view === 'project' ? ((s.projects.find(x => x.id === route.id) || {}).partnershipId) : null;
  const nb = (key, label, icon, extra) => html`<button className=${'nav-btn' + (route.view === key ? ' on' : '')} onClick=${() => go({ view: key })}><${Icon} n=${icon} s=${15}/><span className="t">${label}</span>${extra || null}</button>`;
  const pendingInv = s.invites.filter(i => i.status === 'pending' && i.accountType === 'agency').length;
  return html`<aside className="side" aria-label="Workspace navigation">
    <div className="ws"><div className="ws-mark" aria-hidden="true">${initials}</div><div style=${{ minWidth: 0 }}><div className="ws-name">${agency}</div><div className="ws-sub">Partner Hub <span className="ws-tier">Enterprise</span></div></div></div>
    ${ok ? html`<nav className="nav">
      ${nb('home', 'Overview', 'home')}
      ${nb('partnerships', role.asCustomer ? 'My partnerships' : 'Partnerships', 'layers', html`<span className="cnt">${parts.length}</span>`)}
      ${parts.length ? html`<div className="nav-sub">${parts.map(p => { const ms = msaState(p); const prs = projectsOf(s, p.id); return html`<div key=${p.id}>
        <button className=${'nav-btn' + (route.view === 'partnership' && route.id === p.id ? ' on' : '')} onClick=${() => go({ view: 'partnership', id: p.id })}><span className=${'ndot ' + (ms.pending.length || !ms.list.length ? 'crit' : 'ok')} title=${ms.pending.length || !ms.list.length ? 'Master agreement missing' : 'Master agreement uploaded'}></span><span className="t">${p.name}</span></button>
        ${activeP === p.id && prs.length ? html`<div className="nav-sub">${prs.map(pr => html`<button key=${pr.id} className=${'nav-btn' + (route.view === 'project' && route.id === pr.id ? ' on' : '')} onClick=${() => go({ view: 'project', id: pr.id })}><span className="t">${pr.name}</span></button>`)}</div>` : null}</div>`; })}</div>` : null}
      ${nb('dashboards', 'Dashboards', 'chart')}
      ${ok ? (() => { const pids = new Set(parts.map(p => p.id)); const dprs = s.projects.filter(pr => isActive(pr) && pids.has(pr.partnershipId)).sort(byCreated); if (!dprs.length) return null; const dsel = route.view === 'dashboards' ? (route.id || 'all') : null; const db = (key, label, sub) => html`<button key=${key} className=${'nav-btn' + (dsel === key ? ' on' : '')} onClick=${() => go({ view: 'dashboards', id: key === 'all' ? null : key })}><span className="t">${label}${sub ? html`<span className="nav-meta">${sub}</span>` : null}</span></button>`;
        return html`<div className="nav-sub">${db('all', 'All projects', null)}${parts.map(p => { const ps = dprs.filter(pr => pr.partnershipId === p.id); return ps.length ? html`<${Fragment} key=${p.id}>${parts.length > 1 ? db('p-' + p.id, p.name, 'all projects') : null}${ps.map(pr => db('j-' + pr.id, pr.name, parts.length > 1 ? p.name : null))}<//>` : null; })}</div>`; })() : null}
      <div className="nav-group">Operations</div>
      ${nb('activity', 'Activity log', 'pulse', s.outboxN ? html`<span className="cnt hot" title="Events waiting to sync">${s.outboxN}</span>` : null)}
      ${nb('files', 'Files & storage', 'db')}
      ${role.isAdmin ? html`<${Fragment}><div className="nav-group">Administration</div>
        ${nb('team', 'Team & access', 'users', pendingInv ? html`<span className="cnt">${pendingInv}</span>` : null)}
        ${role.canFinance ? nb('finance', 'Finance', 'coin') : null}
        ${nb('settings', 'Settings & backup', 'gear')}<//>` : null}
    </nav>` : html`<div className="small" style=${{ padding: '0 6px' }}>${role.status === 'loading' ? 'Connecting…' : 'Sign in to continue'}</div>`}
    <div className="side-foot">
      ${s.me.id ? html`<div className="me"><${Avatar} src=${s.me.avatar} name=${s.me.name}/><div style=${{ minWidth: 0, flex: 1 }}><div className="n">${s.me.name || 'You'}</div><div className="r">${role.status === 'ok' ? role.label : 'Not joined'}</div></div>
        ${CAP.hosted ? html`<div className="row nw" style=${{ gap: '2px' }}><button className="icon-btn side-ib" aria-label="Change password" title="Change password" onClick=${() => openModal('password')}><${Icon} n="key" s=${15}/></button><button className="icon-btn side-ib" aria-label="Sign out" title="Sign out" onClick=${() => CAP.hosted.logout()}><${Icon} n="out" s=${15}/></button></div>` : null}</div>` : null}
      ${role.isAgency ? html`<label className="switch"><span>Preview as customer</span><input type="checkbox" checked=${!!s.ui.previewCustomer} onChange=${e => { store.ui = Object.assign({}, store.ui, { previewCustomer: e.target.checked }); emit(); }}/></label>` : null}
    </div>
  </aside>`;
}
function Topbar({ onMenu }) {
  const { s, role, route, go } = useCtx();
  const crumbs = [];
  const label = { home: 'Overview', partnerships: 'Partnerships', dashboards: 'Dashboards', activity: 'Activity log', files: 'Files & storage', team: 'Team & access', finance: 'Finance', settings: 'Settings & backup' };
  if (route.view === 'partnership' || route.view === 'project') {
    const pr = route.view === 'project' ? s.projects.find(x => x.id === route.id) : null;
    const p = partnerOf(s, pr ? pr.partnershipId : route.id);
    crumbs.push({ label: 'Partnerships', r: { view: 'partnerships' } });
    if (p) crumbs.push({ label: p.name, r: pr ? { view: 'partnership', id: p.id } : null });
    if (pr) crumbs.push({ label: pr.name, r: null });
  } else crumbs.push({ label: label[route.view] || 'Overview', r: null });
  return html`<div className="topbar">
    <button className="icon-btn menu-btn" onClick=${onMenu} aria-label="Open navigation"><${Icon} n="menu" s=${20}/></button>
    <nav className="crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => html`<${Fragment} key=${i}>${i ? html`<${Icon} n="chev" s=${12}/>` : null}${c.r ? html`<button onClick=${() => go(c.r)}>${c.label}</button>` : html`<span className="cur">${c.label}</span>`}<//>`)}</nav>
    <div className="spacer"></div>
    ${role.status === 'ok' ? html`<${SearchBox}/>` : null}
    ${role.preview ? html`<${Badge} cls="warn">Customer preview<//>` : null}
    ${role.viewOnly ? html`<span className="badge neutral" id="view-only" title="An admin can give you edit access in Team & access.">View only</span>` : null}
    ${s.phase === 'connecting' ? html`<span className="t3 small row nw"><${Spin}/> Connecting</span>` : null}
  </div>`;
}
function SearchBox() {
  const { s, role, go } = useCtx();
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [sel, setSel] = useState(0);
  const ref = useRef(null);
  useEffect(() => { const k = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current && ref.current.focus(); setOpen(true); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
  const res = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const parts = visibleParts(s, role); const pids = new Set(parts.map(p => p.id)); const out = [];
    parts.forEach(p => { if (p.name.toLowerCase().includes(t)) out.push({ k: 'Partnership', v: p.name, r: { view: 'partnership', id: p.id } }); msaList(p).forEach(m => brandList(m).forEach(b => { if (b.name.toLowerCase().includes(t)) out.push({ k: 'Brand', v: b.name + ' · ' + p.name, r: { view: 'partnership', id: p.id, tab: 'agreements' } }); })); });
    s.projects.filter(pr => pids.has(pr.partnershipId) && isActive(pr)).forEach(pr => { if (pr.name.toLowerCase().includes(t)) out.push({ k: 'Project', v: pr.name, r: { view: 'project', id: pr.id } }); });
    s.influencers.filter(i => !i.removed && pids.has(i.partnershipId)).forEach(i => { const hs = enabledPlats(i).map(k => i.platforms[k].handle || ''); if (i.name.toLowerCase().includes(t) || hs.some(h => h.toLowerCase().includes(t))) out.push({ k: 'Creator', v: i.name + (hs.length ? ' · @' + hs[0] : ''), r: { view: 'project', id: i.projectId, tab: 'masterfile' } }); });
    s.files.filter(f => f.status === 'active' && (role.isAgency ? true : pids.has(f.partnershipId))).forEach(f => { if (String(f.name).toLowerCase().includes(t) || String(f.sha256 || '').startsWith(t)) out.push({ k: 'File', v: f.name, r: f.partnershipId ? { view: 'partnership', id: f.partnershipId, tab: 'files' } : { view: 'files' } }); });
    if (role.canAgency) s.invites.forEach(i => { if (i.email.includes(t)) out.push({ k: 'Member', v: i.email + ' · ' + accountName(i.accountType, i.accountId), r: i.accountType === 'agency' ? { view: 'team' } : { view: 'partnership', id: i.accountId, tab: 'members' } }); });
    return out.slice(0, 14);
  }, [q, s.partnerships, s.projects, s.influencers, s.files, s.invites, role.status, role.isCustomer]);
  const pick = r => { setQ(''); setOpen(false); go(r.r); };
  return html`<div className="search" onBlur=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => setOpen(false), 120); }}>
    <span className="s-ico"><${Icon} n="search" s=${15}/></span>
    <input ref=${ref} id="global-search" value=${q} placeholder="Search partnerships, creators, files…" aria-label="Search" onFocus=${() => setOpen(true)} onChange=${e => { setQ(e.target.value); setSel(0); setOpen(true); }}
      onKeyDown=${e => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(x => Math.min(res.length - 1, x + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(x => Math.max(0, x - 1)); } else if (e.key === 'Enter' && res[sel]) pick(res[sel]); else if (e.key === 'Escape') { setOpen(false); e.target.blur(); } }}/>
    <kbd>⌘K</kbd>
    ${open && q.trim().length >= 2 ? html`<div className="search-res" role="listbox">${res.length ? res.map((r, i) => html`<button key=${i} className=${'sr-item' + (i === sel ? ' on' : '')} onMouseDown=${e => e.preventDefault()} onClick=${() => pick(r)}><span className="k">${r.k}</span><span className="v">${r.v}</span></button>`) : html`<div className="t3 small" style=${{ padding: '8px' }}>No matches</div>`}</div>` : null}
  </div>`;
}

/* ---------- gates: loading, offline, signed out, join ---------- */
function Gate() {
  const { role } = useCtx();
  if (role.status === 'offline') return HOSTED ? html`<${Empty} title="Can't reach Partner Hub" action=${html`<button className="btn" onClick=${() => location.reload()}>Reload</button>`}>The server did not answer. Check your connection and reload the page.<//>` : html`<${Empty} title="This view can't reach the shared workspace">Open the page inside Claude while signed in. Partnerships, approvals, files and logs are stored in the workspace and load from there.<//>`;
  if (role.status === 'signedout' && HOSTED) return html`<div className="gate"><div className="gate-card"><h1>Sign in to continue</h1><p className="t2">Your session ended.</p><div><a className="btn btn-primary" href="/login">Sign in</a></div></div></div>`;
  if (role.status === 'signedout') return html`<div className="gate"><div className="gate-card"><h1>Sign in to continue</h1><p className="t2">Sign in to Claude, then reopen this page. Access is tied to your verified account email.</p></div></div>`;
  if (role.status === 'join') return html`<${Join}/>`;
  return html`<div className="gate"><div className="t3 row"><${Spin}/> Loading workspace…</div></div>`;
}
function Join() {
  const { s, role } = useCtx();
  const email = s.me.email;
  const mine = email ? s.invites.filter(i => i.email === email && (i.status === 'pending' || (i.status === 'accepted' && i.acceptedBy === s.me.id))) : [];
  const [type, setType] = useState(() => (mine.find(i => i.accountType === 'agency') ? 'agency' : 'customer'));
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const agency = accountName('agency');
  const list = mine.filter(i => (HOSTED || i.accountType === type) && (i.accountType === 'agency' || HOSTED || (partnerOf(s, i.accountId) && isActive(partnerOf(s, i.accountId)))));
  const join = async (inv, via) => {
    setBusy(true);
    if (HOSTED) { const ok = await act(() => CAP.hosted.accept(inv.id)); if (ok === false) { setBusy(false); return; } toast('Welcome to ' + accountName(inv.accountType, inv.accountId)); setTimeout(() => location.reload(), 400); return; }
    const ok = await act(() => acceptInvite(inv, via), 'Welcome to ' + accountName(inv.accountType, inv.accountId)); if (ok === false) setBusy(false);
  };
  const useCode = async () => {
    setBusy(true);
    if (HOSTED) { const ok = await act(() => CAP.hosted.redeem(code)); if (ok === false) { setBusy(false); return; } toast('Invitation accepted'); setTimeout(() => location.reload(), 400); return; }
    const inv = await findInviteByCode(code, type);
    if (!inv) { setBusy(false); toast('That code does not match an open ' + (type === 'agency' ? 'agency' : 'customer') + ' invitation.', 'crit'); return; }
    if (email && inv.email !== email) { setBusy(false); toast('This invitation was sent to ' + inv.email + ', but you are signed in as ' + email + '. Sign in with the invited account.', 'crit'); return; }
    await join(inv, 'code');
  };
  return html`<div className="gate"><div className="gate-card">
    <div><div className="eyebrow">${agency} · Partner Hub</div><h1 style=${{ marginTop: '6px' }}>${HOSTED ? 'Join a workspace' : 'Sign in'}</h1><p className="t2" style=${{ marginTop: '4px' }}>${HOSTED ? 'Your account is not linked to the agency or a partner account yet. Join an invitation below, or enter the one-time code from your invitation email.' : 'Access is by invitation. Enter the one-time code from the invitation email that was sent to your address.'}</p></div>
    <div className="ident"><${Avatar} src=${s.me.avatar} name=${s.me.name}/><div style=${{ minWidth: 0, flex: 1 }}><div style=${{ fontWeight: 500 }}>${s.me.name || 'Signed in'}</div><div className="small t3">${email ? html`<span className="mono">${email}</span>${HOSTED ? ' · signed in' : ' · verified by Claude'}` : 'Signed in with Claude. Your invitation code confirms your email address.'}</div></div>${CAP.hosted ? html`<button className="btn btn-sm" onClick=${() => CAP.hosted.logout()}><${Icon} n="out" s=${14}/>Sign out</button>` : null}</div>
    ${role.access && role.access.hadAccess ? html`<div className="banner warn"><div className="b-body">Your previous access was removed or the account was closed. Ask your admin for a new invitation.</div></div>` : null}
    ${HOSTED ? null : html`<div className="roles" role="radiogroup" aria-label="Account type">
      <button className="rolec" role="radio" aria-pressed=${type === 'agency'} aria-checked=${type === 'agency'} onClick=${() => setType('agency')}><span className="rt">Agency</span><span className="rd">${agency} team. Partnerships, masterfiles, content and delivery.</span></button>
      <button className="rolec" role="radio" aria-pressed=${type === 'customer'} aria-checked=${type === 'customer'} onClick=${() => setType('customer')}><span className="rt">Customer</span><span className="rd">Brand or partner company. Approvals, progress and results.</span></button>
    </div>`}
    ${list.length ? html`<div className="stack s8"><div className="eyebrow">Invitations for ${email}</div>${list.map(i => html`<div key=${i.id} className="between sub-card" style=${{ flexDirection: 'row' }}><div><div style=${{ fontWeight: 600 }}>${i.accountType === 'customer' && i.accountName ? i.accountName : accountName(i.accountType, i.accountId)}</div><div className="small t3">${roleName(i.accountType, i)} · invited ${fmtDate(i.createdAt)}</div></div><button className="btn btn-primary" disabled=${busy} onClick=${() => join(i, 'email')}>${i.status === 'accepted' ? 'Rejoin' : 'Join'}</button></div>`)}</div>`
      : html`<p className="t2 small">${email ? 'No ' + (HOSTED ? '' : type + ' ') + 'invitation is waiting for ' + email + '.' : ''} If you received an invitation code, enter it below.</p>`}
    <div className="stack s8"><label className="field"><span>Invitation code</span><div className="row nw"><input className="input mono" id="join-code" value=${code} placeholder="XXXXX-XXXXX" onChange=${e => setCode(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') useCode(); }} style=${{ letterSpacing: '.08em' }}/><button className="btn" disabled=${busy || normCode(code).length < 8} onClick=${useCode}>Verify & join</button></div><small>The code is in the invitation email. It works once and only for the address it was sent to.</small></label></div>
  </div></div>`;
}
