const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let points=[]
function render(){
 const q=document.querySelector('#coverage-search').value.trim().toLowerCase()
 const rs=points.filter(p=>JSON.stringify([p.name,p.address,p.research]).toLowerCase().includes(q))
 document.querySelector('#coverage-table').innerHTML=rs.map(p=>{
  const records=p.research?.listings||[],prices=records.filter(r=>r.current_quote_eligible&&(Date.now()-Date.parse(r.verification?.read_at))/86400000<=7)
  return `<tr><td><a href="index.html#poi=${encodeURIComponent(p.id)}">${escapeHTML(p.map_id)} ${escapeHTML(p.name)}</a><span class="poi-kind">${escapeHTML(p.address||'高德未提供完整门牌地址')}</span></td><td>${p.eligible?'测算达标':'全程条件未达标'}</td><td>${records.length} 条</td><td>${prices.length?`${prices.length} 条`:'现价待核'}</td><td>${p.private_bath_confirmed?'有对应样本':'待核对'}</td><td><b>${escapeHTML(p.research?.status||'待补')}</b><span class="poi-kind">${escapeHTML(p.research?.missing_fields?.join('、')||'')}</span></td></tr>`
 }).join('')
}
fetch('data.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(d=>{
 points=d.points
 const count=f=>points.filter(f).length
 document.querySelector('#coverage-numbers').innerHTML=`<div><strong>${points.length}</strong><span>地图点位</span></div><div><strong>${d.evidence_audit.direct_pages}</strong><span>本次直读原页</span></div><div><strong>${d.evidence_audit.current_price_records}</strong><span>条原页报价，覆盖${d.evidence_audit.current_price_pois}处</span></div><p>资料读取日 ${escapeHTML(d.evidence_audit.as_of)}，路线快照 ${escapeHTML(d.measured_at)}，原始发布日期多未披露，实际空房仍待确认</p>`
 document.querySelector('#source-audit-table').innerHTML=`<table><thead><tr><th>平台主体</th><th>全部记录</th><th>本次直读原页</th><th>可供询租报价记录</th></tr></thead><tbody>${d.evidence_audit.groups.map(g=>`<tr><td>${escapeHTML(g.name)}</td><td>${g.records}</td><td>${g.direct_pages}</td><td>${g.eligible_quotes}</td></tr>`).join('')}</tbody></table>`
 render();window.methodReady=true
}).catch(()=>{document.querySelector('#coverage-numbers').textContent='数据未能加载，请刷新重试'})
document.querySelector('#coverage-search').addEventListener('input',render)
