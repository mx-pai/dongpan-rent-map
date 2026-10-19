/* Documented Amap URI links require no browser API key */
const AmapLinks={
  url(path,params){const url=new URL('https://uri.amap.com/'+path);url.search=new URLSearchParams({...params,src:'dongpan-rent-map',callnative:'1'});return url.href},
  cleanName(name){return String(name).replace(/[,|]/g,' ')},
  marker(point){return this.url('marker',{position:point.location,name:point.name,coordinate:'gaode'})},
  route(from,to,mode){return this.url('navigation',{from:`${from.location},${this.cleanName(from.name)}`,to:`${to.location},${this.cleanName(to.name)}`,mode:({walk:'walk',bike:'ride',metro:'bus'}[mode]||'walk'),policy:'0'})},
  group(points){if(points.length>10||!points.length)throw new Error('高德多点标注每组支持 1–10 个地点');return this.url('marker',{markers:points.map(p=>`${p.location},${this.cleanName(p.name)}`).join('|')})},
  legs(point,data){const s=point.segment_best;if(!s)return []
    const entry={name:`${s.entry.station}站 ${s.entry.name}`,location:s.entry.location},exit=data.transit_exit
    return [{title:`${s.mode}到${entry.name}`,from:point,to:entry,mode:s.mode==='骑行'?'bike':'walk',seconds:s.access.seconds},
      {title:`地铁 ${entry.name} → ${exit.name}`,from:entry,to:exit,mode:'metro',seconds:s.metro.seconds},
      {title:`${s.egress_mode}到${data.destination.name}`,from:exit,to:data.destination,mode:s.egress_mode==='骑行'?'bike':'walk',seconds:s.egress.seconds}]
  }
}
window.AmapLinks=AmapLinks
