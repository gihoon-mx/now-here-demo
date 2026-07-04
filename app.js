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
  lens: { fogColor:'#f2f6fb', fogOpacity:0.5, lineColor:'#2f7bff', lineOpacity:0.85, trendScaleM:300, fadeMs:250 },
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
var spotMessages = [];          // [{id,lat,lng,text,emoji}]
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
  if(typeof clearLensGeom==='function'){clearLensGeom();phoneLens.on=false;} // 경계 갱신 → 렌즈는 다음 idle에 재생성
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
function initSpotBubbleClass(){
  SpotBubble.prototype=new google.maps.OverlayView();
  SpotBubble.prototype.onAdd=function(){
    var self=this;
    var wrap=document.createElement('div');wrap.className='spot-marker';
    var bubble=document.createElement('div');bubble.className='spot-bubble';
    var emoji=document.createElement('div');emoji.className='spot-emoji';
    var dot=document.createElement('div');dot.className='spot-dotmark';
    wrap.appendChild(bubble);wrap.appendChild(emoji);wrap.appendChild(dot);
    wrap.addEventListener('mousedown',function(e){self._onDown(e);});
    this.div=wrap;this.bubbleEl=bubble;this.emojiEl=emoji;this.dotEl=dot;
    this._render();
    this.getPanes().overlayMouseTarget.appendChild(wrap);
  };
  // 관리자: 드래그로 이동 / (이동 없이) 클릭하면 편집 모달
  SpotBubble.prototype._onDown=function(e){
    var self=this;
    if(currentRole!=='admin'||self.getMap()!==map)return;   // 메인 지도에서만 편집
    e.stopPropagation();if(e.cancelable)e.preventDefault();
    var moved=false,sx=e.clientX,sy=e.clientY,mapEl=document.getElementById('map');
    self.div.classList.add('dragging');
    map.setOptions({draggable:false});
    function mv(ev){
      if(!moved&&(Math.abs(ev.clientX-sx)>3||Math.abs(ev.clientY-sy)>3))moved=true;
      if(!moved)return;var proj=self.getProjection();if(!proj)return;
      var r=mapEl.getBoundingClientRect();
      var ll=proj.fromContainerPixelToLatLng(new google.maps.Point(ev.clientX-r.left,ev.clientY-r.top));
      if(ll){self.spot.lat=ll.lat();self.spot.lng=ll.lng();self.position=ll;self.draw();}
    }
    function up(){
      document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);
      map.setOptions({draggable:true});if(self.div)self.div.classList.remove('dragging');
      if(moved){renderSpots();markCloudDirty();}else{openSpotEditor(self.spot.id);}
    }
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
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
    this.bubbleEl.style.setProperty('--spot-bg',hexToRgba(s.color||c.bgColor||'#1c66e5',Number(c.bgOpacity)));
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
    this.div.classList.toggle('spot-admin',currentRole==='admin');
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
    if(isDot&&!emojiDot){
      this.div.style.transformOrigin='50% 50%';
      this.div.style.transform='translate(-50%,-50%)';           // 고정 크기 점
    }else if(emojiDot){
      this.div.style.transformOrigin='50% 50%';
      this.div.style.transform='translate(-50%,-50%) scale('+s+')'; // 이모지만 배율로
    }else{
      this.div.style.transformOrigin='50% 100%';
      this.div.style.transform='translate(-50%,-100%) scale('+s+')'; // 말풍선 배율로
    }
  };
  SpotBubble.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}

/* ========== 이모지 픽커 (재사용) ========== */
// 공용: 이모지 추가 프롬프트 → spotConfig.emojis에 등록, 추가된 이모지 반환(취소/빈값이면 null)
function promptAddEmoji(){
  var em=prompt('추가할 이모지를 입력하세요 (예: 🍕)');
  if(em==null)return null; em=em.trim(); if(!em)return null;
  if(!Array.isArray(spotConfig.emojis))spotConfig.emojis=SPOT_EMOJIS.slice();
  if(spotConfig.emojis.indexOf(em)<0){spotConfig.emojis.push(em);markStyleDirty();}
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
    spotConfig.emojis.splice(i,1);markStyleDirty();
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
    if(currentRole!=='admin')spot.local=true; // 데모가 추가한 스팟은 이 기기에 저장
    spotMessages.push(spot);currentSpotEmoji=this.emoji;
    this.close();renderSpots();persistSpotChange();
  };
  SpotComposer.prototype.close=function(){this.setMap(null);if(composerOverlay===this)composerOverlay=null;if(currentMode==='local')updateInfoPanel(selectedFeatureName);};
  SpotComposer.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}
function closeComposer(){if(composerOverlay)composerOverlay.close();}

/* ========== 스팟 메시지 렌더/CRUD ========== */
function renderSpots(){
  clearSpots();
  // 스팟 메시지는 모드(베이직/트렌드) 무관하게 항상 표시 — 모드는 지도 구획 방식일 뿐
  spotMessages.forEach(function(s){
    spotOverlays.push(new SpotBubble(s,spotConfig,map));
    if(phoneMap)phoneSpotOverlays.push(new SpotBubble(s,spotConfig,phoneMap));
  });
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
  el.addEventListener('contextmenu',function(e){e.preventDefault();openAddMenu(mapObj,el,clientToLatLng(mapObj,el,e.clientX,e.clientY),e.clientX,e.clientY);});
  var t=null,sx=0,sy=0,lx=0,ly=0;
  el.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;sx=lx=e.touches[0].clientX;sy=ly=e.touches[0].clientY;clearTimeout(t);t=setTimeout(function(){openAddMenu(mapObj,el,clientToLatLng(mapObj,el,lx,ly),lx,ly);},520);},{passive:true});
  el.addEventListener('touchmove',function(e){if(!e.touches.length)return;lx=e.touches[0].clientX;ly=e.touches[0].clientY;if(Math.abs(lx-sx)>12||Math.abs(ly-sy)>12)clearTimeout(t);},{passive:true});
  el.addEventListener('touchend',function(){clearTimeout(t);},{passive:true});
  el.addEventListener('touchcancel',function(){clearTimeout(t);},{passive:true});
}
function removeSpot(id){spotMessages=spotMessages.filter(function(s){return s.id!==id;});renderSpots();persistSpotChange();}
/* 데모(뷰어) 추가 스팟은 이 기기 localStorage에(공유문서는 관리자만 쓰기), 관리자는 클라우드에 저장 */
function persistSpotChange(){ if(currentRole==='admin')markCloudDirty(); else saveLocalSpots(); }
function saveLocalSpots(){
  try{localStorage.setItem('nowhere_localSpots',JSON.stringify(
    spotMessages.filter(function(s){return s.local;}).map(function(s){return {id:s.id,lat:s.lat,lng:s.lng,text:s.text,emoji:s.emoji,color:s.color||null};})
  ));}catch(e){}
}
function loadLocalSpotsInto(){
  if(currentRole==='admin')return; // 관리자 세션엔 로컬 스팟 병합 안 함(공유문서로 오염 방지)
  try{
    var arr=JSON.parse(localStorage.getItem('nowhere_localSpots')||'[]');
    arr.forEach(function(s){
      if(!spotMessages.some(function(x){return x.id===s.id;}))
        spotMessages.push({id:s.id,lat:s.lat,lng:s.lng,text:s.text||'',emoji:s.emoji||'💬',color:s.color||null,local:true});
    });
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
    b.addEventListener('click',function(){s.emoji=em;pick.querySelectorAll('.spot-emoji-btn').forEach(function(x){x.classList.remove('active');});b.classList.add('active');refreshSpotStyles();markCloudDirty();});
    pick.appendChild(b);
  });
  var add=document.createElement('button');add.type='button';add.className='spot-emoji-add';add.textContent='＋';add.title='이모지 추가';
  add.addEventListener('click',function(){var em=promptAddEmoji();if(!em)return;s.emoji=em;renderSpotEditEmoji(s);renderSpotEmojiPicker();refreshSpotStyles();markCloudDirty();});
  pick.appendChild(add);
}
function initSpotEditor(){
  var modal=document.getElementById('spot-edit-modal');if(!modal)return;
  document.getElementById('spot-edit-close').addEventListener('click',closeSpotEditor);
  modal.addEventListener('click',function(e){if(e.target===modal)closeSpotEditor();});
  document.getElementById('se-text').addEventListener('input',function(){var s=curEditSpot();if(s){s.text=this.value;refreshSpotStyles();markCloudDirty();}});
  document.getElementById('se-color').addEventListener('click',function(e){e.stopPropagation();var s=curEditSpot();if(!s)return;
    openColorPopup(this,{color:s.color||spotConfig.bgColor,alpha:null,onInput:function(hex){s.color=hex;paintSeColor(hex);refreshSpotStyles();markCloudDirty();}});});
  document.getElementById('se-delete').addEventListener('click',function(){var s=curEditSpot();closeSpotEditor();if(s)removeSpot(s.id);});
  document.getElementById('se-save').addEventListener('click',closeSpotEditor);
}

function initSpotUI(){
  var addBtn=document.getElementById('spot-add-btn');if(addBtn)addBtn.addEventListener('click',function(){addTargetMap=primaryMap();addTargetDiv=null;addAtLatLng=null;addSpotContent();}); // 사이드바: 바로 센터 추가
  initSpotEditor();
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeComposer();closeAddMenu();}});
  // 스팟 설정 (디자인 메뉴)
  bindInput('spot-max-chars','range',spotConfig,'maxChars',refreshSpotStyles);
  bindInput('spot-font-size','range',spotConfig,'fontSize',refreshSpotStyles);
  bindInput('spot-emoji-size','range',spotConfig,'emojiSize',refreshSpotStyles);
  bindInput('spot-bubble-radius','range',spotConfig,'bubbleRadius',refreshSpotStyles);
  bindInput('spot-emoji-gap','range',spotConfig,'emojiGap',refreshSpotStyles);
  bindInput('spot-emoji-letter','range',spotConfig,'emojiLetterSpacing',refreshSpotStyles);
  bindInput('spot-dot-scale','range',spotConfig,'dotScaleM',refreshSpotStyles);
  var tailEl=document.getElementById('spot-tail');if(tailEl)tailEl.addEventListener('change',function(){spotConfig.tail=this.checked;refreshSpotStyles();markStyleDirty();});
  var posEl=document.getElementById('spot-emoji-pos');if(posEl)posEl.addEventListener('change',function(){spotConfig.emojiPos=this.value;refreshSpotStyles();markStyleDirty();});
  var dsEl=document.getElementById('spot-dot-style');if(dsEl)dsEl.addEventListener('change',function(){spotConfig.dotStyle=this.value;refreshSpotStyles();markStyleDirty();});
  makeColorControl('ct-spot-text',spotConfig,'textColor',null,refreshSpotStyles);
  makeColorControl('ct-spot-bg',spotConfig,'bgColor','bgOpacity',refreshSpotStyles);
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
/* 폰 햄버거 메뉴: 설정 패널을 폰 내부 드로어로 이동 + 토글, 폰 모드 토글 */
function initPhoneMenu(){
  var drawer=document.getElementById('phone-drawer');
  var body=document.getElementById('phone-drawer-body');
  if(body){
    // 데모용 리스트(트렌드 존 · 스팟 메시지) — 데모 모드에서 노출
    var demo=document.createElement('div');demo.id='drawer-demo';
    demo.innerHTML='<div class="drawer-sec"><h4>📍 트렌드 존</h4><div id="drawer-zone-list" class="drawer-list"></div></div>'+
                   '<div class="drawer-sec"><h4>💬 스팟 메시지</h4><div id="drawer-spot-list" class="drawer-list"></div></div>';
    body.appendChild(demo);
    // 관리자 설정/컨텐츠 메뉴를 햄버거 드로어로 이동(관리자만 노출; 데모는 role-user로 숨김)
    ['content-toggle-row','content-section','settings-toggle-row','settings-section'].forEach(function(id){var el=document.getElementById(id);if(el)body.appendChild(el);});
  }
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
// 무료 티어 안전장치: 개수 · 1장 용량 · 문서 총합 상한 (Firestore 1MB 문서 하드리밋 안쪽으로 강제 → Storage/Blaze 불필요)
var NEWS_MAX_COUNT=6, NEWS_MAX_ITEM_BYTES=170000, NEWS_DOC_BUDGET=900000;
function initContentPage(){
  var frame=document.getElementById('cp-frame');
  var addBtn=document.getElementById('news-add-btn'),file=document.getElementById('news-file');
  loadNews();
  if(addBtn)addBtn.addEventListener('click',function(){if(currentRole==='admin'&&file)file.click();});
  // 이미지 링크(URL)로 추가 — URL만 저장(저장부담 거의 0)
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
    frame.addEventListener('pointerdown',function(e){if(newsItems.length<2)return;sx=e.clientX;dxv=0;newsDragging=true;setTrackAnim(false);try{frame.setPointerCapture(e.pointerId);}catch(_){}});
    frame.addEventListener('pointermove',function(e){if(sx==null)return;dxv=e.clientX-sx;setTrackX(-newsIndex*slideW()+dxv);});
    frame.addEventListener('pointerup',function(){if(sx==null)return;var w=slideW();if(dxv<-w*0.18&&newsIndex<newsItems.length-1)newsIndex++;else if(dxv>w*0.18&&newsIndex>0)newsIndex--;sx=null;newsDragging=false;setTrackAnim(true);snapTrack();updateDots();});
    frame.addEventListener('pointercancel',function(){sx=null;newsDragging=false;setTrackAnim(true);snapTrack();});
  }
}
function slideW(){var f=document.getElementById('cp-frame');return f?f.offsetWidth:0;}
function setTrackAnim(on){var t=document.getElementById('cp-track');if(t)t.style.transition=on?'transform .28s ease':'none';}
function setTrackX(px){var t=document.getElementById('cp-track');if(t)t.style.transform='translateX('+px+'px)';}
function snapTrack(){setTrackX(-newsIndex*slideW());}
function updateDots(){var d=document.getElementById('cp-dots');if(!d)return;d.querySelectorAll('.cp-dot').forEach(function(el,i){el.classList.toggle('active',i===newsIndex);});}
function renderNews(){
  var frame=document.getElementById('cp-frame'),track=document.getElementById('cp-track'),dots=document.getElementById('cp-dots');
  if(track){track.innerHTML='';newsItems.forEach(function(it){var s=document.createElement('div');s.className='cp-slide';var im=document.createElement('img');im.src=it.src;im.alt='';s.appendChild(im);track.appendChild(s);});}
  if(newsIndex>=newsItems.length)newsIndex=Math.max(0,newsItems.length-1);
  if(frame)frame.classList.toggle('has-news',newsItems.length>0);
  if(dots){dots.innerHTML='';for(var i=0;i<newsItems.length;i++){var dt=document.createElement('span');dt.className='cp-dot'+(i===newsIndex?' active':'');dots.appendChild(dt);}dots.style.display=newsItems.length>1?'':'none';}
  setTrackAnim(false);snapTrack();
  renderNewsList();
}
function renderNewsList(){
  var list=document.getElementById('news-list');if(!list)return;
  list.innerHTML='';
  if(!newsItems.length){var e=document.createElement('p');e.className='section-hint';e.textContent='아직 올린 소식이 없어요.';list.appendChild(e);return;}
  newsItems.forEach(function(it,i){
    var row=document.createElement('div');row.className='news-item';
    var th=document.createElement('img');th.className='ni-thumb';th.src=it.src;
    var reg=document.createElement('input');reg.className='ni-region';reg.type='text';reg.placeholder='구역(동)';reg.value=it.region||'';
    reg.addEventListener('change',function(){newsItems[i].region=this.value.trim();saveNews();});
    var act=document.createElement('div');act.className='ni-actions';
    var up=mkBtn('↑'),dn=mkBtn('↓'),del=mkBtn('🗑');
    up.onclick=function(){newsMove(i,-1);};dn.onclick=function(){newsMove(i,1);};del.onclick=function(){newsDelete(i);};
    act.appendChild(up);act.appendChild(dn);act.appendChild(del);
    row.appendChild(th);row.appendChild(reg);row.appendChild(act);list.appendChild(row);
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
  for(var i=0;i<newsItems.length&&items.length<NEWS_MAX_COUNT;i++){var s=newsItems[i].src||'';if(total+s.length>NEWS_DOC_BUDGET)break;total+=s.length;items.push({id:newsItems[i].id,src:s,region:newsItems[i].region||''});}
  fbDb.collection('shared').doc('news').set({items:items,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.email||''})
    .catch(function(e){console.warn('news save fail',e);alert('동네소식 공유 저장 실패(용량 초과 가능): '+e.message);});
}
// 공유 로드 (로그인 사용자 모두)
function loadNewsFromCloud(){
  if(!fbDb)return;
  fbDb.collection('shared').doc('news').get().then(function(doc){
    if(!doc.exists)return;var d=doc.data();if(!d||!Array.isArray(d.items))return;
    newsItems=d.items.map(function(it){return {id:it.id||('n_'+(newsSeq++)),src:it.src,region:it.region||''};});
    try{localStorage.setItem('nowhere_news',JSON.stringify(newsItems));}catch(e){}
    newsIndex=0;renderNews();
  }).catch(function(e){console.warn('news load fail',e);});
}
// 공유 메뉴 바디를 여는 드로어로 옮겨 렌더 (한 번에 하나만 열림 → 동일 DOM = 싱크)
function openPhoneDrawer(){var d=document.getElementById('phone-drawer'),b=document.getElementById('phone-drawer-body'),pc=document.getElementById('pc-drawer');if(!d)return;if(pc)pc.classList.remove('open');if(b&&b.parentNode!==d)d.appendChild(b);d.classList.add('open');renderDrawerDemo();}
function openPcDrawer(){var d=document.getElementById('pc-drawer'),b=document.getElementById('phone-drawer-body'),ph=document.getElementById('phone-drawer');if(!d)return;if(ph)ph.classList.remove('open');if(b&&b.parentNode!==d)d.appendChild(b);d.classList.add('open');renderDrawerDemo();}
function closeDrawer(){var p=document.getElementById('phone-drawer');if(p)p.classList.remove('open');var c=document.getElementById('pc-drawer');if(c)c.classList.remove('open');}
// 드로어 데모 리스트(트렌드 존/스팟) 렌더 — 데모·관리자 모두 데이터로 채움
function renderDrawerDemo(){
  var zl=document.getElementById('drawer-zone-list');
  if(zl){zl.innerHTML='';
    if(!trendZones.length){zl.innerHTML='<div class="drawer-empty">등록된 트렌드 존이 없어요.</div>';}
    else trendZones.forEach(function(z){
      var it=document.createElement('button');it.type='button';it.className='drawer-item';
      it.innerHTML='<span class="di-dot"></span><span class="di-name"></span>';
      it.querySelector('.di-dot').style.background=z.color;it.querySelector('.di-name').textContent=z.name;
      it.addEventListener('click',function(){if(currentMode!=='trend')switchMode('trend');selectPhoneZone(z);closeDrawer();});
      zl.appendChild(it);
    });
  }
  var sl=document.getElementById('drawer-spot-list');
  if(sl){sl.innerHTML='';
    if(!spotMessages.length){sl.innerHTML='<div class="drawer-empty">등록된 스팟 메시지가 없어요.</div>';}
    else spotMessages.forEach(function(s){
      var it=document.createElement('button');it.type='button';it.className='drawer-item';
      it.innerHTML='<span class="di-emoji"></span><span class="di-name"></span>';
      it.querySelector('.di-emoji').textContent=s.emoji||'💬';it.querySelector('.di-name').textContent=(s.text||'').trim()||'(빈 메시지)';
      it.addEventListener('click',function(){focusSpot(s);closeDrawer();});
      sl.appendChild(it);
    });
  }
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
  map.addListener('idle',function(){sync();updatePhoneLocation();updatePhoneViewportOverlay();updateScaleLegend();updatePhoneScale();});
  phoneMap.addListener('idle',function(){updatePhoneViewportOverlay();updatePhoneLocation();updatePhoneLens();updatePhoneScale();});
  phoneMap.addListener('click',function(){ clearPhoneSpotlight(); }); // 빈 곳 클릭 = 존 강조 해제
  attachAddGestures(el,phoneMap); // 폰 지도 롱프레스/우클릭 → 컨텐츠 추가 팝업
  sync();
  if(originalGeoJson){buildDongIndex();applyGeoJsonToPhone();}
  phoneDataVisibility();syncPhoneZones();updatePhoneUI();updatePhoneLocation();updatePhoneViewportOverlay();updatePhoneLens();updatePhoneScale();
  renderSpots();
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
  clearPhoneSpotlight();
  if(phoneLens.zoneId||phoneLens.zoneRef){cancelAnimationFrame(phoneLens.raf);clearLensGeom();phoneLens.on=false;} // 존 오버레이 재생성 → 렌즈 참조 무효
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
var phoneSpotlight=null, phoneSelectedZoneId=null;
function clearPhoneSpotlight(){if(phoneSpotlight){phoneSpotlight.setMap(null);phoneSpotlight=null;}phoneSelectedZoneId=null;if(typeof applySpotFocus==='function')applySpotFocus();}
function selectPhoneZone(zone){
  if(!phoneMap||!zone||!zone.hexCenters||!zone.hexCenters.length)return;
  if(phoneSelectedZoneId===zone.id){clearPhoneSpotlight();return;} // 재클릭 = 강조 해제
  if(phoneSpotlight){phoneSpotlight.setMap(null);phoneSpotlight=null;}
  if(phoneLens.zoneId||phoneLens.mask){cancelAnimationFrame(phoneLens.raf);lensApply(0);clearLensGeom();phoneLens.on=false;} // 자동 렌즈 즉시 해제(존 채움/라벨 복원)
  phoneSelectedZoneId=zone.id;
  var gp=getHexGridParams(zone.radiusKm);
  var b=new google.maps.LatLngBounds(), holes=[];
  zone.hexCenters.forEach(function(c){
    var v=hexVertices(c.lng,c.lat,gp.R_lat,gp.R_lng);
    v.forEach(function(p){b.extend(p);});
    holes.push(holeRing(v));   // 존 셀들을 구멍으로(감김 정규화) → 그 안만 밝게
  });
  // 바깥 링은 존 주변을 넉넉히 덮는 사각형(전세계 링은 안/밖 모호로 반전됨). 시계방향, 헥사곤 구멍은 반시계방향(반대 감김) → 구멍으로 렌더.
  var ne=b.getNorthEast(), sw=b.getSouthWest();
  var pad=Math.max(ne.lat()-sw.lat(), ne.lng()-sw.lng())*8 + 0.05;
  var outer=[{lat:sw.lat()-pad,lng:sw.lng()-pad},{lat:ne.lat()+pad,lng:sw.lng()-pad},{lat:ne.lat()+pad,lng:ne.lng()+pad},{lat:sw.lat()-pad,lng:ne.lng()+pad}];
  // 능동 선택(탭)은 수동 렌즈보다 진하게 — 톤은 렌즈 포그와 동일 문법(화이트)
  phoneSpotlight=new google.maps.Polygon({paths:[outer].concat(holes),strokeWeight:0,fillColor:lensCfg().fogColor,fillOpacity:Math.min(0.78,Number(lensCfg().fogOpacity)+0.22),clickable:false,zIndex:20});
  phoneSpotlight.setMap(phoneMap);
  phoneMap.fitBounds(b, phoneFitPadding());   // 실제 보이는 영역(헤더/네비 제외) 안에 존 전체가 들어오게
  updatePhoneLocation();
  applySpotFocus();
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
function phoneMapInsets(){
  var scr=document.querySelector('#phone-mirror .phone-screen')||document.querySelector('.phone-screen');
  var hd=scr?scr.querySelector('.phone-header'):null, nv=scr?scr.querySelector('.phone-navbar'):null;
  return {top:hd?hd.offsetHeight:0, bottom:nv?nv.offsetHeight:0};
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
    nameEl.textContent=zoneAtCenter(c.lat(),c.lng())||'트렌드';
    return;
  }
  var nm=dongAt(c.lat(),c.lng())||'위치 확인 중';   // 베이직 모드 = 센터가 속한 '동'
  nameEl.textContent=nm;
  if(nm!==lastLocName){lastLocName=nm;if(nm!=='위치 확인 중')newsFocusRegion(nm);} // 동이 바뀌면 그 동네 소식으로
}
// 동네소식 연동: region 태그가 현재 동과 맞는 이미지로 캐러셀 슬라이드 (스와이프 중엔 방해 금지)
function newsFocusRegion(dong){
  if(!dong||newsDragging||newsItems.length<2)return;
  var norm=function(t){return t.replace(/[0-9\s]/g,'');} // '논현1동'≈'논현동' (숫자·공백 무시)
  for(var i=0;i<newsItems.length;i++){
    var r=(newsItems[i].region||'').trim();
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
  if(phoneSelectedZoneId){lensOff();return;} // 탭 스포트라이트(능동)가 우선
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
  var gp=getHexGridParams(z.radiusKm);
  for(var i=0;i<z.hexCenters.length;i++){var hc=z.hexCenters[i];
    if(Math.abs(hc.lat-s.lat)<gp.R_lat&&Math.abs(hc.lng-s.lng)<gp.R_lng)return true;}
  return false;
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
  });});
  // AI 버튼: 말풍선 팝업 + 아이콘 회전/AI색상(데모)
  var aiBtn=mirror.querySelector('.pn-ai'),aiBub=document.getElementById('ai-bubble');
  if(aiBtn&&aiBub){
    var aiStops=document.querySelectorAll('#aiBlob stop');
    function setAiActive(on){
      aiBtn.classList.toggle('ai-on',on);
      if(aiStops[0]&&aiStops[1]){aiStops[0].setAttribute('stop-color',on?'#8ed0ff':'#cbd0d8');aiStops[1].setAttribute('stop-color',on?'#a78bfa':'#cbd0d8');}
    }
    function hideAi(){aiBub.classList.remove('show');clearTimeout(aiBub._t);setAiActive(false);}
    aiBtn.addEventListener('click',function(e){e.stopPropagation();
      if(aiBub.classList.contains('show')){hideAi();return;}
      aiBub.classList.remove('show');void aiBub.offsetWidth;aiBub.classList.add('show');
      aiBtn.classList.remove('spin');void aiBtn.offsetWidth;aiBtn.classList.add('spin');
      setAiActive(true);
      clearTimeout(aiBub._t);aiBub._t=setTimeout(hideAi,5000);
    });
  }
  // 컨텐츠 추가 버튼(네비 왼쪽): 누르면 [스팟 메시지 / 사진 올리기] 팝업
  var addBtn=mirror.querySelector('.pn-add'),addMenu=document.getElementById('content-add-menu');
  if(addBtn&&addMenu){
    // +버튼: 팝업은 기본 위치(좌하단), 스팟은 보이는 화면 센터에 추가
    addBtn.addEventListener('click',function(e){e.stopPropagation();if(addMenu.classList.contains('open'))closeAddMenu();else openAddMenu(phoneMap,document.getElementById('phone-map'),null,null,null);});
    addMenu.addEventListener('click',function(e){e.stopPropagation();});
    addMenu.querySelectorAll('.cam-item').forEach(function(it){
      it.addEventListener('click',function(){
        if(it.dataset.add==='spot'){addSpotContent();}
        else{closeAddMenu();if(it.dataset.add==='photo'){var fi=document.getElementById('feed-photo-input');if(fi)fi.click();}}
      });
    });
    document.addEventListener('click',function(){if(Date.now()-addMenuOpenedAt<600)return;closeAddMenu();}); // 롱프레스 직후 자동 닫힘 방지
  }
  var photoInput=document.getElementById('feed-photo-input');
  if(photoInput)photoInput.addEventListener('change',function(){
    if(this.files&&this.files.length){alert('사진이 선택되었습니다 (피드 업로드는 데모): '+this.files[0].name);this.value='';}
  });
  // 창 크기 변경 시 화면 밖 방지
  window.addEventListener('resize',reclampPhone);
}

/* ========== 트렌드 존 CRUD ========== */
function saveTrendZone(name, color) {
  var centers = [];
  selectedHexes.forEach(function(d){centers.push({id:d.col+'_'+d.row,lat:d.lat,lng:d.lng});});
  var zone = {id:'tz_'+Date.now(),name:name,color:color,radiusKm:hexRadiusKm,
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

function updateZone(zoneId,newName,newColor){
  var zone=trendZones.find(function(z){return z.id===zoneId;});
  if(!zone) return; zone.name=newName; zone.color=newColor;
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
      '<button class="zone-act" data-act="focus" title="이동">📍</button>'+
      '<button class="zone-act" data-act="edit" title="수정">✏️</button>'+
      '<button class="zone-act" data-act="delete" title="삭제">🗑️</button>';
    item.querySelector('[data-act="focus"]').addEventListener('click',function(){focusZone(zone.id);});
    item.querySelector('[data-act="edit"]').addEventListener('click',function(){
      if(editingZoneId===zone.id)return;
      if(currentMode!=='trend')switchMode('trend'); // 존 편집은 트렌드 모드(헥사곤)에서
      if(editingZoneId)finishEditZone();startEditZone(zone.id);
    });
    item.querySelector('[data-act="delete"]').addEventListener('click',function(){deleteZone(zone.id);});
    if(!isEd) item.querySelector('.zone-name-text').addEventListener('dblclick',function(){showInlineEdit(zone.id,item);});
    list.appendChild(item);
  });
}

function showInlineEdit(zoneId,itemEl){
  var zone=trendZones.find(function(z){return z.id===zoneId;});if(!zone)return;
  if(itemEl.querySelector('.zone-inline-edit')){itemEl.querySelector('.zone-inline-edit').remove();return;}
  var form=document.createElement('div');form.className='zone-inline-edit';
  form.innerHTML='<input type="text" class="zi-name" value="'+escHtml(zone.name)+'" maxlength="20" /><div class="zone-form-row"><input type="color" class="zi-color" value="'+zone.color+'" /><button class="action-btn accent small">적용</button><button class="action-btn small">닫기</button></div>';
  form.querySelector('.action-btn.accent').addEventListener('click',function(){var n=form.querySelector('.zi-name').value.trim(),c=form.querySelector('.zi-color').value;if(n)updateZone(zoneId,n,c);});
  form.querySelector('.action-btn:not(.accent)').addEventListener('click',function(){form.remove();});
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
    return {id:z.id,name:z.name,color:z.color,radiusKm:z.radiusKm,hexCenters:z.hexCenters,
      originalCenters:z.originalCenters,originalRadiusKm:z.originalRadiusKm};
  });
  try{localStorage.setItem('nowhere_trendZones',JSON.stringify(data));}catch(e){}
  markCloudDirty();
}
function loadZonesFromStorage(){
  try{
    var data=JSON.parse(localStorage.getItem('nowhere_trendZones')||'[]');
    data.forEach(function(d){
      trendZones.push({id:d.id,name:d.name,color:d.color,radiusKm:d.radiusKm,hexCenters:d.hexCenters,
        originalCenters:d.originalCenters||JSON.parse(JSON.stringify(d.hexCenters)),
        originalRadiusKm:d.originalRadiusKm||d.radiusKm,
        polygons:[],label:null});
    });
    renderZoneList();
  }catch(e){}
}

/* ========== 모드 전환 ========== */
function switchMode(mode){
  if(mode===currentMode) return; if(editingZoneId) finishEditZone();
  currentMode=mode;
  removeLocalLabel(); selectedFeatureName=null; selectedFeatureId=null;
  closeComposer(); closeAddMenu();
  document.querySelectorAll('.mode-btn').forEach(function(b){b.classList.toggle('active',b.dataset.mode===mode);});
  document.querySelectorAll('#phone-mode .pm-btn').forEach(function(b){b.classList.toggle('active',b.dataset.mode===mode);});
  document.querySelector('.mode-indicator').classList.toggle('right',mode==='trend');
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
  }
  phoneDataVisibility(); syncPhoneZones(); updatePhoneUI(); updatePhoneLens();
}

/* ========== 초기화 ========== */
function initMap(){
  initMapLabelClass();
  initSpotBubbleClass();
  initSpotComposerClass();
  initProjHelperClass();
  var opts={center:{lat:CONFIG.MAP_CENTER_LAT,lng:CONFIG.MAP_CENTER_LNG},zoom:CONFIG.MAP_ZOOM,disableDefaultUI:false,zoomControl:true,mapTypeControl:false,streetViewControl:false,fullscreenControl:true};
  if(CONFIG.MAP_ID&&CONFIG.MAP_ID.length>0) opts.mapId=CONFIG.MAP_ID; else opts.styles=mapStyles();
  map=new google.maps.Map(document.getElementById('map'),opts);
  mapProjHelper=new ProjHelper(map); // 좌표 변환용(제스처 지점→latLng)
  fetch(CONFIG.GEOJSON_PATH).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(geo){originalGeoJson=geo;applyGeoJsonToMap();fitBoundsToData();loadZonesFromStorage();hideMapLoading();mapReady=true;if(cloudData)applyCloudData(cloudData);else{loadLocalSpotsInto();renderSpots();}}).catch(function(err){hideMapLoading();var el=document.getElementById('info-text');if(el)el.textContent='⚠️ 경계 데이터를 불러오지 못했습니다. ('+err.message+')';});
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
      onInput:function(hex,a){obj[colorProp]=hex;if(alphaProp&&a!=null)obj[alphaProp]=a;paint();cb();markStyleDirty();}});
  });
}

/* ========== 설정 UI 동기화 (불러오기 후 컨트롤 갱신) ========== */
function formatByStep(el,val){var s=el.getAttribute('step')||'1';var dec=s.indexOf('.')>=0?s.split('.')[1].length:0;return Number(val).toFixed(dec);}
function setRange(id,val,fmt){var el=document.getElementById(id);if(!el)return;el.value=val;var lbl=el.nextElementSibling;if(lbl&&lbl.classList&&lbl.classList.contains('range-val'))lbl.textContent=fmt?fmt(Number(val)):formatByStep(el,val);if(el._num)el._num.value=formatByStep(el,el.value);}
function setCheck(id,val){var el=document.getElementById(id);if(el)el.checked=!!val;}
function syncSettingsUI(){
  colorControls.forEach(function(c){c.paint();});
  setRange('default-stroke-weight',styleConfig.default.strokeWeight);
  setRange('highlight-stroke-weight',styleConfig.highlight.strokeWeight);
  setRange('highlight-spot-scale',styleConfig.highlight.spotScaleM);
  setRange('lens-trend-scale',styleConfig.lens.trendScaleM);
  setRange('lens-fade-ms',styleConfig.lens.fadeMs);
  setCheck('smooth-toggle',smoothEnabled);
  setRange('smooth-intensity',smoothIntensity);
  setRange('hex-radius',hexRadiusKm,function(v){return v.toFixed(1)+'km';});
  setCheck('local-label-toggle',localLabelConfig.enabled);
  setCheck('zone-merge-toggle',zoneMergeBlocks);
  setRange('local-label-size',localLabelConfig.fontSize);
  setRange('zone-label-size',zoneLabelConfig.fontSize);
  setRange('zone-label-bg-opacity',zoneLabelConfig.bgOpacity);
  setRange('spot-max-chars',spotConfig.maxChars);
  setRange('spot-font-size',spotConfig.fontSize);
  setRange('spot-emoji-size',spotConfig.emojiSize);
  setRange('spot-bubble-radius',spotConfig.bubbleRadius);
  setRange('spot-emoji-gap',spotConfig.emojiGap);
  setRange('spot-emoji-letter',spotConfig.emojiLetterSpacing);
  setRange('spot-dot-scale',spotConfig.dotScaleM);
  setCheck('spot-tail',spotConfig.tail);
  var _sp=document.getElementById('spot-emoji-pos');if(_sp)_sp.value=spotConfig.emojiPos||'bottom';
  var _sds=document.getElementById('spot-dot-style');if(_sds)_sds.value=spotConfig.dotStyle||'dot';
  if(typeof renderSpotEmojiPicker==='function')renderSpotEmojiPicker();
  renderMiniPreviews();
}

function initSettingsPanel(){
  var toggle=document.getElementById('settings-toggle');
  var section=document.getElementById('settings-section');
  toggle.addEventListener('click',function(){var open=section.style.display!=='none';section.style.display=open?'none':'';toggle.classList.toggle('open',!open);});

  // 색상+투명도 통합 컨트롤 (팝업에서 색상/알파 동시 조절)
  makeColorControl('ct-default-fill',styleConfig.default,'fillColor','fillOpacity',refreshMapStyles);
  makeColorControl('ct-default-stroke',styleConfig.default,'strokeColor','strokeOpacity',refreshMapStyles);
  makeColorControl('ct-highlight-fill',styleConfig.highlight,'fillColor','fillOpacity',refreshMapStyles);
  makeColorControl('ct-highlight-stroke',styleConfig.highlight,'strokeColor','strokeOpacity',refreshMapStyles);
  makeColorControl('ct-dim-fill',styleConfig.lens,'fogColor','fogOpacity',lensStyleRefresh);
  makeColorControl('ct-dim-stroke',styleConfig.lens,'lineColor','lineOpacity',lensStyleRefresh);
  makeColorControl('ct-hex-fill',hexStyleConfig.default,'fillColor','fillOpacity',refreshHexStyles);
  makeColorControl('ct-hex-stroke',hexStyleConfig.default,'strokeColor','strokeOpacity',refreshHexStyles);
  makeColorControl('ct-hex-sel-fill',hexStyleConfig.selected,'fillColor','fillOpacity',refreshHexStyles);
  makeColorControl('ct-local-label-text',localLabelConfig,'textColor',null,updateLocalLabelStyle);
  makeColorControl('ct-local-label-bg',localLabelConfig,'bgColor','bgOpacity',updateLocalLabelStyle);
  makeColorControl('ct-zone-label-text',zoneLabelConfig,'textColor',null,refreshZoneLabels);

  // 선 굵기 (투명도가 아니므로 슬라이더 유지)
  bindInput('default-stroke-weight','range',styleConfig.default,'strokeWeight',refreshMapStyles);
  bindInput('highlight-stroke-weight','range',styleConfig.highlight,'strokeWeight',refreshMapStyles);
  bindInput('highlight-spot-scale','range',styleConfig.highlight,'spotScaleM',updatePhoneLens);
  bindInput('lens-trend-scale','range',styleConfig.lens,'trendScaleM',updatePhoneLens);
  bindInput('lens-fade-ms','range',styleConfig.lens,'fadeMs',function(){});

  document.getElementById('smooth-toggle').addEventListener('change',function(){smoothEnabled=this.checked;applyGeoJsonToMap();markStyleDirty();});
  document.getElementById('smooth-intensity').addEventListener('input',function(){
    smoothIntensity=parseFloat(this.value);this.nextElementSibling.textContent=smoothIntensity.toFixed(1);
    if(smoothEnabled) applyGeoJsonToMap();markStyleDirty();
  });

  document.getElementById('hex-radius').addEventListener('input',function(){
    hexRadiusKm=parseFloat(this.value);document.getElementById('hex-radius-label').textContent=hexRadiusKm.toFixed(1)+'km';
    if(currentMode==='trend'){selectedHexes.clear();if(editingZoneId)cancelEditZone();rezoneAllToCurrentRadius();generateHexagons();updateZoneSaveUI();}
    markStyleDirty();
  });

  // 폰 표시영역 오버레이 토글 (관리자)
  var vpToggle=document.getElementById('phone-viewport-toggle');
  if(vpToggle){vpToggle.checked=phoneViewportOn;vpToggle.addEventListener('change',function(){phoneViewportOn=this.checked;updatePhoneViewportOverlay();});}

  // 라벨 옵션
  document.getElementById('local-label-toggle').addEventListener('change',function(){localLabelConfig.enabled=this.checked;if(this.checked)showLocalLabel();else removeLocalLabel();markStyleDirty();});
  bindInput('local-label-size','range',localLabelConfig,'fontSize',updateLocalLabelStyle);
  bindInput('zone-label-size','range',zoneLabelConfig,'fontSize',refreshZoneLabels);
  bindInput('zone-label-bg-opacity','range',zoneLabelConfig,'bgOpacity',refreshZoneLabels);
  var zmt=document.getElementById('zone-merge-toggle');
  if(zmt)zmt.addEventListener('change',function(){zoneMergeBlocks=this.checked;rerenderZones();markStyleDirty();});

  enhanceRangeInputs();      // 슬라이더 옆 숫자 직접 입력 추가
  initSettingsAccordion();   // 설정 섹션 아코디언화
}

function bindInput(id,type,obj,prop,cb){
  var el=document.getElementById(id);if(!el)return;
  el.addEventListener('input',function(){
    obj[prop]=type==='range'?parseFloat(this.value):this.value;
    if(type==='range'&&this.nextElementSibling&&this.nextElementSibling.classList&&this.nextElementSibling.classList.contains('range-val')) this.nextElementSibling.textContent=parseFloat(this.value).toFixed(this.step&&this.step.indexOf('.')>=0?this.step.split('.')[1].length:0);
    cb(); markStyleDirty();
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
  toggle.addEventListener('click',function(){var open=section.style.display!=='none';section.style.display=open?'none':'';toggle.classList.toggle('open',!open);});
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

function fitBoundsToData(){var b=new google.maps.LatLngBounds();map.data.forEach(function(f){var g=f.getGeometry();if(g)g.forEachLatLng(function(ll){b.extend(ll);});});if(!b.isEmpty())map.fitBounds(b,60);}

function updateInfoPanel(content){
  var el=document.getElementById('info-text');
  if(!content){el.innerHTML=currentMode==='local'?'폴리곤을 클릭하면 해당 동이 하이라이트됩니다.':'헥사곤을 클릭하여 영역을 선택하세요.<br/><span class="hex-info">복수 선택 가능</span>';el.classList.remove('highlighted');}
  else{el.innerHTML='선택된 구역:<br/><span class="dong-name">'+content+'</span>';el.classList.add('highlighted');}
}

function mapStyles(){return [{elementType:'geometry',stylers:[{color:'#1d2c4d'}]},{elementType:'labels.text.fill',stylers:[{color:'#8ec3b9'}]},{elementType:'labels.text.stroke',stylers:[{color:'#1a3646'}]},{featureType:'administrative',elementType:'geometry',stylers:[{visibility:'off'}]},{featureType:'landscape',elementType:'geometry',stylers:[{color:'#1d3044'}]},{featureType:'poi',elementType:'geometry',stylers:[{color:'#263c3f'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#304a7d'}]},{featureType:'road.highway',elementType:'geometry',stylers:[{color:'#2c6675'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#0e1626'}]}];}

/* ========== 인증 · 계정 (Firebase) ========== */
var fbAuth=null, fbDb=null, currentUser=null, currentRole=null;
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
  var pe=document.getElementById('ppm-email');if(pe)pe.textContent=label;
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
function handleAuth(user){
  currentUser=user;
  if(!user){currentRole=null;document.body.classList.remove('role-admin','role-user');var row=document.getElementById('account-row');if(row)row.style.display='none';showAuthOverlay('signedout');return;}
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
}

function loadSharedContent(){
  if(!fbDb)return;
  fbDb.collection('shared').doc('mapContent').get().then(function(doc){
    if(doc.exists){cloudData=doc.data();if(mapReady)applyCloudData(cloudData);}
  }).catch(function(e){console.warn('shared load fail',e);});
  loadNewsFromCloud();   // 동네소식(지면 이미지) 공유 로드 — 로그인 사용자 모두
}
function applyCloudData(d){
  if(!d)return;
  if(d.settings){var s=d.settings;
    if(s.styleConfig){mergeInto(styleConfig.default,s.styleConfig.default);mergeInto(styleConfig.highlight,s.styleConfig.highlight);if(s.styleConfig.lens)mergeInto(styleConfig.lens,s.styleConfig.lens);}
    if(s.hexStyleConfig){mergeInto(hexStyleConfig.default,s.hexStyleConfig.default);mergeInto(hexStyleConfig.selected,s.hexStyleConfig.selected);}
    if(s.localLabelConfig)mergeInto(localLabelConfig,s.localLabelConfig);
    if(s.zoneLabelConfig)mergeInto(zoneLabelConfig,s.zoneLabelConfig);
    if(s.smoothEnabled!==undefined)smoothEnabled=s.smoothEnabled;
    if(s.zoneMergeBlocks!==undefined)zoneMergeBlocks=s.zoneMergeBlocks;
    if(s.smoothIntensity!==undefined)smoothIntensity=s.smoothIntensity;
    if(s.hexRadiusKm!==undefined)hexRadiusKm=s.hexRadiusKm;
  }
  if(Array.isArray(d.zones)){
    trendZones.slice().forEach(function(z){removeZoneFromMap(z);});
    trendZones=[];
    d.zones.forEach(function(z){trendZones.push({id:z.id||('tz_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),name:z.name,color:z.color,radiusKm:z.radiusKm||hexRadiusKm,hexCenters:z.hexCenters,originalCenters:z.originalCenters||JSON.parse(JSON.stringify(z.hexCenters)),originalRadiusKm:z.originalRadiusKm||z.radiusKm||hexRadiusKm,polygons:[],label:null});});
  }
  if(Array.isArray(d.spots)){spotMessages=d.spots.map(function(s){return {id:s.id||('sp_'+Date.now()+'_'+Math.random().toString(36).slice(2,5)),lat:s.lat,lng:s.lng,text:s.text||'',emoji:s.emoji||'💬',color:s.color||null};});}
  loadLocalSpotsInto();   // 데모가 이 기기에 추가한 스팟 병합
  if(d.spotConfig)mergeInto(spotConfig,d.spotConfig);
  syncSettingsUI();refreshMapStyles();refreshHexStyles();applyGeoJsonToMap();
  if(currentMode==='trend'){showAllZonesOnMap();generateHexagons();}
  renderSpots();   // 모드 무관 항상 스팟 표시
  renderZoneList();refreshZoneLabels();updateLocalLabelStyle();
  savedSettings=snapshotSettings();styleDirty=false;updateApplyBar(); // 클라우드본 = 적용 기준선
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
  'region-default':function(el){
    mpSvg(el,'<path d="'+mpPath(MP_BLOB1)+'" '+mpRegionAttr(styleConfig.default)+'/><path d="'+mpPath(MP_BLOB2)+'" '+mpRegionAttr(styleConfig.default)+'/>');
  },
  'region-highlight':function(el){
    mpSvg(el,'<path d="'+mpPath(MP_BLOB2)+'" '+mpRegionAttr(styleConfig.default)+'/><path d="'+mpPath(MP_BLOB1)+'" '+mpRegionAttr(styleConfig.highlight)+'/>');
  },
  'lens':function(el){var c=styleConfig.lens;
    mpSvg(el,'<path d="M0,0 H200 V64 H0 Z '+mpPath(MP_BLOB1)+'" fill-rule="evenodd" fill="'+hexToRgba(c.fogColor,Number(c.fogOpacity))+'"/>'+
      '<path d="'+mpPath(MP_BLOB1)+'" fill="none" stroke="'+hexToRgba(c.lineColor,Number(c.lineOpacity))+'" stroke-width="1.8"/>'+
      '<text x="194" y="58" text-anchor="end" font-size="9" font-weight="700" fill="#7b8492">전환 '+(Number(c.fadeMs)||250)+'ms</text>');
  },
  'smooth':function(el){
    var sm=smoothEnabled?chaikinSmooth(MP_BLOB1.concat([MP_BLOB1[0]]),smoothIntensity):MP_BLOB1;
    mpSvg(el,'<path d="'+mpPath(MP_BLOB1)+'" fill="none" stroke="#c3cad4" stroke-width="1" stroke-dasharray="3 3"/>'+
      '<path d="'+mpPath(sm)+'" fill="rgba(47,123,255,0.08)" stroke="#2f7bff" stroke-width="1.6"/>');
  },
  'local-label':function(el){var c=localLabelConfig;
    mpChip(el,hexToRgba(c.bgColor,Number(c.bgOpacity)),c.textColor,Math.min(28,Number(c.fontSize)||12),'역삼1동',c.enabled?'':'opacity:.35;');
    if(!c.enabled)el.insertAdjacentHTML('beforeend','<span style="margin-left:6px;font-size:.6rem;color:#98a1ad;">표시 꺼짐</span>');
  },
  'hex':function(el){var d=hexStyleConfig.default;
    var st='fill="'+hexToRgba(d.fillColor,Number(d.fillOpacity))+'" stroke="'+hexToRgba(d.strokeColor,Number(d.strokeOpacity))+'" stroke-width="'+Math.min(5,Number(d.strokeWeight)||1)+'"';
    mpSvg(el,'<polygon points="'+mpHexPts(70,32,20)+'" '+st+'/><polygon points="'+mpHexPts(100,14.7,20)+'" '+st+'/><polygon points="'+mpHexPts(100,49.3,20)+'" '+st+'/><polygon points="'+mpHexPts(130,32,20)+'" '+st+'/>'+
      '<text x="194" y="58" text-anchor="end" font-size="10" font-weight="700" fill="#7b8492">'+Number(hexRadiusKm).toFixed(1)+'km</text>');
  },
  'hex-sel':function(el){var d=hexStyleConfig.default,sl=hexStyleConfig.selected;
    mpSvg(el,'<polygon points="'+mpHexPts(70,32,20)+'" '+mpRegionAttr(d)+'/>'+
      '<polygon points="'+mpHexPts(104,32,20)+'" fill="'+hexToRgba(sl.fillColor,Number(sl.fillOpacity))+'" stroke="'+hexToRgba(sl.strokeColor,Number(sl.strokeOpacity))+'" stroke-width="2"/>');
  },
  'zone-merge':function(el){ // 실제 병합 알고리즘(zoneOutlineLoops)으로 그림
    var R=20,gp={R_lat:R,R_lng:R,colSpacing:1.5*R,rowSpacing:Math.sqrt(3)*R}; // 격자 공식 그대로 → 꼭짓점 정확히 공유
    var centers=[{lat:32,lng:85},{lat:32-gp.rowSpacing/2,lng:85+gp.colSpacing},{lat:32+gp.rowSpacing/2,lng:85+gp.colSpacing}];
    var col='#F2862E',fills='',strokes='';
    centers.forEach(function(c){var v=hexVertices(c.lng,c.lat,gp.R_lat,gp.R_lng);
      fills+='<polygon points="'+v.map(function(pt){return pt.lng.toFixed(1)+','+pt.lat.toFixed(1);}).join(' ')+'" fill="'+hexToRgba(col,0.35)+'" stroke="'+(zoneMergeBlocks?'none':hexToRgba(col,0.8))+'" stroke-width="1.5"/>';});
    if(zoneMergeBlocks)zoneOutlineLoops(centers,gp).forEach(function(loop){
      strokes+='<polygon points="'+loop.map(function(pt){return pt.lng.toFixed(1)+','+pt.lat.toFixed(1);}).join(' ')+'" fill="none" stroke="'+col+'" stroke-width="2.2"/>';});
    mpSvg(el,fills+strokes);
  },
  'zone-label':function(el){var c=zoneLabelConfig;
    mpChip(el,hexToRgba('#F2862E',Number(c.bgOpacity)),c.textColor,Math.min(28,Number(c.fontSize)||11),'강남 핫플');
  },
  'spot':function(el){var c=spotConfig;
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

/* ========== 설정 드래프트: 변경=폰 미러 라이브 프리뷰(내 화면만) → '전체 적용' 시 클라우드 저장 ========== */
var styleDirty=false, savedSettings=null, FACTORY_SETTINGS=null;
function snapshotSettings(){return JSON.parse(JSON.stringify({styleConfig:styleConfig,hexStyleConfig:hexStyleConfig,localLabelConfig:localLabelConfig,zoneLabelConfig:zoneLabelConfig,spotConfig:spotConfig,smoothEnabled:smoothEnabled,smoothIntensity:smoothIntensity,hexRadiusKm:hexRadiusKm,zoneMergeBlocks:zoneMergeBlocks}));}
function applySettingsSnapshot(snap){
  if(!snap)return;
  var oSE=smoothEnabled,oSI=smoothIntensity,oR=hexRadiusKm,oM=zoneMergeBlocks;
  mergeInto(styleConfig.default,snap.styleConfig.default);mergeInto(styleConfig.highlight,snap.styleConfig.highlight);mergeInto(styleConfig.lens,snap.styleConfig.lens);
  mergeInto(hexStyleConfig.default,snap.hexStyleConfig.default);mergeInto(hexStyleConfig.selected,snap.hexStyleConfig.selected);
  mergeInto(localLabelConfig,snap.localLabelConfig);mergeInto(zoneLabelConfig,snap.zoneLabelConfig);
  mergeInto(spotConfig,snap.spotConfig);if(snap.spotConfig&&Array.isArray(snap.spotConfig.emojis))spotConfig.emojis=snap.spotConfig.emojis.slice();
  smoothEnabled=snap.smoothEnabled;smoothIntensity=snap.smoothIntensity;hexRadiusKm=snap.hexRadiusKm;zoneMergeBlocks=snap.zoneMergeBlocks;
  syncSettingsUI();
  refreshMapStyles();refreshHexStyles();refreshSpotStyles();refreshZoneLabels();updateLocalLabelStyle();lensStyleRefresh();
  if(oSE!==smoothEnabled||oSI!==smoothIntensity)applyGeoJsonToMap();
  if(oR!==hexRadiusKm){selectedHexes.clear();if(editingZoneId)cancelEditZone();rezoneAllToCurrentRadius();if(currentMode==='trend'){generateHexagons();updateZoneSaveUI();}}
  if(oM!==zoneMergeBlocks)rerenderZones();
  updatePhoneLens();
}
function markStyleDirty(){styleDirty=true;updateApplyBar();renderMiniPreviews();}
function updateApplyBar(){
  var bar=document.getElementById('settings-apply-bar');if(!bar)return;
  bar.classList.toggle('dirty',styleDirty);
  var msg=document.getElementById('sab-msg');if(msg)msg.textContent=styleDirty?'미리보기 중 · 아직 저장 안 됨':'모든 변경 적용됨';
  var ap=document.getElementById('sab-apply'),rv=document.getElementById('sab-revert');
  if(ap)ap.style.display=styleDirty?'':'none';
  if(rv)rv.style.display=styleDirty?'':'none';
}
function initApplyBar(){
  var ap=document.getElementById('sab-apply'),rv=document.getElementById('sab-revert'),df=document.getElementById('sab-default');
  if(ap)ap.addEventListener('click',function(){savedSettings=snapshotSettings();styleDirty=false;updateApplyBar();cloudSave();});
  if(rv)rv.addEventListener('click',function(){applySettingsSnapshot(savedSettings);styleDirty=false;updateApplyBar();});
  if(df)df.addEventListener('click',function(){applySettingsSnapshot(FACTORY_SETTINGS);markStyleDirty();});
  updateApplyBar();
}
function markCloudDirty(){
  if(!fbDb||!currentUser||currentRole!=='admin')return;
  clearTimeout(cloudSaveTimer);cloudSaveTimer=setTimeout(cloudSave,1500);
}
function cloudSave(){
  if(!fbDb||!currentUser||currentRole!=='admin')return;
  var snap=(styleDirty&&savedSettings)?savedSettings:snapshotSettings(); // 드래프트 중엔 마지막 적용본 유지
  var payload={updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.email||'',
    settings:{styleConfig:snap.styleConfig,hexStyleConfig:snap.hexStyleConfig,localLabelConfig:snap.localLabelConfig,zoneLabelConfig:snap.zoneLabelConfig,smoothEnabled:snap.smoothEnabled,smoothIntensity:snap.smoothIntensity,hexRadiusKm:snap.hexRadiusKm,zoneMergeBlocks:snap.zoneMergeBlocks},
    zones:trendZones.map(function(z){return {id:z.id,name:z.name,color:z.color,radiusKm:z.radiusKm,hexCenters:z.hexCenters,originalCenters:z.originalCenters,originalRadiusKm:z.originalRadiusKm};}),
    spots:spotMessages.filter(function(s){return !s.local;}).map(function(s){return {id:s.id,lat:s.lat,lng:s.lng,text:s.text,emoji:s.emoji,color:s.color||null};}),
    spotConfig:snap.spotConfig};
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

(function(){
  initPanelCollapse();
  initPhoneControls();
  initSidebarResize();
  initPhoneMenu();
  FACTORY_SETTINGS=snapshotSettings();savedSettings=FACTORY_SETTINGS; // 공장 기본값(코드 기본치) 확보
  initApplyBar();
  initMiniPreviews();renderMiniPreviews();
  if(typeof CONFIG==='undefined'||!CONFIG.GOOGLE_MAPS_API_KEY){var it=document.getElementById('info-text');if(it)it.textContent='⚠️ config.js에 API 키를 설정해 주세요.';hideMapLoading();hideAuthOverlay();return;}
  initAuth();
})();
