/* ===================== workspace pages ===================== */
function attention(s, role) {
  const parts = visibleParts(s, role); const items = [];
  let msaMissing = 0, firstMsa = null; const acc = { pend: 0, rev: 0, chg: 0, post: 0, data: 0 }; const first = {};
  for (const p of parts) {
    const ms = msaState(p); if (!ms.list.length || ms.pending.length) { msaMissing++; firstMsa = firstMsa || p.id; }
    for (const pr of projectsOf(s, p.id)) {
      const m = projectMetrics(pr, infsOf(s, pr.id));
      const add = (k, n, tab) => { if (n) { acc[k] += n; first[k] = first[k] || { view: 'project', id: pr.id, tab }; } };
      add('pend', m.pendingRows, 'masterfile'); add('rev', m.asgSubmitted, 'review'); add('chg', m.changeRows, 'masterfile'); add('chg', m.asgChanges, 'review'); add('post', m.asgNotPosted, 'submission'); add('data', m.asgLive - m.asgData, 'performance');
    }
  }
  if (role.asCustomer) {
    if (acc.pend) items.push({ n: acc.pend, t: 'creators awaiting your approval', cls: 'warn', r: first.pend });
    if (acc.rev) items.push({ n: acc.rev, t: 'content previews to review', cls: 'warn', r: first.rev });
  } else {
    if (msaMissing) items.push({ n: msaMissing, t: plural(msaMissing, 'partnership') + ' without an uploaded master agreement', cls: 'crit', r: { view: 'partnership', id: firstMsa, tab: 'agreements' } });
    if (acc.chg) items.push({ n: acc.chg, t: 'customer change requests open', cls: 'crit', r: first.chg });
    if (acc.pend + acc.rev) items.push({ n: acc.pend + acc.rev, t: 'items waiting on customers', cls: 'warn', r: first.pend || first.rev });
    if (acc.post) items.push({ n: acc.post, t: 'approved pieces not posted yet', cls: 'info', r: first.post });
    if (acc.data) items.push({ n: acc.data, t: 'live pieces without performance data', cls: 'info', r: first.data });
  }
  return items;
}
function Overview() {
  const { s, role, go, openModal } = useCtx();
  const parts = visibleParts(s, role);
  const prs = parts.flatMap(p => projectsOf(s, p.id));
  const ms = prs.map(pr => projectMetrics(pr, infsOf(s, pr.id)));
  const sum = k => ms.reduce((t, m) => t + (m[k] || 0), 0);
  const items = attention(s, role);
  const creatorsApproved = prs.reduce((t, pr) => t + infsOf(s, pr.id).filter(i => i.state === 'approved').length, 0);
  let views = 0; prs.forEach(pr => infsOf(s, pr.id).forEach(i => asgList(i).forEach(a => { views += perfOf(a).views || 0; })));
  const loading = !s.loaded.partnerships || !s.loaded.projects;
  return html`<${Fragment}>
    <${PageHead} eyebrow=${role.asCustomer ? 'Customer workspace' : accountName('agency') + ' · agency workspace'} title="Overview" actions=${role.canAgency ? html`<button className="btn btn-primary" onClick=${() => openModal('newPartnership')}><${Icon} n="plus" s=${15}/>New partnership</button>` : null}/>
    <div className="kpis">
      <${Kpi} l="Active partnerships" v=${parts.length} s=${plural(prs.length, 'project')} onClick=${() => go({ view: 'partnerships' })}/>
      <${Kpi} l="Creators approved" v=${creatorsApproved} s="across all masterfiles"/>
      <${Kpi} l="Content delivered" v=${sum('delivered')} s=${sum('remaining') + ' remaining'}/>
      <${Kpi} l="Awaiting customer" v=${sum('pendingRows') + sum('asgSubmitted')} cls=${sum('pendingRows') + sum('asgSubmitted') ? 'warn' : ''} s="creators and previews"/>
      <${Kpi} l="Open change requests" v=${ms.reduce((t, m) => t + m.changeRows + m.asgChanges, 0)} cls=${ms.reduce((t, m) => t + m.changeRows + m.asgChanges, 0) ? 'crit' : ''} s="from customers"/>
      <${Kpi} l="Views reported" v=${fmtK(views)} s="from performance data"/>
    </div>
    ${role.canFinance ? html`<${FinanceStrip} compact=${true}/>` : null}
    <div className="split">
      <div className="stack s16">
        ${items.length ? html`<${Card} title="Needs attention" flush=${true}><div className="feed">${items.map((it, i) => html`<button key=${i} className="fev" style=${{ border: 0, borderBottom: '1px solid var(--line)', background: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick=${() => go(it.r)}><span className=${'ic ' + (it.cls === 'crit' ? 'crit' : it.cls === 'warn' ? 'warn' : 'primary')}><${Icon} n="alert" s=${13}/></span><span className="tx"><strong className="num">${it.n}</strong> ${it.t}</span><${Icon} n="chev" s=${14}/></button>`)}</div><//>` : null}
        <${Card} title="Partnerships" sub=${loading ? 'Loading…' : plural(parts.length, 'active partnership')} actions=${html`<button className="btn btn-sm" onClick=${() => go({ view: 'partnerships' })}>View all</button>`} flush=${true}>
          ${parts.length ? html`<${PartnershipTable} parts=${parts}/>` : html`<div style=${{ padding: '16px' }}><${Empty} title=${loading ? 'Loading…' : 'No partnerships yet'}>${role.canAgency ? 'Create a partnership for a partner company, for example Unilever. Then add the debrief, the master agreement and its brands, and open the first project.' : 'Nothing has been shared with you yet.'}<//></div>`}
        <//>
      </div>
      <${Card} title="Recent activity" actions=${html`<button className="btn btn-sm" onClick=${() => go({ view: 'activity' })}>Open log</button>`} flush=${true}><${ActivityFeed} limit=${10}/><//>
    </div>
  <//>`;
}
function PartnershipTable({ parts }) {
  const { s, go, role, openModal } = useCtx();
  const canDel = role.isAdmin;
  return html`<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Partnership</th><th>Master agreement</th><th>Brands</th><th className="r">Projects</th><th>Progress</th><th className="r">Overall</th>${canDel ? html`<th className="r" aria-label="Actions"></th>` : null}</tr></thead><tbody>
    ${parts.map(p => { const ms = msaState(p); const prs = projectsOf(s, p.id); const metrics = prs.map(pr => projectMetrics(pr, infsOf(s, pr.id))); const avg = metrics.length ? metrics.reduce((t, m) => t + m.overall, 0) / metrics.length : 0; const brands = ms.list.flatMap(m => brandList(m)); return html`<tr key=${p.id} className="click" onClick=${() => go({ view: 'partnership', id: p.id })}>
      <td><div className="cs"><strong>${p.name}</strong>${p.demo ? html`<span className="xs t3">Example data</span>` : null}</div></td>
      <td>${!ms.list.length ? html`<${Badge} cls="crit">Missing<//>` : ms.pending.length ? html`<${Badge} cls="crit">To be delivered<//>` : html`<${Badge} cls="ok">Uploaded<//>`}</td>
      <td><div className="row" style=${{ gap: '4px' }}>${brands.slice(0, 4).map(b => html`<span key=${b.id} className="tag">${b.name}</span>`)}${brands.length > 4 ? html`<span className="xs t3">+${brands.length - 4}</span>` : null}</div></td>
      <td className="r num">${prs.length}</td><td style=${{ minWidth: '120px' }}>${metrics.length ? html`<div className="bar"><i style=${{ width: (avg * 100) + '%' }}></i></div>` : html`<span className="t3 small">No projects</span>`}</td><td className="r num mono">${metrics.length ? Math.round(avg * 100) + '%' : '—'}</td>${canDel ? html`<td className="r"><button className="icon-btn" aria-label=${'Delete ' + p.name} title="Delete partnership" onClick=${e => { e.stopPropagation(); openModal('deletePartnership', { p }); }}><${Icon} n="trash" s=${15}/></button></td>` : null}</tr>`; })}
  </tbody></table></div>`;
}
function PartnershipsPage() {
  const { s, role, openModal } = useCtx();
  const parts = visibleParts(s, role);
  return html`<${Fragment}>
    <${PageHead} eyebrow=${role.asCustomer ? 'Your accounts' : 'Customer accounts'} title=${role.asCustomer ? 'My partnerships' : 'Partnerships'} actions=${role.canAgency ? html`<button className="btn btn-primary" onClick=${() => openModal('newPartnership')}><${Icon} n="plus" s=${15}/>New partnership</button>` : null}/>
    ${parts.length ? html`<${PartnershipTable} parts=${parts}/>` : html`<${Empty} title="No partnerships">${role.canAgency ? 'Create the first partnership to start.' : 'Nothing has been shared with you yet.'}<//>`}
  <//>`;
}

/* ---------- partnership ---------- */
function PartnershipView({ id, tab }) {
  const { s, role, go, openModal } = useCtx();
  const p = partnerOf(s, id);
  if (!p || !isActive(p) || !visibleParts(s, role).some(x => x.id === id)) return html`<${Empty} title=${s.loaded.partnerships ? 'Partnership not found' : 'Loading…'} action=${s.loaded.partnerships ? html`<button className="btn" onClick=${() => go({ view: 'partnerships' })}>Back to partnerships</button>` : null}>${p && !isActive(p) && role.canAgency ? 'It is in the trash. Restore it from Files & storage → Trash.' : ''}<//>`;
  const prs = projectsOf(s, p.id);
  const members = invitesFor(s, 'customer', p.id).filter(i => i.status !== 'revoked');
  const tabs = [{ key: 'overview', label: 'Overview' }, { key: 'agreements', label: 'Agreements & brands' }, { key: 'projects', label: 'Projects', count: prs.length }, { key: 'files', label: 'Files', count: filesOf(s, p.id).length }, { key: 'members', label: 'Members', count: members.length }, { key: 'activity', label: 'Activity' }];
  if (role.canFinance) tabs.push({ key: 'finance', label: 'Finance' });
  const cur = tabs.some(t => t.key === tab) ? tab : 'overview';
  const myRole = role.isCustomer ? role.customerRole(p.id) : null;
  return html`<${Fragment}>
    <${PageHead} eyebrow=${'Customer account' + (p.demo ? ' · example data' : '')} title=${p.name}
      meta=${html`<span className="t3 small">Created ${fmtDate(p.createdAt)}</span>${myRole ? html`<${Badge} cls="primary">${myRole === 'admin' ? 'Admin' : 'Member · ' + ACCESS[myRole].label}<//>` : null}`}
      actions=${role.canAgency ? html`${role.isAdmin ? html`<button className="btn btn-ghost" id="p-delete" onClick=${() => openModal('deletePartnership', { p })}><${Icon} n="trash" s=${15}/>Delete partnership</button>` : null}<button className="btn" onClick=${() => openModal('rename', { kind: 'partnership', item: p })}><${Icon} n="edit" s=${15}/>Rename</button><button className="btn btn-primary" onClick=${() => openModal('project', { partnershipId: p.id })}><${Icon} n="plus" s=${15}/>New project</button>` : null}/>
    <${MsaBanner} p=${p}/>
    <${Tabs} tabs=${tabs} value=${cur} onChange=${t => go({ view: 'partnership', id: p.id, tab: t })}/>
    ${cur === 'overview' ? html`<${PartnershipOverview} p=${p}/>` : cur === 'agreements' ? html`<${Agreements} p=${p}/>` : cur === 'projects' ? html`<${ProjectList} p=${p}/>` : cur === 'files' ? html`<${PartnershipFiles} p=${p}/>` : cur === 'members' ? html`<${MembersPanel} type="customer" accountId=${p.id}/>` : cur === 'finance' ? html`<${FinanceTab} p=${p}/>` : html`<${Card} title="Activity" sub=${'Everything that happened in ' + p.name} flush=${true}><${ActivityFeed} filter=${{ pid: p.id }} limit=${200} more=${true}/><//>`}
  <//>`;
}
function DeletePartnershipModal({ p }) {
  const { s, role, go, closeModal } = useCtx();
  const [mode, setMode] = useState('trash'); const [typed, setTyped] = useState(''); const [busy, setBusy] = useState(false);
  const prs = projectsOf(s, p.id), files = filesOf(s, p.id);
  const members = invitesFor(s, 'customer', p.id).filter(i => i.status === 'accepted' || i.status === 'pending');
  const purge = mode === 'purge';
  const blocked = purge && typed.trim() !== p.name;
  const run = async () => {
    setBusy(true);
    const ok = await act(() => purge ? purgePartnership(p) : trashPartnership(p), purge ? p.name + ' deleted permanently' : p.name + ' moved to trash');
    if (ok === false) { setBusy(false); return; }
    go({ view: 'partnerships' });
  };
  const opt = (k, title, desc, disabled) => html`<label className=${'del-opt' + (mode === k ? ' on' : '') + (disabled ? ' off' : '')}><input type="radio" name="del-mode" checked=${mode === k} disabled=${disabled} onChange=${() => setMode(k)}/><span><strong className="small">${title}</strong><span className="small t3">${desc}</span></span></label>`;
  return html`<${Modal} title=${'Delete ' + p.name} onClose=${closeModal} footer=${html`<${Fragment}><button className="btn" onClick=${closeModal}>Cancel</button><button className="btn btn-danger" id="del-confirm" disabled=${busy || blocked} onClick=${run}>${busy ? html`<${Spin}/> Working…` : purge ? 'Delete permanently' : 'Move to trash'}</button><//>`}>
    <p className="t2">${plural(prs.length, 'project')}, ${plural(files.length, 'file')} and ${plural(members.length, 'customer member')}. Customer members lose access as soon as you confirm.</p>
    <div className="stack s8">
      ${opt('trash', 'Move to trash', 'Hidden from everyone, including the customer. Projects, files, approvals and logs are kept; an admin can restore it from Files & storage → Trash.', false)}
      ${opt('purge', 'Delete permanently', role.isOwner ? 'Removes projects, masterfiles, approvals, stored files and finance records. The activity log keeps a record. This cannot be undone.' : 'Only the workspace owner can delete permanently.', !role.isOwner)}
    </div>
    ${purge ? html`<label className="field"><span>Type <span className="mono">${p.name}</span> to confirm</span><input className="input" id="del-type" value=${typed} onChange=${e => setTyped(e.target.value)} autoComplete="off"/></label>` : null}
  <//>`;
}
function MsaBanner({ p }) {
  const { role, go } = useCtx();
  const ms = msaState(p);
  if (ms.list.length && !ms.pending.length) return null;
  return html`<div className="banner crit" role="alert"><${Icon} n="alert" s=${18}/>
    <div className="b-body"><div className="b-title">${!ms.list.length ? 'Master agreement has not been uploaded' : ms.pending.map(m => m.label).join(', ') + (ms.pending.length > 1 ? ' have' : ' has') + ' not been uploaded'}</div>
      <div className="small">${!ms.list.length ? 'Upload the signed master agreement, or mark it as to be delivered to continue with brands and projects.' : 'Marked as to be delivered' + (ms.pending[0].markedAt ? ' on ' + fmtDate(ms.pending[0].markedAt) : '') + '. Work can continue; upload the signed file when it arrives.'}</div></div>
    ${role.canAgency ? html`<button className="btn btn-sm" onClick=${() => go({ view: 'partnership', id: p.id, tab: 'agreements' })}>Open agreements</button>` : null}
  </div>`;
}
function PartnershipOverview({ p }) {
  const { s, role, go, openModal } = useCtx();
  const docs = filesOf(s, p.id).filter(f => f.folder === FOLDERS.docs);
  const ms = msaState(p); const brands = ms.list.flatMap(m => brandList(m)); const prs = projectsOf(s, p.id);
  const steps = [
    { t: 'Debrief & materials', d: docs.length ? plural(docs.length, 'file') + ' uploaded' : 'Upload the debrief and supporting materials', done: docs.length > 0 },
    { t: 'Summary', d: p.summary ? 'Generated ' + fmtDate(p.summary.generatedAt) : 'Claude reads the documents', done: !!p.summary },
    { t: 'Master agreement', d: ms.uploaded.length ? ms.uploaded.length + ' uploaded' + (ms.pending.length ? ', ' + ms.pending.length + ' pending' : '') : ms.pending.length ? 'To be delivered' : 'Upload or mark to be delivered', done: ms.list.length > 0, crit: !ms.uploaded.length || ms.pending.length > 0, go: 'agreements' },
    { t: 'Brands', d: brands.length ? brands.map(b => b.name).join(', ') : 'Add the brands the agreement covers', done: brands.length > 0, go: 'agreements' },
    { t: 'Projects', d: prs.length ? plural(prs.length, 'project') : 'Open the first project', done: prs.length > 0, act: () => openModal('project', { partnershipId: p.id }) },
  ];
  return html`<${Fragment}>
    ${role.canAgency ? html`<div className="checklist">${steps.map((st, i) => html`<div key=${i} className=${'ck' + (st.done ? (st.crit ? ' crit' : ' done') : '')}>
      <div className="ck-t"><span className="ck-n">${st.done && !st.crit ? html`<${Icon} n="check" s=${11}/>` : i + 1}</span>${st.t}</div><div className="ck-d">${st.d}</div>
      ${!st.done && st.go ? html`<div><button className="btn btn-sm" onClick=${() => go({ view: 'partnership', id: p.id, tab: st.go })}>Open</button></div>` : null}
      ${!st.done && st.act ? html`<div><button className="btn btn-sm" onClick=${st.act}>New project</button></div>` : null}</div>`)}</div>` : null}
    <div className="split"><${SummaryPanel} p=${p} docs=${docs}/><${DocsPanel} p=${p} docs=${docs}/></div>
  <//>`;
}
function SummaryPanel({ p, docs }) {
  const { s, role } = useCtx();
  const job = s.jobs['sum:' + p.id];
  const sum = p.summary && p.summary.data;
  const [lang, setLang] = useState((p.summary && p.summary.lang) || 'tr');
  const sec = (title, val) => { const arr = Array.isArray(val) ? val : null; if (arr ? !arr.length : !val) return null; return html`<div className="sum-sec"><h3>${title}</h3>${arr ? html`<ul>${arr.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul>` : html`<p>${val}</p>`}</div>`; };
  const nDocs = sum ? (p.summary.fileIds || []).length : 0;
  return html`<${Card} title="Partnership summary" sub=${sum ? 'Claude read ' + plural(nDocs, 'document') + ' · ' + fmtWhen(p.summary.generatedAt) : 'Claude reads the partnership documents and summarizes them here.'}
    actions=${role.canAgency ? html`<div className="seg" role="group" aria-label="Summary language"><button aria-pressed=${lang === 'tr'} onClick=${() => setLang('tr')}>TR</button><button aria-pressed=${lang === 'en'} onClick=${() => setLang('en')}>EN</button></div>${job ? html`<button className="btn btn-sm" onClick=${() => stopJob('sum:' + p.id)}><${Icon} n="stop" s=${13}/>Stop</button>` : html`<button className="btn btn-sm" disabled=${!docs.length || !s.caps.sample} onClick=${() => startSummary(p, null, lang)}><${Icon} n="refresh" s=${13}/>${sum ? 'Regenerate' : 'Summarize'}</button>`}` : null}>
    ${job ? html`<div className="banner info"><${Spin}/><div className="b-body">${job.step} This usually takes under a minute.</div></div>` : null}
    ${!s.caps.sample && role.canAgency ? html`<p className="t3 small">Claude isn't available in this view, so summaries can't be generated here.</p>` : null}
    ${sum ? html`<${Fragment}>
      ${sum.headline ? html`<p className="sum-head">${sum.headline}</p>` : null}
      ${sum.overview ? html`<p style=${{ maxWidth: '75ch' }}>${sum.overview}</p>` : null}
      <div className="sum-grid">${sec('Objectives', sum.objectives)}${sec('Key messages', sum.key_messages)}${sec('Target audience', sum.audience)}${sec('Requested deliverables', sum.deliverables)}${sec('Timeline', sum.timeline)}${sec('KPIs', sum.kpis)}${role.isAdmin ? sec('Budget & terms', sum.budget) : null}${sec('Mandatories', sum.mandatories)}${sec('Restrictions', sum.restrictions)}${sec('Open questions', sum.open_questions)}</div>
      ${sum.documents && sum.documents.length ? html`<div className="sum-sec"><h3>Documents</h3><ul>${sum.documents.map((d, i) => html`<li key=${i}><span className="mono">${d.name}</span> — ${d.summary}</li>`)}</ul></div>` : null}
    <//>` : !job ? html`<${Empty}>${docs.length ? (role.canAgency ? 'Documents are uploaded. Press Summarize to have Claude read them.' : 'The agency has not generated the summary yet.') : 'Upload the debrief and presentations; the summary appears here.'}<//>` : null}
  <//>`;
}
function useUploads() {
  const [items, setItems] = useState([]);
  const run = async (files, metaFor, onDone) => {
    const list = files.map(f => ({ key: rid(6), name: f.name, st: 'Waiting' }));
    setItems(list);
    const upd = (k, st, extra) => setItems(cur => cur.map(x => x.key === k ? Object.assign({}, x, { st }, extra || {}) : x));
    const added = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i], k = list[i].key;
      try {
        const r = await ingestFile(f, metaFor(f), st => upd(k, st));
        if (r.duplicate) upd(k, 'Already stored', { note: r.file.name }); else { added.push(r.file); upd(k, r.file.verified ? 'Stored · verified' : 'Stored'); }
      } catch (e) { if (!(e && e.friendly)) console.error(e); upd(k, 'Failed', { note: errText(e) }); }
    }
    if (onDone) onDone(added);
    setTimeout(() => setItems(cur => cur.filter(x => x.st === 'Failed')), 4000);
    return added;
  };
  const view = items.length ? html`<div className="flist" style=${{ width: '100%' }}>${items.map(x => html`<div key=${x.key} className="fitem"><span className="ficon">${/^Stored|^Already/.test(x.st) ? html`<${Icon} n="check"/>` : x.st === 'Failed' ? html`<${Icon} n="alert"/>` : html`<${Spin}/>`}</span><div style=${{ minWidth: 0 }}><div className="fname">${x.name}</div>${x.note ? html`<div className=${'fmeta' + (x.st === 'Failed' ? '' : '')} style=${{ color: x.st === 'Failed' ? 'var(--crit)' : '' }}>${x.st === 'Already stored' ? 'Identical file already stored as ' + x.note : x.note}</div>` : null}</div><span className="fmeta">${x.st}</span></div>`)}</div>` : null;
  return { run, view, busy: items.some(x => !/^Stored|^Already|^Failed/.test(x.st)) };
}
function DocsPanel({ p, docs }) {
  const { role, openModal } = useCtx();
  const [over, setOver] = useState(false);
  const up = useUploads();
  const upload = (files, kind) => up.run(files, () => ({ partnershipId: p.id, folder: FOLDERS.docs, kind, extract: true, dedupe: true }), added => {
    if (added.length) { toast(plural(added.length, 'file') + ' stored and indexed'); if (CAP.sample) startSummary(p, docs.concat(added)); }
  });
  const debriefs = docs.filter(d => d.kind === 'debrief'), others = docs.filter(d => d.kind !== 'debrief');
  const row = d => html`<div key=${d.id} className="fitem"><span className="ficon"><${Icon} n="file"/></span>
      <div style=${{ minWidth: 0 }}><div className="fname" title=${d.name}>${d.name}</div><div className="fmeta">${DOC_KIND[d.kind] || 'Supporting material'} · ${fmtBytes(d.size)} · ${fmtDate(d.createdAt)}${d.version > 1 ? ' · v' + d.version : ''}${d.textChars ? '' : ' · no readable text'}</div></div>
      <div className="row nw" style=${{ gap: '2px' }}>${d.verified ? html`<span title=${'SHA-256 ' + d.sha256} className="t3"><${Icon} n="shield" s=${14}/></span>` : null}<button className="icon-btn" onClick=${() => downloadFile(d)} aria-label=${'Download ' + d.name}><${Icon} n="down"/></button>
      ${role.canAgency ? html`<button className="icon-btn" aria-label=${'Move ' + d.name + ' to trash'} onClick=${() => openModal('confirm', { title: 'Move to trash?', body: d.name + ' moves to the trash. It can be restored from Files & storage → Trash.', confirmLabel: 'Move to trash', onConfirm: () => trashFile(d) })}><${Icon} n="trash"/></button>` : null}</div></div>`;
  return html`<${Card} title=${html`<h2 className="row nw" style=${{ gap: '7px' }}><${Icon} n="folder" s=${16}/>Debrief & supporting materials</h2>`} sub=${plural(docs.length, 'file') + ' · checksummed and verified on upload · Claude reads them for the summary'}>
    ${role.canAgency ? html`<div className=${'drop' + (over ? ' over' : '')} onDragOver=${e => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)} onDrop=${e => { e.preventDefault(); setOver(false); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) upload(fs, 'other'); }}>
      <div className="row"><${FileButton} label="Upload debrief" cls="btn-primary btn-sm" accept=${DOC_ACCEPT} multiple=${true} disabled=${up.busy} onFiles=${fs => upload(fs, 'debrief')}/><${FileButton} label="Add supporting materials" cls="btn-sm" accept=${DOC_ACCEPT} multiple=${true} disabled=${up.busy} onFiles=${fs => upload(fs, 'presentation')}/></div>
      <span className="t3 xs">Select several files at once or drop them here: presentations, brand guidelines, moodboards, product sheets. PDF, PowerPoint, Word, Excel, CSV or images.</span>
      ${up.view}
    </div>` : null}
    ${debriefs.length ? html`<div className="stack s6"><span className="eyebrow">Debrief</span><div className="flist">${debriefs.map(row)}</div></div>` : null}
    ${others.length ? html`<div className="stack s6"><span className="eyebrow">Supporting materials</span><div className="flist">${others.map(row)}</div></div>` : null}
    ${!docs.length && !role.canAgency ? html`<p className="t3">No documents yet.</p>` : null}
  <//>`;
}
function Agreements({ p }) {
  const { role } = useCtx();
  const ms = msaState(p);
  const [busy, setBusy] = useState(false);
  const addMsa = async (file) => {
    setBusy(true);
    const mid = rid(); const n = ms.list.length + 1; const label = 'MSA ' + n;
    await act(async () => {
      let fd = null;
      if (file) fd = (await ingestFile(file, { partnershipId: p.id, folder: FOLDERS.msa, kind: 'msa' })).file;
      await dbx.update('partnerships', p.id, { msas: { [mid]: { label, status: file ? 'uploaded' : 'pending', fileId: fd ? fd.id : null, fileName: fd ? fd.name : null, uploadedAt: file ? nowIso() : null, markedAt: file ? null : nowIso(), order: Date.now(), createdAt: nowIso(), brands: {} } }, updatedAt: nowIso() });
      logEvent(file ? 'msa.upload' : 'msa.pending', { pid: p.id, refName: label, text: file ? 'Uploaded master agreement ' + label + ' (' + fd.name + ')' : 'Marked ' + label + ' as to be delivered' });
    }, file ? 'Master agreement uploaded' : 'Marked as to be delivered');
    setBusy(false);
  };
  return html`<${Fragment}>
    ${role.canAgency ? html`<div className="row"><${FileButton} label="Upload master agreement" cls="btn-primary" accept=".pdf,.docx,.png,.jpg,.jpeg" disabled=${busy} onFiles=${fs => addMsa(fs[0])}/><button className="btn" disabled=${busy} onClick=${() => addMsa(null)}>Master agreement to be delivered</button><span className="t3 small">A partnership can have several master agreements (MSA 1, MSA 2…), each covering its own brands.</span></div>` : null}
    ${!ms.list.length ? html`<${Empty} title="No master agreement yet">${role.canAgency ? 'Upload the signed agreement, or press "Master agreement to be delivered" to continue and add brands now.' : 'The agency has not added a master agreement yet.'}<//>` : html`<div className="stack">${ms.list.map(m => html`<${MsaCard} key=${m.id} p=${p} m=${m}/>`)}</div>`}
  <//>`;
}
function MsaCard({ p, m }) {
  const { s, role, openModal } = useCtx();
  const [brand, setBrand] = useState('');
  const file = s.files.find(f => f.id === m.fileId);
  const brands = brandList(m);
  const usedBy = projectsOf(s, p.id).filter(pr => pr.msaId === m.id);
  const addBrand = async () => {
    const name = brand.trim(); if (!name) return;
    if (brands.some(b => b.name.toLowerCase() === name.toLowerCase())) { toast(name + ' is already on this agreement.', 'warn'); return; }
    setBrand('');
    await act(async () => { await dbx.update('partnerships', p.id, { msas: { [m.id]: { brands: { [rid()]: { name, createdAt: nowIso() } } } } }); logEvent('brand.add', { pid: p.id, refName: name, text: 'Added brand ' + name + ' to ' + m.label }); }, name + ' added');
  };
  const removeBrand = b => act(async () => { await dbx.update('partnerships', p.id, { msas: { [m.id]: { brands: { [b.id]: { removed: true, removedAt: nowIso() } } } } }); logEvent('brand.remove', { pid: p.id, refName: b.name, text: 'Removed brand ' + b.name + ' from ' + m.label }); });
  const uploadSigned = async f => act(async () => { const fd = (await ingestFile(f, { partnershipId: p.id, folder: FOLDERS.msa, kind: 'msa' })).file; await dbx.update('partnerships', p.id, { msas: { [m.id]: { status: 'uploaded', fileId: fd.id, fileName: fd.name, uploadedAt: nowIso() } } }); logEvent('msa.upload', { pid: p.id, refName: m.label, text: 'Uploaded the signed ' + m.label + ' (' + fd.name + ')' }); }, 'Signed agreement uploaded');
  return html`<${Card} title=${html`<div className="row"><h2>${m.label}</h2>${m.status === 'uploaded' ? html`<${Badge} cls="ok">Uploaded ${fmtDate(m.uploadedAt)}<//>` : html`<${Badge} cls="crit">To be delivered<//>`}${usedBy.length ? html`<span className="t3 small">${plural(usedBy.length, 'project')}</span>` : null}</div>`}
    actions=${html`${file ? html`<button className="btn btn-sm" onClick=${() => downloadFile(file)}><${Icon} n="down" s=${13}/><span className="mono trunc" style=${{ maxWidth: '220px' }}>${file.name}</span></button>` : null}
      ${role.canAgency && m.status !== 'uploaded' ? html`<${FileButton} label="Upload signed agreement" cls="btn-sm btn-primary" accept=".pdf,.docx,.png,.jpg,.jpeg" onFiles=${fs => uploadSigned(fs[0])}/>` : null}
      ${role.canAgency ? html`<button className="icon-btn" aria-label="Rename agreement" onClick=${() => openModal('rename', { kind: 'msa', item: m, p })}><${Icon} n="edit"/></button>` : null}
      ${role.canAgency && !usedBy.length ? html`<button className="icon-btn" aria-label="Remove agreement" onClick=${() => openModal('confirm', { title: 'Remove ' + m.label + '?', body: 'The agreement and its brand list are removed from this partnership. The stored file stays in Files.', danger: true, confirmLabel: 'Remove', onConfirm: async () => { await dbx.update('partnerships', p.id, { msas: { [m.id]: { removed: true, removedAt: nowIso() } } }); logEvent('msa.remove', { pid: p.id, refName: m.label, text: 'Removed ' + m.label }); } })}><${Icon} n="trash"/></button>` : null}`}>
    <div className="stack s8"><div className="eyebrow">Brands covered</div>
      <div className="row" style=${{ gap: '6px' }}>${brands.length ? brands.map(b => html`<span key=${b.id} className="tag">${b.name}${role.canAgency ? html`<button aria-label=${'Remove ' + b.name} onClick=${() => removeBrand(b)}><${Icon} n="x" s=${11}/></button>` : null}</span>`) : html`<span className="t3 small">No brands yet</span>`}</div>
      ${role.canAgency ? html`<div className="row"><input className="input sm" style=${{ maxWidth: '240px' }} id=${'brand-' + m.id} value=${brand} placeholder="Brand name, e.g. Vaseline" onChange=${e => setBrand(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addBrand(); }}/><button className="btn btn-sm" onClick=${addBrand} disabled=${!brand.trim()}><${Icon} n="plus" s=${13}/>Add brand</button></div>` : null}</div>
  <//>`;
}
function ProjectList({ p }) {
  const { s, role, go, openModal } = useCtx();
  const prs = projectsOf(s, p.id); const bi = brandIndex(p); const msas = msaList(p);
  if (!prs.length) return html`<${Empty} title="No projects yet" action=${role.canAgency ? html`<button className="btn btn-primary" onClick=${() => openModal('project', { partnershipId: p.id })}><${Icon} n="plus" s=${15}/>New project</button>` : null}>${role.canAgency ? 'A project sits under one master agreement and covers one or more of its brands.' : 'The agency has not opened a project yet.'}<//>`;
  return html`<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Project</th><th>Agreement</th><th>Brands</th><th>Current stage</th><th>Progress</th><th className="r">Overall</th></tr></thead><tbody>
    ${prs.map(pr => { const m = projectMetrics(pr, infsOf(s, pr.id)); const msa = msas.find(x => x.id === pr.msaId); return html`<tr key=${pr.id} className="click" onClick=${() => go({ view: 'project', id: pr.id })}>
      <td><strong>${pr.name}</strong></td><td>${msa ? html`<span className="row nw" style=${{ gap: '6px' }}>${msa.label}${msa.status !== 'uploaded' ? html`<${Badge} cls="crit">pending<//>` : null}</span>` : '—'}</td>
      <td><div className="row" style=${{ gap: '4px' }}>${(pr.brandIds || []).map(b => bi[b] ? html`<span key=${b} className="tag">${bi[b].name}</span>` : null)}</div></td>
      <td className="small">${m.overall >= 1 ? 'Complete' : (m.currentIdx + 1) + ' · ' + STAGES[m.currentIdx].label}</td><td style=${{ minWidth: '120px' }}><${MiniTrack} m=${m}/></td><td className="r num mono">${Math.round(m.overall * 100)}%</td></tr>`; })}
  </tbody></table></div>`;
}

/* ---------- files ---------- */
function FilesTable({ files, showPath, empty }) {
  const { role, openModal } = useCtx();
  usePeople(files.map(f => f.createdBy));
  return html`<div className="tbl-wrap"><table className="tbl"><thead><tr><th></th><th>Name</th>${showPath ? html`<th>Location</th>` : null}<th className="r">Size</th><th>Integrity</th><th>Uploaded</th><th className="r"></th></tr></thead><tbody>
    ${files.length ? files.map(f => html`<tr key=${f.id}>
      <td style=${{ width: '58px' }}>${/^image\//.test(f.mime) && f.container === 'native' && f.assetId ? html`<img className="thumb" src=${'/_blob/' + f.assetId} alt="" loading="lazy" onClick=${() => openModal('image', { src: '/_blob/' + f.assetId, name: f.name })}/>` : html`<span className="ficon"><${Icon} n="file"/></span>`}</td>
      <td><div className="cs"><span className="mono small" style=${{ wordBreak: 'break-all' }}>${f.name}</span><span className="xs t3">${DOC_KIND[f.kind] || f.folder}${f.version > 1 ? ' · version ' + f.version : ''}${f.originalName && f.originalName !== f.name ? ' · original ' + f.originalName : ''}</span></div></td>
      ${showPath ? html`<td className="small t2">${folderPath(f)}</td>` : null}
      <td className="r num small">${fmtBytes(f.size)}</td>
      <td><div className="cs">${f.status === 'failed' ? html`<${Badge} cls="crit">Upload failed<//>` : f.status === 'uploading' ? html`<${Badge} cls="warn">Uploading<//>` : f.verified ? html`<${Badge} cls="ok">Verified<//>` : f.verified === false ? html`<${Badge} cls="crit">Mismatch<//>` : html`<${Badge}>Not verified<//>`}<span className="hash" title=${f.sha256 || ''}>${f.sha256 ? 'sha256 ' + f.sha256.slice(0, 12) : ''}</span></div></td>
      <td><div className="cs small"><span>${personName(f.createdBy)}</span><span className="t3 xs">${fmtWhen(f.createdAt)}</span></div></td>
      <td className="r"><div className="row nw" style=${{ gap: '2px', justifyContent: 'flex-end' }}>${f.status === 'active' ? html`<button className="icon-btn" onClick=${() => downloadFile(f)} aria-label=${'Download ' + f.name}><${Icon} n="down"/></button>` : null}${role.canAgency && f.status !== 'trashed' ? html`<button className="icon-btn" aria-label=${'Move ' + f.name + ' to trash'} onClick=${() => openModal('confirm', { title: 'Move to trash?', body: f.name + ' moves to the trash and can be restored.', confirmLabel: 'Move to trash', onConfirm: () => trashFile(f) })}><${Icon} n="trash"/></button>` : null}</div></td></tr>`)
      : html`<tr><td colSpan=${showPath ? 7 : 6} className="t3" style=${{ padding: '22px 12px' }}>${empty || 'No files here.'}</td></tr>`}
  </tbody></table></div>`;
}
function PartnershipFiles({ p }) {
  const { s } = useCtx();
  const files = s.files.filter(f => f.partnershipId === p.id && (f.status === 'active' || f.status === 'failed'));
  const prs = projectsOf(s, p.id);
  const folders = [{ key: 'all', label: 'All files' }, { key: FOLDERS.docs, label: FOLDERS.docs }, { key: FOLDERS.msa, label: FOLDERS.msa }];
  prs.forEach(pr => { folders.push({ key: pr.id + '|' + FOLDERS.shots, label: pr.name + ' / ' + FOLDERS.shots, pr: pr.id, f: FOLDERS.shots }); folders.push({ key: pr.id + '|' + FOLDERS.perf, label: pr.name + ' / ' + FOLDERS.perf, pr: pr.id, f: FOLDERS.perf }); });
  const [cur, setCur] = useState('all');
  const match = (fo, f) => fo.key === 'all' ? true : fo.pr ? (f.projectId === fo.pr && f.folder === fo.f) : (f.folder === fo.key && !f.projectId);
  const fo = folders.find(x => x.key === cur) || folders[0];
  const list = files.filter(f => match(fo, f)).slice().sort(byCreated).reverse();
  return html`<div className="layout-2">
    <nav className="card folder-nav" aria-label="Folders">${folders.map(x => html`<button key=${x.key} className=${'fbtn' + (cur === x.key ? ' on' : '')} onClick=${() => setCur(x.key)}><${Icon} n="folder" s=${14}/><span className="t">${x.label}</span><span className="mono t3 xs">${files.filter(f => match(x, f)).length}</span></button>`)}</nav>
    <${FilesTable} files=${list} empty="This folder is empty."/>
  </div>`;
}
function FilesPage() {
  const { s, role } = useCtx();
  const tabs = [{ key: 'all', label: 'All files' }];
  if (role.canAgency) { tabs.push({ key: 'trash', label: 'Trash', count: s.files.filter(f => f.status === 'trashed').length + s.projects.filter(x => x.status === 'trashed').length + s.partnerships.filter(x => x.status === 'trashed').length }); tabs.push({ key: 'health', label: 'Storage health' }); }
  const [tab, setTab] = useState('all');
  return html`<${Fragment}>
    <${PageHead} eyebrow="Indexed storage" title="Files & storage" meta=${html`<span className="t3 small">Every upload is checksummed (SHA-256), read back and verified, versioned and logged.</span>`}/>
    <${Tabs} tabs=${tabs} value=${tab} onChange=${setTab}/>
    ${tab === 'trash' ? html`<${TrashPanel}/>` : tab === 'health' ? html`<${HealthPanel}/>` : html`<${AllFiles}/>`}
  <//>`;
}
function AllFiles() {
  const { s, role } = useCtx();
  const parts = visibleParts(s, role); const pids = new Set(parts.map(p => p.id));
  const [pid, setPid] = useState(''); const [folder, setFolder] = useState(''); const [q, setQ] = useState('');
  const files = s.files.filter(f => (f.status === 'active' || f.status === 'failed') && (role.isAgency ? (!f.partnershipId || pids.has(f.partnershipId)) : pids.has(f.partnershipId)))
    .filter(f => !pid || (pid === '_ws' ? !f.partnershipId : f.partnershipId === pid)).filter(f => !folder || f.folder === folder)
    .filter(f => !q.trim() || (f.name + ' ' + (f.originalName || '') + ' ' + (f.sha256 || '')).toLowerCase().includes(q.trim().toLowerCase()))
    .sort(byCreated).reverse();
  const total = files.reduce((t, f) => t + (f.size || 0), 0);
  return html`<div className="stack">
    <div className="row"><select className="input sm" style=${{ width: 'auto' }} value=${pid} onChange=${e => setPid(e.target.value)} aria-label="Partnership"><option value="">All partnerships</option>${parts.map(p => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}${role.isAgency ? html`<option value="_ws">Workspace (recovered)</option>` : null}</select>
      <select className="input sm" style=${{ width: 'auto' }} value=${folder} onChange=${e => setFolder(e.target.value)} aria-label="Folder"><option value="">All folders</option>${Object.values(FOLDERS).map(f => html`<option key=${f} value=${f}>${f}</option>`)}</select>
      <input className="input sm" style=${{ maxWidth: '260px' }} id="files-q" value=${q} onChange=${e => setQ(e.target.value)} placeholder="Name or checksum"/><span className="t3 small">${plural(files.length, 'file')} · ${fmtBytes(total)}</span></div>
    <${FilesTable} files=${files} showPath=${true} empty="No files match."/>
  </div>`;
}
function TrashPanel() {
  const { s, role, openModal } = useCtx();
  const files = s.files.filter(f => f.status === 'trashed').sort((a, b) => String(b.trashedAt).localeCompare(String(a.trashedAt)));
  const parts = s.partnerships.filter(x => x.status === 'trashed');
  const prs = s.projects.filter(x => x.status === 'trashed');
  usePeople(files.map(f => f.trashedBy).concat(parts.map(p => p.trashedBy), prs.map(p => p.trashedBy)));
  const purgeBtn = (label, body, fn, name) => role.isOwner ? html`<button className="btn btn-sm btn-ghost" onClick=${() => openModal('confirm', { title: 'Delete permanently?', body, danger: true, confirmLabel: 'Delete permanently', typeToConfirm: name, onConfirm: fn })}>${label}</button>` : null;
  return html`<div className="stack s16">
    <div className="banner neutral"><${Icon} n="restore" s=${16}/><div className="b-body small">Items in the trash are hidden but nothing is lost: files stay in storage and logs are kept. ${role.isOwner ? 'Only you, as owner, can delete permanently; a tombstone record and the log entry remain.' : 'Only the workspace owner can delete permanently.'}</div></div>
    ${parts.length ? html`<${Card} title="Partnerships" flush=${true}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Trashed</th><th className="r"></th></tr></thead><tbody>${parts.map(p => html`<tr key=${p.id}><td><strong>${p.name}</strong></td><td className="small">${personName(p.trashedBy)} · ${fmtWhen(p.trashedAt)}</td><td className="r"><div className="row nw" style=${{ justifyContent: 'flex-end' }}><button className="btn btn-sm" onClick=${() => act(() => restorePartnership(p), 'Partnership restored')}><${Icon} n="restore" s=${13}/>Restore</button>${purgeBtn('Delete permanently', 'This deletes ' + p.name + ', all its projects, masterfiles and stored files. The audit log keeps a record.', () => purgePartnership(p), p.name)}</div></td></tr>`)}</tbody></table></div><//>` : null}
    ${prs.length ? html`<${Card} title="Projects" flush=${true}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Project</th><th>Partnership</th><th>Trashed</th><th className="r"></th></tr></thead><tbody>${prs.map(pr => { const p = partnerOf(s, pr.partnershipId); return html`<tr key=${pr.id}><td><strong>${pr.name}</strong></td><td>${p ? p.name : '—'}</td><td className="small">${personName(pr.trashedBy)} · ${fmtWhen(pr.trashedAt)}</td><td className="r"><div className="row nw" style=${{ justifyContent: 'flex-end' }}><button className="btn btn-sm" onClick=${() => act(() => restoreProject(pr), 'Project restored')}><${Icon} n="restore" s=${13}/>Restore</button>${purgeBtn('Delete permanently', 'This deletes the project with its masterfile, approvals and stored screenshots and reports.', () => purgeProject(pr), pr.name)}</div></td></tr>`; })}</tbody></table></div><//>` : null}
    <${Card} title="Files" sub=${plural(files.length, 'file')} flush=${true}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Location</th><th className="r">Size</th><th>Trashed</th><th className="r"></th></tr></thead><tbody>
      ${files.length ? files.map(f => html`<tr key=${f.id}><td><span className="mono small">${f.name}</span></td><td className="small t2">${folderPath(f)}</td><td className="r small num">${fmtBytes(f.size)}</td><td className="small">${personName(f.trashedBy)} · ${fmtWhen(f.trashedAt)}</td><td className="r"><div className="row nw" style=${{ justifyContent: 'flex-end' }}><button className="btn btn-sm" onClick=${() => act(() => restoreFile(f), 'File restored')}><${Icon} n="restore" s=${13}/>Restore</button>${purgeBtn('Delete permanently', f.name + ' is deleted from storage. Its index record and log entry remain.', () => purgeFile(f), null)}</div></td></tr>`) : html`<tr><td colSpan="5" className="t3" style=${{ padding: '20px 12px' }}>The trash is empty.</td></tr>`}
    </tbody></table></div><//>
  </div>`;
}
function HealthPanel() {
  const { s, role } = useCtx();
  const [scan, setScan] = useState(null); const [busy, setBusy] = useState(''); const [prog, setProg] = useState('');
  const run = async () => { setBusy('scan'); const r = await act(storageScan); if (r && r !== true) setScan(r); setBusy(''); };
  useEffect(() => { if (CAP.assets) run(); }, []);
  const reindex = async () => { setBusy('reindex'); let n = 0; for (const a of scan.orphans) { const ok = await act(() => reindexOrphan(a)); if (ok !== false) n++; } toast(plural(n, 'file') + ' re-indexed into Recovered files'); setBusy(''); run(); };
  const verifyAll = async () => { setBusy('verify'); const list = s.files.filter(f => f.status === 'active' && f.assetId); const r = await act(() => verifyFiles(list, (i, n) => setProg(i + ' / ' + n))); setProg(''); setBusy(''); if (r && r !== true) toast(r.ok + ' of ' + list.length + ' files verified' + (r.bad.length ? '; ' + r.bad.length + ' need attention' : ''), r.bad.length ? 'warn' : 'ok'); run(); };
  const markStuck = async () => { setBusy('stuck'); for (const f of scan.stuck) await act(() => dbx.update('files', f.id, { status: 'failed', error: 'Upload did not finish', failedAt: nowIso() })); setBusy(''); run(); };
  if (!CAP.assets) return html`<${Empty} title="Storage tools need edit access"><//>`;
  const u = scan && scan.usage;
  const indexed = s.files.filter(f => f.status === 'active').length;
  return html`<div className="stack s16">
    <div className="kpis">
      <${Kpi} l="Indexed files" v=${indexed} s=${s.files.filter(f => f.status === 'trashed').length + ' in trash'}/>
      <${Kpi} l="Stored objects" v=${scan ? scan.total : '…'} s=${u ? fmtBytes(u.bytes) + ' of ' + fmtBytes(u.maxBytes) : ''}/>
      <${Kpi} l="Verified" v=${s.files.filter(f => f.status === 'active' && f.verified).length} cls=${scan && scan.unverified.length ? 'warn' : 'ok'} s=${scan ? scan.unverified.length + ' not verified' : ''}/>
      <${Kpi} l="Not indexed" v=${scan ? scan.orphans.length : '…'} cls=${scan && scan.orphans.length ? 'warn' : ''} s="stored without a record"/>
      <${Kpi} l="Missing objects" v=${scan ? scan.missing.length : '…'} cls=${scan && scan.missing.length ? 'crit' : ''} s="record without a stored file"/>
      <${Kpi} l="Log events queued" v=${s.outboxN} cls=${s.outboxN ? 'warn' : 'ok'} s=${s.outboxN ? 'waiting to sync' : 'all synced'}/>
    </div>
    ${u ? html`<${Card} title="Storage quota" sub=${u.files + ' of ' + u.maxFiles + ' objects · ' + fmtBytes(u.bytes) + ' of ' + fmtBytes(u.maxBytes)}><div className="bar" style=${{ height: '8px' }}><i style=${{ width: Math.min(100, u.bytes / u.maxBytes * 100) + '%' }}></i></div><//>` : null}
    <${Card} title="Checks & recovery" sub=${scan ? 'Last scan ' + fmtWhen(scan.scannedAt) : 'Scanning…'} actions=${html`<button className="btn btn-sm" disabled=${!!busy} onClick=${run}>${busy === 'scan' ? html`<${Spin}/>` : html`<${Icon} n="refresh" s=${13}/>`}Rescan</button>`}>
      <div className="stack s8">
        <div className="between"><div><strong>Verify integrity</strong><div className="small t3">Reads every stored file back and compares its SHA-256 checksum with the index.</div></div><button className="btn btn-sm" disabled=${!!busy} onClick=${verifyAll}>${busy === 'verify' ? html`<${Spin}/> ${prog}` : 'Verify all files'}</button></div>
        <div className="between"><div><strong>Re-index stored files</strong><div className="small t3">${scan && scan.orphans.length ? plural(scan.orphans.length, 'stored object') + ' have no index record (for example an upload interrupted mid-way). Re-index them into Recovered files.' : 'Every stored object has an index record.'}</div></div><button className="btn btn-sm" disabled=${!!busy || !scan || !scan.orphans.length || !role.isAdmin} onClick=${reindex}>${busy === 'reindex' ? html`<${Spin}/>` : null}Re-index</button></div>
        <div className="between"><div><strong>Interrupted uploads</strong><div className="small t3">${scan && scan.stuck.length ? plural(scan.stuck.length, 'upload') + ' started over 10 minutes ago and never finished.' : 'No interrupted uploads.'} ${scan && scan.failed.length ? plural(scan.failed.length, 'failed upload') + ' are listed in All files.' : ''}</div></div><button className="btn btn-sm" disabled=${!!busy || !scan || !scan.stuck.length} onClick=${markStuck}>Mark as failed</button></div>
        ${scan && scan.missing.length ? html`<div className="banner crit"><div className="b-body"><div className="b-title">${plural(scan.missing.length, 'record')} point to a stored file that no longer exists</div><div className="small">${scan.missing.slice(0, 5).map(f => f.name).join(', ')}${scan.missing.length > 5 ? '…' : ''}. Restore them from a backup or upload them again.</div></div></div>` : null}
      </div>
    <//>
  </div>`;
}

/* ---------- activity ---------- */
const ACT_CAT = { file: 'Files', member: 'Members', masterfile: 'Approvals', influencer: 'Approvals', preview: 'Approvals', content: 'Content', assignment: 'Content', perf: 'Content', partnership: 'Setup', project: 'Setup', msa: 'Setup', brand: 'Setup', summary: 'Setup', backup: 'System', storage: 'System', settings: 'System' };
const catOf = a => ACT_CAT[String(a || '').split('.')[0]] || 'Other';
const actIcon = a => { const k = String(a || ''); if (/approve|join|restore|verify/.test(k)) return ['check', 'ok']; if (/fail|purge|revoke|change|trash/.test(k)) return ['alert', 'crit']; if (/^file|^backup/.test(k)) return ['file', 'primary']; if (/^member/.test(k)) return ['users', 'primary']; if (/comment/.test(k)) return ['comment', 'warn']; return ['pulse', '']; };
function ActivityFeed({ filter, limit, more }) {
  const { s, role, go } = useCtx();
  const evs = visibleEvents(s, role, filter).slice(0, limit || 50);
  usePeople(evs.map(e => e.by));
  const [loading, setLoading] = useState(false);
  if (!s.loaded.audit) return html`<div className="t3 small" style=${{ padding: '16px' }}>Loading activity…</div>`;
  return html`<div className="feed">${evs.length ? evs.map(e => { const [ic, cls] = actIcon(e.act); const p = e.pid && partnerOf(s, e.pid); const pr = e.prid && s.projects.find(x => x.id === e.prid); return html`<div key=${e.id} className="fev"><span className=${'ic ' + cls}><${Icon} n=${ic} s=${12}/></span>
      <div className="tx"><div><span className="who">${personName(e.by)}</span> <span className="t2">${e.text}</span></div><div className="xs t3 row" style=${{ gap: '6px' }}><span>${roleText(e.role)}</span>${p && !(filter && filter.pid) ? html`<button className="btn-ghost" style=${{ border: 0, background: 'none', padding: 0, color: 'var(--primary)', cursor: 'pointer', font: 'inherit' }} onClick=${() => go(pr ? { view: 'project', id: pr.id } : { view: 'partnership', id: p.id })}>${p.name}${pr ? ' / ' + pr.name : ''}</button>` : null}${e.pending ? html`<${Badge} cls="warn">waiting to sync<//>` : null}</div></div>
      <span className="when" title=${fmtWhen(e.at)}>${fmtAgo(e.at)}</span></div>`; }) : html`<div className="t3 small" style=${{ padding: '16px' }}>No activity yet.</div>`}
    ${more ? html`<div style=${{ padding: '10px 16px' }}><button className="btn btn-sm" disabled=${loading} onClick=${async () => { setLoading(true); const n = await act(loadOlderAudit); setLoading(false); if (n === 0) toast('No older activity.'); }}>${loading ? html`<${Spin}/>` : null}Load older activity</button></div>` : null}
  </div>`;
}
function ActivityPage() {
  const { s, role } = useCtx();
  const parts = visibleParts(s, role);
  const [pid, setPid] = useState(''); const [cat, setCat] = useState(''); const [q, setQ] = useState(''); const [loading, setLoading] = useState(false);
  const all = visibleEvents(s, role, pid ? { pid } : null).filter(e => !cat || catOf(e.act) === cat).filter(e => !q.trim() || (e.text + ' ' + personName(e.by) + ' ' + (e.refName || '')).toLowerCase().includes(q.trim().toLowerCase()));
  usePeople(all.slice(0, 300).map(e => e.by));
  const exportCsv = async () => {
    if (!CAP.downloads) return toast('Downloads are not available in this view.', 'warn');
    const esc = v => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['time_utc', 'actor_id', 'actor_name', 'role', 'action', 'category', 'description', 'partnership', 'project', 'reference', 'details'].join(',')]
      .concat(all.map(e => [e.at, e.by, personName(e.by), roleText(e.role), e.act, catOf(e.act), e.text, (partnerOf(s, e.pid) || {}).name || '', (s.projects.find(x => x.id === e.prid) || {}).name || '', e.refName || e.ref || '', e.meta ? JSON.stringify(e.meta) : ''].map(esc).join(',')));
    const ok = await act(() => CAP.downloads.save({ filename: 'activity_log_' + fileStamp() + '.csv', data: '﻿' + rows.join('\n') }));
    if (ok) logEvent('backup.export_log', { scope: 'agency', text: 'Exported the activity log (' + all.length + ' events)' });
  };
  return html`<${Fragment}>
    <${PageHead} eyebrow="Audit trail" title="Activity log" meta=${html`<span className="t3 small">Append-only record of every upload, approval, comment, download and access change. Kept by day; events queued offline sync automatically.</span>`}
      actions=${html`<button className="btn" onClick=${exportCsv}><${Icon} n="down" s=${15}/>Export CSV</button>`}/>
    <div className="row"><select className="input sm" style=${{ width: 'auto' }} value=${pid} onChange=${e => setPid(e.target.value)} aria-label="Partnership"><option value="">All partnerships</option>${parts.map(p => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}</select>
      <select className="input sm" style=${{ width: 'auto' }} value=${cat} onChange=${e => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>${['Setup', 'Approvals', 'Content', 'Files', 'Members', 'System'].map(c => html`<option key=${c} value=${c}>${c}</option>`)}</select>
      <input className="input sm" style=${{ maxWidth: '260px' }} id="act-q" value=${q} onChange=${e => setQ(e.target.value)} placeholder="Search events"/><span className="t3 small">${plural(all.length, 'event')} loaded</span></div>
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Time</th><th>Actor</th><th>Event</th><th>Where</th><th>Details</th></tr></thead><tbody>
      ${all.length ? all.slice(0, 500).map(e => { const p = partnerOf(s, e.pid); const pr = e.prid && s.projects.find(x => x.id === e.prid); return html`<tr key=${e.id}><td className="small num" style=${{ whiteSpace: 'nowrap' }}>${fmtWhen(e.at)}${e.pending ? html`<div><${Badge} cls="warn">queued<//></div>` : null}</td><td><div className="cs"><span className="small" style=${{ fontWeight: 500 }}>${personName(e.by)}</span><span className="xs t3">${roleText(e.role)}</span></div></td><td><div className="cs"><span className="small">${e.text}</span><span className="xs t3 mono">${e.act}</span></div></td><td className="small t2">${p ? p.name + (pr ? ' / ' + pr.name : '') : 'Workspace'}</td><td className="xs t3 mono" style=${{ maxWidth: '260px', wordBreak: 'break-all' }}>${e.meta ? Object.entries(e.meta).map(([k, v]) => k + ': ' + (k === 'sha256' ? String(v).slice(0, 16) : typeof v === 'object' ? JSON.stringify(v) : v)).join(' · ') : ''}</td></tr>`; })
        : html`<tr><td colSpan="5" className="t3" style=${{ padding: '22px 12px' }}>${s.loaded.audit ? 'No events match.' : 'Loading…'}</td></tr>`}
    </tbody></table></div>
    <div><button className="btn btn-sm" disabled=${loading} onClick=${async () => { setLoading(true); const n = await act(loadOlderAudit); setLoading(false); if (n === 0) toast('No older activity.'); }}>${loading ? html`<${Spin}/>` : null}Load older activity</button></div>
  <//>`;
}

/* ---------- members & invitations ---------- */
function roleHelp(type) {
  if (type === 'agency') return [
    { k: 'owner', label: 'Owner', d: AGENCY_ROLES.owner.d },
    { k: 'admin', label: 'Admin', d: AGENCY_ROLES.admin.d },
    { k: 'edit', label: 'Member · Edit', d: 'Creates and runs partnerships, projects and masterfiles; uploads files and fetches data. No finance, team or settings.' },
    { k: 'view', label: 'Member · View', d: 'Sees partnerships, projects and dashboards read-only. No finance, team or settings.' },
  ];
  return [
    { k: 'admin', label: 'Admin', d: CUSTOMER_ROLES.admin.d },
    { k: 'edit', label: 'Member · Edit', d: 'Approves creators and content and leaves comments.' },
    { k: 'view', label: 'Member · View', d: 'Follows creators, content and results read-only.' },
  ];
}
function RoleCell({ type, i, canManage }) {
  const n = invRole(i); const roles = type === 'agency' ? AGENCY_ROLES : CUSTOMER_ROLES;
  if (!canManage) return html`<span className="small">${roleName(type, i)}</span>`;
  return html`<div className="row nw" style=${{ gap: '6px' }}>
    <select className="input sm" style=${{ width: 'auto' }} value=${n.role} aria-label=${'Role for ' + i.email} onChange=${e => act(() => setInviteRole(i, e.target.value), 'Role updated')}>${['admin', 'member'].map(k => html`<option key=${k} value=${k}>${roles[k].label}</option>`)}</select>
    ${n.role === 'member' ? html`<select className="input sm" style=${{ width: 'auto' }} value=${n.access} aria-label=${'Access for ' + i.email} onChange=${e => act(() => setInviteAccess(i, e.target.value), e.target.value === 'view' ? 'Access set to View' : 'Access set to Edit')}>${Object.keys(ACCESS).map(k => html`<option key=${k} value=${k}>${ACCESS[k].label}</option>`)}</select>` : html`<span className="xs t3">Full access</span>`}
  </div>`;
}
function MembersPanel({ type, accountId }) {
  const { s, role, openModal } = useCtx();
  const canManage = type === 'agency' ? role.isAdmin : role.canInviteCustomer(accountId);
  const invs = invitesFor(s, type, accountId);
  usePeople(invs.map(i => i.acceptedBy).concat(invs.map(i => i.invitedBy)).concat(s.settings.ownerId ? [s.settings.ownerId] : []));
  const roles = type === 'agency' ? AGENCY_ROLES : CUSTOMER_ROLES;
  const statusBadge = i => i.status === 'accepted' ? html`<${Badge} cls="ok">Active<//>` : i.status === 'revoked' ? html`<${Badge} cls="crit">Removed<//>` : html`<div className="cs"><${Badge} cls="warn">Invited<//><span className="xs t3">${i.emailedAt ? 'Emailed ' + fmtDate(i.emailedAt) : 'Not emailed yet'}</span></div>`;
  const newCodeFor = async i => { const code = await act(() => regenerateCode(i)); if (code && code !== true) openModal('inviteResult', { results: [{ id: i.id, email: i.email, code, type: i.accountType, accountId: i.accountId, role: i.role, access: i.access }] }); };
  const ownerId = s.settings.ownerId || (s.me.isOwner ? s.me.id : null);
  return html`<div className="stack s16">
    <${Card} title=${type === 'agency' ? 'Agency team' : 'Customer members'} sub=${accountName(type, accountId) + ' · ' + plural(invs.filter(i => i.status === 'accepted').length, 'active member') + ', ' + invs.filter(i => i.status === 'pending').length + ' invited'}
      actions=${canManage ? html`<button className="btn btn-primary btn-sm" onClick=${() => openModal('invite', { type, accountId })}><${Icon} n="mail" s=${14}/>Invite members</button>` : null} flush=${true}>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Verification</th><th>Invited</th>${canManage ? html`<th className="r"></th>` : null}</tr></thead><tbody>
        ${type === 'agency' && ownerId ? html`<tr><td><div className="cs"><strong>${personName(ownerId)}</strong><span className="xs t3 mono">${personEmail(ownerId) || ''}</span></div></td><td><${Badge} cls="primary" nodot=${true}>Owner<//></td><td><${Badge} cls="ok">Active<//></td><td className="small t3">Workspace owner</td><td></td>${canManage ? html`<td></td>` : null}</tr>` : null}
        ${invs.length ? invs.map(i => html`<tr key=${i.id}>
          <td><div className="cs">${i.acceptedBy ? html`<strong>${personName(i.acceptedBy)}</strong>` : null}<span className=${'mono ' + (i.acceptedBy ? 'xs t3' : 'small')}>${i.email}</span></div></td>
          <td><${RoleCell} type=${type} i=${i} canManage=${canManage && i.status !== 'revoked' && i.acceptedBy !== s.me.id}/></td>
          <td>${statusBadge(i)}</td>
          <td className="small">${i.status === 'accepted' ? (i.verifiedVia === 'email' ? html`<span className="row nw" style=${{ gap: '5px' }}><${Icon} n="shield" s=${13}/>Account email</span>` : html`<span className="row nw" style=${{ gap: '5px' }}><${Icon} n="lock" s=${13}/>Invitation code</span>`) : html`<span className="t3">Not joined yet</span>`}</td>
          <td><div className="cs small"><span>${personName(i.invitedBy)}</span><span className="xs t3">${fmtDate(i.createdAt)}</span></div></td>
          ${canManage ? html`<td className="r"><div className="row nw" style=${{ justifyContent: 'flex-end', gap: '4px' }}>${i.status === 'pending' ? html`<button className="btn btn-sm" onClick=${() => newCodeFor(i)}>New code</button>` : null}${i.status === 'revoked' ? html`<button className="btn btn-sm" onClick=${() => act(() => setInviteStatus(i, i.acceptedBy ? 'accepted' : 'pending'), 'Access restored')}>Restore</button>` : html`<button className="btn btn-sm btn-ghost" onClick=${() => openModal('confirm', { title: 'Remove ' + i.email + '?', body: 'They lose access to ' + accountName(type, accountId) + ' immediately. The record stays in the log and access can be restored.', danger: true, confirmLabel: 'Remove access', onConfirm: () => setInviteStatus(i, 'revoked') })}>Remove</button>`}</div></td>` : null}
        </tr>`) : html`<tr><td colSpan=${canManage ? 6 : 5} className="t3" style=${{ padding: '20px 12px' }}>No members invited yet.</td></tr>`}
      </tbody></table></div>
    <//>
    ${canManage && HOSTED ? html`<div className="banner info"><${Icon} n="shield" s=${16}/><div className="b-body small"><div className="b-title">How email verification works</div>Each invitation is tied to one email address and carries a one-time code that is emailed to that address. Creating an account needs the code, which proves the person controls the invited mailbox. The code is stored only as a hash, works once, and the account is created for the invited address only. Removing access takes effect immediately.</div></div>` : null}
    ${canManage && !HOSTED ? html`<div className="banner info"><${Icon} n="shield" s=${16}/><div className="b-body small"><div className="b-title">How email verification works</div>Each invitation is tied to one email address and carries a one-time code that is emailed to that address (from your Gmail, or copied into your own email). Joining requires the code, which proves the person controls the invited mailbox; the code is stored only as a hash and works once. They also need access to this page itself: add the same email in the page's <strong>Share</strong> menu with <strong>Editor</strong> access so they can approve and comment.</div></div>` : null}
    <${Card} title="Roles and access" sub=${canManage ? 'Change a member between Edit and View at any time; it applies immediately.' : null}>
      <div className="grid-roles">${roleHelp(type).map(r => html`<div key=${r.k} className="stack s6"><strong className="small">${r.label}</strong><span className="small t3">${r.d}</span></div>`)}</div>
    <//>
  </div>`;
}
function TeamPage() {
  return html`<${Fragment}><${PageHead} eyebrow="Administration" title="Team & access" meta=${html`<span className="t3 small">Agency members are invited by email and verified ${HOSTED ? 'with a one-time code sent to that address' : 'against their Claude account'}. Customer members are managed in each partnership's Members tab.</span>`}/><${MembersPanel} type="agency" accountId="agency"/><//>`;
}
function InviteModal({ type, accountId }) {
  const { closeModal, openModal } = useCtx();
  const help = roleHelp(type).filter(r => r.k !== 'owner');
  const [emails, setEmails] = useState(''); const [pick, setPick] = useState('edit'); const [busy, setBusy] = useState(false);
  const list = Array.from(new Set(emails.split(/[\s,;]+/).map(normEmail).filter(Boolean)));
  const bad = list.filter(e => !validEmail(e));
  const go = async () => {
    if (!list.length) return toast('Enter at least one email address.', 'warn');
    if (bad.length) return toast('Check these addresses: ' + bad.join(', '), 'warn');
    setBusy(true);
    const r = await act(() => createInvites(list, type, accountId, pick === 'admin' ? 'admin' : 'member', pick === 'view' ? 'view' : 'edit'));
    setBusy(false);
    if (r && r !== true) { if (r.skipped.length) toast('Already invited: ' + r.skipped.join(', '), 'warn'); if (r.created.length) openModal('inviteResult', { results: r.created }); else closeModal(); }
  };
  return html`<${Modal} title=${'Invite to ' + accountName(type, accountId)} onClose=${closeModal} footer=${html`<${Fragment}><button className="btn" onClick=${closeModal}>Cancel</button><button className="btn btn-primary" disabled=${busy || !list.length} onClick=${go}>${busy ? 'Creating…' : 'Create ' + plural(list.length || 1, 'invitation')}</button><//>`}>
    <label className="field"><span>Email addresses</span><textarea className="input" id="inv-emails" value=${emails} onChange=${e => setEmails(e.target.value)} placeholder=${type === 'agency' ? 'name@gamesmedya.com' : 'name@unilever.com'}></textarea><small>Separate several addresses with commas or new lines. ${bad.length ? html`<span style=${{ color: 'var(--crit)' }}>Not valid: ${bad.join(', ')}</span>` : null}</small></label>
    <div className="field"><span>Role and access</span><div className="stack s6">${help.map(r => html`<label key=${r.k} className="row nw" style=${{ alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}><input type="radio" name="inv-role" value=${r.k} checked=${pick === r.k} onChange=${() => setPick(r.k)} style=${{ marginTop: '3px' }}/><span><strong className="small">${r.label}</strong><span className="small t3"> — ${r.d}</span></span></label>`)}</div><small>Admins can switch a member between Edit and View later in this list.</small></div>
  <//>`;
}
function InviteResultModal({ results }) {
  const { closeModal } = useCtx();
  const link = HOSTED ? location.origin : store.settings && store.settings.workspaceLink;
  const canEmail = store.caps.email; const via = HOSTED ? 'Send email' : 'Email via Gmail';
  const [sent, setSent] = useState({}); const [busy, setBusy] = useState('');
  const send = async r => { setBusy(r.id); const ok = await act(() => sendInviteEmail(r, r.code)); setBusy(''); if (ok !== false) { setSent(x => Object.assign({}, x, { [r.id]: true })); toast('Invitation emailed to ' + r.email); } };
  const sendAll = async () => { for (const r of results) { if (sent[r.id]) continue; setBusy(r.id); const ok = await act(() => sendInviteEmail(r, r.code)); if (ok === false) break; setSent(x => Object.assign({}, x, { [r.id]: true })); } setBusy(''); };
  const allSent = results.every(r => sent[r.id]);
  return html`<${Modal} title=${plural(results.length, 'invitation') + ' ready'} wide=${true} onClose=${closeModal} footer=${html`<${Fragment}>${canEmail && !allSent ? html`<button className="btn" disabled=${!!busy} onClick=${sendAll}><${Icon} n="mail" s=${14}/>Email ${results.length > 1 ? 'all ' + results.length : 'it'}${EMAIL_VIA}</button>` : null}<button className="btn btn-primary" onClick=${closeModal}>Done</button><//>`}>
    <div className="banner warn"><${Icon} n="alert" s=${16}/><div className="b-body small">Send each code now. For security codes are stored only as a hash and cannot be shown again; you can issue a new code at any time.</div></div>
    ${!link && !HOSTED ? html`<div className="banner neutral"><div className="b-body small">Add this page's link in <strong>Settings & backup</strong> so it is filled into invitations automatically.</div></div>` : null}
    ${results.map(r => html`<div key=${r.id} className="sub-card"><div className="between"><div><strong className="mono">${r.email}</strong><div className="small t3">${roleName(r.type, r)} · ${accountName(r.type, r.accountId)}</div></div><span className="codebox">${r.code}</span></div>
      <pre className="inv">${invitationText(r, r.code)}</pre>
      <div className="row">${canEmail ? (sent[r.id] ? html`<${Badge} cls="ok">Emailed${EMAIL_VIA}<//>` : html`<button className="btn btn-sm btn-primary" disabled=${!!busy} onClick=${() => send(r)}>${busy === r.id ? html`<${Spin}/>` : html`<${Icon} n="mail" s=${13}/>`}${via}</button>`) : null}<button className="btn btn-sm" onClick=${() => copyText(invitationText(r, r.code))}><${Icon} n="copy" s=${13}/>Copy invitation</button><button className="btn btn-sm btn-ghost" onClick=${() => copyText(r.code)}>Copy code</button></div></div>`)}
    ${HOSTED ? html`<div className="stack s6 small"><strong>Next steps</strong><span>1. ${canEmail ? 'Send each invitation by email with one click, or copy it into your own email.' : 'Copy each invitation into your own email. (Automatic sending starts once the email service is set up.)'}</span><span>2. They open the link, create an account with the code and land in the workspace; their status here switches to Active.</span></div>`
      : html`<div className="stack s6 small"><strong>Next steps</strong><span>1. Email each person their invitation${CAP.mcp ? ' (from your Gmail with one click, or copy it)' : ''}.</span><span>2. In this page's <strong>Share</strong> menu, add the same email addresses with <strong>Editor</strong> access.</span><span>3. They sign in, enter the code and join; their status here switches to Active.</span></div>`}
  <//>`;
}

/* ---------- settings & backup ---------- */
function SettingsPage() {
  const { s, role, openModal } = useCtx();
  const [name, setName] = useState(s.settings.agencyName || 'Games Medya');
  const [link, setLink] = useState(s.settings.workspaceLink || '');
  const [busy, setBusy] = useState('');
  useEffect(() => { setName(s.settings.agencyName || 'Games Medya'); setLink(s.settings.workspaceLink || ''); }, [s.settings.agencyName, s.settings.workspaceLink]);
  const save = async () => {
    if (link.trim() && !safeUrl(link)) return toast('Paste the full page link starting with https://', 'warn');
    setBusy('save');
    await act(async () => { await dbx.set('settings', 'workspace', Object.assign({}, s.settings, { agencyName: name.trim() || 'Games Medya', workspaceLink: link.trim(), updatedAt: nowIso() })); logEvent('settings.update', { scope: 'agency', text: 'Updated workspace settings' }); }, 'Settings saved');
    setBusy('');
  };
  const backup = async () => { setBusy('backup'); await act(exportBackup, 'Backup downloaded'); setBusy(''); };
  return html`<${Fragment}>
    <${PageHead} eyebrow="Administration" title="Settings & backup"/>
    <${Card} title="Workspace">
      <div className="grid2"><label className="field"><span>Agency name</span><input className="input" id="set-name" value=${name} onChange=${e => setName(e.target.value)} disabled=${!role.isAdmin}/></label>
        ${HOSTED ? html`<div className="field"><span>Workspace address</span><span className="mono small" style=${{ paddingTop: '8px' }}>${location.origin}</span><small>Used in invitation messages.</small></div>` : html`<label className="field"><span>Workspace link</span><input className="input mono" id="set-link" value=${link} onChange=${e => setLink(e.target.value)} placeholder="https://claude.ai/…" disabled=${!role.isAdmin}/><small>The link of this page, used in invitation messages.</small></label>`}</div>
      ${role.isAdmin ? html`<div><button className="btn btn-primary" disabled=${busy === 'save'} onClick=${save}>Save settings</button></div>` : html`<p className="t3 small">Only admins can change workspace settings.</p>`}
    <//>
    <${Card} title="Backup & restore" sub="A backup contains every record: partnerships, projects, masterfiles, approvals, the file index with checksums, members, invitations and the full activity log.">
      <div className="between"><div><strong>Download a full backup</strong><div className="small t3">JSON file. Stored files themselves stay in storage and are referenced by checksum.${role.canFinance ? ' Includes finance.' : ''}</div></div><button className="btn" disabled=${!role.isAdmin || !!busy} onClick=${backup}>${busy === 'backup' ? html`<${Spin}/>` : html`<${Icon} n="down" s=${15}/>`}Download backup</button></div>
      <div className="between"><div><strong>Restore from a backup</strong><div className="small t3">Brings back records missing from the workspace. Existing records are kept unless you choose to overwrite; activity logs are merged, never replaced.</div></div><button className="btn" disabled=${!role.isOwner} onClick=${() => openModal('restore')}><${Icon} n="restore" s=${15}/>Restore…</button></div>
      ${!role.isOwner ? html`<p className="t3 small">Only the workspace owner can restore a backup.</p>` : null}
    <//>
    <${Card} title="Data protection">
      <div className="stack s8 small">
        <div className="row nw" style=${{ alignItems: 'flex-start' }}><${Icon} n="shield" s=${15}/><span><strong>Uploads</strong> are checksummed with SHA-256 in the browser, stored, read back and compared before they are indexed. A failed comparison is retried once, then rejected and logged.</span></div>
        <div className="row nw" style=${{ alignItems: 'flex-start' }}><${Icon} n="restore" s=${15}/><span><strong>Deleting</strong> moves partnerships, projects and files to the trash. Only the owner can delete permanently, and a tombstone record plus the log entry remain.</span></div>
        <div className="row nw" style=${{ alignItems: 'flex-start' }}><${Icon} n="pulse" s=${15}/><span><strong>Activity</strong> is written to a day-by-day log. If the connection drops, events wait in the browser and are written when it returns.</span></div>
        <div className="row nw" style=${{ alignItems: 'flex-start' }}><${Icon} n="lock" s=${15}/><span><strong>Finance</strong> records are locked on the server to the workspace owner. Customers and other editors cannot read them.</span></div>
      </div>
    <//>
  <//>`;
}
function RestoreModal() {
  const { closeModal } = useCtx();
  const [j, setJ] = useState(null); const [overwrite, setOverwrite] = useState(false); const [busy, setBusy] = useState(false); const [prog, setProg] = useState(''); const [done, setDone] = useState(null);
  const pick = async fs => { const r = await act(async () => readBackup(await fs[0].text())); if (r && r !== true) setJ(r); };
  const run = async () => { setBusy(true); const r = await act(() => restoreBackup(j, overwrite, (i, n) => setProg(i + ' / ' + n))); setBusy(false); setProg(''); if (r && r !== true) setDone(r); };
  return html`<${Modal} title="Restore from backup" onClose=${closeModal} footer=${html`<${Fragment}><button className="btn" onClick=${closeModal}>${done ? 'Close' : 'Cancel'}</button>${!done ? html`<button className="btn btn-primary" disabled=${!j || busy} onClick=${run}>${busy ? html`<${Spin}/> ${prog}` : 'Restore'}</button>` : null}<//>`}>
    ${done ? html`<div className="banner info"><div className="b-body">${done.created} records restored, ${done.overwritten} overwritten, ${done.merged} log days merged, ${done.skipped} existing records kept.</div></div>` : html`<${Fragment}>
      <div className="row"><${FileButton} label=${j ? 'Choose another file' : 'Choose backup file'} accept=".json,application/json" onFiles=${pick}/></div>
      ${j ? html`<div className="sub-card small"><div><strong>Backup from ${fmtWhen(j.exportedAt)}</strong> · ${j.agencyName || ''}</div><div className="t2">${Object.entries(j.counts || {}).map(([k, v]) => k + ' ' + v).join(' · ')}</div></div>
        <label className="row nw" style=${{ gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked=${overwrite} onChange=${e => setOverwrite(e.target.checked)}/><span className="small">Overwrite records that exist in both (otherwise only missing records are restored)</span></label>` : null}<//>`}
  <//>`;
}
