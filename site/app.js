const $=s=>document.querySelector(s)
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const kinds={housing:'住宅小区',apartment:'公寓',hotel:'酒店',hostel:'青旅 / 青年住宿'}
const mins=s=>s==null?'未测得':(s/60).toFixed(1)+' 分钟'
const shortmins=s=>s==null?'—':(s/60).toFixed(1)
const bestRide=p=>p.rail_seconds??null
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
let data,points=[],selected,kind='all',mapUI,routeMode='walk',showRoute=true,savedOnly=false,quoteOnly=false,saved=new Set()
try{const value=JSON.parse(localStorage.getItem('dongpan-saved-v1')||'[]');if(Array.isArray(value))saved=new Set(value.filter(id=>typeof id==='string'))}catch{}
const listings=RentalEvidence.records,recentRead=RentalEvidence.recent,currentQuoted=RentalEvidence.current
function recordFilters(){return {source:$('#source-filter').value,rental:$('#rental-mode').value,evidence:$('#evidence-filter').value,budget:$('#budget').value==='all'?null:Number($('#budget').value),privateRoom:$('#private-room').checked,recentOnly:quoteOnly}}
const matchingRecords=p=>listings(p).filter(r=>RentalEvidence.matches(r,recordFilters()))
const priceText=p=>RentalEvidence.priceSummary(matchingRecords(p))
const lowestPrice=p=>Math.min(...matchingRecords(p).filter(r=>currentQuoted(r)).map(r=>r.price_month))
function shortPrice(p){const prices=matchingRecords(p).filter(r=>currentQuoted(r)).map(r=>r.price_month);if(!prices.length)return '<span class="price-unknown">月租待核</span>';const low=Math.min(...prices);return `<b>¥${low.toLocaleString('zh-CN')}</b><small>${new Set(prices).size>1?'起 / 月':'/ 月'}</small>`}
const evidenceNames={live_http_page:'本次读取原页',browser_page:'本次读取浏览器原页',page:'旧页面摘录，本次未直读',search_extract:'搜索索引线索',poi:'地图点位'}
function filtered(options={}){
  const mode=$('#commute').value,q=$('#search').value.trim().toLowerCase(),f={...recordFilters(),...options}
  const constrained=f.source!=='all'||f.rental!=='all'||f.evidence!=='all'||f.budget||f.privateRoom||f.recentOnly
  const visible=points.filter(p=>(!constrained||listings(p).some(r=>RentalEvidence.matches(r,f)))&&(!savedOnly||saved.has(p.id))&&(kind==='all'||p.kind===kind)&&(!q||[p.name,p.address,p.short_name,p.room_text,JSON.stringify(p.research)].join(' ').toLowerCase().includes(q))&&({eligible:p.eligible,walk:p.walk_ok,bike:p.bike_ok,metro:p.metro_auto_ok||p.segment_ok,rail:p.rail20,all:true}[mode]))
  const sort=$('#sort').value,walk=p=>p.walk?.seconds??Infinity,bike=p=>p.bike?.seconds??Infinity
  return visible.sort((a,b)=>sort==='price'?(lowestPrice(a)-lowestPrice(b)||walk(a)-walk(b)):sort==='walk'?walk(a)-walk(b):sort==='bike'?bike(a)-bike(b):(Number(Number.isFinite(lowestPrice(b)))-Number(Number.isFinite(lowestPrice(a)))||walk(a)-walk(b)))
}
function toast(message){clearTimeout(toast.timer);$('#toast').textContent=message;$('#toast').classList.add('visible');toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2200)}
async function copy(text,message='已复制'){
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);toast(message);return}}catch{}
 const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.cssText='position:fixed;top:0;left:0;opacity:0;pointer-events:none';document.body.append(area);area.select()
 let ok=false;try{ok=document.execCommand('copy')}catch{}area.remove()
 if(ok)toast(message)
 else{$('#copy-fallback').value=text;$('#copy-dialog').showModal();$('#copy-fallback').select()}
}
function placeText(p){return `北京 ${p.name}\n地址：${p.address}\n高德坐标 GCJ-02：${p.location}\n${AmapLinks.marker(p)}`}
function shareLink(){const url=new URL(location.href);url.hash=new URLSearchParams({poi:selected.id,route:routeMode});return url.href}
function writeHash(){if(selected)history.replaceState(null,'','#'+new URLSearchParams({poi:selected.id,route:routeMode}))}
function modeAvailable(p,mode){return mode==='segment'?Boolean(p.segment_best):Boolean(p[mode])}
function defaultMode(p){const filter=$('#commute').value;if(['walk','bike'].includes(filter)&&p[filter])return filter;if(['metro','rail'].includes(filter))return p.segment_best?'segment':p.metro?'metro':'walk';return p.category==='walk'?'walk':p.category==='bike'?'bike':p.segment_best?'segment':p.metro?'metro':'walk'}
function routeSeconds(p,mode=routeMode){return mode==='segment'?p.segment_best?.seconds:p[mode]?.seconds}
function routeText(p){
 const heading=`${p.name} → ${data.destination.name}`
 if(routeMode==='segment'){
  const s=p.segment_best
  return [heading,...AmapLinks.legs(p,data).map((leg,i)=>`${i+1}. ${leg.title}（${mins(leg.seconds)}）\n${AmapLinks.route(leg.from,leg.to,leg.mode)}`),`三段合计 ${mins(s.seconds)}，各段向上取整合计约 ${s.rounded_total_min} 分钟`,`测算时间 ${data.transit_time}，申请以地图页面显示时长与截图为准`].join('\n\n')
 }
 return `${heading}\n${({walk:'步行',bike:'自行车骑行',metro:'地铁自动全程'})[routeMode]} ${mins(routeSeconds(p))}\n${AmapLinks.route(p,data.destination,routeMode)}\n高德打开后按当前条件重新规划`
}
function savePoint(id){
 if(saved.has(id))saved.delete(id);else saved.add(id)
 try{localStorage.setItem('dongpan-saved-v1',JSON.stringify([...saved]))}catch{}
 $('#saved-count').textContent=saved.size
 toast(saved.has(id)?'已加入备选，可在「带到高德」中查看地点组':'已移出备选')
 if(savedOnly)update(false);else{renderList();detail();renderTable()}
}
function switchPanel(name,expand=false){
 $('.list-sort').hidden=name!=='list'
 for(const id of ['list','detail']){
  const active=id===name,tab=$('#tab-'+id)
  tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1
  $(id==='list'?'#place-list':'#detail').hidden=!active
 }
 if(expand&&matchMedia('(max-width:720px)').matches)setPanelExpanded(true)
}
function setPanelExpanded(expanded){$('.place-panel').classList.toggle('is-expanded',expanded);$('#collapse-panel').setAttribute('aria-expanded',String(expanded));$('#collapse-panel').setAttribute('aria-label',expanded?'收起地点面板':'展开地点面板');$('#collapse-panel').textContent=expanded?'收起':'展开'}
function metric(label,value,ok){return value==null?'':`<div class="time-item"><span>${label}</span><strong class="${ok?'good':'over'}">${shortmins(value)}<em>分钟</em></strong></div>`}
function dateLabel(value){
 if(value==null)return '未披露'
 if(typeof value==='string')return value
 if(Array.isArray(value))return value.map(v=>[v.room,v.date||v.raw].filter(Boolean).join('：')).join('；')
 return value.raw||value.exact_date||value.date||'未披露'
}
function readTime(value){if(!value)return '本次未直接读取';return new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}
function listingCard(r){
 const expired=r.freshness?.code==='page_price'&&!currentQuoted(r),fresh=expired?'reference':r.freshness?.code||'reference',label=expired?'读取或活跃时间已过期，现价待核':r.freshness?.label||'资料待核'
 const area=r.area_display||(r.area_sqm?r.area_sqm+'㎡':'面积待核'),bath=RentalEvidence.bathroomLabel(r)
 const rooms=r.rooms?.length?`<div class="room-observations"><b>官网房号与可入住状态</b>${r.rooms.map(room=>`<p>${esc(room.room_number)}号 · ${room.price_month}元/月 · ${esc(room.source_state)}</p>`).join('')}</div>`:''
 return `<article class="listing" data-freshness="${esc(fresh)}"><div class="source-badges"><b>${esc(r.source_group||'来源待核')}</b><span>${esc(label)}</span></div><h5 class="listing-name">${esc(r.title||[r.community,r.layout].filter(Boolean).join(' ')||r.source_title)}</h5><div class="listing-price-line"><strong class="listing-price">${esc(r.price_display||(r.price_month?r.price_month.toLocaleString('zh-CN')+' 元 / 月':'包月价待核'))}</strong><span>${esc(r.mode)}</span></div><div class="room-facts"><span>${esc(area)}</span><span>${esc(bath)}</span>${r.orientation?`<span>${esc(r.orientation)}</span>`:''}</div><p class="listing-fees">${esc(r.fees||'附加费用待核')}</p><div class="listing-source"><a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">查看${esc(r.source_group||'房源')}原页 ↗</a><span>${r.verification?.read_at?esc(new Date(r.verification.read_at).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}))+' 读取':'日期待核'}</span></div><details class="listing-more"><summary>房型、租期与日期详情</summary><dl><dt>户型 / 房间面积</dt><dd>${esc(r.layout)} · ${esc(area)}</dd><dt>卫浴 / 厨房</dt><dd>${esc(r.bathroom)} · ${esc(r.kitchen)}</dd><dt>租期 / 押付</dt><dd>${esc(r.terms)}</dd>${r.orientation?`<dt>朝向 / 楼层</dt><dd>${esc(r.orientation)} · ${esc(r.floor)}</dd>`:''}<dt>原始发布 / 房源更新</dt><dd>${esc(r.original_published_at||'未披露')} / ${esc(r.listing_updated_at||'未披露')}</dd>${r.publisher_last_active_at?`<dt>发布者最后登录</dt><dd>${esc(r.publisher_last_active_at)}（用户活跃记录）</dd>`:''}${r.available_from?`<dt>可入住时间</dt><dd>${esc(dateLabel(r.available_from))}</dd>`:''}${r.source_date?`<dt>原资料日期标签</dt><dd>${esc(r.source_date)}（日期含义未复核）</dd>`:''}<dt>本次读取原页</dt><dd>${esc(readTime(r.verification?.read_at))}</dd></dl>${rooms}<p class="evidence-state">${esc(r.status)} · ${esc(evidenceNames[r.evidence_type]||r.evidence_type)}</p>${(r.limitations||[]).map(n=>`<p class="record-limit">${esc(n)}</p>`).join('')}</details></article>`
}
function detail(){
 if(!selected){$('#detail').innerHTML='<p class="list-empty">从地图或清单选择地点，查看报价和通勤路线</p>';return}
 const p=selected,s=p.segment_best,records=matchingRecords(p),primary=records.filter(r=>currentQuoted(r)),reference=records.filter(r=>!primary.includes(r))
 const sourceNames=[...new Set(primary.map(r=>r.source_group))],room=primary.length===1?primary[0]:null,roomFacts=room?[room.area_display||(room.area_sqm?room.area_sqm+'㎡':''),room.mode,RentalEvidence.bathroomLabel(room)].filter(Boolean).join(' · '):'',modeNames={walk:'步行',bike:'骑行',segment:'分段地铁',metro:'自动地铁'}
 let html=`<p class="detail-type">${p.map_id}　${kinds[p.kind]}</p><h3>${esc(p.name)}</h3><p class="detail-address">${esc(p.address||'完整门牌待核')}</p><div class="place-actions"><button class="action-primary" data-action="copy-place">复制地点</button><a href="${AmapLinks.marker(p)}" target="_blank" rel="noopener noreferrer">高德打开 ↗</a><button data-action="save" data-id="${p.id}" aria-pressed="${saved.has(p.id)}">${saved.has(p.id)?'已加入备选':'加入备选'}</button></div><div class="rent-overview"><div class="overview-price">${shortPrice(p)}</div><p>${primary.length?esc(primary.length+'条匹配报价 · '+sourceNames.join('、')):'当前条件下暂无近期原页报价'}</p>${roomFacts?`<p class="overview-room">${esc(roomFacts)}</p>`:''}<span>页面标价，实际空房与附加费用待确认</span></div><div class="times">${metric('步行到 A 座',p.walk?.seconds,p.walk_ok)}${metric('自行车到 A 座',p.bike?.seconds,p.bike_ok)}${s?metric('分段最佳合计',s.seconds,p.segment_ok):metric('地铁自动全程',p.metro?.seconds,p.metro_auto_ok)}</div><div class="route-picker" role="group" aria-label="地图显示的通勤路线">${['walk','bike','segment','metro'].filter(m=>modeAvailable(p,m)).map(m=>`<button data-action="route-mode" data-mode="${m}" aria-pressed="${routeMode===m}">${modeNames[m]}</button>`).join('')}</div><details class="commute-details" ${routeMode==='segment'?'open':''}><summary>${modeNames[routeMode]} ${mins(routeSeconds(p))}<span>路线与分段测量</span></summary><div class="route-heading"><strong>${modeNames[routeMode]} ${mins(routeSeconds(p))}</strong><span>住处 → A 座</span></div>`
 if(routeMode==='segment'&&s){
  html+=`<div class="route-block"><h4>${p.segment_ok?'分段合计 ≤20 分钟':'本次分段合计超出 20 分钟'}</h4>${AmapLinks.legs(p,data).map(leg=>`<div class="route-step"><span>${esc(leg.title)}</span><b>${mins(leg.seconds)}</b><a href="${AmapLinks.route(leg.from,leg.to,leg.mode)}" target="_blank" rel="noopener noreferrer">在高德打开这段${leg.mode==='bike'?' · 手机骑行':''} ↗</a></div>`).join('')}<div class="route-total"><span>三段按秒相加</span><span>${mins(s.seconds)}</span></div><p class="route-caveat">各段向上取整至分钟相加约 ${s.rounded_total_min} 分钟，地铁规划段含站内步行、换乘及预计等车，申请以 App 各段截图页面显示为准</p></div>`
 }else{
  if(routeMode==='metro')html+=`<p class="route-shortline">${esc((p.metro?.lines||[]).map(l=>l.name.replace(/\(.*/,'' )).join(' → '))} · 地图显示地铁乘车区间，接驳见高德规划</p>`
  html+=`<a class="nav-action" href="${AmapLinks.route(p,data.destination,routeMode)}" target="_blank" rel="noopener noreferrer">在高德打开${routeMode==='bike'?'手机骑行':routeMode==='walk'?'步行路线':'地铁规划'} ↗</a>`
 }
 html+=`<div class="place-actions route-copy-actions"><button data-action="copy-route">复制${routeMode==='segment'?'三段':'通勤'}路线</button><button data-action="fit-route">地图查看整段路线</button></div><p class="route-caveat">通勤由小区或门店坐标测得，具体楼栋大门需复测${p.rail_seconds!=null?' · 地铁乘车区间 '+mins(p.rail_seconds):''}</p></details>`
 html+=`<section class="rental-evidence"><div class="rental-section-title"><h4>匹配房源报价</h4><span>${primary.length} 条</span></div>${primary.length?primary.slice(0,2).map(listingCard).join(''):'<p class="evidence-empty">当前匹配资料的现价仍待核，可以查看参考线索或调整来源与房型条件</p>'}`
 if(primary.length>2)html+=`<details class="more-quotes"><summary>查看其余 ${primary.length-2} 条近期报价</summary>${primary.slice(2).map(listingCard).join('')}</details>`
 if(reference.length)html+=`<details class="reference-listings"><summary>房态与历史参考 ${reference.length} 条</summary><p class="reference-warning">含满房、未来起租、搜索摘录或过时资料，预算筛选采用7天内读取且无上述限制的报价</p>${reference.map(listingCard).join('')}</details>`
 if(records.length!==listings(p).length)html+=`<p class="evidence-intro">已按当前来源、房型和费用条件匹配 ${records.length}/${listings(p).length} 条资料</p>`
 const research=p.research
 if(research){
  html+=`<details class="missing-fields"><summary>地址范围与待核事项</summary>${(research.notes||[]).map(n=>`<p class="research-note">${esc(n)}</p>`).join('')}<p>${esc(research.missing_fields.join('、'))}</p></details>`
 }
 html+=`</section><details class="copy-options"><summary>复制名称、坐标或分享链接</summary><div><button data-action="copy-name">复制名称</button><button data-action="copy-address">复制地址</button><button data-action="copy-coordinates">复制坐标</button><button data-action="copy-share">分享此地点</button></div><span class="coordinates">高德坐标 GCJ-02　${esc(p.location)}</span></details>`
 $('#detail').innerHTML=html
}
function renderList(){
 const visible=filtered();$('#list-count').textContent=visible.length
 $('#place-list').innerHTML=visible.length?visible.map(p=>{
  const records=matchingRecords(p),quotes=records.filter(r=>currentQuoted(r)),sources=[...new Set(quotes.map(r=>r.source_group))]
  return `<article class="place-row ${p.id===selected?.id?'is-selected':''}"><button class="place-row-main" data-action="select" data-id="${p.id}"><b><span class="row-number">${p.map_id}</span>${esc(p.name)}</b><small>${esc(p.address||'门牌待核')}</small><span class="row-price">${shortPrice(p)}</span><span class="row-evidence">${quotes.length?`${quotes.length}条近期报价 · ${esc(sources.join('、'))}`:'价格与空房待核 · '+kinds[p.kind]}</span><span class="row-times"><span class="${p.walk_ok?'good':''}">步行 ${shortmins(p.walk?.seconds)} 分</span><span class="${p.bike_ok?'good':''}">骑行 ${shortmins(p.bike?.seconds)} 分</span>${p.segment_best?`<span class="${p.segment_ok?'good':''}">分段 ${shortmins(p.segment_best.seconds)} 分</span>`:''}</span></button><button class="row-save" data-action="save" data-id="${p.id}" aria-label="${saved.has(p.id)?'移出备选':'加入备选'} ${esc(p.name)}" aria-pressed="${saved.has(p.id)}">${saved.has(p.id)?'★':'☆'}</button></article>`
 }).join(''):'<div class="list-empty"><p>当前条件没有匹配地点</p><p>可以放宽预算、来源或房型条件</p><button class="quiet-button" data-action="clear-filters">重置筛选</button></div>'
}
function renderTable(){
 const visible=filtered()
 $('#poi-table').innerHTML=visible.map(p=>`<tr class="${p.id===selected?.id?'selected-row':''}"><td><button class="poi-name" data-action="select" data-id="${p.id}" data-scroll="true">${p.map_id}　${esc(p.name)}</button><span class="poi-kind">${kinds[p.kind]}${matchingRecords(p).some(r=>r.private_room)?' / 独立房间有来源':''}</span></td><td class="${p.walk_ok?'good':''}">${mins(p.walk?.seconds)}</td><td class="${p.bike_ok?'good':''}">${mins(p.bike?.seconds)}</td><td class="${p.metro_auto_ok?'good':''}">${mins(p.metro?.seconds)}</td><td class="${p.segment_ok?'good':''}">${p.segment_best?mins(p.segment_best.seconds):'未分段测量'}</td><td>${esc(priceText(p))}<span class="poi-kind">${esc(matchingRecords(p).filter(r=>currentQuoted(r)).length?'近期页面报价，实际空房待确认':'匹配资料的现价仍待核')}</span></td></tr>`).join('')
 $('#empty-state').hidden=visible.length>0
 $('#result-count').textContent=`${savedOnly?'备选':'显示'} ${visible.length} 个地点`
}
function drawMap(){mapUI.setPoints(filtered(),selected);mapUI.setRoute(selected,routeMode,showRoute)}
function select(id,focus=true){
 const p=points.find(p=>p.id===id);if(!p)return
 const changed=selected?.id!==p.id;selected=p
 if(changed||!modeAvailable(p,routeMode))routeMode=defaultMode(p)
 writeHash();$('#detail').scrollTop=0;detail();renderList();renderTable();drawMap();switchPanel('detail')
 if(focus)mapUI.focus(p)
}
function update(refit=false){
 const f=filtered(),previous=selected?.id
 if(!f.some(p=>p.id===selected?.id))selected=f[0]||null
 if(selected&&(previous!==selected.id||!modeAvailable(selected,routeMode)))routeMode=defaultMode(selected)
 renderList();renderTable();detail();drawMap();writeHash();updateFilterState()
 if(refit&&f.length)mapUI.fitPoints(f)
}
function updateFilterState(){
 $('#quoted-filter').setAttribute('aria-pressed',String(quoteOnly))
 $('#quoted-count').textContent=filtered({recentOnly:true}).length
 const f=recordFilters(),count=Number(f.source!=='all')+Number(f.rental!=='all')+Number(f.evidence!=='all')+Number(f.privateRoom)
 $('#filter-count').textContent=count?' '+count:''
}
function resetFilters(){kind='all';savedOnly=false;quoteOnly=false;$('#saved-filter').setAttribute('aria-pressed','false');$('#commute').value='eligible';$('#search').value='';$('#private-room').checked=false;for(const id of ['rental-mode','evidence-filter','budget','source-filter'])$('#'+id).value='all';document.querySelectorAll('[data-kind]').forEach(x=>{x.classList.toggle('active',x.dataset.kind==='all');x.setAttribute('aria-pressed',String(x.dataset.kind==='all'))});$('.advanced-filters').open=false;update(true)}
function exportDialog(){
 const p=selected,chosen=points.filter(p=>saved.has(p.id)),visible=filtered()
 let html='<p>手机端会尝试打开高德 App，电脑端打开高德网页，导航会根据打开时的条件重新规划</p>'
 if(p){
  html+=`<h3>${esc(p.name)} → 东畔 A 座</h3><div class="export-links"><a href="${AmapLinks.marker(p)}" target="_blank" rel="noopener noreferrer">打开地点</a><a href="${AmapLinks.route(p,data.destination,'walk')}" target="_blank" rel="noopener noreferrer">步行路线</a><a href="${AmapLinks.route(p,data.destination,'bike')}" target="_blank" rel="noopener noreferrer">手机骑行</a><a href="${AmapLinks.route(p,data.destination,'metro')}" target="_blank" rel="noopener noreferrer">地铁规划</a><button data-action="copy-route">复制当前路线</button></div>`
  if(p.segment_best)html+=`<h3>分段测量与截图</h3>${AmapLinks.legs(p,data).map((leg,i)=>`<div class="export-leg"><span>${i+1}. ${esc(leg.title)} · ${mins(leg.seconds)}</span><a href="${AmapLinks.route(leg.from,leg.to,leg.mode)}" target="_blank" rel="noopener noreferrer">打开这段${leg.mode==='bike'?' · 手机骑行':''} ↗</a></div>`).join('')}<p>逐段确认出行方式并截图，地铁规划打开后可选择地铁方案，各段页面显示时长加总应 ≤20 分钟</p>`
 }
 const groupPoints=chosen.length?chosen:visible,label=chosen.length?'我的备选':'当前筛选'
 html+=`<h3>${label} · ${groupPoints.length} 个地点</h3><p>每组携带最多 9 个住处和 A 座，共 10 个地点，打开后可在高德逐个查看和收藏</p>`
 for(let i=0;i<groupPoints.length;i+=9){const group=groupPoints.slice(i,i+9);html+=`<a class="export-group" href="${AmapLinks.group([...group,data.destination])}" target="_blank" rel="noopener noreferrer">第 ${i/9+1} 组 · ${group.map(p=>esc(p.short_name||p.name)).join('、')} ↗</a>`}
 if(!groupPoints.length)html+='<p>加入备选或调整筛选后即可生成地点组</p>'
 html+='<p class="export-explain">地点组用于在高德展示位置，通勤分段分别携带起终点和交通方式，路线与收藏操作在高德中确认 · <a href="https://lbs.amap.com/api/uri-api/guide/travel/route" target="_blank" rel="noopener noreferrer">官方说明</a></p>'
 $('#export-content').innerHTML=html;$('#export-dialog').showModal()
}
function download(text,type,name){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function listCopyText(){return filtered().map(p=>`北京 ${p.name}\t${p.address}\t${p.location}\t${AmapLinks.marker(p)}`).join('\n')}
function csvCell(value){return '"'+String(value??'').replace(/"/g,'""')+'"'}
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-action]');if(!b||!data)return
 const action=b.dataset.action
 if(action==='clear-filters'){resetFilters();switchPanel('list',true)}
 else if(action==='select'){select(b.dataset.id);if(b.dataset.scroll)$('.explorer').scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'})}
 else if(action==='save')savePoint(b.dataset.id)
 else if(action==='copy-place'&&selected)copy(placeText(selected),'已复制地点、地址与高德链接')
 else if(action==='copy-name'&&selected)copy('北京 '+selected.name,'已复制地点名称')
 else if(action==='copy-address'&&selected)copy('北京市 '+selected.address,'已复制地址')
 else if(action==='copy-coordinates'&&selected)copy(selected.location,'已复制高德坐标，经度在前')
 else if(action==='copy-share'&&selected)copy(shareLink(),'已复制当前地点分享链接')
 else if(action==='copy-route'&&selected)copy(routeText(selected),'已复制通勤路线与高德链接')
 else if(action==='fit-route'){mapUI.fitRoute();if(matchMedia('(max-width:720px)').matches)setPanelExpanded(false)}
 else if(action==='route-mode'){const y=$('#detail').scrollTop;routeMode=b.dataset.mode;writeHash();detail();$('#detail').scrollTop=y;mapUI.setRoute(selected,routeMode,showRoute);mapUI.fitRoute();$(`[data-mode="${routeMode}"]`)?.focus({preventScroll:true})}
})
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()))
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}}))
document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});update(true)}))
for(const id of ['commute','private-room','rental-mode','evidence-filter','budget','source-filter'])$('#'+id).addEventListener('change',()=>{if(selected)routeMode=defaultMode(selected);update(true)})
let searchTimer;$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>update(true),150)})
$('#reset-filters').addEventListener('click',resetFilters)
$('#quoted-filter').addEventListener('click',()=>{quoteOnly=!quoteOnly;update(true);switchPanel('list',true)})
$('#sort').addEventListener('change',()=>{renderList();renderTable()})
$('#saved-filter').addEventListener('click',()=>{savedOnly=!savedOnly;$('#saved-filter').setAttribute('aria-pressed',String(savedOnly));switchPanel('list');update(true)})
$('#tab-list').addEventListener('click',()=>switchPanel('list',true));$('#tab-detail').addEventListener('click',()=>switchPanel('detail',true))
$('.panel-tabs').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const name=e.key==='Home'?'list':e.key==='End'?'detail':$('#tab-list').getAttribute('aria-selected')==='true'?'detail':'list';switchPanel(name);$('#tab-'+name).focus()}})
$('#collapse-panel').addEventListener('click',()=>setPanelExpanded(!$('.place-panel').classList.contains('is-expanded')))
$('#zoom-in').addEventListener('click',()=>mapUI?.zoom(.75));$('#zoom-out').addEventListener('click',()=>mapUI?.zoom(-.75));$('#reset-view').addEventListener('click',()=>mapUI?.fitPoints());$('#fit-route').addEventListener('click',()=>mapUI?.fitRoute())
$('#toggle-route').addEventListener('click',()=>{showRoute=!showRoute;$('#toggle-route').setAttribute('aria-pressed',String(showRoute));$('#toggle-route').textContent=showRoute?'隐藏路线':'显示路线';mapUI?.setRoute(selected,routeMode,showRoute)})
function fullscreen(value){$('.explorer').classList.toggle('is-fullscreen',value);document.body.classList.toggle('map-fullscreen',value);$('#fullscreen').setAttribute('aria-pressed',String(value));$('#fullscreen').setAttribute('aria-label',value?'退出地图全屏':'地图全屏');requestAnimationFrame(()=>mapUI?.map.invalidateSize({pan:false}))}
$('#fullscreen').addEventListener('click',()=>fullscreen(!$('.explorer').classList.contains('is-fullscreen')))
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')){fullscreen(false);setPanelExpanded(false);$('.advanced-filters').open=false}})
document.addEventListener('click',e=>{if(!e.target.closest('.advanced-filters'))$('.advanced-filters').open=false})
$('#open-export').addEventListener('click',()=>{if(data)exportDialog()})
$('#copy-list').addEventListener('click',()=>copy(listCopyText(),`已复制 ${filtered().length} 个地点的名称、地址与链接`))
$('#download-data').addEventListener('click',()=>download(JSON.stringify({measured_at:data.measured_at,destination:data.destination,points:filtered()},null,2),'application/json','东畔租房点位清单.json'))
$('#download-csv').addEventListener('click',()=>{const rows=[['编号','名称','地址','经度纬度 GCJ-02','步行分钟','骑行分钟','分段分钟','租住信息','高德地点链接'],...filtered().map(p=>[p.map_id,p.name,p.address,p.location,shortmins(p.walk?.seconds),shortmins(p.bike?.seconds),shortmins(p.segment_best?.seconds),priceText(p),AmapLinks.marker(p)])];download('\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8','东畔租房地点与通勤.csv')})
window.addEventListener('hashchange',()=>{if(!data)return;const h=new URLSearchParams(location.hash.slice(1)),p=points.find(p=>p.id===h.get('poi'));if(!p)return;if(!filtered().some(v=>v.id===p.id)){resetFilters();$('#commute').value='all';update(false)}select(p.id);if(modeAvailable(p,h.get('route'))){routeMode=h.get('route');writeHash();detail();mapUI.setRoute(p,routeMode,showRoute)}})
Promise.all([fetch('data.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json()}),fetch('maps/manifest.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json()})]).then(([d,manifest])=>{
 data=d;points=d.points;saved=new Set([...saved].filter(id=>points.some(p=>p.id===id)));$('#saved-count').textContent=saved.size
 const hash=new URLSearchParams(location.hash.slice(1)),id=hash.get('poi');selected=points.find(p=>p.id===id)||null
 if(id&&selected&&!selected.eligible)$('#commute').value='all'
 routeMode=selected?(modeAvailable(selected,hash.get('route'))?hash.get('route'):defaultMode(selected)):'walk'
 mapUI=new RentalMap('map',data,manifest,(id,focus)=>select(id,focus));window.rentalMap=mapUI
 const audit=RentalEvidence.audit(points,d.evidence_audit)
 $('#source-filter').innerHTML='<option value="all">全部资料来源</option>'+audit.groups.map(g=>`<option value="${esc(g.name)}">${esc(g.name)} · ${g.records}条资料</option>`).join('')
 const quoteSources=audit.groups.filter(g=>g.eligible_quotes).length
 $('#research-summary').innerHTML=`<div class="snapshot-line"><strong>${audit.current_price_pois} 处地点有近期报价</strong><span>${audit.current_price_records} 条页面报价 · ${quoteSources} 个来源 · 资料读取日 ${esc(audit.as_of)}</span><span>实际空房与附加费用待确认</span></div><details class="source-audit"><summary>来源与日期核对</summary><p>目前保留 ${audit.records} 条资料、${points.length} 个地图点位，本次共读取 ${audit.direct_pages} 个原页，原始发布日期多未披露，搜索线索、满房、未来起租及过时资料单独保留</p><div class="table-wrap"><table><thead><tr><th>平台主体</th><th>全部记录</th><th>读取原页</th><th>近期报价记录</th></tr></thead><tbody>${audit.groups.map(g=>`<tr><td>${esc(g.name)}</td><td>${g.records}</td><td>${g.direct_pages}</td><td>${g.eligible_quotes}</td></tr>`).join('')}</tbody></table></div><p>原始发布、读取原页、最后登录和可入住日期分别列出，同一平台的语言站合并统计 · <a href="method.html#source-audit">核查依据与读取限制</a></p></details>`

 update(false);if(id&&selected){mapUI.focus(selected);switchPanel('detail')}else{mapUI.fitPoints();switchPanel('list')}window.rentMapReady=true
}).catch(error=>{$('#result-count').textContent='地图加载失败，请刷新重试';$('#detail').innerHTML='<p>地图或点位数据未能加载，请刷新页面重试</p>';console.error(error)})

async function checkVersion(){
 const loaded=document.querySelector('meta[name="app-version"]')?.content
 if(!loaded||loaded==='build-version')return
 try{const response=await fetch('version.json',{cache:'no-store'});if(!response.ok)return;const current=await response.json();$('#update-banner').hidden=current.version===loaded}catch{}
}
$('#refresh-app').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('v',String(Date.now()));location.assign(url.href)})
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkVersion()})
window.addEventListener('focus',checkVersion)
checkVersion()
