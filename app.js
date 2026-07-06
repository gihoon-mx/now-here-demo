/* ===================================================
   동 경계 뷰어 – 핵심 로직 (Vanilla JS)
   =================================================== */

var map;
var currentMode = 'local';
var PALETTE = ['#DE2F2A','#F2862E','#F2C53D','#9DC64C'];

/* ========== 로컬 모드 ========== */
var selectedFeature = null;
var smoothEnabled = false;
var smoothIntensity = 0.5;
var originalGeoJson = null;

var styleConfig = {
  default: { strokeColor:'#999999', fillColor:'#cccccc', strokeWeight:1, strokeOpacity:0.6, fillOpacity:0.12 },
  highlight: { strokeColor:'#ff3333', fillColor:'#ff3333', strokeWeight:4, strokeOpacity:1, fillOpacity:0.4, spotScaleM:200 },
  // 포커스 렌즈(베이직 폰): 보는 동만 선명하게 — 주변은 화이트 포그, 현재 구역은 헤어라인
  lens: { fogColor:'#f2f6fb', fogOpacity:0.5, lineColor:'#2f7bff', lineOpacity:0.85, trendScaleM:300, fadeMs:250, switchZoomN:3 },
};

/* ========== 트렌드 모드 ========== */
var hexPolygons = [];
var selectedHexes = new Map();
var hexRadiusKm = 1.0;
var boundsListener = null;
var REF_LAT_RAD = 37.0 * Math.PI / 180;

var hexStyleConfig = {
  default: { fillColor:'#4fc3f7', strokeColor:'#0288d1', fillOpacity:0.08, strokeWeight:1, strokeOpacity:0.45 },
  selected: { fillColor:'#ff9800', fillOpacity:0.45, strokeColor:'#e65100', strokeWeight:2, strokeOpacity:1 },
};

/* ========== 트렌드 존 ========== */
var trendZones = [];
var editingZoneId = null;
var zoneMergeBlocks = false;   // true=존 내부 헥사곤 경계 숨김, 합쳐진 외곽선만(한 덩어리)
var editingZoneBackup = null;

/* ========== 라벨 설정 ========== */
var localLabelConfig = { enabled:false, fontSize:12, textColor:'#ffffff', bgColor:'#111318', bgOpacity:0.72 };
var zoneLabelConfig  = { fontSize:11, textColor:'#ffffff', bgOpacity:1.0 };
var localLabel = null;          // 로컬모드 선택 구역 라벨 오버레이
var selectedFeatureName = null; // 현재 선택 구역 표시명
var selectedFeatureId = null;   // 폰 미러용 선택 구역 식별자
var colorControls = [];         // 색상 트리거 재도색용 레지스트리

/* ========== 스팟 메시지 (로컬모드, 관리자 생성 · 데모 뷰잉) ========== */
var spotMessages = [];          // 렌더 배열 = adminSpots + demoSpots
var adminSpots = [];            // 관리자 생성(shared/mapContent)
var demoSpots = [];             // 유저 생성(liveSpots · 실시간) 또는 로컬 폴백
var spotConfig = { maxChars:40, fontSize:13, textColor:'#ffffff', bgColor:'#1c66e5', bgOpacity:0.92, emojiSize:26,
  emojiPos:'bottom', emojiGap:2, emojiLetterSpacing:0, bubbleRadius:13, tail:true, dotScaleM:1000, dotStyle:'dot',
  emojis:['💬','📍','⭐','🔥','❤️','😀','🎉','📢','☕','🍜','🐶','🌸'] };
// 스팟은 지도에 '고정된 실제 크기'처럼 동작 — 기준 줌(16)에서 설정한 px가 1배, 줌 1레벨당 2배(줌아웃=절반).
// = 항상 같은 미터 범위를 덮음(건물 블럭 1개 크기면 어느 줌에서도 그 블럭 크기 유지). 안전 한계만 아주 넓게.
var SPOT_REF_ZOOM = 16;
var SPOT_SCALE_MIN = 0.02, SPOT_SCALE_MAX = 40;
function spotDotScaleM(){var v=Number(spotConfig.dotScaleM);return isNaN(v)?1000:v;} // 축척(축척자 m)이 이 값 초과로 축소되면 점으로
function spotScale(z){var s=Math.pow(2,z-SPOT_REF_ZOOM);if(s<SPOT_SCALE_MIN)s=SPOT_SCALE_MIN;if(s>SPOT_SCALE_MAX)s=SPOT_SCALE_MAX;return s;}
var spotOverlays = [];          // 메인 지도 SpotBubble
var phoneSpotOverlays = [];     // 폰 지도 SpotBubble
var currentSpotEmoji = '💬';
var selectedSpotId = null;      // 롤오버/선택 강조용
var composerOverlay = null;     // 지도 위 스팟 입력 팝업(관리자)
var SPOT_EMOJIS = ['💬','📍','⭐','🔥','❤️','😀','🎉','📢','☕','🍜','🐶','🌸'];

/* ========== 폰 미러 (모바일 미리보기) ========== */
var phoneMap = null;            // 폰 프레임 내 2번째 지도
var phoneZoneOverlays = [];     // 폰 지도의 존 오버레이 [{polygons,label}]
var phoneLocalLabel = null;     // 폰 지도의 로컬 선택 라벨
var phoneViewportRect = null;   // 관리자 지도에 표시하는 폰 뷰포트 사각형
var phoneCenterMarker = null;   // 폰 중심 마커
var phoneViewportOn = true;     // 폰 표시영역 오버레이 온오프
var dongIndex = null;           // 동 point-in-polygon 인덱스 [{name,bbox,polys}]
function featKey(f){return f.getProperty('adm_cd')||f.getProperty('adm_nm')||null;}

/* ========== 로컬 스타일 ========== */
function getDefaultStyle() {
  return { strokeColor:styleConfig.default.strokeColor, strokeWeight:Number(styleConfig.default.strokeWeight),
    strokeOpacity:Number(styleConfig.default.strokeOpacity), fillColor:styleConfig.default.fillColor,
    fillOpacity:Number(styleConfig.default.fillOpacity), cursor:'pointer' };
}
function getHighlightStyle() {
  return { strokeColor:styleConfig.highlight.strokeColor, strokeWeight:Number(styleConfig.highlight.strokeWeight),
    strokeOpacity:Number(styleConfig.highlight.strokeOpacity), fillColor:styleConfig.highlight.fillColor,
    fillOpacity:Number(styleConfig.highlight.fillOpacity) };
}
function refreshMapStyles() {
  if (!map) return;
  // hover 시 overrideStyle로 남는 스타일이 setStyle보다 우선시돼 설정 변경이 반영 안 되는 문제 방지
  map.data.revertStyle();
  map.data.setStyle(function(f) { return f === selectedFeature ? getHighlightStyle() : getDefaultStyle(); });
  refreshPhoneMapStyles();
}

/* ========== 스무딩 (0~1 강도) ========== */
function chaikinSmooth(coords, factor) {
  // factor 0~1: 0=원본, 1=최대 스무딩
  if (factor <= 0) return coords;
  var iterations = Math.max(1, Math.round(factor * 5));
  var p = coords.slice();
  for (var t = 0; t < iterations; t++) {
    var np = [], l = p.length - 1;
    for (var i = 0; i < l; i++) {
      var a=p[i], b=p[(i+1)%l];
      var r = 0.25 * factor; // 부드러움 비율
      var s = 1 - r;
      np.push([a[0]*s+b[0]*r, a[1]*s+b[1]*r]);
      np.push([a[0]*r+b[0]*s, a[1]*r+b[1]*s]);
    }
    np.push(np[0].slice()); p = np;
  }
  return p;
}
function smoothGeoJson(gj, factor) {
  var c = JSON.parse(JSON.stringify(gj));
  c.features.forEach(function(f) {
    var g = f.geometry;
    if (g.type==='Polygon') g.coordinates = g.coordinates.map(function(r){return chaikinSmooth(r,factor);});
    else if (g.type==='MultiPolygon') g.coordinates = g.coordinates.map(function(p){return p.map(function(r){return chaikinSmooth(r,factor);});});
  });
  return c;
}
function applyGeoJsonToMap() {
  if (!map||!originalGeoJson) return;
  selectedFeature = null; selectedFeatureName = null; selectedFeatureId = null; updateInfoPanel(null); removeLocalLabel();
  map.data.forEach(function(f){map.data.remove(f);});
  map.data.addGeoJson(smoothEnabled ? smoothGeoJson(originalGeoJson,smoothIntensity) : originalGeoJson);
  refreshMapStyles();
  buildDongIndex();
  if(typeof clearLensGeom==='function'){clearLensGeom();phoneLens.on=false;phoneSelectedDongKey=null;} // 경계 갱신 → 렌즈는 다음 idle에 재생성
  applyGeoJsonToPhone(); phoneDataVisibility(); updatePhoneUI(); updatePhoneLocation(); updatePhoneViewportOverlay();
}

/* ========== 헥사곤 유틸 ========== */
function getHexGridParams(radius) {
  var r = radius || hexRadiusKm;
  var R_lat = r / 111.32;
  var R_lng = r / (111.32 * Math.cos(REF_LAT_RAD));
  return { R_lat:R_lat, R_lng:R_lng, colSpacing:1.5*R_lng, rowSpacing:Math.sqrt(3)*R_lat };
}
function hexVertices(cx, cy, R_lat, R_lng) {
  var pts = [];
  for (var i = 0; i < 6; i++) {
    var a = i * Math.PI / 3;
    pts.push({ lat: cy + R_lat * Math.sin(a), lng: cx + R_lng * Math.cos(a) });
  }
  return pts;
}
/* 헥사곤 묶음의 합집합 외곽선 루프들 (내부 공유 변은 제거, 경계 변만 체인) */
function zoneOutlineLoops(centers, gp) {
  var RND=1e7, vkey=function(p){return Math.round(p.lat*RND)+','+Math.round(p.lng*RND);};
  var cnt={}, pt={};
  centers.forEach(function(c){
    var v=hexVertices(c.lng,c.lat,gp.R_lat,gp.R_lng);
    for(var i=0;i<6;i++){var a=v[i],b=v[(i+1)%6],ka=vkey(a),kb=vkey(b);pt[ka]=a;pt[kb]=b;
      var ek=ka<kb?ka+'|'+kb:kb+'|'+ka;cnt[ek]=(cnt[ek]||0)+1;}
  });
  var adj={};
  Object.keys(cnt).forEach(function(ek){if(cnt[ek]!==1)return;var p=ek.split('|'),ka=p[0],kb=p[1];
    (adj[ka]=adj[ka]||[]).push(kb);(adj[kb]=adj[kb]||[]).push(ka);});
  var used={}, loops=[], eid=function(a,b){return a<b?a+'|'+b:b+'|'+a;};
  Object.keys(adj).forEach(function(start){
    for(;;){
      var nbs=adj[start]||[], first=null;
      for(var i=0;i<nbs.length;i++){if(!used[eid(start,nbs[i])]){first=nbs[i];break;}}
      if(first===null)break;
      var loop=[pt[start]], cur=start, nxt=first, guard=0;
      used[eid(cur,nxt)]=true;
      while(nxt!==start && guard++<100000){
        loop.push(pt[nxt]);
        var cand=adj[nxt]||[], nn=null;
        for(var j=0;j<cand.length;j++){if(!used[eid(nxt,cand[j])]){nn=cand[j];break;}}
        if(nn===null)break;
        used[eid(nxt,nn)]=true; nxt=nn;
      }
      if(loop.length>=3)loops.push(loop);
    }
  });
  return loops;
}
function addZoneOutline(centers, gp, color, mapObj, arr){
  zoneOutlineLoops(centers,gp).forEach(function(loop){
    var op=new google.maps.Polygon({paths:loop,strokeColor:color,strokeWeight:2.4,strokeOpacity:0.95,fillOpacity:0,clickable:false,zIndex:4});op._outline=true;
    op.setMap(mapObj);arr.push(op);
  });
}
function centerToHexId(lat, lng, gp) {
  if (!gp) gp = getHexGridParams();
  var col = Math.round(lng / gp.colSpacing);
  var isOdd = ((col % 2) + 2) % 2 === 1;
  var row = Math.round((lat - (isOdd ? gp.rowSpacing / 2 : 0)) / gp.rowSpacing);
  return { col: col, row: row, id: col + '_' + row };
}
function hexCenterFromColRow(col, row, gp) {
  if (!gp) gp = getHexGridParams();
  var isOdd = ((col % 2) + 2) % 2 === 1;
  return { lng: col * gp.colSpacing, lat: row * gp.rowSpacing + (isOdd ? gp.rowSpacing / 2 : 0) };
}

/* ========== 고정 그리드 ========== */
// 헥사 기본/선택 스타일 옵션 (생성·토글·일괄 갱신 공용)
function hexOpts(sel) {
  var s = sel ? hexStyleConfig.selected : hexStyleConfig.default;
  return { fillColor:s.fillColor, fillOpacity:Number(s.fillOpacity), strokeColor:s.strokeColor,
    strokeWeight:Number(s.strokeWeight), strokeOpacity:Number(s.strokeOpacity), zIndex:sel?2:1 };
}
// 편집 중이 아닌 존이 점유한 헥사 중심 키맵 (그리드 생성 시 O(1) 조회 — 기존 허용오차 0.0001과 동일한 1e4 양자화)
function occupiedHexKeys() {
  var keys = {};
  trendZones.forEach(function(z){
    if (z.id === editingZoneId) return;
    z.hexCenters.forEach(function(c){ keys[Math.round(c.lat*1e4)+'_'+Math.round(c.lng*1e4)] = true; });
  });
  return keys;
}
function generateHexagons() {
  clearHexagons();
  if (!map) return;
  var bounds = map.getBounds();
  if (!bounds) return;
  var ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
  var gp = getHexGridParams();
  var occupied = occupiedHexKeys();
  var startCol = Math.floor(sw.lng()/gp.colSpacing) - 1, endCol = Math.ceil(ne.lng()/gp.colSpacing) + 1;
  var startRow = Math.floor(sw.lat()/gp.rowSpacing) - 1, endRow = Math.ceil(ne.lat()/gp.rowSpacing) + 1;
  var count = 0, MAX = 2500;
  for (var col = startCol; col <= endCol && count < MAX; col++) {
    var isOdd = ((col % 2) + 2) % 2 === 1;
    for (var row = startRow; row <= endRow && count < MAX; row++) {
      var cx = col * gp.colSpacing;
      var cy = row * gp.rowSpacing + (isOdd ? gp.rowSpacing / 2 : 0);
      var hexId = col + '_' + row;
      if (occupied[Math.round(cy*1e4)+'_'+Math.round(cx*1e4)]) continue;
      var isSel = selectedHexes.has(hexId);
      var opts = hexOpts(isSel);
      opts.paths = hexVertices(cx, cy, gp.R_lat, gp.R_lng);
      opts.clickable = true;
      var poly = new google.maps.Polygon(opts);
      poly.hexId = hexId; poly._col = col; poly._row = row; poly._cx = cx; poly._cy = cy;
      poly.setMap(map);
      poly.addListener('click', (function(p){return function(){toggleHex(p);};})(poly));
      poly.addListener('mouseover', (function(p,id){return function(){
        if(!selectedHexes.has(id)) p.setOptions({fillOpacity:Number(hexStyleConfig.default.fillOpacity)+0.1,strokeWeight:2});
      };})(poly,hexId));
      poly.addListener('mouseout', (function(p,id){return function(){
        if(!selectedHexes.has(id)) p.setOptions({fillOpacity:Number(hexStyleConfig.default.fillOpacity),strokeWeight:Number(hexStyleConfig.default.strokeWeight)});
      };})(poly,hexId));
      hexPolygons.push(poly); count++;
    }
  }
  updateTrendInfo();
}

function toggleHex(poly) {
  if(currentRole && currentRole!=='admin') return; // 데모유저는 존 편집 불가
  var id = poly.hexId;
  var sel = !selectedHexes.has(id);
  if (sel) selectedHexes.set(id, { col:poly._col, row:poly._row, lat:poly._cy, lng:poly._cx });
  else selectedHexes.delete(id);
  poly.setOptions(hexOpts(sel));
  updateTrendInfo(); updateZoneSaveUI();
}

function clearHexagons() { hexPolygons.forEach(function(p){p.setMap(null);}); hexPolygons = []; }
function clearHexSelection() { selectedHexes.clear(); refreshHexStyles(); updateTrendInfo(); updateZoneSaveUI(); }

function refreshHexStyles() {
  hexPolygons.forEach(function(p){ p.setOptions(hexOpts(selectedHexes.has(p.hexId))); });
}

function updateTrendInfo() {
  var el = document.getElementById('info-text');
  var c = selectedHexes.size;
  if (editingZoneId) {
    var zone = trendZones.find(function(z){return z.id===editingZoneId;});
    el.innerHTML = '<span class="editing-badge">편집 중</span> ' + (zone?escHtml(zone.name):'') +
      '<br/><span class="hex-info">헥사곤: '+c+'개 · 클릭으로 추가/제거</span>';
  } else if (c===0) {
    el.innerHTML = '헥사곤을 클릭하여 영역을 선택하세요.<br/><span class="hex-info">복수 선택 가능</span>';
  } else {
    el.innerHTML = '선택된 헥사곤: <span class="dong-name" style="background:rgba(255,152,0,0.15);color:#ffb74d;">'+c+'개</span>';
  }
}

function updateZoneSaveUI() {
  var area = document.getElementById('zone-save-area');
  var editBar = document.getElementById('zone-edit-bar');
  if (editingZoneId) {
    area.style.display = 'none'; editBar.style.display = '';
    var zone = trendZones.find(function(z){return z.id===editingZoneId;});
    document.getElementById('zone-edit-label').textContent = (zone?zone.name:'')+' 편집 중';
    document.getElementById('zone-edit-color').value = zone?zone.color:'#ff9800';
  } else {
    editBar.style.display = 'none';
    if (currentMode==='trend'&&selectedHexes.size>0) { area.style.display=''; }
    else { area.style.display='none'; document.getElementById('zone-form').style.display='none'; document.getElementById('zone-save-btn').style.display=''; }
  }
}

/* ========== 색상 유틸 ========== */
function hexToRgb(hex){hex=(hex||'#000000').replace('#','');if(hex.length===3)hex=hex.split('').map(function(c){return c+c;}).join('');return {r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16)};}
function hexToRgba(hex,a){var c=hexToRgb(hex);return 'rgba('+c.r+','+c.g+','+c.b+','+(a==null?1:a)+')';}
function mergeInto(target,src){if(target&&src)Object.keys(src).forEach(function(k){target[k]=src[k];});}

/* ========== 커스텀 라벨 오버레이 (범용) ========== */
function MapLabel(pos,text,style,m){this.position=pos;this.text=text;this.style=style||{};this.div=null;this.setMap(m);}
function initMapLabelClass(){
  MapLabel.prototype=new google.maps.OverlayView();
  MapLabel.prototype._apply=function(d){var s=this.style||{};if(s.bg)d.style.backgroundColor=s.bg;if(s.color)d.style.color=s.color;if(s.fontSize)d.style.fontSize=s.fontSize+'px';};
  MapLabel.prototype.onAdd=function(){var d=document.createElement('div');d.className='map-label-tag';this._apply(d);d.textContent=this.text;this.div=d;this.getPanes().overlayMouseTarget.appendChild(d);};
  MapLabel.prototype.updateStyle=function(style){this.style=style||{};if(this.div)this._apply(this.div);};
  MapLabel.prototype.draw=function(){var p=this.getProjection();if(!p)return;var pos=p.fromLatLngToDivPixel(this.position);if(this.div&&pos){this.div.style.left=pos.x+'px';this.div.style.top=pos.y+'px';}};
  MapLabel.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}

/* ========== 스팟 말풍선 오버레이 (이모지 + 메시지) ========== */
function SpotBubble(spot,cfg,m){this.spot=spot;this.cfg=cfg||spotConfig;this.position=new google.maps.LatLng(spot.lat,spot.lng);this.div=null;this.setMap(m);}
var CSS_ZOOM_OK=(function(){try{return CSS.supports('zoom','2');}catch(e){return false;}})(); // zoom=레이아웃 스케일 → 확대해도 텍스트 선명(transform scale은 저해상도 래스터 재사용)
function myEmail(){return currentUser?String(currentUser.email||'').toLowerCase():'';}
function ownsContent(o){ // 본인 컨텐츠: uid 일치 또는 이메일 일치(시드 데이터는 byEmail로 소유자 지정)
  if(!o)return false;
  if(o.by&&o.by===myUid())return true;
  var e=myEmail();return !!(e&&o.byEmail&&o.byEmail===e);
}
function canEditSpot(s){ // 관리자 또는 본인이 올린 유저 스팟(라이브 by/byEmail / 로컬 기기)
  if(currentRole==='admin')return true;
  return !!(s&&s.live&&(!s.by||ownsContent(s)));
}
function initSpotBubbleClass(){
  SpotBubble.prototype=new google.maps.OverlayView();
  SpotBubble.prototype.onAdd=function(){
    var self=this;
    var wrap=document.createElement('div');wrap.className='spot-marker';
    var bubble=document.createElement('div');bubble.className='spot-bubble';
    var emoji=document.createElement('div');emoji.className='spot-emoji';
    var dot=document.createElement('div');dot.className='spot-dotmark';
    wrap.appendChild(bubble);wrap.appendChild(emoji);wrap.appendChild(dot);
    wrap.addEventListener('pointerdown',function(e){self._onDown(e);}); // 포인터 = 마우스+터치(모바일 데모 드래그)
    wrap.addEventListener('click',function(e){ // 편집 가능 스팟 탭=편집 모달 — 지도 click(강조 해제)로 새지 않게
      if(canEditSpot(self.spot)&&!(currentRole==='admin'&&self.getMap()!==map))e.stopPropagation();
    });
    this.div=wrap;this.bubbleEl=bubble;this.emojiEl=emoji;this.dotEl=dot;
    this._render();
    this.getPanes().overlayMouseTarget.appendChild(wrap);
  };
  // 편집 권한자(관리자·본인): 이동=터치 롱프레스 후 드래그(마우스는 즉시) / 짧은 탭·클릭=편집 모달
  SpotBubble.prototype._onDown=function(e){
    var self=this,m=self.getMap();
    if(!canEditSpot(self.spot))return;
    if(currentRole==='admin'&&m!==map)return; // 관리자는 메인 지도에서만(폰 미러=데모 뷰). 데모는 보는 지도 어디서든
    var isTouch=(e.pointerType==='touch');
    var moved=false,dragging=false,lpTimer=null,sx=e.clientX,sy=e.clientY,mapEl=m.getDiv();
    var prevDrag=m.get('draggable');
    function startDrag(){
      dragging=true;
      m.setOptions({draggable:false});
      self.div.classList.add('dragging');
      try{self.div.setPointerCapture(e.pointerId);}catch(_){}
      if(isTouch&&navigator.vibrate)try{navigator.vibrate(15);}catch(_){}
    }
    if(isTouch){lpTimer=setTimeout(function(){lpTimer=null;if(!moved)startDrag();},LP_MS);} // 롱프레스 전 움직임=지도 팬
    else{e.stopPropagation();if(e.cancelable)e.preventDefault();startDrag();}
    function mv(ev){
      if(ev.pointerId!==e.pointerId)return;
      if(!dragging){ // 롱프레스 대기 중 크게 움직이면 = 지도 팬 → 취소
        if(Math.abs(ev.clientX-sx)>LP_TOL||Math.abs(ev.clientY-sy)>LP_TOL){moved=true;cleanup(false);}
        return;
      }
      if(!moved&&(Math.abs(ev.clientX-sx)>3||Math.abs(ev.clientY-sy)>3))moved=true;
      if(!moved)return;var proj=self.getProjection();if(!proj)return;
      var r=mapEl.getBoundingClientRect();
      var ll=proj.fromContainerPixelToLatLng(new google.maps.Point(ev.clientX-r.left,ev.clientY-r.top));
      if(ll){self.spot.lat=ll.lat();self.spot.lng=ll.lng();self.position=ll;self.draw();}
    }
    function up(ev){if(ev.pointerId!==e.pointerId)return;cleanup(true);}
    function cleanup(fin){
      document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);
      if(lpTimer){clearTimeout(lpTimer);lpTimer=null;}
      if(dragging){m.setOptions({draggable:prevDrag!==false});if(self.div)self.div.classList.remove('dragging');}
      if(!fin)return; // 팬으로 판정 — 지도에 맡김
      if(dragging&&moved){renderSpots();persistSpotEdit(self.spot);} // 저장: 라이브=liveSpots·로컬=기기 / 관리자=클라우드
      else if(!moved&&(!dragging||!isTouch))openSpotEditor(self.spot.id); // 탭/클릭=편집 (터치 롱프레스 후 제자리 해제는 무동작)
    }
    document.addEventListener('pointermove',mv); // 팬 중 버블이 손가락에서 벗어나도 추적되게 document에
    document.addEventListener('pointerup',up);
    document.addEventListener('pointercancel',up);
  };
  SpotBubble.prototype._render=function(){
    var c=this.cfg||spotConfig,s=this.spot;
    var t=(s.text||''),max=Number(c.maxChars)||40;if(t.length>max)t=t.slice(0,max)+'…';
    this.emojiEl.textContent=s.emoji||'💬';
    this.emojiEl.style.fontSize=(Number(c.emojiSize)||26)+'px';
    this.emojiEl.style.letterSpacing=(Number(c.emojiLetterSpacing)||0)+'px';
    if(this.dotEl)this.dotEl.style.background=hexToRgba(s.color||c.bgColor||'#1c66e5',1); // 점 색상 = 버블 색상(개별 변경 포함)
    this.bubbleEl.textContent=t;
    this.bubbleEl.style.display=t?'':'none';
    this.bubbleEl.style.color=c.textColor||'#fff';
    this.bubbleEl.style.fontSize=(Number(c.fontSize)||13)+'px';
    this.bubbleEl.style.setProperty('--spot-bg',hexToRgba(s.color||c.bgColor||'#1c66e5',Math.min(Number(c.bgOpacity),0.82))); // 배경흐림(blur)이 보이도록 알파 상한 0.82 (더 낮게는 설정대로)
    // 레이아웃: 이모지 위치/간격, 말풍선 둥글기/꼬리
    var pos=c.emojiPos||'bottom', vertical=(pos==='top'||pos==='bottom');
    this.div.style.flexDirection=vertical?'column':'row';
    this.div.style.gap=(Number(c.emojiGap)||0)+'px';
    var emojiFirst=(pos==='top'||pos==='left');
    this.emojiEl.style.order=emojiFirst?0:2;
    this.bubbleEl.style.order=1;
    this.bubbleEl.style.borderRadius=(Number(c.bubbleRadius)||13)+'px';
    var showTail=(c.tail!==false)&&vertical;
    this.bubbleEl.classList.toggle('no-tail',!showTail);
    this.bubbleEl.classList.toggle('tail-up',showTail&&pos==='top');
    this.div.classList.toggle('spot-admin',canEditSpot(s)&&this.getMap&&(currentRole==='admin'?this.getMap()===map:true)); // 편집 가능(관리자=메인만/본인=어디서든) 커서
    this.div.classList.toggle('spot-sel',selectedSpotId===s.id); // 선택 강조(살짝 커짐)
    if(this.getMap&&this.getMap()===phoneMap&&typeof spotInFocus==='function')this.div.classList.toggle('spot-out',!spotInFocus(s)); // 렌즈/존 밖 스팟은 옅게
  };
  SpotBubble.prototype.update=function(cfg){this.cfg=cfg||this.cfg;if(this.div)this._render();};
  SpotBubble.prototype.draw=function(){
    var p=this.getProjection();if(!p||!this.div)return;
    var pos=p.fromLatLngToDivPixel(this.position);
    if(pos){this.div.style.left=pos.x+'px';this.div.style.top=pos.y+'px';}
    var m=this.getMap();if(!m)return;var z=m.getZoom();if(z==null)return;
    var mpp=mapMpp(m);var isDot=mpp?((mpp*64)>spotDotScaleM()):(z<13); // 축척자(64px) 거리가 임계값 초과 = 축소 → 점
    // (강조 구역 축척과 독립적: spotConfig.dotScaleM ↔ styleConfig.highlight.spotScaleM)
    var emojiDot=isDot&&(spotConfig.dotStyle==='emoji'); // 작을 때 이모지로 표시 옵션
    var s=spotScale(z); // 지도 배율에 붙어 확대/축소
    this.div.classList.toggle('spot-dot',isDot);
    this.div.classList.toggle('spot-dot-emoji',emojiDot);
    // 스케일은 CSS zoom(레이아웃)으로 — transform scale은 1배 래스터를 GPU 확대해 줌인 시 글자/이모지가 흐릿해짐
    var zk=CSS_ZOOM_OK?1:s; // zoom 미지원 브라우저는 기존 transform scale 폴백
    if(CSS_ZOOM_OK){
      this.bubbleEl.style.zoom=(isDot?1:s);
      this.emojiEl.style.zoom=(isDot&&!emojiDot)?1:s;
      this.div.style.gap=((Number(this.cfg.emojiGap)||0)*(isDot?1:s))+'px';
    }
    if(isDot&&!emojiDot){
      this.div.style.transformOrigin='50% 50%';
      this.div.style.transform='translate(-50%,-50%)';           // 고정 크기 점
    }else if(emojiDot){
      this.div.style.transformOrigin='50% 50%';
      this.div.style.transform='translate(-50%,-50%)'+(zk!==1?' scale('+zk+')':''); // 이모지만 배율로
    }else{
      this.div.style.transformOrigin='50% 100%';
      this.div.style.transform='translate(-50%,-100%)'+(zk!==1?' scale('+zk+')':''); // 말풍선 배율로
    }
  };
  SpotBubble.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}

/* ========== 피드 썸네일 지도 핀 (원형 사진 · Apple Maps 무드, 글로우 없음) ==========
   근접(픽셀) 핀은 클러스터 1개(대표 사진+개수 뱃지)로 묶고, 탭하면 멤버 범위로 줌인해 펼쳐짐 */
var feedThumbOverlays=[], phoneFeedThumbOverlays=[];
var LP_MS=450, LP_TOL=8; // 터치 롱프레스 = 콘텐츠 이동 시작(짧은 탭·지도 팬과 구분). 마우스는 즉시 드래그
function FeedThumb(cluster,m){ // cluster={pos,items:[{f,pos},…]} — 1개=단일 핀, 여러 개=클러스터
  this.members=cluster.items;this.item=cluster.items[0].f;
  this.position=new google.maps.LatLng(cluster.pos.lat,cluster.pos.lng);
  this.div=null;this.setMap(m);
}
function initFeedThumbClass(){
  FeedThumb.prototype=new google.maps.OverlayView();
  FeedThumb.prototype._canEdit=function(){return this.members.length===1&&(currentRole==='admin'||ownsContent(this.item));}; // 만든이(uid/이메일) + 관리자 (클러스터는 이동 불가)
  FeedThumb.prototype.onAdd=function(){
    var self=this,n=this.members.length;
    var d=document.createElement('div');d.className='feed-pin';
    var im=document.createElement('div');im.className='fp-im';
    var img=document.createElement('img');img.src=this.item.src;img.alt='';im.appendChild(img);
    d.appendChild(im);
    this.div=d;
    if(n>1){ // 클러스터: 대표 사진 + 개수 뱃지, 탭=멤버 범위로 줌인(펼치기)
      d.classList.add('cluster');
      var b=document.createElement('span');b.className='fp-n';b.textContent=n;d.appendChild(b);
      d.addEventListener('click',function(e){e.stopPropagation();self._expand();});
      this.getPanes().overlayMouseTarget.appendChild(d);
    }else if(this._canEdit()){ // 드래그로 위치 이동 가능 → 인터랙티브 pane
      d.classList.add('editable');
      d.addEventListener('pointerdown',function(e){self._onDown(e);});
      d.addEventListener('click',function(e){e.stopPropagation();}); // 지도 click(강조 해제)로 새지 않게
      this.getPanes().overlayMouseTarget.appendChild(d);
    }else{
      this.getPanes().overlayLayer.appendChild(d); // 비인터랙티브 pane — 지도 제스처 방해 없음
    }
  };
  FeedThumb.prototype._expand=function(){ // 클러스터 탭 → 멤버가 펼쳐지는 줌으로
    var m=this.getMap();if(!m)return;
    var b=new google.maps.LatLngBounds();
    this.members.forEach(function(o){b.extend(new google.maps.LatLng(o.pos.lat,o.pos.lng));});
    var z0=m.getZoom()||15;
    if(b.getNorthEast().equals(b.getSouthWest())){m.panTo(b.getCenter());m.setZoom(Math.min(20,z0+2));return;}
    m.fitBounds(b,(m===phoneMap)?phoneFitPadding():60);
    google.maps.event.addListenerOnce(m,'idle',function(){if((m.getZoom()||0)<=z0)m.setZoom(z0+1);}); // 이미 타이트하면 강제 줌인
  };
  FeedThumb.prototype._onDown=function(e){ // 이동: 터치=롱프레스 후 드래그 / 마우스=즉시 (이동 시 동/존 자동 재태깅)
    var self=this,m=self.getMap();if(!m)return;
    var isTouch=(e.pointerType==='touch');
    var mapEl=m.getDiv(),moved=false,dragging=false,lpTimer=null,sx=e.clientX,sy=e.clientY;
    var prevDrag=m.get('draggable');
    function startDrag(){
      dragging=true;
      m.setOptions({draggable:false});
      self.div.classList.add('dragging');
      try{self.div.setPointerCapture(e.pointerId);}catch(_){}
      if(isTouch&&navigator.vibrate)try{navigator.vibrate(15);}catch(_){}
    }
    if(isTouch){lpTimer=setTimeout(function(){lpTimer=null;if(!moved)startDrag();},LP_MS);} // 롱프레스 전 움직임=지도 팬
    else{e.stopPropagation();if(e.cancelable)e.preventDefault();startDrag();}
    function mv(ev){
      if(ev.pointerId!==e.pointerId)return;
      if(!dragging){ // 롱프레스 대기 중 크게 움직이면 = 지도 팬 → 취소
        if(Math.abs(ev.clientX-sx)>LP_TOL||Math.abs(ev.clientY-sy)>LP_TOL){moved=true;cleanup(false);}
        return;
      }
      if(!moved&&(Math.abs(ev.clientX-sx)>3||Math.abs(ev.clientY-sy)>3))moved=true;
      if(!moved)return;
      var proj=self.getProjection();if(!proj)return;
      var r=mapEl.getBoundingClientRect();
      var ll=proj.fromContainerPixelToLatLng(new google.maps.Point(ev.clientX-r.left,ev.clientY-r.top));
      if(ll){self.position=ll;self.draw();}
    }
    function up(ev){if(ev.pointerId!==e.pointerId)return;cleanup(true);}
    function cleanup(fin){
      document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);
      if(lpTimer){clearTimeout(lpTimer);lpTimer=null;}
      if(dragging){m.setOptions({draggable:prevDrag!==false});if(self.div)self.div.classList.remove('dragging');}
      if(!fin||!dragging||!moved)return;
      var lat=self.position.lat(),lng=self.position.lng();
      var zz=zoneObjAtCenter(lat,lng);
      feedUpdate(self.item,{lat:lat,lng:lng,region:dongAt(lat,lng)||self.item.region||'',zone:zz?zz.id:null});
      renderFeedMarkers();renderFeedColList();renderDrawerDemo();renderNews();if(currentTab==='feed')renderFeed(); // 다른 지도 핀·리스트 동기화
    }
    document.addEventListener('pointermove',mv); // 팬 중 핀이 손가락에서 벗어나도 추적되게 document에
    document.addEventListener('pointerup',up);
    document.addEventListener('pointercancel',up);
  };
  FeedThumb.prototype.draw=function(){
    var p=this.getProjection();if(!p||!this.div)return;
    var px=p.fromLatLngToDivPixel(this.position);if(!px)return;
    this.div.style.left=px.x+'px';this.div.style.top=px.y+'px';
    var m=this.getMap(),z=m?m.getZoom():15;
    var s=z>=15?44:(z>=13?30:18); // 줌아웃 시 축소 (클러터 방지)
    this.div.style.width=s+'px';this.div.style.height=s+'px';
  };
  FeedThumb.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}
function clearFeedMarkers(){
  feedThumbOverlays.forEach(function(o){o.setMap(null);});feedThumbOverlays=[];
  phoneFeedThumbOverlays.forEach(function(o){o.setMap(null);});phoneFeedThumbOverlays=[];
}
function clusterFeedPins(m){ // 현재 줌의 월드픽셀 기준 근접(56px) 그룹핑 — 줌인하면 자연히 낱개로 펼쳐짐
  var z=m.getZoom();if(z==null)z=15;
  var s=256*Math.pow(2,z),TH=56;
  function px(p){
    var sin=Math.max(-0.9999,Math.min(0.9999,Math.sin(p.lat*Math.PI/180)));
    return {x:(p.lng/360+0.5)*s,y:(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*s};
  }
  var cl=[];
  feedItems.slice(0,30).forEach(function(f){
    if(!f.src)return;var pos=feedItemLatLng(f);if(!pos)return;
    var p=px(pos);
    for(var i=0;i<cl.length;i++){
      var dx=p.x-cl[i].x,dy=p.y-cl[i].y;
      if(dx*dx+dy*dy<TH*TH){cl[i].items.push({f:f,pos:pos});return;} // 핀 위치=첫 멤버(최신) 고정
    }
    cl.push({x:p.x,y:p.y,pos:pos,items:[{f:f,pos:pos}]});
  });
  return cl;
}
function renderFeedMarkers(){ // 피드 사진 = 지도 위 원형 썸네일 핀 (메인+폰 동시, 근접 핀=클러스터)
  if(typeof google==='undefined'||!google.maps||(!map&&!phoneMap))return;
  clearFeedMarkers();
  if(map)clusterFeedPins(map).forEach(function(c){feedThumbOverlays.push(new FeedThumb(c,map));});
  if(phoneMap)clusterFeedPins(phoneMap).forEach(function(c){phoneFeedThumbOverlays.push(new FeedThumb(c,phoneMap));});
}
var _fmZoom={m:null,p:null};
function reclusterFeedMarkers(){ // 줌 변경 시에만 재클러스터 (팬은 월드픽셀 기준이라 불변)
  var mz=map?map.getZoom():null,pz=phoneMap?phoneMap.getZoom():null;
  if(mz===_fmZoom.m&&pz===_fmZoom.p)return;
  _fmZoom.m=mz;_fmZoom.p=pz;renderFeedMarkers();
}

/* ========== 이모지 픽커 (재사용) ========== */
// 공용: 이모지 추가 프롬프트 → spotConfig.emojis에 등록, 추가된 이모지 반환(취소/빈값이면 null)
function promptAddEmoji(){
  var em=prompt('추가할 이모지를 입력하세요 (예: 🍕)');
  if(em==null)return null; em=em.trim(); if(!em)return null;
  if(!Array.isArray(spotConfig.emojis))spotConfig.emojis=SPOT_EMOJIS.slice();
  if(spotConfig.emojis.indexOf(em)<0){spotConfig.emojis.push(em);if(DRAFT)DRAFT.spotConfig.emojis=spotConfig.emojis.slice();markCloudDirty();renderMiniPreviews();}
  return em;
}
function buildEmojiPicker(container,getSel,onSel){
  container.innerHTML='';container.classList.add('spot-emoji-pick');
  var list=(spotConfig.emojis&&spotConfig.emojis.length)?spotConfig.emojis:SPOT_EMOJIS;
  // 이모지 꾹 누르기(롱프레스)/우클릭 → 삭제
  function delEmoji(em){
    if(!Array.isArray(spotConfig.emojis))spotConfig.emojis=SPOT_EMOJIS.slice();
    if(spotConfig.emojis.length<=1)return; // 최소 1개 유지
    var i=spotConfig.emojis.indexOf(em);if(i<0)return;
    spotConfig.emojis.splice(i,1);if(DRAFT)DRAFT.spotConfig.emojis=spotConfig.emojis.slice();markCloudDirty();renderMiniPreviews();
    if(getSel&&getSel()===em&&onSel)onSel(spotConfig.emojis[0]);
    buildEmojiPicker(container,getSel,onSel); // 다시 그림
    if(typeof renderSpotEmojiPicker==='function')renderSpotEmojiPicker();
  }
  list.forEach(function(em){
    var b=document.createElement('button');b.type='button';b.className='spot-emoji-btn'+(em===getSel()?' active':'');b.textContent=em;b.title='길게 눌러 삭제';
    b.addEventListener('click',function(){onSel(em);container.querySelectorAll('.spot-emoji-btn').forEach(function(x){x.classList.remove('active');});b.classList.add('active');});
    b.addEventListener('contextmenu',function(e){e.preventDefault();delEmoji(em);});
    var lt=null;
    b.addEventListener('touchstart',function(){clearTimeout(lt);lt=setTimeout(function(){delEmoji(em);},500);},{passive:true});
    b.addEventListener('touchend',function(){clearTimeout(lt);},{passive:true});
    b.addEventListener('touchmove',function(){clearTimeout(lt);},{passive:true});
    b.addEventListener('touchcancel',function(){clearTimeout(lt);},{passive:true});
    container.appendChild(b);
  });
  var add=document.createElement('button');add.type='button';add.className='spot-emoji-add';add.textContent='＋';add.title='이모지 추가';
  add.addEventListener('click',function(){var em=promptAddEmoji();if(!em)return;onSel(em);buildEmojiPicker(container,getSel,onSel);});
  container.appendChild(add);
}

/* ========== 스팟 입력 팝업 오버레이 (지도 위, 추가한 포인트 옆) ========== */
function SpotComposer(latLng,targetMap){this.position=latLng;this.div=null;this.emoji=currentSpotEmoji||((spotConfig.emojis&&spotConfig.emojis[0])||'💬');this.setMap(targetMap||map);}
function initSpotComposerClass(){
  SpotComposer.prototype=new google.maps.OverlayView();
  SpotComposer.prototype.onAdd=function(){
    var self=this;
    var wrap=document.createElement('div');wrap.className='spot-composer';
    wrap.innerHTML='<div class="sc-dot"></div><div class="sc-arrow"></div>'+
      '<div class="sc-emoji spot-emoji-pick"></div>'+
      '<input class="sc-text" type="text" maxlength="80" placeholder="메시지 입력 (Enter 등록)" />'+
      '<div class="sc-actions"><button type="button" class="action-btn small sc-cancel">취소</button><button type="button" class="action-btn accent small sc-ok">등록</button></div>';
    // 팝업 내부 조작이 지도로 전파돼 드래그/선택되지 않도록 차단
    ['mousedown','click','dblclick','touchstart','wheel','contextmenu'].forEach(function(ev){wrap.addEventListener(ev,function(e){e.stopPropagation();});});
    this.div=wrap;this.textEl=wrap.querySelector('.sc-text');
    buildEmojiPicker(wrap.querySelector('.sc-emoji'),function(){return self.emoji;},function(em){self.emoji=em;});
    wrap.querySelector('.sc-ok').addEventListener('click',function(){self.commit();});
    wrap.querySelector('.sc-cancel').addEventListener('click',function(){self.close();});
    this.textEl.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();self.commit();}else if(e.key==='Escape'){e.preventDefault();self.close();}});
    // 벡터 지도(mapId)에선 fromLatLngToDivPixel이 불안정 → 컨테이너 픽셀 + 지도 컨테이너에 부착
    this.getMap().getDiv().appendChild(wrap);
    setTimeout(function(){if(self.textEl)self.textEl.focus();},30);
  };
  SpotComposer.prototype.draw=function(){var p=this.getProjection();if(!p||!this.div)return;var px=p.fromLatLngToContainerPixel(this.position);if(!px)return;var w=this.div.offsetWidth||214,h=this.div.offsetHeight||190;this.div.style.left=(px.x-w/2)+'px';this.div.style.top=(px.y-h-24)+'px';}; // 팝업 하단(점)이 생성점에 오도록
  SpotComposer.prototype.commit=function(){
    var text=(this.textEl?this.textEl.value:'').trim();
    var spot={id:'sp_'+Date.now(),lat:this.position.lat(),lng:this.position.lng(),text:text,emoji:this.emoji||'💬'};
    currentSpotEmoji=this.emoji;this.close();
    if(currentRole==='admin'){adminSpots.push(spot);rebuildSpots();markCloudDirty();}
    else if(hasLive()){fbDb.collection('liveSpots').doc(spot.id).set(liveSpotDoc(spot)).catch(liveWriteErr);} // 스냅샷이 반영
    else{spot.live=true;spot.by=myUid();spot.byEmail=myEmail();demoSpots.push(spot);rebuildSpots();saveLocalSpots();}
  };
  SpotComposer.prototype.close=function(){this.setMap(null);if(composerOverlay===this)composerOverlay=null;if(currentMode==='local')updateInfoPanel(selectedFeatureName);};
  SpotComposer.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}
function closeComposer(){if(composerOverlay)composerOverlay.close();}

/* ========== 스팟 메시지 렌더/CRUD ========== */
function rebuildSpots(){ // 관리자 + 유저(라이브) 병합 → 렌더
  var seen={};spotMessages=[];
  adminSpots.concat(demoSpots).forEach(function(sp){if(sp&&!seen[sp.id]){seen[sp.id]=1;spotMessages.push(sp);}});
  renderSpots();
}
function liveSpotDoc(sp){return {id:sp.id,lat:sp.lat,lng:sp.lng,text:sp.text||'',emoji:sp.emoji||'💬',color:sp.color||null,by:sp.by||myUid(),byEmail:sp.byEmail||myEmail(),ts:sp.ts||Date.now()};}
function persistSpotEdit(sp){ // 개별 스팟 편집 저장 (관리자=클라우드 / 유저=라이브 / 폴백=로컬)
  if(!sp)return;
  if(sp.live){if(hasLive())fbDb.collection('liveSpots').doc(sp.id).set(liveSpotDoc(sp),{merge:true});else saveLocalSpots();}
  else markCloudDirty();
}
function renderSpots(){
  clearSpots();
  // 스팟 메시지는 모드(베이직/트렌드) 무관하게 항상 표시 — 모드는 지도 구획 방식일 뿐
  spotMessages.forEach(function(s){
    spotOverlays.push(new SpotBubble(s,spotConfig,map));
    if(phoneMap)phoneSpotOverlays.push(new SpotBubble(s,spotConfig,phoneMap));
  });
  renderFeedMarkers(); // 피드 썸네일 핀도 같은 타이밍에 갱신(지도 준비/모드 전환/클라우드 반영)
  renderSpotList();if(typeof renderDrawerDemo==='function')renderDrawerDemo();
}
/* ========== 스팟 메시지 목록(관리자 · 컨텐츠 설정) ========== */
function renderSpotList(){
  var area=document.getElementById('spot-list-area'),list=document.getElementById('spot-list');
  if(!list)return;
  list.innerHTML='';
  if(!spotMessages.length){if(area)area.style.display='none';return;}
  if(area)area.style.display='';
  spotMessages.forEach(function(s){
    var item=document.createElement('div');item.className='spot-item';
    item.innerHTML='<span class="spot-item-emoji"></span><span class="spot-item-text"></span><span class="spot-item-dot"></span><button class="spot-act" data-act="focus" title="이동">📍</button><button class="spot-act" data-act="del" title="삭제">🗑️</button>';
    item.querySelector('.spot-item-emoji').textContent=s.emoji||'💬';
    item.querySelector('.spot-item-text').textContent=(s.text||'').trim()||'(빈 메시지)';
    item.querySelector('.spot-item-dot').style.background=hexToRgba(s.color||spotConfig.bgColor||'#1c66e5',1);
    item.querySelector('[data-act="focus"]').addEventListener('click',function(){focusSpot(s);});
    item.querySelector('[data-act="del"]').addEventListener('click',function(){removeSpot(s.id);});
    list.appendChild(item);
  });
}
function setSelectedSpot(id){selectedSpotId=id;refreshSpotStyles();}
function focusSpot(s){
  if(!s)return;
  setSelectedSpot(s.id); // 선택 강조
  if(map){map.panTo({lat:s.lat,lng:s.lng});if(map.getZoom()<15)map.setZoom(16);}
  if(phoneMap){phoneMap.panTo({lat:s.lat,lng:s.lng});if(phoneMap.getZoom()<15)phoneMap.setZoom(16);
    var ins=phoneMapInsets();phoneMap.panBy(0,-(ins.top-ins.bottom)/2);}  // 헤더에 가리지 않게 보이는 영역 중앙으로
}
function clearSpots(){
  spotOverlays.forEach(function(o){o.setMap(null);});spotOverlays=[];
  phoneSpotOverlays.forEach(function(o){o.setMap(null);});phoneSpotOverlays=[];
}
function refreshSpotStyles(){spotOverlays.concat(phoneSpotOverlays).forEach(function(o){o.update(spotConfig);if(o.draw)o.draw();});}
// 현재 보고 있는 지도(모바일=폰, 데스크톱=메인)
function primaryMap(){return (window.matchMedia&&window.matchMedia('(max-width:768px)').matches&&phoneMap)?phoneMap:map;}
var addTargetMap=null, addTargetDiv=null, addAtLatLng=null, addMenuOpenedAt=0;
var mapProjHelper=null, phoneProjHelper=null;
function ProjHelper(m){this.setMap(m);}
function initProjHelperClass(){ProjHelper.prototype=new google.maps.OverlayView();ProjHelper.prototype.onAdd=function(){};ProjHelper.prototype.draw=function(){};ProjHelper.prototype.onRemove=function(){};}
function helperFor(m){return m===phoneMap?phoneProjHelper:mapProjHelper;}
function clientToLatLng(m,div,cx,cy){var h=helperFor(m),p=h&&h.getProjection();if(!p||!div)return null;var r=div.getBoundingClientRect();return p.fromContainerPixelToLatLng(new google.maps.Point(cx-r.left,cy-r.top));}
function positionAddMenuAt(cx,cy){var menu=document.getElementById('content-add-menu');var scr=menu&&menu.closest('.phone-screen');if(!scr)return;var r=scr.getBoundingClientRect();var x=cx-r.left,y=cy-r.top;menu.classList.add('at-point');menu.style.left=Math.max(6,Math.min(x,r.width*0.5))+'px';menu.style.right='auto';menu.style.top='auto';menu.style.bottom=Math.max(6,Math.min(r.height-y+8,r.height-6))+'px';}
function resetAddMenuPos(){var menu=document.getElementById('content-add-menu');if(!menu)return;menu.classList.remove('at-point');menu.style.left='';menu.style.right='';menu.style.top='';menu.style.bottom='';}
function openAddMenu(mapObj,div,latLng,popCx,popCy){
  addTargetMap=mapObj||primaryMap();addTargetDiv=div||null;addAtLatLng=latLng||null;
  resetAddMenuPos();
  if(popCx!=null&&div&&div.closest&&div.closest('.phone-screen'))positionAddMenuAt(popCx,popCy); // 폰에선 누른 지점에 팝업
  var el=document.getElementById('content-add-menu');if(el)el.classList.add('open');
  addMenuOpenedAt=Date.now();
}
function closeAddMenu(){var el=document.getElementById('content-add-menu');if(el)el.classList.remove('open');resetAddMenuPos();}
// 스팟 = 제스처 지점(있으면) 또는 보이는 화면 센터에 추가
function addSpotContent(){
  if(!currentRole)return; // 로그인 사용자면 데모(뷰어)도 추가 가능
  var m=addTargetMap||primaryMap();
  var ll=addAtLatLng||m.getCenter(); // 제스처 지점이 있으면 그 자리, 없으면(버튼) 화면 센터
  closeAddMenu();closeComposer();
  if(!ll)return;
  composerOverlay=new SpotComposer(new google.maps.LatLng(ll.lat(),ll.lng()),m);
}
// 화면 롱프레스(터치) / 우클릭 → 누른 지점에 컨텐츠 추가 팝업 + 그 지점에 생성
function attachAddGestures(el,mapObj){
  if(!el||el._addGest)return;el._addGest=true;
  function onContent(e){return !!(e.target&&e.target.closest&&e.target.closest('.spot-marker,.feed-pin'));} // 스팟·피드핀 위 롱프레스=콘텐츠 이동/편집 — 추가 메뉴와 충돌 방지
  el.addEventListener('contextmenu',function(e){e.preventDefault();if(onContent(e))return;openAddMenu(mapObj,el,clientToLatLng(mapObj,el,e.clientX,e.clientY),e.clientX,e.clientY);});
  var t=null,sx=0,sy=0,lx=0,ly=0;
  el.addEventListener('touchstart',function(e){if(e.touches.length!==1||onContent(e))return;sx=lx=e.touches[0].clientX;sy=ly=e.touches[0].clientY;clearTimeout(t);t=setTimeout(function(){openAddMenu(mapObj,el,clientToLatLng(mapObj,el,lx,ly),lx,ly);},520);},{passive:true});
  el.addEventListener('touchmove',function(e){if(!e.touches.length)return;lx=e.touches[0].clientX;ly=e.touches[0].clientY;if(Math.abs(lx-sx)>12||Math.abs(ly-sy)>12)clearTimeout(t);},{passive:true});
  el.addEventListener('touchend',function(){clearTimeout(t);},{passive:true});
  el.addEventListener('touchcancel',function(){clearTimeout(t);},{passive:true});
}
function removeSpot(id){
  var inAdmin=adminSpots.some(function(s){return s.id===id;});
  if(inAdmin){adminSpots=adminSpots.filter(function(s){return s.id!==id;});rebuildSpots();markCloudDirty();return;}
  if(hasLive()){fbDb.collection('liveSpots').doc(id).delete();return;} // 스냅샷이 반영
  demoSpots=demoSpots.filter(function(s){return s.id!==id;});rebuildSpots();saveLocalSpots();
}
function saveLocalSpots(){
  try{localStorage.setItem('nowhere_localSpots',JSON.stringify(
    demoSpots.map(function(s){return {id:s.id,lat:s.lat,lng:s.lng,text:s.text,emoji:s.emoji,color:s.color||null,by:s.by||'',byEmail:s.byEmail||''};})
  ));}catch(e){}
}
function loadLocalSpotsInto(){ // 로컬 폴백 전용 (라이브면 liveSpots 스냅샷이 담당)
  if(hasLive())return;
  try{
    var arr=JSON.parse(localStorage.getItem('nowhere_localSpots')||'[]');
    demoSpots=arr.map(function(s){return {id:s.id,lat:s.lat,lng:s.lng,text:s.text||'',emoji:s.emoji||'💬',color:s.color||null,by:s.by||'',byEmail:s.byEmail||'',live:true};});
  }catch(e){}
}
function promptDeleteSpot(id){if(confirm('이 스팟 메시지를 삭제할까요?'))removeSpot(id);}
/* ========== 스팟 편집 모달 (관리자: 개별 스팟 수정) ========== */
var editingSpotId=null;
function curEditSpot(){return spotMessages.find(function(x){return x.id===editingSpotId;});}
function openSpotEditor(id){
  var s=spotMessages.find(function(x){return x.id===id;});if(!s)return;
  var modal=document.getElementById('spot-edit-modal');if(!modal)return;
  editingSpotId=id;
  document.getElementById('se-text').value=s.text||'';
  renderSpotEditEmoji(s);
  paintSeColor(s.color||spotConfig.bgColor);
  modal.style.display='flex';
  var ti=document.getElementById('se-text');if(ti)ti.focus();
}
function closeSpotEditor(){var m=document.getElementById('spot-edit-modal');if(m)m.style.display='none';editingSpotId=null;}
function paintSeColor(hex){var sw=document.querySelector('#se-color .ct-fill');if(sw)sw.style.backgroundColor=hex;}
function renderSpotEditEmoji(s){
  var pick=document.getElementById('se-emoji-pick');if(!pick)return;pick.innerHTML='';
  var list=(spotConfig.emojis&&spotConfig.emojis.length)?spotConfig.emojis:SPOT_EMOJIS;
  list.forEach(function(em){
    var b=document.createElement('button');b.type='button';b.className='spot-emoji-btn'+(em===s.emoji?' active':'');b.textContent=em;
    b.addEventListener('click',function(){s.emoji=em;pick.querySelectorAll('.spot-emoji-btn').forEach(function(x){x.classList.remove('active');});b.classList.add('active');refreshSpotStyles();persistSpotEdit(s);});
    pick.appendChild(b);
  });
  var add=document.createElement('button');add.type='button';add.className='spot-emoji-add';add.textContent='＋';add.title='이모지 추가';
  add.addEventListener('click',function(){var em=promptAddEmoji();if(!em)return;s.emoji=em;renderSpotEditEmoji(s);renderSpotEmojiPicker();refreshSpotStyles();persistSpotEdit(s);});
  pick.appendChild(add);
}
function initSpotEditor(){
  var modal=document.getElementById('spot-edit-modal');if(!modal)return;
  document.getElementById('spot-edit-close').addEventListener('click',closeSpotEditor);
  modal.addEventListener('click',function(e){if(e.target===modal)closeSpotEditor();});
  document.getElementById('se-text').addEventListener('input',function(){var s=curEditSpot();if(s){s.text=this.value;refreshSpotStyles();persistSpotEdit(s);}});
  document.getElementById('se-color').addEventListener('click',function(e){e.stopPropagation();var s=curEditSpot();if(!s)return;
    openColorPopup(this,{color:s.color||spotConfig.bgColor,alpha:null,onInput:function(hex){s.color=hex;paintSeColor(hex);refreshSpotStyles();persistSpotEdit(s);}});});
  document.getElementById('se-delete').addEventListener('click',function(){var s=curEditSpot();closeSpotEditor();if(s)removeSpot(s.id);});
  document.getElementById('se-save').addEventListener('click',closeSpotEditor);
}

function initSpotUI(){
  var addBtn=document.getElementById('spot-add-btn');if(addBtn)addBtn.addEventListener('click',function(){addTargetMap=primaryMap();addTargetDiv=null;addAtLatLng=null;addSpotContent();}); // 사이드바: 바로 센터 추가
  initSpotEditor();
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeComposer();closeAddMenu();}});
  // 스팟 설정 (디자인 메뉴)
  bindInput('spot-max-chars','range',DRAFT.spotConfig,'maxChars',mpNoop);
  bindInput('spot-font-size','range',DRAFT.spotConfig,'fontSize',mpNoop);
  bindInput('spot-emoji-size','range',DRAFT.spotConfig,'emojiSize',mpNoop);
  bindInput('spot-bubble-radius','range',DRAFT.spotConfig,'bubbleRadius',mpNoop);
  bindInput('spot-emoji-gap','range',DRAFT.spotConfig,'emojiGap',mpNoop);
  bindInput('spot-emoji-letter','range',DRAFT.spotConfig,'emojiLetterSpacing',mpNoop);
  bindInput('spot-dot-scale','range',DRAFT.spotConfig,'dotScaleM',mpNoop);
  var tailEl=document.getElementById('spot-tail');if(tailEl)tailEl.addEventListener('change',function(){DRAFT.spotConfig.tail=this.checked;markDirtyFrom(this);});
  var posEl=document.getElementById('spot-emoji-pos');if(posEl)posEl.addEventListener('change',function(){DRAFT.spotConfig.emojiPos=this.value;markDirtyFrom(this);});
  var dsEl=document.getElementById('spot-dot-style');if(dsEl)dsEl.addEventListener('change',function(){DRAFT.spotConfig.dotStyle=this.value;markDirtyFrom(this);});
  makeColorControl('ct-spot-text',DRAFT.spotConfig,'textColor',null,mpNoop);
  makeColorControl('ct-spot-bg',DRAFT.spotConfig,'bgColor','bgOpacity',mpNoop);
}
function renderSpotEmojiPicker(){
  var pick=document.getElementById('spot-emoji-pick');if(!pick)return;
  var list=(spotConfig.emojis&&spotConfig.emojis.length)?spotConfig.emojis:SPOT_EMOJIS;
  if(list.indexOf(currentSpotEmoji)<0)currentSpotEmoji=list[0];
  pick.innerHTML='';
  list.forEach(function(em){
    var b=document.createElement('button');b.type='button';b.className='spot-emoji-btn'+(em===currentSpotEmoji?' active':'');b.textContent=em;
    b.addEventListener('click',function(){currentSpotEmoji=em;pick.querySelectorAll('.spot-emoji-btn').forEach(function(x){x.classList.remove('active');});b.classList.add('active');});
    pick.appendChild(b);
  });
  var add=document.createElement('button');add.type='button';add.className='spot-emoji-add';add.textContent='＋';add.title='이모지 추가';
  add.addEventListener('click',addCustomEmoji);
  pick.appendChild(add);
}
function addCustomEmoji(){
  var em=promptAddEmoji();
  if(!em)return;
  currentSpotEmoji=em; renderSpotEmojiPicker();
}

/* ========== 축척 ========== */
function niceDistance(d){var pw=Math.pow(10,Math.floor(Math.log(d)/Math.LN10));var f=d/pw;var n=f>=5?5:f>=2?2:1;return n*pw;}
function mapMpp(m){ // 지도 중심 위도 기준 m/px
  if(!m)return null;var c=m.getCenter(),z=m.getZoom();if(!c||z==null)return null;
  var mpp=156543.03392*Math.cos(c.lat()*Math.PI/180)/Math.pow(2,z);
  return (isFinite(mpp)&&mpp>0)?mpp:null;
}
// 축척 렌더 공통 (관리자 범례 · 폰 헤더 슬롯)
function renderScale(mapObj,elId,cls,spaced){
  var el=document.getElementById(elId);if(!el)return;
  var mpp=mapMpp(mapObj);if(!mpp){el.innerHTML='';return;}
  var dist=niceDistance(mpp*64),px=Math.round(dist/mpp);
  var label=dist>=1000?(dist/1000)+(spaced?' km':'km'):dist+(spaced?' m':'m');
  el.innerHTML='<span class="'+cls+'-bar" style="width:'+px+'px"></span><span class="'+cls+'-txt">'+label+'</span>';
}
function updateScaleLegend(){renderScale(map,'scale-legend','sl',true);}     // 관리자 메인 지도 범례
function updatePhoneScale(){renderScale(phoneMap,'phone-scale','psc',false);} // 폰: 심플 축척(자+수치만)
/* 드로어 뷰(관리자 전용 탭): demo=둘러보기(데모 메뉴) / admin=관리자 메뉴 */
var drawerView='demo';try{var _dv=localStorage.getItem('nowhere_drawerview');if(_dv==='admin'||_dv==='demo')drawerView=_dv;}catch(e){}
function setDrawerView(v){
  drawerView=(v==='admin')?'admin':'demo';
  try{localStorage.setItem('nowhere_drawerview',drawerView);}catch(e){}
  var body=document.getElementById('phone-drawer-body');if(!body)return;
  body.classList.toggle('dv-admin',drawerView==='admin');
  document.querySelectorAll('#drawer-tabs .dt-btn').forEach(function(b){b.classList.toggle('active',b.dataset.dt===drawerView);});
}
/* 폰 햄버거 메뉴: 설정 패널을 폰 내부 드로어로 이동 + 토글, 폰 모드 토글 */
function initPhoneMenu(){
  var drawer=document.getElementById('phone-drawer');
  var body=document.getElementById('phone-drawer-body');
  if(body){
    // 관리자용 드로어 탭: 둘러보기(데모 메뉴) ↔ 관리자 메뉴 (모바일 실기기 관리자도 데모 메뉴 접근)
    var tabs=document.createElement('div');tabs.id='drawer-tabs';
    tabs.innerHTML='<button type="button" class="dt-btn" data-dt="demo">🧭 둘러보기</button><button type="button" class="dt-btn" data-dt="admin">🛠 관리자</button>';
    body.appendChild(tabs);
    tabs.querySelectorAll('.dt-btn').forEach(function(b){b.addEventListener('click',function(){setDrawerView(b.dataset.dt);});});
    // 데모용 리스트(트렌드 존 · 현장 Request · 스팟) — 데모 모드에서 노출
    var demo=document.createElement('div');demo.id='drawer-demo'; // 내용은 renderDrawerDemo가 구성
    body.appendChild(demo);
    // 관리자 설정/컨텐츠 메뉴를 햄버거 드로어로 이동(관리자만 노출; 데모는 role-user로 숨김)
    ['content-toggle-row','content-section','settings-toggle-row','settings-section'].forEach(function(id){var el=document.getElementById(id);if(el)body.appendChild(el);});
    setDrawerView(drawerView);
  }
  // 🧩 기능 보기 — 드로어 헤더(닫기 옆), 폰/PC 공통
  document.querySelectorAll('.pdh-feature').forEach(function(b){b.addEventListener('click',openFeaturePage);});
  var ham=document.getElementById('phone-hamburger');
  var close=document.getElementById('phone-drawer-close');
  if(ham)ham.addEventListener('click',function(){var d=document.getElementById('phone-drawer');if(d&&d.classList.contains('open'))d.classList.remove('open');else openPhoneDrawer();});
  if(close)close.addEventListener('click',closeDrawer);
  // PC 전체 지도 사이드바 메뉴 — 폰 드로어와 동일 바디(#phone-drawer-body) 공유 → 항상 싱크
  var pcBtn=document.getElementById('pc-menu-btn'),pcClose=document.getElementById('pc-drawer-close');
  if(pcBtn)pcBtn.addEventListener('click',function(){var d=document.getElementById('pc-drawer');if(d&&d.classList.contains('open'))d.classList.remove('open');else openPcDrawer();});
  if(pcClose)pcClose.addEventListener('click',closeDrawer);
  document.querySelectorAll('#phone-mode .pm-btn').forEach(function(b){b.addEventListener('click',function(){switchMode(this.dataset.mode);});});
  // 우상단 프로필 → 계정/로그아웃 메뉴 토글
  var prof=document.getElementById('phone-profile'),pmenu=document.getElementById('phone-profile-menu');
  if(prof&&pmenu){
    prof.addEventListener('click',function(e){e.stopPropagation();pmenu.classList.toggle('open');});
    document.addEventListener('click',function(e){if(pmenu.classList.contains('open')&&!pmenu.contains(e.target)&&!prof.contains(e.target))pmenu.classList.remove('open');});
  }
  initContentPage();
}
/* ===== 동네소식 지면: 여러 이미지(좌우 스와이프 캐러셀) + 사이드바 리스트 관리(관리자) ===== */
var newsItems=[], newsIndex=0, newsSeq=1, newsCloudTimer=null, newsDragging=false;
var newsCardVer=1; // 요약 카드 스타일 1=풀이미지 2=분할 3=글라스캡션
try{var _nv=parseInt(localStorage.getItem('nowhere_newsver'),10);if(_nv>=1&&_nv<=3)newsCardVer=_nv;}catch(e){}
// 무료 티어 안전장치: 개수 · 1장 용량 · 문서 총합 상한 (Firestore 1MB 문서 하드리밋 안쪽으로 강제 → Storage/Blaze 불필요)
var NEWS_MAX_COUNT=6, NEWS_MAX_ITEM_BYTES=170000, NEWS_DOC_BUDGET=900000;
function initContentPage(){
  var frame=document.getElementById('cp-frame');
  var addBtn=document.getElementById('news-add-btn'),file=document.getElementById('news-file');
  loadNews();
  if(addBtn)addBtn.addEventListener('click',function(){if(currentRole==='admin'&&file)file.click();});
  // 이미지 링크(URL)로 추가 — URL만 저장(저장부담 거의 0)
  var zcs=document.getElementById('zone-card-style');
  if(zcs){zcs.value=zoneCardStyle;zcs.addEventListener('change',function(){
    zoneCardStyle=this.value==='list'?'list':'glass';
    try{localStorage.setItem('nowhere_zonecard',zoneCardStyle);}catch(e){}
    renderDrawerDemo();renderSummaryZones();markCloudDirty();
  });}
  var cv=document.getElementById('news-cardver');
  if(cv){cv.value=String(newsCardVer);cv.addEventListener('change',function(){
    newsCardVer=parseInt(this.value,10)||1;
    try{localStorage.setItem('nowhere_newsver',String(newsCardVer));}catch(e){}
    markNewsDirty();renderNews();
  });}
  var urlBtn=document.getElementById('news-url-btn'),urlIn=document.getElementById('news-url-input');
  var addUrl=function(){if(currentRole!=='admin'||!urlIn)return;var v=urlIn.value;urlIn.value='';addNewsUrl(v);};
  if(urlBtn)urlBtn.addEventListener('click',addUrl);
  if(urlIn)urlIn.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();addUrl();}});
  if(file)file.addEventListener('change',function(){
    var arr=Array.prototype.slice.call(this.files||[]);this.value=''; // 파일을 먼저 배열로 복사(value='' 시 FileList 비워짐)
    if(!arr.length)return;
    var room=NEWS_MAX_COUNT-newsItems.length;
    if(room<=0){alert('동네소식은 최대 '+NEWS_MAX_COUNT+'장까지예요. 기존 이미지를 지운 뒤 추가해 주세요.');return;}
    var take=arr.slice(0,room);
    if(arr.length>room)alert('최대 '+NEWS_MAX_COUNT+'장까지라 '+room+'장만 추가할게요.');
    var pending=take.length;
    take.forEach(function(f){compressNews(f,function(url){
      if(!url)alert('이미지가 너무 커서 추가하지 못했어요. 더 작은 사진을 사용해 주세요.');
      else if(newsTotalBytes()+url.length>NEWS_DOC_BUDGET)alert('저장 용량 한도에 도달했어요(무료 범위 보호). 기존 이미지를 지운 뒤 추가해 주세요.');
      else newsItems.push({id:'n_'+(newsSeq++),src:url,region:currentCenterDong()});
      if(--pending===0){saveNews();renderNews();}
    });});
  });
  // 캐러셀 스와이프 (아이템 2개+)
  if(frame){
    var sx=null,dxv=0;
    frame.addEventListener('pointerdown',function(e){if(newsView.length<2)return;sx=e.clientX;dxv=0;newsDragging=true;setTrackAnim(false);try{frame.setPointerCapture(e.pointerId);}catch(_){}});
    frame.addEventListener('pointermove',function(e){if(sx==null)return;dxv=e.clientX-sx;setTrackX(-newsIndex*slideW()+dxv);});
    frame.addEventListener('pointerup',function(){if(sx==null)return;var w=slideW();if(dxv<-w*0.18&&newsIndex<newsView.length-1)newsIndex++;else if(dxv>w*0.18&&newsIndex>0)newsIndex--;sx=null;newsDragging=false;setTrackAnim(true);snapTrack();updateDots();updateFoldBtnTone();});
    frame.addEventListener('pointercancel',function(){sx=null;newsDragging=false;setTrackAnim(true);snapTrack();});
  }
}
function slideW(){var f=document.getElementById('cp-frame');return f?f.offsetWidth:0;}
function setTrackAnim(on){var t=document.getElementById('cp-track');if(t)t.style.transition=on?'transform .28s ease':'none';}
function setTrackX(px){var t=document.getElementById('cp-track');if(t)t.style.transform='translateX('+px+'px)';}
function snapTrack(){setTrackX(-newsIndex*slideW());}
function updateDots(){var d=document.getElementById('cp-dots');if(!d)return;d.querySelectorAll('.cp-dot').forEach(function(el,i){el.classList.toggle('active',i===newsIndex);});}
var newsView=[]; // 현재 탭에 보이는 지면 카드 (관리자 지면 이미지 + 지도 탭=연관 피드)
function feedSummaryItems(){ // 지역 컨텐츠 지면용: 현 위치 연관성 높은 피드 (스팟 메시지 제외 — 사진 컨텐츠만)
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());
  var clat=c?c.lat():null,clng=c?c.lng():null;
  var arr=feedItems.filter(function(f){return !!f.src;}).map(function(f){
    var pc=feedItemLatLng(f);
    var d=(pc&&clat!=null)?((pc.lat-clat)*(pc.lat-clat)+(pc.lng-clng)*(pc.lng-clng)):9e9;
    return {f:f,d:d};
  });
  arr.sort(function(a,b){return a.d===b.d?((b.f.ts||0)-(a.f.ts||0)):(a.d-b.d);}); // 가까운 순 + 최신순
  return arr.slice(0,4).map(function(o){var f=o.f;
    return {feed:true,id:f.id,src:f.src,region:f.region||'',zone:f.zone||null,title:f.desc||'',kind:f.kind||'post',ts:f.ts||0,lat:f.lat,lng:f.lng};});
}
function renderNews(){
  var frame=document.getElementById('cp-frame'),track=document.getElementById('cp-track'),dots=document.getElementById('cp-dots');
  newsView=newsItems.filter(function(it){return (it.tab||'map')===currentTab;});
  if(currentTab==='map')newsView=newsView.concat(feedSummaryItems()); // 관리자 지면(수동) 먼저 + 연관 피드
  var ph=document.getElementById('cp-placeholder');
  if(ph)ph.textContent=(currentTab==='feed'?'추천 컨텐츠 지면':(currentTab==='social'?'커뮤니티 지면':'지역 콘텐츠 지면'));
  if(frame){frame.classList.remove('cv1','cv2','cv3');frame.classList.add('cv'+newsCardVer);}
  if(track){track.innerHTML='';newsView.forEach(function(it){
    var sl=document.createElement('div');sl.className='cp-slide'+(it.feed?' cp-feed':'');
    var im=document.createElement('img');im.src=it.src;im.alt='';sl.appendChild(im);
    var grad=document.createElement('div');grad.className='cps-grad';sl.appendChild(grad);
    var body=document.createElement('div');body.className='cps-body';
    var place=document.createElement('span');place.className='cps-place';place.textContent=it.region||'';
    var ttl=document.createElement('span');ttl.className='cps-title';ttl.textContent=it.title||'';
    body.appendChild(place);body.appendChild(ttl);sl.appendChild(body);
    if(it.feed){ // 피드 카드: 존 칩 · LIVE · ♥ 좋아요 표시
      var chips=document.createElement('div');chips.className='cps-chips';
      if(it.kind==='cam'){var lv=document.createElement('span');lv.className='cpc cpc-live';lv.textContent='LIVE';chips.appendChild(lv);}
      var fz=feedZoneOf(it);
      if(fz){var zc=document.createElement('span');zc.className='cpc';zc.textContent=fz.name;zc.style.background=hexToRgba(fz.color||'#7b61ff',0.92);chips.appendChild(zc);}
      var L=likeInfo(it.id);
      if(L.n){var lk=document.createElement('span');lk.className='cpc cpc-like';lk.textContent='♥ '+L.n;chips.appendChild(lk);}
      sl.appendChild(chips);
    }
    track.appendChild(sl);
  });}
  if(newsIndex>=newsView.length)newsIndex=Math.max(0,newsView.length-1);
  if(frame)frame.classList.toggle('has-news',newsView.length>0);
  if(dots){dots.innerHTML='';for(var i=0;i<newsView.length;i++){var dt=document.createElement('span');dt.className='cp-dot'+(i===newsIndex?' active':'');dots.appendChild(dt);}dots.style.display=newsView.length>1?'':'none';}
  setTrackAnim(false);snapTrack();
  renderNewsList();
  updateFoldBtnTone();
  renderSummaryZones();
}
function renderNewsList(){
  var list=document.getElementById('news-list');if(!list)return;
  list.innerHTML='';
  if(!newsItems.length){var e=document.createElement('p');e.className='section-hint';e.textContent='아직 올린 이미지가 없어요.';list.appendChild(e);return;}
  newsItems.forEach(function(it,i){
    var row=document.createElement('div');row.className='news-item';
    var th=document.createElement('img');th.className='ni-thumb';th.src=it.src;
    var tabSel=document.createElement('select');tabSel.className='mini-select ni-tab';
    [['map','지도'],['feed','피드'],['social','소셜']].forEach(function(o){var op=document.createElement('option');op.value=o[0];op.textContent=o[1];tabSel.appendChild(op);});
    tabSel.value=it.tab||'map';
    tabSel.addEventListener('change',function(){newsItems[i].tab=this.value;saveNews();renderNews();});
    var reg=document.createElement('input');reg.className='ni-region';reg.type='text';reg.placeholder='위치(동)';reg.value=it.region||'';
    reg.addEventListener('change',function(){newsItems[i].region=this.value.trim();saveNews();renderNews();});
    var ttl=document.createElement('input');ttl.className='ni-region ni-title';ttl.type='text';ttl.maxLength=40;ttl.placeholder='카드 제목 텍스트';ttl.value=it.title||'';
    ttl.addEventListener('change',function(){newsItems[i].title=this.value.trim();saveNews();renderNews();});
    var fields=document.createElement('div');fields.className='ni-fields';
    var r1=document.createElement('div');r1.className='ni-row';r1.appendChild(tabSel);r1.appendChild(reg);
    fields.appendChild(r1);fields.appendChild(ttl);
    var act=document.createElement('div');act.className='ni-actions';
    var up=mkBtn('↑'),dn=mkBtn('↓'),del=mkBtn('🗑');
    up.onclick=function(){newsMove(i,-1);};dn.onclick=function(){newsMove(i,1);};del.onclick=function(){newsDelete(i);};
    act.appendChild(up);act.appendChild(dn);act.appendChild(del);
    row.appendChild(th);row.appendChild(fields);row.appendChild(act);list.appendChild(row);
  });
  function mkBtn(t){var b=document.createElement('button');b.type='button';b.textContent=t;return b;}
}
function newsMove(i,dir){var j=i+dir;if(j<0||j>=newsItems.length)return;var t=newsItems[i];newsItems[i]=newsItems[j];newsItems[j]=t;saveNews();renderNews();}
function newsDelete(i){newsItems.splice(i,1);saveNews();renderNews();}
function newsTotalBytes(){var t=0;newsItems.forEach(function(it){t+=(it.src||'').length;});return t;}
function currentCenterDong(){var m=map||phoneMap;if(!m)return '';var c=m.getCenter();return c?(dongAt(c.lat(),c.lng())||''):'';} // 업로드 시점 지도 중심 동
// 이미지 링크(URL) 추가: https 검증 + 실제 로드 확인 후 URL만 저장
function addNewsUrl(url){
  url=(url||'').trim();
  if(!/^https:\/\/\S+/i.test(url)){alert('https:// 로 시작하는 이미지 링크를 넣어주세요. (구글 이미지는 "이미지 주소 복사"로 얻은 직접 주소)');return;}
  if(newsItems.length>=NEWS_MAX_COUNT){alert('동네소식은 최대 '+NEWS_MAX_COUNT+'장까지예요. 기존 이미지를 지운 뒤 추가해 주세요.');return;}
  var probe=new Image();
  probe.onload=function(){newsItems.push({id:'n_'+(newsSeq++),src:url,region:currentCenterDong()});saveNews();renderNews();};
  probe.onerror=function(){alert('이 링크의 이미지를 불러올 수 없어요. 직접 이미지 주소(끝이 .jpg/.png 등, https)인지, 외부 링크 허용 사이트인지 확인해 주세요.');};
  probe.src=url;
}
// 900px로 줄이고, 1장 상한 초과 시 품질을 낮춰가며 압축(그래도 크면 null=거부)
function compressNews(file,cb){
  var r=new FileReader();
  r.onload=function(e){var im=new Image();
    im.onload=function(){
      var max=900,w=im.width,h=im.height;if(w>max||h>max){var k=Math.min(max/w,max/h);w=Math.round(w*k);h=Math.round(h*k);}
      var cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(im,0,0,w,h);
      var q=0.72,url=cv.toDataURL('image/jpeg',q);
      while(url.length>NEWS_MAX_ITEM_BYTES&&q>0.4){q-=0.1;url=cv.toDataURL('image/jpeg',q);}
      cb(url.length<=NEWS_MAX_ITEM_BYTES?url:null);
    };
    im.onerror=function(){cb(null);};im.src=e.target.result;
  };
  r.onerror=function(){cb(null);};r.readAsDataURL(file);
}
function saveNews(){try{localStorage.setItem('nowhere_news',JSON.stringify(newsItems));}catch(e){}markNewsDirty();} // 로컬 캐시 + 공유(관리자)
function loadNews(){try{var s=localStorage.getItem('nowhere_news');if(s){var o=JSON.parse(s);if(Array.isArray(o))newsItems=o;}}catch(e){}renderNews();}
// 공유 저장 (관리자만 · Firestore shared/news · 무료 상한 재확인)
function markNewsDirty(){if(!fbDb||!currentUser||currentRole!=='admin')return;clearTimeout(newsCloudTimer);newsCloudTimer=setTimeout(newsCloudSave,1200);}
function newsCloudSave(){
  if(!fbDb||!currentUser||currentRole!=='admin')return;
  var total=0,items=[];
  for(var i=0;i<newsItems.length&&items.length<NEWS_MAX_COUNT;i++){var s=newsItems[i].src||'';if(total+s.length>NEWS_DOC_BUDGET)break;total+=s.length;items.push({id:newsItems[i].id,src:s,region:newsItems[i].region||'',tab:newsItems[i].tab||'map',title:newsItems[i].title||''});}
  fbDb.collection('shared').doc('news').set({items:items,cardVer:newsCardVer,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.email||'',updatedSid:SESSION_SID})
    .catch(function(e){console.warn('news save fail',e);alert('동네소식 공유 저장 실패(용량 초과 가능): '+e.message);});
}
// 공유 로드 (로그인 사용자 모두)
function loadNewsFromCloud(){ // 실시간: 요약 지면 이미지 변경 즉시 반영
  if(!fbDb)return;
  if(newsUnsub){newsUnsub();newsUnsub=null;}
  newsUnsub=fbDb.collection('shared').doc('news').onSnapshot(function(doc){
    if(doc.metadata.hasPendingWrites)return;
    if(!doc.exists)return;var d=doc.data();if(!d||!Array.isArray(d.items))return;
    if(d.updatedSid&&d.updatedSid===SESSION_SID)return; // 이 세션의 저장 에코만 무시 (새 접속은 항상 적용 — v1.46.1)
    newsItems=d.items.map(function(it){return {id:it.id||('n_'+(newsSeq++)),src:it.src,region:it.region||'',tab:it.tab||'map',title:it.title||''};});
    if(d.cardVer>=1&&d.cardVer<=3){newsCardVer=d.cardVer;var _cv=document.getElementById('news-cardver');if(_cv)_cv.value=String(newsCardVer);}
    try{localStorage.setItem('nowhere_news',JSON.stringify(newsItems));}catch(e){}
    newsIndex=0;renderNews();
  },function(e){console.warn('news live fail',e);});
}
// 공유 메뉴 바디를 여는 드로어로 옮겨 렌더 (한 번에 하나만 열림 → 동일 DOM = 싱크)
function openPhoneDrawer(){var d=document.getElementById('phone-drawer'),b=document.getElementById('phone-drawer-body'),pc=document.getElementById('pc-drawer');if(!d)return;if(pc)pc.classList.remove('open');if(b&&b.parentNode!==d)d.appendChild(b);d.classList.add('open');renderDrawerDemo();}
function openPcDrawer(){var d=document.getElementById('pc-drawer'),b=document.getElementById('phone-drawer-body'),ph=document.getElementById('phone-drawer');if(!d)return;if(ph)ph.classList.remove('open');if(b&&b.parentNode!==d)d.appendChild(b);d.classList.add('open');renderDrawerDemo();}
function closeDrawer(){var p=document.getElementById('phone-drawer');if(p)p.classList.remove('open');var c=document.getElementById('pc-drawer');if(c)c.classList.remove('open');}
// 드로어 데모 리스트(트렌드 존/스팟) 렌더 — 데모·관리자 모두 데이터로 채움
var drawerFold={};try{drawerFold=JSON.parse(localStorage.getItem('nowhere_drawerfold')||'{}')||{};}catch(e){}
function dsSection(key,title,sub){ // 접이식 드로어 섹션 (title=이모지 없는 타이틀, sub=옅은 보조 라벨)
  var sec=document.createElement('div');sec.className='drawer-sec'+(drawerFold[key]?' folded':'');
  var head=document.createElement('button');head.type='button';head.className='ds-head';
  head.innerHTML='<span class="ds-tl"><span class="ds-tt"></span><span class="ds-sub"></span></span><i class="ds-chev">▾</i>';
  head.querySelector('.ds-tt').textContent=title;
  var sb=head.querySelector('.ds-sub');if(sub)sb.textContent=sub;else sb.style.display='none';
  var body=document.createElement('div');body.className='ds-body';
  head.addEventListener('click',function(){
    drawerFold[key]=sec.classList.toggle('folded');
    try{localStorage.setItem('nowhere_drawerfold',JSON.stringify(drawerFold));}catch(e){}
  });
  sec.appendChild(head);sec.appendChild(body);
  return {sec:sec,body:body};
}
function focusedZoneId(){ // 현재 포커스된 존 (선택 > 렌즈 > 화면 센터)
  var zid=phoneSelectedZoneId||(phoneLens&&phoneLens.zoneId);
  if(zid)return zid;
  var c=phoneMap&&phoneVisibleCenter();
  var z=c?zoneObjAtCenter(c.lat(),c.lng()):null;
  return z?z.id:null;
}
function sortedZonesForList(){ // 정렬: 포커스 존 → 좋아요(하트 합산) → 가까운 순
  var fid=focusedZoneId();
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());
  function d2(z){if(!c||!z.hexCenters||!z.hexCenters.length)return 9e9;var ce=zoneCentroid(z);var dy=ce.lat-c.lat(),dx=ce.lng-c.lng();return dy*dy+dx*dx;}
  var arr=trendZones.slice();
  arr.sort(function(a,b){
    if(fid){if(a.id===fid)return -1;if(b.id===fid)return 1;}
    var h=zoneTotalHearts(b)-zoneTotalHearts(a);
    if(h)return h;
    return d2(a)-d2(b);
  });
  return {arr:arr,fid:fid};
}
function makeZoneCard(zone,focused){ // 존 카드 (글래스 캡션 / 리스트) 공용 · focused=현재 포커스 존 표시
  var pho=zoneBestPhoto(zone);
  var c=document.createElement('button');c.type='button';
  if(zoneCardStyle==='list'){
    c.className='tz-card tzl';
    c.innerHTML='<div class="tzl-thumb">'+(pho?'<img alt=""/>':'<span class="tzl-ph"></span>')+'</div>'+
      '<b class="tzl-name"></b><span class="tzl-cat"></span>'+
      '<div class="tzl-meta"><span class="tzl-heart">❤ <em></em></span><span class="tzl-dist"></span></div>';
    c.querySelector('.tzl-name').textContent=zone.name;
    var cat=c.querySelector('.tzl-cat');cat.textContent=zone.desc||'트렌드 존';
    var im=c.querySelector('img');if(im)im.src=pho;
    var ph=c.querySelector('.tzl-ph');if(ph){ph.style.background=hexToRgba(zone.color,0.16);ph.style.color=zone.color;ph.textContent='⬡';}
    c.querySelector('.tzl-heart em').textContent=zoneTotalHearts(zone);
    var dl=zoneDistLabel(zone),dd=c.querySelector('.tzl-dist');dd.textContent=dl;dd.classList.toggle('here',dl==='Here');
  }else{
    c.className='tz-card';
    c.innerHTML='<span class="tz-bubble"><b></b><i></i></span>'+(pho?'<img class="tz-photo" alt="" />':'<span class="tz-photo tz-ph"></span>');
    c.querySelector('b').textContent=zone.name;
    var de=c.querySelector('i');de.textContent=zone.desc||'';if(!zone.desc)de.style.display='none';
    var im2=c.querySelector('img');if(im2)im2.src=pho;
    var ph2=c.querySelector('.tz-ph');if(ph2){ph2.style.background=hexToRgba(zone.color,0.16);ph2.style.color=zone.color;ph2.textContent='⬡';}
  }
  if(focused){ // 포커스 존: 액센트 테두리 + 체크 뱃지
    c.classList.add('focus');
    var ck=document.createElement('span');ck.className='tzf-check';ck.textContent='✓';c.appendChild(ck);
  }
  c.addEventListener('click',function(){if(currentMode!=='trend')switchMode('trend',{noNearby:true});selectPhoneZone(zone);closeDrawer();});
  return c;
}
function buildZoneScroll(){
  var sc=document.createElement('div');sc.className='tz-scroll'+(zoneCardStyle==='list'?' tz-scroll-list':'');
  var s=sortedZonesForList(); // 포커스 존 맨 앞 → 좋아요 → 거리
  s.arr.forEach(function(zone){sc.appendChild(makeZoneCard(zone,zone.id===s.fid));});
  return sc;
}
/* 요약 공간(트렌드 모드 지도 탭): 사이드바와 동일한 존 리스트 표시 */
function renderSummaryZones(){
  var box=document.getElementById('cp-zones');if(!box)return;
  var show=(currentMode==='trend'&&currentTab==='map');
  box.style.display=show?'block':'none';
  var frame=document.getElementById('cp-frame');
  if(frame)frame.style.display=show?'none':'';
  var col=document.getElementById('sum-collapse');if(col)col.style.display=show?'none':''; // 존 요약은 접기 없음
  if(!show){box.innerHTML='';return;}
  box.innerHTML='';
  box.className='cp-zones'+(zoneCardStyle==='list'?' list':'');
  if(!trendZones.length){var e=document.createElement('div');e.className='cpz-empty';e.textContent='등록된 트렌드 존이 없어요.';box.appendChild(e);return;}
  box.appendChild(buildZoneScroll());
}
function drawerEmpty(msg){var e=document.createElement('div');e.className='drawer-empty';e.textContent=msg;return e;}
function spotsInFocusedRegion(){ // 드로어 워드클라우드: 현재 보는 지역(베이직=동/트렌드=존)의 스팟만
  if(currentMode==='trend'){
    var zid=phoneSelectedZoneId||(phoneLens&&phoneLens.zoneId);
    var z=zid?trendZones.find(function(x){return x.id===zid;}):null;
    if(!z){var c=phoneMap&&phoneVisibleCenter();if(c)z=zoneObjAtCenter(c.lat(),c.lng());}
    if(!z)return [];
    return spotMessages.filter(function(m){return ptInZone(z,m.lat,m.lng);});
  }
  var foc=focusedRegionName();
  if(!foc)return spotMessages.slice();
  var nf=normRegion(foc);
  return spotMessages.filter(function(m){var d=regionAt(m.lat,m.lng);return d&&(d.name===foc||normRegion(d.name)===nf);});
}
function renderDrawerDemo(){ // 순서: 트렌드존 → 현장 Request → 스팟 (각 블록 상시 표시, 없으면 안내)
  var root=document.getElementById('drawer-demo');if(!root)return;
  root.innerHTML='';
  // ① 트렌드 존: 말풍선(볼드 이름+얇은 설명)+썸네일 카드 · 가로 스크롤
  var z=dsSection('zones','트렌드 존');
  if(!trendZones.length){z.body.appendChild(drawerEmpty('등록된 트렌드 존이 없어요.'));}
  else{
    z.body.appendChild(buildZoneScroll());
  }
  root.appendChild(z.sec);
  // ② 현장 Request: 카드 가로 스크롤 — 타인=활성(10분 내)만+응답 버튼 / 내 것=상시 표시+답변 보기
  var q=dsSection('reqs','현장 Request');
  var visReqs=(typeof fieldRequests!=='undefined')?fieldRequests.filter(function(rq){return isMyReq(rq)||reqActive(rq);}):[];
  if(!visReqs.length){q.body.appendChild(drawerEmpty('등록된 현장 Request가 없어요.'));}
  else{
    var qs=document.createElement('div');qs.className='rq-scroll';
    visReqs.forEach(function(rq){
      var mine=isMyReq(rq),active=reqActive(rq);
      var c=document.createElement('div');c.className='rq-card'+(mine?' mine':''); // 내부 응답 버튼 때문에 button→div
      c.innerHTML='<span class="rqc-place"></span><span class="rqc-q"></span>'; // 응답 대기/결과는 표시 안 함
      c.querySelector('.rqc-place').textContent=rq.place;
      c.querySelector('.rqc-q').textContent='"'+rq.q+'"';
      if(mine||currentRole==='admin'){ // 본인·관리자: 삭제
        var del=document.createElement('button');del.type='button';del.className='rqc-del';del.textContent='🗑';del.title='Request 삭제';
        del.addEventListener('click',function(e){e.stopPropagation();deleteRequest(rq.id);});
        c.appendChild(del);
      }
      if(mine){ // 요청자 본인: 내 Request 뱃지 + 상태 + 답변 목록 펼쳐 보기
        var bd=document.createElement('div');bd.className='rqc-badges';
        bd.innerHTML='<span class="rqc-mine">🙋 내 Request</span><span class="rqc-state'+(active?'':' end')+'">'+(active?'⏳ 답변 받는 중':'⏱ 종료')+'</span>';
        c.insertBefore(bd,c.firstChild);
        var n=(rq.answers||[]).length,ansBox=null;
        var vb=document.createElement('button');vb.type='button';vb.className='rqc-btn';vb.textContent='💬 답변 '+n+'개 보기';
        vb.addEventListener('click',function(e){e.stopPropagation();
          if(ansBox){ansBox.remove();ansBox=null;vb.textContent='💬 답변 '+n+'개 보기';return;}
          ansBox=document.createElement('div');ansBox.className='rqc-answers';
          if(!n)ansBox.innerHTML='<div class="rqa-empty">아직 도착한 답변이 없어요.</div>';
          else (rq.answers||[]).forEach(function(a){
            var it=document.createElement('div');it.className='rqa-item';
            if(a.t){var tx=document.createElement('span');tx.className='rqa-t';tx.textContent=a.t;it.appendChild(tx);}
            if(a.img){var im=document.createElement('img');im.className='rqa-img';im.src=a.img;im.alt='';it.appendChild(im);}
            var tm=document.createElement('i');tm.className='rqa-time';tm.textContent=timeAgo(a.ts||0);it.appendChild(tm);
            ansBox.appendChild(it);
          });
          c.appendChild(ansBox);vb.textContent='답변 접기';
        });
        var actm=document.createElement('div');actm.className='rqc-actions';actm.appendChild(vb);c.appendChild(actm);
      }else{ // 현장 유저: 응답(코멘트/사진) — 활성 카드만 여기까지 옴
        var act=document.createElement('div');act.className='rqc-actions';
        var cm=document.createElement('button');cm.type='button';cm.className='rqc-btn';cm.textContent='💬 답하기';
        cm.addEventListener('click',function(e){e.stopPropagation();
          var t=prompt('현장 답변을 입력하세요\n"'+rq.q+'"');
          if(t&&t.trim()){answerRequest(rq.id,t.trim());renderDrawerDemo();}
        });
        var ph=document.createElement('button');ph.type='button';ph.className='rqc-btn';ph.textContent='📷 사진';
        ph.addEventListener('click',function(e){e.stopPropagation();answerRequestPhoto(rq.id);});
        act.appendChild(cm);act.appendChild(ph);c.appendChild(act);
      }
      c.addEventListener('click',function(){
        setNavActive('map');switchTab('map');
        if(phoneMap){phoneMap.panTo({lat:rq.lat,lng:rq.lng});if(phoneMap.getZoom()<15)phoneMap.setZoom(16);}
        closeDrawer();
      });
      qs.appendChild(c);
    });
    q.body.appendChild(qs);
  }
  root.appendChild(q.sec);
  // ③ 스팟 메시지: 현재 보는 지역(동/존)만 · 워드 클라우드 (간결한 무채색 톤)
  var focName=focusedRegionName();
  var focSpots=spotsInFocusedRegion();
  var sp=dsSection('spots','스팟 메시지',focName||'');
  if(!focSpots.length){sp.body.appendChild(drawerEmpty(focName?focName+'에 스팟 메시지가 없어요.':'등록된 스팟 메시지가 없어요.'));}
  else{
    var cloud=document.createElement('div');cloud.className='sp-cloud';
    focSpots.forEach(function(m){
      var b=document.createElement('button');b.type='button';b.className='sp-word'; // 단일 텍스트 스타일(크기 티어 폐지)
      b.textContent=(m.emoji?m.emoji+' ':'')+((m.text||'').trim()||'…');
      b.style.background=hexToRgba(m.color||spotConfig.bgColor||'#1c66e5',0.07); // 스팟 색 아주 옅은 채색
      b.addEventListener('click',function(){setNavActive('map');switchTab('map');focusSpot(m);closeDrawer();});
      cloud.appendChild(b);
    });
    sp.body.appendChild(cloud);
  }
  root.appendChild(sp.sec);
  renderSummaryZones();
}

/* ========== 로컬모드 선택 라벨 ========== */
function featureCentroid(feature){try{var b=new google.maps.LatLngBounds();feature.getGeometry().forEachLatLng(function(ll){b.extend(ll);});return b.getCenter();}catch(e){return null;}}
function localLabelStyle(){return {bg:hexToRgba(localLabelConfig.bgColor,Number(localLabelConfig.bgOpacity)),color:localLabelConfig.textColor,fontSize:Number(localLabelConfig.fontSize)};}
function showLocalLabel(){
  removeLocalLabel();
  if(currentMode!=='local'||!localLabelConfig.enabled||!selectedFeature)return;
  var c=featureCentroid(selectedFeature);if(!c)return;
  localLabel=new MapLabel(c,selectedFeatureName||'',localLabelStyle(),map);
  if(phoneMap)phoneLocalLabel=new MapLabel(c,selectedFeatureName||'',localLabelStyle(),phoneMap);
}
function removeLocalLabel(){if(localLabel){localLabel.setMap(null);localLabel=null;}if(phoneLocalLabel){phoneLocalLabel.setMap(null);phoneLocalLabel=null;}}
function updateLocalLabelStyle(){if(localLabel){localLabel.updateStyle(localLabelStyle());if(phoneLocalLabel)phoneLocalLabel.updateStyle(localLabelStyle());}else showLocalLabel();}

/* ========== 존 라벨 스타일 ========== */
function zoneLabelStyle(zoneColor){return {bg:hexToRgba(zoneColor,Number(zoneLabelConfig.bgOpacity)),color:zoneLabelConfig.textColor,fontSize:Number(zoneLabelConfig.fontSize)};}
function refreshZoneLabels(){trendZones.forEach(function(z){if(z.label)z.label.updateStyle(zoneLabelStyle(z.color));});refreshPhoneZoneLabels();}

/* ========== 폰 미러 (모바일 미리보기) ========== */
function initPhoneMirror(){
  var el=document.getElementById('phone-map');if(!el||typeof google==='undefined')return;
  var isMobile=window.matchMedia('(max-width:768px)').matches;
  var opts={center:{lat:CONFIG.MAP_CENTER_LAT,lng:CONFIG.MAP_CENTER_LNG},zoom:CONFIG.MAP_ZOOM,
    disableDefaultUI:true,gestureHandling:isMobile?'greedy':'none',keyboardShortcuts:false,clickableIcons:false};
  if(CONFIG.MAP_ID&&CONFIG.MAP_ID.length>0)opts.mapId=CONFIG.MAP_ID;else opts.styles=mapStyles();
  phoneMap=new google.maps.Map(el,opts);
  phoneProjHelper=new ProjHelper(phoneMap); // 좌표 변환용
  // 카메라 단방향 미러 (PC → 폰)
  var sync=function(){if(!phoneMap)return;var c=map.getCenter();if(c)phoneMap.setCenter(c);phoneMap.setZoom(map.getZoom());};
  map.addListener('center_changed',sync);
  map.addListener('zoom_changed',sync);
  map.addListener('idle',function(){sync();updatePhoneLocation();updatePhoneViewportOverlay();updateScaleLegend();updatePhoneScale();reclusterFeedMarkers();});
  phoneMap.addListener('idle',function(){updatePhoneViewportOverlay();updatePhoneLocation();updatePhoneLens();updatePhoneScale();reclusterFeedMarkers();if(currentMode==='trend'&&currentTab==='map')renderSummaryZones();}); // 존 리스트=포커스/거리 의존이라 idle마다 갱신
  phoneMap.addListener('click',function(){ clearPhoneSpotlight(); if(currentMode==='local')clearPhoneDong(); }); // 빈 곳 클릭 = 강조 해제
  phoneMap.data.addListener('click',function(e){ // 베이직: 동 탭 → 존과 동일한 포커스+맵 조정
    if(currentMode!=='local')return;
    var d=dongByKey(featKey(e.feature));
    if(d)selectPhoneDong(d);
  });
  attachAddGestures(el,phoneMap); // 폰 지도 롱프레스/우클릭 → 컨텐츠 추가 팝업
  sync();
  if(originalGeoJson){buildDongIndex();applyGeoJsonToPhone();}
  phoneDataVisibility();syncPhoneZones();updatePhoneUI();updatePhoneLocation();updatePhoneViewportOverlay();updatePhoneLens();updatePhoneScale();
  layoutPhoneMap();
  renderSpots();
  renderRequestMarkers();
  renderMyLocation();
}
function applyGeoJsonToPhone(){
  if(!phoneMap||!originalGeoJson)return;
  phoneMap.data.forEach(function(f){phoneMap.data.remove(f);});
  phoneMap.data.addGeoJson(smoothEnabled?smoothGeoJson(originalGeoJson,smoothIntensity):originalGeoJson);
  refreshPhoneMapStyles();
}
function refreshPhoneMapStyles(){
  if(!phoneMap)return;
  phoneMap.data.setStyle(function(f){
    return featKey(f)===selectedFeatureId?getHighlightStyle():getDefaultStyle();
  });
}
function phoneDataVisibility(){if(phoneMap)phoneMap.data.setMap(currentMode==='local'?phoneMap:null);}
function syncPhoneZones(){
  if(!phoneMap)return;
  phoneSelectedZoneId=null; // 오버레이 재생성 → 선택/렌즈 리셋
  if(phoneLens.zoneId||phoneLens.zoneRef){cancelAnimationFrame(phoneLens.raf);clearLensGeom();phoneLens.on=false;}
  phoneZoneOverlays.forEach(function(o){o.polygons.forEach(function(p){p.setMap(null);});if(o.label)o.label.setMap(null);});
  phoneZoneOverlays=[];
  if(currentMode!=='trend')return;
  trendZones.forEach(function(zone){
    if(zone.id===editingZoneId)return;
    var gp=getHexGridParams(zone.radiusKm),polys=[],sumLat=0,sumLng=0,sw=zoneMergeBlocks?0:2,so=zoneMergeBlocks?0:0.8;
    zone.hexCenters.forEach(function(c){
      var poly=new google.maps.Polygon({paths:hexVertices(c.lng,c.lat,gp.R_lat,gp.R_lng),fillColor:zone.color,fillOpacity:0.35,strokeColor:zone.color,strokeWeight:sw,strokeOpacity:so,clickable:true,zIndex:3});
      poly.setMap(phoneMap);polys.push(poly);sumLat+=c.lat;sumLng+=c.lng;
      poly.addListener('click',(function(z){return function(){selectPhoneZone(z);};})(zone)); // 데모: 존 클릭→강조
    });
    if(zoneMergeBlocks)addZoneOutline(zone.hexCenters,gp,zone.color,phoneMap,polys);   // 합쳐진 외곽선만
    var label=null;
    if(zone.hexCenters.length>0)label=new MapLabel(new google.maps.LatLng(sumLat/zone.hexCenters.length,sumLng/zone.hexCenters.length),zone.name,zoneLabelStyle(zone.color),phoneMap);
    phoneZoneOverlays.push({polygons:polys,label:label,color:zone.color,zoneId:zone.id});
  });
}

/* ========== 폰(데모): 트렌드 존 선택 → 화면 맞춤 + 주변 그레이 처리 강조 ========== */
var phoneSelectedZoneId=null; // 선택 존 = 렌즈 핀 고정(별도 스포트라이트 폴리곤 제거)
var phoneSelectedDongKey=null; // 베이직: 선택 동 = 렌즈 핀 고정 (존과 동일 UX)
function selectPhoneDong(d){
  if(!phoneMap||!d)return;
  if(phoneSelectedDongKey===d.key){clearPhoneDong();return;} // 재탭 = 해제
  if(currentTab!=='map'){setNavActive('map');switchTab('map');} // 어디서 선택해도 맵 보기+포커스
  phoneSelectedDongKey=d.key;
  if(phoneLens.key!=='dong:'+d.key)lensBuildDong(d);
  phoneLens.on=true;lensFadeTo(1);applySpotFocus();
  var b=new google.maps.LatLngBounds({lat:d.bbox[1],lng:d.bbox[0]},{lat:d.bbox[3],lng:d.bbox[2]});
  phoneMap.fitBounds(b,phoneFitPadding()); // 동 전체가 보이게 맵 조정
  updatePhoneLocation();
}
function clearPhoneDong(){phoneSelectedDongKey=null;if(typeof updatePhoneLens==='function')updatePhoneLens();if(typeof applySpotFocus==='function')applySpotFocus();}
function dongByKey(k){if(!dongIndex||!k)return null;for(var i=0;i<dongIndex.length;i++)if(dongIndex[i].key===k)return dongIndex[i];return null;}
function clearPhoneSpotlight(){ // 선택 해제 → 자동 렌즈 로직으로 복귀(줌인이면 자동 발동)
  phoneSelectedZoneId=null;
  if(typeof updatePhoneLens==='function')updatePhoneLens();
  if(typeof applySpotFocus==='function')applySpotFocus();
}
function selectPhoneZone(zone){
  if(!phoneMap||!zone||!zone.hexCenters||!zone.hexCenters.length)return;
  if(phoneSelectedZoneId===zone.id){clearPhoneSpotlight();return;} // 재탭 = 해제
  if(currentTab!=='map'){setNavActive('map');switchTab('map');} // 어디서 선택해도 맵 보기+포커스
  phoneSelectedZoneId=zone.id;
  var gp=getHexGridParams(zone.radiusKm),b=new google.maps.LatLngBounds();
  zone.hexCenters.forEach(function(c){hexVertices(c.lng,c.lat,gp.R_lat,gp.R_lng).forEach(function(pt){b.extend(pt);});});
  if(phoneLens.key!=='zone:'+zone.id)lensBuildZone(zone); // 선택 = 존 렌즈 핀 고정(축척 무관 유지)
  phoneLens.on=true;lensFadeTo(1);applySpotFocus();
  phoneMap.fitBounds(b, phoneFitPadding());   // 줌아웃 상태에서 선택해도 존이 화면에 맞게 조정
  updatePhoneLocation();
  renderSummaryZones(); // 존 리스트: 포커스 존 맨 앞 + 체크 표시 갱신
}
function refreshPhoneZoneLabels(){phoneZoneOverlays.forEach(function(o){if(o.label)o.label.updateStyle(zoneLabelStyle(o.color));});}

/* ========== 동 위치 판별 (point-in-polygon) ========== */
function buildDongIndex(){
  if(!originalGeoJson)return;
  dongIndex=originalGeoJson.features.map(function(f){
    var g=f.geometry,polys=[];
    if(g.type==='Polygon')polys=[g.coordinates];
    else if(g.type==='MultiPolygon')polys=g.coordinates;
    var minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    polys.forEach(function(poly){poly[0].forEach(function(pt){if(pt[0]<minx)minx=pt[0];if(pt[0]>maxx)maxx=pt[0];if(pt[1]<miny)miny=pt[1];if(pt[1]>maxy)maxy=pt[1];});});
    var raw=(f.properties&&(f.properties.adm_nm||f.properties.name))||'';
    var p=raw.split(' ');var shortName=p.length>2?p.slice(2).join(' '):raw;
    var gu=(f.properties&&f.properties.sggnm)||(p.length>1?p[1]:shortName);
    var key=(f.properties&&(f.properties.adm_cd||f.properties.adm_nm))||null; // featKey와 동일 규칙
    return {name:shortName,gu:gu,key:key,bbox:[minx,miny,maxx,maxy],polys:polys};
  });
}
function pointInRing(x,y,ring){
  var inside=false;
  for(var i=0,j=ring.length-1;i<ring.length;j=i++){
    var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
function regionAt(lat,lng){
  if(!dongIndex)return null;
  for(var i=0;i<dongIndex.length;i++){
    var d=dongIndex[i],b=d.bbox;
    if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3])continue;
    for(var pI=0;pI<d.polys.length;pI++){
      var poly=d.polys[pI];
      if(pointInRing(lng,lat,poly[0])){
        var inHole=false;
        for(var h=1;h<poly.length;h++){if(pointInRing(lng,lat,poly[h])){inHole=true;break;}}
        if(!inHole)return d;
      }
    }
  }
  return null;
}
function dongAt(lat,lng){var d=regionAt(lat,lng);return d?d.name:null;}
function guAt(lat,lng){var d=regionAt(lat,lng);return d?d.gu:null;}
// 트렌드 모드: 중심이 포함된 트렌드 존 (객체/이름)
function zoneObjAtCenter(lat,lng){
  for(var i=0;i<trendZones.length;i++){
    var z=trendZones[i];if(!z.hexCenters||!z.hexCenters.length)continue;
    var gp=getHexGridParams(z.radiusKm);
    for(var j=0;j<z.hexCenters.length;j++){
      var hc=z.hexCenters[j];
      if(Math.abs(hc.lat-lat)<gp.R_lat*1.15&&Math.abs(hc.lng-lng)<gp.R_lng*1.15)return z;
    }
  }
  return null;
}
function zoneAtCenter(lat,lng){var z=zoneObjAtCenter(lat,lng);return z?z.name:null;}
// 폰 지도에서 헤더/네비에 가려지지 않고 '실제로 보이는' 영역의 인셋(px)과 중심
function phoneMapInsets(){ // 지도(본문 전용) 기준 가림 인셋: top=지도 위에 떠 있는 모드 필, bottom=하단 네비
  var scr=document.querySelector('#phone-mirror .phone-screen')||document.querySelector('.phone-screen');
  var hd=scr?scr.querySelector('.phone-header'):null, nv=scr?scr.querySelector('.phone-navbar'):null, md=scr?scr.querySelector('.pa-mode'):null;
  var top=0;
  if(hd&&md&&md.offsetParent!==null){
    top=Math.max(0,Math.round(md.getBoundingClientRect().bottom-hd.getBoundingClientRect().bottom))+6;
  }
  return {top:top, bottom:nv?nv.offsetHeight:0};
}
function phoneFitPadding(){var ins=phoneMapInsets();return {top:ins.top+14, bottom:ins.bottom+14, left:18, right:18};}
function phoneVisibleCenter(){
  if(!phoneMap)return null;
  var b=phoneMap.getBounds();if(!b)return phoneMap.getCenter();
  var el=document.getElementById('phone-map');var H=el?el.offsetHeight:0;if(!H)return phoneMap.getCenter();
  var ins=phoneMapInsets();
  var yFrac=((ins.top+(H-ins.bottom))/2)/H;                 // 보이는 영역 세로 중앙 비율
  var ne=b.getNorthEast(), sw=b.getSouthWest();
  return new google.maps.LatLng(ne.lat()-(ne.lat()-sw.lat())*yFrac, (ne.lng()+sw.lng())/2);
}
var lastLocName=null;
function updatePhoneLocation(){
  var el=document.getElementById('phone-loc');if(!el)return;
  var nameEl=el.querySelector('.pa-loc-name')||el;
  var src=phoneMap||map;                    // 폰 화면(실제 사용자 뷰)의 센터 기준
  if(!src){nameEl.textContent='···';return;}
  var c=(src===phoneMap)?phoneVisibleCenter():src.getCenter();if(!c){nameEl.textContent='···';return;}
  if(currentMode==='trend'){
    nameEl.textContent=zoneAtCenter(c.lat(),c.lng())||dongAt(c.lat(),c.lng())||'트렌드'; // 존 밖 = 동 이름 폴백(모드 간 연결)
    return;
  }
  var nm=dongAt(c.lat(),c.lng())||'위치 확인 중';   // 베이직 모드 = 센터가 속한 '동'
  nameEl.textContent=nm;
  if(nm!==lastLocName){lastLocName=nm;if(nm!=='위치 확인 중')newsFocusRegion(nm);} // 동이 바뀌면 그 동네 소식으로
}
// 동네소식 연동: region 태그가 현재 동과 맞는 이미지로 캐러셀 슬라이드 (스와이프 중엔 방해 금지)
function newsFocusRegion(dong){
  if(currentTab!=='map')return; // 지도 탭 지면에서만
  if(!dong||newsDragging||newsView.length<2)return;
  var norm=function(t){return t.replace(/[0-9\s]/g,'');} // '논현1동'≈'논현동' (숫자·공백 무시)
  for(var i=0;i<newsView.length;i++){
    var r=(newsView[i].region||'').trim();
    if(r&&(r===dong||r.indexOf(dong)>=0||dong.indexOf(r)>=0||norm(r)===norm(dong))){
      if(newsIndex!==i){newsIndex=i;setTrackAnim(true);snapTrack();updateDots();}
      return;
    }
  }
}

/* ========== 포커스 렌즈 (폰 공용 엔진): 보는 구역만 선명하게 ==========
   베이직=센터 동 / 트렌드=센터 존. 주변=화이트 포그 마스크 1장 → 투명도만 보간해 부드러운 페이드.
   어설픔 제거: ①페이드(fadeMs) ②히스테리시스(켜짐≤thr, 꺼짐≥1.3×thr) ③렌즈 이동 시 딥&페이드 */
var phoneLens={mask:null,lines:[],key:null,on:false,f:0,raf:null,zoneId:null,zoneRef:null};
function lensCfg(){return styleConfig.lens;}
/* 감김 방향: 외곽 링은 CW로 만들고, 구멍은 반드시 CCW(반대)여야 실제로 뚫림.
   행정동 GeoJSON은 스펙(CCW)과 달리 CW인 경우가 많아 정규화 필수 */
function ringAreaSigned(r){var a=0;for(var i=0,j=r.length-1;i<r.length;j=i++){a+=r[j].lng*r[i].lat-r[i].lng*r[j].lat;}return a/2;}
function holeRing(r){return ringAreaSigned(r)>0?r:r.slice().reverse();}
function lensOuter(b){var pad=Math.max(b[2]-b[0],b[3]-b[1])*8+0.05; // CW 사각 링
  return [{lat:b[1]-pad,lng:b[0]-pad},{lat:b[3]+pad,lng:b[0]-pad},{lat:b[3]+pad,lng:b[2]+pad},{lat:b[1]-pad,lng:b[2]+pad}];}
function clearLensGeom(){
  if(phoneLens.mask){phoneLens.mask.setMap(null);phoneLens.mask=null;}
  phoneLens.lines.forEach(function(l){l.setMap(null);});phoneLens.lines=[];
  phoneLens.key=null;phoneLens.f=0;phoneLens.zoneId=null;phoneLens.zoneRef=null;
}
function lensApply(f){ // f: 강도 0~1 (설정 투명도에 곱)
  phoneLens.f=f;var c=lensCfg();
  if(phoneLens.mask)phoneLens.mask.setOptions({fillOpacity:Number(c.fogOpacity)*f});
  phoneLens.lines.forEach(function(l){l.setOptions({strokeOpacity:Number(c.lineOpacity)*f});});
  if(phoneLens.zoneRef){ // 트렌드: 존 채움/라벨 ↔ 렌즈 크로스페이드 (아웃라인은 유지)
    phoneLens.zoneRef.polygons.forEach(function(p){if(!p._outline)p.setOptions({fillOpacity:0.35*(1-f)});});
    if(phoneLens.zoneRef.label&&phoneLens.zoneRef.label.div)phoneLens.zoneRef.label.div.style.opacity=String(1-f);
  }
}
function lensFadeTo(t,done){
  if(Math.abs(phoneLens.f-t)<0.01){if(done)done();return;}
  cancelAnimationFrame(phoneLens.raf);
  var from=phoneLens.f,dur=Number(lensCfg().fadeMs)||250,t0=null;
  function step(ts){
    if(t0==null)t0=ts;var p=Math.min(1,(ts-t0)/dur);p=p*(2-p); // easeOut
    lensApply(from+(t-from)*p);
    if(p<1)phoneLens.raf=requestAnimationFrame(step);else if(done)done();
  }
  phoneLens.raf=requestAnimationFrame(step);
}
function lensMount(holes,bbox,key){ // 공통: 포그 마스크
  var c=lensCfg();
  phoneLens.mask=new google.maps.Polygon({paths:[lensOuter(bbox)].concat(holes),strokeWeight:0,fillColor:c.fogColor,fillOpacity:Number(c.fogOpacity)*phoneLens.f,clickable:false,zIndex:15});
  phoneLens.mask.setMap(phoneMap);phoneLens.key=key;
}
function lensBuildDong(d){ // 베이직: 동 링 구멍 + 브랜드 헤어라인
  clearLensGeom();
  var holes=d.polys.map(function(poly){return holeRing(poly[0].map(function(pt){return {lat:pt[1],lng:pt[0]};}));});
  lensMount(holes,d.bbox,'dong:'+d.key);
  holes.forEach(function(ring){
    var ln=new google.maps.Polygon({paths:ring,strokeColor:lensCfg().lineColor,strokeWeight:1.6,strokeOpacity:0,fillOpacity:0,clickable:false,zIndex:16});
    ln.setMap(phoneMap);phoneLens.lines.push(ln);
  });
}
function lensBuildZone(z){ // 트렌드: 존 헥사들 구멍 (아웃라인은 존 오버레이 스트로크 재사용 → 중복 없음)
  clearLensGeom();
  var gp=getHexGridParams(z.radiusKm),holes=[],minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  z.hexCenters.forEach(function(hc){
    var v=hexVertices(hc.lng,hc.lat,gp.R_lat,gp.R_lng);
    v.forEach(function(pt){if(pt.lng<minx)minx=pt.lng;if(pt.lng>maxx)maxx=pt.lng;if(pt.lat<miny)miny=pt.lat;if(pt.lat>maxy)maxy=pt.lat;});
    holes.push(holeRing(v));
  });
  lensMount(holes,[minx,miny,maxx,maxy],'zone:'+z.id);
  phoneLens.zoneId=z.id;
  phoneLens.zoneRef=null;
  for(var i=0;i<phoneZoneOverlays.length;i++){if(phoneZoneOverlays[i].zoneId===z.id){phoneLens.zoneRef=phoneZoneOverlays[i];break;}}
}
function updatePhoneLens(){ // idle 디스패처
  if(!phoneMap){lensOff();return;}
  if(currentMode==='local')updateBasicLens();else updateTrendLens();
}
function updateBasicLens(){
  if(phoneSelectedDongKey){ // 선택된 동: 축척 무관 렌즈 핀 고정
    var dp=dongByKey(phoneSelectedDongKey);
    if(dp){phoneLens.on=true;if(phoneLens.key!=='dong:'+dp.key)lensBuildDong(dp);lensFadeTo(1);applySpotFocus();return;}
    phoneSelectedDongKey=null;
  }
  var thr=Number(styleConfig.highlight.spotScaleM);if(!(thr>0))thr=200;
  var mpp=mapMpp(phoneMap);if(!mpp){lensOff();return;}
  var scaleM=mpp*64;
  var on=phoneLens.on?(scaleM<thr*1.3):(scaleM<=thr);
  var c=on?phoneVisibleCenter():null;
  var d=c?regionAt(c.lat(),c.lng()):null;
  if(!d){lensOff();return;}
  phoneLens.on=true;
  if(phoneLens.key!=='dong:'+d.key){var had=!!phoneLens.mask;lensBuildDong(d);if(had)phoneLens.f=0.45;}
  lensFadeTo(1);
  applySpotFocus();
}
function updateTrendLens(){
  if(phoneSelectedZoneId){ // 선택된 존: 축척 무관 렌즈 핀 고정
    var zs=null;for(var i=0;i<trendZones.length;i++)if(trendZones[i].id===phoneSelectedZoneId)zs=trendZones[i];
    if(zs){
      phoneLens.on=true;
      if(phoneLens.key!=='zone:'+zs.id)lensBuildZone(zs);
      lensFadeTo(1);applySpotFocus();return;
    }
    phoneSelectedZoneId=null;
  }
  var thr=Number(lensCfg().trendScaleM);if(!(thr>0))thr=300;
  var mpp=mapMpp(phoneMap);if(!mpp){lensOff();return;}
  var scaleM=mpp*64;
  var on=phoneLens.on?(scaleM<thr*1.3):(scaleM<=thr);
  var c=on?phoneVisibleCenter():null;
  var z=c?zoneObjAtCenter(c.lat(),c.lng()):null;
  if(!z){lensOff();return;}
  phoneLens.on=true;
  if(phoneLens.key!=='zone:'+z.id){var had=!!phoneLens.mask;lensBuildZone(z);if(had)phoneLens.f=0.45;}
  lensFadeTo(1);
  applySpotFocus();
}
function lensOff(){
  phoneLens.on=false;
  if(phoneLens.mask||phoneLens.lines.length)lensFadeTo(0,clearLensGeom); // 페이드아웃하며 존 채움/라벨 복원
  applySpotFocus();
}
function lensStyleRefresh(){ // 관리자: 안개/테두리 색·투명도 변경 즉시 반영
  var c=lensCfg();
  if(phoneLens.mask)phoneLens.mask.setOptions({fillColor:c.fogColor,fillOpacity:Number(c.fogOpacity)*phoneLens.f});
  phoneLens.lines.forEach(function(l){l.setOptions({strokeColor:c.lineColor,strokeOpacity:Number(c.lineOpacity)*phoneLens.f});});
}

/* ========== 스팟 포커스 연동: 렌즈/선택 존 밖 스팟은 살짝 투명(폰 지도만) ========== */
function spotInFocus(s){
  if(currentMode==='local'){
    if(!phoneLens.on||!phoneLens.key)return true;
    var d=regionAt(s.lat,s.lng);return !!d&&('dong:'+d.key)===phoneLens.key;
  }
  var zid=phoneSelectedZoneId||phoneLens.zoneId;
  if(!zid)return true;
  var z=trendZones.find(function(x){return x.id===zid;});
  if(!z)return true;
  return ptInZone(z,s.lat,s.lng);
}
function applySpotFocus(){
  phoneSpotOverlays.forEach(function(o){if(o.div)o.div.classList.toggle('spot-out',!spotInFocus(o.spot));});
}

/* ========== 관리자 지도: 폰 표시영역 오버레이 ========== */
function phoneCollapsed(){var m=document.getElementById('phone-mirror');return m&&m.classList.contains('collapsed');}
function clearPhoneViewportOverlay(){if(phoneViewportRect)phoneViewportRect.setMap(null);if(phoneCenterMarker)phoneCenterMarker.setMap(null);}
function updatePhoneViewportOverlay(){
  if(!map||!phoneMap)return;
  if(!phoneViewportOn||phoneCollapsed()){clearPhoneViewportOverlay();return;}
  var b=phoneMap.getBounds(),c=phoneMap.getCenter();
  if(!b||!c)return;
  if(!phoneViewportRect)phoneViewportRect=new google.maps.Rectangle({fillColor:'#6ec6ff',fillOpacity:0.06,strokeColor:'#6ec6ff',strokeOpacity:0.95,strokeWeight:2,clickable:false,zIndex:60});
  phoneViewportRect.setOptions({bounds:b});phoneViewportRect.setMap(map);
  if(!phoneCenterMarker)phoneCenterMarker=new google.maps.Marker({clickable:false,zIndex:61,icon:{path:google.maps.SymbolPath.CIRCLE,scale:5,fillColor:'#6ec6ff',fillOpacity:1,strokeColor:'#ffffff',strokeWeight:2}});
  phoneCenterMarker.setPosition(c);phoneCenterMarker.setMap(map);
}
function updatePhoneUI(){ updatePhoneLocation(); }

/* ========== 폰 컨트롤 (드래그/크기/접기/네비) ========== */
var phoneWidth=244;
function phoneMirrorEl(){return document.getElementById('phone-mirror');}
function clampPhonePos(x,y){
  var m=phoneMirrorEl();if(!m)return;var r=m.getBoundingClientRect();
  var maxX=Math.max(6,window.innerWidth-r.width-6), maxY=Math.max(6,window.innerHeight-r.height-6);
  x=Math.max(6,Math.min(x,maxX)); y=Math.max(6,Math.min(y,maxY));
  m.style.left=x+'px';m.style.top=y+'px';m.style.right='auto';m.style.transform='none';
}
function reclampPhone(){var m=phoneMirrorEl();if(!m||!m.style.left)return;var r=m.getBoundingClientRect();clampPhonePos(r.left,r.top);}
function phoneResizeMap(){if(!phoneMap)return;setTimeout(function(){google.maps.event.trigger(phoneMap,'resize');var c=map&&map.getCenter();if(c)phoneMap.setCenter(c);if(map)phoneMap.setZoom(map.getZoom());},90);}
function setPhoneWidth(w){
  phoneWidth=Math.max(224,Math.min(360,w));
  var m=phoneMirrorEl();if(m)m.style.setProperty('--phone-w',phoneWidth+'px');
  reclampPhone();phoneResizeMap();
}
function initPhoneControls(){
  var mirror=phoneMirrorEl();if(!mirror)return;
  // 폰 화면 접기/펴기
  var pc=document.getElementById('phone-collapse');
  if(pc)pc.addEventListener('click',function(){
    var c=mirror.classList.toggle('collapsed');
    pc.setAttribute('aria-expanded',c?'false':'true');
    pc.setAttribute('aria-label',c?'폰 화면 펴기':'폰 화면 접기');
    pc.setAttribute('title',c?'폰 화면 펴기':'폰 화면 접기');
    if(!c)phoneResizeMap();
    updatePhoneViewportOverlay();
  });
  // 크기 조절
  var bg=document.getElementById('phone-bigger'),sm=document.getElementById('phone-smaller');
  if(bg)bg.addEventListener('click',function(){setPhoneWidth(phoneWidth+22);});
  if(sm)sm.addEventListener('click',function(){setPhoneWidth(phoneWidth-22);});
  // 드래그 이동 (화면 밖으로 나가지 않도록 clamp)
  var handle=document.getElementById('phone-drag');
  var dragging=false,sx,sy,ox,oy;
  function pt(e){return e.touches&&e.touches[0]?e.touches[0]:e;}
  function down(e){dragging=true;var r=mirror.getBoundingClientRect();var p=pt(e);sx=p.clientX;sy=p.clientY;ox=r.left;oy=r.top;
    mirror.classList.add('dragging');if(e.cancelable)e.preventDefault();
    document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
    document.addEventListener('touchmove',move,{passive:false});document.addEventListener('touchend',up);}
  function move(e){if(!dragging)return;var p=pt(e);clampPhonePos(ox+(p.clientX-sx),oy+(p.clientY-sy));if(e.cancelable)e.preventDefault();}
  function up(){dragging=false;mirror.classList.remove('dragging');
    document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);
    document.removeEventListener('touchmove',move);document.removeEventListener('touchend',up);}
  if(handle){handle.addEventListener('mousedown',down);handle.addEventListener('touchstart',down,{passive:false});}
  // 하단 네비 활성 전환
  mirror.querySelectorAll('.pn-item').forEach(function(b){b.addEventListener('click',function(){
    mirror.querySelectorAll('.pn-item').forEach(function(x){x.classList.remove('active');});b.classList.add('active');
    switchTab(b.dataset.nav);
  });});
  // 네비바 좌우 스와이프 = 탭 전환 (지도↔피드↔소셜)
  (function(){
    var bar=mirror.querySelector('.phone-navbar');if(!bar)return;
    var ORDER=['map','feed','social'],sx=0,sy=0,swiping=false;
    bar.addEventListener('touchstart',function(e){
      if(e.touches.length!==1)return;
      sx=e.touches[0].clientX;sy=e.touches[0].clientY;swiping=true;
    },{passive:true});
    bar.addEventListener('touchend',function(e){
      if(!swiping)return;swiping=false;
      var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      if(Math.abs(dx)<40||Math.abs(dy)>Math.abs(dx)*0.7)return; // 수평 스와이프만
      var i=ORDER.indexOf(currentTab),n=ORDER[i+(dx<0?1:-1)];
      if(!n)return;
      setNavActive(n);switchTab(n);
    },{passive:true});
  })();
  // AI 버튼: 상황 맞춤 프리셋 패널 + 아이콘 회전/모드별 AI색상(트렌드=불꽃)
  initAiAgent(mirror);
  // 컨텐츠 추가 버튼(네비 왼쪽): 누르면 [스팟 메시지 / 사진 올리기] 팝업
  var addBtn=mirror.querySelector('.pn-add'),addMenu=document.getElementById('content-add-menu');
  if(addBtn&&addMenu){
    // +버튼: 팝업은 기본 위치(좌하단), 스팟은 보이는 화면 센터에 추가
    addBtn.addEventListener('click',function(e){e.stopPropagation();if(addMenu.classList.contains('open'))closeAddMenu();else openAddMenu(phoneMap,document.getElementById('phone-map'),null,null,null);});
    addMenu.addEventListener('click',function(e){e.stopPropagation();});
    addMenu.querySelectorAll('.cam-item').forEach(function(it){
      it.addEventListener('click',function(){
        if(it.dataset.add==='spot'){addSpotContent();}
        else if(it.dataset.add==='request'){openRequestComposer();}
        else{closeAddMenu();
          if(it.dataset.add==='photo'){var fi=document.getElementById('feed-photo-input');if(fi)fi.click();}
          else if(it.dataset.add==='post'){var fp=document.getElementById('feed-post-input');if(fp)fp.click();}}
      });
    });
    document.addEventListener('click',function(){if(Date.now()-addMenuOpenedAt<600)return;closeAddMenu();}); // 롱프레스 직후 자동 닫힘 방지
  }
  // 창 크기 변경 시 화면 밖 방지
  window.addEventListener('resize',reclampPhone);
}

/* ========== 트렌드 존 CRUD ========== */
function saveTrendZone(name, color) {
  var centers = [];
  selectedHexes.forEach(function(d){centers.push({id:d.col+'_'+d.row,lat:d.lat,lng:d.lng});});
  var zone = {id:'tz_'+Date.now(),name:name,color:color,desc:'',photo:null,radiusKm:hexRadiusKm,
    hexCenters:centers,
    originalCenters:JSON.parse(JSON.stringify(centers)),
    originalRadiusKm:hexRadiusKm,
    polygons:[],label:null};
  trendZones.push(zone);
  renderZoneOnMap(zone); selectedHexes.clear(); generateHexagons();
  updateTrendInfo(); updateZoneSaveUI(); renderZoneList(); saveZonesToStorage();
}

function renderZoneOnMap(zone) {
  removeZoneFromMap(zone);
  if (currentMode!=='trend') return;
  var gp = getHexGridParams(zone.radiusKm);
  var sumLat=0, sumLng=0, sw=zoneMergeBlocks?0:2, so=zoneMergeBlocks?0:0.8;
  zone.hexCenters.forEach(function(c){
    var paths=hexVertices(c.lng,c.lat,gp.R_lat,gp.R_lng);
    var poly=new google.maps.Polygon({paths:paths,fillColor:zone.color,fillOpacity:0.35,strokeColor:zone.color,strokeWeight:sw,strokeOpacity:so,clickable:false,zIndex:3});
    poly.setMap(map); zone.polygons.push(poly);
    sumLat+=c.lat; sumLng+=c.lng;
  });
  if(zoneMergeBlocks)addZoneOutline(zone.hexCenters,gp,zone.color,map,zone.polygons);   // 합쳐진 외곽선만
  if (zone.hexCenters.length>0) {
    zone.label=new MapLabel(new google.maps.LatLng(sumLat/zone.hexCenters.length,sumLng/zone.hexCenters.length),zone.name,zoneLabelStyle(zone.color),map);
  }
}

function removeZoneFromMap(zone){zone.polygons.forEach(function(p){p.setMap(null);});zone.polygons=[];if(zone.label){zone.label.setMap(null);zone.label=null;}}
function showAllZonesOnMap(){trendZones.forEach(function(z){if(z.id!==editingZoneId&&z.polygons.length===0) renderZoneOnMap(z);});}
function rerenderZones(){trendZones.slice().forEach(function(z){removeZoneFromMap(z);});if(currentMode==='trend')showAllZonesOnMap();syncPhoneZones();}
function hideAllZonesFromMap(){trendZones.forEach(function(z){removeZoneFromMap(z);});}

function deleteZone(zoneId){
  var idx=trendZones.findIndex(function(z){return z.id===zoneId;});
  if(idx<0) return; if(editingZoneId===zoneId) cancelEditZone();
  removeZoneFromMap(trendZones[idx]); trendZones.splice(idx,1);
  renderZoneList(); if(currentMode==='trend') generateHexagons(); saveZonesToStorage();
}

function updateZone(zoneId,newName,newColor,newDesc){
  var zone=trendZones.find(function(z){return z.id===zoneId;});
  if(!zone) return; zone.name=newName; zone.color=newColor; if(newDesc!=null)zone.desc=newDesc;
  renderZoneOnMap(zone); renderZoneList(); saveZonesToStorage();
}

/* ========== 반경 변경 시 존 재그리드 (원본 기준) ========== */
// 존을 현재 그리드(반경)에 맞게 재매핑 — 항상 원본(originalCenters/Radius) 기준으로 재계산
function remapZoneToGrid(zone) {
  var newGp = getHexGridParams();
  var origCenters = zone.originalCenters || zone.hexCenters;
  var origRadius = zone.originalRadiusKm || zone.radiusKm;
  var origGp = getHexGridParams(origRadius);
  var newHexMap = new Map();
  origCenters.forEach(function(oc) {
    var searchC = Math.ceil(origGp.R_lng / newGp.colSpacing) + 2;
    var searchR = Math.ceil(origGp.R_lat / newGp.rowSpacing) + 2;
    var ac = Math.round(oc.lng / newGp.colSpacing);
    var ar = Math.round(oc.lat / newGp.rowSpacing);
    for (var dc = -searchC; dc <= searchC; dc++) {
      for (var dr = -searchR; dr <= searchR; dr++) {
        var nc = hexCenterFromColRow(ac+dc, ar+dr, newGp);
        var dl = nc.lat - oc.lat, dn = nc.lng - oc.lng;
        if (Math.sqrt((dl/origGp.R_lat)*(dl/origGp.R_lat)+(dn/origGp.R_lng)*(dn/origGp.R_lng)) <= 1.0) {
          var hid = (ac+dc)+'_'+(ar+dr);
          if (!newHexMap.has(hid)) newHexMap.set(hid, {id:hid, lat:nc.lat, lng:nc.lng});
        }
      }
    }
  });
  zone.hexCenters = Array.from(newHexMap.values());
  zone.radiusKm = hexRadiusKm;
}
function rezoneAllToCurrentRadius() {
  trendZones.forEach(function(zone) {
    if (zone.radiusKm === hexRadiusKm) return;
    remapZoneToGrid(zone);
    removeZoneFromMap(zone);
    if (currentMode==='trend') renderZoneOnMap(zone);
  });
  renderZoneList(); saveZonesToStorage();
}

/* ========== 존 편집 ========== */
function startEditZone(zoneId) {
  var zone=trendZones.find(function(z){return z.id===zoneId;});
  if(!zone) return;
  selectedHexes.clear(); editingZoneId=zoneId;
  editingZoneBackup={hexCenters:JSON.parse(JSON.stringify(zone.hexCenters)),color:zone.color,
    originalCenters:zone.originalCenters?JSON.parse(JSON.stringify(zone.originalCenters)):null,
    originalRadiusKm:zone.originalRadiusKm};

  if (zone.radiusKm !== hexRadiusKm) remapZoneToGrid(zone); // 현재 반경 그리드로 재매핑 후 편집

  zone.hexCenters.forEach(function(c){
    var h=centerToHexId(c.lat,c.lng);
    selectedHexes.set(h.id,{col:h.col,row:h.row,lat:c.lat,lng:c.lng});
  });
  removeZoneFromMap(zone); generateHexagons();
  updateTrendInfo(); updateZoneSaveUI(); renderZoneList();
}

function finishEditZone() {
  var zone=trendZones.find(function(z){return z.id===editingZoneId;});
  if(!zone){cancelEditZone();return;}
  var centers=[];
  selectedHexes.forEach(function(d){centers.push({id:d.col+'_'+d.row,lat:d.lat,lng:d.lng});});
  zone.hexCenters=centers; zone.radiusKm=hexRadiusKm;
  zone.color=document.getElementById('zone-edit-color').value;
  // 편집 시 원본도 갱신 (사용자가 수동 편집한 것이므로)
  zone.originalCenters=JSON.parse(JSON.stringify(centers));
  zone.originalRadiusKm=hexRadiusKm;
  editingZoneId=null; editingZoneBackup=null; selectedHexes.clear();
  renderZoneOnMap(zone); generateHexagons();
  updateTrendInfo(); updateZoneSaveUI(); renderZoneList(); saveZonesToStorage();
}

function cancelEditZone() {
  var zone=trendZones.find(function(z){return z.id===editingZoneId;});
  if(zone&&editingZoneBackup){
    zone.hexCenters=editingZoneBackup.hexCenters; zone.color=editingZoneBackup.color;
    if(editingZoneBackup.originalCenters) zone.originalCenters=editingZoneBackup.originalCenters;
    if(editingZoneBackup.originalRadiusKm) zone.originalRadiusKm=editingZoneBackup.originalRadiusKm;
    renderZoneOnMap(zone);
  }
  editingZoneId=null; editingZoneBackup=null; selectedHexes.clear();
  generateHexagons(); updateTrendInfo(); updateZoneSaveUI(); renderZoneList();
}

/* ========== 존 리스트 UI ========== */
function renderZoneList() {
  syncPhoneZones(); updatePhoneUI();
  if(typeof renderDrawerDemo==='function')renderDrawerDemo();
  var area=document.getElementById('zone-list-area');
  var list=document.getElementById('zone-list'); list.innerHTML='';
  if(trendZones.length===0){area.style.display='none';return;}
  area.style.display='';
  trendZones.forEach(function(zone){
    var isEd=zone.id===editingZoneId;
    var item=document.createElement('div');
    item.className='zone-item'+(isEd?' editing':'');
    item.innerHTML='<span class="zone-swatch" style="background:'+zone.color+'"></span>'+
      '<span class="zone-name-text">'+escHtml(zone.name)+'</span>'+
      '<span class="zone-count">'+zone.hexCenters.length+'</span>'+
      '<button class="zone-act" data-act="focus" title="지도에서 이동">📍</button>'+
      '<button class="zone-act" data-act="card" title="카드 편집 (사진·설명·이름·색)">🖼️</button>'+
      '<button class="zone-act" data-act="edit" title="영역 편집 (헥사곤 범위)">✏️</button>'+
      '<button class="zone-act" data-act="delete" title="삭제">🗑️</button>';
    item.querySelector('[data-act="focus"]').addEventListener('click',function(){focusZone(zone.id);});
    item.querySelector('[data-act="card"]').addEventListener('click',function(){showInlineEdit(zone.id,item);});
    item.querySelector('[data-act="edit"]').addEventListener('click',function(){
      if(editingZoneId===zone.id)return;
      if(currentMode!=='trend')switchMode('trend'); // 존 영역 편집은 트렌드 모드(헥사곤)에서
      if(editingZoneId)finishEditZone();startEditZone(zone.id);
    });
    item.querySelector('[data-act="delete"]').addEventListener('click',function(){deleteZone(zone.id);});
    if(!isEd) item.querySelector('.zone-name-text').addEventListener('dblclick',function(){showInlineEdit(zone.id,item);});
    list.appendChild(item);
  });
}

function showInlineEdit(zoneId,itemEl){
  var zone=trendZones.find(function(z){return z.id===zoneId;});if(!zone)return;
  var ex=itemEl.querySelector('.zone-inline-edit');if(ex){ex.remove();return;}
  var form=document.createElement('div');form.className='zone-inline-edit';
  form.innerHTML='<input type="text" class="zi-name" maxlength="20" placeholder="존 이름" />'+
    '<input type="text" class="zi-desc" maxlength="40" placeholder="설명 (카드에 얇은 글씨로 표시)" />'+
    '<div class="zone-form-row"><input type="color" class="zi-color" /><button type="button" class="action-btn small zi-photo">📷 사진</button><button type="button" class="action-btn accent small zi-apply">적용</button><button type="button" class="action-btn small zi-close">닫기</button></div>'+
    '<div class="news-url-row"><input type="url" class="zi-url" placeholder="이미지 링크(https://...)" /><button type="button" class="action-btn accent small zi-urlbtn">링크</button></div>'+
    '<input type="file" class="zi-file" accept="image/*" hidden /><img class="zi-thumb" alt="" />';
  form.querySelector('.zi-name').value=zone.name;
  form.querySelector('.zi-desc').value=zone.desc||'';
  form.querySelector('.zi-color').value=zone.color;
  var th=form.querySelector('.zi-thumb');
  function paintThumb(){if(zone.photo){th.src=zone.photo;th.style.display='block';}else th.style.display='none';}
  paintThumb();
  var file=form.querySelector('.zi-file');
  form.querySelector('.zi-photo').addEventListener('click',function(){file.click();});
  file.addEventListener('change',function(){
    var f=(this.files||[])[0];this.value='';if(!f)return;
    compressNews(f,function(url){ // 뉴스와 동일 압축(무료 한도 보호)
      if(!url){alert('이미지가 너무 커요. 더 작은 사진으로 시도해 주세요.');return;}
      zone.photo=url;saveZonesToStorage();paintThumb();renderDrawerDemo();
    });
  });
  form.querySelector('.zi-urlbtn').addEventListener('click',function(){
    var u=(form.querySelector('.zi-url').value||'').trim();form.querySelector('.zi-url').value='';
    if(!/^https:\/\/\S+/i.test(u)){alert('https:// 로 시작하는 이미지 링크를 넣어주세요.');return;}
    var probe=new Image();
    probe.onload=function(){zone.photo=u;saveZonesToStorage();paintThumb();renderDrawerDemo();};
    probe.onerror=function(){alert('이 링크의 이미지를 불러올 수 없어요.');};
    probe.src=u;
  });
  form.querySelector('.zi-apply').addEventListener('click',function(){
    var n=form.querySelector('.zi-name').value.trim();
    if(n)updateZone(zoneId,n,form.querySelector('.zi-color').value,form.querySelector('.zi-desc').value.trim());
  });
  form.querySelector('.zi-close').addEventListener('click',function(){form.remove();});
  itemEl.appendChild(form);form.querySelector('.zi-name').focus();
}
function focusZone(zoneId){
  var zone=trendZones.find(function(z){return z.id===zoneId;});if(!zone||!zone.hexCenters.length)return;
  var b=new google.maps.LatLngBounds();zone.hexCenters.forEach(function(c){b.extend({lat:c.lat,lng:c.lng});});map.fitBounds(b,80);
}

// HTML 이스케이프 — DOM 생성 없이 처리 + 따옴표도 이스케이프(속성값 안 삽입 시 깨짐 방지)
var ESC_MAP={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function escHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return ESC_MAP[c];});}

/* (트렌드 존 JSON 내보내기/불러오기는 제거됨 — 콘텐츠가 Firestore shared/mapContent에 자동 저장됨) */

/* ========== localStorage ========== */
function saveZonesToStorage(){
  var data=trendZones.map(function(z){
    return {id:z.id,name:z.name,color:z.color,desc:z.desc||'',photo:z.photo||null,radiusKm:z.radiusKm,hexCenters:z.hexCenters,
      originalCenters:z.originalCenters,originalRadiusKm:z.originalRadiusKm};
  });
  try{localStorage.setItem('nowhere_trendZones',JSON.stringify(data));}catch(e){}
  markCloudDirty();
}
function loadZonesFromStorage(){
  try{
    var data=JSON.parse(localStorage.getItem('nowhere_trendZones')||'[]');
    data.forEach(function(d){
      trendZones.push({id:d.id,name:d.name,color:d.color,desc:d.desc||'',photo:d.photo||null,radiusKm:d.radiusKm,hexCenters:d.hexCenters,
        originalCenters:d.originalCenters||JSON.parse(JSON.stringify(d.hexCenters)),
        originalRadiusKm:d.originalRadiusKm||d.radiusKm,
        polygons:[],label:null});
    });
    renderZoneList();
  }catch(e){}
}

/* ========== 모드 전환 ========== */
function switchMode(mode,opts){
  if(mode===currentMode) return; if(editingZoneId) finishEditZone();
  var noNearby=opts&&opts.noNearby;
  currentMode=mode;
  removeLocalLabel(); selectedFeatureName=null; selectedFeatureId=null;
  closeComposer(); closeAddMenu();
  phoneSelectedDongKey=null; // 모드 전환 시 동 핀 해제
  document.querySelectorAll('.mode-btn').forEach(function(b){b.classList.toggle('active',b.dataset.mode===mode);});
  document.querySelectorAll('#phone-mode .pm-btn').forEach(function(b){b.classList.toggle('active',b.dataset.mode===mode);});
  document.querySelector('.mode-indicator').classList.toggle('right',mode==='trend');
  document.body.classList.toggle('mode-trend',mode==='trend'); // AI 버튼 불꽃 톤 등 트렌드 전용 스타일 스코프
  if(typeof updateAiVisual==='function')updateAiVisual();
  if(mode==='local'){
    clearHexagons();selectedHexes.clear();
    if(boundsListener){google.maps.event.removeListener(boundsListener);boundsListener=null;}
    hideAllZonesFromMap(); map.data.setMap(map); refreshMapStyles();
    selectedFeature=null; updateInfoPanel(null); updateZoneSaveUI(); renderZoneList();
    renderSpots();
  } else {
    map.data.setMap(null); selectedFeature=null;
    showAllZonesOnMap(); generateHexagons();
    var dt; boundsListener=map.addListener('idle',function(){clearTimeout(dt);dt=setTimeout(function(){if(currentMode==='trend')generateHexagons();},350);});
    updateZoneSaveUI(); renderZoneList();
    renderSpots();   // 트렌드 모드에서도 스팟 유지
    if(!noNearby)setTimeout(focusNearbyZones,80); // 전환 마무리 후 근접 존 N개(단일 존 선택 시엔 억제)
  }
  phoneDataVisibility(); syncPhoneZones(); updatePhoneUI(); updatePhoneLens();
  renderSummaryZones();
}

/* ========== 초기화 ========== */
function initMap(){
  initMapLabelClass();
  initReqPinClass();
  initSpotBubbleClass();
  initFeedThumbClass();
  initSpotComposerClass();
  initProjHelperClass();
  var opts={center:{lat:CONFIG.MAP_CENTER_LAT,lng:CONFIG.MAP_CENTER_LNG},zoom:CONFIG.MAP_ZOOM,disableDefaultUI:false,zoomControl:true,mapTypeControl:false,streetViewControl:false,fullscreenControl:true};
  if(CONFIG.MAP_ID&&CONFIG.MAP_ID.length>0) opts.mapId=CONFIG.MAP_ID; else opts.styles=mapStyles();
  map=new google.maps.Map(document.getElementById('map'),opts);
  mapProjHelper=new ProjHelper(map); // 좌표 변환용(제스처 지점→latLng)
  fetch(CONFIG.GEOJSON_PATH).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(geo){originalGeoJson=geo;applyGeoJsonToMap();fitBoundsToData();initMyLocation();loadZonesFromStorage();hideMapLoading();mapReady=true;if(cloudData)applyCloudData(cloudData);else{loadLocalSpotsInto();rebuildSpots();}}).catch(function(err){hideMapLoading();var el=document.getElementById('info-text');if(el)el.textContent='⚠️ 경계 데이터를 불러오지 못했습니다. ('+err.message+')';});
  refreshMapStyles();
  map.data.addListener('click',function(e){if(currentMode!=='local')return;var f=e.feature;if(selectedFeature===f){selectedFeature=null;selectedFeatureName=null;selectedFeatureId=null;refreshMapStyles();updateInfoPanel(null);removeLocalLabel();updatePhoneUI();return;}selectedFeature=f;var raw=f.getProperty('adm_nm')||f.getProperty('name')||'(이름 없음)';var p=raw.split(' ');selectedFeatureName=p.length>2?p.slice(2).join(' '):raw;selectedFeatureId=featKey(f);refreshMapStyles();updateInfoPanel(selectedFeatureName);showLocalLabel();updatePhoneUI();});
  map.addListener('click',function(e){if(currentMode==='local'&&selectedFeature){selectedFeature=null;selectedFeatureName=null;selectedFeatureId=null;refreshMapStyles();updateInfoPanel(null);removeLocalLabel();updatePhoneUI();}});
  attachAddGestures(document.getElementById('map'),map); // 메인 지도 롱프레스/우클릭 → 컨텐츠 추가 팝업
  map.data.addListener('mouseover',function(e){if(currentMode!=='local'||e.feature===selectedFeature)return;map.data.overrideStyle(e.feature,{strokeWeight:Number(styleConfig.default.strokeWeight)+2,fillOpacity:Number(styleConfig.default.fillOpacity)+0.08});});
  map.data.addListener('mouseout',function(e){if(currentMode!=='local'||e.feature===selectedFeature)return;map.data.revertStyle(e.feature);});
  initSettingsPanel();initContentPanel();initModeToggle();initZoneForm();initZoneEditBar();initSpotUI();
  initPhoneMirror();
}

function initModeToggle(){document.querySelectorAll('.mode-btn').forEach(function(b){b.addEventListener('click',function(){switchMode(this.dataset.mode);});});}

function initZoneForm(){
  var saveBtn=document.getElementById('zone-save-btn');var form=document.getElementById('zone-form');var colorInput=document.getElementById('zone-color-input');
  var palette=document.getElementById('zone-palette');
  PALETTE.forEach(function(c){var sw=document.createElement('button');sw.className='palette-swatch';sw.type='button';sw.style.backgroundColor=c;sw.addEventListener('click',function(){colorInput.value=c;palette.querySelectorAll('.palette-swatch').forEach(function(s){s.classList.remove('active');});sw.classList.add('active');});palette.appendChild(sw);});
  saveBtn.addEventListener('click',function(){saveBtn.style.display='none';form.style.display='';document.getElementById('zone-name-input').value='';document.getElementById('zone-name-input').focus();colorInput.value=PALETTE[0];palette.querySelectorAll('.palette-swatch').forEach(function(s,i){s.classList.toggle('active',i===0);});});
  document.getElementById('zone-cancel-btn').addEventListener('click',function(){form.style.display='none';saveBtn.style.display='';});
  document.getElementById('zone-confirm-btn').addEventListener('click',function(){var name=document.getElementById('zone-name-input').value.trim();if(!name){document.getElementById('zone-name-input').focus();return;}saveTrendZone(name,colorInput.value);form.style.display='none';saveBtn.style.display='';});
  document.getElementById('zone-name-input').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('zone-confirm-btn').click();});
  document.getElementById('hex-deselect-btn').addEventListener('click',function(){clearHexSelection();});
}

function initZoneEditBar(){
  document.getElementById('zone-edit-done').addEventListener('click',function(){finishEditZone();});
  document.getElementById('zone-edit-cancel').addEventListener('click',function(){cancelEditZone();});
}


/* ========== 색상 팝업 (HSV 스펙트럼 + 알파 + 헥스 + 프리셋) ========== */
var CP = null;
function clamp01(v){return v<0?0:v>1?1:v;}
function hsvToRgb(h,s,v){h/=360;var i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s),r,g,b;switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;default:r=v;g=p;b=q;}return {r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)};}
function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;var max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h,s=max===0?0:d/max,v=max;if(d===0)h=0;else if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360;return {h:h,s:s,v:v};}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(function(x){return ('0'+x.toString(16)).slice(-2);}).join('');}
function cpHex(){var c=hsvToRgb(CP.h,CP.s,CP.v);return rgbToHex(c.r,c.g,c.b);}

function buildColorPopup(){
  if(CP)return CP;
  var pop=document.createElement('div');pop.className='color-popup';pop.style.display='none';
  pop.innerHTML=
    '<div class="cp-sv"><div class="cp-thumb cp-sv-thumb"></div></div>'+
    '<div class="cp-slider cp-hue"><div class="cp-thumb cp-hue-thumb"></div></div>'+
    '<div class="cp-slider cp-alpha"><div class="cp-alpha-grad"></div><div class="cp-thumb cp-alpha-thumb"></div></div>'+
    '<div class="cp-inputs"><span class="cp-preview"><i class="cp-fill"></i></span><input class="cp-hex" spellcheck="false" maxlength="7" /><input class="cp-anum" type="number" min="0" max="100" step="1" /><span class="cp-apct">%</span></div>'+
    '<div class="cp-presets"></div>';
  document.body.appendChild(pop);
  CP={el:pop,sv:pop.querySelector('.cp-sv'),svThumb:pop.querySelector('.cp-sv-thumb'),
    hue:pop.querySelector('.cp-hue'),hueThumb:pop.querySelector('.cp-hue-thumb'),
    alpha:pop.querySelector('.cp-alpha'),alphaGrad:pop.querySelector('.cp-alpha-grad'),alphaThumb:pop.querySelector('.cp-alpha-thumb'),
    fill:pop.querySelector('.cp-fill'),hex:pop.querySelector('.cp-hex'),anum:pop.querySelector('.cp-anum'),apct:pop.querySelector('.cp-apct'),
    h:0,s:1,v:1,a:1,alphaEnabled:true,anchor:null,onInput:null};
  var presets=['#DE2F2A','#F2862E','#F2C53D','#9DC64C','#4fc3f7','#0288d1','#ff9800','#ab47bc','#ffffff','#9e9e9e','#455a64','#111318'];
  var pc=pop.querySelector('.cp-presets');
  presets.forEach(function(col){var b=document.createElement('button');b.type='button';b.className='cp-preset';b.style.backgroundColor=col;b.addEventListener('click',function(){cpSetFromHex(col);});pc.appendChild(b);});
  wireCPDrag();
  CP.hex.addEventListener('input',function(){var v=CP.hex.value.trim().replace('#','');if(/^[0-9a-fA-F]{6}$/.test(v))cpSetFromHex('#'+v);});
  CP.anum.addEventListener('input',function(){var n=Math.max(0,Math.min(100,parseFloat(CP.anum.value)||0));CP.a=n/100;cpRender();cpFire();});
  document.addEventListener('mousedown',function(e){if(CP.el.style.display!=='none'&&!CP.el.contains(e.target)&&!(CP.anchor&&CP.anchor.contains(e.target)))closeColorPopup();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeColorPopup();});
  return CP;
}
function wireCPDrag(){
  function attach(el,onMove){
    var active=false;
    function pt(e){return e.touches&&e.touches[0]?e.touches[0]:e;}
    function move(e){if(!active)return;var r=el.getBoundingClientRect();var p=pt(e);onMove(r,p.clientX,p.clientY);}
    el.addEventListener('mousedown',function(e){active=true;move(e);e.preventDefault();});
    el.addEventListener('touchstart',function(e){active=true;move(e);},{passive:true});
    document.addEventListener('mousemove',move);
    document.addEventListener('touchmove',move,{passive:true});
    document.addEventListener('mouseup',function(){active=false;});
    document.addEventListener('touchend',function(){active=false;});
  }
  attach(CP.sv,function(r,x,y){CP.s=clamp01((x-r.left)/r.width);CP.v=1-clamp01((y-r.top)/r.height);cpRender();cpFire();});
  attach(CP.hue,function(r,x){CP.h=clamp01((x-r.left)/r.width)*360;cpRender();cpFire();});
  attach(CP.alpha,function(r,x){CP.a=clamp01((x-r.left)/r.width);cpRender();cpFire();});
}
function cpRender(){
  CP.sv.style.backgroundColor='hsl('+CP.h+',100%,50%)';
  CP.svThumb.style.left=(CP.s*100)+'%';CP.svThumb.style.top=((1-CP.v)*100)+'%';
  CP.hueThumb.style.left=(CP.h/360*100)+'%';
  var hex=cpHex();var rgb=hexToRgb(hex);
  CP.svThumb.style.backgroundColor=hex;
  CP.fill.style.backgroundColor=hexToRgba(hex,CP.alphaEnabled?CP.a:1);
  CP.alphaGrad.style.background='linear-gradient(to right,rgba('+rgb.r+','+rgb.g+','+rgb.b+',0),rgb('+rgb.r+','+rgb.g+','+rgb.b+'))';
  CP.alphaThumb.style.left=(CP.a*100)+'%';
  if(document.activeElement!==CP.hex)CP.hex.value=hex;
  if(document.activeElement!==CP.anum)CP.anum.value=Math.round(CP.a*100);
}
function cpFire(){if(CP.onInput)CP.onInput(cpHex(),CP.alphaEnabled?CP.a:null);}
function cpSetFromHex(hex){var rgb=hexToRgb(hex);var hsv=rgbToHsv(rgb.r,rgb.g,rgb.b);CP.h=hsv.h;CP.s=hsv.s;CP.v=hsv.v;cpRender();cpFire();}
function openColorPopup(anchor,opts){
  buildColorPopup();
  CP.anchor=anchor;CP.onInput=opts.onInput;CP.alphaEnabled=(opts.alpha!=null);CP.a=CP.alphaEnabled?opts.alpha:1;
  var rgb=hexToRgb(opts.color||'#000000');var hsv=rgbToHsv(rgb.r,rgb.g,rgb.b);CP.h=hsv.h;CP.s=hsv.s;CP.v=hsv.v;
  CP.alpha.style.display=CP.alphaEnabled?'':'none';
  CP.anum.style.display=CP.alphaEnabled?'':'none';
  CP.apct.style.display=CP.alphaEnabled?'':'none';
  CP.el.style.display='';cpRender();positionCP(anchor);
}
function positionCP(anchor){
  var r=anchor.getBoundingClientRect();var pop=CP.el;pop.style.left='0px';pop.style.top='0px';
  var pw=pop.offsetWidth,ph=pop.offsetHeight;var left=r.right-pw,top=r.bottom+6;
  if(left<8)left=8;if(left+pw>window.innerWidth-8)left=window.innerWidth-pw-8;
  if(top+ph>window.innerHeight-8)top=r.top-ph-6;if(top<8)top=8;
  pop.style.left=left+'px';pop.style.top=top+'px';
}
function closeColorPopup(){if(CP&&CP.el)CP.el.style.display='none';}

/* ========== 색상 트리거 컨트롤 ========== */
function makeColorControl(id,obj,colorProp,alphaProp,cb){
  var btn=document.getElementById(id);if(!btn)return;
  var sw=btn.querySelector('.ct-fill');
  function paint(){if(sw)sw.style.backgroundColor=alphaProp?hexToRgba(obj[colorProp],Number(obj[alphaProp])):obj[colorProp];}
  paint();colorControls.push({paint:paint});
  btn.addEventListener('click',function(e){e.stopPropagation();
    openColorPopup(btn,{color:obj[colorProp],alpha:alphaProp?Number(obj[alphaProp]):null,
      onInput:function(hex,a){obj[colorProp]=hex;if(alphaProp&&a!=null)obj[alphaProp]=a;paint();cb();markDirtyFrom(btn);}});
  });
}

/* ========== 설정 UI 동기화 (불러오기 후 컨트롤 갱신) ========== */
function formatByStep(el,val){var s=el.getAttribute('step')||'1';var dec=s.indexOf('.')>=0?s.split('.')[1].length:0;return Number(val).toFixed(dec);}
function setRange(id,val,fmt){var el=document.getElementById(id);if(!el)return;el.value=val;var lbl=el.nextElementSibling;if(lbl&&lbl.classList&&lbl.classList.contains('range-val'))lbl.textContent=fmt?fmt(Number(val)):formatByStep(el,val);if(el._num)el._num.value=formatByStep(el,el.value);}
function setCheck(id,val){var el=document.getElementById(id);if(el)el.checked=!!val;}
function syncSettingsUI(){
  colorControls.forEach(function(c){c.paint();});
  setRange('default-stroke-weight',DRAFT.styleConfig.default.strokeWeight);
  setRange('highlight-stroke-weight',DRAFT.styleConfig.highlight.strokeWeight);
  setRange('highlight-spot-scale',DRAFT.styleConfig.highlight.spotScaleM);
  setRange('lens-trend-scale',DRAFT.styleConfig.lens.trendScaleM);
  setRange('lens-fade-ms',DRAFT.styleConfig.lens.fadeMs);
  setRange('lens-switch-n',DRAFT.styleConfig.lens.switchZoomN);
  setCheck('smooth-toggle',DRAFT.smoothEnabled);
  setRange('smooth-intensity',DRAFT.smoothIntensity);
  setRange('hex-radius',DRAFT.hexRadiusKm,function(v){return v.toFixed(1)+'km';});
  setCheck('local-label-toggle',DRAFT.localLabelConfig.enabled);
  setCheck('zone-merge-toggle',DRAFT.zoneMergeBlocks);
  setRange('local-label-size',DRAFT.localLabelConfig.fontSize);
  setRange('zone-label-size',DRAFT.zoneLabelConfig.fontSize);
  setRange('zone-label-bg-opacity',DRAFT.zoneLabelConfig.bgOpacity);
  setRange('spot-max-chars',DRAFT.spotConfig.maxChars);
  setRange('spot-font-size',DRAFT.spotConfig.fontSize);
  setRange('spot-emoji-size',DRAFT.spotConfig.emojiSize);
  setRange('spot-bubble-radius',DRAFT.spotConfig.bubbleRadius);
  setRange('spot-emoji-gap',DRAFT.spotConfig.emojiGap);
  setRange('spot-emoji-letter',DRAFT.spotConfig.emojiLetterSpacing);
  setRange('spot-dot-scale',DRAFT.spotConfig.dotScaleM);
  setCheck('spot-tail',DRAFT.spotConfig.tail);
  var _sp=document.getElementById('spot-emoji-pos');if(_sp)_sp.value=DRAFT.spotConfig.emojiPos||'bottom';
  var _sds=document.getElementById('spot-dot-style');if(_sds)_sds.value=DRAFT.spotConfig.dotStyle||'dot';
  if(typeof renderSpotEmojiPicker==='function')renderSpotEmojiPicker();
  renderMiniPreviews();
}

function initSettingsPanel(){
  var toggle=document.getElementById('settings-toggle');
  var section=document.getElementById('settings-section');
  toggle.addEventListener('click',function(){
    var open=section.style.display!=='none';
    if(!open){var oc=document.getElementById('content-section'),ot=document.getElementById('content-toggle'); // 최상위 탭도 하나만
      if(oc)oc.style.display='none';if(ot)ot.classList.remove('open');}
    section.style.display=open?'none':'';toggle.classList.toggle('open',!open);
  });

  // 색상+투명도 통합 컨트롤 (팝업에서 색상/알파 동시 조절)
  makeColorControl('ct-default-fill',DRAFT.styleConfig.default,'fillColor','fillOpacity',mpNoop);
  makeColorControl('ct-default-stroke',DRAFT.styleConfig.default,'strokeColor','strokeOpacity',mpNoop);
  makeColorControl('ct-highlight-fill',DRAFT.styleConfig.highlight,'fillColor','fillOpacity',mpNoop);
  makeColorControl('ct-highlight-stroke',DRAFT.styleConfig.highlight,'strokeColor','strokeOpacity',mpNoop);
  makeColorControl('ct-dim-fill',DRAFT.styleConfig.lens,'fogColor','fogOpacity',mpNoop);
  makeColorControl('ct-dim-stroke',DRAFT.styleConfig.lens,'lineColor','lineOpacity',mpNoop);
  makeColorControl('ct-hex-fill',DRAFT.hexStyleConfig.default,'fillColor','fillOpacity',mpNoop);
  makeColorControl('ct-hex-stroke',DRAFT.hexStyleConfig.default,'strokeColor','strokeOpacity',mpNoop);
  makeColorControl('ct-hex-sel-fill',DRAFT.hexStyleConfig.selected,'fillColor','fillOpacity',mpNoop);
  makeColorControl('ct-local-label-text',DRAFT.localLabelConfig,'textColor',null,mpNoop);
  makeColorControl('ct-local-label-bg',DRAFT.localLabelConfig,'bgColor','bgOpacity',mpNoop);
  makeColorControl('ct-zone-label-text',DRAFT.zoneLabelConfig,'textColor',null,mpNoop);

  // 선 굵기 (투명도가 아니므로 슬라이더 유지)
  bindInput('default-stroke-weight','range',DRAFT.styleConfig.default,'strokeWeight',mpNoop);
  bindInput('highlight-stroke-weight','range',DRAFT.styleConfig.highlight,'strokeWeight',mpNoop);
  bindInput('highlight-spot-scale','range',DRAFT.styleConfig.highlight,'spotScaleM',mpNoop);
  bindInput('lens-trend-scale','range',DRAFT.styleConfig.lens,'trendScaleM',mpNoop);
  bindInput('lens-fade-ms','range',DRAFT.styleConfig.lens,'fadeMs',function(){});
  bindInput('lens-switch-n','range',DRAFT.styleConfig.lens,'switchZoomN',mpNoop);

  document.getElementById('smooth-toggle').addEventListener('change',function(){DRAFT.smoothEnabled=this.checked;markDirtyFrom(this);});
  document.getElementById('smooth-intensity').addEventListener('input',function(){
    DRAFT.smoothIntensity=parseFloat(this.value);this.nextElementSibling.textContent=DRAFT.smoothIntensity.toFixed(1);
    markDirtyFrom(this);
  });

  document.getElementById('hex-radius').addEventListener('input',function(){
    DRAFT.hexRadiusKm=parseFloat(this.value);document.getElementById('hex-radius-label').textContent=DRAFT.hexRadiusKm.toFixed(1)+'km';
    markDirtyFrom(this);
  });

  // 폰 표시영역 오버레이 토글 (관리자)
  var vpToggle=document.getElementById('phone-viewport-toggle');
  if(vpToggle){vpToggle.checked=phoneViewportOn;vpToggle.addEventListener('change',function(){phoneViewportOn=this.checked;updatePhoneViewportOverlay();});}

  // 라벨 옵션
  document.getElementById('local-label-toggle').addEventListener('change',function(){DRAFT.localLabelConfig.enabled=this.checked;markDirtyFrom(this);});
  bindInput('local-label-size','range',DRAFT.localLabelConfig,'fontSize',mpNoop);
  bindInput('zone-label-size','range',DRAFT.zoneLabelConfig,'fontSize',mpNoop);
  bindInput('zone-label-bg-opacity','range',DRAFT.zoneLabelConfig,'bgOpacity',mpNoop);
  var zmt=document.getElementById('zone-merge-toggle');
  if(zmt)zmt.addEventListener('change',function(){DRAFT.zoneMergeBlocks=this.checked;markDirtyFrom(this);});

  enhanceRangeInputs();      // 슬라이더 옆 숫자 직접 입력 추가
  initSettingsAccordion();   // 설정 섹션 아코디언화
}

function bindInput(id,type,obj,prop,cb){
  var el=document.getElementById(id);if(!el)return;
  el.addEventListener('input',function(){
    obj[prop]=type==='range'?parseFloat(this.value):this.value;
    if(type==='range'&&this.nextElementSibling&&this.nextElementSibling.classList&&this.nextElementSibling.classList.contains('range-val')) this.nextElementSibling.textContent=parseFloat(this.value).toFixed(this.step&&this.step.indexOf('.')>=0?this.step.split('.')[1].length:0);
    cb(); markDirtyFrom(el);
  });
}

/* ========== 슬라이더 제거 + 숫자 직접 입력 (모든 수치 설정) ========== */
function fmtStepStr(step,val){var st=String(step||'1');var dec=st.indexOf('.')>=0?st.split('.')[1].length:0;return Number(val).toFixed(dec);}
function enhanceRangeInputs(){
  var ranges=document.querySelectorAll('#settings-section .setting-row input[type="range"]');
  ranges.forEach(function(r){
    if(r._num)return;
    var step=r.getAttribute('step')||'1';
    var dec=String(step).indexOf('.')>=0?String(step).split('.')[1].length:0;
    var mn=r.min!==''?parseFloat(r.min):null, mx=r.max!==''?parseFloat(r.max):null;
    r.style.display='none';                       // 슬라이더 제거(직접 입력만)
    var disp=r.nextElementSibling; if(disp&&disp.classList&&disp.classList.contains('range-val'))disp.style.display='none';else disp=null;
    // 입력 주의 문구: 정수/소수 + 허용 범위(음수 여부는 범위로 드러남)
    var hint=document.createElement('span');hint.className='num-hint';
    hint.textContent=(dec>0?'소수':'정수')+' '+(mn!=null?mn:'')+'~'+(mx!=null?mx:'');
    var num=document.createElement('input');
    num.type='number';num.className='range-num';
    if(mn!=null)num.min=mn;if(mx!=null)num.max=mx;num.step=step;
    num.value=fmtStepStr(step,r.value);
    var ref=disp||r;
    ref.parentNode.insertBefore(hint,ref.nextSibling);
    hint.parentNode.insertBefore(num,hint.nextSibling);
    if(r.id==='hex-radius'){var u=document.createElement('span');u.className='range-unit';u.textContent='km';num.parentNode.insertBefore(u,num.nextSibling);}
    r._num=num;
    r.addEventListener('input',function(){num.value=fmtStepStr(step,r.value);});
    function commit(){
      var v=parseFloat(num.value);
      if(isNaN(v)){num.value=fmtStepStr(step,r.value);return;}
      if(dec===0)v=Math.round(v);                 // 정수 필드는 정수로 강제
      if(mn!=null&&v<mn)v=mn;if(mx!=null&&v>mx)v=mx;
      r.value=v;num.value=fmtStepStr(step,r.value);
      r.dispatchEvent(new Event('input',{bubbles:true})); // 기존 range 핸들러 재사용
    }
    num.addEventListener('change',commit);
    num.addEventListener('keydown',function(e){if(e.key==='Enter'){commit();num.blur();}});
  });
}

/* ========== 설정 섹션 아코디언 (탭처럼 펼침/접힘) ========== */
function initSettingsAccordion(){
  var contentIdx=0;
  document.querySelectorAll('#settings-section .settings-section,#content-section .settings-section').forEach(function(sec){
    var h=sec.querySelector('h4');if(!h||h._acc)return;h._acc=true;
    sec.classList.add('acc-section');
    var inContent=!!sec.closest('#content-section');
    if(!inContent)sec.classList.add('collapsed');            // 관리자 설정=전부 접힘
    else if(contentIdx++>0)sec.classList.add('collapsed');   // 컨텐츠=첫 블록만 펼침
    h.classList.add('acc-head');h.setAttribute('role','button');h.setAttribute('tabindex','0');
    function toggle(){
      var opening=sec.classList.contains('collapsed');
      if(opening){ // 항상 그룹당 1개만 펼침: 같은 그룹의 나머지는 접기
        var group=sec.closest('#content-section')||sec.closest('#settings-section');
        if(group)group.querySelectorAll('.acc-section').forEach(function(x){if(x!==sec)x.classList.add('collapsed');});
        sec.classList.remove('collapsed');
        if(sec.scrollIntoView)sec.scrollIntoView({block:'nearest'});
      }else sec.classList.add('collapsed');
    }
    h.addEventListener('click',toggle);
    h.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
  });
}

/* ========== 컨텐츠 설정 패널 토글 ========== */
function initContentPanel(){
  var toggle=document.getElementById('content-toggle');
  var section=document.getElementById('content-section');
  if(!toggle||!section)return;
  toggle.addEventListener('click',function(){
    var open=section.style.display!=='none';
    if(!open){var os=document.getElementById('settings-section'),ot=document.getElementById('settings-toggle'); // 최상위 탭도 하나만
      if(os)os.style.display='none';if(ot)ot.classList.remove('open');}
    section.style.display=open?'none':'';toggle.classList.toggle('open',!open);
  });
}

/* ========== 유틸리티 ========== */
function hideMapLoading(){var el=document.getElementById('map-loading');if(el)el.classList.add('hidden');}

function initPanelCollapse(){
  var btn=document.getElementById('panel-collapse');
  var panel=document.getElementById('left-panel');
  if(!btn||!panel) return;
  btn.addEventListener('click',function(){
    var collapsed=panel.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded',collapsed?'false':'true');
    btn.setAttribute('aria-label',collapsed?'패널 펼치기':'패널 접기');
    btn.setAttribute('title',collapsed?'패널 펼치기':'패널 접기');
  });
}

/* ========== 사이드바 폭 조절 (→ 폰 크기, 비율은 cqw로 유지) ========== */
function resizeMaps(){
  if(typeof google==='undefined')return;
  if(map)google.maps.event.trigger(map,'resize');
  if(phoneMap){google.maps.event.trigger(phoneMap,'resize');var c=map&&map.getCenter();if(c){phoneMap.setCenter(c);phoneMap.setZoom(map.getZoom());}}
  updatePhoneViewportOverlay();
}
function initSidebarResize(){
  var sb=document.getElementById('sidebar'),rz=document.getElementById('sidebar-resizer');
  if(!sb||!rz)return;
  function maxW(){return Math.min(720,Math.round(window.innerWidth*0.72));}
  function applyW(w){w=Math.max(300,Math.min(w,maxW()));sb.style.flexBasis=w+'px';sb.style.width=w+'px';try{localStorage.setItem('nowhere_sidebarW',String(w));}catch(e){}return w;}
  var saved=NaN;try{saved=parseInt(localStorage.getItem('nowhere_sidebarW'),10);}catch(e){}
  if(!isNaN(saved))applyW(saved);
  var dragging=false;
  function pt(e){return e.touches&&e.touches[0]?e.touches[0]:e;}
  function move(e){if(!dragging)return;var p=pt(e);applyW(window.innerWidth-p.clientX);if(e.cancelable)e.preventDefault();}
  function up(){if(!dragging)return;dragging=false;document.body.classList.remove('resizing-sb');
    document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);
    document.removeEventListener('touchmove',move);document.removeEventListener('touchend',up);resizeMaps();}
  function down(e){dragging=true;document.body.classList.add('resizing-sb');if(e.cancelable)e.preventDefault();
    document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
    document.addEventListener('touchmove',move,{passive:false});document.addEventListener('touchend',up);}
  rz.addEventListener('mousedown',down);rz.addEventListener('touchstart',down,{passive:false});
  window.addEventListener('resize',function(){if(sb.style.width)applyW(parseInt(sb.style.width,10)||380);});
}

var myLocation=null,myLocMarkers=[];
function renderMyLocation(){ // 현재 위치 마커: 블루 점 + 흰 링 + 옅은 헤일로 (메인·폰 동시)
  myLocMarkers.forEach(function(m){m.setMap(null);});myLocMarkers=[];
  if(!myLocation||typeof google==='undefined')return;
  [map,phoneMap].forEach(function(m){
    if(!m)return;
    myLocMarkers.push(new google.maps.Marker({position:myLocation,map:m,clickable:false,zIndex:49,
      icon:{path:google.maps.SymbolPath.CIRCLE,scale:13,fillColor:'#2f7bff',fillOpacity:0.15,strokeWeight:0}}));
    myLocMarkers.push(new google.maps.Marker({position:myLocation,map:m,clickable:false,zIndex:50,
      icon:{path:google.maps.SymbolPath.CIRCLE,scale:6.5,fillColor:'#2f7bff',fillOpacity:1,strokeColor:'#ffffff',strokeWeight:2.5}}));
  });
}
function initMyLocation(){ // 앱 시작: 내 위치(줌15) → 실패/미지원 시 서울시 전역
  var seoul=function(){if(map){map.setCenter({lat:37.5665,lng:126.978});map.setZoom(11);}};
  if(!navigator.geolocation){seoul();return;}
  navigator.geolocation.getCurrentPosition(function(pos){
    myLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
    if(map){map.setCenter(myLocation);map.setZoom(15);} // 폰은 미러로 동기
    renderMyLocation();
  },seoul,{timeout:5000,maximumAge:60000});
}
function fitBoundsToData(){var b=new google.maps.LatLngBounds();map.data.forEach(function(f){var g=f.getGeometry();if(g)g.forEachLatLng(function(ll){b.extend(ll);});});if(!b.isEmpty())map.fitBounds(b,60);}

function updateInfoPanel(content){
  var el=document.getElementById('info-text');
  if(!content){el.innerHTML=currentMode==='local'?'폴리곤을 클릭하면 해당 동이 하이라이트됩니다.':'헥사곤을 클릭하여 영역을 선택하세요.<br/><span class="hex-info">복수 선택 가능</span>';el.classList.remove('highlighted');}
  else{el.innerHTML='선택된 구역:<br/><span class="dong-name">'+content+'</span>';el.classList.add('highlighted');}
}

function mapStyles(){return [{elementType:'geometry',stylers:[{color:'#1d2c4d'}]},{elementType:'labels.text.fill',stylers:[{color:'#8ec3b9'}]},{elementType:'labels.text.stroke',stylers:[{color:'#1a3646'}]},{featureType:'administrative',elementType:'geometry',stylers:[{visibility:'off'}]},{featureType:'landscape',elementType:'geometry',stylers:[{color:'#1d3044'}]},{featureType:'poi',elementType:'geometry',stylers:[{color:'#263c3f'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#304a7d'}]},{featureType:'road.highway',elementType:'geometry',stylers:[{color:'#2c6675'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#0e1626'}]}];}

/* ========== 인증 · 계정 (Firebase) ========== */
var fbAuth=null, fbDb=null, currentUser=null, currentRole=null;
var SESSION_SID='s_'+Math.random().toString(36).slice(2,10); // 이 접속(세션) 식별자 — 자기 저장 에코 판별용
var cloudData=null, mapReady=false, cloudSaveTimer=null, mapBootStarted=false;

function bootMap(){
  if(mapBootStarted)return; mapBootStarted=true;
  var s=document.createElement('script');
  s.src='https://maps.googleapis.com/maps/api/js?key='+CONFIG.GOOGLE_MAPS_API_KEY+'&callback=initMap';
  s.async=true;s.defer=true;document.head.appendChild(s);
}
function adminEmail(){return (CONFIG.ADMIN_EMAIL||'gihoon.mx@gmail.com').toLowerCase();}

function showAuthOverlay(state,user,msg){
  var ov=document.getElementById('auth-overlay');if(!ov)return;
  ov.classList.remove('hidden');
  var sub=document.getElementById('auth-sub'),login=document.getElementById('google-login-btn'),
      status=document.getElementById('auth-status'),logout=document.getElementById('auth-logout');
  status.classList.remove('deny');
  var email=(user&&user.email)?user.email:'';
  if(state==='signedout'){sub.textContent='위치 기반 하이퍼로컬 · 접근 권한이 필요합니다';login.style.display='';status.innerHTML='';logout.style.display='none';}
  else if(state==='checking'){login.style.display='none';status.innerHTML='<span class="auth-spinner"></span>확인 중…';logout.style.display='none';}
  else if(state==='denied'){login.style.display='none';status.classList.add('deny');status.innerHTML='⛔ 접근 권한이 없는 계정입니다.<br><span class="em">'+escHtml(email)+'</span>'+(msg?'<br>'+escHtml(msg):'');logout.style.display='';logout.textContent='다른 계정으로 로그인';}
  else if(state==='demo'){login.style.display='none';status.innerHTML='🚧 데모 모드는 준비 중입니다.<br><span class="em">'+escHtml(email)+'</span>';logout.style.display='';logout.textContent='로그아웃';}
}
function hideAuthOverlay(){var ov=document.getElementById('auth-overlay');if(ov)ov.classList.add('hidden');}
function showUserChip(user,role){
  var label=(user.email||'')+(role==='admin'?' · 관리자':' · 뷰어');
  var row=document.getElementById('account-row');
  if(row){row.style.display='';
    document.getElementById('account-email').textContent=label;
    document.getElementById('allowlist-btn').style.display=(role==='admin')?'':'none';
  }
  // 폰 우상단 프로필: 사진(있으면) 또는 이니셜
  var pf=document.getElementById('phone-profile'),pi=document.getElementById('pa-profile-img'),pn=document.getElementById('pa-profile-initial');
  if(pf){
    if(user.photoURL&&pi){pi.src=user.photoURL;pf.classList.add('has-photo');}
    else{pf.classList.remove('has-photo');if(pn)pn.textContent=(user.email||'?').charAt(0).toUpperCase();}
  }
  // 프로필 메뉴: 계정 + 버전
  var pe=document.getElementById('ppm-email');
  if(pe)pe.textContent=(role==='admin'&&window.matchMedia('(min-width:769px)').matches)?((user.email||'')+' · 뷰어 (데모 미리보기)'):label; // 데스크톱 폰 미러=데모 기준
  var pv=document.getElementById('ppm-version'),av=document.getElementById('app-version');if(pv&&av)pv.textContent=av.textContent;
}

function initAuth(){
  if(typeof firebase==='undefined'||!CONFIG.FIREBASE){hideAuthOverlay();bootMap();return;} // Firebase 미설정 폴백
  firebase.initializeApp(CONFIG.FIREBASE);
  fbAuth=firebase.auth();fbDb=firebase.firestore();
  try{fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(e){}
  showAuthOverlay('checking');
  document.getElementById('google-login-btn').addEventListener('click',function(){
    showAuthOverlay('checking');
    fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function(err){showAuthOverlay('signedout');console.warn('login fail',err);});
  });
  document.getElementById('auth-logout').addEventListener('click',function(){fbAuth.signOut();});
  var lo=document.getElementById('logout-btn');if(lo)lo.addEventListener('click',function(){fbAuth.signOut();});
  var plo=document.getElementById('ppm-logout');if(plo)plo.addEventListener('click',function(){fbAuth.signOut();});
  var alBtn=document.getElementById('allowlist-btn');if(alBtn)alBtn.addEventListener('click',openAllowlistManager);
  initAllowlistModal();
  fbAuth.onAuthStateChanged(handleAuth);
}
function detachLiveListeners(){if(contentUnsub){contentUnsub();contentUnsub=null;}if(newsUnsub){newsUnsub();newsUnsub=null;}if(typeof liveOff==='function')liveOff();}
function handleAuth(user){
  currentUser=user;
  if(!user){currentRole=null;detachLiveListeners();document.body.classList.remove('role-admin','role-user');var row=document.getElementById('account-row');if(row)row.style.display='none';showAuthOverlay('signedout');return;}
  showAuthOverlay('checking');
  var email=(user.email||'').toLowerCase();
  if(email===adminEmail()){grantAccess(user,'admin');return;}
  fbDb.collection('allowlist').doc(email).get().then(function(doc){
    if(doc.exists){grantAccess(user,doc.data().role==='admin'?'admin':'user');}
    else{showAuthOverlay('denied',user);}
  }).catch(function(err){showAuthOverlay('denied',user,'권한 확인 실패: '+err.message);});
}
function grantAccess(user,role){
  currentRole=role;
  document.body.classList.remove('role-admin','role-user');
  document.body.classList.add(role==='admin'?'role-admin':'role-user');
  hideAuthOverlay();showUserChip(user,role);bootMap();
  loadSharedContent(); // 관리자·데모 모두 공유 콘텐츠(존/스팟) 로드. 저장은 관리자만(cloudSave/markCloudDirty에서 가드)
  liveOn();              // 유저 생성 콘텐츠(피드/스팟/Request) 실시간 구독
}

var contentUnsub=null, newsUnsub=null;
/* ===== 유저 생성 콘텐츠 실시간 공유 (liveFeed / liveSpots / liveRequests / liveChat) ===== */
var liveUnsub={feed:null,spots:null,reqs:null,chat:null}, feedSeq=0;
var reqsPrimed=false, reqAnsSeen={}; // 현장 Request 실시간 팝업/답변 알림 상태
function hasLive(){return !!(fbDb&&currentUser);}
var liveErrShown=false;
function liveWriteErr(e){console.warn('live write',e);
  if(!liveErrShown&&e&&/permission/i.test(e.message||'')){liveErrShown=true;
    alert('실시간 공유 저장이 거부되었어요.\nFirestore 보안 규칙에 liveFeed/liveSpots/liveRequests/liveChat 쓰기 허용을 배포했는지 확인해 주세요.');}
}
function myUid(){return currentUser?currentUser.uid:'anon';}
function liveOn(){
  if(!hasLive())return;liveOff();
  liveUnsub.feed=fbDb.collection('liveFeed').orderBy('ts','desc').limit(48).onSnapshot(function(snap){
    feedItems=[];snap.forEach(function(dc){var v=dc.data();feedItems.push({id:dc.id,type:'photo',src:v.src,region:v.region||'',zone:v.zone||null,lat:(v.lat!=null?v.lat:null),lng:(v.lng!=null?v.lng:null),kind:v.kind||'post',desc:v.desc||'',name:v.name||'',by:v.by||'',byEmail:v.byEmail||'',ts:v.ts||0,likes:v.likes||{}});});
    rebuildLikes();try{localStorage.setItem(FEED_KEY,JSON.stringify(feedItems.slice(0,48)));}catch(e){}
    renderFeedColList();renderDrawerDemo();renderFeedMarkers();renderNews();if(currentTab==='feed')renderFeed();
  },function(e){console.warn('liveFeed',e);});
  liveUnsub.spots=fbDb.collection('liveSpots').orderBy('ts','desc').limit(120).onSnapshot(function(snap){
    demoSpots=[];snap.forEach(function(dc){var v=dc.data();demoSpots.push({id:dc.id,lat:v.lat,lng:v.lng,text:v.text||'',emoji:v.emoji||'💬',color:v.color||null,by:v.by||'',byEmail:v.byEmail||'',live:true});});
    rebuildSpots();
  },function(e){console.warn('liveSpots',e);});
  reqsPrimed=false;reqAnsSeen={}; // 재구독 시 알림 상태 리셋(초기 로드 팝업 방지)
  liveUnsub.reqs=fbDb.collection('liveRequests').orderBy('ts','desc').limit(40).onSnapshot(function(snap){
    var changes=snap.docChanges();
    fieldRequests=[];snap.forEach(function(dc){var v=dc.data();fieldRequests.push({id:dc.id,lat:v.lat,lng:v.lng,q:v.q,place:v.place,answers:v.answers||[],by:v.by||'',seed:!!v.seed,ts:v.ts||0});});
    renderRequestMarkers();
    if(!reqsPrimed){reqsPrimed=true;snap.forEach(function(dc){reqAnsSeen[dc.id]=(dc.data().answers||[]).length;});return;} // 첫 스냅샷=기존 데이터, 알림 없음
    changes.forEach(function(ch){
      var v=ch.doc.data(),id=ch.doc.id;
      if(ch.type==='added'){
        reqAnsSeen[id]=(v.answers||[]).length;
        // 새 Request → 타겟 지역(내가 보고 있는 근처) 사용자에게 AI Agent 응답 팝업 (요청자 본인·시드·10분 경과 제외)
        if(!v.seed&&v.by!==myUid()&&Date.now()-(v.ts||0)<REQ_TTL_MS&&reqNearMe(v))showReqBubble({id:id,q:v.q,place:v.place,lat:v.lat,lng:v.lng});
      }else if(ch.type==='modified'){
        var n=(v.answers||[]).length,seen=(reqAnsSeen[id]||0);reqAnsSeen[id]=n;
        if(v.by===myUid()&&n>seen){ // 내 Request에 새 답변 → 요청자에게 도착 알림 (대기중/결과 상시 노출 대신)
          var last=v.answers[n-1]||{},ab=document.getElementById('ai-bubble');
          if(ab){ab.textContent='📍 '+v.place+' 현장 답변 도착: '+(last.img?'📷 ':'')+(last.t||'');ab.classList.add('show');setTimeout(function(){ab.classList.remove('show');},6000);}
        }
      }else if(ch.type==='removed'){delete reqAnsSeen[id];}
    });
  },function(e){console.warn('liveRequests',e);});
  liveUnsub.chat=fbDb.collection('liveChat').orderBy('ts','desc').limit(400).onSnapshot(function(snap){
    socLiveMsgs={};
    snap.forEach(function(dc){var v=dc.data();if(!v.room||!v.t)return;
      (socLiveMsgs[v.room]=socLiveMsgs[v.room]||[]).push({id:dc.id,who:v.name||'이웃',t:v.t,me:v.by===myUid()});});
    Object.keys(socLiveMsgs).forEach(function(k){socLiveMsgs[k].reverse();}); // desc 스냅샷 → 시간순
    if(currentTab==='social')renderSocial();
  },function(e){console.warn('liveChat',e);});
}
function liveOff(){Object.keys(liveUnsub).forEach(function(k){if(liveUnsub[k]){liveUnsub[k]();liveUnsub[k]=null;}});}
function loadSharedContent(){ // 실시간: 다른 사람이 올린 공유 콘텐츠가 접속 중 즉시 반영
  if(!fbDb)return;
  if(contentUnsub){contentUnsub();contentUnsub=null;}
  contentUnsub=fbDb.collection('shared').doc('mapContent').onSnapshot(function(doc){
    if(doc.metadata.hasPendingWrites)return;               // 내 낙관적 로컬 에코 무시
    if(!doc.exists)return;
    var d=doc.data();
    // ⚠️ 에코 판별은 세션 ID로만: 이메일 비교는 '관리자가 새로 접속'해도 마지막 저장자=본인이라
    // 클라우드 설정이 영영 적용되지 않고, 이후 편집 시 코드 기본값이 클라우드를 덮어쓰는 초기화 버그가 있었음(v1.46.1 수정)
    if(d.updatedSid&&d.updatedSid===SESSION_SID)return; // 이 세션의 저장 에코만 재적용 안 함(편집 보호)
    cloudData=d;
    if(mapReady)applyCloudData(cloudData);
  },function(e){console.warn('shared live fail',e);});
  loadNewsFromCloud();   // 동네소식(지면 이미지) 실시간 로드 — 로그인 사용자 모두
}
function applySettingsData(s){ // 스타일 설정 병합 (클라우드·파일 백스톱 공용)
  if(!s)return;
  if(s.styleConfig){mergeInto(styleConfig.default,s.styleConfig.default);mergeInto(styleConfig.highlight,s.styleConfig.highlight);if(s.styleConfig.lens)mergeInto(styleConfig.lens,s.styleConfig.lens);}
  if(s.hexStyleConfig){mergeInto(hexStyleConfig.default,s.hexStyleConfig.default);mergeInto(hexStyleConfig.selected,s.hexStyleConfig.selected);}
  if(s.localLabelConfig)mergeInto(localLabelConfig,s.localLabelConfig);
  if(s.zoneLabelConfig)mergeInto(zoneLabelConfig,s.zoneLabelConfig);
  if(s.smoothEnabled!==undefined)smoothEnabled=s.smoothEnabled;
  if(s.zoneMergeBlocks!==undefined)zoneMergeBlocks=s.zoneMergeBlocks;
  if(s.smoothIntensity!==undefined)smoothIntensity=s.smoothIntensity;
  if(s.hexRadiusKm!==undefined)hexRadiusKm=s.hexRadiusKm;
}
function loadFileDefaults(){ // repo 백스톱(settings-default.json): 코드 기본값 < 파일 < 클라우드 순으로 적용
  fetch('settings-default.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(s){
    if(!s||typeof s!=='object'||(!s.styleConfig&&!s.spotConfig))return; // 빈 파일({})이면 무시
    if(cloudData)return; // 이미 클라우드 설정이 적용됨 — 클라우드 우선
    applySettingsData(s);
    if(s.spotConfig)mergeInto(spotConfig,s.spotConfig);
    initDraft();syncSettingsUI();renderMiniPreviews();
    if(mapReady){refreshMapStyles();refreshHexStyles();refreshSpotStyles();refreshZoneLabels();updateLocalLabelStyle();}
  }).catch(function(e){});
}
function applyCloudData(d){
  if(!d)return;
  applySettingsData(d.settings);
  if(Array.isArray(d.zones)){
    trendZones.slice().forEach(function(z){removeZoneFromMap(z);});
    trendZones=[];
    d.zones.forEach(function(z){trendZones.push({id:z.id||('tz_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),name:z.name,color:z.color,desc:z.desc||'',photo:z.photo||null,radiusKm:z.radiusKm||hexRadiusKm,hexCenters:z.hexCenters,originalCenters:z.originalCenters||JSON.parse(JSON.stringify(z.hexCenters)),originalRadiusKm:z.originalRadiusKm||z.radiusKm||hexRadiusKm,polygons:[],label:null});});
  }
  if(Array.isArray(d.spots)){adminSpots=d.spots.map(function(s){return {id:s.id||('sp_'+Date.now()+'_'+Math.random().toString(36).slice(2,5)),lat:s.lat,lng:s.lng,text:s.text||'',emoji:s.emoji||'💬',color:s.color||null};});}
  loadLocalSpotsInto();   // 로컬 폴백(라이브면 스냅샷)
  rebuildSpots();
  if(d.spotConfig)mergeInto(spotConfig,d.spotConfig);
  draftFromLive();syncSettingsUI();refreshMapStyles();refreshHexStyles();applyGeoJsonToMap();
  if(currentMode==='trend'){showAllZonesOnMap();generateHexagons();}
  renderSpots();   // 모드 무관 항상 스팟 표시
  renderZoneList();refreshZoneLabels();updateLocalLabelStyle();
  if(d.social){if(Array.isArray(d.social.rooms))socRoomList=d.social.rooms.slice();if(Array.isArray(d.social.seedLocal))socSeedLocal=d.social.seedLocal.slice();saveChat();renderRoomManager();}
  if(d.zoneCardStyle==='glass'||d.zoneCardStyle==='list'){zoneCardStyle=d.zoneCardStyle;var _zcs=document.getElementById('zone-card-style');if(_zcs)_zcs.value=zoneCardStyle;}
  if(d.feedTimeMode==='ago'||d.feedTimeMode==='clock'||d.feedTimeMode==='off'){feedTimeMode=d.feedTimeMode;var _ftm=document.getElementById('feed-time');if(_ftm)_ftm.value=feedTimeMode;if(currentTab==='feed')renderFeed();}
  blockDirty={};updateApplyBar();updateBlockBars(); // 클라우드본 = 적용 기준선
}
/* ========== 설정 미니 프리뷰: 각 설정 블록 상단에 그 옵션의 예시를 실시간 렌더 ========== */
function mpSvg(el,inner){el.innerHTML='<span class="mp-tag">미리보기</span><svg viewBox="0 0 200 128" preserveAspectRatio="xMidYMid slice">'+mpMapBg()+'<g transform="translate(0,32)">'+inner+'</g></svg>';}
// 샘플 동네 지도 (대략 100~200m 축척 느낌: 블록·건물·공원·도로 케이싱)
function mpMapBg(){
  return '<rect width="200" height="128" fill="#eef0ea"/>'
  +'<rect x="6" y="6" width="50" height="40" rx="7" fill="#d7e9d2"/><circle cx="20" cy="20" r="4" fill="#c3ddbc"/><circle cx="38" cy="32" r="5" fill="#c3ddbc"/>'
  +'<g fill="#e4e1d8" stroke="#d8d4c8" stroke-width="0.6">'
  +'<rect x="74" y="10" width="18" height="12"/><rect x="96" y="8" width="14" height="16"/><rect x="74" y="28" width="24" height="16"/><rect x="102" y="30" width="12" height="14"/>'
  +'<rect x="146" y="12" width="20" height="14"/><rect x="170" y="8" width="18" height="20"/><rect x="148" y="32" width="30" height="12"/>'
  +'<rect x="12" y="66" width="20" height="16"/><rect x="36" y="64" width="16" height="20"/>'
  +'<rect x="74" y="66" width="26" height="16"/><rect x="104" y="64" width="12" height="18"/>'
  +'<rect x="146" y="66" width="22" height="14"/><rect x="172" y="62" width="16" height="20"/>'
  +'<rect x="12" y="102" width="24" height="14"/><rect x="46" y="104" width="12" height="12"/><rect x="76" y="100" width="20" height="16"/><rect x="150" y="102" width="26" height="14"/>'
  +'</g>'
  +'<g stroke="#dcd8cd" stroke-width="9" fill="none" stroke-linecap="round"><path d="M-4 56 H204"/><path d="M-4 94 H204"/><path d="M64 -4 V132"/><path d="M136 -4 V132"/></g>'
  +'<g stroke="#ffffff" stroke-width="6.5" fill="none" stroke-linecap="round"><path d="M-4 56 H204"/><path d="M-4 94 H204"/><path d="M64 -4 V132"/><path d="M136 -4 V132"/></g>'
  +'<g stroke="#ffffff" stroke-width="3" fill="none"><path d="M0 24 H200"/><path d="M100 0 V56"/><path d="M170 94 V128"/></g>';
}
var MP_BLOB1=[[20,50],[14,26],[34,10],[66,8],[86,20],[84,44],[58,54]];
var MP_BLOB2=[[86,20],[108,10],[146,12],[166,30],[158,52],[112,56],[84,44]];
function mpPath(pts){return 'M'+pts.map(function(p){return (+p[0]).toFixed(1)+','+(+p[1]).toFixed(1);}).join(' L')+' Z';}
function mpRegionAttr(cfg){return 'fill="'+hexToRgba(cfg.fillColor,Number(cfg.fillOpacity))+'" stroke="'+hexToRgba(cfg.strokeColor,Number(cfg.strokeOpacity))+'" stroke-width="'+Math.min(6,Number(cfg.strokeWeight)||0)+'"';}
function mpHexPts(cx,cy,r){var o=[];for(var i=0;i<6;i++){var a=Math.PI/3*i;o.push((cx+r*Math.cos(a)).toFixed(1)+','+(cy+r*Math.sin(a)).toFixed(1));}return o.join(' ');}
function mpChip(el,bg,color,fontPx,text,extra){el.innerHTML='<span class="mp-tag">미리보기</span><svg class="mp-bg" viewBox="0 0 200 128" preserveAspectRatio="xMidYMid slice">'+mpMapBg()+'</svg><span class="map-label-tag" style="position:relative;z-index:1;transform:none;backdrop-filter:none;background:'+bg+';color:'+color+';font-size:'+fontPx+'px;'+(extra||'')+'">'+text+'</span>';}
var MINI_RENDER={
  'region':function(el){ // 동 구역 통합: 비선택+선택+스무딩+선택 라벨
    var sm1=DRAFT.smoothEnabled?chaikinSmooth(MP_BLOB1.concat([MP_BLOB1[0]]),DRAFT.smoothIntensity):MP_BLOB1;
    var sm2=DRAFT.smoothEnabled?chaikinSmooth(MP_BLOB2.concat([MP_BLOB2[0]]),DRAFT.smoothIntensity):MP_BLOB2;
    var lbl='';
    if(DRAFT.localLabelConfig.enabled){var lc=DRAFT.localLabelConfig;
      lbl='<g><rect x="18" y="24" width="52" height="15" rx="7.5" fill="'+hexToRgba(lc.bgColor,Number(lc.bgOpacity))+'"/><text x="44" y="35" text-anchor="middle" font-size="9" font-weight="700" fill="'+lc.textColor+'">역삼1동</text></g>';}
    mpSvg(el,'<path d="'+mpPath(sm2)+'" '+mpRegionAttr(DRAFT.styleConfig.default)+'/><path d="'+mpPath(sm1)+'" '+mpRegionAttr(DRAFT.styleConfig.highlight)+'/>'+lbl);
  },
  'lens':function(el){var c=DRAFT.styleConfig.lens;
    mpSvg(el,'<path d="M0,0 H200 V64 H0 Z '+mpPath(MP_BLOB1)+'" fill-rule="evenodd" fill="'+hexToRgba(c.fogColor,Number(c.fogOpacity))+'"/>'+
      '<path d="'+mpPath(MP_BLOB1)+'" fill="none" stroke="'+hexToRgba(c.lineColor,Number(c.lineOpacity))+'" stroke-width="1.8"/>'+
      '<text x="194" y="58" text-anchor="end" font-size="9" font-weight="700" fill="#7b8492">전환 '+(Number(c.fadeMs)||250)+'ms · 존 '+(Number(c.switchZoomN)||3)+'개</text>');
  },
  'trendzone':function(el){ // 트렌드 존 통합: 기본/선택 헥사 + 병합 존 + 라벨 + 반경
    var d=DRAFT.hexStyleConfig.default,sl=DRAFT.hexStyleConfig.selected,col='#F2862E';
    var R=13,gp={R_lat:R,R_lng:R,colSpacing:1.5*R,rowSpacing:Math.sqrt(3)*R};
    var centers=[{lat:32,lng:118},{lat:32-gp.rowSpacing/2,lng:118+gp.colSpacing},{lat:32+gp.rowSpacing/2,lng:118+gp.colSpacing}];
    var fills='',strokes='';
    centers.forEach(function(c2){var v=hexVertices(c2.lng,c2.lat,gp.R_lat,gp.R_lng);
      fills+='<polygon points="'+v.map(function(pt){return pt.lng.toFixed(1)+','+pt.lat.toFixed(1);}).join(' ')+'" fill="'+hexToRgba(col,0.35)+'" stroke="'+(DRAFT.zoneMergeBlocks?'none':hexToRgba(col,0.8))+'" stroke-width="1.3"/>';});
    if(DRAFT.zoneMergeBlocks)zoneOutlineLoops(centers,gp).forEach(function(loop){
      strokes+='<polygon points="'+loop.map(function(pt){return pt.lng.toFixed(1)+','+pt.lat.toFixed(1);}).join(' ')+'" fill="none" stroke="'+col+'" stroke-width="1.8"/>';});
    var zl=DRAFT.zoneLabelConfig;
    var chip='<g><rect x="112" y="25" width="48" height="14" rx="7" fill="'+hexToRgba(col,Number(zl.bgOpacity))+'"/><text x="136" y="35.5" text-anchor="middle" font-size="8.5" font-weight="700" fill="'+zl.textColor+'">강남 핫플</text></g>';
    mpSvg(el,'<polygon points="'+mpHexPts(26,32,14)+'" '+mpRegionAttr(d)+'/>'+
      '<polygon points="'+mpHexPts(58,32,14)+'" fill="'+hexToRgba(sl.fillColor,Number(sl.fillOpacity))+'" stroke="'+hexToRgba(sl.strokeColor,Number(sl.strokeOpacity))+'" stroke-width="1.6"/>'+
      fills+strokes+chip+
      '<text x="194" y="58" text-anchor="end" font-size="10" font-weight="700" fill="#7b8492">'+Number(DRAFT.hexRadiusKm).toFixed(1)+'km</text>');
  },
  'spot':function(el){var c=DRAFT.spotConfig;
    el.innerHTML='<span class="mp-tag">미리보기</span><svg class="mp-bg" viewBox="0 0 200 128" preserveAspectRatio="xMidYMid slice">'+mpMapBg()+'</svg>';
    var wrap=document.createElement('div');wrap.className='spot-marker';
    var bubble=document.createElement('div');bubble.className='spot-bubble';
    var emoji=document.createElement('div');emoji.className='spot-emoji';
    wrap.appendChild(bubble);wrap.appendChild(emoji);
    var t='여기 카페 분위기 최고',max=Number(c.maxChars)||40;if(t.length>max)t=t.slice(0,max)+'…';
    emoji.textContent=(c.emojis&&c.emojis[0])||'💬';
    emoji.style.fontSize=Math.min(40,Number(c.emojiSize)||26)+'px';
    emoji.style.letterSpacing=(Number(c.emojiLetterSpacing)||0)+'px';
    bubble.textContent=t;
    bubble.style.color=c.textColor||'#fff';
    bubble.style.fontSize=Math.min(22,Number(c.fontSize)||13)+'px';
    bubble.style.setProperty('--spot-bg',hexToRgba(c.bgColor||'#1c66e5',Number(c.bgOpacity)));
    bubble.style.borderRadius=(Number(c.bubbleRadius)||13)+'px';
    var pos=c.emojiPos||'bottom',vertical=(pos==='top'||pos==='bottom');
    wrap.style.flexDirection=vertical?'column':'row';
    wrap.style.gap=(Number(c.emojiGap)||0)+'px';
    emoji.style.order=(pos==='top'||pos==='left')?0:2;bubble.style.order=1;
    var showTail=(c.tail!==false)&&vertical;
    bubble.classList.toggle('no-tail',!showTail);
    bubble.classList.toggle('tail-up',showTail&&pos==='top');
    el.appendChild(wrap);
  }
};
MINI_RENDER['spot-view']=MINI_RENDER['spot']; // 컨텐츠-스팟 추가에도 동일 미리보기
function initMiniPreviews(){
  document.querySelectorAll('.settings-section[data-prev]').forEach(function(sec){
    if(sec.querySelector('.mini-prev'))return;
    var tile=document.createElement('div');tile.className='mini-prev';tile.dataset.prevFor=sec.dataset.prev;
    var h=sec.querySelector('h4');
    if(h&&h.nextSibling)sec.insertBefore(tile,h.nextSibling);else sec.appendChild(tile);
  });
}
function renderMiniPreviews(){
  document.querySelectorAll('.mini-prev').forEach(function(tile){
    var fn=MINI_RENDER[tile.dataset.prevFor];
    if(fn)try{fn(tile);}catch(e){}
  });
}

/* ========== 설정 드래프트(블록 단위): 변경=미니 프리뷰만 → 블록 [적용] 시 실제 지도+전체 저장 ========== */
var blockDirty={}, DRAFT=null, FACTORY_SETTINGS=null;
var mpNoop=function(){};
function snapshotSettings(){return JSON.parse(JSON.stringify({styleConfig:styleConfig,hexStyleConfig:hexStyleConfig,localLabelConfig:localLabelConfig,zoneLabelConfig:zoneLabelConfig,spotConfig:spotConfig,smoothEnabled:smoothEnabled,smoothIntensity:smoothIntensity,hexRadiusKm:hexRadiusKm,zoneMergeBlocks:zoneMergeBlocks}));}
function initDraft(){DRAFT=snapshotSettings();} // 설정 편집 버퍼 (컨트롤·미니 프리뷰가 이걸 읽고 씀)
function copyFields(dst,src,fields){fields.forEach(function(k){if(src[k]!==undefined)dst[k]=src[k];});}
var REGION_FIELDS=['strokeColor','fillColor','strokeWeight','strokeOpacity','fillOpacity'];
var LENS_FIELDS=['fogColor','fogOpacity','lineColor','lineOpacity','trendScaleM','fadeMs','switchZoomN'];
var SPOT_FIELDS=['maxChars','fontSize','textColor','bgColor','bgOpacity','emojiSize','emojiPos','emojiGap','emojiLetterSpacing','bubbleRadius','tail','dotScaleM','dotStyle'];
var LLABEL_FIELDS=['enabled','fontSize','textColor','bgColor','bgOpacity'];
var ZLABEL_FIELDS=['fontSize','textColor','bgOpacity'];
function objBlock(getLive,getDraft,getFact,fields,refresh){
  return {
    apply:function(){copyFields(getLive(),getDraft(),fields);if(refresh)refresh();},
    cancel:function(){copyFields(getDraft(),getLive(),fields);},
    def:function(){copyFields(getDraft(),getFact(),fields);}
  };
}
var BLOCK_DEFS={
  'spot':objBlock(function(){return spotConfig;},function(){return DRAFT.spotConfig;},function(){return FACTORY_SETTINGS.spotConfig;},SPOT_FIELDS,function(){refreshSpotStyles();}),
  'region':{ // 동 구역: 비선택+선택+스무딩+선택 라벨 (프리뷰 공유)
    apply:function(){
      copyFields(styleConfig.default,DRAFT.styleConfig.default,REGION_FIELDS);
      copyFields(styleConfig.highlight,DRAFT.styleConfig.highlight,REGION_FIELDS);
      copyFields(localLabelConfig,DRAFT.localLabelConfig,LLABEL_FIELDS);
      refreshMapStyles();
      if(localLabelConfig.enabled)showLocalLabel();else removeLocalLabel();
      updateLocalLabelStyle();
      var ch=(smoothEnabled!==DRAFT.smoothEnabled||smoothIntensity!==DRAFT.smoothIntensity);
      smoothEnabled=DRAFT.smoothEnabled;smoothIntensity=DRAFT.smoothIntensity;
      if(ch)applyGeoJsonToMap();
    },
    cancel:function(){
      copyFields(DRAFT.styleConfig.default,styleConfig.default,REGION_FIELDS);
      copyFields(DRAFT.styleConfig.highlight,styleConfig.highlight,REGION_FIELDS);
      copyFields(DRAFT.localLabelConfig,localLabelConfig,LLABEL_FIELDS);
      DRAFT.smoothEnabled=smoothEnabled;DRAFT.smoothIntensity=smoothIntensity;
    },
    def:function(){
      copyFields(DRAFT.styleConfig.default,FACTORY_SETTINGS.styleConfig.default,REGION_FIELDS);
      copyFields(DRAFT.styleConfig.highlight,FACTORY_SETTINGS.styleConfig.highlight,REGION_FIELDS);
      copyFields(DRAFT.localLabelConfig,FACTORY_SETTINGS.localLabelConfig,LLABEL_FIELDS);
      DRAFT.smoothEnabled=FACTORY_SETTINGS.smoothEnabled;DRAFT.smoothIntensity=FACTORY_SETTINGS.smoothIntensity;
    }
  },
  'trendzone':{ // 트렌드 존: 헥사 기본/선택+반경+병합+존 라벨 (프리뷰 공유)
    apply:function(){
      copyFields(hexStyleConfig.default,DRAFT.hexStyleConfig.default,REGION_FIELDS);
      copyFields(hexStyleConfig.selected,DRAFT.hexStyleConfig.selected,REGION_FIELDS);
      copyFields(zoneLabelConfig,DRAFT.zoneLabelConfig,ZLABEL_FIELDS);
      refreshHexStyles();refreshZoneLabels();
      if(zoneMergeBlocks!==DRAFT.zoneMergeBlocks){zoneMergeBlocks=DRAFT.zoneMergeBlocks;rerenderZones();}
      if(hexRadiusKm!==DRAFT.hexRadiusKm){hexRadiusKm=DRAFT.hexRadiusKm;selectedHexes.clear();if(editingZoneId)cancelEditZone();rezoneAllToCurrentRadius();if(currentMode==='trend'){generateHexagons();updateZoneSaveUI();}}
    },
    cancel:function(){
      copyFields(DRAFT.hexStyleConfig.default,hexStyleConfig.default,REGION_FIELDS);
      copyFields(DRAFT.hexStyleConfig.selected,hexStyleConfig.selected,REGION_FIELDS);
      copyFields(DRAFT.zoneLabelConfig,zoneLabelConfig,ZLABEL_FIELDS);
      DRAFT.zoneMergeBlocks=zoneMergeBlocks;DRAFT.hexRadiusKm=hexRadiusKm;
    },
    def:function(){
      copyFields(DRAFT.hexStyleConfig.default,FACTORY_SETTINGS.hexStyleConfig.default,REGION_FIELDS);
      copyFields(DRAFT.hexStyleConfig.selected,FACTORY_SETTINGS.hexStyleConfig.selected,REGION_FIELDS);
      copyFields(DRAFT.zoneLabelConfig,FACTORY_SETTINGS.zoneLabelConfig,ZLABEL_FIELDS);
      DRAFT.zoneMergeBlocks=FACTORY_SETTINGS.zoneMergeBlocks;DRAFT.hexRadiusKm=FACTORY_SETTINGS.hexRadiusKm;
    }
  },
  'lens':{ // 렌즈 색·수치 + 베이직 발동 축척(highlight.spotScaleM)
    apply:function(){copyFields(styleConfig.lens,DRAFT.styleConfig.lens,LENS_FIELDS);styleConfig.highlight.spotScaleM=DRAFT.styleConfig.highlight.spotScaleM;lensStyleRefresh();updatePhoneLens();},
    cancel:function(){copyFields(DRAFT.styleConfig.lens,styleConfig.lens,LENS_FIELDS);DRAFT.styleConfig.highlight.spotScaleM=styleConfig.highlight.spotScaleM;},
    def:function(){copyFields(DRAFT.styleConfig.lens,FACTORY_SETTINGS.styleConfig.lens,LENS_FIELDS);DRAFT.styleConfig.highlight.spotScaleM=FACTORY_SETTINGS.styleConfig.highlight.spotScaleM;}
  },
};
function draftFromLive(){ // 드래프트를 현재 적용값으로 리셋 (클라우드 로드 후 등)
  if(!DRAFT)return;
  Object.keys(BLOCK_DEFS).forEach(function(k){BLOCK_DEFS[k].cancel();});
  if(Array.isArray(spotConfig.emojis))DRAFT.spotConfig.emojis=spotConfig.emojis.slice();
}
function anyBlockDirty(){for(var k in blockDirty)if(blockDirty[k])return true;return false;}
function applyBlock(k){var d=BLOCK_DEFS[k];if(!d)return;d.apply();blockDirty[k]=false;}
function cancelBlock(k){var d=BLOCK_DEFS[k];if(!d)return;d.cancel();blockDirty[k]=false;syncSettingsUI();}
function defaultBlock(k){var d=BLOCK_DEFS[k];if(!d)return;d.def();blockDirty[k]=true;syncSettingsUI();}
function markDirtyFrom(el){ // 컨트롤이 속한 블록을 dirty로 + 미니 프리뷰 갱신
  var sec=el&&el.closest?el.closest('.settings-section[data-prev]'):null;
  if(sec)blockDirty[sec.dataset.prev]=true;
  updateApplyBar();updateBlockBars();renderMiniPreviews();
}
function updateApplyBar(){ // 상단 요약 바 (전체 일괄 조작)
  var bar=document.getElementById('settings-apply-bar');if(!bar)return;
  var dirty=anyBlockDirty();
  bar.classList.toggle('dirty',dirty);
  var msg=document.getElementById('sab-msg');if(msg)msg.textContent=dirty?'적용 안 된 블록 있음':'모든 변경 적용됨';
  var ap=document.getElementById('sab-apply'),rv=document.getElementById('sab-revert');
  if(ap)ap.style.display=dirty?'':'none';
  if(rv)rv.style.display=dirty?'':'none';
}
function updateBlockBars(){
  document.querySelectorAll('.settings-section[data-prev]').forEach(function(sec){
    var bar=sec.querySelector('.blk-actions');if(!bar)return;
    var dirty=!!blockDirty[sec.dataset.prev];
    bar.classList.toggle('dirty',dirty);
    bar.querySelector('.blk-state').textContent=dirty?'적용 안 됨':'';
    bar.querySelector('.blk-apply').style.display=dirty?'':'none';
    bar.querySelector('.blk-cancel').style.display=dirty?'':'none';
  });
}
function initBlockBars(){ // 각 옵션 블록 하단: [기본값][취소][적용]
  document.querySelectorAll('.settings-section[data-prev]').forEach(function(sec){
    if(sec.querySelector('.blk-actions'))return;
    var key=sec.dataset.prev;
    if(!BLOCK_DEFS[key])return; // 프리뷰 전용 섹션(spot-view 등)엔 버튼 없음
    var bar=document.createElement('div');bar.className='blk-actions';
    bar.innerHTML='<span class="blk-state"></span>'+
      '<button type="button" class="action-btn small blk-def" title="코드 기본값으로 (미리보기에만)">기본값</button>'+
      '<button type="button" class="action-btn small blk-cancel" style="display:none;" title="마지막 적용값으로 되돌리기">취소</button>'+
      '<button type="button" class="action-btn accent small blk-apply" style="display:none;" title="실제 지도와 모든 사용자에게 적용">적용</button>';
    bar.querySelector('.blk-def').addEventListener('click',function(){defaultBlock(key);updateApplyBar();updateBlockBars();renderMiniPreviews();});
    bar.querySelector('.blk-cancel').addEventListener('click',function(){cancelBlock(key);updateApplyBar();updateBlockBars();renderMiniPreviews();});
    bar.querySelector('.blk-apply').addEventListener('click',function(){applyBlock(key);cloudSave();updateApplyBar();updateBlockBars();});
    sec.appendChild(bar);
  });
}
function initApplyBar(){ // 상단 바: 전체 적용/전체 취소/전체 기본값
  var ap=document.getElementById('sab-apply'),rv=document.getElementById('sab-revert'),df=document.getElementById('sab-default');
  if(ap)ap.addEventListener('click',function(){Object.keys(BLOCK_DEFS).forEach(function(k){if(blockDirty[k])applyBlock(k);});cloudSave();updateApplyBar();updateBlockBars();});
  if(rv)rv.addEventListener('click',function(){Object.keys(BLOCK_DEFS).forEach(function(k){if(blockDirty[k])cancelBlock(k);});updateApplyBar();updateBlockBars();renderMiniPreviews();});
  if(df)df.addEventListener('click',function(){Object.keys(BLOCK_DEFS).forEach(defaultBlock);updateApplyBar();updateBlockBars();renderMiniPreviews();});
  updateApplyBar();
}
function markCloudDirty(){
  if(!fbDb||!currentUser||currentRole!=='admin')return;
  clearTimeout(cloudSaveTimer);cloudSaveTimer=setTimeout(cloudSave,1500);
}
function initSettingsExport(){ // 현재 적용 설정 → JSON 복사 (repo settings-default.json 백업용)
  var btn=document.getElementById('settings-export');if(!btn)return;
  btn.addEventListener('click',function(){
    var json=JSON.stringify(snapshotSettings(),null,1);
    function done(){btn.textContent='✅ 복사됨';setTimeout(function(){btn.textContent='📋 설정 JSON 복사';},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(json).then(done,function(){prompt('아래 JSON을 복사하세요',json);});
    else prompt('아래 JSON을 복사하세요',json);
  });
}
function cloudSave(){
  if(!fbDb||!currentUser||currentRole!=='admin')return;
  var snap=snapshotSettings(); // 라이브 설정 = 항상 '적용된' 값 (드래프트는 DRAFT에만 존재)
  var payload={updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.email||'',updatedSid:SESSION_SID,
    settings:{styleConfig:snap.styleConfig,hexStyleConfig:snap.hexStyleConfig,localLabelConfig:snap.localLabelConfig,zoneLabelConfig:snap.zoneLabelConfig,smoothEnabled:snap.smoothEnabled,smoothIntensity:snap.smoothIntensity,hexRadiusKm:snap.hexRadiusKm,zoneMergeBlocks:snap.zoneMergeBlocks},
    zones:trendZones.map(function(z){return {id:z.id,name:z.name,color:z.color,desc:z.desc||'',photo:z.photo||null,radiusKm:z.radiusKm,hexCenters:z.hexCenters,originalCenters:z.originalCenters,originalRadiusKm:z.originalRadiusKm};}),
    spots:adminSpots.map(function(s){return {id:s.id,lat:s.lat,lng:s.lng,text:s.text,emoji:s.emoji,color:s.color||null};}),
    spotConfig:snap.spotConfig,
    social:{rooms:socRoomList,seedLocal:socSeedLocal},
    zoneCardStyle:zoneCardStyle,feedTimeMode:feedTimeMode};
  fbDb.collection('shared').doc('mapContent').set(payload,{merge:true}).catch(function(e){console.warn('shared save fail',e);});
}

/* ========== 접근권한(allowlist) 관리 ========== */
function initAllowlistModal(){
  var modal=document.getElementById('allowlist-modal');if(!modal)return;
  document.getElementById('allowlist-close').addEventListener('click',function(){modal.style.display='none';});
  modal.addEventListener('click',function(e){if(e.target===modal)modal.style.display='none';});
  document.getElementById('al-add-btn').addEventListener('click',addAllowlistEntry);
  document.getElementById('al-email').addEventListener('keydown',function(e){if(e.key==='Enter')addAllowlistEntry();});
}
function openAllowlistManager(){var modal=document.getElementById('allowlist-modal');if(!modal)return;modal.style.display='flex';renderAllowlist();}
function renderAllowlist(){
  var list=document.getElementById('al-list');if(!list||!fbDb)return;
  list.innerHTML='<div class="al-empty">불러오는 중…</div>';
  fbDb.collection('allowlist').get().then(function(snap){
    list.innerHTML='';
    if(snap.empty){list.innerHTML='<div class="al-empty">등록된 유저가 없습니다.</div>';return;}
    snap.forEach(function(doc){
      var role=doc.data().role==='admin'?'admin':'user';
      var item=document.createElement('div');item.className='al-item';
      item.innerHTML='<span class="al-mail">'+escHtml(doc.id)+'</span><span class="al-tag '+role+'">'+(role==='admin'?'관리자':'데모유저')+'</span><button class="al-del" title="삭제">🗑️</button>';
      item.querySelector('.al-del').addEventListener('click',function(){fbDb.collection('allowlist').doc(doc.id).delete().then(renderAllowlist);});
      list.appendChild(item);
    });
  }).catch(function(e){list.innerHTML='<div class="al-empty">불러오기 실패: '+escHtml(e.message)+'</div>';});
}
function addAllowlistEntry(){
  var emailEl=document.getElementById('al-email'),roleEl=document.getElementById('al-role');
  var email=(emailEl.value||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){emailEl.focus();return;}
  fbDb.collection('allowlist').doc(email).set({role:roleEl.value,addedBy:currentUser?currentUser.email:'',addedAt:firebase.firestore.FieldValue.serverTimestamp()}).then(function(){emailEl.value='';renderAllowlist();}).catch(function(e){alert('추가 실패: '+e.message);});
}

/* ===================================================
   서비스 탭 (지도/피드/소셜) · 라이브 카메라 · 현장 Request · 소셜 채팅 · 기능 맵
   =================================================== */
var currentTab='map';
function focusedRegionName(){ // 현재 포커스 구역 (렌즈 동 / 선택·렌즈 존 / 센터)
  if(currentMode==='trend'){
    var zid=phoneSelectedZoneId||phoneLens.zoneId;
    if(zid){var z=trendZones.find(function(x){return x.id===zid;});if(z)return z.name;}
    var c=phoneMap&&phoneMap.getCenter();return c?(zoneAtCenter(c.lat(),c.lng())||''):'';
  }
  var c2=phoneMap?phoneVisibleCenter():null;return c2?(dongAt(c2.lat(),c2.lng())||''):'';
}
function layoutPhoneMap(){ // 지도는 본문(헤더 아래)에만 — 헤더/요약 뒤에 지도 없음
  var el=document.getElementById('phone-map');if(!el)return;
  var scr=el.closest('.phone-screen');var hd=scr?scr.querySelector('.phone-header'):null;
  var top=hd?hd.offsetHeight:0;
  if(el._mapTop===top)return;
  el._mapTop=top;el.style.top=top+'px';
  if(phoneMap&&typeof google!=='undefined'){ // 컨테이너 변화 시 센터 보존
    var c=phoneMap.getCenter();google.maps.event.trigger(phoneMap,'resize');if(c)phoneMap.setCenter(c);
  }
}
function layoutTabPages(){ // 헤더/네비 사이에 페이지 배치 (+ 헤더 아래 모드 필 만큼 상단 여백)
  layoutPhoneMap();
  var ins=phoneMapInsets();
  var scr=document.querySelector('#phone-mirror .phone-screen')||document.querySelector('.phone-screen');
  var hd=scr?scr.querySelector('.phone-header'):null, md=scr?scr.querySelector('.pa-mode'):null;
  var padTop=8;
  if(hd&&md){var hb=hd.getBoundingClientRect().bottom,mb=md.getBoundingClientRect().bottom;padTop=Math.max(8,Math.round(mb-hb)+8);}
  ['feed-page','social-page'].forEach(function(id){var el=document.getElementById(id);if(!el)return;
    el.style.top=(hd?hd.offsetHeight-2:0)+'px';el.style.paddingTop=padTop+'px';el.style.paddingBottom=(ins.bottom+12)+'px';}); // 하단 여백 = 네비 + 12px (입력바 기준)
}
function switchTab(tab){
  if(tab!=='map'&&tab!=='feed'&&tab!=='social')return;
  currentTab=tab;
  newsIndex=0;renderNews(); // 요약 공간: 탭 속성이 맞는 지면 이미지 표시 (3탭 동일 규격)
  var sc=document.getElementById('phone-scale');if(sc)sc.style.display=(tab==='map')?'':'none';
  var pm=document.querySelector('.pa-mode');if(pm)pm.style.display=(tab==='map')?'':'none';
  document.getElementById('feed-page').classList.toggle('open',tab==='feed');
  document.getElementById('social-page').classList.toggle('open',tab==='social');
  layoutTabPages();
  if(tab==='feed'){feedLimit=12;renderFeed();}
  if(tab==='social')renderSocial();
}
function focusNearbyZones(){ // 베이직→트렌드: 가까운 존 N개(관리자 설정, 기본 3)가 한눈에
  var n=Math.max(1,Math.min(6,Number(styleConfig.lens.switchZoomN)||3));
  var pool=trendZones.filter(function(z){return z.hexCenters&&z.hexCenters.length;});
  if(!pool.length)return;
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());if(!c)return;
  var lat=c.lat(),lng=c.lng();
  var ranked=pool.map(function(z){
    var ce=zoneCentroid(z);
    return {z:z,d:(ce.lat-lat)*(ce.lat-lat)+(ce.lng-lng)*(ce.lng-lng)};
  }).sort(function(a,b){return a.d-b.d;}).slice(0,n);
  var b=new google.maps.LatLngBounds();
  ranked.forEach(function(o){var gp=getHexGridParams(o.z.radiusKm);
    o.z.hexCenters.forEach(function(h){hexVertices(h.lng,h.lat,gp.R_lat,gp.R_lng).forEach(function(pt){b.extend(pt);});});});
  if(map&&map.getDiv().offsetWidth){map.fitBounds(b,60);}      // 데스크톱: 메인만(폰은 미러 동기)
  else if(phoneMap){phoneMap.fitBounds(b,phoneFitPadding());}  // 모바일: 폰 직접
}
function setNavActive(nav){document.querySelectorAll('#phone-mirror .pn-item').forEach(function(x){x.classList.toggle('active',x.dataset.nav===nav);});}

/* ========== AI Agent: 상황 맞춤 프리셋 + 모드별 아이콘 톤 (트렌드=불꽃) ========== */
var AI_PALETTE={local:{idle:['#cbd0d8','#cbd0d8'],on:['#8ed0ff','#a78bfa']},trend:{idle:['#ffb37a','#ff6a4d'],on:['#ffd24a','#ff3d2e']}};
var aiActiveOn=false;
function updateAiVisual(on){ // on 생략=마지막 상태 유지(모드 전환 시 재도색)
  if(typeof on==='boolean')aiActiveOn=on;
  var btn=document.querySelector('#phone-mirror .pn-ai');if(!btn)return;
  var pal=AI_PALETTE[currentMode==='trend'?'trend':'local'],c=aiActiveOn?pal.on:pal.idle;
  btn.classList.toggle('ai-on',aiActiveOn);
  btn.classList.toggle('ai-flame',currentMode==='trend');
  var stops=document.querySelectorAll('#aiBlob stop');
  if(stops[0]&&stops[1]){stops[0].setAttribute('stop-color',c[0]);stops[1].setAttribute('stop-color',c[1]);}
}
function aiPresetPool(){ // 질문 템플릿 풀(~50개, 모드/탭/위치/컨텐츠 상황 반영) — 패널에는 5개만 랜덤 노출
  var loc=focusedRegionName()||currentCenterDong()||'우리 동네';
  var h=new Date().getHours();
  var meal=(h>=6&&h<11)?'아침':(h>=11&&h<15)?'점심':(h>=15&&h<17)?'커피 한 잔':(h>=17&&h<21)?'저녁':'야식';
  var pool=[
    {q:'지금 '+loc+' 뭐가 핫해?',a:loc+'은(는) 지금 ❤️ 좋아요가 몰린 스팟 중심으로 활기가 올라오고 있어요. 피드 탭에서 인기 순으로 확인해 보세요!'},
    {q:meal+' 먹기 좋은 곳 추천해줘',a:'최근 피드 반응 기준으로 근처에서 '+meal+' 하기 좋은 곳을 골라봤어요. 지도에서 ❤️ 많은 썸네일 핀을 눌러보세요!'},
    {q:'사진 찍기 좋은 스팟 알려줘',a:loc+' 근처엔 골목 벽화와 카페 거리가 인생샷 스팟으로 꼽혀요. 📸 라이브 카메라로 바로 공유해 보세요!'},
    {q:'사람 많은 곳 피해서 산책하고 싶어',a:'좋아요 밀집이 낮은 조용한 골목길 위주로 안내해 드릴게요. 지도의 한산한 구역을 확인해 보세요.'},
    {q:'오늘 '+loc+' 소식 요약해줘',a:'오늘 '+loc+'에는 새 피드 컨텐츠와 스팟 메시지가 올라왔어요. 요약 지면과 피드 탭에서 한눈에 볼 수 있어요!'},
    {q:'주변 스팟 메시지 요약해줘',a:'주변 이웃들이 남긴 스팟 메시지를 모았어요. 메뉴 → 스팟 메시지에서 워드클라우드로 볼 수 있어요!'},
    {q:'우리 동네 새로 생긴 가게 있어?',a:'최근 피드에 새 가게 방문 인증이 올라오고 있어요. 최신순으로 정렬해 보여드릴게요!'},
    {q:'이번 주말에 갈 만한 곳 추천해줘',a:'주말 나들이로는 좋아요 상위 존과 공원 산책 코스를 추천해요. 트렌드 모드에서 뜨는 존을 확인해 보세요!'},
    {q:'지금 나가면 우산 필요할까?',a:'실시간 날씨 연동은 준비 중이에요. 곧 현장 유저의 실시간 답변으로 알려드릴게요! ☔'},
    {q:'동네 이웃들은 지금 무슨 얘기해?',a:'소셜 탭의 동네 채팅방이 활발해요. 맛집·산책 이야기가 가장 많아요. 지금 참여해 보세요!'},
    {q:'조용히 작업하기 좋은 카페 있어?',a:'좌석 여유가 있고 체류 피드가 긴 카페 위주로 골라봤어요. 콘센트 유무는 스팟 메시지에서 이웃들이 알려줘요!'},
    {q:'심야에 열려 있는 곳 알려줘',a:'이 시간대에도 라이브 피드가 올라오는 심야 영업 스팟을 모았어요. 지도에서 최근 핀을 확인해 보세요!'},
    {q:'반려견 산책 코스 추천해줘',a:'강아지 동반 피드가 많은 공원·천변 코스를 추천해요. 🐶 관련 스팟 메시지도 함께 볼 수 있어요!'},
    {q:'아이랑 갈 만한 곳 있어?',a:'가족 단위 방문 인증이 많은 키즈 친화 스팟을 골라봤어요. 주말 오전이 가장 여유로워요!'},
    {q:'러닝 코스 추천해줘',a:'러닝 크루가 자주 지나는 코스를 그려봤어요. 소셜 탭 러닝 크루 방에서 함께 뛸 이웃도 찾아보세요!'},
    {q:'지금 웨이팅 없는 맛집 알려줘',a:'현장 Request로 실시간 대기줄을 물어보는 게 가장 정확해요. 지도 롱프레스로 바로 질문할 수 있어요!'},
    {q:'데이트 코스 짜줘',a:'카페 → 산책 → 저녁 순으로 좋아요 상위 스팟을 이어봤어요. 트렌드 존 안에서 동선을 짜면 이동이 짧아요!'},
    {q:'혼밥하기 좋은 곳 추천해줘',a:'1인석 언급이 많은 스팟 메시지를 모아봤어요. 바 좌석이 있는 곳 위주로 추천해요!'},
    {q:'24시간 카페 있어?',a:'심야 라이브 피드가 꾸준히 올라오는 카페가 후보예요. 정확한 영업시간은 현장 Request로 확인해 보세요!'},
    {q:'요즘 리뷰 좋은 빵집 어디야?',a:'빵 사진 피드의 좋아요가 몰린 곳을 골랐어요. 오전에 빨리 품절되니 서두르세요! 🥐'},
    {q:'주차 편한 곳 알려줘',a:'주차 관련 스팟 메시지가 남겨진 위치를 모아봤어요. 현장 Request로 실시간 만차 여부도 물어볼 수 있어요!'},
    {q:'지하철역까지 빠른 길 알려줘',a:'현재 위치 기준 가장 가까운 역 방향을 지도에 표시할게요. 골목 지름길은 이웃 스팟 메시지를 참고하세요!'},
    {q:'지금 사람 제일 많은 곳 어디야?',a:'좋아요와 라이브 피드가 몰리는 구역이 가장 붐벼요. 트렌드 모드에서 뜨는 존으로 확인해 보세요!'},
    {q:'오늘 동네 이벤트 있어?',a:'요약 지면과 피드에 올라온 행사 소식을 모아봤어요. 놓치기 아까운 건 좋아요로 저장해 두세요!'},
    {q:'플리마켓 언제 열려?',a:'최근 플리마켓 피드가 올라온 위치와 요일 패턴을 정리해 봤어요. 주말 오후가 가장 활발해요!'},
    {q:'심심한데 뭐 하지?',a:'지금 좋아요가 오르는 스팟 셋을 골라봤어요 — 가까운 곳부터 가볍게 돌아보는 코스 어때요?'},
    {q:'비 오는 날 가기 좋은 곳 알려줘',a:'실내 스팟 위주로 골라봤어요. 통유리 카페에서 빗소리 감상도 인기 코스예요! ☔'},
    {q:'뷰 좋은 루프탑 알려줘',a:'노을 시간대 사진 피드가 많은 루프탑을 모았어요. 해 지기 30분 전 도착을 추천해요!'},
    {q:'브런치 맛집 추천해줘',a:'주말 오전 피드가 몰리는 브런치 스팟을 골라봤어요. 11시 전에 가면 웨이팅이 짧아요!'},
    {q:'야경 좋은 곳 어디야?',a:'밤 시간대 사진 피드의 좋아요 상위 지점을 모았어요. 📸 라이브 카메라로 함께 공유해 보세요!'},
    {q:'동네 운동 시설 어때?',a:'헬스장·필라테스 관련 스팟 메시지와 피드를 모아봤어요. 이웃들의 생생한 한 줄 평이 도움돼요!'},
    {q:'최근 좋아요 급상승 컨텐츠 보여줘',a:'최근 1시간 동안 ❤️가 빠르게 오른 피드를 모았어요. 피드 탭에서 인기순으로 확인해 보세요!'},
    {q:'내 주변 1km 요약해줘',a:'상단의 [🗺 현재 지도 요약하기]를 누르면 지금 보는 지역의 존·피드·스팟·Request 현황을 정리해 드려요!'},
    {q:'처음 온 동네인데 뭐부터 볼까?',a:'이 동네 좋아요 1위 스팟부터 시작하는 걸 추천해요. 드로어의 트렌드 존 리스트가 좋은 출발점이에요!'},
    {q:'로컬만 아는 숨은 명소 있어?',a:'관광 피드는 적지만 단골 스팟 메시지가 쌓인 곳들이 진짜 로컬 픽이에요. 지도를 줌인해서 찾아보세요!'},
    {q:'지금 열려 있는 약국 있어?',a:'심야 운영 정보는 현장 Request로 물어보는 게 정확해요. 근처 이웃이 실시간으로 답해줄 거예요!'},
    {q:'조용히 책 읽기 좋은 곳 알려줘',a:'체류형 피드가 길고 소음 언급이 없는 카페·도서관을 골라봤어요. 평일 오후가 가장 한적해요!'},
    {q:'단체 모임 장소 추천해줘',a:'단체석 언급이 있는 스팟 메시지를 모아봤어요. 예약 가능 여부는 현장 Request로 확인해 보세요!'},
    {q:'포장해 가기 좋은 맛집 알려줘',a:'포장 인증 피드가 많은 곳을 골라봤어요. 저녁 피크 전 주문하면 대기가 짧아요!'},
    {q:'여기 원래 뭐였던 곳이야?',a:'이 자리의 과거 피드 기록을 거슬러 올라가 봤어요. 동네의 변화가 피드 타임라인에 남아 있어요!'},
    {q:'전시나 팝업스토어 하는 곳 있어?',a:'최근 팝업 인증 피드가 올라온 위치를 모아봤어요. 기간 한정이 많으니 좋아요 눌러 저장해 두세요!'},
    {q:'피크닉 가기 좋은 곳 알려줘',a:'돗자리 피드가 많은 잔디밭·천변 명당을 골라봤어요. 오후엔 그늘 자리가 먼저 차니 참고하세요! 🧺'},
    {q:'자전거 타기 좋은 코스 알려줘',a:'라이딩 피드가 이어지는 코스를 그려봤어요. 자전거 대여소 위치는 스팟 메시지에서 확인할 수 있어요!'},
    {q:'스터디하기 좋은 공간 추천해줘',a:'스터디카페·도서관 관련 스팟 메시지를 모아봤어요. 좌석 현황은 현장 Request로 물어보면 실시간으로 알 수 있어요!'}
  ];
  if(currentMode==='trend'){
    trendZones.slice(0,3).forEach(function(z){
      pool.push({q:z.name+' 지금 가면 웨이팅 있을까?',a:z.name+'은(는) 지금 방문 인증이 이어지고 있어요. 현장 Request로 실시간 대기줄을 물어볼 수 있어요!'});
    });
    pool.push({q:'요즘 제일 뜨는 존은 어디야?',a:'존별 ❤️ 합산 기준 랭킹을 보여드릴게요. 드로어의 트렌드 존 리스트에서 하트 수를 비교해 보세요!'});
    pool.push({q:'이 존에서 꼭 해봐야 할 것은?',a:'이 존의 인기 피드와 스팟 메시지를 기반으로 추천 코스를 만들어 봤어요. 존을 탭하면 포커스됩니다!'});
    pool.push({q:'옆 존이랑 비교하면 어디가 더 핫해?',a:'존 리스트가 좋아요 순으로 정렬돼 있어요 — 맨 앞쪽 존이 지금 가장 뜨겁습니다!'});
  }else{
    pool.push({q:'지금 보고 있는 동네 분위기 어때?',a:loc+'은(는) 차분한 주택가 무드예요. 스팟 메시지에서 이웃들의 생생한 한 줄을 볼 수 있어요!'});
    pool.push({q:'옆 동네랑 비교하면 어디가 더 활발해?',a:'좋아요·피드 수 기준으로 보면 지금은 중심 상권 쪽 동이 더 활발해요. 트렌드 모드에서 존 단위로 볼 수 있어요!'},{q:'이 동네 좋아요 1위는 어디야?',a:'현재 보는 동에서 ❤️가 가장 많은 컨텐츠를 지도에 표시할게요. 썸네일 핀을 눌러보세요!'});
  }
  if(currentTab==='feed')pool.push({q:'좋아요 많은 사진만 모아서 보여줘',a:'피드를 ❤️ 인기순으로 모아봤어요. 더블탭하면 좋아요를 남길 수 있어요!'});
  if(currentTab==='social')pool.push({q:'요즘 채팅방 인기 주제가 뭐야?',a:'이번 주는 맛집 탐방과 러닝 크루 이야기가 가장 뜨거워요. 주제방에 참여해 보세요!'});
  if(typeof fieldRequests!=='undefined'&&fieldRequests.length){
    pool.push({q:'내 Request에 답변 왔는지 확인해줘',a:'드로어의 현장 Request에서 🙋 내 Request 카드를 열면 지금까지 도착한 답변을 모두 볼 수 있어요!'});
  }else{
    pool.push({q:'현장 Request는 어떻게 쓰는 거야?',a:'궁금한 위치를 롱프레스하거나 ＋ 메뉴에서 질문을 남기면, 근처 이웃이 10분 동안 실시간으로 답해줘요!'});
  }
  return pool;
}
function aiRandomPresets(n){
  var pool=aiPresetPool();
  for(var i=pool.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=pool[i];pool[i]=pool[j];pool[j]=t;}
  return pool.slice(0,n);
}
function aiMapSummary(){ // 🗺 현재 지도 요약: 보고 있는 지역의 실데이터 기반 브리핑
  var loc=focusedRegionName()||currentCenterDong()||'현재 지역';
  var modeName=currentMode==='trend'?'트렌드':'베이직';
  var zs=trendZones.length;
  var best=null,bh=0;trendZones.forEach(function(z){var h=zoneTotalHearts(z);if(h>bh){bh=h;best=z;}});
  var actReq=(typeof fieldRequests!=='undefined')?fieldRequests.filter(reqActive).length:0;
  var parts=[];
  if(zs)parts.push('트렌드 존 '+zs+'개'+(best?' (최고 인기 '+best.name+' ❤'+bh+')':''));
  parts.push('피드 '+feedItems.length+'장');
  parts.push('스팟 메시지 '+spotMessages.length+'개');
  if(actReq)parts.push('진행 중 Request '+actReq+'건');
  var tail=currentMode==='trend'
    ?(best?' 지금은 '+best.name+' 존이 가장 뜨거워요!':' 존을 탭하면 자세히 볼 수 있어요.')
    :' 트렌드 모드로 바꾸면 떠오르는 존을 볼 수 있어요.';
  return '🗺 '+loc+' · '+modeName+' 렌즈 — '+parts.join(' · ')+'.'+tail;
}
var AI_STOPWORDS=['알려줘','추천해줘','추천','어때','있어','없어','좋은','어디야','어디','뭐가','뭐지','뭐하지','지금','오늘','우리','어떻게','해줘','가기','타기','하는','곳']; // 범용어는 매칭 제외
function aiChatAnswer(q){ // 채팅 입력: 템플릿 풀에서 키워드 매칭(범용어 제외), 없으면 데모 안내
  var pool=aiPresetPool(),ql=q.toLowerCase(),best=null,score=0;
  pool.forEach(function(p){
    var s=0;
    p.q.replace(/[^\w가-힣\s]/g,'').split(/\s+/).forEach(function(t){
      if(t.length>1&&AI_STOPWORDS.indexOf(t)<0&&ql.indexOf(t.toLowerCase())>=0)s++;
    });
    if(s>score){score=s;best=p;}
  });
  if(best&&score>0)return best.a;
  return '"'+q+'" — 좋은 질문이에요! 지금은 지도 요약과 추천 질문에 먼저 답하는 데모 버전이에요. 실제 AI 연결은 준비 중입니다 🤖';
}
function initAiAgent(mirror){
  var aiBtn=mirror.querySelector('.pn-ai'),aiBub=document.getElementById('ai-bubble');
  var panel=document.getElementById('ai-presets'),list=document.getElementById('aip-list');
  var sumBtn=document.getElementById('aip-summary'),input=document.getElementById('aip-input'),send=document.getElementById('aip-send');
  if(!aiBtn||!aiBub)return;
  function hideAi(){aiBub.classList.remove('show');if(panel)panel.classList.remove('show');clearTimeout(aiBub._t);updateAiVisual(false);}
  function answer(text,ms){ // 패널 닫고 말풍선으로 응답
    if(panel)panel.classList.remove('show');
    aiBub.textContent='🤖 '+text;
    aiBub.classList.remove('show');void aiBub.offsetWidth;aiBub.classList.add('show');
    clearTimeout(aiBub._t);aiBub._t=setTimeout(hideAi,ms||7000);
  }
  aiBtn.addEventListener('click',function(e){e.stopPropagation();
    if((panel&&panel.classList.contains('show'))||aiBub.classList.contains('show')){hideAi();return;}
    if(panel&&list){
      list.innerHTML='';
      aiRandomPresets(5).forEach(function(p){ // 풀 ~50개 중 5개만 노출
        var b=document.createElement('button');b.type='button';b.className='aip-item';b.textContent=p.q;
        b.addEventListener('click',function(ev){ev.stopPropagation();answer(p.a);});
        list.appendChild(b);
      });
      if(input)input.value='';
      panel.classList.remove('show');void panel.offsetWidth;panel.classList.add('show');
    }
    aiBtn.classList.remove('spin');void aiBtn.offsetWidth;aiBtn.classList.add('spin');
    updateAiVisual(true);
  });
  if(sumBtn)sumBtn.addEventListener('click',function(e){e.stopPropagation();answer(aiMapSummary(),9000);});
  function submitChat(){var v=input?input.value.trim():'';if(!v)return;input.value='';answer(aiChatAnswer(v));}
  if(send)send.addEventListener('click',function(e){e.stopPropagation();submitChat();});
  if(input){
    input.addEventListener('click',function(e){e.stopPropagation();});
    input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();submitChat();}});
  }
  document.addEventListener('click',function(e){
    if(panel&&panel.classList.contains('show')&&!panel.contains(e.target))hideAi();
    else if(aiBub.classList.contains('show')&&aiActiveOn&&!aiBub.contains(e.target))hideAi();
  });
}

/* ========== 피드 탭: 그리드 + 포커스 구역 우선 ========== */
var feedItems=[]; var FEED_KEY='nowhere_feed';
var feedLikes={};try{feedLikes=JSON.parse(localStorage.getItem('nowhere_likes')||'{}')||{};}catch(e){}
function likeInfo(id){return feedLikes[id]||{n:0,me:0};}
function rebuildLikes(){ // liveFeed 문서의 likes 맵 → feedLikes{n,me}
  var uid=myUid();feedLikes={};
  feedItems.forEach(function(f){var lk=f.likes||{};feedLikes[f.id]={n:Object.keys(lk).length,me:lk[uid]?1:0};});
}
function feedAdd(src,region,zone,lat,lng,kind,desc){ // 피드 컨텐츠 추가 (라이브=공유 / 로컬=이 기기) — kind: 'cam'(라이브 카메라)|'post'(Feed 작성/업로드)
  var id='f_'+Date.now()+'_'+(feedSeq++);
  var doc={src:src,region:region||'',zone:zone||null,lat:(lat!=null?lat:null),lng:(lng!=null?lng:null),kind:kind||'post',desc:(desc||'').slice(0,120),name:chatName(),by:myUid(),byEmail:myEmail(),ts:Date.now(),likes:{}};
  if(hasLive()){fbDb.collection('liveFeed').doc(id).set(doc).catch(liveWriteErr);return;}
  doc.id=id;doc.type='photo';
  feedItems.unshift(doc);
  saveFeed();renderFeedColList();renderDrawerDemo();renderFeedMarkers();renderNews();if(currentTab==='feed')renderFeed();
}
function feedUpdate(f,fields){ // region/zone 편집
  for(var k in fields)f[k]=fields[k];
  if(hasLive())fbDb.collection('liveFeed').doc(f.id).set(fields,{merge:true});else saveFeed();
}
function feedDelete(id){
  if(hasLive()){fbDb.collection('liveFeed').doc(id).delete();return;}
  feedItems=feedItems.filter(function(f){return f.id!==id;});saveFeed();renderFeedColList();renderDrawerDemo();renderFeedMarkers();if(currentTab==='feed')renderFeed();
}
function toggleLike(id){ // 더블탭 좋아요 (계정당 1개 토글)
  if(hasLive()){
    var f=feedItems.filter(function(x){return x.id===id;})[0];if(!f)return likeInfo(id);
    var uid=myUid();f.likes=f.likes||{};
    var upd={};upd['likes.'+uid]=f.likes[uid]?firebase.firestore.FieldValue.delete():true;
    if(f.likes[uid])delete f.likes[uid];else f.likes[uid]=true;   // 낙관적 반영
    fbDb.collection('liveFeed').doc(id).update(upd).catch(function(e){console.warn('like',e);});
    rebuildLikes();return likeInfo(id);
  }
  var L=feedLikes[id]||(feedLikes[id]={n:0,me:0});
  if(L.me){L.me=0;L.n=Math.max(0,L.n-1);}else{L.me=1;L.n++;}
  try{localStorage.setItem('nowhere_likes',JSON.stringify(feedLikes));}catch(e){}
  return L;
}
var zoneCardStyle='glass'; // 'glass'=글래스 캡션 · 'list'=리스트(하트합산·거리)
try{var _zc=localStorage.getItem('nowhere_zonecard');if(_zc==='glass'||_zc==='list')zoneCardStyle=_zc;}catch(e){}
function haversineM(la1,ln1,la2,ln2){ // 직선거리(m)
  var R=6371000,d2r=Math.PI/180;
  var dla=(la2-la1)*d2r,dln=(ln2-ln1)*d2r;
  var a=Math.sin(dla/2)*Math.sin(dla/2)+Math.cos(la1*d2r)*Math.cos(la2*d2r)*Math.sin(dln/2)*Math.sin(dln/2);
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function zoneCentroid(zone){var sla=0,sln=0;zone.hexCenters.forEach(function(h){sla+=h.lat;sln+=h.lng;});var n=zone.hexCenters.length||1;return {lat:sla/n,lng:sln/n};}
function feedItemLatLng(f){ // 피드 사진 좌표: 저장 좌표 → 존 중심 → 동 중심 (구버전 폴백)
  if(f.lat!=null&&f.lng!=null)return {lat:f.lat,lng:f.lng};
  if(f.zone){var z=trendZones.find(function(x){return x.id===f.zone;});if(z&&z.hexCenters&&z.hexCenters.length)return zoneCentroid(z);}
  return regionCenterByName(f.region);
}
function feedZoneOf(it){ // 컨텐츠가 속한 트렌드존 (존 태그 우선, 없으면 좌표 판정)
  if(it.zone){var z=trendZones.find(function(x){return x.id===it.zone;});if(z)return z;}
  if(it.lat!=null&&it.lng!=null){
    for(var i=0;i<trendZones.length;i++){var tz=trendZones[i];
      if(tz.hexCenters&&tz.hexCenters.length&&ptInZone(tz,it.lat,it.lng))return tz;}
  }
  return null;
}
function ptInZone(zone,lat,lng){ // 좌표가 존 헥사 범위 안인지
  var gp=getHexGridParams(zone.radiusKm);
  for(var i=0;i<zone.hexCenters.length;i++){var hc=zone.hexCenters[i];
    if(Math.abs(hc.lat-lat)<gp.R_lat*1.15&&Math.abs(hc.lng-lng)<gp.R_lng*1.15)return true;}
  return false;
}
function zoneTotalHearts(zone){ // 존 컨텐츠(태깅 + 존에 속한 동 컨텐츠) 하트 합산
  var total=0;
  feedItems.forEach(function(f){
    var belongs=(f.zone===zone.id);
    if(!belongs){var rc=regionCenterByName(f.region);if(rc&&ptInZone(zone,rc.lat,rc.lng))belongs=true;} // 존에 속한 '동' 컨텐츠 포함
    if(belongs)total+=likeInfo(f.id).n;
  });
  return total;
}
function zoneDistLabel(zone){ // 현재 지도 센터 기준 직선거리 · 존 안이면 'Here'
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());if(!c)return '';
  var lat=c.lat(),lng=c.lng();
  if(ptInZone(zone,lat,lng))return 'Here';
  var ce=zoneCentroid(zone),d=haversineM(lat,lng,ce.lat,ce.lng);
  return d>=1000?(d/1000).toFixed(1)+' km':(Math.round(d/10)*10)+' m';
}
function zoneBestPhoto(zone){ // 존 썸네일 = 해당 존 태깅 사진 중 최다 좋아요 (없으면 존 photo)
  var best=null,bn=-1;
  feedItems.forEach(function(f){if(f.zone===zone.id){var n=likeInfo(f.id).n;if(n>bn){bn=n;best=f;}}});
  return best?best.src:(zone.photo||null);
}
function loadFeed(){try{var a=JSON.parse(localStorage.getItem(FEED_KEY)||'[]');if(Array.isArray(a))feedItems=a;}catch(e){}}
function saveFeed(){try{localStorage.setItem(FEED_KEY,JSON.stringify(feedItems.slice(0,40)));}catch(e){}}
function normRegion(t){return (t||'').replace(/[0-9\s]/g,'');}
function regionCenterByName(name){ // 동 이름 → 중심 좌표 (숫자 무시 매칭)
  if(!dongIndex||!name)return null;
  var nn=normRegion(name);
  for(var i=0;i<dongIndex.length;i++){
    var d=dongIndex[i];
    if(d.name===name||normRegion(d.name)===nn)return {lat:(d.bbox[1]+d.bbox[3])/2,lng:(d.bbox[0]+d.bbox[2])/2};
  }
  return null;
}
function allFeedEntries(){ // 라이브 사진 + 스팟 + 동네소식 → 포커스 구역 우선 정렬
  var arr=[];
  feedItems.forEach(function(f){var pc=feedItemLatLng(f);arr.push({id:f.id,type:'photo',src:f.src,region:f.region||'',zone:f.zone||null,kind:f.kind||'post',desc:f.desc||'',name:f.name||'',by:f.by||'',byEmail:f.byEmail||'',ts:f.ts||0,lat:pc?pc.lat:null,lng:pc?pc.lng:null});});
  newsItems.forEach(function(n){var rc=regionCenterByName(n.region);arr.push({id:n.id,type:'news',src:n.src,region:n.region||'',ts:0,lat:rc?rc.lat:null,lng:rc?rc.lng:null});});
  spotMessages.forEach(function(sp){var d=regionAt(sp.lat,sp.lng);arr.push({id:sp.id,type:'spot',text:sp.text,emoji:sp.emoji,color:sp.color,region:d?d.name:'',ts:0,lat:sp.lat,lng:sp.lng});});
  var foc=focusedRegionName(),nf=normRegion(foc);
  arr.forEach(function(it,i){
    var match=foc&&it.region&&(it.region===foc||normRegion(it.region)===nf);
    it._k=(match?0:1)*1e13+(it.ts?-it.ts:i); // 포커스 구역 먼저, 사진은 최신순
  });
  arr.sort(function(a,b){return a._k-b._k;});
  return arr;
}
var feedScope='local', feedLimit=12, feedTotal=0; // 보기 범위: all(거리+최신)/local(포커스 동네)/zone(근처 트렌드존)
try{var _fs=localStorage.getItem('nowhere_feedscope');if(_fs==='all'||_fs==='local'||_fs==='zone')feedScope=_fs;}catch(e){}
var feedTypes={post:true,cam:true,spot:true,news:true}; // view 옵션: 컨텐츠 종류 노출 필터
try{var _fty=JSON.parse(localStorage.getItem('nowhere_feedtypes')||'{}');Object.keys(feedTypes).forEach(function(k){if(typeof _fty[k]==='boolean')feedTypes[k]=_fty[k];});}catch(e){}
function feedTypeOf(it){return it.type==='photo'?(it.kind==='cam'?'cam':'post'):it.type;} // post/cam/spot/news
var feedTimeMode='ago'; // 올린 시간 표시: 'ago'(상대)/'clock'(시각)/'off'
try{var _ft=localStorage.getItem('nowhere_feedtime');if(_ft==='ago'||_ft==='clock'||_ft==='off')feedTimeMode=_ft;}catch(e){}
function timeAgo(ts){ // 지금으로부터 얼마 전
  if(!ts)return '';
  var s=Math.max(0,(Date.now()-ts)/1000);
  if(s<60)return '방금 전';
  if(s<3600)return Math.floor(s/60)+'분 전';
  if(s<86400)return Math.floor(s/3600)+'시간 전';
  if(s<604800)return Math.floor(s/86400)+'일 전';
  return fmtTime(ts);
}
function fmtTime(ts){ // 올린 시각 (M/D HH:mm)
  if(!ts)return '';
  var d=new Date(ts);
  function p(n){return (n<10?'0':'')+n;}
  return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function feedTimeLabel(ts){return feedTimeMode==='off'?'':(feedTimeMode==='clock'?fmtTime(ts):timeAgo(ts));}
function feedEntriesScoped(){
  var arr=allFeedEntries().filter(function(it){return feedTypes[feedTypeOf(it)]!==false;}); // 종류 필터(view 옵션)
  var c=phoneMap?phoneVisibleCenter():null,clat=c?c.lat():null,clng=c?c.lng():null;
  function d2(it){if(it.lat==null||clat==null)return 9e9;var dy=it.lat-clat,dx=it.lng-clng;return dy*dy+dx*dx;}
  if(feedScope==='local'){
    if(currentMode==='trend'){ // 트렌드: 포커스 존 기준 (존 태그 우선, 없으면 좌표로)
      var zid=phoneSelectedZoneId||phoneLens.zoneId;
      var zc=zid?trendZones.find(function(x){return x.id===zid;}):(clat!=null?zoneObjAtCenter(clat,clng):null);
      if(zc)arr=arr.filter(function(it){return it.zone===zc.id||(it.lat!=null&&ptInZone(zc,it.lat,it.lng));});
    }else{
      var foc=focusedRegionName(),nf=normRegion(foc);
      if(foc)arr=arr.filter(function(it){return it.region&&(it.region===foc||normRegion(it.region)===nf);});
    }
  }else if(feedScope==='zone'){
    var pool=trendZones.filter(function(z){return z.hexCenters&&z.hexCenters.length;});
    var near=pool.map(function(z){var ce=zoneCentroid(z);
      return {z:z,d:(clat==null)?0:(ce.lat-clat)*(ce.lat-clat)+(ce.lng-clng)*(ce.lng-clng)};
    }).sort(function(a,b){return a.d-b.d;}).slice(0,5).map(function(o){return o.z;});
    arr=arr.filter(function(it){
      if(it.zone)for(var j=0;j<near.length;j++)if(near[j].id===it.zone)return true; // 존 태깅 우선
      if(it.lat==null)return false;
      for(var i=0;i<near.length;i++)if(ptInZone(near[i],it.lat,it.lng))return true;
      return false;
    });
  }
  if(feedScope!=='local')arr.sort(function(a,b){var da=d2(a),db=d2(b);return da===db?((b.ts||0)-(a.ts||0)):(da-db);}); // 거리순+최신순
  return arr;
}
function renderFeed(){
  var g=document.getElementById('feed-grid');if(!g)return;g.innerHTML='';
  var arr=feedEntriesScoped();
  feedTotal=arr.length;
  if(!arr.length){
    var foc=focusedRegionName();
    var msg=feedScope==='zone'?'근처 트렌드 존에 공유된 컨텐츠가 아직 없어요.':(feedScope==='local'&&foc?escHtml(foc)+' 지역에 공유된 일상이 아직 없어요.<br>＋ 버튼으로 첫 소식을 올려보세요!':'아직 공유된 일상이 없어요.<br>＋ 버튼으로 첫 소식을 올려보세요!');
    g.innerHTML='<div class="feed-empty">'+msg+'</div>';return;
  }
  arr=arr.slice(0,feedLimit); // 스크롤 시 추가 로딩
  arr.forEach(function(it){
    var c=document.createElement('div');c.className='feed-card';
    if(it.src){var im=document.createElement('img');im.src=it.src;im.alt='';c.appendChild(im);}
    else{
      c.classList.add('txt');
      c.innerHTML='<span class="fc-emoji"></span><p class="fc-text"></p>';
      c.querySelector('.fc-emoji').textContent=it.emoji||'💬';
      c.querySelector('.fc-text').textContent=it.text||'(빈 메시지)';
      if(it.color)c.style.background=hexToRgba(it.color,0.12);
    }
    var tag=document.createElement('span');tag.className='fc-region';tag.textContent=it.region||'우리 동네';c.appendChild(tag);
    var top=document.createElement('span');top.className='fc-top';c.appendChild(top); // 좌상단 칩 줄: LIVE + 존
    if(it.kind==='cam'){var lv=document.createElement('span');lv.className='fc-live';lv.textContent='LIVE';top.appendChild(lv);} // 라이브 카메라로 올린 컨텐츠
    var fz=(feedScope==='zone')?feedZoneOf(it):null; // 존 칩은 Trend Zone 탭에서만 (그 외엔 하단 fc-region의 동 표시)
    if(fz){
      var zc=document.createElement('span');zc.className='fc-zonechip';zc.textContent=fz.name;
      zc.style.background=hexToRgba(fz.color||'#7b61ff',0.92);
      top.appendChild(zc);
    }
    var tr=document.createElement('span');tr.className='fc-tr';c.appendChild(tr); // 우상단: 본인 수정/삭제 + 시간
    var srcItem=(it.type==='photo')?feedItems.find(function(x){return x.id===it.id;}):null;
    var mine=srcItem&&(currentRole==='admin'||ownsContent(srcItem));
    if(mine){ // demo도 본인이 올린 컨텐츠는 수정·삭제 가능
      var ed=document.createElement('button');ed.type='button';ed.className='fc-act';ed.textContent='✏️';ed.title='설명글 수정';
      ed.addEventListener('click',function(e){e.stopPropagation();
        var v=prompt('설명글 수정 (120자)',srcItem.desc||'');
        if(v==null)return;
        feedUpdate(srcItem,{desc:v.trim().slice(0,120)});
        renderNews();renderFeedColList();if(currentTab==='feed')renderFeed();
      });
      var dl=document.createElement('button');dl.type='button';dl.className='fc-act';dl.textContent='🗑';dl.title='삭제';
      dl.addEventListener('click',function(e){e.stopPropagation();
        if(confirm('이 컨텐츠를 삭제할까요?'))feedDelete(srcItem.id);
      });
      tr.appendChild(ed);tr.appendChild(dl);
    }
    var tl=feedTimeLabel(it.ts); // 올린 시간 (상대/시각 옵션)
    if(tl){var tm=document.createElement('span');tm.className='fc-time';tm.textContent=tl;tr.appendChild(tm);}
    var L=likeInfo(it.id);
    var lk=document.createElement('span');lk.className='fc-like'+(L.me?' on':'');lk.textContent='♥ '+L.n;
    if(!L.n&&!L.me)lk.style.display='none';
    c.appendChild(lk);
    var lastTap=0,tapTimer=null;
    c.addEventListener('click',function(){ // 더블탭=좋아요 / 싱글탭=지도 탭에서 해당 위치 보기
      var now=Date.now();
      if(now-lastTap<340){
        if(tapTimer){clearTimeout(tapTimer);tapTimer=null;} // 싱글탭 액션 취소
        var R=toggleLike(it.id);
        lk.textContent='♥ '+R.n;lk.classList.toggle('on',!!R.me);
        lk.style.display=(R.n||R.me)?'':'none';
        if(R.me){var h=document.createElement('span');h.className='fc-heart';h.textContent='♥';c.appendChild(h);setTimeout(function(){h.remove();},1200);}
        renderDrawerDemo(); // 존 베스트 썸네일 갱신
        lastTap=0;return; // 토글 후 리셋 (연타 오작동 방지)
      }
      lastTap=now;
      tapTimer=setTimeout(function(){tapTimer=null;focusFeedEntry(it);},360); // 두 번째 탭 대기 후 이동
    });
    g.appendChild(c);
  });
}
function focusFeedEntry(it){ // 피드 컨텐츠 탭 → 지도 탭 전환 + 해당 위치로 이동
  if(it.type==='spot'){
    var sp=spotMessages.find(function(s){return s.id===it.id;});
    if(sp){setNavActive('map');switchTab('map');focusSpot(sp);}
    return;
  }
  if(it.lat==null||it.lng==null)return; // 위치 정보 없는 컨텐츠(구버전 지면 등)
  setNavActive('map');switchTab('map');
  if(map){map.panTo({lat:it.lat,lng:it.lng});if(map.getZoom()<15)map.setZoom(16);}
  if(phoneMap){phoneMap.panTo({lat:it.lat,lng:it.lng});if(phoneMap.getZoom()<15)phoneMap.setZoom(16);
    var ins=phoneMapInsets();phoneMap.panBy(0,-(ins.top-ins.bottom)/2);} // 헤더에 가리지 않게 (focusSpot과 동일)
}
/* 피드 그리드 열 수 (1=인스타그램식 전체폭) — 피드 상단·설정 양쪽에서 조절 */
var feedCols=2, feedGap=1.2; // 사진 간격(cqw)
try{var _fg=parseFloat(localStorage.getItem('nowhere_feedgap'));if(!isNaN(_fg))feedGap=_fg;}catch(e){}
function applyFeedGap(v){
  feedGap=Math.max(0,Math.min(4,parseFloat(v)));if(isNaN(feedGap))feedGap=1.2;
  try{localStorage.setItem('nowhere_feedgap',String(feedGap));}catch(e){}
  var g=document.getElementById('feed-grid');if(g)g.style.gap=feedGap+'cqw';
  var sel=document.getElementById('feed-gap');if(sel)sel.value=String(feedGap);
}
function applyFeedCols(n){
  feedCols=Math.max(1,Math.min(3,parseInt(n,10)||2)); // 가로 배열 최대 3칸
  try{localStorage.setItem('nowhere_feedcols',String(feedCols));}catch(e){}
  var g=document.getElementById('feed-grid');
  if(g){g.style.gridTemplateColumns='repeat('+feedCols+',1fr)';g.classList.toggle('one-col',feedCols===1);}
  var sel=document.getElementById('feed-cols');if(sel)sel.value=String(feedCols);
  document.querySelectorAll('#feed-view-pop .fvc').forEach(function(b){b.classList.toggle('active',b.dataset.c===String(feedCols));});
}
var toneCache={};
function sampleTone(src,cb){ // 이미지 우상단 평균 밝기 → true=밝음
  if(toneCache[src]!=null){cb(toneCache[src]);return;}
  var im=new Image();im.crossOrigin='anonymous';
  im.onload=function(){
    try{
      var cv=document.createElement('canvas');cv.width=8;cv.height=8;
      var cx=cv.getContext('2d');cx.drawImage(im,im.width*0.6,0,im.width*0.4,im.height*0.35,0,0,8,8);
      var dd=cx.getImageData(0,0,8,8).data,sum=0;
      for(var i=0;i<dd.length;i+=4)sum+=0.299*dd[i]+0.587*dd[i+1]+0.114*dd[i+2];
      toneCache[src]=(sum/(dd.length/4))>150;cb(toneCache[src]);
    }catch(e){toneCache[src]=false;cb(false);} // CORS 판독 불가 → 사진 가정=흰 아이콘
  };
  im.onerror=function(){toneCache[src]=true;cb(true);};
  im.src=src;
}
function updateFoldBtnTone(){ // 접기 아이콘: 뒤 컨텐츠 밝기에 따라 흑/백 자동
  var btn=document.getElementById('sum-collapse'),frame=document.getElementById('cp-frame');
  if(!btn||!frame)return;
  if(frame.classList.contains('folded')||!newsView.length){btn.classList.remove('lite');return;}
  var it=newsView[Math.min(newsIndex,newsView.length-1)];
  sampleTone(it.src,function(bright){btn.classList.toggle('lite',!bright);});
}
function initSummaryCollapse(){ // 요약 카드 접기: 컴팩트 카드(1/3 높이, 썸네일+텍스트)로 변형
  var frame=document.getElementById('cp-frame'),btn=document.getElementById('sum-collapse');
  if(!frame||!btn)return;
  function apply(fold){
    frame.classList.add('anim'); // 토글 순간에만 높이 트랜지션
    setTimeout(function(){frame.classList.remove('anim');},360);
    frame.classList.toggle('folded',fold);
    btn.classList.toggle('folded',fold);
    updateFoldBtnTone();
    btn.title=fold?'지면 펼치기':'지면 접기';
    try{localStorage.setItem('nowhere_sumfold',fold?'1':'0');}catch(e){}
    snapTrack();
    var t0=performance.now(); // 피드/소셜 페이지가 카드 높이 변화를 프레임 단위로 따라오게
    (function follow(){layoutTabPages();if(performance.now()-t0<340)requestAnimationFrame(follow);})();
    setTimeout(function(){ // 높이 트랜지션 종료 후 재계산
      snapTrack();layoutTabPages();
      if(typeof updatePhoneLens==='function')updatePhoneLens();
      if(typeof updatePhoneScale==='function')updatePhoneScale();
      if(typeof updatePhoneLocation==='function')updatePhoneLocation();
      if(typeof updatePhoneViewportOverlay==='function')updatePhoneViewportOverlay();
    },320);
  }
  btn.addEventListener('click',function(e){e.stopPropagation();apply(!frame.classList.contains('folded'));});
  var saved='0';try{saved=localStorage.getItem('nowhere_sumfold')||'0';}catch(e){}
  if(saved==='1')apply(true);
}
function initFeedTools(){
  try{var v=parseInt(localStorage.getItem('nowhere_feedcols'),10);if(v)feedCols=v;}catch(e){}
  var t=document.getElementById('feed-tools');
  if(t){
    t.innerHTML='';
    var sg=document.createElement('div');sg.className='fsc-group';
    [['all','전체보기'],['local','현재 동네'],['zone','Trend Zone']].forEach(function(o){
      var b=document.createElement('button');b.type='button';b.className='fsc';b.dataset.s=o[0];b.textContent=o[1];
      b.addEventListener('click',function(){
        feedScope=o[0];try{localStorage.setItem('nowhere_feedscope',feedScope);}catch(e){}
        feedLimit=12;
        t.querySelectorAll('.fsc').forEach(function(x){x.classList.toggle('active',x.dataset.s===feedScope);});
        renderFeed();
      });
      sg.appendChild(b);
    });
    t.appendChild(sg);
    // view 버튼 하나 → 팝오버(가로 배열 + 컨텐츠 종류 필터)
    var vw=document.createElement('div');vw.className='fview-wrap';
    var vb=document.createElement('button');vb.type='button';vb.id='feed-view-btn';vb.title='보기 옵션';
    vb.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/></svg>';
    var pop=document.createElement('div');pop.id='feed-view-pop';
    var lb1=document.createElement('div');lb1.className='fv-lb';lb1.textContent='가로 배열';pop.appendChild(lb1);
    var row1=document.createElement('div');row1.className='fv-row';
    [1,2,3].forEach(function(n){
      var b=document.createElement('button');b.type='button';b.className='fvc';b.dataset.c=String(n);b.textContent=n;
      b.addEventListener('click',function(){applyFeedCols(n);});
      row1.appendChild(b);
    });
    pop.appendChild(row1);
    var lb2=document.createElement('div');lb2.className='fv-lb';lb2.textContent='컨텐츠 종류';pop.appendChild(lb2);
    var row2=document.createElement('div');row2.className='fv-row';
    [['post','✍️ 피드 작성'],['cam','📸 라이브 카메라'],['spot','💬 스팟 메시지'],['news','📰 소식 지면']].forEach(function(o){
      var b=document.createElement('button');b.type='button';b.className='fvt';b.dataset.t=o[0];b.textContent=o[1];
      b.addEventListener('click',function(){
        feedTypes[o[0]]=!(feedTypes[o[0]]!==false);
        if(!Object.keys(feedTypes).some(function(k){return feedTypes[k];}))feedTypes[o[0]]=true; // 최소 1종은 유지
        try{localStorage.setItem('nowhere_feedtypes',JSON.stringify(feedTypes));}catch(e){}
        feedLimit=12;syncViewPop();renderFeed();
      });
      row2.appendChild(b);
    });
    pop.appendChild(row2);
    function syncViewPop(){
      pop.querySelectorAll('.fvc').forEach(function(b){b.classList.toggle('active',b.dataset.c===String(feedCols));});
      pop.querySelectorAll('.fvt').forEach(function(b){b.classList.toggle('active',feedTypes[b.dataset.t]!==false);});
    }
    vb.addEventListener('click',function(e){e.stopPropagation();pop.classList.toggle('open');syncViewPop();});
    document.addEventListener('click',function(e){if(!vw.contains(e.target))pop.classList.remove('open');});
    vw.appendChild(vb);vw.appendChild(pop);t.appendChild(vw);
    t.querySelectorAll('.fsc').forEach(function(x){x.classList.toggle('active',x.dataset.s===feedScope);});
  }
  var fp=document.getElementById('feed-page'); // 무한 로딩: 바닥 근처에서 다음 청크
  if(fp)fp.addEventListener('scroll',function(){
    if(currentTab!=='feed'||feedLimit>=feedTotal)return;
    if(this.scrollTop+this.clientHeight>=this.scrollHeight-160){feedLimit+=12;renderFeed();}
  });
  var sel=document.getElementById('feed-cols');
  if(sel)sel.addEventListener('change',function(){applyFeedCols(this.value);});
  var gsel=document.getElementById('feed-gap');
  if(gsel)gsel.addEventListener('change',function(){applyFeedGap(this.value);});
  var tsel=document.getElementById('feed-time'); // 올린 시간 표시 (상대/시각/숨김 — 클라우드 동기)
  if(tsel){tsel.value=feedTimeMode;tsel.addEventListener('change',function(){
    feedTimeMode=(this.value==='clock'||this.value==='off')?this.value:'ago';
    try{localStorage.setItem('nowhere_feedtime',feedTimeMode);}catch(e){}
    markCloudDirty();if(currentTab==='feed')renderFeed();
  });}
  applyFeedGap(feedGap);
  // 링크로 피드 이미지 추가 (관리자 · 요약 공간 지면과 동일 방식)
  var ub=document.getElementById('feed-url-btn'),ui=document.getElementById('feed-url-input');
  function addFeedUrl(){
    if(!ui)return;var url=(ui.value||'').trim();ui.value='';
    if(!/^https:\/\/\S+/i.test(url)){alert('https:// 로 시작하는 이미지 링크를 넣어주세요.');return;}
    var probe=new Image();
    probe.onload=function(){
      var ctr=(phoneMap&&phoneMap.getCenter())||(map&&map.getCenter());
      var zz=ctr?zoneObjAtCenter(ctr.lat(),ctr.lng()):null;
      feedAdd(url,currentCenterDong(),zz?zz.id:null,ctr?ctr.lat():null,ctr?ctr.lng():null,'post','');
    };
    probe.onerror=function(){alert('이 링크의 이미지를 불러올 수 없어요. 직접 이미지 주소인지 확인해 주세요.');};
    probe.src=url;
  }
  if(ub)ub.addEventListener('click',addFeedUrl);
  if(ui)ui.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();addFeedUrl();}});
  // 관리자 사이드바: 직접 사진 업로드 (라이브 카메라와 별개, 여러 장 가능)
  var fab=document.getElementById('feed-add-btn'),ffile=document.getElementById('feed-file');
  if(fab&&ffile){
    fab.addEventListener('click',function(){ffile.click();});
    ffile.addEventListener('change',function(){
      var arr=Array.prototype.slice.call(this.files||[]);this.value='';
      if(!arr.length)return;
      var pending=arr.length;
      arr.forEach(function(f){compressNews(f,function(url){
        if(url){
          var ctr=(phoneMap&&phoneMap.getCenter())||(map&&map.getCenter());
          var zz=ctr?zoneObjAtCenter(ctr.lat(),ctr.lng()):null;
          feedAdd(url,currentCenterDong(),zz?zz.id:null,ctr?ctr.lat():null,ctr?ctr.lng():null,'post','');
        }
        pending--;
      });});
    });
  }
  applyFeedCols(feedCols);
}
function initFeedPinch(){ // 핀치 줌으로 열 수 변경 (벌리면 크게=열 감소)
  var el=document.getElementById('feed-page');if(!el)return;
  var d0=0;
  function dist(e){var a=e.touches[0],b=e.touches[1];var dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.sqrt(dx*dx+dy*dy);}
  el.addEventListener('touchstart',function(e){if(e.touches.length===2)d0=dist(e);},{passive:true});
  el.addEventListener('touchmove',function(e){
    if(e.touches.length!==2||!d0)return;
    var r=dist(e)/d0;
    if(r>1.25){applyFeedCols(feedCols-1);d0=dist(e);}
    else if(r<0.8){applyFeedCols(feedCols+1);d0=dist(e);}
    if(e.cancelable)e.preventDefault();
  },{passive:false});
  el.addEventListener('touchend',function(e){if(e.touches.length<2)d0=0;},{passive:true});
}
function zoneRegionName(zoneId){ // 트렌드존이 속한 동 (존 중심 기준)
  var z=trendZones.find(function(x){return x.id===zoneId;});
  if(!z||!z.hexCenters.length)return '';
  var ce=zoneCentroid(z);
  return dongAt(ce.lat,ce.lng)||'';
}
function renderFeedColList(){ // 설정-컨텐츠: 피드 컨텐츠 관리
  var list=document.getElementById('feedcol-list');if(!list)return;
  list.innerHTML='';
  if(!feedItems.length){list.innerHTML='<p class="section-hint">아직 올린 피드 사진이 없어요. 위 버튼으로 추가해 보세요.</p>';return;}
  function refreshAfterEdit(){renderDrawerDemo();renderNews();renderFeedMarkers();if(currentTab==='feed')renderFeed();}
  feedItems.forEach(function(f,i){
    var row=document.createElement('div');row.className='news-item';
    var th=document.createElement('img');th.className='ni-thumb';th.src=f.src;
    var ks=document.createElement('select');ks.className='mini-select ni-kind'; // 컨텐츠 속성(종류)
    [['cam','📸 라이브 카메라'],['post','✍️ 피드 작성']].forEach(function(o){var op=document.createElement('option');op.value=o[0];op.textContent=o[1];ks.appendChild(op);});
    ks.value=(f.kind==='cam')?'cam':'post';
    ks.addEventListener('change',function(){feedUpdate(f,{kind:this.value});refreshAfterEdit();});
    var reg=document.createElement('input');reg.className='ni-region';reg.type='text';reg.placeholder='구역(동)';reg.value=f.region||'';
    reg.addEventListener('change',function(){feedUpdate(f,{region:this.value.trim()});refreshAfterEdit();});
    var zs=document.createElement('select');zs.className='mini-select ni-zone';
    var op0=document.createElement('option');op0.value='';op0.textContent='트렌드존 없음';zs.appendChild(op0);
    trendZones.forEach(function(z){var op=document.createElement('option');op.value=z.id;op.textContent=z.name;zs.appendChild(op);});
    zs.value=f.zone||'';
    zs.addEventListener('change',function(){
      var z=this.value||null, upd={zone:z};
      if(z){var rn=zoneRegionName(z);if(rn){upd.region=rn;reg.value=rn;}} // 존 선택 시 속한 동 자동 채움
      feedUpdate(f,upd);refreshAfterEdit();
    });
    var dsc=document.createElement('input');dsc.className='ni-region ni-desc';dsc.type='text';dsc.maxLength=120;dsc.placeholder='설명글';dsc.value=f.desc||'';
    dsc.addEventListener('change',function(){feedUpdate(f,{desc:this.value.trim()});refreshAfterEdit();});
    var meta=document.createElement('div');meta.className='ni-meta'; // 만든이 · 올린 시각 · 좋아요 (읽기 전용)
    meta.textContent='👤 '+(f.name||'-')+' · 🕒 '+(f.ts?fmtTime(f.ts):'-')+' · ♥ '+likeInfo(f.id).n;
    var fields=document.createElement('div');fields.className='ni-fields';
    var r1=document.createElement('div');r1.className='ni-row';r1.appendChild(ks);r1.appendChild(zs);
    var r2=document.createElement('div');r2.className='ni-row';r2.appendChild(reg);r2.appendChild(dsc);
    fields.appendChild(r1);fields.appendChild(r2);fields.appendChild(meta);
    var act=document.createElement('div');act.className='ni-actions';
    var del=document.createElement('button');del.type='button';del.textContent='🗑';
    del.addEventListener('click',function(){feedDelete(f.id);});
    act.appendChild(del);
    row.appendChild(th);row.appendChild(fields);row.appendChild(act);list.appendChild(row);
  });
}
/* Feed 작성: 갤러리 사진 + 설명글 → 피드 업로드 (kind:'post') */
function initFeedPost(){
  var fi=document.getElementById('feed-post-input');if(!fi)return;
  fi.addEventListener('change',function(){
    var arr=Array.prototype.slice.call(this.files||[]);this.value='';
    if(!arr.length)return;
    compressNews(arr[0],function(url){
      if(!url){alert('사진 처리에 실패했어요. 더 작은 사진으로 시도해 주세요.');return;}
      var desc=prompt('✍️ Feed 작성\n설명글을 입력하세요 (선택, 120자)');
      if(desc==null)return; // 취소 = 업로드 중단
      var ctr=(phoneMap&&phoneMap.getCenter())||(map&&map.getCenter());
      var zz=ctr?zoneObjAtCenter(ctr.lat(),ctr.lng()):null;
      feedAdd(url,currentCenterDong(),zz?zz.id:null,ctr?ctr.lat():null,ctr?ctr.lng():null,'post',desc.trim());
      setNavActive('feed');switchTab('feed');
    });
  });
}
/* 라이브 카메라: 찍으면 즉시 피드 업로드 (위치 태그 포함) */
function initLiveCamera(){
  var fi=document.getElementById('feed-photo-input');if(!fi)return;
  fi.addEventListener('change',function(){
    var arr=Array.prototype.slice.call(this.files||[]);this.value='';
    if(!arr.length)return;
    compressNews(arr[0],function(url){
      if(!url){alert('사진 처리에 실패했어요. 더 작은 사진으로 시도해 주세요.');return;}
      var ctr=(phoneMap&&phoneMap.getCenter())||(map&&map.getCenter());
      var zz=ctr?zoneObjAtCenter(ctr.lat(),ctr.lng()):null;
      feedAdd(url,currentCenterDong(),zz?zz.id:null,ctr?ctr.lat():null,ctr?ctr.lng():null,'cam','');
      setNavActive('feed');switchTab('feed'); // 바로 피드에서 확인
    });
  });
}

/* ========== 현장 Request: 원격 질문 → 현장 유저 퀵응답 알림 ========== */
var fieldRequests=[]; var REQ_KEY='nowhere_requests'; var reqMarkers=[]; var reqBubbleTimer=null;
var REQ_TTL_MS=10*60*1000; // 현장 Request 기본 타임아웃(10분) — 만료 시 지도/타인 목록에서 숨김·답변 차단
function isMyReq(rq){return !!rq.by&&rq.by===myUid();}
function reqActive(rq){return !!rq.seed||(Date.now()-(rq.ts||0)<REQ_TTL_MS);} // 시드=데모 연출용 상시 활성
/* Request 전용 맵 핀: 현장에 질문 신호를 쏘는 특성 — 펄스 링 + ? 티어드롭 (말풍선 없음, 스팟/피드 핀과 구분) */
function ReqPin(rq,m){this.rq=rq;this.position=new google.maps.LatLng(rq.lat,rq.lng);this.div=null;this.setMap(m);}
function initReqPinClass(){
  ReqPin.prototype=new google.maps.OverlayView();
  ReqPin.prototype.onAdd=function(){
    var d=document.createElement('div');d.className='req-pin';
    d.innerHTML='<span class="rp-ring"></span><span class="rp-ring r2"></span><span class="rp-drop"><i>?</i></span>';
    d.title=this.rq.place+' · 현장 Request';
    this.div=d;this.getPanes().overlayMouseTarget.appendChild(d);
  };
  ReqPin.prototype.draw=function(){var p=this.getProjection();if(!p)return;var pos=p.fromLatLngToDivPixel(this.position);if(this.div&&pos){this.div.style.left=pos.x+'px';this.div.style.top=pos.y+'px';}};
  ReqPin.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}
function loadRequests(){try{var a=JSON.parse(localStorage.getItem(REQ_KEY)||'[]');if(Array.isArray(a))fieldRequests=a;}catch(e){}}
function saveRequests(){try{localStorage.setItem(REQ_KEY,JSON.stringify(fieldRequests.slice(0,30)));}catch(e){}}
function openRequestComposer(){
  var m=addTargetMap||primaryMap();var ll=addAtLatLng||(m&&m.getCenter());
  closeAddMenu();
  if(!ll){alert('지도를 불러온 뒤 이용해 주세요.');return;}
  var q=prompt('📍 현장 Request\n이 위치의 무엇이 궁금하세요?\n(예: 파이브가이즈 대기줄 얼마나 되나요?)');
  if(q==null||!q.trim())return;
  var d=regionAt(ll.lat(),ll.lng());
  var rq={id:'rq_'+Date.now(),lat:ll.lat(),lng:ll.lng(),q:q.trim(),place:d?d.name:'지정 위치',answers:[],by:myUid(),ts:Date.now()};
  if(hasLive()){fbDb.collection('liveRequests').doc(rq.id).set({id:rq.id,lat:rq.lat,lng:rq.lng,q:rq.q,place:rq.place,answers:[],by:myUid(),ts:rq.ts}).catch(liveWriteErr);}
  else{fieldRequests.unshift(rq);saveRequests();renderRequestMarkers();}
  var ab=document.getElementById('ai-bubble'); // 수신 팝업은 타겟 지역의 '다른' 사용자에게만(실시간 리스너) — 요청자 본인에겐 안 띄움
  if(ab){ab.textContent='📍 Request 전송! 근처 현장 유저에게 알림이 갑니다. (10분간 답변 수신)';ab.classList.add('show');setTimeout(function(){ab.classList.remove('show');},2600);}
}
function showReqBubble(rq){ // AI Agent 수신 팝업: 질문 + 위치 + 응답 버튼 2개 (네비바와 같은 프로스트 톤)
  var b=document.getElementById('req-bubble');if(!b)return;
  document.getElementById('rq-place').textContent=rq.place;
  document.getElementById('rq-text').textContent='"'+rq.q+'"';
  var ac=document.getElementById('rq-actions');ac.innerHTML='';
  var cm=document.createElement('button');cm.type='button';cm.className='rq-btn primary';cm.textContent='💬 답하기';
  cm.addEventListener('click',function(){var t=prompt('현장 답변을 입력하세요\n"'+rq.q+'"');if(t&&t.trim())answerRequest(rq.id,t.trim());});
  var ph=document.createElement('button');ph.type='button';ph.className='rq-btn';ph.textContent='📷 사진 올리기';
  ph.addEventListener('click',function(){hideReqBubble();answerRequestPhoto(rq.id);});
  ac.appendChild(cm);ac.appendChild(ph);
  b.classList.add('show');
  clearTimeout(reqBubbleTimer);reqBubbleTimer=setTimeout(hideReqBubble,12000);
}
function reqNearMe(v){ // 타겟 지역 판정: 지금 보고 있는 위치 기준 1.5km 이내 또는 같은 동
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());if(!c)return false;
  if(haversineM(c.lat(),c.lng(),v.lat,v.lng)<=1500)return true;
  var mine=dongAt(c.lat(),c.lng()),theirs=dongAt(v.lat,v.lng);
  return !!(mine&&theirs&&mine===theirs);
}
function hideReqBubble(){var b=document.getElementById('req-bubble');if(b)b.classList.remove('show');clearTimeout(reqBubbleTimer);}
function answerRequest(id,text,img){ // img: 사진 답변(dataURL, 선택)
  var rq=fieldRequests.find(function(r){return r.id===id;});if(!rq)return;
  if(!reqActive(rq)){hideReqBubble();alert('⏱ 종료된 Request예요. (등록 후 10분까지만 답변을 받아요)');return;}
  var ans={t:text,ts:Date.now()};if(img)ans.img=img;
  if(hasLive()){fbDb.collection('liveRequests').doc(id).update({answers:firebase.firestore.FieldValue.arrayUnion(ans)}).catch(liveWriteErr);}
  else{rq.answers.push(ans);saveRequests();renderRequestMarkers();}
  hideReqBubble();
  var ab=document.getElementById('ai-bubble'); // 라이브=전송 확인(도착 알림은 요청자 기기에 실시간) / 폴백=도착 시뮬레이션
  if(ab){ab.textContent=hasLive()?'📍 답변 전송! 요청자에게 실시간으로 전달했어요.':'📍 '+rq.place+' 현장 답변 도착: '+(img?'📷 ':'')+text;ab.classList.add('show');setTimeout(function(){ab.classList.remove('show');},5000);}
}
function deleteRequest(id){ // 본인·관리자만 (드로어 카드 🗑)
  if(!confirm('이 Request를 삭제할까요?'))return;
  if(hasLive()){fbDb.collection('liveRequests').doc(id).delete().catch(liveWriteErr);}
  else{fieldRequests=fieldRequests.filter(function(r){return r.id!==id;});saveRequests();renderRequestMarkers();}
}
var rqPhotoTarget=null; // 사진 답변 대상 request id
function answerRequestPhoto(id){
  rqPhotoTarget=id;
  var fi=document.getElementById('rq-photo-input');if(fi)fi.click();
}
function initRequestAnswer(){
  var fi=document.getElementById('rq-photo-input');if(!fi)return;
  fi.addEventListener('change',function(){
    var f=(this.files||[])[0];this.value='';
    var id=rqPhotoTarget;rqPhotoTarget=null;
    if(!f||!id)return;
    compressNews(f,function(url){
      if(!url){alert('사진 처리에 실패했어요. 더 작은 사진으로 시도해 주세요.');return;}
      answerRequest(id,'📷 현장 사진',url);
      renderDrawerDemo();
    });
  });
}
function renderRequestMarkers(){
  reqMarkers.forEach(function(o){o.setMap(null);});reqMarkers=[];
  if(!phoneMap||typeof google==='undefined')return;
  if(typeof renderDrawerDemo==='function')renderDrawerDemo();
  fieldRequests.filter(reqActive).forEach(function(rq){ // 활성(10분 내·시드)만 표시, 전용 핀(답변 내용 노출 안 함)
    reqMarkers.push(new ReqPin(rq,phoneMap));
  });
}

/* ========== 소셜 탭: 동네 채팅 · 주제방 · 프라이빗(크레딧) ========== */
var socTab='local', socRoom=null, socMsgs={}, socSeedLocal=[], socLiveMsgs={};
var socRoomList=[{name:'🍜 맛집 탐방',type:'topic'},{name:'🏃 러닝 크루',type:'topic'},{name:'🐶 댕댕이 산책',type:'topic'},{name:'👶 육아 정보',type:'topic'}];
var SOC_KEY='nowhere_chat';
function loadChat(){try{var o=JSON.parse(localStorage.getItem(SOC_KEY)||'{}');if(o.msgs)socMsgs=o.msgs;if(Array.isArray(o.rooms))socRoomList=o.rooms;if(Array.isArray(o.seedLocal))socSeedLocal=o.seedLocal;}catch(e){}}
function saveChat(){try{localStorage.setItem(SOC_KEY,JSON.stringify({msgs:socMsgs,rooms:socRoomList,seedLocal:socSeedLocal}));}catch(e){}}
function seedFor(room){ // 방 기본 대화(연출용, 저장 안 함)
  if(room.key.indexOf('local:')===0&&socSeedLocal.length)return socSeedLocal.slice(); // 관리자 시드
  var base=room.name.replace(/^[^\s]+\s/,'');
  return [{who:'동네주민',t:'오늘 날씨 좋네요 ☀️'},{who:'로컬러버',t:base+' 근처 맛집 추천 받아요!'}];
}
function seedMsgs(room){socMsgs[room.key]=seedFor(room);return socMsgs[room.key];} // 로컬 폴백 전용
function roomMsgs(room){ // 렌더용: 라이브=시드(연출)+공유 메시지 / 폴백=이 기기 저장분
  if(hasLive())return seedFor(room).concat(socLiveMsgs[room.key]||[]);
  return socMsgs[room.key]||seedMsgs(room);
}
function chatName(){return currentUser?(currentUser.displayName||String(currentUser.email||'').split('@')[0]||'이웃'):'이웃';}
function renderSocial(){
  var nmLoc=focusedRegionName();
  var lt=document.querySelector('.soc-tab[data-soc="local"]');
  if(lt)lt.textContent=(nmLoc?nmLoc+' 채팅방':'동네 채팅방'); // 서브탭 = 현 위치명 + 채팅방 (아이콘 없음)
  document.querySelectorAll('.soc-tab').forEach(function(t){t.classList.toggle('active',t.dataset.soc===socTab);});
  var body=document.getElementById('soc-body'),bar=document.getElementById('soc-inputbar');
  if(!body)return;
  if(socTab==='local')socRoom={key:'local:'+(nmLoc||'동네'),name:(nmLoc?nmLoc+' 채팅방':'동네 채팅방')};
  if(socRoom&&socRoom.key.indexOf(socTab+':')===0){renderChatRoom(body,socRoom);bar.style.display='flex';}
  else{renderRoomList(body);bar.style.display='none';}
}
function renderRoomList(body){
  body.innerHTML='';
  var wrap=document.createElement('div');wrap.className='soc-roomlist';
  var type=(socTab==='topic')?'topic':'private';
  var list=socRoomList.filter(function(r){return r.type===type;});
  list.forEach(function(r){
    var b=document.createElement('button');b.type='button';b.className='soc-room';
    var cnt=hasLive()?((socLiveMsgs[type+':'+r.name]||[]).length):((socMsgs[type+':'+r.name]||[]).length);
    b.innerHTML='<span class="sr-name"></span><span class="sr-cnt"></span>';
    b.querySelector('.sr-name').textContent=(type==='private'?'🔒 ':'')+r.name;
    b.querySelector('.sr-cnt').textContent=cnt?cnt+'개 대화':'새 방';
    b.addEventListener('click',function(){socRoom={key:type+':'+r.name,name:r.name};renderSocial();});
    wrap.appendChild(b);
  });
  if(!list.length){var e=document.createElement('div');e.className='soc-empty';e.textContent=(type==='topic'?'주제방이 없어요.':'프라이빗 방이 없어요.')+' (관리자가 설정에서 개설)';wrap.appendChild(e);}
  body.appendChild(wrap);
}
function renderChatRoom(body,room){
  body.innerHTML='';
  var head=document.createElement('div');head.className='soc-chathead';
  if(socTab!=='local'){
    var back=document.createElement('button');back.type='button';back.className='soc-back';back.textContent='‹';
    back.addEventListener('click',function(){socRoom=null;renderSocial();});
    head.appendChild(back);
  }
  var ttl=document.createElement('span');ttl.className='soc-title';ttl.textContent=room.name;head.appendChild(ttl);
  body.appendChild(head);
  var listEl=document.createElement('div');listEl.className='soc-msgs';
  roomMsgs(room).forEach(function(m){
    var r=document.createElement('div');r.className='soc-msg'+(m.me?' me':'');
    r.innerHTML='<span class="sm-who"></span><span class="sm-bubble"></span>';
    r.querySelector('.sm-who').textContent=m.me?'':(m.who||'이웃');
    r.querySelector('.sm-bubble').textContent=m.t;
    listEl.appendChild(r);
  });
  body.appendChild(listEl);
  listEl.scrollTop=listEl.scrollHeight;
}
function initSocial(){
  loadChat();
  document.querySelectorAll('.soc-tab').forEach(function(t){
    t.addEventListener('click',function(){socTab=this.dataset.soc;if(socTab!=='local')socRoom=null;renderSocial();});
  });
  function send(){
    var inp=document.getElementById('soc-input');var t=(inp.value||'').trim();
    if(!t||!socRoom)return;inp.value='';
    if(hasLive()){ // 계정 간 실시간 공유 (스냅샷 로컬 에코가 즉시 그려줌 — 데모 자동응답 없음)
      fbDb.collection('liveChat').doc('c_'+Date.now()+'_'+Math.random().toString(36).slice(2,6))
        .set({room:socRoom.key,t:t,by:myUid(),name:chatName(),ts:Date.now()}).catch(liveWriteErr);
      return;
    }
    (socMsgs[socRoom.key]=socMsgs[socRoom.key]||[]).push({me:true,t:t});saveChat();renderSocial();
    setTimeout(function(){ // 데모 응답 (로컬 폴백 전용)
      (socMsgs[socRoom.key]=socMsgs[socRoom.key]||[]).push({who:'이웃',t:'오 반가워요! 👋'});saveChat();
      if(currentTab==='social')renderSocial();
    },1600);
  }
  var sb=document.getElementById('soc-send');if(sb)sb.addEventListener('click',send);
  var si=document.getElementById('soc-input');if(si)si.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();send();}});
}


/* ========== 소셜 컨텐츠 관리 (설정-컨텐츠: 방 개설/타입/삭제 · 동네 채팅 시드) ========== */
function renderRoomManager(){
  var list=document.getElementById('room-list');if(!list)return;
  list.innerHTML='';
  if(!socRoomList.length){list.innerHTML='<p class="section-hint">개설된 방이 없어요.</p>';return;}
  socRoomList.forEach(function(r,i){
    var row=document.createElement('div');row.className='room-item';
    row.innerHTML='<span class="ri-name"></span><select class="mini-select ri-type"><option value="topic">주제방</option><option value="private">프라이빗</option></select><button class="ri-del" type="button" title="삭제">🗑</button>';
    row.querySelector('.ri-name').textContent=r.name;
    var sel=row.querySelector('.ri-type');sel.value=r.type;
    sel.addEventListener('change',function(){r.type=this.value;saveChat();markCloudDirty();renderRoomManager();});
    row.querySelector('.ri-del').addEventListener('click',function(){socRoomList.splice(i,1);saveChat();markCloudDirty();renderRoomManager();});
    list.appendChild(row);
  });
}
function parseChatSeed(text){ // JSON [{who,t}] 또는 CSV "닉,내용" 줄들
  text=(text||'').trim();
  try{
    var j=JSON.parse(text);
    if(Array.isArray(j))return j.map(function(m){return {who:String(m.who||(m[0]!=null?m[0]:'이웃')),t:String(m.t||m.msg||(m[1]!=null?m[1]:''))};}).filter(function(m){return m.t;});
  }catch(e){}
  return text.split(/\r?\n/).map(function(l){
    var i=l.indexOf(',');if(i<0)return null;
    return {who:l.slice(0,i).trim()||'이웃',t:l.slice(i+1).trim()};
  }).filter(function(m){return m&&m.t;});
}
function initSocialManager(){
  var add=document.getElementById('room-add');
  if(add)add.addEventListener('click',function(){
    var nm=document.getElementById('room-name'),tp=document.getElementById('room-type');
    var n=(nm.value||'').trim();if(!n)return;nm.value='';
    socRoomList.push({name:n,type:tp.value});saveChat();markCloudDirty();renderRoomManager();
  });
  var fillBtn=document.getElementById('chat-fill'),file=document.getElementById('chat-file'),clr=document.getElementById('chat-clear');
  if(fillBtn&&file){
    fillBtn.addEventListener('click',function(){file.click();});
    file.addEventListener('change',function(){
      var f=(this.files||[])[0];this.value='';if(!f)return;
      var r=new FileReader();
      r.onload=function(e){
        var msgs=parseChatSeed(e.target.result);
        if(!msgs.length){alert('형식을 읽지 못했어요.\nJSON: [{"who":"닉","t":"내용"}]  또는  CSV: 닉,내용 (줄바꿈 구분)');return;}
        socSeedLocal=msgs;
        Object.keys(socMsgs).forEach(function(k){if(k.indexOf('local:')===0)delete socMsgs[k];}); // 새 시드가 보이게 초기화
        saveChat();markCloudDirty();
        alert('동네 채팅 기본 대화 '+msgs.length+'개를 채웠어요.');
        if(currentTab==='social')renderSocial();
      };
      r.readAsText(f);
    });
  }
  if(clr)clr.addEventListener('click',function(){
    if(!confirm('동네 채팅의 시드와 대화 내용을 모두 비울까요?'))return;
    socSeedLocal=[];
    Object.keys(socMsgs).forEach(function(k){if(k.indexOf('local:')===0)delete socMsgs[k];});
    if(hasLive()){ // 공유(liveChat)된 동네 채팅 메시지도 삭제
      Object.keys(socLiveMsgs).forEach(function(k){
        if(k.indexOf('local:')!==0)return;
        (socLiveMsgs[k]||[]).forEach(function(m){if(m.id)fbDb.collection('liveChat').doc(m.id).delete().catch(function(e){console.warn('chat clear',e);});});
      });
    }
    saveChat();markCloudDirty();
    if(currentTab==='social')renderSocial();
  });
  renderRoomManager();
}

/* ========== 데모 시드 데이터 (관리자: 채우기/비우기 · 강남-역삼-논현) ========== */
// 생성 이미지: 일관 디자인(그라디언트+이모지+라벨 칩). 교체 = 존 카드 편집/피드 관리에서 URL 입력.
var SEED_PAL={food:['#ff9a6b','#ff5e7e','🍜'],cafe:['#e8c39e','#a9764f','☕'],run:['#7ee0b0','#2f9d6f','🏃'],
  night:['#9b8cff','#5b4bd6','🌙'],shop:['#7cc0ff','#2f7bff','🛍️'],park:['#b8e986','#56ab2f','🌳'],
  pet:['#ffd36b','#ff9f43','🐶'],art:['#f6a6ff','#b06ab3','🎨'],gym:['#8fd3f4','#4a90d9','💪'],book:['#d4b8ff','#7b61ff','📚']};
function seedImg(theme,label){
  var p=SEED_PAL[theme]||SEED_PAL.cafe;
  var chip=label?'<rect x="40" y="512" rx="28" ry="28" width="'+(label.length*34+64)+'" height="60" fill="rgba(0,0,0,0.30)"/>'
    +'<text x="72" y="554" font-size="34" font-family="sans-serif" font-weight="700" fill="#fff">'+label+'</text>':'';
  var svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">'
    +'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+p[0]+'"/><stop offset="1" stop-color="'+p[1]+'"/></linearGradient></defs>'
    +'<rect width="640" height="640" fill="url(#g)"/>'
    +'<circle cx="520" cy="110" r="150" fill="rgba(255,255,255,0.14)"/><circle cx="110" cy="560" r="200" fill="rgba(255,255,255,0.10)"/>'
    +'<text x="320" y="392" font-size="210" text-anchor="middle">'+p[2]+'</text>'+chip+'</svg>';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
// 실사진: Wikimedia Commons 직링크(핫링크 허용·영구 보존, 브라우저 로드 검증 완료 2026-07-06)
var SEED_IMG={
 gopchang:'https://upload.wikimedia.org/wikipedia/commons/f/f3/Gopchang_3.jpg',
 kfood8:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Dongdaemon-korean-food-8.jpg/960px-Dongdaemon-korean-food-8.jpg',
 kfood9:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Dongdaemun-korean-food-9.jpg/960px-Dongdaemun-korean-food-9.jpg',
 noodle:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Korean.noodle-Kalguksu-01.jpg/960px-Korean.noodle-Kalguksu-01.jpg',
 latte:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Soymilk_caffe_latte_art_flickr_user_avlxyz.jpg/960px-Soymilk_caffe_latte_art_flickr_user_avlxyz.jpg',
 latteHeart:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Latte_art_heart_Garden_Caff%C3%A9_Portugal_20190118.jpg/960px-Latte_art_heart_Garden_Caff%C3%A9_Portugal_20190118.jpg',
 cafeInt:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Cafe_s%C3%A1ch%2C_%C4%91%E1%BA%A1i_h%E1%BB%8Dc_Sungkyunkwan.jpeg/960px-Cafe_s%C3%A1ch%2C_%C4%91%E1%BA%A1i_h%E1%BB%8Dc_Sungkyunkwan.jpeg',
 espresso:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Espresso_cup_and_saucer%2C_2011.jpg/960px-Espresso_cup_and_saucer%2C_2011.jpg',
 parkPath:'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Seoulforest_path01.jpg/960px-Seoulforest_path01.jpg',
 parkMay:'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Seoul_Forest_in_May_2022_%281%29.jpg/960px-Seoul_Forest_in_May_2022_%281%29.jpg',
 dog:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Dog_Park_Fun_-_15343944411.jpg/960px-Dog_Park_Fun_-_15343944411.jpg',
 pojang:'https://upload.wikimedia.org/wikipedia/commons/2/2d/Korea-Pojangmacha-01.jpg',
 gangnam:'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Gangnam_Station_Bus_Stop.jpg/960px-Gangnam_Station_Bus_Stop.jpg',
 gym:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Attractive_man_lifting_dumbbell_weight_for_exercise_in_fitness_gym.jpg/960px-Attractive_man_lifting_dumbbell_weight_for_exercise_in_fitness_gym.jpg',
 book:'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Used_bookstore_in_Jinb%C5%8Dch%C5%8D_002.jpg/960px-Used_bookstore_in_Jinb%C5%8Dch%C5%8D_002.jpg',
 brunch:'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/French_toast_variaton_in_Guatemala.jpg/960px-French_toast_variaton_in_Guatemala.jpg',
 cheesecake:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Cheesecake_with_slice_cut_out.jpg/960px-Cheesecake_with_slice_cut_out.jpg',
 seokchonLake:'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Seokchon_Lake_Park.jpg/960px-Seokchon_Lake_Park.jpg',
 cherry:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Seokchon_Lake_Cherry_Blossoms_2020.jpg/960px-Seokchon_Lake_Cherry_Blossoms_2020.jpg',
 flea3:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Dongmyo_Flea_Market_03.jpg/960px-Dongmyo_Flea_Market_03.jpg',
 flea7:'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Dongmyo_Flea_Market_07.jpg/960px-Dongmyo_Flea_Market_07.jpg',
 rooftop:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Seoul_Skyline_Night_2018.jpg/960px-Seoul_Skyline_Night_2018.jpg',
 garosu:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Garosu-gil_at_night.jpg/960px-Garosu-gil_at_night.jpg',
 gwangjang:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Korean_pancakes_and_pan-fried_foods_at_Gwangjang_Market.jpg/960px-Korean_pancakes_and_pan-fried_foods_at_Gwangjang_Market.jpg'};
var SEED_OWNER='shoomerion@gmail.com'; // 시드 콘텐츠 소유자 — 이 계정으로 로그인하면 수정·이동·삭제 가능
// 시드 좌표: 역삼1·역삼2·논현1·논현2 일대에 골고루 분산(같은 성격만 근접 허용 — 밀집 시 지도 클러스터가 묶어줌)
var SEED_FEED=[
 {theme:'food',img:'gopchang',label:'수요미식회 그 집',desc:'웨이팅 40분인데 후회 없음. 곱창은 진리',kind:'cam',region:'역삼1동',zone:null,lat:37.4983,lng:127.0301,likes:14,h:2,name:'퇴근길미식가'},
 {theme:'food',img:'kfood8',label:'점심 특선',desc:'강남 직장인 점심 1만원 이하 몇 없는 집',kind:'post',region:'역삼1동',zone:null,lat:37.4996,lng:127.0338,likes:9,h:5,name:'강남11년차'},
 {theme:'cafe',img:'latte',label:'골목 안 로스터리',desc:'원두 직접 볶는 집. 라떼아트 미쳤다',kind:'cam',region:'역삼1동',zone:null,lat:37.5021,lng:127.0330,likes:12,h:3,name:'카페투어러'},
 {theme:'cafe',img:'cafeInt',label:'창가 자리 맛집',desc:'노트북 작업하기 좋아요. 콘센트 넉넉',kind:'post',region:'역삼1동',zone:null,lat:37.4972,lng:127.0322,likes:7,h:8,name:'프리랜서J'},
 {theme:'park',img:'parkPath',label:'아침 러닝',desc:'오늘 학동공원 5km 완주. 공기 최고',kind:'cam',region:'논현1동',zone:null,lat:37.5148,lng:127.0296,likes:11,h:1,name:'러닝크루장'},
 {theme:'pet',img:'dog',label:'댕댕이 산책',desc:'공원에서 만난 리트리버. 순둥이 그 자체',kind:'cam',region:'논현1동',zone:null,lat:37.5122,lng:127.0272,likes:16,h:4,name:'산책하는댕댕이'},
 {theme:'night',img:'pojang',label:'심야 포차',desc:'새벽 2시에도 자리 없는 그 포차',kind:'cam',region:'논현1동',zone:null,lat:37.5100,lng:127.0224,likes:8,h:26,name:'야식원정대'},
 {theme:'shop',img:'gangnam',label:'팝업 오픈',desc:'신논현 팝업스토어 오늘 오픈! 줄 김',kind:'cam',region:'논현1동',zone:null,lat:37.5052,lng:127.0243,likes:10,h:6,name:'트렌드헌터'},
 {theme:'gym',img:'gym',label:'새벽 운동',desc:'오운완. 6시 헬스장은 평화롭다',kind:'post',region:'역삼1동',zone:null,lat:37.4990,lng:127.0367,likes:5,h:7,name:'갓생살기'},
 {theme:'book',img:'book',label:'동네 책방',desc:'논현동에 이런 독립서점이 있었다니',kind:'post',region:'논현1동',zone:null,lat:37.5135,lng:127.0248,likes:6,h:30,name:'책읽는밤'},
 {theme:'food',img:'brunch',label:'브런치 신상',desc:'주말 브런치 신상 오픈. 프렌치토스트 추천',kind:'post',region:'논현2동',zone:null,lat:37.5168,lng:127.0350,likes:9,h:20,name:'주말미식'},
 {theme:'cafe',img:'cheesecake',label:'디저트 맛집',desc:'치즈케이크 마감 전에 가세요',kind:'cam',region:'역삼2동',zone:null,lat:37.4972,lng:127.0450,likes:13,h:9,name:'디저트지도'},
 {theme:'art',img:null,label:'골목 벽화',desc:'출근길에 발견한 새 벽화. 사진각',kind:'cam',region:'역삼2동',zone:null,lat:37.4950,lng:127.0413,likes:4,h:11,name:'골목산책자'},
 {theme:'run',img:'seokchonLake',label:'퇴근 러닝',desc:'호수 한 바퀴 야간 러닝 함께해요 (매주 화)',kind:'post',region:'역삼1동',zone:null,lat:37.5028,lng:127.0392,likes:7,h:28,name:'러닝크루장'},
 {theme:'shop',img:'flea3',label:'플리마켓',desc:'이번 주말 학동공원 플리마켓 열려요',kind:'post',region:'논현1동',zone:null,lat:37.5142,lng:127.0302,likes:8,h:14,name:'동네소식통'},
 {theme:'night',img:'rooftop',label:'루프탑',desc:'강남 야경 루프탑. 예약 필수',kind:'cam',region:'역삼1동',zone:null,lat:37.5008,lng:127.0284,likes:15,h:50,name:'야경수집가'},
 {theme:'food',img:'noodle',label:'칼국수 맛집',desc:'점심 칼국수 오픈런 성공. 육수가 예술',kind:'cam',region:'역삼1동',zone:null,lat:37.4959,lng:127.0345,likes:6,h:4,name:'점심원정대'},
 {theme:'cafe',img:'espresso',label:'에스프레소 바',desc:'서서 마시는 에바. 2잔이 국룰입니다',kind:'post',region:'역삼1동',zone:null,lat:37.5013,lng:127.0354,likes:10,h:12,name:'카페투어러'},
 {theme:'food',img:'kfood9',label:'전집 발견',desc:'비 오는 날 전+막걸리 조합 아시죠',kind:'cam',region:'논현1동',zone:null,lat:37.5088,lng:127.0263,likes:12,h:16,name:'막걸리동호회'},
 {theme:'park',img:'cherry',label:'벚꽃 스팟',desc:'벚꽃 마지막 주라는데 오늘이 절정',kind:'cam',region:'논현1동',zone:null,lat:37.5133,lng:127.0310,likes:18,h:3,name:'꽃놀이객'}];
var SEED_SPOTS=[
 {t:'점심 웨이팅 30분 각오하세요',emoji:'🍜',lat:37.4990,lng:127.0302,color:'#ff5e7e'},
 {t:'여기 커피 인생템',emoji:'☕',lat:37.5019,lng:127.0341,color:'#a9764f'},
 {t:'러닝 같이 하실 분!',emoji:'🏃',lat:37.5144,lng:127.0290,color:'#2f9d6f'},
 {t:'분위기 미쳤다',emoji:'🌙',lat:37.5094,lng:127.0234},
 {t:'팝업 줄 서는 중',emoji:'🛍️',lat:37.5056,lng:127.0250,color:'#2f7bff'},
 {t:'벚꽃 아직 있어요',emoji:'🌸',lat:37.5137,lng:127.0316,color:'#f78fb3'},
 {t:'주차 자리 없음 주의',emoji:'🚗',lat:37.4978,lng:127.0353},
 {t:'저녁 6시 이후 골목 정체',emoji:'⚠️',lat:37.4990,lng:127.0316},
 {t:'고양이 카페 발견',emoji:'🐱',lat:37.5112,lng:127.0255,color:'#ff9f43'},
 {t:'독서모임 매주 목요일',emoji:'📚',lat:37.5128,lng:127.0243,color:'#7b61ff'},
 {t:'헬스장 새벽이 한산',emoji:'💪',lat:37.4999,lng:127.0378},
 {t:'바스크 치즈케이크 강추',emoji:'🍰',lat:37.4968,lng:127.0441,color:'#e0245e'},
 {t:'칼국수 오픈런 성공',emoji:'🍲',lat:37.4966,lng:127.0355,color:'#ff5e7e'},
 {t:'라떼아트 클래스 모집 중',emoji:'🎨',lat:37.5006,lng:127.0327,color:'#a9764f'},
 {t:'벚꽃 포토스팟은 여기',emoji:'📸',lat:37.5155,lng:127.0299,color:'#f78fb3'},
 {t:'불금 번개 8시 어떠세요',emoji:'🍻',lat:37.5001,lng:127.0290}];
var SEED_REQS=[
 {q:'파이브가이즈 지금 웨이팅 얼마나 되나요?',lat:37.5060,lng:127.0272,place:'논현1동',answers:[{t:'지금 한 20분 정도예요! 회전 빨라요'}]},
 {q:'학동공원 벚꽃 아직 볼만한가요?',lat:37.5147,lng:127.0301,place:'논현1동',answers:[]}];
var SEED_CHAT_LOCAL=[{who:'역삼동주민',t:'오늘 미세먼지 좋네요 ☀️'},{who:'퇴근길미식가',t:'역 근처 새로 생긴 쌀국수집 가보신 분?'},{who:'카페투어러',t:'가봤어요! 국물 진하고 좋던데요 👍'},{who:'동네소식통',t:'이번 주말 학동공원 플리마켓 열린대요'}];
var SEED_CHAT_DOCS=[
 {room:'local:역삼1동',name:'역삼동주민',t:'역삼동 채팅방 개설 기념 인사 드려요 🙌',h:30},
 {room:'local:역삼1동',name:'갓생살기',t:'다들 점심 어디서 드세요? 추천 좀',h:6},
 {room:'topic:🍜 맛집 탐방',name:'퇴근길미식가',t:'이번 주 미션: 강남 곱창 최강자 찾기',h:24},
 {room:'topic:🍜 맛집 탐방',name:'주말미식',t:'저는 먹자골목 안쪽 그 집에 한 표',h:22},
 {room:'topic:🏃 러닝 크루',name:'러닝크루장',t:'화요일 저녁 테헤란로 러닝 모집합니다!',h:20}];
var SEED_NEWS=[
 {id:'ns_1',theme:'food',img:'gwangjang',label:'이번 주 동네 맛집',title:'강남 먹자골목 웨이팅 리포트',region:'역삼1동',tab:'map'},
 {id:'ns_2',theme:'park',img:'flea7',label:'주말 플리마켓',title:'학동공원 플리마켓 토·일 열려요',region:'논현1동',tab:'map'},
 {id:'ns_3',theme:'cafe',img:'latteHeart',label:'추천 카페 5',title:'역삼 카페로드 신상 5곳 모음',region:'역삼1동',tab:'feed'}];
function seedDemoData(){
  if(currentRole!=='admin'){alert('관리자만 실행할 수 있어요.');return;}
  if(!confirm('강남·역삼·논현 데모 데이터를 채울까요?\n(피드 20 · 스팟 16 · Request 2 · 채팅 시드 — 공유 컬렉션에 기록되어 모든 계정에 보여요.\n트렌드 존은 만들지 않아요. 컨텐츠 소유자: '+SEED_OWNER+')'))return;
  var now=Date.now();
  // ① 트렌드 존 시드는 만들지 않음(기존 tzs_* 존은 🧹 비우기로 삭제) — 존은 관리자가 직접 관리
  // ② 요약 지면 (관리자 수동 이미지와 동일 구조)
  SEED_NEWS.forEach(function(n){
    if(newsItems.some(function(x){return x.id===n.id;}))return;
    newsItems.push({id:n.id,src:(n.img?SEED_IMG[n.img]:seedImg(n.theme,n.label)),region:n.region,tab:n.tab,title:n.title});
  });
  saveNews();renderNews();
  // ③ 피드 / 스팟 / Request / 채팅 (라이브=공유, 폴백=로컬)
  SEED_FEED.forEach(function(f,i){
    var likes={};for(var j=0;j<f.likes;j++)likes['seed_l'+j]=true;
    var doc={src:(f.img?SEED_IMG[f.img]:seedImg(f.theme,f.label)),region:f.region,zone:f.zone,lat:f.lat,lng:f.lng,kind:f.kind,desc:f.desc,name:f.name,by:'seed_u'+i,byEmail:SEED_OWNER,ts:now-f.h*3600e3,likes:likes,seed:true};
    if(hasLive())fbDb.collection('liveFeed').doc('fs_'+i).set(doc).catch(liveWriteErr);
    else{doc.id='fs_'+i;doc.type='photo';if(!feedItems.some(function(x){return x.id===doc.id;}))feedItems.push(doc);}
  });
  SEED_SPOTS.forEach(function(s,i){
    var doc={id:'sps_'+i,lat:s.lat,lng:s.lng,text:s.t,emoji:s.emoji,color:s.color||null,by:'seed_u'+i,byEmail:SEED_OWNER,ts:now-i*3600e3,seed:true};
    if(hasLive())fbDb.collection('liveSpots').doc(doc.id).set(doc).catch(liveWriteErr);
    else if(!demoSpots.some(function(x){return x.id===doc.id;})){doc.live=true;demoSpots.push(doc);}
  });
  SEED_REQS.forEach(function(r,i){
    var doc={id:'rqs_'+i,lat:r.lat,lng:r.lng,q:r.q,place:r.place,answers:r.answers.map(function(a){return {t:a.t,ts:now-3600e3};}),by:'seed_u'+i,ts:now-2*3600e3,seed:true};
    if(hasLive())fbDb.collection('liveRequests').doc(doc.id).set(doc).catch(liveWriteErr);
    else if(!fieldRequests.some(function(x){return x.id===doc.id;}))fieldRequests.unshift(doc);
  });
  SEED_CHAT_DOCS.forEach(function(c,i){
    if(hasLive())fbDb.collection('liveChat').doc('cs_'+i).set({room:c.room,t:c.t,by:'seed_u'+i,name:c.name,ts:now-c.h*3600e3,seed:true}).catch(liveWriteErr);
  });
  socSeedLocal=SEED_CHAT_LOCAL.slice();saveChat();
  if(!hasLive()){saveFeed();saveLocalSpots();saveRequests();rebuildSpots();renderFeedColList();renderFeedMarkers();renderRequestMarkers();renderDrawerDemo();if(currentTab==='feed')renderFeed();}
  markCloudDirty(); // 존·소셜 시드 → 공유문서 저장
  alert('🌱 데모 데이터를 채웠어요. 지도를 강남·역삼 쪽으로 이동해 확인해 보세요.');
}
function clearDemoData(){
  if(currentRole!=='admin'){alert('관리자만 실행할 수 있어요.');return;}
  if(!confirm('시드로 넣은 데모 데이터만 지울까요? (직접 만든 컨텐츠는 유지)'))return;
  var removed=trendZones.filter(function(z){return /^tzs_/.test(z.id);});
  removed.forEach(function(z){removeZoneFromMap(z);});
  trendZones=trendZones.filter(function(z){return !/^tzs_/.test(z.id);});
  if(currentMode==='trend'){showAllZonesOnMap();generateHexagons();}
  renderZoneList();
  newsItems=newsItems.filter(function(n){return !/^ns_/.test(n.id);});saveNews();renderNews();
  if(hasLive()){
    ['liveFeed','liveSpots','liveRequests','liveChat'].forEach(function(col){
      fbDb.collection(col).where('seed','==',true).get().then(function(snap){snap.forEach(function(d){d.ref.delete();});}).catch(function(e){console.warn('seed clear',col,e);});
    });
  }else{
    feedItems=feedItems.filter(function(f){return !/^fs_/.test(f.id);});saveFeed();
    demoSpots=demoSpots.filter(function(s){return !/^sps_/.test(s.id);});saveLocalSpots();
    fieldRequests=fieldRequests.filter(function(r){return !/^rqs_/.test(r.id);});saveRequests();
    rebuildSpots();renderFeedColList();renderFeedMarkers();renderRequestMarkers();renderDrawerDemo();if(currentTab==='feed')renderFeed();
  }
  socSeedLocal=[];Object.keys(socMsgs).forEach(function(k){if(k.indexOf('local:')===0)delete socMsgs[k];});saveChat();
  markCloudDirty();
  alert('🧹 시드 데이터를 비웠어요.');
}
function initDemoSeed(){
  var f=document.getElementById('seed-fill');if(f)f.addEventListener('click',seedDemoData);
  var c=document.getElementById('seed-clear');if(c)c.addEventListener('click',clearDemoData);
}

/* ========== 기능 맵 (기능 관리 페이지) ========== */
var FEATURES=[
 {id:'mode',icon:'🗺️',name:'베이직/트렌드 모드',st:'live',grp:'코어',desc:'같은 지도·같은 컨텐츠를 "구획 단위"만 바꿔 보는 두 렌즈 — 베이직=행정동, 트렌드=관리자 선정 존. 위치명·렌즈·피드 필터·동네 채팅방이 모드에 따라 동↔존으로 함께 전환되고, 존 밖에서는 동 이름으로 폴백(모드 간 연결). 트렌드 전환 시 근접 존 N개 자동 뷰.',rel:['lens','zone','feed','social','sum']},
 {id:'lens',icon:'🔍',name:'포커스 렌즈',st:'live',grp:'코어',desc:'보는 구역(동/존)만 선명하게, 주변은 안개 — 두 모드가 하나의 렌즈 엔진 공유. 축척 자동 발동 + 지역 선택 시 핀 고정·맵 조정. 렌즈 밖 스팟은 옅게, 동네소식은 해당 동으로 슬라이드.',rel:['mode','spot','news'],prev:'lens'},
 {id:'zone',icon:'⬡',name:'트렌드 존',st:'live',grp:'코어',desc:'헥사곤 묶음으로 관리자가 지정하는 핫플 구역. 사진·설명 카드(🖼️ 편집), 썸네일=태깅 사진 중 최다 하트, 하트 합산=존 태깅+존에 속한 동 컨텐츠.',rel:['mode','feed','like'],prev:'trendzone'},
 {id:'sum',icon:'🗞️',name:'요약 공간',st:'live',grp:'코어',desc:'상단 카드 지면 — 베이직=동네소식 카드(3버전·컴팩트 접기), 트렌드=존 리스트(사이드바와 동일 카드). 탭별 이미지 분리.',rel:['map','news','zone']},
 {id:'ai',icon:'🤖',name:'AI Agent',st:'plan',grp:'코어',desc:'우하단 에이전트. 동네 질문 응답과 현장 Request 알림 채널.',rel:['req']},
 {id:'spot',icon:'💬',name:'스팟 메시지',st:'live',grp:'컨텐츠',desc:'지도 위 말풍선 일상 공유 — 관리자+유저 모두 작성, 유저 스팟은 계정 간 실시간 공유(liveSpots). 본인이 올린 스팟은 데모도 길게 눌러(터치) 이동·수정·삭제 가능. 드로어=현재 지역 워드 클라우드. 렌즈 포커스 밖은 옅게.',rel:['lens','feed'],prev:'spot'},
 {id:'cam',icon:'📸',name:'라이브 카메라',st:'live',grp:'컨텐츠',desc:'찍으면 바로 피드 업로드(실시간 공유) — 현 위치의 동+트렌드존 자동 태깅. 관리자는 사이드바에서 업로드/링크로도 추가.',rel:['feed','like']},
 {id:'like',icon:'❤️',name:'좋아요',st:'live',grp:'컨텐츠',desc:'피드 더블탭 하트 — 계정당 1개, 실시간 합산. 존 하트 합산·베스트 썸네일의 원천 데이터.',rel:['feed','zone']},
 {id:'req',icon:'📍',name:'현장 Request',st:'live',grp:'컨텐츠',desc:'원격 질문 등록(10분 타임아웃) → 타겟 지역(1.5km/같은 동) 사용자에게 AI Agent 실시간 응답 팝업(💬 답하기·📷 사진, 요청자 제외). 요청자는 도착 알림+드로어 내 Request에서 답변 확인.',rel:['map','ai']},
 {id:'news',icon:'📰',name:'요약 지면 이미지',st:'live',grp:'컨텐츠',desc:'관리자 UI 목업 지면(탭별) — 제목·위치 카드, 보는 동과 태그가 맞으면 자동 슬라이드.',rel:['lens','sum']},
 {id:'map',icon:'🧭',name:'지도 탭',st:'live',grp:'서비스 탭',desc:'지도 기반 컨텐츠 노출 — 스팟·Request 마커, 포커스 렌즈, 요약 공간.',rel:['sum','spot','req']},
 {id:'feed',icon:'🖼️',name:'피드 탭',st:'live',grp:'서비스 탭',desc:'그리드 피드(1:1) — view 버튼으로 가로 배열(1~3)과 컨텐츠 종류(피드 작성/라이브/스팟/지면) 필터, 핀치·간격 옵션. 컨텐츠 속성: 종류·만든이·위치·존·설명·좋아요·올린시간. 범위 필터가 모드를 따라감. 지도 썸네일 핀은 근접 시 클러스터(개수 뱃지)로 묶이고 탭/줌인 시 펼쳐짐, 만든이·관리자는 길게 눌러 이동(동/존 자동 재태깅). 지역 컨텐츠 지면에 연관 피드 자동 노출(스팟 제외).',rel:['cam','like','mode','sum']},
 {id:'social',icon:'👥',name:'소셜 탭',st:'live',grp:'서비스 탭',desc:'동네 채팅방(이름=현 위치 동/존) · 주제방/프라이빗(관리자 개설·전체 공유) · JSON/CSV 시드. 메시지 계정 간 실시간 공유(liveChat).',rel:['mode']}
];
function openFeaturePage(){
  var pg=document.getElementById('feature-page'),body=document.getElementById('feature-body');
  if(!pg||!body)return;
  body.innerHTML='';
  var grps=[];FEATURES.forEach(function(f){if(grps.indexOf(f.grp)<0)grps.push(f.grp);});
  grps.forEach(function(g){
    var h=document.createElement('div');h.className='ft-grp';h.textContent=g;body.appendChild(h);
    FEATURES.filter(function(f){return f.grp===g;}).forEach(function(f){
      var c=document.createElement('div');c.className='ft-card';c.id='ftc-'+f.id;
      c.innerHTML='<div class="ft-head"><span class="ft-ic"></span><span class="ft-name"></span><span class="ft-st"></span></div><p class="ft-desc"></p><div class="ft-rel"></div>';
      c.querySelector('.ft-ic').textContent=f.icon;
      c.querySelector('.ft-name').textContent=f.name;
      var st=c.querySelector('.ft-st');st.textContent=(f.st==='live'?'구현':(f.st==='demo'?'데모':'예정'));st.classList.add(f.st);
      c.querySelector('.ft-desc').textContent=f.desc;
      var rel=c.querySelector('.ft-rel');
      (f.rel||[]).forEach(function(rid){
        var rf=null;for(var i=0;i<FEATURES.length;i++)if(FEATURES[i].id===rid)rf=FEATURES[i];
        if(!rf)return;
        var chip=document.createElement('button');chip.type='button';chip.className='ft-chip';chip.textContent='↔ '+rf.name;
        chip.addEventListener('click',function(){
          var t=document.getElementById('ftc-'+rid);
          if(t){t.scrollIntoView({block:'center'});t.classList.add('flash');setTimeout(function(){t.classList.remove('flash');},900);}
        });
        rel.appendChild(chip);
      });
      if(f.prev&&currentRole==='admin'){ // 관리자: 해당 설정 블록으로 점프
        var go=document.createElement('button');go.type='button';go.className='action-btn accent small ft-go';go.textContent='⚙ 설정';
        go.addEventListener('click',function(){jumpToSetting(f.prev);});
        c.querySelector('.ft-head').appendChild(go);
      }
      body.appendChild(c);
    });
  });
  pg.style.display='flex';
}
function jumpToSetting(prevKey){
  document.getElementById('feature-page').style.display='none';
  var d=document.getElementById('phone-drawer'),pc=document.getElementById('pc-drawer');
  if(!(d&&d.classList.contains('open'))&&!(pc&&pc.classList.contains('open'))){
    if(window.matchMedia('(max-width:768px)').matches)openPhoneDrawer();else openPcDrawer();
  }
  var ss=document.getElementById('settings-section'),st=document.getElementById('settings-toggle');
  if(ss&&ss.style.display==='none'){ss.style.display='';if(st)st.classList.add('open');}
  var sec=document.querySelector('#settings-section .settings-section[data-prev="'+prevKey+'"]');
  if(sec){
    var group=sec.closest('#settings-section');
    if(group)group.querySelectorAll('.acc-section').forEach(function(x){if(x!==sec)x.classList.add('collapsed');});
    sec.classList.remove('collapsed');
    setTimeout(function(){sec.scrollIntoView({block:'start'});sec.classList.add('flash');setTimeout(function(){sec.classList.remove('flash');},1200);},120);
  }
}
function initFeaturePage(){
  var cl=document.getElementById('feature-close');
  if(cl)cl.addEventListener('click',function(){document.getElementById('feature-page').style.display='none';});
  var pg=document.getElementById('feature-page');
  if(pg)pg.addEventListener('click',function(e){if(e.target===pg)pg.style.display='none';});
}

/* ========== 웹앱 설치 유도 (모바일 브라우저): Android=네이티브 프롬프트 · iOS=홈 화면 추가 안내 ========== */
function initInstallPrompt(){
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone)return; // 이미 앱으로 실행 중
  if(!window.matchMedia('(max-width:768px)').matches)return;                               // 모바일 브라우저만
  var KEY='nowhere_a2hs_dismiss';
  try{if(localStorage.getItem(KEY))return;}catch(e){}
  var deferred=null;
  function show(mode){
    if(document.getElementById('a2hs-bar'))return;
    var bar=document.createElement('div');bar.id='a2hs-bar';
    bar.innerHTML='<img src="apple-touch-icon.jpg" alt="" />'+
      '<div class="a2-tx"><b>Now Here 앱 설치</b><span>'+(mode==='ios'?'공유 버튼(⬆︎) → \'홈 화면에 추가\'로 앱처럼 쓸 수 있어요':'홈 화면에 추가해 앱처럼 쓸 수 있어요')+'</span></div>'+
      (mode==='android'?'<button type="button" class="a2-go">설치</button>':'')+
      '<button type="button" class="a2-x" aria-label="닫기">✕</button>';
    document.body.appendChild(bar);
    var go=bar.querySelector('.a2-go');
    if(go)go.addEventListener('click',function(){if(deferred){deferred.prompt();deferred=null;}bar.remove();});
    bar.querySelector('.a2-x').addEventListener('click',function(){try{localStorage.setItem(KEY,'1');}catch(e){}bar.remove();});
  }
  window._a2hsShow=show; // 테스트용
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;show('android');});
  if(/iphone|ipad|ipod/i.test(navigator.userAgent))setTimeout(function(){show('ios');},1800);
}

(function(){
  var avEl=document.getElementById('auth-ver'),apv=document.getElementById('app-version'); // 스플래시에 버전 노출 (#app-version 단일 소스)
  if(avEl&&apv)avEl.textContent=apv.textContent;
  initPanelCollapse();
  initPhoneControls();
  initSidebarResize();
  initPhoneMenu();
  FACTORY_SETTINGS=snapshotSettings();initDraft(); // 공장 기본값 + 설정 편집 버퍼(DRAFT)
  loadFileDefaults(); // repo 백스톱 설정(settings-default.json) — 공장값 캡처 후 비동기 적용, 클라우드가 오면 그쪽 우선
  initSettingsExport();
  initApplyBar();initMiniPreviews();initBlockBars();renderMiniPreviews();
  loadFeed();loadRequests();initSocial();initFeaturePage();initLiveCamera();initFeedPost();initRequestAnswer();initFeedTools();initFeedPinch();initSummaryCollapse();initSocialManager();initDemoSeed();renderFeedColList();
  window.addEventListener('resize',layoutTabPages);
  setInterval(function(){if(typeof fieldRequests!=='undefined'&&fieldRequests.length)renderRequestMarkers();},30000); // Request 10분 타임아웃 경과 반영(마커+드로어)
  initInstallPrompt();
  if(typeof CONFIG==='undefined'||!CONFIG.GOOGLE_MAPS_API_KEY){var it=document.getElementById('info-text');if(it)it.textContent='⚠️ config.js에 API 키를 설정해 주세요.';hideMapLoading();hideAuthOverlay();return;}
  initAuth();
})();
