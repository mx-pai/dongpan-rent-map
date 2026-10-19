const $=s=>document.querySelector(s)
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const kinds={housing:'住宅小区',apartment:'公寓',hotel:'酒店',hostel:'青旅 / 青年住宿'}
const colors={walk:'#117c68',bike:'#2865b2',metro:'#7853a6',reference:'#82909e'}
let data,points=[],selected,kind='all',zoom=1,tx=0,ty=0,drag=null
const pos=loc=>{
  const [lon,lat]=Array.isArray(loc)?loc:String(loc).split(',').map(Number)
  // 高德静态图的 zoom 与标准 Mercator 瓦片级别相差一级，已用服务端标注校准
  const size=256*2**(data.map.zoom+1)*data.map.scale
  const m=(x,y)=>[size*(x+180)/360,size*(.5-Math.log((1+Math.sin(y*Math.PI/180))/(1-Math.sin(y*Math.PI/180)))/(4*Math.PI))]
  const p=m(lon,lat),c=m(116.398,40.006)
  return [1024+p[0]-c[0],768+p[1]-c[1]]
}
const mins=s=>s==null?'未测得':(s/60).toFixed(1)+' 分钟'
const shortmins=s=>s==null?'—':(s/60).toFixed(1)
const bestRide=p=>p.rail_seconds??null
const listings=p=>p.research?.listings||[]
const quoted=r=>r.price_month&&r.mode!=='方式待核'
const currentQuoted=r=>quoted(r)&&!r.historical
const evidenceNames={page:'已读取来源页面',search_extract:'搜索抓取文本',poi:'地图点位'}
function matchesRental(r,mode){return mode==='all'||({share:r.mode==='合租',whole:r.mode==='整租',apartment:r.mode==='公寓整租',room:['酒店独立客房','青旅独立单人间'].includes(r.mode),bed:r.mode==='青旅床位'}[mode])}
function filtered(){
  const mode=$('#commute').value,q=$('#search').value.trim().toLowerCase(),privateOnly=$('#private-room').checked
  const rental=$('#rental-mode').value,evidence=$('#evidence-filter').value,budget=$('#budget').value
  return points.filter(p=>{
   const records=listings(p),matching=records.filter(r=>matchesRental(r,rental))
   return(kind==='all'||p.kind===kind)&&(!privateOnly||p.private_room_confirmed)&&(!q||[p.name,p.address,p.short_name,p.room_text,p.price_text,JSON.stringify(p.research)].join(' ').toLowerCase().includes(q))&&({eligible:p.eligible,walk:p.walk_ok,bike:p.bike_ok,metro:p.metro_auto_ok||p.segment_ok,rail:p.rail20,all:true}[mode])&&(rental==='all'||matching.length>0)&&(budget==='all'||matching.some(r=>currentQuoted(r)&&r.price_month<=Number(budget)))&&({all:true,monthly:records.some(quoted),bathroom:p.private_bath_confirmed,missing:!records.some(currentQuoted)}[evidence])
  })
}
function transform(){ $('#map-scene').setAttribute('transform',`translate(${tx} ${ty}) scale(${zoom})`) }
function fit(){
 const visible=filtered();if(!visible.length)return
 const coords=visible.map(p=>pos(p.location)).concat([pos(data.destination.location)])
 let x0=Math.min(...coords.map(p=>p[0])),x1=Math.max(...coords.map(p=>p[0])),y0=Math.min(...coords.map(p=>p[1])),y1=Math.max(...coords.map(p=>p[1]))
 zoom=Math.min(3.8,2048/(x1-x0+480),1536/(y1-y0+420));zoom=Math.max(.85,zoom)
 tx=1024-(x0+x1)/2*zoom;ty=768-(y0+y1)/2*zoom;transform();drawMap()
}
function shape(p,x,y,color){
 const common=`fill="${color}"`
 if(p.kind==='apartment')return `<polygon points="${x},${y-20} ${x+20},${y} ${x},${y+20} ${x-20},${y}" ${common}/>`
 if(p.kind==='hotel')return `<rect x="${x-17}" y="${y-17}" width="34" height="34" rx="3" ${common}/>`
 if(p.kind==='hostel')return `<polygon points="${x},${y-22} ${x+22},${y+18} ${x-22},${y+18}" ${common}/>`
 return `<circle cx="${x}" cy="${y}" r="18" ${common}/>`
}
function drawMap(){
 const visible=filtered(),ordered=[...visible].sort((a,b)=>a.id===selected?.id?-1:b.id===selected?.id?1:(b.private_room_confirmed?1:0)-(a.private_room_confirmed?1:0))
 let markers='',labels='',boxes=[],labelCount=0
 const ox=pos(data.destination.location)
 for(const p of ordered){
  const [x,y]=pos(p.location),color=colors[p.category]
  markers+=`<g class="map-dot ${p.id===selected?.id?'selected':''}" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.name)}，${kinds[p.kind]}">${shape(p,x,y,color)}<text x="${x}" y="${y}" class="marker-id">${p.map_id}</text><title>${esc(p.name)}</title></g>`
  const name=p.short_name||p.name,tw=Math.min(name.length*24,335),th=32
  const placements=[[28,-14],[28,28],[-tw-28,-14],[-tw-28,28],[20,-48],[-tw-20,-48]]
  if(labelCount>=18&&p.id!==selected?.id)continue
  for(const [dx,dy]of placements){
   const box=[x+dx,y+dy-th,x+dx+tw,y+dy+6]
   if((box[0]*zoom+tx)<30||(box[2]*zoom+tx)>2018||(box[1]*zoom+ty)<95||(box[3]*zoom+ty)>1470)continue
   if(boxes.some(b=>box[0]<b[2]+12&&box[2]>b[0]-12&&box[1]<b[3]+6&&box[3]>b[1]-6))continue
   if(box[0]<ox[0]+190&&box[2]>ox[0]-35&&box[1]<ox[1]+60&&box[3]>ox[1]-80)continue
   boxes.push(box);labels+=`<text class="map-label" x="${x+dx}" y="${y+dy}">${esc(name.length>14?name.slice(0,13)+'…':name)}</text>`;labelCount++;break
  }
 }
 markers+=`<g><circle cx="${ox[0]}" cy="${ox[1]}" r="24" fill="#d45135" stroke="white" stroke-width="5"/><text x="${ox[0]}" y="${ox[1]}" class="marker-id" style="font-size:20px">A</text><text class="map-label" x="${ox[0]+32}" y="${ox[1]-25}" style="fill:#a93b25;font-weight:700">东畔 A 座</text></g>`
 $('#marker-layer').innerHTML=markers+labels
 $('#marker-layer').querySelectorAll('[data-id]').forEach(el=>{el.addEventListener('click',e=>{e.stopPropagation();select(el.dataset.id)});el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(el.dataset.id)}})})
 drawRoute()
}
function polyline(line,color,dash=''){
 if(!line||line.length<2)return ''
 const coords=line.map(pos).map(p=>p.join(',')).join(' ')
 return `<polyline points="${coords}" fill="none" stroke="white" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${coords}" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" ${dash?`stroke-dasharray="${dash}"`:''}/>`
}
function drawRoute(){
 if(!selected){$('#route-layer').innerHTML='';return}
 const mode=$('#commute').value
 let html=''
 if((mode==='metro'||selected.category==='metro')&&selected.segment_best){
  const s=selected.segment_best
  html+=polyline(s.access.polyline,s.mode==='骑行'?colors.bike:colors.walk)
  s.metro.lines.forEach(line=>{html+=polyline(line.polyline,colors.metro)})
  html+=polyline(s.egress.polyline,colors.walk)
 }else{
  const route=mode==='bike'||selected.category==='bike'?selected.bike:selected.walk
  html=polyline(route?.polyline,mode==='bike'||selected.category==='bike'?colors.bike:colors.walk)
 }
 $('#route-layer').innerHTML=html
}
function metric(label,value,ok){return value==null?'':`<div class="time-item"><span>${label}</span><strong class="${ok?'good':'over'}">${shortmins(value)}<em>分钟</em></strong></div>`}
function detail(){
 if(!selected){$('#detail').innerHTML='<p>当前筛选没有匹配点位，可以调整筛选条件</p>';return}
 const p=selected,s=p.segment_best
 let html=`<p class="detail-type">${p.map_id}　${kinds[p.kind]}${p.private_room_confirmed?'　已找到独立房间信息':''}</p><h3>${esc(p.name)}</h3><p class="detail-address">${esc(p.address)}</p><div class="status-note">${esc(p.info_status)}</div><div class="times">${metric('步行到 A 座',p.walk?.seconds,p.walk_ok)}${metric('自行车到 A 座',p.bike?.seconds,p.bike_ok)}${metric('地铁自动全程',p.metro?.seconds,p.metro_auto_ok)}${metric('分段最佳合计',s?.seconds,p.segment_ok)}${metric('地铁线路段',bestRide(p),p.rail20)}</div>`
 if(s){
  html+=`<div class="route-block"><h4>分段路线 ${p.segment_ok?'满足 20 分钟':'本次测算超出 20 分钟'}</h4><div class="route-step"><span>${s.mode}到${esc(s.entry.station)}站 ${esc(s.entry.name)}</span><b>${mins(s.access.seconds)}</b></div><div class="route-step"><span>地铁到北沙滩 A 西北口</span><b>${mins(s.metro.seconds)}</b></div><div class="route-step"><span>${s.egress_mode}到东畔 A 座</span><b>${mins(s.egress.seconds)}</b></div><div class="route-total"><span>三段按秒相加</span><span>${mins(s.seconds)}</span></div><p class="route-caveat">地铁段含站内步行、换乘及预计等车；各段向上取整至分钟相加约 ${s.rounded_total_min} 分钟，申请以 App 截图页面显示为准</p></div>`
 }
 html+=`<div class="info-block"><h4>租住信息</h4><p>${esc(p.room_text)}</p><p class="price">${esc(p.price_text)}</p>${p.phone?`<p class="phone">高德公开联系电话 ${esc(p.phone)}</p>`:''}</div>`
 const research=p.research
 if(research){
  html+=`<section class="rental-evidence"><h4>房源与房型样本 <span>${listings(p).length}</span></h4>`
  html+=listings(p).map(r=>`<article class="listing"><div class="listing-title"><b>${esc(r.title||r.community||r.layout)}</b><span>${esc(r.mode)}</span></div><strong class="listing-price">${esc(r.price_display||(r.price_month?r.price_month+' 元 / 月':'包月价未披露'))}${r.historical?' <small>历史样本</small>':''}</strong><dl><dt>户型 / 面积</dt><dd>${esc(r.layout)} · ${esc(r.area_display||(r.area_sqm?r.area_sqm+'㎡':'面积未披露'))}</dd><dt>卫浴 / 厨房</dt><dd>${esc(r.bathroom)} · ${esc(r.kitchen)}</dd><dt>租期 / 押付</dt><dd>${esc(r.terms)}</dd><dt>其他费用</dt><dd>${esc(r.fees)}</dd>${r.orientation?`<dt>朝向 / 楼层</dt><dd>${esc(r.orientation)} · ${esc(r.floor)}</dd>`:''}</dl><p class="evidence-state">${esc(r.status)} · ${esc(evidenceNames[r.evidence_type]||r.evidence_type)}</p><p class="evidence-date">原信息日期 ${esc(r.source_date||'未标明')} · 核查 ${esc(r.observed_at||research.checked_at)}</p><a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">${esc(r.source_title)} ↗</a></article>`).join('')
  html+=(research.notes||[]).map(n=>`<p class="research-note">${esc(n)}</p>`).join('')
  html+=`<details class="missing-fields"><summary>仍需核对的内容</summary><p>${esc(research.missing_fields.join('、'))}</p></details></section>`
 }
 const marker=`https://uri.amap.com/marker?position=${p.location}&name=${encodeURIComponent(p.name)}&coordinate=gaode&callnative=0&src=rent-map`
 html+=`<div class="detail-links"><a href="${marker}" target="_blank" rel="noopener noreferrer">在高德查看位置</a>${(p.sources||[]).map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`).join('')}</div>`
 $('#detail').innerHTML=html
}
function renderTable(){
 const visible=filtered()
 $('#poi-table').innerHTML=visible.map(p=>`<tr class="${p.id===selected?.id?'selected-row':''}"><td><button class="poi-name" data-id="${esc(p.id)}">${p.map_id}　${esc(p.name)}</button><span class="poi-kind">${kinds[p.kind]}${p.private_room_confirmed?' / 独立房间有来源':''}</span></td><td class="${p.walk_ok?'good':''}">${mins(p.walk?.seconds)}</td><td class="${p.bike_ok?'good':''}">${mins(p.bike?.seconds)}</td><td class="${p.metro_auto_ok?'good':''}">${mins(p.metro?.seconds)}</td><td class="${p.segment_ok?'good':''}">${p.segment_best?mins(p.segment_best.seconds):'未分段测量'}</td><td>${esc(p.price_text)}<span class="poi-kind">${esc(p.info_status)}</span></td></tr>`).join('')
 $('#poi-table').querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>{select(b.dataset.id);$('.explorer').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}))
 $('#empty-state').hidden=visible.length>0
 $('#result-count').textContent=`显示 ${visible.length} 个点位，已测共 ${points.length} 个，其中 ${points.filter(p=>p.eligible).length} 个至少有一种通勤方案达标`
}
function select(id){selected=points.find(p=>p.id===id);if(!selected)return;history.replaceState(null,'','#poi='+encodeURIComponent(id));$('#detail').scrollTop=0;detail();renderTable();drawMap()}
function update(refit=false){const f=filtered();if(!f.some(p=>p.id===selected?.id))selected=f[0]||null;renderTable();detail();if(refit)fit();else drawMap()}
document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});update(true)}))
$('#commute').addEventListener('change',()=>update(true));$('#search').addEventListener('input',()=>update(true));$('#private-room').addEventListener('change',()=>update(true))
for(const id of ['rental-mode','evidence-filter','budget'])$('#'+id).addEventListener('change',()=>update(true))
function zoomAt(factor,x=1024,y=768){const nz=Math.min(6,Math.max(.7,zoom*factor));tx=x-(x-tx)*nz/zoom;ty=y-(y-ty)*nz/zoom;zoom=nz;transform();drawMap()}
$('#zoom-in').addEventListener('click',()=>zoomAt(1.3));$('#zoom-out').addEventListener('click',()=>zoomAt(1/1.3));$('#reset-view').addEventListener('click',fit)
function pointFromEvent(e){const p=$('#map').createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform($('#map').getScreenCTM().inverse())}
$('#map').addEventListener('wheel',e=>{e.preventDefault();const p=pointFromEvent(e);zoomAt(e.deltaY<0?1.1:1/1.1,p.x,p.y)},{passive:false})
$('#map').addEventListener('pointerdown',e=>{if(e.target.closest('.map-dot'))return;const p=pointFromEvent(e);drag={x:p.x,y:p.y,tx,ty};$('#map').setPointerCapture(e.pointerId)})
$('#map').addEventListener('pointermove',e=>{if(!drag)return;const p=pointFromEvent(e);tx=drag.tx+p.x-drag.x;ty=drag.ty+p.y-drag.y;transform()})
$('#map').addEventListener('pointerup',()=>{if(drag){drag=null;drawMap()}});$('#map').addEventListener('pointercancel',()=>drag=null)
$('#download-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({measured_at:data.measured_at,destination:data.destination,points:filtered()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='东畔租房点位清单.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})
fetch('data.json').then(r=>{if(!r.ok)throw new Error('数据加载失败');return r.json()}).then(d=>{data=d;points=d.points;const id=new URLSearchParams(location.hash.slice(1)).get('poi');selected=points.find(p=>p.id===id)||points.find(p=>p.id==='B0H2NHE1PB')||points[0];if(id&&!selected.eligible)$('#commute').value='all';const count=p=>points.filter(p).length;$('#research-summary').innerHTML=`<div><strong>${points.length}</strong><span>地图点位</span></div><div><strong>${count(p=>listings(p).length>0)}</strong><span>已有房源 / 房型样本</span></div><div><strong>${count(p=>listings(p).some(currentQuoted))}</strong><span>有非历史月租样本</span></div><div><strong>${count(p=>p.eligible)}</strong><span>通勤测算达标</span></div><p>公开资料逐项核查，价格与房态按原始来源确认，<a href="method.html#coverage">查看全部点位的信息覆盖和缺项</a></p>`;renderTable();detail();fit();window.rentMapReady=true}).catch(()=>{$('#result-count').textContent='点位数据未能加载，请刷新页面重试'})
