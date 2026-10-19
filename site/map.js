/* Local Amap images with Leaflet gestures, fixed-size markers and clustering */
class RentalMap {
  constructor(container, data, manifest, onSelect) {
    this.data=data
    this.onSelect=onSelect
    this.markers=new Map()
    this.visible=[]
    this.selected=null
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
    this.map=L.map(container,{zoomControl:false,minZoom:11,maxZoom:17,zoomSnap:.25,zoomDelta:.75,
      scrollWheelZoom:true,wheelPxPerZoomLevel:100,inertia:true,zoomAnimation:!this.reduced,
      fadeAnimation:!this.reduced,markerZoomAnimation:!this.reduced,attributionControl:true})
    const center=L.latLng(data.map.center[1],data.map.center[0])
    this.map.setView(center,14.25,{animate:false})
    // Every zoom uses the same grid and its own source images across the view.
    // A finite cache is intentional; never request absent tile coordinates.
    const CachedTiles=L.TileLayer.extend({
      getTileUrl(coords){
        const range=manifest.levels[String(coords.z)]?.tileRange
        if(!range||coords.x<range[0]||coords.x>range[2]||coords.y<range[1]||coords.y>range[3])return 'maps/outside.svg'
        return L.TileLayer.prototype.getTileUrl.call(this,coords)
      }
    })
    this.detailTiles=new CachedTiles('maps/{z}/{x}/{y}.png',{
      tileSize:manifest.tileSize,minNativeZoom:manifest.minZoom,maxNativeZoom:manifest.maxNativeZoom,
      minZoom:manifest.minZoom,maxZoom:17,noWrap:true,updateWhenIdle:true,keepBuffer:1,detectRetina:false,
      attribution:'底图 © <a href="https://www.amap.com/" target="_blank" rel="noopener noreferrer">高德地图</a>'
    }).addTo(this.map)
    const coverage=L.latLngBounds(manifest.coverageBounds)
    this.map.setMaxBounds(coverage)
    this.map.options.maxBoundsViscosity=1
    this.routes=L.featureGroup().addTo(this.map)
    this.stations=L.layerGroup().addTo(this.map)
    this.clusters=L.markerClusterGroup({maxClusterRadius:48,showCoverageOnHover:false,
      animate:!this.reduced,spiderfyDistanceMultiplier:1.6,spiderLegPolylineOptions:{color:'#63758a',weight:1.5},
      iconCreateFunction:cluster=>{
        const children=cluster.getAllChildMarkers(),active=children.some(m=>m.poi.id===this.selected?.id)
        const categories=new Set(children.map(m=>m.poi.category)),category=categories.size===1?children[0].poi.category:'mixed'
        return L.divIcon({className:'poi-cluster '+(active?'has-selected':''),html:`<span class="cluster-face ${category}">${children.length}</span>`,iconSize:[44,44],iconAnchor:[22,22]})
      }}).addTo(this.map)
    const office=data.destination
    this.office=L.marker(this.latlng(office.location),{icon:L.divIcon({className:'office-icon',html:'<span>A</span>',iconSize:[42,42],iconAnchor:[21,21]}),zIndexOffset:2000,title:office.name,alt:office.name})
      .bindTooltip('东畔 A 座',{permanent:true,direction:'top',offset:[0,-18],className:'office-label'}).addTo(this.map)
    this.office.on('click',()=>this.office.openPopup())
    this.office.bindPopup(`<b>${this.escape(office.name)}</b><p>所有通勤路线的终点</p><a href="${AmapLinks.marker(office)}" target="_blank" rel="noopener noreferrer">在高德查看办公地点</a>`)
    L.control.scale({imperial:false,position:'bottomleft',maxWidth:110}).addTo(this.map)
    this.map.attributionControl.setPrefix('<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>')
    this.map.on('moveend zoomend',()=>this.queueLabels())
    this.map.on('dragstart zoomstart',()=>clearTimeout(this.revealTimer))
    this.clusters.on('animationend spiderfied unspiderfied',()=>this.queueLabels())
    this.map.on('click',()=>this.office.closePopup())
    new ResizeObserver(()=>this.map.invalidateSize({pan:false})).observe(document.getElementById(container))
  }
  escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  latlng(location){const [lon,lat]=Array.isArray(location)?location:String(location).split(',').map(Number);return L.latLng(lat,lon)}
  icon(p){return L.divIcon({className:`poi-marker ${p.kind} ${p.category}${p.id===this.selected?.id?' is-selected':''}`,
    html:`<span class="marker-face">${p.map_id}</span>`,iconSize:[44,44],iconAnchor:[22,22]})}
  setPoints(points,selected){
    const old=this.selected
    this.selected=selected
    this.visible=points
    const ids=new Set(points.map(p=>p.id)),add=[],remove=[]
    for(const [id,m] of this.markers)if(!ids.has(id)&&this.clusters.hasLayer(m))remove.push(m)
    for(const p of points){
      let marker=this.markers.get(p.id)
      if(!marker){
        marker=L.marker(this.latlng(p.location),{icon:this.icon(p),title:`${p.map_id} ${p.name}`,alt:p.name,keyboard:true,riseOnHover:true})
        marker.poi=p
        marker.on('click',()=>this.onSelect(p.id,false))
        marker.on('add',()=>{const el=marker.getElement();if(el){el.dataset.poi=p.id;el.setAttribute('aria-label',`${p.map_id} ${p.name}，查看租住与通勤信息`)}})
        this.markers.set(p.id,marker)
      }
      if(!this.clusters.hasLayer(marker))add.push(marker)
    }
    this.clusters.removeLayers(remove)
    this.clusters.addLayers(add)
    for(const id of new Set([old?.id,selected?.id])){
      const marker=this.markers.get(id)
      if(marker){marker.setIcon(this.icon(marker.poi));marker.setZIndexOffset(id===selected?.id?1000:0)}
    }
    this.clusters.refreshClusters()
    this.queueLabels()
  }
  focus(p){
    const marker=this.markers.get(p.id)
    if(!marker||!this.clusters.hasLayer(marker))return
    this.map.stop()
    this.clusters.zoomToShowLayer(marker,()=>{marker.setZIndexOffset(1000);this.map.panInside(marker.getLatLng(),{paddingTopLeft:[50,85],paddingBottomRight:[75,matchMedia('(max-width:720px)').matches?180:70],animate:!this.reduced});this.queueLabels()})
  }
  fitPoints(points=this.visible){
    const bounds=L.latLngBounds(points.map(p=>this.latlng(p.location))).extend(this.office.getLatLng())
    if(bounds.isValid())this.map.fitBounds(bounds,{paddingTopLeft:[45,85],paddingBottomRight:[65,matchMedia('(max-width:720px)').matches?170:65],maxZoom:16,animate:!this.reduced,duration:.35})
  }
  routeParts(point,mode){
    if(!point)return []
    const s=point.segment_best
    if(mode==='segment'&&s)return [{route:s.access,mode:s.mode==='骑行'?'bike':'walk'},
      ...s.metro.lines.map(line=>({route:line,mode:'metro'})),{route:s.egress,mode:s.egress_mode==='骑行'?'bike':'walk'}]
    if(mode==='metro'&&point.metro){
      const p=point.metro
      return [...(p.walks||[]).map(route=>({route,mode:'walk'})),...(p.lines||[]).map(route=>({route,mode:'metro'}))]
    }
    return [{route:point[mode],mode}]
  }
  setRoute(point,mode,show=true){
    this.routePoint=point
    this.routeMode=mode
    this.routes.clearLayers()
    this.stations.clearLayers()
    if(!show||!point)return
    const colors={walk:'#117c68',bike:'#2865b2',metro:'#7853a6'}
    for(const part of this.routeParts(point,mode)){
      const coords=part.route?.polyline?.map(c=>this.latlng(c))||[]
      if(coords.length<2)continue
      L.polyline(coords,{color:'white',weight:8,opacity:.92,lineCap:'round',interactive:false}).addTo(this.routes)
      L.polyline(coords,{color:colors[part.mode]||colors.walk,weight:4,opacity:.95,dashArray:part.mode==='walk'&&mode==='segment'?'5 6':null,interactive:false}).addTo(this.routes)
    }
    if(mode==='segment'&&point.segment_best){
      const entry=point.segment_best.entry,exit=this.data.transit_exit
      for(const [name,loc] of [[`${entry.station} ${entry.name}`,entry.location],[exit.name,exit.location]]){
        const icon=L.divIcon({className:'station-icon',html:'<span>地铁</span>',iconSize:[36,22],iconAnchor:[18,11]})
        L.marker(this.latlng(loc),{icon,zIndexOffset:1100,title:name}).bindTooltip(this.escape(name),{direction:'top',offset:[0,-10]}).addTo(this.stations)
      }
    }
  }
  fitRoute(animate=true){
    if(this.routes.getLayers().length)this.map.fitBounds(this.routes.getBounds(),{paddingTopLeft:[70,75],paddingBottomRight:[70,matchMedia('(max-width:720px)').matches?190:75],maxZoom:16.75,animate:animate&&!this.reduced,duration:.35})
    else if(this.routePoint)this.focus(this.routePoint)
    clearTimeout(this.revealTimer)
    const id=this.selected?.id
    this.revealTimer=setTimeout(()=>{
      if(this.selected?.id!==id)return
      const marker=this.markers.get(id),parent=marker&&this.clusters.getVisibleParent(marker)
      if(parent&&parent!==marker&&typeof parent.spiderfy==='function')parent.spiderfy()
      this.queueLabels()
    },400)
  }
  queueLabels(){cancelAnimationFrame(this.labelsFrame);this.labelsFrame=requestAnimationFrame(()=>this.layoutLabels())}
  layoutLabels(){
    if(!this.map._loaded)return
    const size=this.map.getSize(),office=this.map.latLngToContainerPoint(this.office.getLatLng())
    const boxes=[[office.x-50,office.y-55,office.x+50,office.y+22]]
    const points=[...this.visible].sort((a,b)=>(b.id===this.selected?.id)-(a.id===this.selected?.id)||(b.private_room_confirmed-a.private_room_confirmed))
    const markerBoxes=points.map(p=>{const m=this.markers.get(p.id);if(!m?.getElement()||this.clusters.getVisibleParent(m)!==m)return null;const c=this.map.latLngToContainerPoint(m.getLatLng());return {id:p.id,box:[c.x-18,c.y-18,c.x+18,c.y+18]}}).filter(Boolean)
    let count=0
    for(const p of points){
      const marker=this.markers.get(p.id)
      if(!marker)continue
      const active=p.id===this.selected?.id,element=marker.getElement()
      const shown=element&&element.parentElement&&this.clusters.getVisibleParent(marker)===marker
      let placement=null
      if(shown&&(active||this.map.getZoom()>=14.75)&&count<18){
        // A spiderfied marker's displayed position is intentionally displaced;
        // use its current Leaflet location for screen-space label collision.
        const c=this.map.latLngToContainerPoint(marker.getLatLng()),width=Math.min(p.name.length*12+18,200)
        for(const direction of ['right','left','top','bottom']){
          const box=direction==='right'?[c.x+22,c.y-13,c.x+22+width,c.y+13]:direction==='left'?[c.x-22-width,c.y-13,c.x-22,c.y+13]:direction==='top'?[c.x-width/2,c.y-49,c.x+width/2,c.y-23]:[c.x-width/2,c.y+23,c.x+width/2,c.y+49]
          if(box[0]<8||box[2]>size.x-8||box[1]<52||box[3]>size.y-45)continue
          if(markerBoxes.some(m=>m.id!==p.id&&box[0]<m.box[2]+5&&box[2]>m.box[0]-5&&box[1]<m.box[3]+5&&box[3]>m.box[1]-5))continue
          if(boxes.some(b=>box[0]<b[2]+7&&box[2]>b[0]-7&&box[1]<b[3]+5&&box[3]>b[1]-5))continue
          boxes.push(box);placement=direction;count++;break
        }
      }
      if(marker.getTooltip())marker.unbindTooltip()
      if(placement)marker.bindTooltip(this.escape(active?p.name:(p.short_name||p.name)),{permanent:true,direction:placement,
        offset:placement==='top'?[0,-18]:placement==='bottom'?[0,18]:placement==='right'?[18,0]:[-18,0],
        className:active?'poi-label selected-label':'poi-label',interactive:false}).openTooltip()
    }
  }
  zoom(delta){this.map.setZoom(this.map.getZoom()+delta)}
}
window.RentalMap=RentalMap
