/* ===================== dashboards: one project or all projects consolidated ===================== */
function creatorKeys(inf) {
  const ks = enabledPlats(inf).map(k => k + ':' + String((inf.platforms[k] || {}).handle || '').replace(/^@/, '').toLowerCase()).filter(k => !/:$/.test(k));
  return ks.length ? ks : ['name:' + String(inf.name || '').trim().toLowerCase()];
}
// The same creator can sit in several projects, sometimes with only one of their platforms; rows that share a handle are one person.
function groupCreators(infs) {
  const parent = {};
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const inf of infs) { const ks = creatorKeys(inf); ks.forEach(k => { if (!(k in parent)) parent[k] = k; }); for (let i = 1; i < ks.length; i++) { const a = find(ks[0]), b = find(ks[i]); if (a !== b) parent[b] = a; } }
  const groups = {};
  for (const inf of infs) { const root = find(creatorKeys(inf)[0]); (groups[root] = groups[root] || []).push(inf); }
  return Object.entries(groups).map(([key, rows]) => {
    rows.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    const plats = {};
    for (const r of rows) for (const k of enabledPlats(r)) {
      const x = r.platforms[k]; const cur = plats[k];
      if (!cur) plats[k] = { handle: x.handle, followers: isNum(x.followers) ? +x.followers : null, er: isNum(x.er) ? +x.er : null };
      else { if (isNum(x.followers) && (cur.followers === null || +x.followers > cur.followers)) cur.followers = +x.followers; if (cur.er === null && isNum(x.er)) cur.er = +x.er; }
    }
    const followers = Object.values(plats).reduce((t, p) => t + (p.followers || 0), 0);
    const ers = Object.values(plats).map(p => p.er).filter(v => v !== null);
    return { key, name: rows[0].name, rows, plats, tier: rows[0].tier, followers, profileEr: ers.length ? ers.reduce((t, v) => t + v, 0) / ers.length : null, projects: new Set(rows.map(r => r.projectId)).size };
  });
}
function weekOf(dateStr) { if (!dateStr) return null; const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00'); if (isNaN(d)) return null; const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return ymd(d); }
function dashData(s, prs) {
  const pieces = [], perProject = [];
  const fun = { target: 0, assigned: 0, approved: 0, live: 0, data: 0 };
  const allRows = [];
  for (const pr of prs) {
    const infs = infsOf(s, pr.id); const m = projectMetrics(pr, infs);
    const listed = infs.length, approved = infs.filter(i => i.state === 'approved').length;
    allRows.push(...infs.filter(i => i.state === 'approved' || asgList(i).length));
    fun.target += m.totalQty; fun.assigned += m.asgTotal; fun.approved += m.asgApproved; fun.live += m.asgLive; fun.data += m.asgData;
    const ps = [];
    for (const inf of infs) for (const a of asgList(inf)) if (a.publish && a.publish.status === 'live') { const x = { pr, inf, a, m: perfOf(a) }; pieces.push(x); ps.push(x); }
    const withD = ps.filter(x => x.m.has);
    const views = withD.reduce((t, x) => t + (x.m.views || 0), 0), reach = withD.reduce((t, x) => t + (x.m.reach || 0), 0);
    const eng = withD.reduce((t, x) => t + x.m.eng, 0), base = withD.reduce((t, x) => t + (x.m.base || 0), 0), engB = withD.reduce((t, x) => t + (x.m.base ? x.m.eng : 0), 0);
    perProject.push({ pr, p: partnerOf(s, pr.partnershipId), listed, approved, metrics: m, live: ps.length, withData: withD.length, views, reach, eng, er: base ? engB / base * 100 : null });
  }
  const withData = pieces.filter(x => x.m.has);
  const sum = k => withData.reduce((t, x) => t + (x.m[k] || 0), 0);
  const base = withData.reduce((t, x) => t + (x.m.base || 0), 0), engB = withData.reduce((t, x) => t + (x.m.base ? x.m.eng : 0), 0);
  const creators = groupCreators(allRows);
  const byKey = {}; creators.forEach(c => c.rows.forEach(r => { byKey[r.id] = c; }));
  for (const c of creators) Object.assign(c, { live: 0, withData: 0, views: 0, reach: 0, eng: 0, base: 0, engB: 0 });
  for (const x of pieces) { const c = byKey[x.inf.id]; if (!c) continue; c.live++; if (x.m.has) { c.withData++; c.views += x.m.views || 0; c.reach += x.m.reach || 0; c.eng += x.m.eng; c.base += x.m.base || 0; c.engB += x.m.base ? x.m.eng : 0; } }
  creators.forEach(c => { c.er = c.base ? c.engB / c.base * 100 : null; });
  const group = (keyFn, labelFn) => { const o = {}; withData.forEach(x => { const k = keyFn(x); const g = o[k] = o[k] || { key: k, label: labelFn(x), views: 0, reach: 0, eng: 0, base: 0, engB: 0, n: 0 }; g.views += x.m.views || 0; g.reach += x.m.reach || 0; g.eng += x.m.eng; g.base += x.m.base || 0; g.engB += x.m.base ? x.m.eng : 0; g.n++; }); return Object.values(o).map(g => Object.assign(g, { er: g.base ? g.engB / g.base * 100 : 0 })).sort((a, b) => b.views - a.views); };
  const weeks = {}; pieces.forEach(x => { const w = weekOf(x.a.publish.postedDate || x.a.publish.at); if (!w) return; const g = weeks[w] = weeks[w] || { week: w, posted: 0, views: 0 }; g.posted++; g.views += x.m.views || 0; });
  const profileErs = creators.map(c => c.profileEr).filter(v => v !== null);
  return {
    prs, perProject, pieces, withData, creators, fun,
    totals: { views: sum('views'), reach: sum('reach'), impressions: sum('impressions'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), saves: sum('saves'), eng: withData.reduce((t, x) => t + x.m.eng, 0), er: base ? engB / base * 100 : null },
    rows: allRows.length, unique: creators.length, potential: creators.reduce((t, c) => t + c.followers, 0),
    profileEr: profileErs.length ? profileErs.reduce((t, v) => t + v, 0) / profileErs.length : null,
    byDeliverable: group(x => x.a.platform + ':' + x.a.type, x => dLabel(x.a.platform, x.a.type)),
    byPlatform: group(x => x.a.platform, x => PLATFORMS[x.a.platform] ? PLATFORMS[x.a.platform].label : x.a.platform),
    byTier: group(x => x.inf.tier || 'other', x => TIERS[x.inf.tier] ? TIERS[x.inf.tier].label : 'Other'),
    weeks: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)),
  };
}
function dashScope(s, role, id) {
  const parts = visibleParts(s, role);
  const pids = new Set(parts.map(p => p.id));
  const all = s.projects.filter(pr => isActive(pr) && pids.has(pr.partnershipId)).sort(byCreated);
  if (id && id.indexOf('j-') === 0) { const pr = all.find(x => x.id === id.slice(2)); if (pr) return { kind: 'project', label: pr.name, prs: [pr], parts, all }; }
  if (id && id.indexOf('p-') === 0) { const p = parts.find(x => x.id === id.slice(2)); if (p) return { kind: 'partnership', label: p.name + ' · all projects', prs: all.filter(x => x.partnershipId === p.id), parts, all }; }
  return { kind: 'all', label: 'All projects', prs: all, parts, all };
}
function VBars({ rows, fmt, label }) {
  const max = Math.max(1e-9, ...rows.map(r => r.value || 0));
  if (!rows.length) return html`<p className="t3">No data yet.</p>`;
  return html`<div className="vbars" role="img" aria-label=${label}>${rows.map(r => html`<div className="vbar" key=${r.key} title=${r.title || ''}><span className="vbar-val">${fmt(r.value)}</span><span className="vbar-track"><i style=${{ height: Math.max(2, (r.value || 0) / max * 100) + '%' }}></i></span><span className="vbar-lbl">${r.label}</span></div>`)}</div>`;
}
function Funnel({ fun }) {
  const steps = [['Target', fun.target, 'pieces in scope'], ['Assigned', fun.assigned, 'to creators'], ['Previews approved', fun.approved, 'by the customer'], ['Posted', fun.live, 'live content'], ['With data', fun.data, 'performance in']];
  const top = Math.max(1, fun.target, fun.assigned);
  return html`<div className="funnel">${steps.map(([l, v, d], i) => html`<div key=${l} className="fstep"><div className="between"><span className="small"><strong>${l}</strong> <span className="t3">${d}</span></span><span className="num mono">${fmtInt(v)}${i && steps[0][1] ? html`<span className="t3 xs"> · ${Math.round(v / steps[0][1] * 100)}%</span>` : null}</span></div><div className="bar"><i style=${{ width: Math.min(100, v / top * 100) + '%' }}></i></div></div>`)}</div>`;
}
const DASH_SORT = { name: c => String(c.name).toLowerCase(), followers: c => c.followers, projects: c => c.projects, live: c => c.live, views: c => c.views, reach: c => c.reach, eng: c => c.eng, er: c => c.er === null ? -1 : c.er, profileEr: c => c.profileEr === null ? -1 : c.profileEr };
function DashboardsPage({ id }) {
  const { s, role, go } = useCtx();
  const sc = dashScope(s, role, id);
  const [sort, setSort] = useState(['views', 'desc']);
  const d = useMemo(() => dashData(s, sc.prs), [s.projects, s.influencers, s.partnerships, id, role.status]);
  const value = sc.kind === 'project' ? 'j-' + sc.prs[0].id : sc.kind === 'partnership' ? id : 'all';
  const setScope = v => go({ view: 'dashboards', id: v === 'all' ? null : v });
  if (!sc.all.length) return html`<${Fragment}><${PageHead} eyebrow="Analytics" title="Dashboards"/><${Empty} title="No projects yet">${role.canAgency ? 'Create a project under a partnership; its creators, delivery and performance appear here.' : 'Projects the agency runs for you appear here with their results.'}<//><//>`;
  const t = d.totals;
  const [sk, sd] = sort;
  const creators = d.creators.slice().sort((a, b) => { const x = DASH_SORT[sk](a), y = DASH_SORT[sk](b); return (x < y ? -1 : x > y ? 1 : 0) * (sd === 'desc' ? -1 : 1); });
  const th = (k, l, r) => html`<th className=${r ? 'r' : ''}><button className="th-sort" aria-sort=${sk === k ? (sd === 'desc' ? 'descending' : 'ascending') : 'none'} onClick=${() => setSort(sk === k ? [k, sd === 'desc' ? 'asc' : 'desc'] : [k, k === 'name' ? 'asc' : 'desc'])}>${l}${sk === k ? (sd === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>`;
  const exportCsv = async () => {
    const q = v => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const lines = [['Influencer', 'Instagram', 'TikTok', 'Tier', 'Followers', 'Projects', 'Live pieces', 'Views', 'Reach', 'Engagements', 'ER %', 'Profile ER %'].map(q).join(',')];
    creators.forEach(c => lines.push([c.name, (c.plats.instagram || {}).handle || '', (c.plats.tiktok || {}).handle || '', TIERS[c.tier] ? TIERS[c.tier].label : '', c.followers, c.projects, c.live, c.views, c.reach, c.eng, c.er === null ? '' : c.er.toFixed(2), c.profileEr === null ? '' : c.profileEr.toFixed(2)].map(q).join(',')));
    lines.push(''); lines.push(['Project', 'Partnership', 'Approved creators', 'Delivered', 'Target', 'Views', 'Reach', 'Engagements', 'ER %'].map(q).join(','));
    d.perProject.forEach(x => lines.push([x.pr.name, x.p ? x.p.name : '', x.approved, x.metrics.delivered, x.metrics.totalQty, x.views, x.reach, x.eng, x.er === null ? '' : x.er.toFixed(2)].map(q).join(',')));
    const ok = await act(() => CAP.downloads.save({ filename: slug(sc.label) + '_dashboard_' + fileStamp() + '.csv', data: '﻿' + lines.join('\n') }));
    if (ok) logEvent('dashboard.export', { scope: role.isCustomer ? undefined : 'agency', pid: sc.kind !== 'all' ? sc.prs[0] && sc.prs[0].partnershipId : undefined, text: 'Exported the ' + sc.label + ' dashboard' });
  };
  const live = d.pieces.length, cov = d.withData.length;
  const delivered = d.perProject.reduce((a, x) => a + x.metrics.delivered, 0), target = d.perProject.reduce((a, x) => a + x.metrics.totalQty, 0);
  return html`<${Fragment}>
    <${PageHead} eyebrow="Analytics" title="Dashboards" meta=${html`<span className="t3 small">${sc.kind === 'all' ? 'Consolidated across ' + plural(sc.prs.length, 'project') + ' in ' + plural(new Set(sc.prs.map(x => x.partnershipId)).size, 'partnership') : sc.label}</span>`}
      actions=${html`<select className="input" id="dash-scope" style=${{ width: 'auto', minWidth: '220px' }} value=${value} onChange=${e => setScope(e.target.value)} aria-label="Dashboard scope">
        <option value="all">All projects (consolidated)</option>
        ${sc.parts.map(p => { const ps = sc.all.filter(x => x.partnershipId === p.id); return ps.length ? html`<optgroup key=${p.id} label=${p.name}><option value=${'p-' + p.id}>${p.name} · all projects</option>${ps.map(pr => html`<option key=${pr.id} value=${'j-' + pr.id}>${pr.name}</option>`)}</optgroup>` : null; })}
      </select>${CAP.downloads ? html`<button className="btn" onClick=${exportCsv}><${Icon} n="down" s=${15}/>Export CSV</button>` : null}${sc.kind === 'project' ? html`<button className="btn" onClick=${() => go({ view: 'project', id: sc.prs[0].id, tab: 'performance' })}>Open project</button>` : null}`}/>
    <div className="stack s16">
      <div className="kpis">
        <${Kpi} l="Views" v=${fmtK(t.views)} s=${fmtInt(t.views)}/>
        <${Kpi} l="Reach" v=${fmtK(t.reach)} s=${fmtInt(t.reach)}/>
        <${Kpi} l="Impressions" v=${fmtK(t.impressions)} s=${fmtInt(t.impressions)}/>
        <${Kpi} l="Engagements" v=${fmtK(t.eng)} s=${fmtK(t.likes) + ' likes · ' + fmtK(t.comments) + ' comments · ' + fmtK(t.shares) + ' shares · ' + fmtK(t.saves) + ' saves'}/>
        <${Kpi} l="Engagement rate" v=${fmtPct(t.er)} s="engagements ÷ views (reach for stories)"/>
        <${Kpi} l="Content with data" v=${cov + '/' + live} cls=${cov < live ? 'warn' : ''} s=${live ? plural(live - cov, 'live piece') + ' without data' : 'nothing posted yet'}/>
      </div>
      <div className="kpis">
        <${Kpi} l="Unique influencers" v=${fmtInt(d.unique)} s=${plural(d.rows, 'masterfile row') + ' across ' + plural(sc.prs.length, 'project')}/>
        <${Kpi} l="Potential reach" v=${fmtK(d.potential)} s="followers of the unique creators"/>
        <${Kpi} l="Avg. profile ER" v=${fmtPct(d.profileEr)} s="from the masterfile, per creator"/>
        <${Kpi} l="Delivered" v=${delivered + '/' + target} s=${target ? Math.round(delivered / target * 100) + '% of content in scope' : 'no content target'}/>
        <${Kpi} l="Nano · Micro" v=${d.creators.filter(c => c.tier === 'nano').length + ' · ' + d.creators.filter(c => c.tier === 'micro').length} s="unique creators by type"/>
        <${Kpi} l=${sc.kind === 'all' ? 'Projects' : 'Partnership'} v=${sc.kind === 'all' ? sc.prs.length : (partnerOf(s, sc.prs[0] && sc.prs[0].partnershipId) || {}).name || '—'} s=${sc.kind === 'all' ? plural(new Set(sc.prs.map(x => x.partnershipId)).size, 'partnership') : plural(sc.prs.length, 'project')}/>
      </div>
      <div className="grid2">
        <${Card} title="Delivery funnel" sub="From content in scope to posts with performance data"><${Funnel} fun=${d.fun}/><//>
        <${Card} title="Posted per week" sub="Pieces posted and their views, by week of posting"><${VBars} label="Pieces posted per week" fmt=${v => String(v)} rows=${d.weeks.map(w => ({ key: w.week, label: fmtDate(w.week).replace(/ \d{4}$/, ''), value: w.posted, title: w.week + ': ' + w.posted + ' posted, ' + fmtInt(w.views) + ' views' }))}/><//>
      </div>
      <div className="grid2">
        <${Card} title="Views by deliverable"><${HBars} rows=${d.byDeliverable.map(o => ({ key: o.key, label: o.label + ' (' + o.n + ')', value: o.views }))} fmt=${fmtK}/><//>
        <${Card} title="Engagement rate by deliverable"><${HBars} rows=${d.byDeliverable.map(o => ({ key: o.key, label: o.label, value: o.er }))} fmt=${fmtPct}/><//>
      </div>
      <div className="grid2">
        <${Card} title="Views by platform"><${HBars} rows=${d.byPlatform.map(o => ({ key: o.key, label: o.label + ' (' + o.n + ')', value: o.views }))} fmt=${fmtK}/><//>
        <${Card} title="Engagement rate by creator type"><${HBars} rows=${d.byTier.map(o => ({ key: o.key, label: o.label + ' (' + o.n + ')', value: o.er }))} fmt=${fmtPct}/><//>
      </div>
      <${Card} title="Influencers" sub=${plural(d.unique, 'unique creator') + '. The same person in several projects is counted once (matched by handle).'} flush=${true}>
        <div className="tbl-wrap"><table className="tbl" id="dash-creators"><thead><tr><th>#</th>${th('name', 'Influencer')}<th>Handles</th><th>Type</th>${th('followers', 'Followers', 1)}${sc.prs.length > 1 ? th('projects', 'Projects', 1) : null}${th('live', 'Live', 1)}${th('views', 'Views', 1)}${th('reach', 'Reach', 1)}${th('eng', 'Engagements', 1)}${th('er', 'ER', 1)}${th('profileEr', 'Profile ER', 1)}</tr></thead><tbody>
          ${creators.length ? creators.map((c, i) => html`<tr key=${c.key}><td className="idx">${i + 1}</td><td><strong>${c.name}</strong></td><td><div className="row nw" style=${{ gap: '6px' }}>${Object.entries(c.plats).map(([k, p]) => html`<span key=${k} className="row nw" style=${{ gap: '4px' }}><${Plat} p=${k}/><span className="mono xs">@${p.handle}</span></span>`)}</div></td><td>${TIERS[c.tier] ? html`<span className="tag">${TIERS[c.tier].short}</span>` : '—'}</td><td className="r num">${fmtK(c.followers)}</td>${sc.prs.length > 1 ? html`<td className="r num">${c.projects}</td>` : null}<td className="r num">${c.live}</td><td className="r num">${c.withData ? fmtInt(c.views) : '—'}</td><td className="r num">${c.withData ? fmtInt(c.reach) : '—'}</td><td className="r num">${c.withData ? fmtInt(c.eng) : '—'}</td><td className="r num">${fmtPct(c.er)}</td><td className="r num">${fmtPct(c.profileEr)}</td></tr>`) : html`<tr><td colSpan="12" className="t3" style=${{ padding: '20px 12px' }}>No approved creators yet.</td></tr>`}
        </tbody></table></div>
      <//>
      ${sc.prs.length > 1 ? html`<${Card} title="Projects" flush=${true}><div className="tbl-wrap"><table className="tbl" id="dash-projects"><thead><tr><th>Project</th><th>Partnership</th><th className="r">Creators</th><th className="r">Delivered</th><th className="r">Views</th><th className="r">Reach</th><th className="r">Engagements</th><th className="r">ER</th><th>Progress</th></tr></thead><tbody>
        ${d.perProject.map(x => html`<tr key=${x.pr.id} className="click" onClick=${() => setScope('j-' + x.pr.id)}><td><strong>${x.pr.name}</strong></td><td>${x.p ? x.p.name : '—'}</td><td className="r num">${x.approved}<span className="t3 xs"> / ${x.listed}</span></td><td className="r num">${x.metrics.delivered}<span className="t3 xs"> / ${x.metrics.totalQty || '—'}</span></td><td className="r num">${x.withData ? fmtInt(x.views) : '—'}</td><td className="r num">${x.withData ? fmtInt(x.reach) : '—'}</td><td className="r num">${x.withData ? fmtInt(x.eng) : '—'}</td><td className="r num">${fmtPct(x.er)}</td><td style=${{ minWidth: '120px' }}><${MiniTrack} m=${x.metrics}/></td></tr>`)}
      </tbody></table></div><//>` : null}
      <p className="t3 xs">Views, reach and engagements come from the performance data of live posts (creator reports and public metrics). Profile ER is the creator's usual engagement rate from the masterfile. ER = (likes + comments + shares + saves) ÷ views, or ÷ reach for stories, unless the report states it.</p>
    </div>
  <//>`;
}
