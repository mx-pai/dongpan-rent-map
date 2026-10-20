/* Record-level rental filters shared by the map and its source report */
;(function(root){
 const records=p=>p.research?.listings||[]
 const recent=(r,now=Date.now())=>{const age=(now-Date.parse(r.verification?.read_at||''))/86400000;return Number.isFinite(age)&&age>=0&&age<=7}
 const current=(r,now=Date.now())=>{
  const active=r.publisher_last_active_at?Date.parse(r.publisher_last_active_at.slice(0,10)):null
  const day=Math.floor((now+8*3600000)/86400000)
  return Boolean(r.current_quote_eligible&&recent(r,now)&&(active===null||day-Math.floor(active/86400000)<=30))
 }
 const rentalMatch=(r,mode)=>mode==='all'||({share:r.mode==='合租',whole:r.mode==='整租',apartment:r.mode==='公寓整租',room:['酒店独立客房','青旅独立单人间'].includes(r.mode),bed:r.mode==='青旅床位'}[mode])
 const bathroomLabel=r=>r.private_bath===true?'独立卫浴':/未说明|未披露|待核|需核/.test(r.bathroom||'')?'卫浴待核':r.bathroom?.includes('共用')?'共用卫浴':'卫浴待核'
 function matches(r,f,now=Date.now()){
  if(f.source!=='all'&&r.source_group!==f.source)return false
  if(!rentalMatch(r,f.rental))return false
  if(f.privateRoom&&!r.private_room)return false
  if(f.recentOnly&&!current(r,now))return false
  if(f.budget&&(!current(r,now)||r.price_month>f.budget))return false
  return ({all:true,monthly:current(r,now),direct:r.direct_read,bathroom:r.private_bath===true,missing:!current(r,now)})[f.evidence]===true
 }
 function priceSummary(list){
  const prices=list.filter(r=>current(r))
  if(!prices.length)return list.some(r=>r.current_quote_eligible)?'报价读取已过期，现价待核':'月租待核'
  return [...new Set(prices.map(r=>r.mode))].map(mode=>{
   const values=prices.filter(r=>r.mode===mode).map(r=>r.price_month),low=Math.min(...values),high=Math.max(...values)
   return `${mode} ${low===high?low:low+'–'+high}元/月`
  }).join('；')
 }
 function audit(points,snapshot){
  const all=points.flatMap(records),quotes=all.filter(r=>current(r))
  return {...snapshot,current_price_records:quotes.length,current_price_pois:points.filter(p=>records(p).some(r=>current(r))).length,
   groups:snapshot.groups.map(g=>({...g,eligible_quotes:quotes.filter(r=>r.source_group===g.name).length}))}
 }
 const api={records,recent,current,rentalMatch,bathroomLabel,matches,priceSummary,audit}
 if(typeof module!=='undefined'&&module.exports)module.exports=api
 else root.RentalEvidence=api
})(typeof window==='undefined'?globalThis:window)
