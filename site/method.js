const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let points=[]
function render(){
 const q=document.querySelector('#coverage-search').value.trim().toLowerCase()
 const rs=points.filter(p=>JSON.stringify([p.name,p.address,p.research]).toLowerCase().includes(q))
 document.querySelector('#coverage-table').innerHTML=rs.map(p=>{
  const records=p.research?.listings||[],prices=records.filter(r=>r.price_month),historic=prices.filter(r=>r.historical).length
  return `<tr><td><a href="index.html#poi=${encodeURIComponent(p.id)}">${escapeHTML(p.map_id)} ${escapeHTML(p.name)}</a><span class="poi-kind">${escapeHTML(p.address||'高德未提供完整门牌地址')}</span></td><td>${p.eligible?'测算达标':'全程条件未达标'}</td><td>${records.length} 条</td><td>${prices.length?`${prices.length}条${historic?`，含历史${historic}条`:''}`:'待补'}</td><td>${p.private_bath_confirmed?'有对应样本':'待核对'}</td><td><b>${escapeHTML(p.research?.status||'待补')}</b><span class="poi-kind">${escapeHTML(p.research?.missing_fields?.join('、')||'')}</span></td></tr>`
 }).join('')
}
fetch('data.json').then(r=>{if(!r.ok)throw new Error();return r.json()}).then(d=>{
 points=d.points
 const count=f=>points.filter(f).length
 document.querySelector('#coverage-numbers').innerHTML=`<div><strong>${points.length}</strong><span>地图点位均有核查状态</span></div><div><strong>${count(p=>p.research?.listings?.length)}</strong><span>有房源或房型样本</span></div><div><strong>${points.reduce((s,p)=>s+(p.research?.listings?.length||0),0)}</strong><span>条房源 / 房型样本记录</span></div><p>信息快照 ${escapeHTML(d.research_updated_at||d.measured_at)}，路线快照 ${escapeHTML(d.measured_at)}，点位数与当前可租房源数分别计量</p>`
 render();window.methodReady=true
}).catch(()=>{document.querySelector('#coverage-numbers').textContent='数据未能加载，请刷新重试'})
document.querySelector('#coverage-search').addEventListener('input',render)
