/* ===================================================
   동 경계 뷰어 – 핵심 로직 (Vanilla JS)
   =================================================== */

var map;
var currentMode = 'local';
/* ========== 온도 컬러 팔레트 (v2.7) — 이 앱의 '온도' 를 말하는 단일 기준 ==========
   식음(연두) → 미지근(노랑) → 따뜻(주황) → 뜨거움(빨강). 순서가 곧 0→1 이다.
   지도 마커·존·AI 버튼·색상 팝업 프리셋이 **전부 이 배열 하나**를 본다.
   ⚠️ CSS 에도 같은 값이 박혀 있다 (style.css 의 `--heat` 폴백, skin-v3.css 의 핀 링 —
   AI 버튼의 aiHeatFlow 그라디언트는 v2.15 에서 삭제됨). 여기를 바꾸면 그쪽도 같이
   바꾼다 — 색은 CSS 변수로 못 넘기는 자리(키프레임)가 있어서 한 벌로 못 모은다. */
var HEAT_STOPS = ['#9dc64c','#f2c53d','#f2862e','#e23b2a'];
// 색상 팝업 프리셋(v1.65) = 온도 4색(뜨거운 쪽부터) + 브랜드 블루. 온도색을 두 번 적지 않는다.
var PALETTE = HEAT_STOPS.slice().reverse().concat(['#1428A0']);
/* ========== [M09/M14] 페이지 모드 (v1.65 서비스/관리자 분리) ==========
   index.html=서비스(폰 앱, PAGE_MODE 'app') · admin.html=관리자(PC 지도+설정, 'admin').
   미지정(구버전 캐시 등)=app으로 폴백. */
var PAGE_MODE=(typeof window!=='undefined'&&window.PAGE_MODE)||'app';
var IS_APP_PAGE=PAGE_MODE==='app', IS_ADMIN_PAGE=PAGE_MODE==='admin';

/* [M15] 폰 셸 디자인 스킨 — 'new'(v2.0 리빌딩) / 'legacy'(v1.77 까지의 화면).
   갈리는 지점은 `body[data-skin]` 하나뿐이고, 새 스킨의 규칙은 전부 skin-new.css 안에
   `body[data-skin="new"]` 스코프로 들어 있다. style.css 는 건드리지 않았다 —
   되돌리기가 속성 하나여야 새 디자인을 단계적으로 넣을 수 있다.
   값은 콘솔(admin.html › 🎨 스타일 › 디자인)에서 정하고 클라우드로 동기된다.
   app.js 가 </body> 앞에서 로드되므로 document.body 는 이 시점에 이미 있다 —
   초기화까지 기다리면 legacy 화면이 한 번 번쩍인다. */
/* v1.85: 스킨이 셋이다 — legacy(v1.77 화면) / new(v2.0) / v3(v3.0, 기본).
   목록을 한 곳에 둬서 저장값 검증·클라우드 동기·셀렉트가 같은 기준을 본다. */
var APP_SKINS=['legacy','new','v3'];
var appSkin='v3';
try{var _sk0=localStorage.getItem('nowhere_skin');if(APP_SKINS.indexOf(_sk0)>=0)appSkin=_sk0;}catch(e){}
function applySkin(){
  if(!document.body)return;
  document.body.setAttribute('data-skin',appSkin);
  /* 첫 화면은 지도다(`var currentTab='map'`). switchTab 이 돌기 전에도 스킨이 탭을
     알아야 지면 높이 규칙이 걸린다 — 없으면 legacy 기본 높이로 한 번 그려진다. */
  if(!document.body.hasAttribute('data-tab'))document.body.setAttribute('data-tab','map');
}
function setAppSkin(v){
  appSkin=(APP_SKINS.indexOf(v)>=0)?v:'v3';
  try{localStorage.setItem('nowhere_skin',appSkin);}catch(e){}
  applySkin();
  /* v1.84 부터 스킨이 **마크업까지** 가른다(피드 카드 본문·지면 메타 줄) — 속성만 바꾸면
     다음 렌더까지 옛 구조가 남는다. 초기 로드에서도 이 함수가 불릴 수 있어 존재 확인 후 호출. */
  if(typeof renderNews==='function')renderNews();
  if(typeof renderFeed==='function'&&currentTab==='feed')renderFeed();
}
applySkin();

/* ========== [M11] 로컬 모드 ========== */
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

/* ========== [M11] 트렌드 모드 ========== */
var hexPolygons = [];
var selectedHexes = new Map();
var hexRadiusKm = 1.0;
var boundsListener = null;
var REF_LAT_RAD = 37.0 * Math.PI / 180;

var hexStyleConfig = {
  default: { fillColor:'#4fc3f7', strokeColor:'#0288d1', fillOpacity:0.08, strokeWeight:1, strokeOpacity:0.45 },
  selected: { fillColor:'#ff9800', fillOpacity:0.45, strokeColor:'#e65100', strokeWeight:2, strokeOpacity:1 },
};

/* ========== [M03] 트렌드 존 ========== */
var trendZones = [];
var editingZoneId = null;
var zoneMergeBlocks = false;   // true=존 내부 헥사곤 경계 숨김, 합쳐진 외곽선만(한 덩어리)
var editingZoneBackup = null;

/* ========== [M11] 라벨 설정 ========== */
var localLabelConfig = { enabled:false, fontSize:12, textColor:'#ffffff', textOpacity:1, bgColor:'#111318', bgOpacity:0.72 };
var zoneLabelConfig  = { show:true, fontSize:11, textColor:'#ffffff', textOpacity:1, bgOpacity:1.0 };
function txA(o){return (o&&o.textOpacity!=null)?Number(o.textOpacity):1;} // v1.65 글자색 투명도(색상 팝업 공통) — 미지정=불투명(구버전 호환)
var localLabel = null;          // 로컬모드 선택 구역 라벨 오버레이
var selectedFeatureName = null; // 현재 선택 구역 표시명
var selectedFeatureId = null;   // 폰 미러용 선택 구역 식별자
var colorControls = [];         // 색상 트리거 재도색용 레지스트리

/* ========== [M04] 스팟 메시지 (로컬모드, 관리자 생성 · 데모 뷰잉) ========== */
var spotMessages = [];          // 렌더 배열 = adminSpots + demoSpots
var adminSpots = [];            // 관리자 생성(shared/mapContent)
var demoSpots = [];             // 유저 생성(liveSpots · 실시간) 또는 로컬 폴백
var spotConfig = { maxChars:40, fontSize:13, textColor:'#ffffff', textOpacity:1, bgColor:'#1c66e5', bgOpacity:0.92, emojiSize:26,
  emojiPos:'bottom', emojiGap:2, emojiLetterSpacing:0, bubbleRadius:13, tail:true, dotScaleM:1000, dotStyle:'dot',
  emojis:['💬','📍','⭐','🔥','❤️','😀','🎉','📢','☕','🍜','🐶','🌸'] };
// 스팟은 지도에 '고정된 실제 크기'처럼 동작 — 기준 줌(16)에서 설정한 px가 1배, 줌 1레벨당 2배(줌아웃=절반).
// = 항상 같은 미터 범위를 덮음(건물 블럭 1개 크기면 어느 줌에서도 그 블럭 크기 유지). 안전 한계만 아주 넓게.
var SPOT_REF_ZOOM = 16;
var SPOT_SCALE_MIN = 0.02, SPOT_SCALE_MAX = 40;
function spotDotScaleM(){var v=Number(spotConfig.dotScaleM);return isNaN(v)?1000:v;} // 축척(축척자 m)이 이 값 초과로 축소되면 점으로
function spotScale(z){var s=Math.pow(2,z-SPOT_REF_ZOOM);if(s<SPOT_SCALE_MIN)s=SPOT_SCALE_MIN;if(s>SPOT_SCALE_MAX)s=SPOT_SCALE_MAX;return s;}
/* 지도 위 **컨텐츠**(스팟 말풍선·이모지·피드 썸네일·Request 핀·딜 핀)가 쓰는 단일 배율.

   v1.95 는 이 곡선에 0.7~1.6 클램프를 걸었다. 그 클램프가 곧 "줌아웃하면 컨텐츠가
   지면 대비 커진다"의 정체다 — 지도는 절반으로 줄어드는데 컨텐츠는 0.7 에서 멈추니
   같은 컨텐츠가 건물 하나에서 블록 하나를 덮는 크기로 자란다.

   v2.16 부터는 클램프를 걷어내고 **지면 고정**으로 돌린다. `2^(z-16)` 순수 배율이라
   설정한 px 가 어느 줌에서도 같은 미터 범위를 덮는다 — 줌 16 에서 건물 하나였으면
   줌 12 에서도 건물 하나다. 남은 0.02~40 은 안전 한계일 뿐 실질 무제한이다.

   ※ 지역·존 **라벨은 이 곡선을 안 쓴다** (labelScale). 라벨은 지면 위에 놓인 컨텐츠가
     아니라 지도 자체의 이름표라, 지면에 고정하면 시 단위 줌에서 0.4px 로 사라진다.
   ※ 멀리서 점이 되는 것은 contentDot 이 따로 판단한다. */
function contentScale(z){
  if(z==null||!isFinite(z))return 1;
  return spotScale(z);
}
/* 지역·존 이름표 배율 — 지면 고정이 아니라 **읽히는 범위**가 기준이다 (v1.62 의 0.7~1.6). */
var LABEL_SCALE_MIN = 0.7, LABEL_SCALE_MAX = 1.6;
function labelScale(z){
  if(z==null||!isFinite(z))return 1;
  return Math.max(LABEL_SCALE_MIN,Math.min(LABEL_SCALE_MAX,spotScale(z)));
}
/* 점 전환 — **크기가 점까지 미끄러져 간다** (v2.16).

   점이 되는 시점은 예나 지금이나 관리자 설정(spotDotScaleM: 축척자 64px 이 몇 m 를
   덮으면 점인가)이다. 문제는 그 시점에 크기가 **툭 끊겼다**는 것이다 — 실제 설정값
   (dotScaleM=100)에서 줌 17 의 50px 짜리 사진이 줌 16 에서 12px 점이 됐다. 4배 점프다.

   그래서 임계값 **한 줌 전부터** 배율을 점 크기 쪽으로 당긴다(t=0→1). 임계값에 닿는
   순간의 크기가 정확히 점 크기라, 크기는 안 바뀌고 모양만 바뀐다. 그 구간(한 줌)
   밖에서는 순수 지면 고정 배율이다.

   지면 고정이라 아주 멀리서는 설정과 무관하게 컨텐츠가 점보다 작아지는데, 그때도
   점 크기에서 멈추고 점이 된다(s<=floor).

   반환 {dot, scale} — scale 은 점이 아닐 때 쓰는 배율(점 크기 아래로는 안 내려간다). */
var SPOT_DOT_PX = 8;   // .spot-dotmark
var FEED_DOT_PX = 12;  // .feed-pin.fp-dot
var PIN_DOT_PX  = 12;  // .deal-pin.dl-dot .dp-circle / Request 드롭 하한
var DOT_RAMP = 0.5;    // 임계값 대비 이 비율(=한 줌 레벨)부터 점 크기로 당기기 시작
function contentDot(m,z,basePx,dotPx){
  var s=contentScale(z),floor=(basePx>0?dotPx/basePx:0);
  var mpp=mapMpp(m),far,t;
  if(mpp){
    var r=(mpp*64)/spotDotScaleM(); // 1 = 딱 임계값, >1 = 점
    far=r>1;t=Math.max(0,Math.min(1,(r-DOT_RAMP)/(1-DOT_RAMP)));
  }else{far=(z<13);t=far?1:0;}
  return {dot:far||s<=floor,scale:Math.max(floor,s*(1-t)+floor*t)};
}
var spotOverlays = [];          // 메인 지도 SpotBubble
var phoneSpotOverlays = [];     // 폰 지도 SpotBubble
var currentSpotEmoji = '💬';
var selectedSpotId = null;      // 롤오버/선택 강조용
var composerOverlay = null;     // 지도 위 스팟 입력 팝업(관리자)
var SPOT_EMOJIS = ['💬','📍','⭐','🔥','❤️','😀','🎉','📢','☕','🍜','🐶','🌸'];

/* ========== [M09] 폰 미러 (모바일 미리보기) ========== */
var phoneMap = null;            // 폰 프레임 내 2번째 지도
var phoneZoneOverlays = [];     // 폰 지도의 존 오버레이 [{polygons,label}]
var phoneLocalLabel = null;     // 폰 지도의 로컬 선택 라벨
var phoneViewportRect = null;   // 관리자 지도에 표시하는 폰 뷰포트 사각형
var phoneCenterMarker = null;   // 폰 중심 마커
var phoneViewportOn = true;     // 폰 표시영역 오버레이 온오프
var dongIndex = null;           // 동 point-in-polygon 인덱스 [{name,bbox,polys}]
function featKey(f){return f.getProperty('adm_cd')||f.getProperty('adm_nm')||null;}

/* ========== [M01] 로컬 스타일 ========== */
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

/* ========== [M01] 스무딩 (0~1 강도) ========== */
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

/* ========== [M03] 헥사곤 유틸 ========== */
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

/* ========== [M03] 고정 그리드 ========== */
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
    zoneEditDraft.color=zone?zone.color:'#ff9800'; zoneEditDraft.fillA=zone?zoneFillA(zone):0.35; paintZoneEditTrig(); // v1.65 팝업 드래프트
  } else {
    editBar.style.display = 'none';
    if (currentMode==='trend'&&selectedHexes.size>0) { area.style.display=''; }
    else { area.style.display='none'; document.getElementById('zone-form').style.display='none'; document.getElementById('zone-save-btn').style.display=''; }
  }
}

/* ========== [M00] 색상 유틸 ========== */
function hexToRgb(hex){hex=(hex||'#000000').replace('#','');if(hex.length===3)hex=hex.split('').map(function(c){return c+c;}).join('');return {r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16)};}
function hexToRgba(hex,a){var c=hexToRgb(hex);return 'rgba('+c.r+','+c.g+','+c.b+','+(a==null?1:a)+')';}
function mergeInto(target,src){if(target&&src)Object.keys(src).forEach(function(k){target[k]=src[k];});}

/* ========== [M00] 커스텀 라벨 오버레이 (범용) ========== */
function MapLabel(pos,text,style,m){this.position=pos;this.text=text;this.style=style||{};this.div=null;this.setMap(m);}
function initMapLabelClass(){
  MapLabel.prototype=new google.maps.OverlayView();
  MapLabel.prototype._apply=function(d){var s=this.style||{};if(s.bg)d.style.backgroundColor=s.bg;if(s.color)d.style.color=s.color;if(s.fontSize)d.style.fontSize=s.fontSize+'px';};
  MapLabel.prototype.onAdd=function(){var d=document.createElement('div');d.className='map-label-tag';this._apply(d);d.textContent=this.text;this.div=d;this.getPanes().overlayMouseTarget.appendChild(d);};
  MapLabel.prototype.updateStyle=function(style){this.style=style||{};if(this.div)this._apply(this.div);};
  MapLabel.prototype.draw=function(){var p=this.getProjection();if(!p)return;var pos=p.fromLatLngToDivPixel(this.position);
    if(this.div&&pos){
      // v1.62 라벨 크기 안정화: spotScale 곡선으로 줌 연동(클램프 0.7~1.6) — 고정 px는 줌마다 지면 대비 상대 크기가 들쭉날쭉해 보였음
      var m=this.getMap(),z=m&&m.getZoom&&m.getZoom(),s=labelScale(z); // v2.16: 이름표는 지면 고정이 아니라 '읽히는 범위' 기준
      if(CSS_ZOOM_OK){
        // v1.64 버그픽스: CSS zoom은 크기뿐 아니라 left/top 오프셋까지 s배로 곱해 렌더 → 앵커가 pos*s로 밀려 줌마다 라벨이 흔들렸음. 좌표를 s로 나눠 보정(렌더 위치=pos, 중심 정렬은 CSS translate(-50%,-50%))
        this.div.style.zoom=s;this.div.style.left=(pos.x/s)+'px';this.div.style.top=(pos.y/s)+'px';
      }else{
        this.div.style.zoom='';this.div.style.left=pos.x+'px';this.div.style.top=pos.y+'px';
        this.div.style.transform='translate(-50%,-50%) scale('+s+')';
      }
    }};
  MapLabel.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}

/* ========== [M04] 스팟 말풍선 오버레이 (이모지 + 메시지) ========== */
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
    var cmt=document.createElement('span');cmt.className='spot-cmt';bubble.appendChild(cmt);this.cmtEl=cmt; // 의견 수 뱃지 (v1.63)
    wrap.appendChild(bubble);wrap.appendChild(emoji);wrap.appendChild(dot);
    wrap.addEventListener('pointerdown',function(e){self._onDown(e);}); // 포인터 = 마우스+터치(모바일 데모 드래그)
    wrap.addEventListener('click',function(e){ // 탭=상세 팝업 (편집 권한자 탭은 _onDown 경로가 팝업을 열어 중복 방지)
      e.stopPropagation();
      var handled=canEditSpot(self.spot)&&!(currentRole==='admin'&&self.getMap()!==map);
      if(!handled)openContentPop('spot',self.spot);
    });
    this.div=wrap;this.bubbleEl=bubble;this.emojiEl=emoji;this.dotEl=dot;
    if(nhBounceTake(this.spot.id))wrap.classList.add('nh-pop-in'); // drop·post 로 지금 생긴 것 (v2.11)
    if(typeof nhDimEl==='function')nhDimEl(wrap,this.spot.id); // dim 액션의 흐림 유지 (v2.21 — 재렌더가 DOM 을 새로 만든다)
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
      if(dragging&&moved){renderSpots();persistSpotEdit(self.spot);
        if(typeof nhPosNote==='function')nhPosNote(self.spot.id,self.spot.lat,self.spot.lng);} // 무대 항목이면 옮긴 자리를 다음 재생에도 (v2.3)
      else if(!moved&&(!dragging||!isTouch))openContentPop('spot',self.spot); // 탭/클릭=상세 팝업(✏️로 편집 진입 — 터치 롱프레스 후 제자리 해제는 무동작)
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
    // 모드별 컬러 규칙(v1.58): 베이직=무채색 통일(화이트 버블+잉크 텍스트+그레이 점) / 트렌드=온도색(속한 존의 좋아요 열기)
    // — 개별 스팟 색(s.color)·설정 색(bgColor/textColor)은 지도 위에선 모드 규칙이 우선(드로어 칩 등 리스트엔 개별 색 유지)
    var mono=currentMode!=='trend';
    // v2.6: 존 안이라도 항목마다 온도가 다르다 (수동 temp 우선 · 자동=존 온도 둘레로 흩기)
    var baseCol=mono?MONO_PIN:heatColor(contentHeatT(s,s.lat,s.lng,0));
    if(this.dotEl)this.dotEl.style.background=hexToRgba(baseCol,1); // 점 색상 = 버블 색상 규칙과 동일
    this.bubbleEl.textContent=t;
    if(this.cmtEl){ // 의견 수 뱃지 — textContent 대입이 자식을 지우므로 다시 부착 (색=모드 규칙과 동일)
      var cn=(typeof spotComments==='function')?spotComments(s.id).length:0;
      this.cmtEl.textContent=cn?('💬'+cn):'';
      this.cmtEl.style.display=cn?'':'none';
      this.cmtEl.style.background=hexToRgba(baseCol,1);
      this.bubbleEl.appendChild(this.cmtEl);
    }
    this.bubbleEl.style.display=t?'':'none';
    this.bubbleEl.style.color=hexToRgba(mono?MONO_INK:'#ffffff',txA(c)); // 색조=모드 규칙, 투명도=설정(textOpacity) 존중 (v1.65)
    this.bubbleEl.style.fontSize=(Number(c.fontSize)||13)+'px';
    this.bubbleEl.style.setProperty('--spot-bg',mono?hexToRgba('#ffffff',Math.min(Number(c.bgOpacity),0.88)):hexToRgba(baseCol,Math.min(Number(c.bgOpacity),0.82))); // 배경흐림(blur)이 보이도록 알파 상한 (더 낮게는 설정대로)
    // 레이아웃: 이모지 위치/간격, 말풍선 둥글기/꼬리
    var pos=c.emojiPos||'bottom', vertical=(pos==='top'||pos==='bottom');
    this.div.style.flexDirection=vertical?'column':'row';
    this.div.style.gap=(Number(c.emojiGap)||0)+'px';
    var emojiFirst=(pos==='top'||pos==='left');
    this.emojiEl.style.order=emojiFirst?0:2;
    this.bubbleEl.style.order=1;
    this.bubbleEl.style.borderRadius=(Number(c.bubbleRadius)||13)+'px';
    this._tailOn=(c.tail!==false); // 꼬리 방향은 draw()가 배치 방향(_dir)에 맞춰 설정(v1.59 자유 방향)
    this.div.classList.toggle('spot-admin',canEditSpot(s)&&this.getMap&&(currentRole==='admin'?this.getMap()===map:true)); // 편집 가능(관리자=메인만/본인=어디서든) 커서
    this.div.classList.toggle('spot-sel',selectedSpotId===s.id); // 선택 강조(살짝 커짐)
    if(this.getMap&&this.getMap()===phoneMap&&typeof spotInFocus==='function')this.div.classList.toggle('spot-out',!spotInFocus(s)); // 렌즈/존 밖 스팟은 옅게
  };
  SpotBubble.prototype.update=function(cfg){this.cfg=cfg||this.cfg;if(this.div)this._render();};
  SpotBubble.prototype.draw=function(){
    var p=this.getProjection();if(!p||!this.div)return;
    var pos=p.fromLatLngToDivPixel(this.position);
    if(pos){this.div.style.left=pos.x+'px';this.div.style.top=pos.y+'px';this._ax=pos.x;this._ay=pos.y;} // 앵커 픽셀(declutter 참조)
    var m=this.getMap();if(!m)return;var z=m.getZoom();if(z==null)return;
    // v2.16: 이모지가 점(8px) 크기로 줄면 그때부터 점 — 크기가 이어져 전환이 안 튄다.
    // 관리자 축척 임계값(spotConfig.dotScaleM)으로 더 일찍 점이 될 수도 있다.
    // (강조 구역 축척과 독립적: spotConfig.dotScaleM ↔ styleConfig.highlight.spotScaleM)
    var cd=contentDot(m,z,Number(this.cfg.emojiSize)||26,SPOT_DOT_PX),isDot=cd.dot;
    var emojiDot=isDot&&(spotConfig.dotStyle==='emoji'); // 작을 때 이모지로 표시 옵션
    var s=cd.scale; // 지면 고정 배율 (점 크기 아래로는 안 내려간다)
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
      // 말풍선: declutter가 정한 방향으로 앵커 기준 배치 + 그 방향에 맞는 꼬리.
      // v2.6: 기억해 둔 방향(spotDirById)을 먼저 본다 — 오버레이가 새로 만들어져도
      // (renderSpots) 첫 draw 부터 제자리다. 안 그러면 up 으로 한 번 그렸다가 튄다.
      var mem=spotDirById[this.spot.id];
      var dir=this._dir||(mem&&(mem.dir||mem))||'up',ot=dirTransform(dir);
      // v2.9: 네 방향이 다 막히면 조금 더 띄운다(gap). 꼬리 쪽으로만 민다.
      var gap=(this._gap!=null?this._gap:((mem&&mem.gap)||0));
      this._dir=dir;this._gap=gap;
      var gx=(dir==='left'?-gap:(dir==='right'?gap:0)),gy=(dir==='up'?-gap:(dir==='down'?gap:0));
      this.div.style.transformOrigin=ot[0];
      // 띄우기는 translate 로 얹는다 — origin(꼬리 끝)은 그대로라 꼬리가 계속 앵커를 가리킨다
      this.div.style.transform=ot[1]+(gap?' translate('+gx+'px,'+gy+'px)':'')+(zk!==1?' scale('+zk+')':'');
      this.bubbleEl.classList.remove('no-tail','tl-b','tl-t','tl-l','tl-r');
      this.bubbleEl.classList.add(this._tailOn===false?'no-tail':(DIR_TAIL[dir]||'tl-b'));
    }
  };
  SpotBubble.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}

/* ========== [M05] 피드 썸네일 지도 핀 (원형 사진 · Apple Maps 무드, 글로우 없음) ==========
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
  FeedThumb.prototype._canEdit=function(){
    if(this.members.length!==1)return false; // 클러스터는 이동 불가
    // 임베드의 무대 피드(fdn_)는 누구든 옮길 수 있다 (v2.3) — 로그인이 없어 소유자가
    // 없고, 옮긴 자리는 nhPosNote 로 남아 다음 재생의 연출이 된다.
    if(typeof IS_EMBED!=='undefined'&&IS_EMBED&&/^fdn_/.test(String(this.item.id||'')))return true;
    return currentRole==='admin'||ownsContent(this.item); // 만든이(uid/이메일) + 관리자
  };
  FeedThumb.prototype.onAdd=function(){
    var self=this,n=this.members.length;
    var d=document.createElement('div');d.className='feed-pin';
    var im=document.createElement('div');im.className='fp-im';
    var img=document.createElement('img');img.src=this.item.src;img.alt='';im.appendChild(img);
    d.appendChild(im);
    if(nhBounceTake(this.item.id))d.classList.add('nh-pop-in'); // drop·postfeed 로 지금 생긴 것 (v2.11)
    this.div=d;this._paintHeat();
    if(typeof nhDimFeed==='function')nhDimFeed(d,this.members); // dim 액션의 흐림 유지 (v2.21)
    if(n>1){ // 클러스터: 대표 사진 + 개수 뱃지, 탭=멤버 범위로 줌인(펼치기)
      d.classList.add('cluster');
      var b=document.createElement('span');b.className='fp-n';b.textContent=n;d.appendChild(b);
      d.addEventListener('click',function(e){e.stopPropagation();self._expand();});
    }else{ // 단일 핀: 탭=상세 팝업 (편집 권한자는 드래그 이동도)
      if(this._canEdit()){d.classList.add('editable');d.addEventListener('pointerdown',function(e){self._onDown(e);});}
      d.addEventListener('click',function(e){e.stopPropagation();
        if(self._dragged){self._dragged=false;return;} // 드래그 직후 오클릭 방지
        openContentPop('feed',self.item);
      });
    }
    this.getPanes().overlayMouseTarget.appendChild(d); // 전 핀 탭 가능 (v1.60 상세 팝업)
  };
  // 온도색(트렌드 모드에서만 CSS body.mode-trend 스코프로 발현): 개별 수동 온도(temp) 우선, 자동=좋아요 온도. 클러스터=멤버 중 최고
  // v2.6: 존 온도를 중심으로 항목마다 흩는다 (존 밖이면 좋아요 온도가 중심). 클러스터=멤버 최고
  FeedThumb.prototype._paintHeat=function(){
    if(!this.div)return;
    var ht=0;this.members.forEach(function(m){var f=m.f||m,p=m.pos||{};
      var t2=contentHeatT(f,p.lat,p.lng,feedHeatT(f.id));if(t2>ht)ht=t2;});
    this.div.style.setProperty('--heat',heatColor(ht));
  };
  /* 같은 멤버 구성의 핀을 **그대로 이어 쓴다** (v2.16).
     줌마다 renderFeedMarkers 가 전부 지우고 새로 만들면 `<img>` 도 새로 붙는다 —
     디코딩이 끝나기 전 한 프레임이 빈 원으로 그려지는 것이 "줌할 때 사진이 깜박임"의
     정체였다. DOM 을 살려 두고 바뀐 값(좌표·사진·온도·개수)만 덮어쓴다. */
  FeedThumb.prototype._adopt=function(cluster){
    this.members=cluster.items;this.item=cluster.items[0].f;
    this.position=new google.maps.LatLng(cluster.pos.lat,cluster.pos.lng);
    if(!this.div)return;
    if(typeof nhDimFeed==='function')nhDimFeed(this.div,this.members); // 멤버가 바뀌면 흐림도 다시 판정 (v2.21)
    var img=this.div.querySelector('img'); // getAttribute — .src 는 절대경로로 정규화돼 매번 달라 보인다
    if(img&&img.getAttribute('src')!==this.item.src)img.setAttribute('src',this.item.src);
    var b=this.div.querySelector('.fp-n');if(b)b.textContent=this.members.length;
    this._paintHeat();this.draw();
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
      self._dragged=true; // 직후 click은 팝업 대신 무시
      var lat=self.position.lat(),lng=self.position.lng();
      var zz=zoneObjAtCenter(lat,lng);
      feedUpdate(self.item,{lat:lat,lng:lng,region:dongAt(lat,lng)||self.item.region||'',zone:zz?zz.id:null});
      if(typeof nhPosNote==='function')nhPosNote(self.item.id,lat,lng); // 무대 항목이면 옮긴 자리를 다음 재생에도 (v2.3)
      renderFeedMarkers();renderFeedColList();renderDrawerDemo();renderNews();if(currentTab==='feed')renderFeed(); // 다른 지도 핀·리스트 동기화
    }
    document.addEventListener('pointermove',mv); // 팬 중 핀이 손가락에서 벗어나도 추적되게 document에
    document.addEventListener('pointerup',up);
    document.addEventListener('pointercancel',up);
  };
  FeedThumb.prototype.draw=function(){
    var p=this.getProjection();if(!p||!this.div)return;
    var px=p.fromLatLngToDivPixel(this.position);if(!px)return;
    this._ax=px.x;this._ay=px.y; // 앵커=원래 좌표 (declutter 참조)
    // v2.9: 겹침 방지가 밀어낸 만큼을 얹어 그린다
    this.div.style.left=(px.x+(this._ndx||0))+'px';this.div.style.top=(px.y+(this._ndy||0))+'px';
    var m=this.getMap(),z=m?m.getZoom():15;
    // v1.63: 스팟 이모지와 동일한 크기 곡선 — 점 전환 기준도 동일
    // v2.3: 기준 크기만 분리 옵션(feedIconSize, 0=스팟 이모지 크기 따름)
    // v2.16: 지면 고정 배율 + 점 크기에서 이어지는 전환 (contentDot)
    var base=feedIconBase(),cd=contentDot(m,z,base,FEED_DOT_PX);
    var px2=cd.dot?FEED_DOT_PX:Math.round(base*cd.scale);
    this.div.style.width=px2+'px';this.div.style.height=px2+'px';
    this.div.classList.toggle('fp-dot',cd.dot);
  };
  FeedThumb.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}
function clusterFeedPins(m){ // 현재 줌의 월드픽셀 기준 근접(56px) 그룹핑 — 줌인하면 자연히 낱개로 펼쳐짐
  var z=m.getZoom();if(z==null)z=15; // v1.88: 숨김 컨텐츠는 아래 루프에서 제외된다
  var s=256*Math.pow(2,z),TH=56;
  function px(p){
    var sin=Math.max(-0.9999,Math.min(0.9999,Math.sin(p.lat*Math.PI/180)));
    return {x:(p.lng/360+0.5)*s,y:(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*s};
  }
  var cl=[];
  feedItems.slice(0,30).forEach(function(f){
    if(!f.src||f.hidden)return;var pos=feedItemLatLng(f);if(!pos)return; // v1.88 숨김 제외
    var p=px(pos);
    for(var i=0;i<cl.length;i++){
      var dx=p.x-cl[i].x,dy=p.y-cl[i].y;
      if(dx*dx+dy*dy<TH*TH){cl[i].items.push({f:f,pos:pos});return;} // 그룹핑 기준=첫 멤버 픽셀 (그대로)
    }
    cl.push({x:p.x,y:p.y,pos:pos,items:[{f:f,pos:pos}]});
  });
  /* 표시 위치=멤버 중앙값 (v2.11). 첫 멤버 좌표로 두면 줌아웃 중 클러스터가 합쳐질 때마다
     "그때의 첫 멤버" 자리로 핀이 널뛴다 — 배열 순서가 곧 위치가 되는 셈이라, 합쳐진
     덩어리를 대표하지도 않는다. 중앙값은 합쳐져도 그 무리의 가운데로 완만하게 움직인다.
     그룹핑 기준(px)은 안 바꾼다 — 멤버 구성까지 흔들면 다른 문제가 된다. 단일 핀은
     중앙값=자기 좌표라 그대로다. */
  cl.forEach(function(c){
    if(c.items.length<2)return;
    var lat=0,lng=0;
    c.items.forEach(function(o){lat+=o.pos.lat;lng+=o.pos.lng;});
    c.pos={lat:lat/c.items.length,lng:lng/c.items.length};
  });
  return cl;
}
function feedPinKey(c){ // 핀의 신원 = 멤버 id 집합. 같으면 같은 핀이다(클러스터도 포함)
  return c.items.map(function(o){return o.f.id;}).sort().join('|');
}
/* 한 지도의 피드 핀을 **맞춰 놓는다** — 지우고 새로 만드는 대신 있는 것을 이어 쓴다 (v2.16).
   줌아웃으로 클러스터가 합쳐질 때처럼 구성이 실제로 바뀐 핀만 새로 만들어진다. */
function syncFeedPins(m,cur){
  if(!m||!mapPinView.feed.show){cur.forEach(function(o){o.setMap(null);});return [];} // v2.15 표시 끔
  var prev={};
  cur.forEach(function(o){if(o._key&&!prev[o._key])prev[o._key]=o;else o.setMap(null);});
  var out=[];
  clusterFeedPins(m).forEach(function(c){
    var k=feedPinKey(c),o=prev[k];
    if(o){delete prev[k];o._adopt(c);}
    else{o=new FeedThumb(c,m);o._key=k;}
    out.push(o);
  });
  Object.keys(prev).forEach(function(k){prev[k].setMap(null);}); // 남은 것 = 사라진 핀
  return out;
}
function renderFeedMarkers(){ // 피드 사진 = 지도 위 원형 썸네일 핀 (메인+폰 동시, 근접 핀=클러스터)
  if(typeof google==='undefined'||!google.maps||(!map&&!phoneMap))return;
  feedThumbOverlays=syncFeedPins(map,feedThumbOverlays);
  phoneFeedThumbOverlays=syncFeedPins(phoneMap,phoneFeedThumbOverlays);
}
var _fmZoom={m:null,p:null};
function reclusterFeedMarkers(){ // 줌 변경 시에만 재클러스터 (팬은 월드픽셀 기준이라 불변)
  var mz=map?map.getZoom():null,pz=phoneMap?phoneMap.getZoom():null;
  if(mz===_fmZoom.m&&pz===_fmZoom.p)return;
  _fmZoom.m=mz;_fmZoom.p=pz;renderFeedMarkers();
}

/* ========== [M00] 이모지 픽커 (재사용) ========== */
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

/* ========== [M00] Twemoji 통일 렌더링 (OS 무관 동일 이모지) ========== */
// 네이티브 이모지(iOS/Android/PC 상이) → Twemoji SVG <img class="emoji">로 전역 치환.
// CDN(@twemoji/api) 로드 실패 시 네이티브 이모지 그대로(폴백). 인풋 value·native alert/confirm·seedImg(데이터URI 이미지) 내부는 대상 아님.
// 주의: SVG <text>에는 이모지 금지(치환 시 <img>가 SVG 안에 들어가 라벨이 깨짐 — svg 내부는 스킵함).
var TW_OPTS={folder:'svg',ext:'.svg',base:'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/'};
var twQueue=[],twPending=false;
function twParse(el){if(window.twemoji&&el&&el.nodeType===1&&!(el.closest&&el.closest('svg')))twemoji.parse(el,TW_OPTS);}
function twSchedule(el){ // rAF 배치: 렌더 함수들이 노드를 대량 추가해도 프레임당 1회만 파싱
  if(!window.twemoji||!el)return;
  twQueue.push(el);
  if(twPending)return;twPending=true;
  requestAnimationFrame(function(){
    twPending=false;
    var q=twQueue.splice(0),done=[];
    for(var i=0;i<q.length;i++){var t=q[i];if(!t.isConnected||done.indexOf(t)>=0)continue;done.push(t);twParse(t);}
  });
}
function initTwemoji(){
  if(!window.twemoji)return; // CDN 실패 → 네이티브 이모지 유지
  twParse(document.body);
  new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){var m=muts[i];
      if(m.type==='characterData'){if(m.target.parentElement)twSchedule(m.target.parentElement);continue;}
      for(var j=0;j<m.addedNodes.length;j++){var n=m.addedNodes[j];
        if(n.nodeType===3)n=n.parentElement; // textContent 교체 등 텍스트 노드 추가 → 부모 파싱
        if(n&&n.nodeType===1&&n.tagName!=='IMG'&&n.tagName!=='SCRIPT'&&n.tagName!=='STYLE')twSchedule(n);
      }
    }
  }).observe(document.body,{childList:true,subtree:true,characterData:true});
}
initTwemoji(); // 즉시 실행(스크립트가 body 끝에서 로드) — 인증 스플래시부터 통일 렌더링

/* ========== [M00] 온도 색 규칙 (지도 컨텐츠 모드별) ========== */
// 베이직 모드=무채색 통일 / 트렌드 모드=온도색. 팔레트(HEAT_STOPS)는 이 파일 맨 위에 있다.
// 사진 컨텐츠 자체는 컬러 유지 — 크롬(버블·핀·뱃지·링)만 모드 색 규칙을 따름.
var MONO_PIN='#aab2bf', MONO_INK='#2a3140';      // 베이직 무채색: 핀/점 그레이 · 텍스트 잉크
function lerpHex(a,b,t){
  function h(x){return parseInt(x,16);}
  var A=[h(a.slice(1,3)),h(a.slice(3,5)),h(a.slice(5,7))],B=[h(b.slice(1,3)),h(b.slice(3,5)),h(b.slice(5,7))];
  return '#'+A.map(function(v,i){var o=Math.round(v+(B[i]-v)*t);return ('0'+o.toString(16)).slice(-2);}).join('');
}
/* t(0=식음 ~ 1=뜨거움) → 팔레트 위의 색. **정거장 개수와 무관하게** 돈다 (v2.7: 3색 → 4색).
   전에는 0.5 를 기준으로 두 구간을 하드코딩해서, 색을 하나 더하면 가운데 색이 통째로 빠졌다. */
function heatColor(t){
  t=Math.max(0,Math.min(1,Number(t)||0));
  var n=HEAT_STOPS.length;
  if(n===1)return HEAT_STOPS[0];
  var seg=t*(n-1),i=Math.min(n-2,Math.floor(seg));
  return lerpHex(HEAT_STOPS[i],HEAT_STOPS[i+1],seg-i);
}
function feedHeatT(id){ // 피드 온도 = 좋아요 / 현재 최다 좋아요 (읽기 전용: M05 feedItems·likeInfo)
  var max=0;feedItems.forEach(function(f){var n=likeInfo(f.id).n;if(n>max)max=n;});
  return max>0?likeInfo(id).n/max:0;
}
function heatTOf(o,fallbackT){ // 수동 온도(temp 0~100, 관리자 지정) 오버라이드 우선 — 없으면 fallback(자동 계산값)
  return (o&&o.temp!=null&&o.temp!=='')?Math.max(0,Math.min(1,Number(o.temp)/100)):fallbackT;
}
function zoneHeatAt(lat,lng){ // {found,t} — 속한 존과 그 온도 (v2.6: found 를 밖에서도 쓴다)
  var found=null,max=0;
  trendZones.forEach(function(z){var h=zoneTotalHearts(z);if(h>max)max=h;if(!found&&ptInZone(z,lat,lng))found=z;});
  if(!found)return {found:false,t:0};
  return {found:true,t:heatTOf(found,max>0?zoneTotalHearts(found)/max:0)};
}
function zoneHeatT(lat,lng){ // 좌표 온도 = 속한 트렌드 존의 온도. Request 핀은 이걸 그대로 쓴다(존 하나의 신호)
  return zoneHeatAt(lat,lng).t;
}
/* 컨텐츠 **하나**의 트렌드 온도 (v2.6) — 존 온도는 **분포의 중심**이고 색은 항목마다 다르다.

   전에는 존 안의 스팟이 전부 `zoneHeatT` 하나를 그대로 써서 **같은 색 한 덩어리**였다.
   그러면 "어느 구역이 뜨거운가" 만 보이고 "그 안에서 무엇이 뜨거운가" 는 안 보인다.
   규칙: 항목마다 고유 온도를 갖되 **뜨거운 존일수록 뜨거운 항목의 비율이 높고, 식은
   존일수록 식은 항목이 많다** — 그래서 존 온도를 중심으로 흩는다.

   흩는 값은 id 해시라 **결정적**이다. Math.random 이면 렌더할 때마다 색이 바뀌어 지도가
   깜빡이고 시연도 회차마다 달라진다 (v1.72·v2.4 와 같은 이유).
   사람이 정한 `temp` 는 언제나 먼저이고, 흩지 않는다. */
var HEAT_SPREAD=0.6; // 존 온도 둘레로 퍼지는 폭 (0~1 스케일) — 존 온도 ±0.3
/* 0~1 결정적 난수. **비트를 제대로 섞어야 한다** — `h*31+c` 만 쓰면 `sps_0`·`sps_1` 처럼
   끝 글자만 다른 id 가 값도 이웃해서(0.001 차이) 존 안 온도가 한 값으로 뭉친다.
   실제로 그렇게 나왔다: 같은 존 14개가 전부 66. FNV-1a + fmix32 로 눈사태를 만든다. */
function heatJitter(key){
  var s=String(key||''),h=2166136261;
  for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>16;h=Math.imul(h,2246822507);
  h^=h>>>13;h=Math.imul(h,3266489909);
  h^=h>>>16;
  return (h>>>0)/4294967296;
}
function contentHeatT(o,lat,lng,fallbackT){
  if(o&&o.temp!=null&&o.temp!=='')return Math.max(0,Math.min(1,Number(o.temp)/100)); // 수동 지정이 먼저
  var z=zoneHeatAt(lat,lng);
  // 존 밖이면 중심은 호출자가 준 값 — 피드는 좋아요 온도(v1.58), 스팟은 0(식음).
  var base=z.found?z.t:(Number(fallbackT)||0);
  return Math.max(0,Math.min(1,base+(heatJitter(o&&o.id)-0.5)*HEAT_SPREAD));
}

/* ========== [M00] 지도 마커 겹침 방지 (declutter) — 말풍선 방향을 앵커 기준 자유 배치 ========== */
// 순수 기하 함수(단위테스트 가능): 말풍선은 4방향(위/아래/좌/우) 중 이웃과 가장 안 겹치는 쪽으로,
// 동점이면 지도 센터에서 바깥으로 향하는 방향을 선호(자연스러운 부채꼴). 핀·점은 고정 장애물.
var DECL_DIRS=['up','down','left','right'];
/* 말풍선을 앵커에서 얼마나 띄울까 (v2.9). 0 = 꼬리가 앵커에 붙은 기존 배치.
   네 방향이 다 막혔을 때 **조금 더 밀어 보는** 자리다 — 방향만 4개면 밀집 구역에서
   결국 겹친 채로 놓였다. 꼬리는 그만큼 길어 보이지만 어느 앵커의 것인지는 유지된다.

   **말풍선 높이에 비례해야 한다.** 고정값(14·30)으로 뒀더니 같은 방향으로 띄운 두 개가
   여전히 12px 씩 물렸다 — 위로 h 만큼 띄워야 앞의 것 위에 얹힌다. */
function declGaps(h){var u=Math.max(18,Math.round(h)+8);return [0,u,u*2];}
function dirBox(ax,ay,w,h,dir,gap){ // 앵커에 꼬리가 붙는 박스 [x0,y0,x1,y1]
  var g=gap||0;
  if(dir==='up')  return [ax-w/2, ay-h-g, ax+w/2, ay-g];
  if(dir==='down')return [ax-w/2, ay+g,   ax+w/2, ay+h+g];
  if(dir==='left')return [ax-w-g, ay-h/2, ax-g,   ay+h/2];
  return               [ax+g,   ay-h/2, ax+w+g, ay+h/2]; // right
}
function boxOverlap(a,b){var ox=Math.min(a[2],b[2])-Math.max(a[0],b[0]),oy=Math.min(a[3],b[3])-Math.max(a[1],b[1]);return (ox>0&&oy>0)?ox*oy:0;}
function outwardDir(dx,dy){return Math.abs(dx)>Math.abs(dy)?(dx>=0?'right':'left'):(dy>=0?'down':'up');} // 센터→앵커 바깥 방향
/* 핀(사진·Request·타임딜)을 앵커에서 밀어낼 후보 자리 (v2.9).
   황금각으로 돌며 멀어진다 — 어느 쪽으로 밀지 편향이 없고 결정적이다.
   첫 후보는 언제나 제자리(0,0): **안 겹치면 안 움직인다.**

   **거리가 핀 크기에 비례해야 한다.** 고정 12~57px 로 뒀더니 34×46 짜리 핀 다섯이
   한 점에 있을 때 여전히 둘이 물렸다 — 자기 폭만큼은 벌어져야 안 겹친다. */
function pinNudges(w,h){
  var out=[{x:0,y:0}],step=Math.max(16,Math.round((w+h)/2*0.85));
  for(var i=0;i<14;i++){
    var a=i*2.399963,r=step*(1+Math.floor(i/6)*0.8);
    out.push({x:Math.round(r*Math.cos(a)),y:Math.round(r*Math.sin(a))});
  }
  return out;
}
/* 지도 위 겹침 방지 (v2.9 전면 개편).

   전에는 **말풍선만** 자리를 골랐고 핀(사진·Request·딜)은 고정 장애물이었다. 그래서
   핀끼리는 서로 겹쳐도 아무도 안 비켰고(사진 핀은 클러스터가 있지만 종류를 넘나들면
   안 묶인다), 말풍선도 네 방향이 다 막히면 그냥 겹친 채로 놓였다.

   이제 **모든 마커가 후보 자리를 갖는다**:
   - 말풍선: 4방향 × 3거리 = 12 후보 (`cur` 방향을 먼저 본다 — 줌해도 안 튀게, v2.6)
   - 핀: 제자리 + 황금각 11 후보 (제자리가 비면 안 움직인다)
   그리디로 앞선 것들과 안 겹치는 첫 후보에 놓는다. 다 겹치면 겹침이 가장 작은 자리다.

   순서가 곧 우선순위다: **먼저 놓인 것이 자리를 지킨다.** 호출부가 딜·Request 처럼
   드물고 중요한 것을 앞에 넣는다.

   반환: {id:{dir?,dx,dy}} — 말풍선은 dir, 핀은 dx·dy 픽셀 오프셋. */
function declutterBoxes(items,cx,cy){
  var placed=[],out={};
  items.forEach(function(it){if(it.fixed)placed.push([it.ax-it.w/2,it.ay-it.h/2,it.ax+it.w/2,it.ay+it.h/2]);});
  items.filter(function(it){return !it.fixed;}).forEach(function(it){
    var best=null,bestOv=Infinity;
    function tryBox(box,pick){
      var ov=0;
      for(var i=0;i<placed.length&&ov<bestOv;i++)ov+=boxOverlap(box,placed[i]);
      if(ov<bestOv){bestOv=ov;best={box:box,pick:pick};}
      return ov<=0;
    }
    if(it.kind==='bubble'){
      // 지금 방향을 **가장 먼저** 본다 — 비어 있으면 그대로 둔다(줌·팬에 안 튄다).
      var dirs=it.cur?[it.cur].concat(DECL_DIRS.filter(function(d){return d!==it.cur;})):
                      [outwardDir(it.ax-cx,it.ay-cy)].concat(DECL_DIRS);
      var gaps=declGaps(it.h),done=false;
      for(var gi=0;gi<gaps.length&&!done;gi++)
        for(var di=0;di<dirs.length&&!done;di++)
          if(tryBox(dirBox(it.ax,it.ay,it.w,it.h,dirs[di],gaps[gi]),{dir:dirs[di],dx:0,dy:0,gap:gaps[gi]}))done=true;
    }else{
      var nud=pinNudges(it.w,it.h);
      for(var ni=0;ni<nud.length;ni++){
        var n=nud[ni],x=it.ax+n.x,y=it.ay+n.y;
        if(tryBox([x-it.w/2,y-it.h/2,x+it.w/2,y+it.h/2],{dx:n.x,dy:n.y}))break;
      }
    }
    if(best){out[it.id]=best.pick;placed.push(best.box);}
  });
  return out;
}
var DIR_TAIL={up:'tl-b',down:'tl-t',left:'tl-r',right:'tl-l'}; // 말풍선 배치 방향 → 앵커 향한 꼬리 위치
function dirTransform(dir){ // 꼬리 끝이 앵커(div left/top)에 오도록 origin+translate
  if(dir==='down') return ['50% 0%','translate(-50%,0%)'];
  if(dir==='left') return ['100% 50%','translate(-100%,-50%)'];
  if(dir==='right')return ['0% 50%','translate(0%,-50%)'];
  return ['50% 100%','translate(-50%,-100%)']; // up (기존 동작)
}
/* 말풍선 방향을 **스팟 id 로 기억한다** (v2.6).

   전에는 방향이 오버레이 객체(`o._dir`)에만 있었다. 그래서 ① 줌·팬마다 declutter 가
   다시 돌며 방향이 뒤집혔고(줌인하면 버블이 커져 겹침 관계가 통째로 달라진다),
   ② `renderSpots()` 가 오버레이를 새로 만들 때마다 방향이 리셋됐다.
   사용자가 본 "줌인아웃 할 때 스팟 메시지 위치가 변한다" 가 이것이다 — 앵커(좌표)는
   가만히 있는데 말풍선이 앵커의 위/아래/좌/우로 튀어 다녔다.

   이제 한 번 정한 방향은 **그 스팟의 것**으로 남는다. 이미 방향이 있는 말풍선은
   declutter 에서 **고정 장애물**로 취급하고, 방향이 없는 것(새로 뜬 컨텐츠)만 자리를
   고른다 — 새 글 하나 때문에 기존 배치가 흔들리지 않는다. */
var spotDirById={};
var _declTimer=null;
function declutterMarkers(){ // 디바운스 — idle/렌더 후 한 번만
  if(_declTimer)return;
  _declTimer=setTimeout(function(){_declTimer=null;try{
    // v2.9: 타임딜 핀도 넣는다 — 전에는 빠져 있어 딜 위에 사진 핀이 그대로 얹혔다.
    declutterOn(map,spotOverlays,feedThumbOverlays,[],[]);
    declutterOn(phoneMap,phoneSpotOverlays,phoneFeedThumbOverlays,reqMarkers,dealMarkers);
    spotDirForget();
  }catch(e){}},60);
}
/* 사라진 스팟의 기억은 버린다 — 안 버리면 시연을 오래 돌릴수록 표가 계속 자란다. */
function spotDirForget(){
  var live={};
  (typeof spotMessages!=='undefined'?spotMessages:[]).forEach(function(s){live[s.id]=1;});
  Object.keys(spotDirById).forEach(function(id){if(!live[id])delete spotDirById[id];});
}
/* 한 지도의 마커를 겹치지 않게 놓는다 (v2.9).

   순서 = 우선순위다. **드물고 시간에 묶인 것부터** 자리를 잡는다: 타임딜 → Request →
   사진 핀 → 말풍선. 딜·Request 는 몇 개 안 되고 그 자리에 있다는 것 자체가 정보라
   밀리면 안 되고, 말풍선은 앵커 둘레 어디든 놓을 수 있어 가장 유연하다. */
function declutterOn(m,spots,feeds,reqs,deals){
  if(!m||typeof google==='undefined')return;
  reqs=reqs||[];deals=deals||[];
  var all=spots.concat(feeds).concat(reqs).concat(deals),proj=null;
  for(var i=0;i<all.length&&!proj;i++)proj=all[i].getProjection&&all[i].getProjection();
  if(!proj)return;
  var ctr=proj.fromLatLngToDivPixel(m.getCenter());if(!ctr)return;

  var items=[],bubbles=[];
  /* 핀은 **자기 좌표에 고정한다** (v2.27) — 밀지 않고 장애물로만 센다.
     v2.9 는 겹칠 때 핀을 픽셀로 밀어 놨는데, 그 값은 그때의 줌·화면 크기에서 잰 것이라
     **줌을 바꾸거나 창이 달라지면 같은 컨텐츠가 다른 지점에 붙었다**. 지도 위의 것은
     좌표가 곧 그 컨텐츠의 뜻이라(사진이 찍힌 자리·질문이 올라온 자리) 화면 사정으로
     움직이면 안 된다. 겹침은 말풍선 쪽이 방향을 바꿔 피한다 — 그쪽은 앵커가 안 움직인다.
     이미 밀어 둔 값이 있으면 여기서 되돌린다. */
  function addPin(o,dw,dh){
    if(!o.div||o._ax==null)return;
    var r=o.div.getBoundingClientRect();
    items.push({fixed:true,ax:o._ax,ay:o._ay,w:r.width||dw,h:r.height||dh});
    if(o._ndx||o._ndy){o._ndx=0;o._ndy=0;o.draw();}
  }
  deals.forEach(function(o){addPin(o,34,46);});
  reqs.forEach(function(o){addPin(o,34,46);});
  feeds.forEach(function(o){addPin(o,30,30);});

  spots.forEach(function(o){
    if(!o.div||o._ax==null)return;
    if(o.div.classList.contains('spot-dot')){items.push({fixed:true,ax:o._ax,ay:o._ay,w:14,h:14});return;} // 점=고정
    var r=o.bubbleEl.getBoundingClientRect(),w=r.width||60,h=r.height||24;
    var known=spotDirById[o.spot.id];
    if(known){ // v2.6: 이미 자리를 정한 말풍선은 **안 움직인다** — 장애물로만 센다
      var b=dirBox(o._ax,o._ay,w,h,known.dir||known,known.gap||0);
      items.push({fixed:true,ax:(b[0]+b[2])/2,ay:(b[1]+b[3])/2,w:w,h:h});
      if(o._dir!==(known.dir||known)){o._dir=(known.dir||known);o._gap=known.gap||0;o.draw();}
      return;
    }
    items.push({id:'sp_'+bubbles.length,kind:'bubble',ax:o._ax,ay:o._ay,w:w,h:h,cur:o._dir});
    bubbles.push(o);
  });
  if(!bubbles.length)return; // 밀 것이 말풍선뿐이다 (v2.27) — 핀은 장애물로만 셌다

  var res=declutterBoxes(items,ctr.x,ctr.y);
  // 핀은 결과를 안 읽는다 (v2.27) — 좌표에 고정이고 장애물로만 셌다.
  bubbles.forEach(function(o,i){
    var p=res['sp_'+i];if(!p)return;
    spotDirById[o.spot.id]={dir:p.dir,gap:p.gap||0}; // 이 스팟의 자리로 굳힌다
    if(o._dir!==p.dir||o._gap!==(p.gap||0)){o._dir=p.dir;o._gap=p.gap||0;o.draw();}
  });
}

/* ========== [M09] 지도 컨텐츠 상세 팝업 — 스팟/피드/Request 탭 시 크게 보기 ========== */
// 스팟 의견(v1.61): liveChat 컬렉션을 room='spot:<id>'로 재사용(⚠️M06/M12 스키마 공유, 규칙 변경 불필요).
// 소셜 탭은 local:/topic:/private만 노출하므로 spot: 방은 채팅 UI에 안 섞임. 폴백=socMsgs(localStorage).
var cpopRefresh=null; // 라이브 스냅샷 갱신 시 열려 있는 팝업의 의견 리스트 재렌더 훅
function spotComments(id){var k='spot:'+id;return hasLive()?(socLiveMsgs[k]||[]):(socMsgs[k]||[]);}
function addSpotComment(id,t){
  var k='spot:'+id;
  if(hasLive()){
    fbDb.collection('liveChat').doc('c_'+Date.now()+'_'+Math.random().toString(36).slice(2,6))
      .set({room:k,t:t,by:myUid(),name:chatName(),ts:Date.now()}).catch(liveWriteErr); // 스냅샷 에코 → cpopRefresh가 그림
    return;
  }
  (socMsgs[k]=socMsgs[k]||[]).push({me:true,who:chatName(),t:t});saveChat();
  if(typeof refreshSpotStyles==='function')refreshSpotStyles(); // 로컬 폴백: 버블 뱃지 즉시 갱신
}
/* 닫는 소리는 **열려 있던 것을 닫을 때만** 운다 (v2.25) — popclose·nhReset 은 열렸든 아니든
   부르므로, 그냥 울리면 아무 일도 없는 자리에서 소리가 난다. */
function closeContentPop(){var m=document.getElementById('content-pop');
  if(m&&m.style.display!=='none'&&typeof nhSfxPlay==='function')nhSfxPlay('close');
  if(m)m.style.display='none';cpopRefresh=null;}
function cpopGoMap(kind,data,zoom){ // 팝업 '📍 지도에서 보기' — 컨텐츠 탭=팝업 통일 규칙에서 위치 이동은 이 버튼으로
  // zoom: optional. 안 주면 종전대로(줌<15 일 때만 16). 동네 전체를 보여줘야 하는
  // 호출(M16 area)이 14 처럼 넓은 값을 준다 — 16 은 "이 항목 하나" 용이라 동네가 안 보인다.
  closeContentPop();if(typeof closeDrawer==='function')closeDrawer();
  setNavActive('map');switchTab('map');
  if(kind==='spot'){var sp=spotMessages.find(function(x){return x.id===data.id;})||data;focusSpot(sp);return;}
  var lat=data.lat,lng=data.lng;if(lat==null||lng==null)return;
  // panTo 는 투영(projection)이 있어야 움직인다 — 지도가 숨겨져 있으면 getBounds()가 없고
  // panTo 가 **조용히 무시된다.** 임베드(M16)의 PC 지도가 그렇다(display:none). 카메라는
  // PC → 폰 단방향 미러라 그러면 폰 지도까지 같이 멈춘다. 투영이 없으면 setCenter 로 간다
  // (애니메이션은 없지만 안 움직이는 것보다 낫다). 보이는 지도에서는 종전과 동일하다.
  goMapCam(map,lat,lng,zoom);
  if(phoneMap){goMapCam(phoneMap,lat,lng,zoom);
    if(phoneMap.getBounds()){var ins=phoneMapInsets();phoneMap.panBy(0,-(ins.top-ins.bottom)/2);}}
}
function goMapCam(m,lat,lng,z){ // 지도 하나를 (lat,lng)로 — 투영이 없으면 panTo 대신 setCenter
  if(!m)return;
  if(m.getBounds())m.panTo({lat:lat,lng:lng});else m.setCenter({lat:lat,lng:lng});
  if(z)m.setZoom(z);else if(m.getZoom()<15)m.setZoom(16);
}
function cpopOpenEntry(it){ // 피드 리스트 항목 → 상세 팝업 (v1.62 통일: 컨텐츠 탭=팝업, 위치 이동=팝업 안 📍)
  if(it.type==='spot'){var sp=spotMessages.find(function(s){return s.id===it.id;});if(sp)openContentPop('spot',sp);return;}
  var src=feedItems.find(function(x){return x.id===it.id;});
  openContentPop('feed',src||it);
}
function openContentPop(kind,data){
  var m=document.getElementById('content-pop'),body=document.getElementById('cpop-body'),tt=document.getElementById('cpop-title');
  if(!m||!body||!data)return;
  body.innerHTML='';
  cpopRefresh=null; // 앞 팝업의 갱신 훅이 남으면 없어진 DOM 을 다시 그린다 (v2.19)
  // 헤더 액션(v1.63): 제목과 얼라인 — [📍 지도보기][✏️ 수정(권한자)] ... [닫기]
  var ha=document.getElementById('cpop-head-actions');if(ha)ha.innerHTML='';
  function headAct(label,fn,accent){if(!ha)return;var b=document.createElement('button');b.type='button';b.className='cpop-hbtn'+(accent?' accent':'');b.textContent=label;b.addEventListener('click',fn);ha.appendChild(b);}
  headAct('📍 지도보기',function(){cpopGoMap(kind,data);});
  if(kind==='spot'){
    tt.textContent='스팟 메시지';
    body.innerHTML='<div class="cps"><span class="cps-emoji"></span><p class="cps-text"></p><span class="cps-region"></span></div>';
    body.querySelector('.cps-emoji').textContent=data.emoji||'💬';
    body.querySelector('.cps-text').textContent=data.text||'(빈 메시지)';
    body.querySelector('.cps-region').textContent='📍 '+(dongAt(data.lat,data.lng)||'지정 위치');
    if(canEditSpot(data))headAct('✏️ 수정',function(){closeContentPop();openSpotEditor(data.id);},true); // 권한자: 헤더에서 편집 진입
    // 의견(댓글): 메시지 버블 리스트 + 입력 (liveChat room='spot:<id>' 실시간 공유)
    var cbox=document.createElement('div');cbox.className='cps-comments';
    function renderCms(){
      cbox.innerHTML='';
      var arrC=spotComments(data.id);
      if(!arrC.length){var e0=document.createElement('div');e0.className='cps-noc';e0.textContent='아직 의견이 없어요 — 첫 의견을 남겨보세요 💬';cbox.appendChild(e0);}
      arrC.forEach(function(msg){
        var b=document.createElement('div');b.className='cpc-bub'+(msg.me?' me':'');
        var w=document.createElement('i');w.className='cpc-who';w.textContent=msg.who||'이웃';
        var tx=document.createElement('span');tx.className='cpc-t';tx.textContent=msg.t;
        b.appendChild(w);b.appendChild(tx);cbox.appendChild(b);
      });
      cbox.scrollTop=cbox.scrollHeight;
    }
    renderCms();cpopRefresh=renderCms;
    body.appendChild(cbox);
    var ir=document.createElement('div');ir.className='cps-inputrow';
    ir.innerHTML='<input type="text" maxlength="120" placeholder="의견 남기기 (Enter)" /><button type="button" class="action-btn accent small">보내기</button>';
    var cin=ir.querySelector('input');
    function sendCm(){var t2=(cin.value||'').trim();if(!t2)return;cin.value='';addSpotComment(data.id,t2);if(!hasLive())renderCms();}
    ir.querySelector('button').addEventListener('click',sendCm);
    cin.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();sendCm();}});
    body.appendChild(ir);
  }else if(kind==='feed'){
    tt.textContent='피드 컨텐츠';
    var L=likeInfo(data.id);
    var wrap=document.createElement('div');wrap.className='cpf';
    if(data.src){var im=document.createElement('img');im.className='cpf-img';im.src=data.src;im.alt='';wrap.appendChild(im);}
    if(data.desc){var ds=document.createElement('p');ds.className='cpf-desc';ds.textContent=data.desc;wrap.appendChild(ds);}
    var r1=document.createElement('div');r1.className='cpf-row';
    r1.innerHTML='<span class="cpf-name"></span><span class="cpf-region"></span>';
    r1.querySelector('.cpf-name').textContent=data.name||'익명';
    r1.querySelector('.cpf-region').textContent='📍 '+(data.region||'우리 동네');
    wrap.appendChild(r1);
    var r2=document.createElement('div');r2.className='cpf-row';
    r2.innerHTML='<span class="cpf-like">♥ '+L.n+'</span><span class="cpf-time"></span>'+(data.kind==='cam'?'<span class="fc-live">LIVE</span>':'');
    r2.querySelector('.cpf-time').textContent=data.ts?timeAgo(data.ts):'';
    wrap.appendChild(r2);
    body.appendChild(wrap); // 지도 보기 버튼은 헤더 공통(headAct)
  }else if(kind==='req'){
    tt.textContent='현장 Request';
    var mineR=(typeof isMyReq==='function')&&isMyReq(data),act=reqActive(data),n=(data.answers||[]).length;
    body.innerHTML='<div class="cpr"><p class="cpr-q"></p><div class="cpf-row"><span class="cpf-region"></span><span class="rqc-left" data-rq-left=""></span></div><div class="cpr-state"></div></div>';
    body.querySelector('.cpr-q').textContent='"'+data.q+'"';
    body.querySelector('.cpf-region').textContent='📍 '+(data.place||'');
    body.querySelector('.cpr-state').textContent=(act?'⏳ 답변 받는 중':'⏱ 종료')+' · 답변 '+n+'개';
    var lf=body.querySelector('[data-rq-left]');lf.setAttribute('data-rq-left',data.id); // 1초 티커(tickReqRemain)가 갱신
    var rl=reqRemainLabel(data);lf.textContent=rl?('⏱ '+rl):'';
    if(n){ // 도착한 답변 목록 — 요청자만 보던 것을 푼다 (v2.18): 답을 쓴 사람도 제 답이 앉는 것을 본다
      var ansBox=document.createElement('div');ansBox.className='rqc-answers';
      (data.answers||[]).forEach(function(a){
        var it=document.createElement('div');it.className='rqa-item';
        if(a.t){var tx=document.createElement('span');tx.className='rqa-t';tx.textContent=a.t;it.appendChild(tx);}
        if(a.img){var im2=document.createElement('img');im2.className='rqa-img';im2.src=a.img;im2.alt='';it.appendChild(im2);}
        var tm=document.createElement('i');tm.className='rqa-time';tm.textContent=timeAgo(a.ts||0);it.appendChild(tm);
        ansBox.appendChild(it);
      });
      body.appendChild(ansBox);
    }
    /* 라이브는 쓰기가 스냅샷으로 돌아온다 (v2.19) — 그때 이 팝업을 다시 그려야 답이
       목록에 앉는다. 답한 사람 쪽에서는 빈 입력칸이 다시 서서 "안 갔나?" 하고 한 번 더
       보내는 일(답변 중복)을 막고, 요청자 쪽에서는 도착한 답이 열린 팝업에 실린다. */
    cpopRefresh=function(){var f=reqById(data.id);if(f)openContentPop('req',f);};
    if(act&&!mineR){
      /* 현장 유저: 응답 (v2.12 — 팝업 안에서 답한다).
         여태는 네이티브 `prompt()` 였다. 그 창은 **자바스크립트를 멈춰서** 시연에서는
         재생이 그 자리에 서고, 사람이 답하는 모습도 화면에 안 남았다(창은 브라우저 것이다).
         스팟 컴포저와 같은 문법의 입력 줄을 팝업에 둔다 — `answer` 액션은 이 칸에
         글자를 하나씩 넣고 보낸다(nhAnswerTyped). */
      var ar2=document.createElement('div');ar2.className='cpr-reply';
      ar2.innerHTML='<input class="cpr-in" type="text" maxlength="120" placeholder="현장 답변을 적어 주세요" />'
        +'<button type="button" class="action-btn accent small cpr-send">보내기</button>';
      var rin=ar2.querySelector('.cpr-in');
      function sendAns(){
        var t=(rin.value||'').trim();if(!t)return;
        rin.value='';answerRequest(data.id,t);
        /* 방금 쓴 답이 목록에 앉는 것까지 이 화면의 일이다 (v2.18). 다시 그릴 때는
           **지금 저장소에 있는 것**을 본다 (v2.19) — 라이브는 답이 스냅샷으로 돌아오고
           그때 fieldRequests 가 통째로 새 객체가 되므로, 손에 든 data 는 고아가 된다. */
        openContentPop('req',reqById(data.id)||data);
      }
      ar2.querySelector('.cpr-send').addEventListener('click',sendAns);
      rin.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();sendAns();}});
      body.appendChild(ar2);
      var ar3=document.createElement('div');ar3.className='cpop-actions';
      var ph=document.createElement('button');ph.type='button';ph.className='action-btn small';ph.textContent='📷 사진 올리기';
      ph.addEventListener('click',function(){closeContentPop();answerRequestPhoto(data.id);});
      ar3.appendChild(ph);body.appendChild(ar3);
    }
  } // 지도 보기 버튼은 헤더 공통(headAct)
  if(m.style.display==='none'&&typeof nhSfxPlay==='function')nhSfxPlay('open'); // v2.25 — 닫혀 있던 것이 설 때만
  m.style.display='flex';
}
function initContentPop(){
  var m=document.getElementById('content-pop');if(!m)return;
  var x=document.getElementById('cpop-close');if(x)x.addEventListener('click',closeContentPop);
  m.addEventListener('click',function(e){if(e.target===m)closeContentPop();}); // 스크림 탭=닫기
}

/* ========== [M04] 스팟 입력 팝업 오버레이 (지도 위, 추가한 포인트 옆) ========== */
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

/* ========== [M04] 스팟 메시지 렌더/CRUD ========== */
function rebuildSpots(){ // 관리자 + 유저(라이브) 병합 → 렌더
  var seen={};spotMessages=[];
  adminSpots.concat(demoSpots).forEach(function(sp){if(sp&&!seen[sp.id]){seen[sp.id]=1;spotMessages.push(sp);}});
  renderSpots();
}
function liveSpotDoc(sp){return {id:sp.id,lat:sp.lat,lng:sp.lng,text:sp.text||'',emoji:sp.emoji||'💬',color:sp.color||null,temp:(sp.temp!=null&&sp.temp!=='')?Number(sp.temp):null,by:sp.by||myUid(),byEmail:sp.byEmail||myEmail(),ts:sp.ts||Date.now()};}
function persistSpotEdit(sp){ // 개별 스팟 편집 저장 (관리자=클라우드 / 유저=라이브 / 폴백=로컬)
  if(!sp)return;
  if(sp.live){if(hasLive())fbDb.collection('liveSpots').doc(sp.id).set(liveSpotDoc(sp),{merge:true});else saveLocalSpots();}
  else markCloudDirty();
}
/* 스팟 오버레이를 **있는 것은 두고, 바뀐 것만** 만든다 (v2.13).

   여태는 한 번 그릴 때마다 전부 지우고 다시 만들었다(clearSpots → new SpotBubble). 화면이
   같아 보여서 오래 문제가 없었는데, 등장 연출이 붙자 드러났다: `drop` 하나에 **모든**
   말풍선이 새 DOM 이 되니 이미 있던 것들도 다시 태어나며 같이 튄다(사용자: "기존 메시지도
   바운스가 된다"). 피드 핀은 사진 한 장이라 다시 만들어도 티가 안 나서 새 것만 튀는 것처럼
   보였다 — 같은 구조인데 증상만 달랐다.

   그래서 id 로 짝을 맞춘다. 남아 있는 것은 그 오버레이를 그대로 쓰고(좌표·설정만 새로
   반영), 없어진 것만 걷고, 새로 생긴 것만 만든다. 등장 연출이 **정말 새로 생긴 것에만**
   붙는 것은 이 구조라야 성립한다. 덤으로 재렌더마다 나던 DOM 교체가 사라진다. */
function renderSpots(){
  if(!mapPinView.spot.show){ // v2.15 표시 설정 — 지도만 비우고, 이 함수가 하던 연쇄(피드·목록·서랍)는 유지
    clearSpots();renderFeedMarkers();renderSpotList();
    if(typeof renderDrawerDemo==='function')renderDrawerDemo();
    declutterMarkers(); // 게이트 경로도 '렌더 후 재계산' 불변식 유지 — 새 피드 핀이 옛 offset 핀 위에 겹치지 않게
    return;}
  var prevM={},prevP={};
  spotOverlays.forEach(function(o){if(o&&o.spot)prevM[o.spot.id]=o;});
  phoneSpotOverlays.forEach(function(o){if(o&&o.spot)prevP[o.spot.id]=o;});
  var keepM={},keepP={},nextM=[],nextP=[];
  /* v1.88: 숨김은 **여기서** 거른다. `rebuildSpots` 에서 걸러 버리면 `spotMessages` 에서
     사라져 콘솔 표에도 안 보이고 — 숨긴 것을 다시 공개할 방법이 없어진다.
     목록은 원본을 갖고, 화면만 숨긴다. */
  // 스팟 메시지는 모드(베이직/트렌드) 무관하게 항상 표시 — 모드는 지도 구획 방식일 뿐
  function reuse(o,s){
    o.spot=s;o.cfg=spotConfig;
    // 자리가 바뀌었으면(편집·드래그) 새 좌표를 물린다 — 안 그러면 옛 자리에 남는다.
    var ll=o.position;
    if(!ll||ll.lat()!==s.lat||ll.lng()!==s.lng){
      o.position=new google.maps.LatLng(s.lat,s.lng);
      o._dir=null;o._gap=null; // 자리가 바뀌면 방향도 다시 정한다
    }
    if(o.div){o._render();if(o.draw)o.draw();}
  }
  spotMessages.forEach(function(s){
    if(s.hidden)return;
    var om=prevM[s.id];
    if(om){keepM[s.id]=1;reuse(om,s);nextM.push(om);}
    else nextM.push(new SpotBubble(s,spotConfig,map));
    if(phoneMap){
      var op=prevP[s.id];
      if(op){keepP[s.id]=1;reuse(op,s);nextP.push(op);}
      else nextP.push(new SpotBubble(s,spotConfig,phoneMap));
    }
  });
  // 짝을 못 찾은 것 = 사라진 스팟(또는 숨긴 것) — 그것만 걷는다.
  Object.keys(prevM).forEach(function(id){if(!keepM[id])prevM[id].setMap(null);});
  Object.keys(prevP).forEach(function(id){if(!keepP[id])prevP[id].setMap(null);});
  spotOverlays=nextM;phoneSpotOverlays=nextP;
  renderFeedMarkers(); // 피드 썸네일 핀도 같은 타이밍에 갱신(지도 준비/모드 전환/클라우드 반영)
  renderSpotList();if(typeof renderDrawerDemo==='function')renderDrawerDemo();
  declutterMarkers(); // 렌더 후 겹침 방지 재계산(디바운스)
}
/* ========== [M04] 스팟 메시지 목록(관리자 · 컨텐츠 설정) ========== */
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
    item.querySelector('.spot-item-dot').style.background=hexToRgba(s.color||spotConfig.bgColor||'#1c66e5',s.alpha!=null?Number(s.alpha):1);
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
function primaryMap(){return ((IS_APP_PAGE||(window.matchMedia&&window.matchMedia('(max-width:768px)').matches))&&phoneMap)?phoneMap:map;} // 서비스 페이지=폰 지도(v1.65)
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
  /* 마우스 롱프레스 (v2.27) — 터치·우클릭만 있던 것을 마우스 꾹 누름에도 연다.
     데스크톱 서비스 페이지·persona-vc 임베드 시연은 마우스라 이 길이 없으면
     "꾹 누르면 추가"가 없는 기능처럼 보였다. 규칙은 터치와 동일(520ms·이동 12px 취소). */
  var mt=null,msx=0,msy=0;
  el.addEventListener('mousedown',function(e){if(e.button!==0||onContent(e))return;msx=e.clientX;msy=e.clientY;clearTimeout(mt);
    mt=setTimeout(function(){openAddMenu(mapObj,el,clientToLatLng(mapObj,el,msx,msy),msx,msy);},520);});
  el.addEventListener('mousemove',function(e){if(mt!=null&&(Math.abs(e.clientX-msx)>12||Math.abs(e.clientY-msy)>12)){clearTimeout(mt);mt=null;}});
  el.addEventListener('mouseup',function(){clearTimeout(mt);mt=null;});
  el.addEventListener('mouseleave',function(){clearTimeout(mt);mt=null;});
}
function removeSpot(id){
  var inAdmin=adminSpots.some(function(s){return s.id===id;});
  if(inAdmin){adminSpots=adminSpots.filter(function(s){return s.id!==id;});rebuildSpots();markCloudDirty();return;}
  if(hasLive()){fbDb.collection('liveSpots').doc(id).delete();return;} // 스냅샷이 반영
  demoSpots=demoSpots.filter(function(s){return s.id!==id;});rebuildSpots();saveLocalSpots();
}
function saveLocalSpots(){
  try{localStorage.setItem('nowhere_localSpots',JSON.stringify(
    demoSpots.map(function(s){return {id:s.id,lat:s.lat,lng:s.lng,text:s.text,emoji:s.emoji,color:s.color||null,alpha:(s.alpha!=null?Number(s.alpha):null),temp:(s.temp!=null&&s.temp!=='')?Number(s.temp):null,by:s.by||'',byEmail:s.byEmail||''};})
  ));}catch(e){}
}
function loadLocalSpotsInto(){ // 로컬 폴백 전용 (라이브면 liveSpots 스냅샷이 담당)
  if(hasLive())return;
  /* 빈 무대 임베드는 **아무것도 안 읽는다** (v2.12, 콘솔 D95). 이 함수는 지도 부팅의
     geojson 콜백에서 불려서 `nhEmbedIsolate` 보다 **나중에** 돈다 — 그래서 여기서
     막지 않으면, 방금 비운 화면에 같은 오리진(실서비스·관리자)에서 쓴 글이 다시 깔린다.
     기능 데모에 뜨는 것은 컨텐츠 탭이 깐 것뿐이어야 한다. */
  if(IS_CLEAN_EMBED){demoSpots=[];return;}
  try{
    var arr=JSON.parse(localStorage.getItem('nowhere_localSpots')||'[]');
    demoSpots=arr.map(function(s){return {id:s.id,lat:s.lat,lng:s.lng,text:s.text||'',emoji:s.emoji||'💬',color:s.color||null,alpha:(s.alpha!=null?s.alpha:null),temp:(s.temp!=null?s.temp:null),by:s.by||'',byEmail:s.byEmail||'',live:true};});
  }catch(e){}
}
function promptDeleteSpot(id){if(confirm('이 스팟 메시지를 삭제할까요?'))removeSpot(id);}
/* ========== [M04] 스팟 편집 모달 (관리자: 개별 스팟 수정) ========== */
var editingSpotId=null;
function curEditSpot(){return spotMessages.find(function(x){return x.id===editingSpotId;});}
function openSpotEditor(id){
  var s=spotMessages.find(function(x){return x.id===id;});if(!s)return;
  var modal=document.getElementById('spot-edit-modal');if(!modal)return;
  editingSpotId=id;
  document.getElementById('se-text').value=s.text||'';
  var seT=document.getElementById('se-temp');if(seT)seT.value=(s.temp!=null&&s.temp!=='')?s.temp:''; // 빈값=자동
  renderSpotEditEmoji(s);
  paintSeColor(s.color||spotConfig.bgColor,s.alpha!=null?Number(s.alpha):1);
  modal.style.display='flex';
  var ti=document.getElementById('se-text');if(ti)ti.focus();
}
function closeSpotEditor(){var m=document.getElementById('spot-edit-modal');if(m)m.style.display='none';editingSpotId=null;}
function paintSeColor(hex,a){var sw=document.querySelector('#se-color .ct-fill');if(sw)sw.style.backgroundColor=hexToRgba(hex,a!=null?a:1);}
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
  var seTemp=document.getElementById('se-temp');
  if(seTemp)seTemp.addEventListener('change',function(){var s=curEditSpot();if(!s)return; // 온도(0~100) — 빈값=자동(존 열기)
    s.temp=this.value===''?null:Math.max(0,Math.min(100,parseInt(this.value,10)||0));
    if(s.temp!=null)this.value=s.temp;
    refreshSpotStyles();persistSpotEdit(s);});
  document.getElementById('se-color').addEventListener('click',function(e){e.stopPropagation();var s=curEditSpot();if(!s)return;
    openColorPopup(this,{color:s.color||spotConfig.bgColor,alpha:s.alpha!=null?Number(s.alpha):1,onInput:function(hex,a){s.color=hex;if(a!=null)s.alpha=a;paintSeColor(hex,a);refreshSpotStyles();persistSpotEdit(s);}});});
  document.getElementById('se-delete').addEventListener('click',function(){var s=curEditSpot();closeSpotEditor();if(s)removeSpot(s.id);});
  document.getElementById('se-save').addEventListener('click',closeSpotEditor);
}

function initSpotUI(){
  var addBtn=document.getElementById('spot-add-btn');if(addBtn)addBtn.addEventListener('click',function(){addTargetMap=primaryMap();addTargetDiv=null;addAtLatLng=null;addSpotContent();}); // 사이드바: 바로 센터 추가
  initSpotEditor();
  // Request 컴포저도 같이 닫는다 (v2.19) — 제 입력칸에도 Escape 가 있지만 포커스가 빠지면 그 길이 없다
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeComposer();closeAddMenu();if(typeof closeReqComposer==='function')closeReqComposer();}});
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
  makeColorControl('ct-spot-text',DRAFT.spotConfig,'textColor','textOpacity',mpNoop);
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

/* ========== [M01] 축척 ========== */
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
/* 드로어 뷰. v1.77 부터 실질적으로 'demo' 하나뿐이다 — 폰 안에 콘솔이 없어서 'admin' 뷰로
   갈 길이 사라졌다. 함수는 지우지 않는다: M09 동결 앵커라 콘솔 시나리오가 부를 수 있고,
   지난 방문에서 'admin' 이 남은 localStorage 를 초기화 때 'demo' 로 덮어 되돌린다. */
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
    /* v1.77: 폰 안에는 콘솔이 없다 — 드로어는 둘러보기 전용이다.
       v1.65~v1.76 은 서비스 페이지에서 드로어에 '🧭 둘러보기 / 🛠 관리자' 탭을 만들고
       content/settings 섹션을 통째로 폰 안으로 옮겼다. 그래서 콘솔이 두 군데 있었다 —
       별도 페이지(admin.html)에도, 폰 햄버거 안에도. 서비스는 폰이 전부이고 콘솔은
       메뉴에서 들어가는 별도 페이지라는 컨셉과 어긋난다.
       설정 섹션은 옮기지 않아도 서비스 페이지에서 보이지 않는다 — #left-panel 이
       데스크톱(page-app)·모바일(≤768px) 양쪽에서 이미 display:none 이다. */
    var demo=document.createElement('div');demo.id='drawer-demo'; // 내용은 renderDrawerDemo가 구성
    body.appendChild(demo);
    setDrawerView('demo');
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
/* ===== [M10] 동네소식 지면: 여러 이미지(좌우 스와이프 캐러셀) + 사이드바 리스트 관리(관리자) ===== */
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
    zoneCardStyle=(ZONE_CARD_STYLES.indexOf(this.value)>=0)?this.value:'glass';
    try{localStorage.setItem('nowhere_zonecard',zoneCardStyle);}catch(e){}
    renderDrawerDemo();renderSummaryZones();markCloudDirty();
  });}
  var cv=document.getElementById('news-cardver');
  if(cv){cv.value=String(newsCardVer);cv.addEventListener('change',function(){
    newsCardVer=parseInt(this.value,10)||1;
    try{localStorage.setItem('nowhere_newsver',String(newsCardVer));}catch(e){}
    /* markCloudDirty 도 부른다 (v2.11) — cardVer 는 shared/news 로만 가고 있었는데,
       persona-vc 임베드는 publicSettings(cloudSave)만 읽는다. 안 부르면 지면 타입만
       임베드에 영영 기본값이다. */
    markNewsDirty();markCloudDirty();renderNews();
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
  // nonews (v2.21): drop e:'keep' 으로 깐 카드 — 지도에는 있되 지면에는 안 얹는다.
  var arr=feedItems.filter(function(f){return !!f.src&&!f.hidden&&!f.nonews;}).map(function(f){
    var pc=feedItemLatLng(f);
    var d=(pc&&clat!=null)?((pc.lat-clat)*(pc.lat-clat)+(pc.lng-clng)*(pc.lng-clng)):9e9;
    return {f:f,d:d,pc:pc};
  });
  arr.sort(function(a,b){return a.d===b.d?((b.f.ts||0)-(a.f.ts||0)):(a.d-b.d);}); // 가까운 순 + 최신순
  return arr.slice(0,4).map(function(o){var f=o.f;
    // 정렬용 `d` 는 제곱 좌표차라 화면에 못 쓴다 — 메타 줄에 쓸 실측 거리(m)를 따로 뽑는다
    var dm=(o.pc&&clat!=null)?haversineM(clat,clng,o.pc.lat,o.pc.lng):null;
    return {feed:true,id:f.id,src:f.src,region:f.region||'',zone:f.zone||null,title:f.desc||'',kind:f.kind||'post',ts:f.ts||0,lat:f.lat,lng:f.lng,dist:dm};});
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
    /* 등장 바운스는 **지면 카드(page)에만** 붙인다 (v2.21). 피드에서 파생된 카드(it.feed)까지
       바운스 표를 떼면 ①지면 사진이 지도 핀과 같이 튀고 ②표(스팟·피드는 2장 — PC·폰 지도
       몫)를 여기서 한 장 훔쳐 가서 정작 지도 핀 하나가 안 튀었다. 지도 위 컨텐츠만 튄다. */
    if(!it.feed&&typeof nhBounceTake==='function'&&nhBounceTake(it.id))sl.classList.add('nh-pop-in'); // drop 으로 지금 생긴 지면 (v2.11)
    var im=document.createElement('img');im.src=it.src;im.alt='';sl.appendChild(im);
    var grad=document.createElement('div');grad.className='cps-grad';sl.appendChild(grad);
    var body=document.createElement('div');body.className='cps-body';
    var place=document.createElement('span');place.className='cps-place';place.textContent=it.region||'';
    var ttl=document.createElement('span');ttl.className='cps-title';ttl.textContent=it.title||'';
    body.appendChild(place);body.appendChild(ttl);
    /* [M10] 새 스킨 메타 줄 (v1.84) — v1.81 에서 "마크업 변경이라 스킨 밖의 일"로 미뤄 둔 것.
       **있는 데이터만 쓴다.** 거리·시간은 연관 피드 카드에만 있고 관리자가 올린 지면
       이미지에는 없다 — 없으면 줄 자체를 만들지 않는다(빈 줄이 남으면 껍데기다).
       좋아요는 이미 우측 칩(.cpc-like)으로 나가므로 여기서 되풀이하지 않는다. */
    /* v1.86: 조건이 `==='new'` 였다 — 스킨이 둘일 때만 맞는 식이다. v3 도 메타 줄을
       쓰므로 **legacy 가 아니면** 으로 뒤집는다. 새 스킨이 또 생겨도 자동으로 포함된다. */
    if(appSkin!=='legacy'&&it.feed){
      var mp=[];
      if(it.dist!=null)mp.push(it.dist>=1000?(it.dist/1000).toFixed(1)+'km':(Math.round(it.dist/10)*10)+'m');
      if(it.ts)mp.push(timeAgo(it.ts));
      if(mp.length){var mtl=document.createElement('span');mtl.className='cps-meta';mtl.textContent=mp.join(' · ');body.appendChild(mtl);}
    }
    sl.appendChild(body);
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
/* ── [M10] v1.90 지역 Overview 글래스 패널 ───────────────────────────────────
   지면 카드를 탭하면 그 지역의 '지금'이 한 판에 뜬다. 시안의 아트보드 17.

   ⚠️ **v1.62 규칙을 하나 바꾼다.** 그때 "지면 캐러셀=스와이프 열람 전용(클릭 액션 없음)"
   으로 정했는데, 시안은 지면 카드 자체를 Overview 로 들어가는 문으로 쓴다.
   스와이프는 그대로 두고 **탭에만** 액션을 붙인다(드래그 중이면 열지 않는다).

   **칩은 있는 데이터만 만든다**(v1.81 교훈 — 채울 것이 없으면 껍데기다).
   시안의 `💬 40k`·`👥 현장 682명` 같은 숫자는 이 앱에 없어서 쓰지 않고,
   실제로 세어지는 것만 올린다: 온도 · 스팟 · 사진 · Request · 타임딜. */
function ovChipData(){
  var out=[];
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());
  if(c&&typeof heatTOf==='function'){
    var t=zoneHeatT(c.lat(),c.lng()); // 0~1 열기 → 시안의 °C 눈금(36.5~99.9)
    if(t!=null)out.push({t:'🔥 '+(36.5+t*63.4).toFixed(1)+'°C',hot:true});
  }
  var region=focusedRegionName()||currentCenterDong();
  if(region)out.push({t:'📍 '+region});
  var nSpot=spotMessages.filter(function(s){return !s.hidden;}).length;
  if(nSpot)out.push({t:'💬 스팟 '+nSpot});
  var nPhoto=feedItems.filter(function(f){return f.src&&!f.hidden;}).length;
  if(nPhoto)out.push({t:'📸 사진 '+nPhoto});
  var nReq=fieldRequests.filter(reqActive).length;
  if(nReq)out.push({t:'🙋 Request '+nReq});
  var nDeal=timeDeals.filter(dealActive).length;
  if(nDeal)out.push({t:'⏰ 타임딜 '+nDeal});
  var nZone=trendZones.length;
  if(nZone)out.push({t:'⬡ 트렌드 존 '+nZone});
  return out;
}
function openOverview(){
  var p=document.getElementById('ov-panel');if(!p)return;
  var chips=document.getElementById('ov-chips');
  chips.innerHTML='';
  ovChipData().forEach(function(c){
    var s=document.createElement('span');s.className='ov-chip'+(c.hot?' hot':'');s.textContent=c.t;chips.appendChild(s);
  });
  // AI 한 줄 요약 — M08 이 이미 실데이터로 만든다. 없으면 문단 자체를 비운다
  var q=document.getElementById('ov-quote');
  q.textContent=(typeof aiMapSummary==='function')?('“'+aiMapSummary()+'”'):'';
  q.style.display=q.textContent?'':'none';
  // 사진 서클 — 실제 피드 썸네일 5장
  var ph=document.getElementById('ov-photos');ph.innerHTML='';
  feedItems.filter(function(f){return f.src&&!f.hidden;}).slice(0,5).forEach(function(f){
    var s=document.createElement('span');s.className='ov-ph';
    var im=document.createElement('img');im.src=f.src;im.alt='';s.appendChild(im);ph.appendChild(s);
  });
  ph.style.display=ph.children.length?'':'none';
  // 소식 카드 — 지금 보고 있는 지면 슬라이드 그대로
  var nb=document.getElementById('ov-news');nb.innerHTML='';
  var it=newsView[Math.min(newsIndex,Math.max(0,newsView.length-1))];
  if(it){
    nb.innerHTML='<span class="ovn-place"></span><b class="ovn-title"></b><span class="ovn-body"></span>';
    nb.querySelector('.ovn-place').textContent=it.region||'';
    nb.querySelector('.ovn-title').textContent=it.title||'';
    nb.querySelector('.ovn-body').textContent=it.feed?('가까운 곳에서 올라온 소식이에요.'):'';
    nb.style.display='';
  }else nb.style.display='none';
  var tour=document.getElementById('ov-tour');
  if(tour)tour.textContent=(focusedRegionName()||currentCenterDong()||'이 지역')+' 둘러보기';
  p.style.display='';
}
function closeOverview(){var p=document.getElementById('ov-panel');if(p)p.style.display='none';}
function initOverview(){
  var p=document.getElementById('ov-panel');if(!p)return;
  var x=document.getElementById('ov-close'),sc=document.getElementById('ov-scrim');
  if(x)x.addEventListener('click',closeOverview);
  if(sc)sc.addEventListener('click',closeOverview);
  var tour=document.getElementById('ov-tour');
  if(tour)tour.addEventListener('click',function(){
    closeOverview();
    if(typeof switchMode==='function'&&currentMode!=='trend')switchMode('trend'); // 둘러보기=트렌드 지도로
  });
  var frame=document.getElementById('cp-frame');
  if(frame)frame.addEventListener('click',function(){
    if(newsDragging)return;          // 스와이프 중이면 탭이 아니다
    if(frame.classList.contains('folded'))return; // 접힌 카드는 펼치기 버튼이 따로 있다
    if(!newsView.length)return;
    openOverview();
  });
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
function loadNews(){
  // 빈 무대 임베드는 저장된 지면을 안 읽는다 (v2.12) — loadLocalSpotsInto 와 같은 이유.
  if(IS_CLEAN_EMBED){newsItems=[];renderNews();return;}
  try{var s=localStorage.getItem('nowhere_news');if(s){var o=JSON.parse(s);if(Array.isArray(o))newsItems=o;}}catch(e){}renderNews();}
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
/* [M09] v1.92 '보기' 토글 — 시안 드로어의 마지막 섹션.
   `boundaryShown`=동 경계(City View) · `reqCardShown`=현장 Request 도착 카드.
   둘 다 **보기 설정**이라 관리자 설정(styleConfig)이 아니라 이 기기의 취향이다 —
   localStorage 에만 남기고 클라우드로 보내지 않는다. */
var boundaryShown=true, reqCardShown=true;
try{
  var _bs=localStorage.getItem('nowhere_boundary');if(_bs==='0')boundaryShown=false;
  var _rc=localStorage.getItem('nowhere_reqcard');if(_rc==='0')reqCardShown=false;
}catch(e){}
function setBoundaryShown(v){
  boundaryShown=!!v;
  try{localStorage.setItem('nowhere_boundary',boundaryShown?'1':'0');}catch(e){}
  if(typeof phoneDataVisibility==='function')phoneDataVisibility();
}
function setReqCardShown(v){
  reqCardShown=!!v;
  try{localStorage.setItem('nowhere_reqcard',reqCardShown?'1':'0');}catch(e){}
  if(!reqCardShown&&typeof hideReqBubble==='function')hideReqBubble();
}
/* [M07] v1.92 코인 — 현장 Request 에 답하면 적립된다(시안의 🪙 500).
   잔액은 이 기기에 남긴다. 실제 정산이 있는 것처럼 보이면 안 되므로 표기는 '적립'까지다. */
var REQ_COIN=500, myCoins=0;
try{var _c=parseInt(localStorage.getItem('nowhere_coins'),10);if(!isNaN(_c))myCoins=_c;}catch(e){}
function addCoins(n){
  myCoins+=n;
  try{localStorage.setItem('nowhere_coins',String(myCoins));}catch(e){}
  syncCoinUI();
}
function syncCoinUI(){
  var el=document.getElementById('ppm-coins');
  if(el)el.textContent='🪙 '+myCoins.toLocaleString();
}
/* 리워드 지급 (v2.27) — v2.18 의 coinFly(답변 즉시 코인이 프로필로 날아가는 연출)를
   대체한다. 컨셉이 바뀌었다: 답을 적으면 팝업이 닫히고, **어느 정도 시간이 지나**
   리워드가 따로 지급된다. 그 순간을 우하단 agent 말풍선(ai-bubble)이 말하고, 말풍선
   위에서 코인이 터진다. 실사용은 answerRequest 가 REQ_REWARD_MS 뒤에 부르고,
   시나리오(M16)는 'reward' 액션으로 시점과 문구를 직접 정한다. */
var REQ_REWARD_MS=6000; // 답변 → 지급까지의 연출 지연 (실사용 경로)
function coinBurst(anchor){ // anchor(말풍선) 위에서 🪙 12개가 부채꼴로 터진다
  try{
    var scr=anchor&&anchor.closest?anchor.closest('.phone-screen'):null;
    if(!scr)scr=document.querySelector('.phone-screen');
    if(!scr||!anchor)return;
    var host=document.createElement('div');host.className='coin-burst';
    var sr=scr.getBoundingClientRect(),ar=anchor.getBoundingClientRect();
    if(!sr.width)return;
    // 말풍선 중심을 앵커로 (자리만 px — 비산 거리는 CSS cqw 가 폰 폭에 맞춘다)
    host.style.left=(ar.left-sr.left+ar.width/2)+'px';
    host.style.top=(ar.top-sr.top+ar.height/2)+'px';
    for(var i=0;i<12;i++){
      var c=document.createElement('span');c.className='cb-coin';c.textContent='🪙';
      var ang=(-90+(i-5.5)*16)*Math.PI/180, d=14+Math.random()*10; // 위쪽 부채꼴
      c.style.setProperty('--dx',(Math.cos(ang)*d).toFixed(1)+'cqw');
      c.style.setProperty('--dy',(Math.sin(ang)*d).toFixed(1)+'cqw');
      c.style.setProperty('--rot',Math.round(Math.random()*520-260)+'deg');
      c.style.animationDelay=(Math.random()*0.12)+'s';
      host.appendChild(c);
    }
    scr.appendChild(host);
    setTimeout(function(){if(host.parentNode)host.parentNode.removeChild(host);},1400);
  }catch(e){}
}
var rewardBubbleTimer=null;
function showRewardBubble(msg){ // msg 비우면 기본 문구 — 시나리오('reward' 액션의 v)가 바꾼다
  addCoins(REQ_COIN);
  var ab=document.getElementById('ai-bubble');if(!ab)return true;
  ab.textContent=(msg&&String(msg).trim().slice(0,120))||('🪙 '+REQ_COIN+' 코인 리워드가 지급됐어요! 현장 답변 감사해요.');
  ab.classList.add('show');
  coinBurst(ab);
  clearTimeout(rewardBubbleTimer);
  rewardBubbleTimer=setTimeout(function(){ab.classList.remove('show');},5000);
  return true;
}
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
function sortedZonesForList(){ // 정렬: 존 합산 좋아요 순(동률=가까운 순) — 포커스 존도 순서 유지(v1.61: 맨앞 이동 폐지, 카드 강조 표시만)
  var fid=focusedZoneId();
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());
  function d2(z){if(!c||!z.hexCenters||!z.hexCenters.length)return 9e9;var ce=zoneCentroid(z);var dy=ce.lat-c.lat(),dx=ce.lng-c.lng();return dy*dy+dx*dx;}
  var arr=trendZones.slice();
  arr.sort(function(a,b){
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
    /* 사진 위에 글자를 얹는다 (v2.27) — 베이직 모드의 지면 카드와 같은 문법이다.
       유리 칩으로 감싸던 시절에는 칩이 사진의 절반을 덮어 어느 존인지보다 칩이 먼저 보였다.
       가독은 칩이 아니라 `.tz-card::after` 의 그라데이션이 맡는다.
       온도는 이름 옆에 함께 — 트렌드 모드에서 존을 가르는 값이 이름 다음으로 그것이다. */
    c.className='tz-card';
    c.innerHTML='<span class="tz-bubble"><span class="tz-line"><b></b><em class="tz-temp"></em></span><i></i></span>'+
      (pho?'<img class="tz-photo" alt="" />':'<span class="tz-photo tz-ph"></span>');
    c.querySelector('b').textContent=zone.name;
    var de=c.querySelector('i');de.textContent=zone.desc||'';if(!zone.desc)de.style.display='none';
    var im2=c.querySelector('img');if(im2)im2.src=pho;
    var ph2=c.querySelector('.tz-ph');if(ph2){ph2.style.background=hexToRgba(zone.color,0.16);ph2.style.color=zone.color;ph2.textContent='⬡';}
  }
  /* v1.90: 스토리 서클(v3)이 쓸 값을 **카드에 실어 둔다.** 존 색과 온도는 JS 만 알고
     CSS 는 모른다 — 변수·속성으로 넘겨 두면 스킨이 마크업을 안 건드리고 원형 링과
     온도 배지를 그릴 수 있다. legacy·v2 는 이 값을 안 쓰므로 영향이 없다. */
  c.style.setProperty('--zone-c',zone.color||'#F4A15C');
  try{
    var _ce=zoneCentroid(zone),_t=(typeof zoneHeatT==='function')?zoneHeatT(_ce.lat,_ce.lng):null;
    if(_t!=null){
      c.dataset.temp=(36.5+Math.max(0,Math.min(1,_t))*63.4).toFixed(1)+'°C'; // 시안의 °C 눈금
      // 카드 안에도 적는다 (v2.27) — v3 서클은 이 자리를 숨기고 자기 배지를 쓴다.
      var _te=c.querySelector('.tz-temp');if(_te)_te.textContent=c.dataset.temp;
    }
  }catch(e){}
  if(focused){ // 포커스 존: 액센트 테두리 + 체크 뱃지
    c.classList.add('focus');
    var ck=document.createElement('span');ck.className='tzf-check';ck.textContent='✓';c.appendChild(ck);
  }
  c.addEventListener('click',function(){if(currentMode!=='trend')switchMode('trend',{noNearby:true});selectPhoneZone(zone);closeDrawer();});
  return c;
}
function buildZoneScroll(){
  var sc=document.createElement('div');sc.className='tz-scroll'+(zoneCardStyle==='list'?' tz-scroll-list':'');
  var s=sortedZonesForList(); // 합산 좋아요 순(포커스 존은 순서 유지·강조 표시만 — v1.61)
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
  box.className='cp-zones'+(zoneCardStyle==='list'?' list':zoneCardStyle==='page'?' page':zoneCardStyle==='circle'?' circle':''); // v2.27 circle=원형 썸네일
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
      c.addEventListener('click',function(){openContentPop('req',rq);}); // v1.62 통일: 카드 탭=상세 팝업(내부 버튼은 stopPropagation)
      c.innerHTML='<span class="rqc-place"></span><span class="rqc-q"></span>'; // 응답 대기/결과는 표시 안 함
      c.querySelector('.rqc-place').textContent=rq.place;
      c.querySelector('.rqc-q').textContent='"'+rq.q+'"';
      if(active&&!rq.seed){ // 남은 시간(분/초) — 1초 티커(tickReqRemain)가 텍스트 갱신
        var lf=document.createElement('span');lf.className='rqc-left';lf.setAttribute('data-rq-left',rq.id);
        lf.textContent='⏱ '+reqRemainLabel(rq);c.appendChild(lf);
      }
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
      qs.appendChild(c); // 카드 탭=상세 팝업(위 생성부에서 바인딩) — 기존 지도 이동은 팝업 안 📍로 (v1.62 통일)
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
      b.addEventListener('click',function(){openContentPop('spot',m);}); // v1.62 통일: 컨텐츠 탭=상세 팝업(지도 이동은 팝업 안 📍)
      cloud.appendChild(b);
    });
    sp.body.appendChild(cloud);
  }
  root.appendChild(sp.sec);
  /* ④ 보기 — v1.92. 시안 드로어의 마지막 섹션이다. 관리자 설정이 아니라 **이 기기의 취향**이라
     설정 블록(드래프트→적용)을 타지 않고 즉시 반영된다. */
  var vw=dsSection('view','보기');
  var box=document.createElement('div');box.className='dv-box';
  [['동 경계 (City View)',boundaryShown,setBoundaryShown],
   ['현장 Request 도착 카드',reqCardShown,setReqCardShown]].forEach(function(row){
    var lb=document.createElement('label');lb.className='dv-row';
    var tx=document.createElement('span');tx.textContent=row[0];
    var ck=document.createElement('input');ck.type='checkbox';ck.checked=!!row[1];
    ck.addEventListener('change',function(){row[2](this.checked);});
    lb.appendChild(tx);lb.appendChild(ck);box.appendChild(lb);
  });
  vw.body.appendChild(box);
  root.appendChild(vw.sec);
  renderSummaryZones();
}

/* ========== [M01] 로컬모드 선택 라벨 ========== */
function featureCentroid(feature){try{var b=new google.maps.LatLngBounds();feature.getGeometry().forEachLatLng(function(ll){b.extend(ll);});return b.getCenter();}catch(e){return null;}}
function localLabelStyle(){return {bg:hexToRgba(localLabelConfig.bgColor,Number(localLabelConfig.bgOpacity)),color:hexToRgba(localLabelConfig.textColor,txA(localLabelConfig)),fontSize:Number(localLabelConfig.fontSize)};}
function showLocalLabel(){
  removeLocalLabel();
  if(currentMode!=='local'||!localLabelConfig.enabled||!selectedFeature)return;
  var c=featureCentroid(selectedFeature);if(!c)return;
  localLabel=new MapLabel(c,selectedFeatureName||'',localLabelStyle(),map);
  if(phoneMap)phoneLocalLabel=new MapLabel(c,selectedFeatureName||'',localLabelStyle(),phoneMap);
}
function removeLocalLabel(){if(localLabel){localLabel.setMap(null);localLabel=null;}if(phoneLocalLabel){phoneLocalLabel.setMap(null);phoneLocalLabel=null;}}
function updateLocalLabelStyle(){if(localLabel){localLabel.updateStyle(localLabelStyle());if(phoneLocalLabel)phoneLocalLabel.updateStyle(localLabelStyle());}else showLocalLabel();}

/* ========== [M03] 존 라벨 스타일 ========== */
function zoneLabelStyle(zoneColor){return {bg:hexToRgba(zoneColor,Number(zoneLabelConfig.bgOpacity)),color:hexToRgba(zoneLabelConfig.textColor,txA(zoneLabelConfig)),fontSize:Number(zoneLabelConfig.fontSize)};}
function zoneLabelsShown(){return zoneLabelConfig.show!==false;} // v1.64 존 라벨 표시 토글(undefined=구버전 클라 호환 → 표시)
function refreshZoneLabels(){trendZones.forEach(function(z){if(z.label)z.label.updateStyle(zoneLabelStyle(z.color));});refreshPhoneZoneLabels();}

/* ========== [M09] 폰 미러 (모바일 미리보기) ========== */
function initPhoneMirror(){
  var el=document.getElementById('phone-map');if(!el||typeof google==='undefined')return;
  var isMobile=window.matchMedia('(max-width:768px)').matches;
  var opts={center:{lat:CONFIG.MAP_CENTER_LAT,lng:CONFIG.MAP_CENTER_LNG},zoom:CONFIG.MAP_ZOOM,
    disableDefaultUI:true,gestureHandling:(isMobile||IS_APP_PAGE)?'greedy':'none',keyboardShortcuts:false,clickableIcons:false}; // 서비스 페이지=폰 지도가 항상 주 지도(v1.65)
  if(CONFIG.MAP_ID&&CONFIG.MAP_ID.length>0)opts.mapId=CONFIG.MAP_ID;else opts.styles=mapStyles();
  phoneMap=new google.maps.Map(el,opts);
  phoneProjHelper=new ProjHelper(phoneMap); // 좌표 변환용
  // 카메라 단방향 미러 (PC → 폰)
  var sync=function(){if(!phoneMap)return;var c=map.getCenter();if(c)phoneMap.setCenter(c);phoneMap.setZoom(map.getZoom());};
  map.addListener('center_changed',sync);
  map.addListener('zoom_changed',sync);
  map.addListener('idle',function(){sync();updatePhoneLocation();updatePhoneViewportOverlay();updateScaleLegend();updatePhoneScale();reclusterFeedMarkers();declutterMarkers();});
  phoneMap.addListener('idle',function(){autoReleaseFocus();updatePhoneViewportOverlay();updatePhoneLocation();updatePhoneLens();updatePhoneScale();reclusterFeedMarkers();declutterMarkers();if(currentMode==='trend'&&currentTab==='map')renderSummaryZones();}); // 존 리스트=포커스/거리 의존이라 idle마다 갱신. autoReleaseFocus=렌즈 갱신 전에
  phoneMap.addListener('click',function(){ clearPhoneSpotlight(); if(currentMode==='local')clearPhoneDong(); }); // 빈 곳 클릭 = 강조 해제
  phoneMap.data.addListener('click',function(e){ // 베이직: 동 탭 → 존과 동일한 포커스+맵 조정
    if(currentMode!=='local')return;
    var d=dongByKey(featKey(e.feature));
    if(!d)return;
    if(phoneSelectedDongKey!==d.key&&visibleRegionCount(phoneMap)<3)return; // 줌인 상태(3개 미만 노출) 신규 선택 무시 — 오터치 방지. 재탭 해제는 허용
    selectPhoneDong(d);
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
function phoneDataVisibility(){if(phoneMap)phoneMap.data.setMap((currentMode==='local'&&boundaryShown)?phoneMap:null);} // v1.92 보기 토글(동 경계)
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
      var poly=new google.maps.Polygon({paths:hexVertices(c.lng,c.lat,gp.R_lat,gp.R_lng),fillColor:zone.color,fillOpacity:zoneFillA(zone),strokeColor:zone.color,strokeWeight:sw,strokeOpacity:so,clickable:true,zIndex:3});
      poly.setMap(phoneMap);polys.push(poly);sumLat+=c.lat;sumLng+=c.lng;
      poly.addListener('click',(function(z){return function(){
        if(phoneSelectedZoneId!==z.id&&visibleZoneCount(phoneMap)<3)return; // 줌인 상태(존 3개 미만 노출) 신규 선택 무시 — 재탭 해제는 허용
        selectPhoneZone(z);
      };})(zone)); // 데모: 존 클릭→강조
    });
    if(zoneMergeBlocks)addZoneOutline(zone.hexCenters,gp,zone.color,phoneMap,polys);   // 합쳐진 외곽선만
    var label=null;
    if(zone.hexCenters.length>0&&zoneLabelsShown())label=new MapLabel(new google.maps.LatLng(sumLat/zone.hexCenters.length,sumLng/zone.hexCenters.length),zone.name,zoneLabelStyle(zone.color),phoneMap);
    phoneZoneOverlays.push({polygons:polys,label:label,color:zone.color,zoneId:zone.id});
  });
}

/* ========== [M03] 폰(데모): 트렌드 존 선택 → 화면 맞춤 + 주변 그레이 처리 강조 ========== */
var phoneSelectedZoneId=null; // 선택 존 = 렌즈 핀 고정(별도 스포트라이트 폴리곤 제거)
var phoneSelectedDongKey=null; // 베이직: 선택 동 = 렌즈 핀 고정 (존과 동일 UX)
/* v1.62 포커스 규칙: ①탭 선택=지도 이동+핀 고정 ②드래그로 선택 지역/존을 벗어나면 자동 해제→센터 추종(자동 렌즈)
   ③지도 탭 선택은 화면에 지역/존 3개 이상 보일 때만(줌인 오터치 방지 — 드로어/리스트 선택은 항상 허용) */
function visibleRegionCount(m){ // 뷰포트와 bbox가 겹치는 동 수 (3에서 조기 종료)
  if(!m||!dongIndex||!dongIndex.length)return 99;
  var b=m.getBounds();if(!b)return 99;
  var sw=b.getSouthWest(),ne=b.getNorthEast(),n=0;
  for(var i=0;i<dongIndex.length;i++){var bb=dongIndex[i].bbox;
    if(bb[0]<ne.lng()&&bb[2]>sw.lng()&&bb[1]<ne.lat()&&bb[3]>sw.lat()){n++;if(n>=3)return n;}}
  return n;
}
function visibleZoneCount(m){ // 뷰포트 안(센터 기준) 트렌드 존 수
  if(!m)return 99;var b=m.getBounds();if(!b)return 99;var n=0;
  trendZones.forEach(function(z){if(!z.hexCenters||!z.hexCenters.length)return;var ce=zoneCentroid(z);if(b.contains(new google.maps.LatLng(ce.lat,ce.lng)))n++;});
  return n;
}
function autoReleaseFocus(){ // 드래그로 선택 지역/존 밖으로 나가면 핀 고정 해제 (idle에서 호출)
  if(!phoneMap)return;var c=phoneVisibleCenter();if(!c)return;
  if(currentMode==='local'&&phoneSelectedDongKey){
    var d=regionAt(c.lat(),c.lng());
    if(!d||d.key!==phoneSelectedDongKey)clearPhoneDong(); // 해제 → updateBasicLens가 센터 동 자동 포커스
  }else if(currentMode==='trend'&&phoneSelectedZoneId){
    var z=zoneObjAtCenter(c.lat(),c.lng());
    if(!z||z.id!==phoneSelectedZoneId){clearPhoneSpotlight();renderSummaryZones();} // 해제 → updateTrendLens가 센터 존 자동 포커스
  }
}
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

/* ========== [M01] 동 위치 판별 (point-in-polygon) ========== */
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

/* ========== [M02] 포커스 렌즈 (폰 공용 엔진): 보는 구역만 선명하게 ==========
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

/* ========== [M02] 스팟 포커스 연동: 렌즈/선택 존 밖 스팟은 살짝 투명(폰 지도만) ========== */
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

/* ========== [M09] 관리자 지도: 폰 표시영역 오버레이 ========== */
function phoneCollapsed(){var m=document.getElementById('phone-mirror');return m&&m.classList.contains('collapsed');}
function clearPhoneViewportOverlay(){if(phoneViewportRect)phoneViewportRect.setMap(null);if(phoneCenterMarker)phoneCenterMarker.setMap(null);}
function updatePhoneViewportOverlay(){
  if(!map||!phoneMap)return;
  if(IS_APP_PAGE||!phoneViewportOn||phoneCollapsed()){clearPhoneViewportOverlay();return;} // 서비스 페이지=PC 지도 없음(v1.65)
  var b=phoneMap.getBounds(),c=phoneMap.getCenter();
  if(!b||!c)return;
  if(!phoneViewportRect)phoneViewportRect=new google.maps.Rectangle({fillColor:'#6ec6ff',fillOpacity:0.06,strokeColor:'#6ec6ff',strokeOpacity:0.95,strokeWeight:2,clickable:false,zIndex:60});
  phoneViewportRect.setOptions({bounds:b});phoneViewportRect.setMap(map);
  if(!phoneCenterMarker)phoneCenterMarker=new google.maps.Marker({clickable:false,zIndex:61,icon:{path:google.maps.SymbolPath.CIRCLE,scale:5,fillColor:'#6ec6ff',fillOpacity:1,strokeColor:'#ffffff',strokeWeight:2}});
  phoneCenterMarker.setPosition(c);phoneCenterMarker.setMap(map);
}
function updatePhoneUI(){ updatePhoneLocation(); }

/* ========== [M09] 폰 컨트롤 (드래그/크기/접기/네비) ========== */
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
  // v1.83: 클래스 토글을 인라인으로 또 하지 않는다 — switchTab 이 setNavActive 를 부른다
  mirror.querySelectorAll('.pn-item').forEach(function(b){b.addEventListener('click',function(){
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

/* ========== [M03] 트렌드 존 CRUD ========== */
function saveTrendZone(name, color, fillA) { // fillA: optional (v1.65 존 채움 투명도, null=기본 0.35)
  var centers = [];
  selectedHexes.forEach(function(d){centers.push({id:d.col+'_'+d.row,lat:d.lat,lng:d.lng});});
  var zone = {id:'tz_'+Date.now(),name:name,color:color,fillA:(fillA!=null?fillA:null),desc:'',photo:null,radiusKm:hexRadiusKm,
    hexCenters:centers,
    originalCenters:JSON.parse(JSON.stringify(centers)),
    originalRadiusKm:hexRadiusKm,
    polygons:[],label:null};
  trendZones.push(zone);
  renderZoneOnMap(zone); selectedHexes.clear(); generateHexagons();
  updateTrendInfo(); updateZoneSaveUI(); renderZoneList(); saveZonesToStorage();
}

function zoneFillA(zone){return (zone&&zone.fillA!=null)?Math.max(0,Math.min(1,Number(zone.fillA))):0.35;} // v1.65 존 채움 투명도(색상 팝업 알파) — 미지정=기존 0.35
function renderZoneOnMap(zone) {
  removeZoneFromMap(zone);
  if (currentMode!=='trend') return;
  var gp = getHexGridParams(zone.radiusKm);
  var sumLat=0, sumLng=0, sw=zoneMergeBlocks?0:2, so=zoneMergeBlocks?0:0.8;
  zone.hexCenters.forEach(function(c){
    var paths=hexVertices(c.lng,c.lat,gp.R_lat,gp.R_lng);
    var poly=new google.maps.Polygon({paths:paths,fillColor:zone.color,fillOpacity:zoneFillA(zone),strokeColor:zone.color,strokeWeight:sw,strokeOpacity:so,clickable:false,zIndex:3});
    poly.setMap(map); zone.polygons.push(poly);
    sumLat+=c.lat; sumLng+=c.lng;
  });
  if(zoneMergeBlocks)addZoneOutline(zone.hexCenters,gp,zone.color,map,zone.polygons);   // 합쳐진 외곽선만
  if (zone.hexCenters.length>0 && zoneLabelsShown()) {
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

function updateZone(zoneId,newName,newColor,newDesc,newTemp,newFillA){ // newTemp: optional (v1.60 존 수동 온도, ''=자동) · newFillA: optional (v1.65 존 채움 투명도)
  var zone=trendZones.find(function(z){return z.id===zoneId;});
  if(!zone) return; zone.name=newName; zone.color=newColor; if(newDesc!=null)zone.desc=newDesc;
  if(newTemp!==undefined)zone.temp=(newTemp===''||newTemp==null)?null:Math.max(0,Math.min(100,parseInt(newTemp,10)||0));
  if(newFillA!==undefined&&newFillA!==null)zone.fillA=Math.max(0,Math.min(1,Number(newFillA)));
  renderZoneOnMap(zone); renderZoneList(); saveZonesToStorage();
  renderSpots();renderRequestMarkers(); // 존 온도 변경 → 스팟/피드/Request 온도색 갱신
}

/* ========== [M03] 반경 변경 시 존 재그리드 (원본 기준) ========== */
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

/* ========== [M03] 존 편집 ========== */
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
  zone.color=zoneEditDraft.color; zone.fillA=zoneEditDraft.fillA; // v1.65 팝업 드래프트 반영(기본 0.35도 명시 저장 — 렌더 동일)
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

/* ========== [M03] 존 리스트 UI ========== */
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
    '<input type="number" class="zi-temp" min="0" max="100" step="1" placeholder="존 온도 0~100 (비우면 자동: 하트합산)" title="트렌드 모드에서 존 안 컨텐츠의 기본 온도색" />'+
    '<div class="zone-form-row"><button type="button" class="color-trigger zi-color-trig" title="존 색·투명도"><span class="ct-swatch"><span class="ct-fill"></span></span></button><button type="button" class="action-btn small zi-photo">📷 사진</button><button type="button" class="action-btn accent small zi-apply">적용</button><button type="button" class="action-btn small zi-close">닫기</button></div>'+
    '<div class="news-url-row"><input type="url" class="zi-url" placeholder="이미지 링크(https://...)" /><button type="button" class="action-btn accent small zi-urlbtn">링크</button></div>'+
    '<input type="file" class="zi-file" accept="image/*" hidden /><img class="zi-thumb" alt="" />';
  form.querySelector('.zi-name').value=zone.name;
  form.querySelector('.zi-desc').value=zone.desc||'';
  form.querySelector('.zi-temp').value=(zone.temp!=null&&zone.temp!=='')?zone.temp:'';
  var ziDraft={color:zone.color,fillA:zoneFillA(zone)}; // v1.65 색상 팝업 드래프트(팔레트+투명도)
  var ziTrig=form.querySelector('.zi-color-trig');
  function paintZi(){var sw=ziTrig.querySelector('.ct-fill');if(sw)sw.style.backgroundColor=hexToRgba(ziDraft.color,ziDraft.fillA);}
  paintZi();
  ziTrig.addEventListener('click',function(e){e.stopPropagation();
    openColorPopup(ziTrig,{color:ziDraft.color,alpha:ziDraft.fillA,onInput:function(hex,a){ziDraft.color=hex;if(a!=null)ziDraft.fillA=a;paintZi();}});});
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
    if(n)updateZone(zoneId,n,ziDraft.color,form.querySelector('.zi-desc').value.trim(),form.querySelector('.zi-temp').value.trim(),ziDraft.fillA);
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

/* ========== [M03] localStorage ========== */
function saveZonesToStorage(){
  var data=trendZones.map(function(z){
    return {id:z.id,name:z.name,color:z.color,fillA:(z.fillA!=null?Number(z.fillA):null),desc:z.desc||'',temp:(z.temp!=null?z.temp:null),photo:z.photo||null,radiusKm:z.radiusKm,hexCenters:z.hexCenters,
      originalCenters:z.originalCenters,originalRadiusKm:z.originalRadiusKm};
  });
  try{localStorage.setItem('nowhere_trendZones',JSON.stringify(data));}catch(e){}
  markCloudDirty();
  publishZoneBook(); // 콘솔이 읽는 공개 목록도 따라 올린다 (v2.24.1)
}
/* 공개 설정 문서만 다시 쓴다 (v2.24.1).
   여태 이 문서는 **설정 적용 버튼**(cloudSave)에서만 쓰였다. 그런데 콘솔이 읽어 가는
   `zoneBook` 은 존을 그리고 고치는 화면에서 바뀐다 — 존을 만들고 콘솔에서 가져오면
   옛 목록이 와서 "자리가 엉망" 이 된다(사용자 보고). 존이 바뀔 때마다 이 문서를 올린다.
   묶어서 한 번만 쓴다: 칸 하나 옮길 때마다 쓰면 드래그 한 번에 수십 번이 된다. */
var zoneBookTimer=null;
function publishZoneBook(){
  if(!fbDb||!currentUser||currentRole!=='admin')return; // 관리자만 — 규칙도 같은 것을 본다
  clearTimeout(zoneBookTimer);
  zoneBookTimer=setTimeout(function(){
    try{
      fbDb.collection('shared').doc('publicSettings').set({
        json:JSON.stringify(settingsSnapshotFull()),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true}).catch(function(e){console.warn('zoneBook publish fail',e);});
    }catch(e){console.warn('zoneBook publish',e);}
  },1500);
}
function loadZonesFromStorage(){
  try{
    var data=JSON.parse(localStorage.getItem('nowhere_trendZones')||'[]');
    data.forEach(function(d){
      trendZones.push({id:d.id,name:d.name,color:d.color,fillA:(d.fillA!=null?d.fillA:null),desc:d.desc||'',photo:d.photo||null,radiusKm:d.radiusKm,hexCenters:d.hexCenters,
        originalCenters:d.originalCenters||JSON.parse(JSON.stringify(d.hexCenters)),
        originalRadiusKm:d.originalRadiusKm||d.radiusKm,
        polygons:[],label:null});
    });
    renderZoneList();
  }catch(e){}
}

/* ========== [M01] 모드 전환 ========== */
function switchMode(mode,opts){
  if(mode===currentMode) return; if(editingZoneId) finishEditZone();
  if(typeof nhSfxPlay==='function')nhSfxPlay('mode'); // 렌즈가 바뀌는 순간 (v2.25) — 실제로 바뀔 때만
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
  // v1.63 모드 전환 트랜스폼: AI 아이콘 스핀(선글라스 착탈 연출) + 지도 살짝 펄스
  var aiB=document.querySelector('.pn-ai');
  if(aiB){aiB.classList.remove('spin');void aiB.offsetWidth;aiB.classList.add('spin');setTimeout(function(){aiB.classList.remove('spin');},700);}
  ['map','phone-map'].forEach(function(id){var el=document.getElementById(id);if(el){el.classList.remove('mode-morph');void el.offsetWidth;el.classList.add('mode-morph');setTimeout(function(){el.classList.remove('mode-morph');},650);}});
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

/* ========== [M01] 초기화 ========== */
function initMap(){
  initMapLabelClass();
  initReqPinClass();initDealPinClass();
  initSpotBubbleClass();
  initFeedThumbClass();
  initSpotComposerClass();
  initReqComposerClass();
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
  // v1.65: 네이티브 컬러 입력 → 통일 색상 팝업(팔레트+투명도). 알파=존 채움 투명도(fillA)
  var saveBtn=document.getElementById('zone-save-btn');var form=document.getElementById('zone-form');
  var palette=document.getElementById('zone-palette');var trig=document.getElementById('ct-zone-new');
  var draft={color:PALETTE[0],fillA:0.35};
  function paintNew(){var sw=trig&&trig.querySelector('.ct-fill');if(sw)sw.style.backgroundColor=hexToRgba(draft.color,draft.fillA);}
  function markSwatch(){if(palette)palette.querySelectorAll('.palette-swatch').forEach(function(s,i){s.classList.toggle('active',PALETTE[i]===draft.color);});}
  if(palette)PALETTE.forEach(function(c){var sw=document.createElement('button');sw.className='palette-swatch';sw.type='button';sw.style.backgroundColor=c;sw.addEventListener('click',function(){draft.color=c;paintNew();markSwatch();});palette.appendChild(sw);});
  if(trig)trig.addEventListener('click',function(e){e.stopPropagation();
    openColorPopup(trig,{color:draft.color,alpha:draft.fillA,onInput:function(hex,a){draft.color=hex;if(a!=null)draft.fillA=a;paintNew();markSwatch();}});});
  saveBtn.addEventListener('click',function(){saveBtn.style.display='none';form.style.display='';document.getElementById('zone-name-input').value='';document.getElementById('zone-name-input').focus();draft.color=PALETTE[0];draft.fillA=0.35;paintNew();markSwatch();});
  document.getElementById('zone-cancel-btn').addEventListener('click',function(){form.style.display='none';saveBtn.style.display='';});
  document.getElementById('zone-confirm-btn').addEventListener('click',function(){var name=document.getElementById('zone-name-input').value.trim();if(!name){document.getElementById('zone-name-input').focus();return;}saveTrendZone(name,draft.color,draft.fillA!==0.35?draft.fillA:null);form.style.display='none';saveBtn.style.display='';});
  document.getElementById('zone-name-input').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('zone-confirm-btn').click();});
  document.getElementById('hex-deselect-btn').addEventListener('click',function(){clearHexSelection();});
}

var zoneEditDraft={color:'#ff9800',fillA:0.35}; // v1.65 존 편집 색상 드래프트(팝업=팔레트+투명도)
function paintZoneEditTrig(){var sw=document.querySelector('#ct-zone-edit .ct-fill');if(sw)sw.style.backgroundColor=hexToRgba(zoneEditDraft.color,zoneEditDraft.fillA!=null?zoneEditDraft.fillA:0.35);}
function initZoneEditBar(){
  document.getElementById('zone-edit-done').addEventListener('click',function(){finishEditZone();});
  document.getElementById('zone-edit-cancel').addEventListener('click',function(){cancelEditZone();});
  var trig=document.getElementById('ct-zone-edit');
  if(trig)trig.addEventListener('click',function(e){e.stopPropagation();
    openColorPopup(trig,{color:zoneEditDraft.color,alpha:zoneEditDraft.fillA!=null?zoneEditDraft.fillA:0.35,onInput:function(hex,a){zoneEditDraft.color=hex;if(a!=null)zoneEditDraft.fillA=a;paintZoneEditTrig();}});});
}


/* ========== [M11] 색상 팝업 (HSV 스펙트럼 + 알파 + 헥스 + 프리셋) ========== */
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
  var presets=PALETTE.concat(['#4fc3f7','#0288d1','#ab47bc','#ffffff','#9e9e9e','#455a64','#111318']); // 기본 색상(온도 4색+#1428A0) + 보조색 — PALETTE 단일 소스(v1.65)
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

/* ========== [M11] 색상 트리거 컨트롤 ========== */
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

/* ========== [M11] 설정 UI 동기화 (불러오기 후 컨트롤 갱신) ========== */
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
  setCheck('zone-label-toggle',DRAFT.zoneLabelConfig.show!==false);
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
  makeColorControl('ct-local-label-text',DRAFT.localLabelConfig,'textColor','textOpacity',mpNoop);
  makeColorControl('ct-local-label-bg',DRAFT.localLabelConfig,'bgColor','bgOpacity',mpNoop);
  makeColorControl('ct-zone-label-text',DRAFT.zoneLabelConfig,'textColor','textOpacity',mpNoop);

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
  var zlt=document.getElementById('zone-label-toggle');
  if(zlt)zlt.addEventListener('change',function(){DRAFT.zoneLabelConfig.show=this.checked;markDirtyFrom(this);});

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

/* ========== [M11] 슬라이더 제거 + 숫자 직접 입력 (모든 수치 설정) ========== */
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

/* ========== [M11] 설정 섹션 아코디언 (탭처럼 펼침/접힘) ========== */
function initSettingsAccordion(){
  if(IS_ADMIN_PAGE)return; // v1.66 관리자 페이지=팝업 내비가 섹션을 하나씩 보여주므로 접기 없이 전부 펼침(폰 드로어만 아코디언)
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

/* ========== [M11] 컨텐츠 설정 패널 토글 ========== */
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

/* ========== [M00] 유틸리티 ========== */
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

/* ========== [M09] 사이드바 폭 조절 (→ 폰 크기, 비율은 cqw로 유지) ========== */
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
  /* 임베드(M16)는 **GPS 를 쓰지 않는다** (v1.73). 실제 위치로 지도가 가면 모든 시나리오가
     "지금 내가 있는 곳" 에서 시작하는데, 거기엔 시드가 없어서 화면이 비고 회차마다 다른
     동네에서 벌어진다 — D25 의 "시연은 매번 같은 결과여야 한다" 와 정면으로 어긋난다.
     시연 도중 위치 권한 팝업이 뜨는 것도 막고, 내 위치 점(myLocation)도 찍지 않는다. */
  if(IS_EMBED){if(typeof nhGoHome==='function')nhGoHome();return;}
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

/* ========== [M12] 인증 · 계정 (Firebase) ========== */
var fbAuth=null, fbDb=null, currentUser=null, currentRole=null;
var SESSION_SID='s_'+Math.random().toString(36).slice(2,10); // 이 접속(세션) 식별자 — 자기 저장 에코 판별용
var cloudData=null, mapReady=false, cloudSaveTimer=null, mapBootStarted=false;

function bootMap(){
  if(mapBootStarted)return; mapBootStarted=true;
  var s=document.createElement('script');
  // v1.93: `places` 추가 — 콘솔의 지역 시드 생성기가 주변 실제 장소를 찾는다.
  // 라이브러리가 없으면 생성기만 안내 후 멈춘다(지도 자체는 영향 없음).
  s.src='https://maps.googleapis.com/maps/api/js?key='+CONFIG.GOOGLE_MAPS_API_KEY+'&libraries=places&callback=initMap';
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
  if(pe)pe.textContent=(role==='admin'&&!IS_APP_PAGE&&window.matchMedia('(min-width:769px)').matches)?((user.email||'')+' · 뷰어 (데모 미리보기)'):label; // 관리자 페이지 폰 미러=데모 기준(서비스 페이지는 실사용)
  var pv=document.getElementById('ppm-version'),av=document.getElementById('app-version');if(pv&&av)pv.textContent=av.textContent;
  // v1.65: 서비스 페이지 프로필 메뉴에 관리자 페이지 링크(관리자만)
  var pmenu=document.getElementById('phone-profile-menu');
  if(pmenu&&IS_APP_PAGE&&role==='admin'&&!document.getElementById('ppm-admin')){
    var bot=pmenu.querySelector('.ppm-bot');
    if(bot){var a=document.createElement('a');a.id='ppm-admin';a.className='action-btn small';a.href='admin.html';a.target='_blank';a.rel='noopener';a.textContent='🛠 관리자 페이지';bot.insertBefore(a,bot.firstChild.nextSibling);}
  }
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
  if(IS_ADMIN_PAGE&&role!=='admin'){ // v1.65 관리자 페이지는 관리자 전용 — 데모유저는 서비스로 안내
    var st=document.getElementById('auth-status');showAuthOverlay('denied',user.email||'',null);
    if(st)st.innerHTML='🛠 관리자 전용 페이지입니다.<br><span class="em">'+escHtml(user.email||'')+'</span><br><a href="index.html" style="color:var(--acc);font-weight:700;">📱 서비스로 이동</a>';
    return;
  }
  document.body.classList.remove('role-admin','role-user');
  document.body.classList.add(role==='admin'?'role-admin':'role-user');
  hideAuthOverlay();showUserChip(user,role);bootMap();
  /* v1.77: 서비스 페이지에서 admin.html?adm=<패널> 로 넘어온 경우 그 블록을 바로 연다.
     로그인이 끝난 뒤에 여는 것이 중요하다 — 초기화 시점에 열면 인증 오버레이 위에 뜬다. */
  if(IS_ADMIN_PAGE&&role==='admin')openAdmPanelFromUrl();
  loadSharedContent(); // 관리자·데모 모두 공유 콘텐츠(존/스팟) 로드. 저장은 관리자만(cloudSave/markCloudDirty에서 가드)
  liveOn();              // 유저 생성 콘텐츠(피드/스팟/Request) 실시간 구독
}

var contentUnsub=null, newsUnsub=null;
/* ===== [M12] 유저 생성 콘텐츠 실시간 공유 (liveFeed / liveSpots / liveRequests / liveChat) ===== */
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
    if(typeof cpopRefresh==='function')cpopRefresh(); // 열려 있는 Request 팝업에 새 답변을 앉힌다 (v2.19)
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
    if(typeof cpopRefresh==='function')cpopRefresh(); // 스팟 의견 팝업 열려 있으면 실시간 반영
    if(typeof refreshSpotStyles==='function')refreshSpotStyles(); // 스팟 버블 의견 수 뱃지 갱신 (v1.63)
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
/* ── 관리자 적용 설정의 로컬 캐시 (v2.3) ──
   임베드(persona-vc 데모)는 Firebase 를 안 붙여서 클라우드 설정을 못 읽는다 — 그래서
   관리자가 콘솔에서 고른 스킨·스타일이 데모에는 코드 기본값으로 떨어졌다.
   임베드는 관리자 콘솔과 **같은 오리진**(gihoon-mx.github.io)이므로, 관리자가 설정을
   적용(cloudSave)하거나 클라우드본을 받을(applyCloudData) 때 통째 스냅샷을 localStorage 에
   남기고, 임베드가 부팅에서 그걸 읽는다. 우선순위: 코드 기본값 < settings-default.json < 이 캐시.
   ⚠️ 이 브라우저에서 앱(로그인)을 한 번도 안 연 기기는 캐시가 없다 — 그때는 파일 백스톱이 기준. */
var SETTINGS_CACHE_KEY='nowhere_settings_cache';
var settingsCacheOn=false; // 임베드가 캐시를 적용했나 — 뒤늦게 오는 파일 백스톱이 덮지 않게
var settingsRemoteOn=false; // 임베드가 공개 설정 문서를 적용했나 (v2.5) — 셋 중 가장 최신
/* 트렌드 존 **목록만** 추린 것 (v2.22) — persona-vc 콘솔이 기능 데모의 무대 존을 만들 때
   하나하나 손으로 적는 대신 여기서 골라 가져간다.

   **기하(hexCenters)는 안 싣는다.** 콘솔의 무대 존은 앱이 데모 동네 둘레에 결정적으로
   펴는 것이라(D117) 실제 좌표가 뜻이 없고, 존 하나의 셀 목록은 그것만으로 문서를 키운다.
   대신 `cells`(칸 수)를 줘서 콘솔이 크기(작게/넓게)를 고를 수 있게 한다.

   **사진은 https 주소만.** 관리자가 올린 사진은 압축 data URI 로 존에 박히는데(compressNews),
   그것을 그대로 실으면 존 몇 개로 공개 문서가 Firestore 1MB 상한에 닿는다. 주소로 붙인
   사진만 따라가고, 올린 사진은 콘솔에서 다시 올리는 것이 맞다.

   이 값은 **내보내기 전용**이다 — `applyExtraSettings` 가 이것을 적용하지 않는다.
   앱 자신의 존은 여전히 shared/mapContent 에서 온다. */
var ZONE_BOOK_MAX=20;
/* 존 하나가 나르는 것의 상한 (v2.24) — 이 문서는 **한 벌**이고 Firestore 상한이 있다.
   칸(shape)은 그린 모양 그대로, 컨텐츠는 "그 존이 어떤 동네인가" 가 보일 만큼만. */
var ZONE_BOOK_CELLS=30, ZONE_BOOK_SPOTS=10, ZONE_BOOK_FEEDS=6;
function zbNum(v){return Math.round(Number(v)*1e5)/1e5;} // 좌표는 소수 5자리(≈1m)면 충분하다
/* 그 존 **안에 있는** 컨텐츠 (v2.24) — 콘솔이 존을 가져올 때 같이 가져갈 수 있게.
   판정은 화면이 쓰는 것과 같다: 스팟은 좌표(ptInZone), 피드는 태깅(zone) 또는 좌표. */
function zoneBookContents(z){
  var out={spots:[],feeds:[]};
  try{
    if(typeof demoSpots!=='undefined'&&typeof ptInZone==='function'){
      for(var i=0;i<demoSpots.length&&out.spots.length<ZONE_BOOK_SPOTS;i++){
        var s=demoSpots[i];
        if(!s||s.hidden||s.lat==null||s.lng==null)continue;
        if(!ptInZone(z,s.lat,s.lng))continue;
        var t=String(s.text||'').trim();if(!t)continue;
        out.spots.push({t:t.slice(0,80),emoji:String(s.emoji||'💬').slice(0,4),
          temp:(s.temp!=null?s.temp:null),lat:zbNum(s.lat),lng:zbNum(s.lng)});
      }
    }
    if(typeof feedItems!=='undefined'){
      for(var j=0;j<feedItems.length&&out.feeds.length<ZONE_BOOK_FEEDS;j++){
        var f=feedItems[j];
        if(!f||f.hidden)continue;
        var mine=(f.zone===z.id)||(f.lat!=null&&f.lng!=null&&typeof ptInZone==='function'&&ptInZone(z,f.lat,f.lng));
        if(!mine)continue;
        var d=String(f.desc||'').trim();if(!d)continue; // 글 없는 카드는 안 싣는다 — 콘솔 무대는 글이 있어야 카드가 선다
        // 사진은 **주소만** (올린 사진은 data URI 라 문서에 담으면 상한에 닿는다)
        var img=String(f.src||'');if(!/^https:\/\//i.test(img)||img.length>500)img='';
        out.feeds.push({desc:d.slice(0,120),name:String(f.name||'').slice(0,20),img:img,
          temp:(f.temp!=null?f.temp:null),
          lat:(f.lat!=null?zbNum(f.lat):null),lng:(f.lng!=null?zbNum(f.lng):null)});
      }
    }
  }catch(e){}
  return out;
}
function zoneBookSnapshot(){
  if(typeof trendZones==='undefined')return [];
  return trendZones.slice(0,ZONE_BOOK_MAX).map(function(z){
    var photo=String(z.photo||'');
    if(!/^https:\/\//i.test(photo)||photo.length>500)photo='';
    var where='';
    try{where=zoneRegionName(z.id)||'';}catch(e){}
    var cs=(z.hexCenters&&z.hexCenters.length)?z.hexCenters:[];
    /* 자리와 모양 (v2.24) — 여태 이름·색·크기만 나르고 **자리는 콘솔 무대가 새로 폈다**.
       그래서 가져온 존이 실제 지도의 그 자리가 아니었다. 중심(at)과 칸 좌표(shape)를
       같이 실으면 무대가 그린 대로 편다. shape 는 [[lat,lng],…] 로 납작하게 — 키 이름이
       칸마다 반복되면 문서가 두 배가 된다. */
    var ce=null;
    try{ce=cs.length?zoneCentroid(z):null;}catch(e){}
    var body=zoneBookContents(z);
    return {name:String(z.name||'').slice(0,20),
      desc:String(z.desc||'').slice(0,80),
      color:String(z.color||''),
      temp:(z.temp!=null?z.temp:null),
      photo:photo,
      where:String(where).slice(0,20),
      cells:cs.length,
      at:(ce?{lat:zbNum(ce.lat),lng:zbNum(ce.lng)}:null),
      radiusKm:(z.radiusKm!=null?Number(z.radiusKm):null),
      shape:cs.slice(0,ZONE_BOOK_CELLS).map(function(h){return [zbNum(h.lat),zbNum(h.lng)];}),
      spots:body.spots,feeds:body.feeds};
  }).filter(function(z){return z.name;});
}
/* 관리자 적용 설정의 통째 스냅샷 — 캐시(localStorage)·공개 문서(publicSettings)가 같은 것을 나른다. */
function settingsSnapshotFull(){
  var snap=snapshotSettings();
  return {
    settings:{styleConfig:snap.styleConfig,hexStyleConfig:snap.hexStyleConfig,localLabelConfig:snap.localLabelConfig,zoneLabelConfig:snap.zoneLabelConfig,smoothEnabled:snap.smoothEnabled,smoothIntensity:snap.smoothIntensity,hexRadiusKm:snap.hexRadiusKm,zoneMergeBlocks:snap.zoneMergeBlocks},
    spotConfig:snap.spotConfig,
    zoneCardStyle:zoneCardStyle,feedTimeMode:feedTimeMode,appSkin:appSkin,
    spotMapBg:{op:spotMapBg.op,scaleM:spotMapBg.scaleM},feedIconSize:feedIconSize,
    mapPinView:mapPinView, // v2.15 지도 컨텐츠별 표시 — 임베드(REST)·캐시·파일도 같은 범위
    uiScale:uiScale, // v2.27 폰 셸 UI 크기 (additive)
    /* 상단 지면 타입 (v2.11) — cardVer 는 shared/news(SDK 전용)로만 다녀서 persona-vc
       임베드(REST publicSettings)가 영영 못 봤다. 스킨은 건너가는데 지면 타입만 기본(1)
       으로 뜨던 원인. */
    newsCardVer:newsCardVer,
    /* 트렌드 존 목록 (v2.22) — 콘솔이 골라 가져가는 **내보내기 전용** 칸이다.
       applyFullSettings 는 이것을 안 읽는다 (applyExtraSettings 참조). */
    zoneBook:zoneBookSnapshot()};
}
/* 스냅샷 하나를 통째로 적용한다 — 캐시·공개 문서가 같은 코드를 탄다 (두 벌이면 한쪽만 고쳐진다). */
function applyFullSettings(c){
  if(!c||typeof c!=='object')return false;
  applySettingsData(c.settings);
  if(c.spotConfig)mergeInto(spotConfig,c.spotConfig);
  applyExtraSettings(c);
  return true;
}
/* 스타일 밖의 설정 다섯 — 스킨·존 카드·피드 시간·스팟 지도배경·피드 아이콘 크기 (v2.3.1).
   **값만 읽는다** (화면 갱신은 부르는 쪽 몫 — 임베드는 부팅 전이라 갱신할 컨트롤이 없다).

   클라우드·로컬 캐시·repo 파일이 **같은 범위**를 적용해야 한다. 파일 백스톱만 이 다섯을
   몰라서, 설정 JSON 을 settings-default.json 에 붙여 넣어도 스킨은 안 따라갔다 —
   "내 브라우저에서는 되는데 처음 보는 기기에서는 안 되는" 설정이 그래서 생겼다. */
function applyExtraSettings(s){
  if(!s||typeof s!=='object')return;
  if(ZONE_CARD_STYLES.indexOf(s.zoneCardStyle)>=0)zoneCardStyle=s.zoneCardStyle; // v2.27 — 'page'(v2.26)·'circle' 이 클라우드로도 다니게 목록 하나로
  if(s.feedTimeMode==='ago'||s.feedTimeMode==='clock'||s.feedTimeMode==='off')feedTimeMode=s.feedTimeMode;
  if(APP_SKINS.indexOf(s.appSkin)>=0){appSkin=s.appSkin;applySkin();} // setAppSkin 은 저장까지 한다 — 여기는 값 적용만
  if(s.spotMapBg&&typeof s.spotMapBg==='object'){spotMapBg.op=Number(s.spotMapBg.op)||0;spotMapBg.scaleM=Number(s.spotMapBg.scaleM)||100;}
  if(s.feedIconSize!=null&&isFinite(Number(s.feedIconSize)))feedIconSize=Math.max(0,Math.round(Number(s.feedIconSize)));
  if(s.mapPinView&&typeof s.mapPinView==='object')mergePinView(s.mapPinView); // v2.15 — 값만, 갱신은 부르는 쪽
  if(s.uiScale&&typeof s.uiScale==='object'){mergeUiScale(s.uiScale);applyUiScale();} // v2.27 — CSS 변수라 즉시 적용해도 안전(재렌더 없음)
  // 상단 지면 타입 (v2.11) — 화면 갱신은 부르는 쪽의 renderNews 가 한다 (이 함수의 규칙 그대로).
  var _ncv=parseInt(s.newsCardVer,10);
  if(_ncv>=1&&_ncv<=3)newsCardVer=_ncv;
  /* ⚠️ `zoneBook`(v2.22)은 **일부러 적용하지 않는다.** 그것은 콘솔이 읽어 가는 목록이지
     이 앱의 존이 아니다 — 앱의 존은 shared/mapContent 에서 온다. 여기서 적용하면
     임베드가 자기 무대(seed.zones) 위에 남의 존을 덧그린다. */
}
function saveSettingsCache(){
  try{localStorage.setItem(SETTINGS_CACHE_KEY,JSON.stringify(settingsSnapshotFull()));}catch(e){}
}
function loadSettingsCache(){ // 임베드 부팅 전용 — applyCloudData 의 설정 부분과 같은 적용 순서
  if(!IS_EMBED)return;
  try{
    if(applyFullSettings(JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY)||'null')))
      settingsCacheOn=true;
  }catch(e){}
}
/* ── 공개 설정 문서 (v2.5) — persona-vc 임베드에 자동으로 건너가는 유일한 실시간 경로 ──
   localStorage 캐시는 cross-site iframe 에서 안 보인다 (storage partitioning — D91 ③).
   그래서 관리자가 설정을 적용할 때 `shared/publicSettings` 문서에도 스냅샷을 남기고,
   임베드가 부팅에서 **REST 로** 읽는다 — Firebase SDK 를 안 붙인다는 임베드 설계(M16)를
   지키면서 문서 하나만 fetch 한다. 규칙이 이 문서만 비로그인 읽기를 연다(firestore.rules).
   값은 `json` 문자열 필드 하나다 — Firestore REST 의 타입 달린 필드(mapValue…)를
   되짚어 조립하지 않기 위해서다. 규칙이 아직 게시 전이면 403 이고, 조용히 예전 경로
   (캐시 → settings-default.json)로 산다. */
var PUBLIC_SETTINGS_URL='https://firestore.googleapis.com/v1/projects/'
  +'now-here-demo/databases/(default)/documents/shared/publicSettings';
function loadRemoteSettings(){
  if(!IS_EMBED||typeof fetch!=='function')return;
  if(typeof CONFIG==='undefined'||!CONFIG.FIREBASE||!CONFIG.FIREBASE.apiKey)return;
  fetch(PUBLIC_SETTINGS_URL+'?key='+CONFIG.FIREBASE.apiKey)
    .then(function(r){return r.ok?r.json():null;})
    .then(function(doc){
      var raw=doc&&doc.fields&&doc.fields.json&&doc.fields.json.stringValue;
      if(!raw)return;
      if(!applyFullSettings(JSON.parse(raw)))return;
      settingsRemoteOn=true; // 파일 백스톱이 나중에 와도 안 덮게
      // 이미 그려진 뒤에 도착할 수 있다 — 화면을 지금 값으로 다시 맞춘다.
      if(typeof mapReady!=='undefined'&&mapReady){refreshMapStyles();refreshHexStyles();refreshSpotStyles();refreshZoneLabels();updateLocalLabelStyle();}
      if(typeof renderNews==='function')renderNews();
      if(typeof renderFeed==='function'&&typeof currentTab!=='undefined'&&currentTab==='feed')renderFeed();
      if(typeof renderFeedMarkers==='function')renderFeedMarkers();
      renderAllPins(); // v2.15 — 컨텐츠별 표시 설정이 공개 문서로 왔을 수 있다
    }).catch(function(e){});
}
function loadFileDefaults(){ // repo 백스톱(settings-default.json): 코드 기본값 < 파일 < 클라우드 순으로 적용
  fetch('settings-default.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(s){
    if(!s||typeof s!=='object'||(!s.styleConfig&&!s.spotConfig))return; // 빈 파일({})이면 무시
    if(cloudData)return; // 이미 클라우드 설정이 적용됨 — 클라우드 우선
    if(settingsCacheOn||settingsRemoteOn)return; // 임베드가 캐시·공개 문서를 적용함 — 그쪽이 파일보다 최신이다 (v2.3·v2.5)
    applySettingsData(s);
    if(s.spotConfig)mergeInto(spotConfig,s.spotConfig);
    applyExtraSettings(s); // 스킨·존 카드·피드 시간·지도배경·아이콘 크기도 파일이 정한다 (v2.3.1)
    initDraft();syncSettingsUI();renderMiniPreviews();
    // 컨트롤은 이 다섯을 DRAFT 로 읽지 않으므로(syncSettingsUI 밖이다) 여기서 직접 맞춘다
    var _sks=document.getElementById('app-skin');if(_sks)_sks.value=appSkin;
    var _zcs=document.getElementById('zone-card-style');if(_zcs)_zcs.value=zoneCardStyle;
    var _ftm=document.getElementById('feed-time');if(_ftm)_ftm.value=feedTimeMode;
    var _mo=document.getElementById('spotmap-op');if(_mo)_mo.value=String(spotMapBg.op);
    var _ms=document.getElementById('spotmap-scale');if(_ms)_ms.value=String(spotMapBg.scaleM);
    var _fis=document.getElementById('feed-icon-size');if(_fis)_fis.value=feedIconSize>0?String(feedIconSize):'';
    syncPinViewUI(); // v2.15 지도 컨텐츠별 표시 컨트롤도 파일 값으로
    syncUiScaleUI();applyUiScale(); // v2.27 UI 크기도 파일 값으로
    if(mapReady){refreshMapStyles();refreshHexStyles();refreshSpotStyles();refreshZoneLabels();updateLocalLabelStyle();}
    // 스킨은 마크업까지 가른다(v1.84) — 속성만 바꾸면 다음 렌더까지 옛 구조가 남는다
    if(typeof renderNews==='function')renderNews();
    if(typeof renderFeed==='function'&&currentTab==='feed')renderFeed();
    if(typeof renderFeedMarkers==='function')renderFeedMarkers();
    renderAllPins(); // v2.15 — 표시 설정이 파일에서 왔을 수 있다
  }).catch(function(e){});
}
function applyCloudData(d){
  if(!d)return;
  applySettingsData(d.settings);
  if(Array.isArray(d.zones)){
    trendZones.slice().forEach(function(z){removeZoneFromMap(z);});
    trendZones=[];
    d.zones.forEach(function(z){trendZones.push({id:z.id||('tz_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),name:z.name,color:z.color,fillA:(z.fillA!=null?z.fillA:null),desc:z.desc||'',temp:(z.temp!=null?z.temp:null),photo:z.photo||null,radiusKm:z.radiusKm||hexRadiusKm,hexCenters:z.hexCenters,originalCenters:z.originalCenters||JSON.parse(JSON.stringify(z.hexCenters)),originalRadiusKm:z.originalRadiusKm||z.radiusKm||hexRadiusKm,polygons:[],label:null});});
  }
  if(Array.isArray(d.spots)){adminSpots=d.spots.map(function(s){return {id:s.id||('sp_'+Date.now()+'_'+Math.random().toString(36).slice(2,5)),lat:s.lat,lng:s.lng,text:s.text||'',emoji:s.emoji||'💬',color:s.color||null,alpha:(s.alpha!=null?s.alpha:null)};});}
  loadLocalSpotsInto();   // 로컬 폴백(라이브면 스냅샷)
  rebuildSpots();
  if(d.spotConfig)mergeInto(spotConfig,d.spotConfig);
  draftFromLive();syncSettingsUI();refreshMapStyles();refreshHexStyles();applyGeoJsonToMap();
  if(currentMode==='trend'){showAllZonesOnMap();generateHexagons();}
  renderSpots();   // 모드 무관 항상 스팟 표시
  renderZoneList();refreshZoneLabels();updateLocalLabelStyle();
  if(d.social){if(Array.isArray(d.social.rooms))socRoomList=d.social.rooms.slice();if(Array.isArray(d.social.seedLocal))socSeedLocal=d.social.seedLocal.slice();saveChat();renderRoomManager();}
  if(ZONE_CARD_STYLES.indexOf(d.zoneCardStyle)>=0){zoneCardStyle=d.zoneCardStyle;var _zcs=document.getElementById('zone-card-style');if(_zcs)_zcs.value=zoneCardStyle;} // v2.27 — 목록 하나로('page'·'circle' 포함)
  if(d.feedTimeMode==='ago'||d.feedTimeMode==='clock'||d.feedTimeMode==='off'){feedTimeMode=d.feedTimeMode;var _ftm=document.getElementById('feed-time');if(_ftm)_ftm.value=feedTimeMode;if(currentTab==='feed')renderFeed();}
  if(APP_SKINS.indexOf(d.appSkin)>=0){setAppSkin(d.appSkin);var _sks=document.getElementById('app-skin');if(_sks)_sks.value=appSkin;} // [M15] 디자인 스킨(관리자가 정하면 모두에게)
  if(d.spotMapBg&&typeof d.spotMapBg==='object'){spotMapBg.op=Number(d.spotMapBg.op)||0;spotMapBg.scaleM=Number(d.spotMapBg.scaleM)||100;saveSpotMapBg();
    var _mo=document.getElementById('spotmap-op');if(_mo)_mo.value=String(spotMapBg.op);
    var _ms=document.getElementById('spotmap-scale');if(_ms)_ms.value=String(spotMapBg.scaleM);
    if(currentTab==='feed')renderFeed();}
  if(d.feedIconSize!=null&&isFinite(Number(d.feedIconSize))){ // v2.3 피드 지도 아이콘 크기 (additive — 필드 없으면 유지)
    feedIconSize=Math.max(0,Math.round(Number(d.feedIconSize)));saveFeedIconSize();
    var _fis=document.getElementById('feed-icon-size');if(_fis)_fis.value=feedIconSize>0?String(feedIconSize):'';
    if(typeof renderFeedMarkers==='function')renderFeedMarkers();}
  if(d.mapPinView&&typeof d.mapPinView==='object'){ // v2.15 지도 컨텐츠별 표시 (additive)
    mergePinView(d.mapPinView);savePinView();syncPinViewUI();renderAllPins();}
  if(d.uiScale&&typeof d.uiScale==='object'){ // v2.27 폰 셸 UI 크기 (additive)
    mergeUiScale(d.uiScale);saveUiScale();syncUiScaleUI();applyUiScale();}
  saveSettingsCache(); // 임베드(같은 오리진)가 이 적용본을 기본값으로 읽는다 (v2.3)
  blockDirty={};updateApplyBar();updateBlockBars(); // 클라우드본 = 적용 기준선
}
/* ========== [M11] 설정 미니 프리뷰: 각 설정 블록 상단에 그 옵션의 예시를 실시간 렌더 ========== */
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
      lbl='<g><rect x="18" y="24" width="52" height="15" rx="7.5" fill="'+hexToRgba(lc.bgColor,Number(lc.bgOpacity))+'"/><text x="44" y="35" text-anchor="middle" font-size="9" font-weight="700" fill="'+hexToRgba(lc.textColor,txA(lc))+'">역삼1동</text></g>';}
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
    var chip=(zl.show!==false)?'<g><rect x="112" y="25" width="48" height="14" rx="7" fill="'+hexToRgba(col,Number(zl.bgOpacity))+'"/><text x="136" y="35.5" text-anchor="middle" font-size="8.5" font-weight="700" fill="'+hexToRgba(zl.textColor,txA(zl))+'">강남 핫플</text></g>':'';
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
    bubble.style.color=hexToRgba(c.textColor||'#ffffff',txA(c));
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

/* ========== [M11] 설정 드래프트(블록 단위): 변경=미니 프리뷰만 → 블록 [적용] 시 실제 지도+전체 저장 ========== */
var blockDirty={}, DRAFT=null, FACTORY_SETTINGS=null;
var mpNoop=function(){};
function snapshotSettings(){return JSON.parse(JSON.stringify({styleConfig:styleConfig,hexStyleConfig:hexStyleConfig,localLabelConfig:localLabelConfig,zoneLabelConfig:zoneLabelConfig,spotConfig:spotConfig,smoothEnabled:smoothEnabled,smoothIntensity:smoothIntensity,hexRadiusKm:hexRadiusKm,zoneMergeBlocks:zoneMergeBlocks}));}
function initDraft(){DRAFT=snapshotSettings();} // 설정 편집 버퍼 (컨트롤·미니 프리뷰가 이걸 읽고 씀)
function copyFields(dst,src,fields){fields.forEach(function(k){if(src[k]!==undefined)dst[k]=src[k];});}
var REGION_FIELDS=['strokeColor','fillColor','strokeWeight','strokeOpacity','fillOpacity'];
var LENS_FIELDS=['fogColor','fogOpacity','lineColor','lineOpacity','trendScaleM','fadeMs','switchZoomN'];
var SPOT_FIELDS=['maxChars','fontSize','textColor','textOpacity','bgColor','bgOpacity','emojiSize','emojiPos','emojiGap','emojiLetterSpacing','bubbleRadius','tail','dotScaleM','dotStyle'];
var LLABEL_FIELDS=['enabled','fontSize','textColor','textOpacity','bgColor','bgOpacity'];
var ZLABEL_FIELDS=['show','fontSize','textColor','textOpacity','bgOpacity'];
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
      var prevZShow=(zoneLabelConfig.show!==false); // v1.64: 표시 토글 변경 시 라벨 생성/제거 위해 재렌더 필요
      copyFields(zoneLabelConfig,DRAFT.zoneLabelConfig,ZLABEL_FIELDS);
      refreshHexStyles();refreshZoneLabels();
      if(zoneMergeBlocks!==DRAFT.zoneMergeBlocks){zoneMergeBlocks=DRAFT.zoneMergeBlocks;rerenderZones();}
      else if(prevZShow!==(zoneLabelConfig.show!==false))rerenderZones();
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
    /* 스타일 밖 다섯도 함께 담는다 (v2.3.1) — 이 JSON 의 쓸모는 **처음 보는 기기의 기본값**이고
       (settings-default.json 은 배포에 실려 모두가 받는다), 스킨이 빠지면 그 기기만 다른
       화면으로 뜬다. 평평하게 얹는다 — 파일을 읽는 쪽(loadFileDefaults)의 형식 그대로다. */
    var snap=snapshotSettings();
    snap.appSkin=appSkin;snap.zoneCardStyle=zoneCardStyle;snap.feedTimeMode=feedTimeMode;
    snap.spotMapBg={op:spotMapBg.op,scaleM:spotMapBg.scaleM};snap.feedIconSize=feedIconSize;
    snap.mapPinView=mapPinView; // v2.15 지도 컨텐츠별 표시
    snap.uiScale=uiScale; // v2.27 폰 셸 UI 크기
    var json=JSON.stringify(snap,null,1);
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
    zones:trendZones.map(function(z){return {id:z.id,name:z.name,color:z.color,fillA:(z.fillA!=null?Number(z.fillA):null),desc:z.desc||'',temp:(z.temp!=null?z.temp:null),photo:z.photo||null,radiusKm:z.radiusKm,hexCenters:z.hexCenters,originalCenters:z.originalCenters,originalRadiusKm:z.originalRadiusKm};}),
    spots:adminSpots.map(function(s){return {id:s.id,lat:s.lat,lng:s.lng,text:s.text,emoji:s.emoji,color:s.color||null,alpha:(s.alpha!=null?Number(s.alpha):null)};}),
    spotConfig:snap.spotConfig,
    social:{rooms:socRoomList,seedLocal:socSeedLocal},
    zoneCardStyle:zoneCardStyle,feedTimeMode:feedTimeMode,appSkin:appSkin,spotMapBg:{op:spotMapBg.op,scaleM:spotMapBg.scaleM},
    feedIconSize:feedIconSize, // v2.3 — additive(옛 클라이언트는 모르고 지나간다)
    mapPinView:mapPinView,     // v2.15 — 지도 컨텐츠별 표시 방식 (additive)
    uiScale:uiScale};          // v2.27 — 폰 셸 UI 크기 (additive)
  saveSettingsCache(); // 임베드(같은 오리진)가 이 적용본을 기본값으로 읽는다 (v2.3)
  fbDb.collection('shared').doc('mapContent').set(payload,{merge:true}).catch(function(e){console.warn('shared save fail',e);});
  /* 공개 설정 문서 (v2.5) — persona-vc 임베드가 비로그인 REST 로 읽는다. json 문자열
     하나로 싣는다(REST 파싱 단순화). 규칙 게시 전에는 permission-denied 로 조용히 실패하고
     아무것도 잃지 않는다 — mapContent 저장과 분리된 catch 라 서로를 못 막는다. */
  fbDb.collection('shared').doc('publicSettings').set({
    json:JSON.stringify(settingsSnapshotFull()),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function(e){console.warn('publicSettings save fail (규칙 게시 전이면 정상)',e);});
}

/* ========== [M12] 접근권한(allowlist) 관리 ========== */
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
   [M09] 서비스 탭 (지도/피드/소셜) · 라이브 카메라 · 현장 Request · 소셜 채팅 · 기능 맵
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
  /* v1.83: 네비 표시도 **여기서** 옮긴다.
     v1.82 까지는 `setNavActive(x); switchTab(x);` 를 호출부마다 짝지어 불렀고
     여섯 곳이 그렇게 하고 있었다. 그런데 M16 임베드 브리지의 `tab` 액션만 짝을
     빠뜨려서, 콘솔이 시나리오를 재생하면 화면은 넘어가는데 하단 네비는 이전 탭이
     활성으로 남았다 — 하필 그 한 곳이 시연 경로다.
     짝짓기를 외워야 하는 구조가 원인이므로 문을 하나로 합친다. 호출부의
     setNavActive 는 이제 중복이지만(무해) 그대로 둔다 — 지우면 이 파일 밖에서
     switchTab 없이 표시만 바꾸던 경로가 있을 때 조용히 깨진다. */
  setNavActive(tab);
  /* v1.83: 스킨이 탭별로 갈라질 수 있게 훅 하나. 지면 히어로가 지도 탭에서만 커야 한다
     — 피드/소셜에서 같은 높이면 그리드가 화면 밖으로 밀린다. CSS 전용 훅이라
     legacy 는 이 속성을 읽지 않는다(있어도 매칭되는 규칙이 없다). */
  if(document.body)document.body.setAttribute('data-tab',tab);
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

/* ========== [M08] AI Agent: 상황 맞춤 프리셋 + 트렌드=무지개 선글라스 ========== */
/* v2.15: 모드별 톤(트렌드 웜톤 재도색·온도 흐름 배경)은 삭제 — 트렌드 구분은
   선글라스 착용 + 렌즈 무지개 발광(CSS aiLensRainbow/aiShadeGlow)만 담당한다. */
var AI_PALETTE={idle:['#cbd0d8','#cbd0d8'],on:['#8ed0ff','#a78bfa']};
var aiActiveOn=false;
function updateAiVisual(on){ // on 생략=마지막 상태 유지(모드 전환 시 재호출)
  if(typeof on==='boolean')aiActiveOn=on;
  var btn=document.querySelector('#phone-mirror .pn-ai');if(!btn)return;
  var c=aiActiveOn?AI_PALETTE.on:AI_PALETTE.idle;
  btn.classList.toggle('ai-on',aiActiveOn);
  btn.classList.toggle('ai-flame',currentMode==='trend'); // 선글라스 표시 스위치(색은 안 바꾼다)
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
function aiChatAnswer(q,opts){ // 채팅 입력: 템플릿 풀에서 키워드 매칭(범용어 제외), 없으면 데모 안내
  // opts.offline=true — 원격 에이전트가 실패해 되돌아온 길. 미매칭 문구만 달라진다.
  var pool=aiPresetPool(),ql=q.toLowerCase(),best=null,score=0;
  pool.forEach(function(p){
    var s=0;
    p.q.replace(/[^\w가-힣\s]/g,'').split(/\s+/).forEach(function(t){
      if(t.length>1&&AI_STOPWORDS.indexOf(t)<0&&ql.indexOf(t.toLowerCase())>=0)s++;
    });
    if(s>score){score=s;best=p;}
  });
  if(best&&score>0)return best.a;
  if(opts&&opts.offline)return '"'+q+'" — 지금은 AI 연결이 잠시 끊겨 있어요. 지도 요약과 추천 질문은 그대로 쓸 수 있습니다 🤖';
  return '"'+q+'" — 좋은 질문이에요! 지금은 지도 요약과 추천 질문에 먼저 답하는 데모 버전이에요. 실제 AI 연결은 준비 중입니다 🤖';
}

/* ── 원격 에이전트 (persona-vc /api/app-agent) ─────────────────────────────
   답을 만드는 곳이 두 군데다.
   ① 원격 — persona-vc 콘솔의 격리 라우트. 실제 모델이고 과금된다. 콘솔의 평가
      파이프라인(페르소나·세션·리뷰)과 프롬프트도 기억도 공유하지 않는다.
   ② 로컬 — 위 aiChatAnswer 템플릿 매칭. v1.75 까지의 동작이고, 롤백 경로다.

   ②를 지우지 않은 이유: 원격은 꺼질 수 있고(CONFIG.AI_AGENT.ENABLED·서버 스위치),
   느릴 수 있고, 오프라인일 수 있다. 그때 앱이 아무 말도 못 하면 안 된다.
   임베드(?embed=1)는 항상 ② — 시연은 매번 같은 답이어야 한다 (M16).

   기억은 이 탭 안에서만 산다: aiChatHistory 는 저장하지 않고 최근 몇 턴만
   요청에 실어 보낸다. 서버도 저장하지 않는다. */
var aiChatHistory=[];   // {role:'user'|'agent', text}
var aiAskSeq=0;         // 늦게 도착한 답이 새 질문의 답을 덮지 않게 하는 순번
function aiAgentCfg(){return (typeof CONFIG!=='undefined'&&CONFIG.AI_AGENT)||{};}
function aiAgentOn(){var c=aiAgentCfg();return !!(c.ENABLED&&c.ENDPOINT&&!IS_EMBED&&typeof fetch==='function');}
function aiContextSnapshot(){ // 원격에 보내는 화면 상태 — aiMapSummary 와 같은 값을 본다
  var best=null,bh=0;
  (typeof trendZones!=='undefined'?trendZones:[]).forEach(function(z){var h=zoneTotalHearts(z);if(h>bh){bh=h;best=z;}});
  return {
    region:focusedRegionName()||currentCenterDong()||'',
    lens:currentMode==='trend'?'trend':'basic',
    tab:(typeof currentTab!=='undefined'?currentTab:'')||'',
    hour:new Date().getHours(),
    zones:(typeof trendZones!=='undefined'?trendZones.length:0),
    topZone:best?{name:best.name,hearts:bh}:null,
    feeds:(typeof feedItems!=='undefined'?feedItems.length:0),
    spots:(typeof spotMessages!=='undefined'?spotMessages.length:0),
    activeRequests:(typeof fieldRequests!=='undefined'?fieldRequests.filter(reqActive).length:0)
  };
}
function aiAskRemote(q,onOk,onFail){
  var c=aiAgentCfg(),turn=++aiAskSeq;
  var ctl=(typeof AbortController!=='undefined')?new AbortController():null;
  var timer=setTimeout(function(){if(ctl)ctl.abort();},c.TIMEOUT_MS||12000);
  var turns=(c.HISTORY_TURNS||6)*2;
  fetch(c.ENDPOINT,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question:q,context:aiContextSnapshot(),history:aiChatHistory.slice(-turns)}),
    signal:ctl?ctl.signal:undefined
  }).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.json();
  }).then(function(d){
    clearTimeout(timer);
    if(turn!==aiAskSeq)return;                       // 그 사이 새 질문이 들어왔다 — 버린다
    var text=((d&&d.answer)||'').trim();
    if(!text)throw new Error('빈 응답');
    aiChatHistory.push({role:'user',text:q},{role:'agent',text:text});
    if(aiChatHistory.length>24)aiChatHistory=aiChatHistory.slice(-24);
    onOk(text);
  })['catch'](function(e){
    clearTimeout(timer);
    if(turn!==aiAskSeq)return;
    console.warn('[M08] 원격 에이전트 실패 — 템플릿으로 답합니다:',e&&e.message||e);
    onFail(e);
  });
}
function initAiAgent(mirror){
  var aiBtn=mirror.querySelector('.pn-ai'),aiBub=document.getElementById('ai-bubble');
  var panel=document.getElementById('ai-presets'),list=document.getElementById('aip-list');
  var sumBtn=document.getElementById('aip-summary'),input=document.getElementById('aip-input'),send=document.getElementById('aip-send');
  if(!aiBtn||!aiBub)return;
  // 순번을 올려 **기다리던 원격 답을 버린다** — 닫고 나서 뒤늦게 말풍선이 튀어나오면 안 된다.
  function hideAi(){aiAskSeq++;aiBub.classList.remove('show');if(panel)panel.classList.remove('show');clearTimeout(aiBub._t);updateAiVisual(false);}
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
        // 추천 질문도 같은 길로 간다 — 눌러서 나오는 답이 직접 물었을 때와 달라지면 안 된다.
        // 원격이 없거나 실패하면 이 질문에 딸린 템플릿 답(p.a)이 그대로 폴백이다.
        b.addEventListener('click',function(ev){ev.stopPropagation();
          if(!aiAgentOn()){answer(p.a);return;}
          answer('생각하는 중…',60000);
          aiAskRemote(p.q,function(text){answer(text,12000);},function(){answer(p.a);});
        });
        list.appendChild(b);
      });
      if(input)input.value='';
      panel.classList.remove('show');void panel.offsetWidth;panel.classList.add('show');
    }
    aiBtn.classList.remove('spin');void aiBtn.offsetWidth;aiBtn.classList.add('spin');
    updateAiVisual(true);
  });
  if(sumBtn)sumBtn.addEventListener('click',function(e){e.stopPropagation();answer(aiMapSummary(),9000);});
  function submitChat(){
    var v=input?input.value.trim():'';if(!v)return;input.value='';
    if(!aiAgentOn()){answer(aiChatAnswer(v));return;}
    // 원격은 몇 초 걸린다 — 말풍선을 먼저 띄워 두고 도착하면 갈아 끼운다.
    answer('생각하는 중…',60000);
    aiAskRemote(v,
      function(text){answer(text,12000);},
      function(){answer(aiChatAnswer(v,{offline:true}));});
  }
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

/* ========== [M05] 피드 탭: 그리드 + 포커스 구역 우선 ========== */
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
/* 존 목록 카드 모양 (v2.26 에 'page' · v2.27 에 'circle' 추가):
   'glass'=글래스 캡션 · 'list'=리스트(하트합산·거리)
   'page'=**지면형** — 상단 지면 3번과 같은 문법이다(사진이 카드를 꽉 채우고 이름이 유리 캡션).
   'circle'=**원형 썸네일(스토리 서클)** — 석촌동 시안의 서클(사진 원 + 이름 + 하단 °C 배지).
   v2.26 까지 v3 스킨이 glass 를 통째로 서클로 재해석했는데, 그 규칙을 명시적 선택지로
   옮겼다(style.css `#cp-zones.circle`, 전 스킨 공용) — 이제 **네 값 모두 스킨의 재해석을
   안 탄다**: 어느 스킨에서도 같은 모양이라 시연·설정이 고르는 그대로 나온다. */
var ZONE_CARD_STYLES=['glass','list','page','circle'];
var zoneCardStyle='glass';
try{var _zc=localStorage.getItem('nowhere_zonecard');if(ZONE_CARD_STYLES.indexOf(_zc)>=0)zoneCardStyle=_zc;}catch(e){}
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
function zoneBestPhoto(zone){ // 존 썸네일 = 존 컨텐츠(존 태깅 + 존 범위 안 좌표 피드) 사진 중 최다 좋아요 (없으면 존 photo)
  // v1.63 버그픽스: 시드/일반 피드는 zone 태그가 없어도(zone:null) 좌표가 존 안이면 포함 — 하트합산(zoneTotalHearts)과 기준 통일
  var best=null,bn=-1;
  feedItems.forEach(function(f){
    if(!f.src)return;
    var belongs=(f.zone===zone.id);
    if(!belongs&&typeof feedItemLatLng==='function'){var pos=feedItemLatLng(f);if(pos&&ptInZone(zone,pos.lat,pos.lng))belongs=true;}
    if(belongs){var n=likeInfo(f.id).n;if(n>bn){bn=n;best=f;}}
  });
  return best?best.src:(zone.photo||null);
}
function loadFeed(){if(IS_CLEAN_EMBED){feedItems=[];return;}try{var a=JSON.parse(localStorage.getItem(FEED_KEY)||'[]');if(Array.isArray(a))feedItems=a;}catch(e){}}
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
  /* v1.88: `hidden` 을 **여기서 실어 보낸다.** 매핑이 필드를 빠뜨리면 소비하는 쪽에서
     `it.hidden` 이 늘 undefined 라 필터가 조용히 통과한다 — 콘솔 표의 상태도 늘 '공개'가 된다. */
  feedItems.forEach(function(f){var pc=feedItemLatLng(f);arr.push({id:f.id,type:'photo',src:f.src,region:f.region||'',zone:f.zone||null,kind:f.kind||'post',desc:f.desc||'',name:f.name||'',by:f.by||'',byEmail:f.byEmail||'',hidden:!!f.hidden,ts:f.ts||0,lat:pc?pc.lat:null,lng:pc?pc.lng:null});});
  newsItems.forEach(function(n){
    /* 무대가 깐 지면 카드는 상단 캐러셀 전용이다 (v2.2). 여기 실어 보내면 피드 탭
       그리드에도 제목 없는 사진 카드로 한 번 더 뜬다 — 지면과 피드 카드는 무대에서
       서로 다른 종류이고, 그리드를 채우는 것은 seed.feeds 의 몫이다. */
    if(n.stage)return;
    var rc=regionCenterByName(n.region);arr.push({id:n.id,type:'news',src:n.src,region:n.region||'',ts:0,lat:rc?rc.lat:null,lng:rc?rc.lng:null});});
  spotMessages.forEach(function(sp){var d=regionAt(sp.lat,sp.lng);arr.push({id:sp.id,type:'spot',text:sp.text,emoji:sp.emoji,color:sp.color,region:d?d.name:'',by:sp.by||'',byEmail:sp.byEmail||'',hidden:!!sp.hidden,ts:sp.ts||0,lat:sp.lat,lng:sp.lng});});
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
// 피드 지도 아이콘(썸네일 핀) 기준 크기 px (v2.3) — 0 = 스팟 이모지 크기(spotConfig.emojiSize)를 따른다.
// 여태 스팟과 한 몸이었는데(v1.63) 따로 조절하고 싶다는 요청으로 분리 — 관리자 설정·클라우드 동기, additive.
var feedIconSize=0;
try{var _fis=parseInt(localStorage.getItem('nowhere_feedicon'),10);if(isFinite(_fis)&&_fis>=0)feedIconSize=_fis;}catch(e){}
function saveFeedIconSize(){try{localStorage.setItem('nowhere_feedicon',String(feedIconSize));}catch(e){}}
function feedIconBase(){return feedIconSize>0?feedIconSize:(Number(spotConfig.emojiSize)||26);}
/* v2.15 [M11] 지도 컨텐츠별 표시 방식 — 관리자 s-pins 패널. 종류별 {show(표시),
   size(핀 배율 %, Request·딜만 — CSS 고정 크기라 배율로 조절), label(딜 %라벨)}.
   feedIconSize 와 같은 즉시 적용·additive 클라우드 동기 패턴(왕복 6지점 전부 배선).
   피드 크기는 기존 feedIconSize(0=스팟 따름)가, 스팟 스타일은 spotConfig 블록이 담당. */
var mapPinView={spot:{show:true},feed:{show:true},req:{show:true,size:100},deal:{show:true,size:100,label:true}};
function mergePinView(v){ // additive 병합 — 모르는 키 무시, 빠진 키는 기본값 유지(옛 문서 호환)
  ['spot','feed','req','deal'].forEach(function(k){
    var s=v&&v[k];if(!s||typeof s!=='object')return;var t=mapPinView[k];
    if(typeof s.show==='boolean')t.show=s.show;
    if(s.size!=null&&isFinite(Number(s.size)))t.size=Math.max(40,Math.min(200,Math.round(Number(s.size))));
    if(typeof s.label==='boolean')t.label=s.label;
  });
}
try{var _mpv=JSON.parse(localStorage.getItem('nowhere_pinview')||'null');if(_mpv)mergePinView(_mpv);}catch(e){}
function savePinView(){try{localStorage.setItem('nowhere_pinview',JSON.stringify(mapPinView));}catch(e){}}
/* v2.27 [M09/M11] 폰 셸 UI 크기 — 모드 토글(.pa-mode)·하단 네비(.phone-navbar) 배율(%).
   기본을 100 아래로 둔 것이 곧 "살짝 줄여 달라"는 요청의 값이다. mapPinView 와 같은
   즉시 적용·additive 클라우드 동기 패턴. 적용은 CSS 변수(transform scale)라 재렌더가 없다. */
var uiScale={mode:88,nav:90};
function mergeUiScale(v){
  if(!v||typeof v!=='object')return;
  ['mode','nav'].forEach(function(k){
    if(v[k]!=null&&isFinite(Number(v[k])))uiScale[k]=Math.max(60,Math.min(120,Math.round(Number(v[k]))));
  });
}
try{var _uis=JSON.parse(localStorage.getItem('nowhere_uiscale')||'null');if(_uis)mergeUiScale(_uis);}catch(e){}
function saveUiScale(){try{localStorage.setItem('nowhere_uiscale',JSON.stringify(uiScale));}catch(e){}}
function applyUiScale(){ // body 의 CSS 변수 하나로 index·admin 폰 미러가 같이 줄어든다
  if(!document.body)return;
  document.body.style.setProperty('--ui-mode-s',String(uiScale.mode/100));
  document.body.style.setProperty('--ui-nav-s',String(uiScale.nav/100));
}
function syncUiScaleUI(){
  var m=document.getElementById('ui-mode-scale');if(m)m.value=String(uiScale.mode);
  var n=document.getElementById('ui-nav-scale');if(n)n.value=String(uiScale.nav);
}
function initUiScaleUI(){ // 표시 옵션(s-view) 컨트롤 — admin.html 에만 있다(없으면 조용히 통과)
  applyUiScale();
  if(!document.getElementById('ui-mode-scale'))return;
  syncUiScaleUI();
  function on(id,key){var el=document.getElementById(id);if(!el)return;
    el.addEventListener('change',function(){
      var o={};o[key]=parseInt(el.value,10)||100;mergeUiScale(o);el.value=String(uiScale[key]);
      saveUiScale();applyUiScale();
      if(typeof markCloudDirty==='function')markCloudDirty();
    });}
  on('ui-mode-scale','mode');on('ui-nav-scale','nav');
}
function pinScale(kind){var s=mapPinView[kind];return s&&s.size?s.size/100:1;}
function renderAllPins(){ // 표시 설정 변경 후 4종 재렌더 — Request 가 끝에서 딜·declutter 까지 연쇄한다
  if(typeof renderSpots==='function')renderSpots();       // (renderSpots 는 피드 핀도 같이 부른다)
  if(typeof renderRequestMarkers==='function')renderRequestMarkers();
}
function syncPinViewUI(){ // s-pins 컨트롤 ← mapPinView (admin.html 에만 있다 — 없으면 조용히 통과)
  function v(id,val){var el=document.getElementById(id);if(!el)return;
    if(el.type==='checkbox')el.checked=!!val;else el.value=String(val);}
  v('pv-spot-show',mapPinView.spot.show);v('pv-feed-show',mapPinView.feed.show);
  v('pv-req-show',mapPinView.req.show);v('pv-req-size',mapPinView.req.size);
  v('pv-deal-show',mapPinView.deal.show);v('pv-deal-size',mapPinView.deal.size);
  v('pv-deal-label',mapPinView.deal.label);
}
function initPinViewUI(){
  if(!document.getElementById('pv-spot-show'))return;
  syncPinViewUI();
  function on(id,fn){var el=document.getElementById(id);if(!el)return;
    el.addEventListener('change',function(){fn(el);savePinView();
      if(typeof markCloudDirty==='function')markCloudDirty();renderAllPins();});}
  on('pv-spot-show',function(el){mapPinView.spot.show=!!el.checked;});
  on('pv-feed-show',function(el){mapPinView.feed.show=!!el.checked;});
  on('pv-req-show',function(el){mapPinView.req.show=!!el.checked;});
  on('pv-deal-show',function(el){mapPinView.deal.show=!!el.checked;});
  on('pv-deal-label',function(el){mapPinView.deal.label=!!el.checked;});
  on('pv-req-size',function(el){mapPinView.req.size=Math.max(40,Math.min(200,parseInt(el.value,10)||100));el.value=String(mapPinView.req.size);});
  on('pv-deal-size',function(el){mapPinView.deal.size=Math.max(40,Math.min(200,parseInt(el.value,10)||100));el.value=String(mapPinView.deal.size);});
  var st=document.getElementById('pv-spot-style'); // 스팟 스타일 풀셋은 기존 s-spot 드래프트 블록으로
  if(st)st.addEventListener('click',function(){if(typeof openAdminMenu==='function')openAdminMenu('s-spot');});
}
// 스팟 카드 지도 배경(피드 탭): op=지도 불투명도(0=끔), scaleM=축척(카드 세로 128px 기준 m) — 관리자 설정·클라우드 동기
var spotMapBg={op:0.35,scaleM:100};
try{var _smb=JSON.parse(localStorage.getItem('nowhere_spotmapbg')||'null');if(_smb&&typeof _smb==='object'){if(_smb.op!=null)spotMapBg.op=Number(_smb.op)||0;if(_smb.scaleM)spotMapBg.scaleM=Number(_smb.scaleM)||100;}}catch(e){}
function saveSpotMapBg(){try{localStorage.setItem('nowhere_spotmapbg',JSON.stringify(spotMapBg));}catch(e){}}
function staticMapUrl(lat,lng,scaleM){ // Maps Static API 이미지 — ⚠️ 키에 'Maps Static API' 허용 필요(미허용 시 카드가 onerror로 배경 제거)
  var mpp=(Number(scaleM)||100)/128; // 카드 128px ≈ 축척(m)
  var z=Math.round(Math.log(156543.03392*Math.cos(lat*Math.PI/180)/mpp)/Math.LN2);
  z=Math.max(1,Math.min(21,z));
  return 'https://maps.googleapis.com/maps/api/staticmap?center='+lat+','+lng+'&zoom='+z+'&size=320x320&scale=2'
    +(CONFIG.MAP_ID?'&map_id='+CONFIG.MAP_ID:'')+'&key='+CONFIG.GOOGLE_MAPS_API_KEY;
}
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
  // v1.88: 콘솔에서 숨긴 컨텐츠는 서비스 화면에서 빠진다(표에는 남는다 — 표는 원본을 본다)
  var arr=allFeedEntries().filter(function(it){return !it.hidden&&feedTypes[feedTypeOf(it)]!==false;}); // 종류 필터(view 옵션)
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
      if(it.type==='spot'&&spotMapBg.op>0&&it.lat!=null){ // 스팟 카드: 해당 위치 지도를 연하게 배경으로 (관리자: 투명도·축척)
        var mb=document.createElement('img');mb.className='fc-mapbg';mb.alt='';mb.style.opacity=spotMapBg.op;
        mb.onerror=function(){mb.remove();}; // Static API 미허용/로드 실패 = 배경 없이(조용히)
        mb.src=staticMapUrl(it.lat,it.lng,spotMapBg.scaleM);
        c.insertBefore(mb,c.firstChild);
      }
    }
    /* [M05] 새 스킨: **사진 아래 흰 본문** (v1.84) — 설명글(부제) + 메타 줄(동 · 시간 · ♥).
       v1.79 스킨 주석에 "본문 분리는 renderFeed 를 고쳐야 해서 스킨의 일이 아니다" 로
       미뤄 뒀던 그것이다. 설명글은 지금까지 상세 팝업에서만 보였다 — 시드 사진마다
       다 들고 있는데 그리드에서는 한 글자도 안 보였다.
       legacy 는 사진 위 오버레이 칩 그대로여야 하므로 **마크업 자체를 새 스킨일 때만**
       만든다(스킨을 바꾸면 setAppSkin 이 다시 그린다). 글 카드(.txt)는 본문이 곧 카드라
       제외 — 사진 카드만 받는다. */
    var fmeta=null;
    if(appSkin!=='legacy'&&it.src){ // v1.86: v3 도 본문을 쓴다 — legacy 만 오버레이 칩 그대로
      c.classList.add('has-body');
      var bd=document.createElement('div');bd.className='fc-body';
      var ds=document.createElement('span');ds.className='fc-desc';ds.textContent=(it.desc||'').trim();
      fmeta=document.createElement('span');fmeta.className='fc-meta';
      var mpl=document.createElement('span');mpl.className='fc-mplace';mpl.textContent=it.region||'우리 동네';
      fmeta.appendChild(mpl);
      bd.appendChild(ds);bd.appendChild(fmeta);c.appendChild(bd);
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
    if(tl){
      // 본문이 있으면 시간·좋아요는 사진 위 칩이 아니라 **메타 줄**로 간다 (한 줄에 모아 읽는다)
      if(fmeta){var mtm=document.createElement('span');mtm.className='fc-mtime';mtm.textContent=tl;fmeta.appendChild(mtm);}
      else{var tm=document.createElement('span');tm.className='fc-time';tm.textContent=tl;tr.appendChild(tm);}
    }
    var L=likeInfo(it.id);
    var lk=document.createElement('span');lk.className='fc-like'+(L.me?' on':'');lk.textContent='♥ '+L.n;
    if(!L.n&&!L.me)lk.style.display='none';
    (fmeta||c).appendChild(lk);
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
      tapTimer=setTimeout(function(){tapTimer=null;cpopOpenEntry(it);},360); // 두 번째 탭 대기 후 상세 팝업 (v1.62 통일 — 지도 이동은 팝업 안 📍)
    });
    g.appendChild(c);
  });
}
/* (focusFeedEntry 제거 — v1.62 통일 규칙: 컨텐츠 탭=상세 팝업(cpopOpenEntry), 지도 이동=팝업 안 📍(cpopGoMap)) */
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
  // 스팟 카드 지도 배경(투명도·축척) — 클라우드 동기
  var mop=document.getElementById('spotmap-op'),msc=document.getElementById('spotmap-scale');
  if(mop){mop.value=String(spotMapBg.op);mop.addEventListener('change',function(){spotMapBg.op=parseFloat(this.value)||0;saveSpotMapBg();markCloudDirty();if(currentTab==='feed')renderFeed();});}
  if(msc){msc.value=String(spotMapBg.scaleM);msc.addEventListener('change',function(){spotMapBg.scaleM=parseInt(this.value,10)||100;saveSpotMapBg();markCloudDirty();if(currentTab==='feed')renderFeed();});}
  // 피드 지도 아이콘 크기 (v2.3) — 빈 칸 = 스팟 이모지 크기를 따른다. 클라우드 동기.
  var fis=document.getElementById('feed-icon-size');
  if(fis){fis.value=feedIconSize>0?String(feedIconSize):'';fis.addEventListener('change',function(){
    var v=parseInt(this.value,10);
    feedIconSize=(isFinite(v)&&v>0)?Math.min(120,Math.max(8,v)):0;
    this.value=feedIconSize>0?String(feedIconSize):'';
    saveFeedIconSize();markCloudDirty();
    if(typeof renderFeedMarkers==='function')renderFeedMarkers();
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
/* ========== [M11] v1.88 전체 컨텐츠 표 (콘솔 전용) ==========
   시안(핸드오프)의 '컨텐츠 관리' 화면. 지금까지 콘솔의 컨텐츠 관리는 **종류별로 흩어져
   있었다** — 스팟은 스팟 패널, 피드는 피드 패널, Request 는 어디에도 없었다.
   한 표에 모으면 "지금 이 서비스에 뭐가 올라와 있나"를 한 번에 본다.

   행은 만들지 않고 **기존 데이터를 읽어서 조립한다**(`allFeedEntries` M05 앵커 재사용 +
   `fieldRequests` M07). 표는 소유자가 아니라 **뷰**다 — 쓰기는 각 모듈의 함수를 부른다.

   `hidden` 은 **additive 필드**다(Firestore 스키마 규칙). 없으면 공개로 읽힌다. */
var ctKind='all', ctSel={};
function ctEntries(){ // 표에 뿌릴 행 — 사진·스팟·지면(M05 통합 목록) + Request(M07)
  var rows=allFeedEntries().map(function(it){
    var z=feedZoneOf(it);
    return {
      id:it.id, src:it.src||'', emoji:it.emoji||'',
      kind:(it.type==='photo'?(it.kind==='cam'?'LIVE':'사진'):(it.type==='spot'?'스팟':'지면')),
      title:(it.type==='spot'?(it.text||''):(it.desc||''))||'(설명 없음)',
      zone:z?z.name:'', who:it.by||it.byEmail||it.name||'',
      likes:likeInfo(it.id).n, hidden:!!it.hidden,
      status:(it.hidden?'숨김':'공개'), ago:(it.ts?timeAgo(it.ts):''), type:it.type
    };
  });
  timeDeals.forEach(function(d){
    rows.push({
      id:d.id, src:'', emoji:d.e||'⏰', kind:'타임딜',
      title:d.title||'(제목 없음)', zone:'', who:d.shop||'',
      likes:0, hidden:false,
      status:(dealActive(d)?'진행 중':'종료'), ago:(dealActive(d)?dealClock(dealRemain(d))+' 남음':''), type:'deal'
    });
  });
  fieldRequests.forEach(function(rq){
    var act=reqActive(rq), rem=reqRemainLabel(rq);
    rows.push({
      id:rq.id, src:'', emoji:'🙋', kind:'Request',
      title:rq.q||'(질문 없음)', zone:'', who:rq.by||'',
      likes:(rq.answers||[]).length, hidden:false,
      status:(act?'진행 중':'종료'), ago:(rem||(rq.ts?timeAgo(rq.ts):'')), type:'req'
    });
  });
  return rows;
}
function ctFiltered(){return ctEntries().filter(function(r){return ctKind==='all'||r.kind===ctKind;});}
function ctStatusClass(s){return {'공개':'ok','진행 중':'run','숨김':'off','종료':'off'}[s]||'ok';}
function renderContentTable(){
  var box=document.getElementById('ct-rows');if(!box)return;
  var rows=ctFiltered();
  box.innerHTML='';
  if(!rows.length){var e=document.createElement('p');e.className='section-hint';e.style.padding='14px 18px';e.textContent='이 종류의 컨텐츠가 아직 없어요.';box.appendChild(e);}
  rows.forEach(function(r){
    var el=document.createElement('div');el.className='ct-row'+(ctSel[r.id]?' on':'');
    var chk=document.createElement('input');chk.type='checkbox';chk.className='ct-c-chk';chk.checked=!!ctSel[r.id];
    chk.addEventListener('change',function(){if(this.checked)ctSel[r.id]=r;else delete ctSel[r.id];renderContentTable();});
    var main=document.createElement('span');main.className='ct-c-main';
    var th=document.createElement('span');th.className='ct-thumb';
    if(r.src){var im=document.createElement('img');im.src=r.src;im.alt='';th.appendChild(im);}else th.textContent=r.emoji||'📄';
    var tw=document.createElement('span');tw.className='ct-tw';
    tw.innerHTML='<b>'+escHtml(r.title)+'</b><i>'+escHtml(r.kind)+'</i>';
    main.appendChild(th);main.appendChild(tw);
    function cell(cls,txt){var s=document.createElement('span');s.className=cls;s.textContent=txt;return s;}
    var st=document.createElement('span');st.className='ct-c-st';
    var sb=document.createElement('span');sb.className='ct-badge '+ctStatusClass(r.status);sb.textContent=r.status;st.appendChild(sb);
    el.appendChild(chk);el.appendChild(main);
    el.appendChild(cell('ct-c-zone',r.zone||'—'));
    el.appendChild(cell('ct-c-who',r.who||'—'));
    el.appendChild(cell('ct-c-like',r.likes?String(r.likes):'—'));
    el.appendChild(st);
    el.appendChild(cell('ct-c-ago',r.ago||'—'));
    box.appendChild(el);
  });
  var cnt=document.getElementById('ct-count');
  if(cnt)cnt.textContent=rows.length+'건'+(ctKind==='all'?' · 전체':' · '+ctKind);
  ctSyncBulk();
  var all=document.getElementById('ct-all');
  if(all)all.checked=rows.length>0&&rows.every(function(r){return ctSel[r.id];});
}
function ctSelected(){return Object.keys(ctSel).map(function(k){return ctSel[k];});}
function ctSyncBulk(){
  var bar=document.getElementById('ct-bulk'),n=ctSelected().length;
  if(!bar)return;
  bar.style.display=n?'':'none';
  var c=document.getElementById('ct-selcount');if(c)c.textContent=n+'개 선택';
}
/* 숨김/존 이동/삭제 — 표는 뷰라서 **쓰기는 각 모듈의 함수**를 부른다.
   Request 와 지면은 존·숨김 개념이 없어서 조용히 건너뛴다(경고로 알린다). */
function ctSetHidden(v){
  var sel=ctSelected(),done=0,skip=0;
  sel.forEach(function(r){
    if(r.type==='photo'){var f=feedItems.filter(function(x){return x.id===r.id;})[0];if(f){feedUpdate(f,{hidden:v});done++;}return;}
    if(r.type==='spot'){var sp=spotMessages.filter(function(x){return x.id===r.id;})[0];if(sp){sp.hidden=v;rebuildSpots();markCloudDirty();done++;}return;}
    skip++;
  });
  ctAfterWrite(done,skip,v?'숨겼어요':'다시 공개했어요');
}
function ctMoveZone(){
  var sel=document.getElementById('ct-movezone');if(!sel)return;
  var zid=sel.value,z=trendZones.filter(function(x){return x.id===zid;})[0];
  if(!z){alert('옮길 트렌드 존을 먼저 고르세요.');return;}
  var done=0,skip=0;
  ctSelected().forEach(function(r){
    if(r.type==='photo'){var f=feedItems.filter(function(x){return x.id===r.id;})[0];if(f){feedUpdate(f,{zone:zid});done++;}return;}
    skip++; // 스팟·Request·지면은 좌표로 존이 정해진다 — 태그로 옮기지 않는다
  });
  ctAfterWrite(done,skip,'‘'+z.name+'’ 존으로 옮겼어요');
}
function ctDelete(){
  var sel=ctSelected();if(!sel.length)return;
  if(!confirm('선택한 컨텐츠 '+sel.length+'건을 삭제할까요? 되돌릴 수 없어요.'))return;
  var done=0,skip=0;
  sel.forEach(function(r){
    if(r.type==='photo'){feedDelete(r.id);done++;return;}
    if(r.type==='spot'){removeSpot(r.id);done++;return;}
    if(r.type==='req'){ // deleteRequest 는 자체 confirm 이 있다 — 일괄에서는 직접 지운다
      if(hasLive())fbDb.collection('liveRequests').doc(r.id).delete().catch(liveWriteErr);
      else{fieldRequests=fieldRequests.filter(function(x){return x.id!==r.id;});saveRequests();renderRequestMarkers();}
      done++;return;
    }
    if(r.type==='deal'){timeDeals=timeDeals.filter(function(x){return x.id!==r.id;});saveDeals();renderDealMarkers();done++;return;}
    if(r.type==='news'){newsItems=newsItems.filter(function(n){return n.id!==r.id;});saveNews();renderNews();done++;return;}
    skip++;
  });
  ctAfterWrite(done,skip,'삭제했어요');
}
function ctAfterWrite(done,skip,what){
  ctSel={};
  rebuildSpots();renderFeedMarkers();renderNews();if(currentTab==='feed')renderFeed();
  renderContentTable();
  if(skip)alert(done+'건을 '+what+'. '+skip+'건은 이 동작을 지원하지 않는 종류라 건너뛰었어요.');
}
function initContentTable(){
  var tabs=document.getElementById('ct-tabs');if(!tabs)return;
  ['all','사진','LIVE','스팟','Request','타임딜','지면'].forEach(function(k){
    var b=document.createElement('button');b.type='button';b.className='ct-tab'+(ctKind===k?' active':'');
    b.textContent=(k==='all'?'전체':k);
    b.addEventListener('click',function(){
      ctKind=k;ctSel={};
      tabs.querySelectorAll('.ct-tab').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');renderContentTable();
    });
    tabs.appendChild(b);
  });
  var all=document.getElementById('ct-all');
  if(all)all.addEventListener('change',function(){
    var on=this.checked;ctSel={};
    if(on)ctFiltered().forEach(function(r){ctSel[r.id]=r;});
    renderContentTable();
  });
  var mv=document.getElementById('ct-move');if(mv)mv.addEventListener('click',ctMoveZone);
  var hd=document.getElementById('ct-hide');if(hd)hd.addEventListener('click',function(){ctSetHidden(true);});
  var sh=document.getElementById('ct-show');if(sh)sh.addEventListener('click',function(){ctSetHidden(false);});
  var dl=document.getElementById('ct-del');if(dl)dl.addEventListener('click',ctDelete);
  ctSyncZoneSelect();
  renderContentTable();
}
function ctSyncZoneSelect(){ // 존 목록은 바뀐다 — 표를 열 때마다 다시 채운다
  var sel=document.getElementById('ct-movezone');if(!sel)return;
  var keep=sel.value;sel.innerHTML='';
  var o0=document.createElement('option');o0.value='';o0.textContent='존 선택…';sel.appendChild(o0);
  trendZones.forEach(function(z){var o=document.createElement('option');o.value=z.id;o.textContent=z.name;sel.appendChild(o);});
  if(keep)sel.value=keep;
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
    var tp=document.createElement('input');tp.className='ni-region ni-temp';tp.type='number';tp.min=0;tp.max=100;tp.placeholder='온도 (자동)';tp.title='0~100 · 비우면 자동(좋아요 기반)';tp.value=(f.temp!=null&&f.temp!=='')?f.temp:'';
    tp.addEventListener('change',function(){ // 개별 컨텐츠 수동 온도 — 트렌드 모드 핀 색
      var v=this.value===''?null:Math.max(0,Math.min(100,parseInt(this.value,10)||0));
      if(v!=null)this.value=v;
      feedUpdate(f,{temp:v});refreshAfterEdit();
    });
    var meta=document.createElement('div');meta.className='ni-meta'; // 만든이 · 올린 시각 · 좋아요 (읽기 전용)
    meta.textContent='👤 '+(f.name||'-')+' · 🕒 '+(f.ts?fmtTime(f.ts):'-')+' · ♥ '+likeInfo(f.id).n;
    var fields=document.createElement('div');fields.className='ni-fields';
    var r1=document.createElement('div');r1.className='ni-row';r1.appendChild(ks);r1.appendChild(zs);
    var r2=document.createElement('div');r2.className='ni-row';r2.appendChild(reg);r2.appendChild(dsc);
    var r3=document.createElement('div');r3.className='ni-row';r3.appendChild(tp); // 온도(트렌드 핀 색)
    fields.appendChild(r1);fields.appendChild(r2);fields.appendChild(r3);fields.appendChild(meta);
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

/* ========== [M07] 현장 Request: 원격 질문 → 현장 유저 퀵응답 알림 ========== */
var fieldRequests=[]; var REQ_KEY='nowhere_requests'; var reqMarkers=[]; var reqBubbleTimer=null;
var REQ_TTL_MS=10*60*1000; // 현장 Request 기본 타임아웃(10분) — 만료 시 지도/타인 목록에서 숨김·답변 차단
function isMyReq(rq){return !!rq.by&&rq.by===myUid();}
/* 시드=데모 연출용 상시 활성. **무대가 깐 것(stage)도 안 만료된다** (v2.13):
   Request 는 10분 뒤 핀·드로어·팝업에서 통째로 사라지는데, 데모를 만들다 보면 재생과
   재생 사이가 10분을 훌쩍 넘는다 — 그러면 화면에서 Request 가 없어지고 `pop v:req` 는
   빈손, `answer` 는 "종료된 Request" 네이티브 alert 로 재생을 멈춰 세웠다.
   무대의 시간은 시연의 시간이지 벽시계가 아니다. */
function reqActive(rq){return !!rq.seed||!!rq.stage||(Date.now()-(rq.ts||0)<REQ_TTL_MS);}
function reqRemainLabel(rq){ // 남은 시간: 1분 이상=분 단위, 1분 미만=초 단위 (시드·만료=빈 문자열)
  if(!rq||rq.seed)return '';
  var left=REQ_TTL_MS-(Date.now()-(rq.ts||0));
  if(left<=0)return '';
  return left>=60000?Math.ceil(left/60000)+'분 남음':Math.max(1,Math.ceil(left/1000))+'초 남음';
}
function tickReqRemain(){ // 1초 티커: data-rq-left 요소의 텍스트만 갱신(재렌더 없음) — 만료 감지 시 1회 재렌더
  var els=document.querySelectorAll('[data-rq-left]');if(!els.length)return;
  var expired=false;
  els.forEach(function(el){
    var rq=(fieldRequests||[]).find(function(r){return r.id===el.getAttribute('data-rq-left');});
    if(!rq){el.textContent='';return;}
    var t=reqRemainLabel(rq);
    if(!t&&!rq.seed&&!reqActive(rq)){expired=true;}
    el.textContent=t?('⏱ '+t):'';
  });
  if(expired)renderRequestMarkers(); // 만료 → 지도/드로어 반영
}
/* ── 등장 바운스 (v2.11, M16 이 채운다) ──
   drop·post 로 **지금 생긴** 컨텐츠만 뿅 하고 나타난다. 렌더는 전체를 다시 만드므로
   (rebuildSpots·renderFeedMarkers…) "새 것" 을 렌더 함수는 모른다 — 만든 쪽이 id 를 여기
   적어 두면 각 오버레이의 onAdd 가 보고 클래스를 붙인다.

   **표를 쓰고 버린다** (v2.12). v2.11 은 1.6초 시간으로 지웠는데, 그 창 안에 다른 항목이
   하나 더 깔리면 렌더가 전부를 다시 만들면서 **아직 표가 남은 앞 항목도 다시 튀었다** —
   여러 개가 잇달아 깔리는 burst 에서 화면 전체가 깜박이는 것으로 보였다. 이제 오버레이가
   한 번 쓰면 그만큼 차감하고, 0 이 되면 표가 사라진다.
   `n` 은 그 종류를 그리는 지도 수다 — 스팟·피드는 PC·폰 둘(임베드의 PC 지도는 안 보여도
   오버레이는 만들어진다), 딜·Request·지면은 하나. 시간(2초)은 렌더가 아예 안 왔을 때를
   위한 뒷문일 뿐이다. */
var nhBounceIds={};
function nhBounceMark(id,n){
  if(!id)return;
  nhBounceIds[id]=Math.max(1,n|0||1);
  nhSfxPlay(); // 컨텐츠가 뜨는 그 순간 (v2.23) — 표를 찍는 자리가 곧 "지금 생긴 것" 이다
  setTimeout(function(){delete nhBounceIds[id];},2000);
}
/* ── 컨텐츠 등장 효과음 (v2.23, 콘솔 D120) ──
   무대가 `seed.sfx` 로 소리 하나를 준다 (사람이 콘솔에서 올린 파일의 주소).
   **바운스 표를 찍는 자리에서 운다** — 그 자리가 이미 "지금 화면에 생겼다" 의 단일 기준이라
   drop·post·postfeed·write·request 가 각자 부르지 않아도 한 번씩 정확히 난다.

   ⚠️ **소리는 재생이 아니라 브라우저가 허락해야 난다.** 임베드는 교차 오리진 iframe 이라
   부모의 클릭이 이 문서의 사용자 활성으로 넘어오지 않는다 — 콘솔이 iframe 에
   `allow="autoplay"` 를 줘야 이 play() 가 산다. 막히면 조용히 넘어간다(재생을 막지 않는다).

   같은 소리가 겹쳐 울지 않게 **최소 간격**을 둔다. burst 는 50개를 쏟으므로 간격이 없으면
   기관총이 된다 — 간격이 그것을 성긴 빗소리로 만든다. */
/* v2.25: 소리가 **여섯 자리**다 (콘솔 D122). 여태는 등장음 하나였는데, 시연에서 소리가
   필요한 순간은 등장만이 아니다 — 누르는 손(tap)·팝업이 열리고 닫히는 순간(open·close)·
   렌즈가 바뀌는 순간(mode)·글자가 박히는 소리(type).
   **자리마다 다른 소리를 걸 수 있고, 안 건 자리는 조용하다** (한 소리를 여섯 곳에 돌려
   쓰면 시연이 시끄러워진다). 옛 계약(문자열 하나)은 등장음으로 읽는다 — 옛 콘솔이 보낸
   시나리오가 소리를 잃지 않는다.
   최소 간격도 자리마다 다르다: 타이핑은 글자마다 나므로 촘촘하고(55ms), 모드 전환은
   한 번 크게 난다(150ms). */
var NH_SFX_KEYS=['pop','tap','open','close','mode','type'];
var NH_SFX_GAP={pop:120,tap:90,open:140,close:140,mode:150,type:55};
var nhSfxBank={},nhSfxAt={};
function nhSfxSet(v){
  nhSfxBank={};nhSfxAt={};
  if(!v)return;
  // 옛 계약: 문자열 하나 = 등장음 (v2.23)
  var map=(typeof v==='string')?{pop:v}:(v&&typeof v==='object'?v:null);
  if(!map)return;
  NH_SFX_KEYS.forEach(function(k){
    var u=nhSfxSrc(map[k]);
    if(!u)return;
    try{
      var a=new Audio(u);
      a.preload='auto';
      // 여러 개가 겹쳐 울 수 있게 재생할 때마다 복제한다 — 원본은 미리 받아 두는 몫이다.
      a.load();
      nhSfxBank[k]=a;
    }catch(e){}
  });
}
/* 소리 주소도 사진과 같은 규칙으로 거른다 (nhImgSrc 와 같은 이유 — `javascript:` 를 막는다). */
function nhSfxSrc(v){
  var s=String(v||'').trim();
  if(!s)return '';
  if(/^https:\/\//i.test(s))return s.slice(0,2000);
  if(/^data:audio\/[a-z0-9.+-]+;base64,/i.test(s))return s.slice(0,2000000);
  return '';
}
function nhSfxPlay(key){
  key=key||'pop'; // 자리를 안 적으면 등장음 (v2.23 호출부가 그대로 산다)
  var el=nhSfxBank[key];
  if(!el)return;
  var now=Date.now();
  if(now-(nhSfxAt[key]||0)<(NH_SFX_GAP[key]||120))return;
  nhSfxAt[key]=now;
  try{
    var a=el.cloneNode();
    var p=a.play();
    // 자동재생이 막히면 거부된 약속이 온다 — 재생을 세우지 않고 조용히 지나간다.
    if(p&&p.catch)p.catch(function(){});
  }catch(e){}
}
/** 이 항목이 지금 막 생긴 것인가 — **묻는 순간 한 장을 뗀다.** */
function nhBounceTake(id){
  if(!id||!nhBounceIds[id])return false;
  if(--nhBounceIds[id]<=0)delete nhBounceIds[id];
  return true;
}
/* ── 투명도 연출 (v2.21, M16 이 채운다 — 콘솔 D117 · 액션 dim/undim) ──
   dim 을 부른 **그 순간 깔려 있던** 지도 컨텐츠(스팟·피드 핀·Request·딜)의 id 를 적어 두고
   그 오버레이만 흐린다 — 이후 뜨는 것은 표에 없어 제 불투명도로 온다("이 다음 것만 봐 달라").
   렌더는 전부를 다시 만들므로(rebuildSpots…) 각 오버레이의 onAdd 가 이 표를 다시 본다
   (바운스 표와 같은 구조). opacity 대신 filter 를 쓴다 — 핀들의 기존 opacity 전환(.fp-dot 등)과
   섞이지 않는다. undim·nhReset 이 표를 비운다. */
var nhDimIds=null,nhDimA=0.22;
function nhDimEl(el,id){
  if(!el)return;
  el.style.filter=(nhDimIds&&nhDimIds[id])?('opacity('+nhDimA+')'):'';
}
/** 피드 핀은 클러스터가 있다 — 멤버 전부가 표에 있어야 흐린다 (하나라도 새 것이면 강조 대상). */
function nhDimFeed(el,members){
  if(!el)return;
  var all=!!nhDimIds&&!!members&&members.length>0&&members.every(function(m){var f=m.f||m;return !!nhDimIds[f.id];});
  el.style.filter=all?('opacity('+nhDimA+')'):'';
}
function nhDimApply(){
  try{
    (typeof spotOverlays!=='undefined'?spotOverlays:[])
      .concat(typeof phoneSpotOverlays!=='undefined'?phoneSpotOverlays:[])
      .forEach(function(o){if(o&&o.div&&o.spot)nhDimEl(o.div,o.spot.id);});
    (typeof feedThumbOverlays!=='undefined'?feedThumbOverlays:[])
      .concat(typeof phoneFeedThumbOverlays!=='undefined'?phoneFeedThumbOverlays:[])
      .forEach(function(o){if(o&&o.div)nhDimFeed(o.div,o.members);});
    (typeof reqMarkers!=='undefined'?reqMarkers:[]).forEach(function(o){if(o&&o.div&&o.rq)nhDimEl(o.div,o.rq.id);});
    (typeof dealMarkers!=='undefined'?dealMarkers:[]).forEach(function(o){if(o&&o.div&&o.d)nhDimEl(o.div,o.d.id);});
  }catch(e){}
}
function nhDim(v){
  var n=parseFloat(String(v==null?'':v));
  nhDimA=isFinite(n)?Math.min(0.8,Math.max(0.05,n/100)):0.22; // v = 남길 불투명도 % (5~80, 빈 값 22)
  var ids={};
  try{
    (typeof spotMessages!=='undefined'?spotMessages:[]).forEach(function(s){if(s&&s.id)ids[s.id]=1;});
    (typeof feedItems!=='undefined'?feedItems:[]).forEach(function(f){if(f&&f.id)ids[f.id]=1;});
    (typeof fieldRequests!=='undefined'?fieldRequests:[]).forEach(function(r){if(r&&r.id)ids[r.id]=1;});
    (typeof timeDeals!=='undefined'?timeDeals:[]).forEach(function(d){if(d&&d.id)ids[d.id]=1;});
  }catch(e){}
  nhDimIds=ids;
  nhDimApply();
  return true;
}
function nhUndim(){nhDimIds=null;nhDimApply();return true;}
/* Request 전용 맵 핀: 현장에 질문 신호를 쏘는 특성 — 펄스 링 + ? 티어드롭 (말풍선 없음, 스팟/피드 핀과 구분) */
function ReqPin(rq,m){this.rq=rq;this.position=new google.maps.LatLng(rq.lat,rq.lng);this.div=null;this.setMap(m);}
function initReqPinClass(){
  ReqPin.prototype=new google.maps.OverlayView();
  ReqPin.prototype.onAdd=function(){
    var self=this;
    var d=document.createElement('div');d.className='req-pin';
    d.innerHTML='<span class="rp-ring"></span><span class="rp-ring r2"></span><span class="rp-drop"><i>?</i></span>';
    d.title=this.rq.place+' · 현장 Request';
    d.style.setProperty('--heat',heatColor(zoneHeatT(this.rq.lat,this.rq.lng))); // 트렌드 모드 온도색(속한 존 열기) — 베이직은 CSS 무채색
    d.addEventListener('click',function(e){
      e.stopPropagation();
      if(self._dragged){self._dragged=false;return;} // 방금 끌어 옮긴 손은 팝업을 열지 않는다
      openContentPop('req',reqById(self.rq.id)||self.rq); // 탭=상세 팝업(질문·남은 시간·답변)
    });
    /* 끌어 옮기기 (v2.20) — 스팟 말풍선·피드 핀이 오래 하던 것을 Request 핀도 한다.
       무대 항목이면 옮긴 자리가 nhPosNote 에 남아 **다음 재생에도 그 자리**다 — 그 계약
       (rqw·nhReqIds)은 v2.3·v2.18 에 이미 적혀 있었는데 정작 끄는 손이 없어 죽어 있었다. */
    d.addEventListener('pointerdown',function(e){self._onDown(e);});
    if(nhBounceTake(this.rq.id))d.classList.add('nh-pop-in'); // drop 으로 지금 생긴 것 (v2.11)
    if(typeof nhDimEl==='function')nhDimEl(d,this.rq.id); // dim 액션의 흐림 유지 (v2.21)
    this.div=d;this.getPanes().overlayMouseTarget.appendChild(d);
  };
  // 이동: 터치=롱프레스 후 드래그 / 마우스=즉시 (스팟 말풍선과 같은 문법)
  ReqPin.prototype._onDown=function(e){
    var self=this,m=self.getMap();if(!m)return;
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
    if(isTouch){lpTimer=setTimeout(function(){lpTimer=null;if(!moved)startDrag();},LP_MS);}
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
      self._dragged=true; // 직후 click 은 팝업 대신 무시
      var lat=self.position.lat(),lng=self.position.lng();
      moveRequest(self.rq.id,lat,lng);
      if(typeof nhPosNote==='function')nhPosNote(self.rq.id,lat,lng); // 무대 항목이면 옮긴 자리를 다음 재생에도 (v2.3)
    }
    document.addEventListener('pointermove',mv); // 팬 중 핀이 손가락에서 벗어나도 추적되게 document 에
    document.addEventListener('pointerup',up);
    document.addEventListener('pointercancel',up);
  };
  ReqPin.prototype.draw=function(){var p=this.getProjection();if(!p)return;var pos=p.fromLatLngToDivPixel(this.position);if(this.div&&pos){
    this._ax=pos.x;this._ay=pos.y; // 앵커=원래 좌표
    // v2.9: 겹침 방지가 밀어낸 만큼을 얹어 그린다
    this.div.style.left=(pos.x+(this._ndx||0))+'px';this.div.style.top=(pos.y+(this._ndy||0))+'px';
    // v1.95 컨텐츠 공통 배율 × v2.15 종류별 배율(관리자 s-pins, 곡선은 공통 유지)
    // v2.16 지면 고정 — 점 모양은 없지만 점 크기(12px) 아래로는 안 줄어든다(멀리서 사라지지 않게)
    var m=this.getMap(),z=m?m.getZoom():15,sc=contentDot(m,z,34,PIN_DOT_PX).scale*pinScale('req');
    this.div.style.transformOrigin='50% 100%';this.div.style.transform='translate(-50%,-100%) scale('+sc+')';
  }};
  ReqPin.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}
function loadRequests(){if(IS_CLEAN_EMBED){fieldRequests=[];return;}try{var a=JSON.parse(localStorage.getItem(REQ_KEY)||'[]');if(Array.isArray(a))fieldRequests=a;}catch(e){}}
function saveRequests(){try{localStorage.setItem(REQ_KEY,JSON.stringify(fieldRequests.slice(0,30)));}catch(e){}}
/* Request 등록의 한 길 (v2.18) — 컴포저(사람·무대)와 옛 경로가 전부 여기로 온다.
   stage: 무대(M16)가 만든 것 — 10분 만료를 안 타고(reqActive), 걷는 것은 부르는 쪽 몫.
   quiet: 렌더를 미룬다 — 무대가 바운스 표시를 먼저 적고 스스로 렌더한다 (v2.11 규칙). */
function commitFieldRequest(ll,q,opts){
  opts=opts||{};
  var d=regionAt(ll.lat(),ll.lng());
  var rq={id:'rq_'+Date.now(),lat:ll.lat(),lng:ll.lng(),q:String(q).trim().slice(0,120),place:d?d.name:'지정 위치',answers:[],by:myUid(),ts:Date.now()};
  if(opts.stage)rq.stage=true;
  if(hasLive()){fbDb.collection('liveRequests').doc(rq.id).set({id:rq.id,lat:rq.lat,lng:rq.lng,q:rq.q,place:rq.place,answers:[],by:myUid(),ts:rq.ts}).catch(liveWriteErr);}
  else{fieldRequests.unshift(rq);saveRequests();if(!opts.quiet)renderRequestMarkers();}
  var ab=document.getElementById('ai-bubble'); // 수신 팝업은 타겟 지역의 '다른' 사용자에게만(실시간 리스너) — 요청자 본인에겐 안 띄움
  if(ab){ab.textContent='📍 Request 전송! 근처 현장 유저에게 알림이 갑니다. (10분간 답변 수신)';ab.classList.add('show');setTimeout(function(){ab.classList.remove('show');},2600);}
  return rq;
}
/* ── Request 컴포저 오버레이 (v2.18) ──
   여태 이 자리는 네이티브 prompt() 였다. 그 창은 브라우저 것이라 화면 밖이고(시연에
   안 남는다), 자바스크립트를 멈춰 재생도 세웠다. 스팟 컴포저와 같은 문법의 카드를
   지도 위 그 자리에 세운다 — 사람이 + 메뉴에서 열어도, 무대(request 액션)가 열어도
   같은 것이 보인다. press 옵션은 "꾹 눌러서 연다" 의 롱프레스 링 연출이다(무대 전용). */
var reqComposer=null;
function ReqComposer(latLng,targetMap,opts){this.position=latLng;this.opts=opts||{};this.div=null;this.textEl=null;this.setMap(targetMap||primaryMap());}
function initReqComposerClass(){
  ReqComposer.prototype=new google.maps.OverlayView();
  ReqComposer.prototype.onAdd=function(){
    var self=this;
    var wrap=document.createElement('div');wrap.className='req-composer'+(this.opts.press?' pressing':'');
    wrap.innerHTML='<div class="rc-press" aria-hidden="true"></div>'
      +'<div class="rc-dot"></div><div class="rc-arrow"></div>'
      +'<div class="rc-card"><div class="rc-head">📍 현장 Request</div>'
      +'<input class="rc-text" type="text" maxlength="120" placeholder="이 위치의 무엇이 궁금하세요?" />'
      +'<div class="rc-actions"><button type="button" class="action-btn small rc-cancel">취소</button><button type="button" class="action-btn accent small rc-ok">질문 올리기</button></div></div>';
    ['mousedown','click','dblclick','touchstart','wheel','contextmenu'].forEach(function(ev){wrap.addEventListener(ev,function(e){e.stopPropagation();});});
    this.div=wrap;this.textEl=wrap.querySelector('.rc-text');
    wrap.querySelector('.rc-ok').addEventListener('click',function(){self.commit();});
    wrap.querySelector('.rc-cancel').addEventListener('click',function(){self.close();});
    this.textEl.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();self.commit();}else if(e.key==='Escape'){e.preventDefault();self.close();}});
    this.getMap().getDiv().appendChild(wrap);
    // 링이 차오른 뒤 카드가 선다 — 손가락이 떨어지는 박자다.
    if(this.opts.press)setTimeout(function(){if(wrap.parentNode)wrap.classList.remove('pressing');},560);
    if(!this.opts.auto)setTimeout(function(){if(self.textEl)self.textEl.focus();},this.opts.press?600:30);
  };
  ReqComposer.prototype.draw=function(){var p=this.getProjection();if(!p||!this.div)return;var px=p.fromLatLngToContainerPixel(this.position);if(!px)return;var w=this.div.offsetWidth||214,h=this.div.offsetHeight||150;this.div.style.left=(px.x-w/2)+'px';this.div.style.top=(px.y-h-24)+'px';};
  ReqComposer.prototype.commit=function(){
    var q=(this.textEl?this.textEl.value:'').trim();if(!q)return;
    var ll=this.position;this.close();
    commitFieldRequest(ll,q,this.opts.stage?{stage:true,quiet:true}:null);
  };
  // closed: 이 카드는 이미 끝났다 — 무대의 등록 타이머가 이것을 보고 물러난다 (v2.19).
  ReqComposer.prototype.close=function(){this.closed=true;this.setMap(null);if(reqComposer===this)reqComposer=null;};
  ReqComposer.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}
function closeReqComposer(){if(reqComposer)reqComposer.close();}
/* 사람 경로 (+ 메뉴) — 컴포저 카드를 그 자리에 세운다. presetQ 는 옛 계약(v1.95)의
   흔적인데, 무대는 이제 nhRequestTyped 가 직접 컴포저를 몰므로 여기로 안 온다 —
   그래도 값이 오면 입력에 미리 채워 둔다 (조용히 버리지 않는다). */
function openRequestComposer(presetQ){
  var m=addTargetMap||primaryMap();var ll=addAtLatLng||(m&&m.getCenter());
  closeAddMenu();
  if(!ll){alert('지도를 불러온 뒤 이용해 주세요.');return false;}
  if(typeof ReqComposer.prototype.onAdd!=='function')return false;
  closeReqComposer();
  reqComposer=new ReqComposer(ll,m,{});
  var preset=(presetQ==null)?'':String(presetQ).trim();
  if(preset)setTimeout(function(){if(reqComposer&&reqComposer.textEl)reqComposer.textEl.value=preset.slice(0,120);},50);
  return true;
}
function reqById(id){return (typeof fieldRequests!=='undefined'?fieldRequests:[]).find(function(r){return r.id===id;})||null;}
function showReqBubble(rq,force){ // AI Agent 수신 카드: 현장 Request 필 + 🪙 리워드 + 질문 + 응답 버튼 2개 (시안 v2.18)
  // force = 무대(M16)가 띄우는 장면 — 이 기기의 '보기' 취향이 시연의 한 장면을 지우면 안 된다 (v2.19)
  if(!reqCardShown&&!force)return; // v1.92 드로어 '보기'에서 끌 수 있다
  var b=document.getElementById('req-bubble');if(!b)return;
  document.getElementById('rq-place').textContent=rq.place;
  document.getElementById('rq-text').textContent='"'+rq.q+'"';
  var cn=document.getElementById('rq-coin');if(cn)cn.textContent='🪙 '+REQ_COIN; // 리워드는 상수 하나가 정한다
  var ac=document.getElementById('rq-actions');ac.innerHTML='';
  /* 답하기가 prompt() 였다 — 상세 팝업의 답장 칸(v2.12)이 이미 같은 일을 화면 안에서
     하므로 그리 보낸다. 시안의 이름을 그대로 쓴다: 사진 제출 · Chat 참여. */
  var ph=document.createElement('button');ph.type='button';ph.className='rq-btn';ph.textContent='📷 사진 제출';
  ph.addEventListener('click',function(){hideReqBubble();answerRequestPhoto(rq.id);});
  var cm=document.createElement('button');cm.type='button';cm.className='rq-btn primary';cm.textContent='💬 Chat 참여';
  /* 팝업에는 **전체 객체**를 넘긴다 (v2.19). 라이브 리스너가 주는 rq 는 카드에 필요한
     최소 필드(id·q·place·좌표)뿐이라, 그대로 열면 ts 가 없어 reqActive 가 false 가 되고
     "⏱ 종료" 에 답장 칸도 안 그려졌다 — 답할 수 없는 팝업이었다. */
  cm.addEventListener('click',function(){hideReqBubble();openContentPop('req',reqById(rq.id)||rq);});
  ac.appendChild(ph);ac.appendChild(cm);
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
  var earned=!isMyReq(rq); // v1.92 남의 Request 에 답하면 적립 (내 것에 답하는 건 적립 대상이 아니다)
  var ab=document.getElementById('ai-bubble');
  /* 말의 주인을 가른다 (v2.18). 남의 Request 에 답한 것은 **내가 보낸** 것이라
     "도착" 이 아니라 "전달" 이고, 내 Request 의 답은 **도착한** 것이다 —
     여태는 무대 Request 가 전부 내 것이라 한 문장이 두 장면을 겸했다. */
  if(ab){ab.textContent=earned
    ?'📨 현장 답변이 요청자에게 전달됐어요. 리워드는 잠시 뒤 지급됩니다.'
    :(hasLive()?'📍 답변 전송! 요청자에게 실시간으로 전달했어요.'
               :'📍 '+rq.place+' 현장 답변 도착: '+(img?'📷 ':'')+text);
    ab.classList.add('show');setTimeout(function(){ab.classList.remove('show');},5000);}
  /* v2.27 지급은 즉시가 아니다 — v2.18 의 addCoins+coinFly 는 삭제. 답이 전달되고
     시간이 지나 리워드 말풍선(코인 버스트)이 따로 뜬다. 임베드(시나리오)는 지급 시점을
     'reward' 액션이 정하므로 자동 지연 지급을 걸지 않는다 — 걸면 두 번 지급된다. */
  if(earned&&!IS_EMBED)setTimeout(function(){showRewardBubble();},REQ_REWARD_MS);
}
/* 옮긴 자리를 저장소에 남긴다 (v2.20) — 라이브면 문서를, 아니면 로컬 배열을.
   place 는 좌표를 따라간다: 자리를 옮겨 놓고 옛 동 이름이 남으면 카드가 거짓말을 한다. */
function moveRequest(id,lat,lng){
  var rq=reqById(id);if(!rq)return;
  rq.lat=lat;rq.lng=lng;
  var d=(typeof regionAt==='function')?regionAt(lat,lng):null;
  if(d&&d.name)rq.place=d.name;
  if(hasLive()&&!rq.stage)fbDb.collection('liveRequests').doc(id).update({lat:lat,lng:lng,place:rq.place}).catch(liveWriteErr);
  else if(!rq.stage)saveRequests(); // 무대가 깐 것은 회차가 걷는다 — 저장소에 남기지 않는다
  renderRequestMarkers();
  if(typeof renderDrawerDemo==='function')renderDrawerDemo();
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
  if(mapPinView.req.show) // v2.15 컨텐츠별 표시 설정 — 꺼도 딜·declutter 연쇄는 그대로 탄다
  fieldRequests.filter(reqActive).forEach(function(rq){ // 활성(10분 내·시드)만 표시, 전용 핀(답변 내용 노출 안 함)
    reqMarkers.push(new ReqPin(rq,phoneMap));
  });
  if(typeof renderDealMarkers==='function')renderDealMarkers(); // v1.89 타임딜 핀도 같은 시점에
  declutterMarkers(); // Request 핀도 겹침 방지 대상(장애물)
}

/* ========== [M17] 타임딜 (v1.89 신설) ==========
   지도 위 ⏰ 핀 + 아래에서 올라오는 바텀시트. 핸드오프 시안의 `DEALS` 를 옮긴 것.

   **왜 새 모듈인가**: 스팟(의견)·피드(사진)·Request(질문)와 달리 딜은 **시간이 핵심**이다 —
   남은 시간이 줄고, 0 이 되면 사라진다. 기존 컨텐츠 배열에 얹으면 그 시간 규칙이
   피드·지면 전체로 새어 나간다. 배열도 렌더도 따로 둔다.

   **시드 딜은 만료되지 않는다**(`seed:true`). Request 의 `reqActive` 가 쓰는 것과 같은
   장치다 — 시연 중에 콘텐츠가 사라지면 안 된다. 대신 남은 시간은 **계속 흐르는 것처럼**
   보여야 하므로 벽시계를 주기로 접어서 쓴다(`secs - (now % secs)`). 30분짜리 딜이면
   30분마다 처음으로 돌아가며 계속 카운트다운한다. */
var timeDeals=[], dealMarkers=[], dealSheetId=null, dealTicker=null;
var DEAL_KEY='nowhere_deals';
/* v2.3: 시드 딜(SEED_DEALS·ensureDealSeed) 폐지 — "추가하지 않았는데 딜 2개가 기본으로
   떠 있다"(사용자). 딜은 이제 **까는 쪽이 명시한 것만** 뜬다: 무대(nhLayDeal)·시드
   생성기(initSeedGen). 옛 자동 시드가 localStorage 에 남긴 것(id `dl_N`·seed:true —
   그 경로만 쓰던 id 형식이다)은 읽을 때 걸러 낸다. 안 거르면 코드를 지워도
   dealActive 가 seed:true 를 영영 살려 두어 화면에는 계속 남는다. */
function loadDeals(){if(IS_CLEAN_EMBED){timeDeals=[];return;}try{var a=JSON.parse(localStorage.getItem(DEAL_KEY)||'[]');if(Array.isArray(a))timeDeals=a.filter(function(d){return !(d&&d.seed&&/^dl_\d+$/.test(String(d.id)));});}catch(e){}}
function saveDeals(){try{localStorage.setItem(DEAL_KEY,JSON.stringify(timeDeals.slice(0,20)));}catch(e){}}
function dealRemain(d){ // 남은 초
  if(!d)return 0;
  if(d.seed)return d.secs-Math.floor((Date.now()/1000)%d.secs); // 시드=주기적으로 되감김(시연용 상시 활성)
  return Math.max(0,d.secs-Math.floor((Date.now()-(d.ts||0))/1000));
}
function dealActive(d){return !!d&&(d.seed||dealRemain(d)>0);}
function dealClock(sec){var m=Math.floor(sec/60),s=sec%60;return m+':'+String(s).padStart(2,'0');}
function dealById(id){return timeDeals.filter(function(d){return d.id===id;})[0]||null;}

function DealPin(d,m){this.d=d;this.position=new google.maps.LatLng(d.lat,d.lng);this.div=null;this.setMap(m);}
function initDealPinClass(){
  DealPin.prototype=new google.maps.OverlayView();
  DealPin.prototype.onAdd=function(){
    var self=this;
    var el=document.createElement('div');el.className='deal-pin';
    el.innerHTML='<span class="dp-circle">⏰</span><span class="dp-pct">'+escHtml(String(this.d.pct))+'%</span>';
    el.classList.toggle('no-pct',!mapPinView.deal.label); // v2.15 %라벨 표시 설정
    el.title=this.d.title;
    // v2.15: 핀 탭=매장 전용 페이지. 쿠폰 시트는 그 페이지의 '타임딜 쿠폰받기'가 연다.
    el.addEventListener('click',function(e){e.stopPropagation();openStorePage(self.d.id);});
    if(nhBounceTake(this.d.id))el.classList.add('nh-pop-in'); // drop 으로 지금 생긴 것 (v2.11)
    if(typeof nhDimEl==='function')nhDimEl(el,this.d.id); // dim 액션의 흐림 유지 (v2.21)
    this.div=el;this.getPanes().overlayMouseTarget.appendChild(el);
  };
  DealPin.prototype.draw=function(){var p=this.getProjection();if(!p)return;var pos=p.fromLatLngToDivPixel(this.position);if(this.div&&pos){
    this._ax=pos.x;this._ay=pos.y; // 앵커=원래 좌표 (declutter 규약 v1.59)
    // v2.9: 겹침 방지가 밀어낸 만큼(_ndx·_ndy)을 얹어 그린다. 앵커는 그대로 둔다.
    this.div.style.left=(pos.x+(this._ndx||0))+'px';this.div.style.top=(pos.y+(this._ndy||0))+'px';
    /* 점 전환 (v2.11) — 스팟·피드와 **같은 기준**(contentDot)이다. 딜만 축소에서
       원래 크기로 남아 지도를 덮었다. 점일 때는 앵커를 중심으로(피드 점과 같은 문법). */
    // v1.95 컨텐츠 공통 배율 × v2.15 종류별 배율(관리자 s-pins, 곡선은 공통 유지)
    var m=this.getMap(),z=m?m.getZoom():15,cdD=contentDot(m,z,34,PIN_DOT_PX);
    var sc=cdD.scale*pinScale('deal'),isDot=cdD.dot;
    this.div.classList.toggle('dl-dot',isDot);
    if(isDot){
      this.div.style.transformOrigin='50% 50%';this.div.style.transform='translate(-50%,-50%)';
    }else{
      this.div.style.transformOrigin='50% 100%';this.div.style.transform='translate(-50%,-100%) scale('+sc+')';
    }
  }};
  DealPin.prototype.onRemove=function(){if(this.div&&this.div.parentNode){this.div.parentNode.removeChild(this.div);this.div=null;}};
}
function renderDealMarkers(){
  dealMarkers.forEach(function(o){o.setMap(null);});dealMarkers=[];
  if(!phoneMap||typeof google==='undefined'||!google.maps)return;
  if(!mapPinView.deal.show)return; // v2.15 컨텐츠별 표시 설정
  timeDeals.filter(dealActive).forEach(function(d){dealMarkers.push(new DealPin(d,phoneMap));});
  if(typeof declutterMarkers==='function')declutterMarkers();
}
function openDealSheet(id){
  var sheet=document.getElementById('deal-sheet'),d=dealById(id);
  if(!sheet||!d)return;
  if(sheet.style.display==='none'&&typeof nhSfxPlay==='function')nhSfxPlay('open'); // v2.25
  dealSheetId=id;
  sheet.style.display='';
  syncDealSheet();
  if(!dealTicker)dealTicker=setInterval(syncDealSheet,1000); // 1초 티커 — 열려 있을 때만 돈다
}
function closeDealSheet(){
  var sheet=document.getElementById('deal-sheet');
  if(sheet&&sheet.style.display!=='none'&&typeof nhSfxPlay==='function')nhSfxPlay('close'); // v2.25
  if(sheet)sheet.style.display='none';
  dealSheetId=null;
  if(dealTicker){clearInterval(dealTicker);dealTicker=null;}
}
function syncDealSheet(){
  var d=dealById(dealSheetId);if(!d)return closeDealSheet();
  var rem=dealRemain(d);
  function set(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  set('ds-left',dealClock(rem)+' 남음');
  /* 사진 (v2.12) — 올린 것이 있으면 시트 위에 깔고, 없으면 여태처럼 이모지만 (피드·지면과
     같은 규칙이다). 이모지는 사진이 있어도 남긴다 — 딜의 표식이라 핀과 짝을 이룬다. */
  var dsImg=document.getElementById('ds-img');
  if(dsImg){
    if(d.img){if(dsImg.src!==d.img)dsImg.src=d.img;dsImg.style.display='';}
    else{dsImg.removeAttribute('src');dsImg.style.display='none';}
  }
  set('ds-emoji',d.e);set('ds-title',d.title);
  set('ds-sub',d.shop+' · 내 위치에서 '+dealDistLabel(d));
  set('ds-pct',d.pct+'%');set('ds-now',d.price);set('ds-was',d.was);
  set('ds-stock','남은 수량 '+d.stock);
  var bar=document.getElementById('ds-bar');
  if(bar)bar.style.width=Math.max(4,Math.round(rem/d.secs*100))+'%';
}
/* 쿠폰을 받는 한 길 (v2.20) — 시트의 '쿠폰 받기' 와 무대의 `coupon` 액션이 여기로 온다.
   여태는 시트 안에서 `alert()` 이었다. 그 창은 브라우저 것이라 화면 밖이고(시연에 안 남는다)
   **자바스크립트를 멈춰** 재생이 그 자리에 섰다 — Request 의 prompt() 를 걷어낸 것과 같은 이유다.
   말은 하단 AI Agent 말풍선이 한다(코인 적립과 같은 문법).
   opts.ms=0 이면 **문구를 아예 안 띄운다** — 쿠폰은 받되 말은 다음 장면이 하는 연출이 있다.
   opts.say 로 문구를 갈아 끼울 수 있다(무대가 정한다). */
function claimDeal(d,opts){
  opts=opts||{};
  var ms=(opts.ms==null)?4000:(opts.ms|0);
  if(ms<=0)return true;
  var ab=document.getElementById('ai-bubble');if(!ab)return true;
  ab.textContent=String(opts.say||('🎟 '+(d?d.title:'타임딜')+' 쿠폰을 받았어요 — 매장에서 제시하세요.')).slice(0,160);
  ab.classList.add('show');
  clearTimeout(claimDeal._t);
  claimDeal._t=setTimeout(function(){ab.classList.remove('show');},Math.min(ms,20000));
  return true;
}
function dealDistLabel(d){ // 시안은 '180m' 고정이지만 이 앱은 실제 좌표가 있다 — 실측을 쓴다
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());if(!c)return '근처';
  var m=haversineM(c.lat(),c.lng(),d.lat,d.lng);
  return m>=1000?(m/1000).toFixed(1)+'km':(Math.round(m/10)*10)+'m';
}
function initTimeDeals(){
  loadDeals();
  var sheet=document.getElementById('deal-sheet');if(!sheet)return;
  var cl=document.getElementById('ds-close'),sc=document.getElementById('ds-scrim');
  if(cl)cl.addEventListener('click',closeDealSheet);
  if(sc)sc.addEventListener('click',closeDealSheet);
  var claim=document.getElementById('ds-claim');
  if(claim)claim.addEventListener('click',function(){
    var d=dealById(dealSheetId);closeDealSheet();
    claimDeal(d);
  });
  var share=document.getElementById('ds-share');
  if(share)share.addEventListener('click',function(){
    var d=dealById(dealSheetId);closeDealSheet();
    if(typeof liveChat==='function'){/* 채팅 공유는 M06 경유 — 없으면 알림만 */}
    alert((d?d.title:'딜')+'을 동네 채팅방에 공유했어요.');
  });
}

/* ── [M17] v2.15 매장 전용 페이지 — 타임딜 핀을 누르면 시트 대신 전면 페이지가 뜬다.
   시안(석촌동 쵸리상경): 뱃지 칩 → #매장명 → 주소줄 → 소개 → 액션 4버튼 →
   타임딜 배너 → 사진 그리드. 배지·주소·사진은 전부 **실제로 있는 값**으로 채운다
   (v3 규칙): 참여중=반경 400m 컨텐츠 수, °C=존 온도(36.5~99.9 눈금),
   사진=같은 매장(shop===feed.name, 시드 생성기 연결고리)·근처 피드.
   '타임딜 쿠폰받기'는 기존 딜 시트(z-30)를 다시 연다 — 페이지(z-29) 위로 올라온다. */
var storePageId=null, storeTicker=null;
function storeFeedPhotos(d){ // 콘솔이 올린 사진 우선 → 같은 매장 → 근처 → 결정적 대체 타일
  /* 사람이 이 딜에 붙인 사진이 있으면 **그것만** 쓴다 (v2.17). 근처 피드를 섞으면
     "내가 올린 것" 과 "앱이 주워온 것" 이 한 그리드에 뒤섞여, 무엇을 고쳐야 그 칸이
     바뀌는지 알 수 없다. */
  if(Array.isArray(d.photos)&&d.photos.length)
    return d.photos.slice(0,NH_MAX.dealPhoto).map(function(src){return {src:src};});
  var same=feedItems.filter(function(f){return !f.hidden&&f.src&&f.name===d.shop;});
  var near=feedItems.filter(function(f){
    return !f.hidden&&f.src&&f.name!==d.shop&&f.lat!=null&&haversineM(f.lat,f.lng,d.lat,d.lng)<=400;});
  var out=same.concat(near).slice(0,9);
  if(!out.length){
    var th=['food','cafe','shop','night','park','art'];
    for(var i=0;i<6;i++)out.push({src:seedImg(th[i%th.length],d.shop)});
  }
  return out;
}
function storeChipData(d){ // 시안의 배지 자리 — Overview 칩(ovChipData)과 같은 실값 문법
  var t=zoneHeatT(d.lat,d.lng),near=0,chips=[];
  feedItems.forEach(function(f){if(!f.hidden&&f.lat!=null&&haversineM(f.lat,f.lng,d.lat,d.lng)<=400)near++;});
  fieldRequests.forEach(function(r){if(r.lat!=null&&haversineM(r.lat,r.lng,d.lat,d.lng)<=400)near++;});
  if(t!=null&&t>=0.7)chips.push({t:'⭐ Top Spot',hot:true});
  chips.push({t:'👥 '+Math.max(1,near)+'명 참여중'});
  if(t!=null)chips.push({t:'🔥 '+(36.5+t*63.4).toFixed(1)+'°C',hot:t>=0.5}); // 시안의 °C 눈금
  chips.push({t:'🚩 타임딜 진행중'});
  return chips;
}
function openStorePage(id){
  var pg=document.getElementById('store-page'),d=dealById(id);
  if(!pg||!d)return;
  storePageId=id;
  function set(eid,v){var el=document.getElementById(eid);if(el)el.textContent=v;}
  set('stp-loc',dongAt(d.lat,d.lng)||d.shop);
  var chips=document.getElementById('stp-chips');
  if(chips){chips.innerHTML='';storeChipData(d).forEach(function(c){
    var s=document.createElement('span');s.className='stp-chip'+(c.hot?' hot':'');s.textContent=c.t;chips.appendChild(s);});}
  set('stp-name','#'+d.shop);
  set('stp-addr',(d.addr||dongAt(d.lat,d.lng)||'근처')+' · 내 위치에서 '+dealDistLabel(d));
  set('stp-desc',d.desc||(d.shop+' — '+(dongAt(d.lat,d.lng)||'우리 동네')+'에서 지금 타임딜을 진행 중인 매장이에요. 소식·사진·딜을 한곳에서 보세요.'));
  var img=document.getElementById('stp-pr-img'),promo=document.getElementById('stp-promo');
  if(img&&promo){ // 사진(v2.12 규칙: 통과한 주소만)이 있으면 배너 배경으로
    if(d.img){if(img.src!==d.img)img.src=d.img;img.style.display='';promo.classList.add('has-img');}
    else{img.removeAttribute('src');img.style.display='none';promo.classList.remove('has-img');}
  }
  set('stp-pr-emoji',d.e||'⏰');
  set('stp-pr-title',d.title);
  var grid=document.getElementById('stp-grid');
  if(grid){grid.innerHTML='';storeFeedPhotos(d).forEach(function(f){
    var cell=document.createElement('span');cell.className='stp-ph';
    var im=document.createElement('img');im.src=f.src;im.alt='';im.loading='lazy';cell.appendChild(im);
    grid.appendChild(cell);});}
  var sc=document.getElementById('stp-scroll');if(sc)sc.scrollTop=0;
  if(pg.style.display==='none'&&typeof nhSfxPlay==='function')nhSfxPlay('open'); // v2.25
  pg.style.display='';
  syncStorePage();
  if(!storeTicker)storeTicker=setInterval(syncStorePage,1000); // 열려 있을 때만 도는 1초 티커(시트와 동일)
}
function closeStorePage(){
  var pg=document.getElementById('store-page');
  if(pg&&pg.style.display!=='none'&&typeof nhSfxPlay==='function')nhSfxPlay('close'); // v2.25
  if(pg)pg.style.display='none';
  storePageId=null;
  if(storeTicker){clearInterval(storeTicker);storeTicker=null;}
}
function syncStorePage(){ // 티커 — 남은 시간·가격줄만 갱신 (syncDealSheet 문법: 딜이 사라지면 자기 닫음)
  var d=dealById(storePageId);if(!d)return closeStorePage();
  var rem=dealRemain(d);
  function set(eid,v){var el=document.getElementById(eid);if(el)el.textContent=v;}
  set('stp-pr-time','⏰ '+dealClock(rem)+' 남음 · 남은 수량 '+d.stock);
  set('stp-pr-was',d.was);set('stp-pr-now',d.price);set('stp-pr-pct',d.pct+'% 할인');
  var cta=document.getElementById('stp-coupon');
  if(cta)cta.disabled=!dealActive(d);
}
function initStorePage(){
  var pg=document.getElementById('store-page');if(!pg)return;
  var back=document.getElementById('stp-back');
  if(back)back.addEventListener('click',closeStorePage);
  var mn=document.getElementById('stp-menu'); // 메뉴보기=사진 그리드로 스크롤(사진이 메뉴판 역할)
  if(mn)mn.addEventListener('click',function(){
    var g=document.getElementById('stp-grid');if(g)g.scrollIntoView({behavior:'smooth',block:'start'});
  });
  var mp=document.getElementById('stp-map'); // 지도 이동은 동결 앵커 cpopGoMap 경유(탭 UX 통일 규칙)
  if(mp)mp.addEventListener('click',function(){
    var d=dealById(storePageId);closeStorePage();
    if(d)cpopGoMap('deal',{lat:d.lat,lng:d.lng});
  });
  var cm=document.getElementById('stp-comm');
  if(cm)cm.addEventListener('click',function(){
    closeStorePage();setNavActive('social');switchTab('social');
  });
  var cp=document.getElementById('stp-coupon');
  if(cp)cp.addEventListener('click',function(){if(storePageId)openDealSheet(storePageId);});
}

/* ========== [M06] 소셜 탭: 동네 채팅 · 주제방 · 프라이빗(크레딧) ========== */
/* v1.91: 탭이 3개(동네/주제/프라이빗)에서 **2개(Our/My)** 로 재편됐다.
   ⚠️ 방의 저장 키(`local:` `topic:` `private:`)는 **그대로 둔다** — 키를 바꾸면
   이미 쌓인 대화가 통째로 고아가 된다. Our/My 는 목록을 고르는 **뷰**일 뿐이고,
   방 자신의 type 은 예전 그대로다. */
var socTab='our', socRoom=null, socMsgs={}, socSeedLocal=[], socLiveMsgs={};
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
  document.querySelectorAll('.soc-tab').forEach(function(t){t.classList.toggle('active',t.dataset.soc===socTab);});
  var hint=document.getElementById('soc-hint');
  if(hint)hint.textContent=(socTab==='our')?'지금 이 지역에서 열려 있는 오픈 채팅':'나만 보이는 1:1 · Request 스레드';
  var body=document.getElementById('soc-body'),bar=document.getElementById('soc-inputbar');
  if(!body)return;
  /* v1.91: **목록 → 대화 2단**. 예전에는 '동네' 탭이 목록 없이 바로 방으로 들어갔는데,
     시안은 Our Talk 도 목록에서 고른다(동네 채팅방이 그 목록의 첫 줄이다). */
  if(socRoom){renderChatRoom(body,socRoom);bar.style.display='flex';}
  else{renderRoomList(body);bar.style.display='none';}
}
/* Our = 동네 채팅방 + 주제방 / My = 프라이빗 + 내 Request 스레드.
   각 줄은 시안의 방 카드다: 아바타 · 이름 · 태그 · 마지막 메시지 · 시각 · 안읽음. */
function socRoomsFor(tab){
  var out=[];
  if(tab==='our'){
    var nm=focusedRegionName();
    out.push({key:'local:'+(nm||'동네'),name:(nm?nm+' 채팅방':'동네 채팅방'),e:'🏘️',tag:'오픈',type:'local'});
    socRoomList.filter(function(r){return r.type==='topic';}).forEach(function(r){
      out.push({key:'topic:'+r.name,name:r.name,e:'💬',tag:'모임',type:'topic'});
    });
  }else{
    socRoomList.filter(function(r){return r.type==='private';}).forEach(function(r){
      out.push({key:'private:'+r.name,name:r.name,e:'🔒',tag:null,type:'private'});
    });
    // 내 Request 는 방이 아니라 **스레드**다 — 탭하면 기존 상세 팝업(질문+답변)이 열린다
    fieldRequests.filter(isMyReq).forEach(function(rq){
      var n=(rq.answers||[]).length;
      out.push({req:rq,name:rq.q||'내 Request',e:'🙋',tag:(n?'답변 '+n:'대기 중'),type:'req',unread:n&&!reqAnsSeen[rq.id]?n:0});
    });
  }
  return out;
}
function socRoomLast(r){
  if(r.type==='req'){var a=(r.req.answers||[]);return a.length?(a[a.length-1].text||'사진 답변이 도착했어요'):'아직 답변이 없어요';}
  var arr=hasLive()?(socLiveMsgs[r.key]||[]):(socMsgs[r.key]||[]);
  if(!arr.length)return '새 방 — 첫 메시지를 남겨보세요';
  var m=arr[arr.length-1];return m.text||'';
}
function renderRoomList(body){
  body.innerHTML='';
  var wrap=document.createElement('div');wrap.className='soc-roomlist';
  var list=socRoomsFor(socTab);
  list.forEach(function(r){
    var b=document.createElement('button');b.type='button';b.className='soc-room';
    b.innerHTML='<span class="sr-av"></span>'+
      '<span class="sr-mid"><span class="sr-top"><b class="sr-name"></b><i class="sr-tag"></i></span><span class="sr-last"></span></span>'+
      '<span class="sr-right"><span class="sr-ago"></span><span class="sr-un"></span></span>';
    b.querySelector('.sr-av').textContent=r.e;
    b.querySelector('.sr-name').textContent=r.name;
    var tg=b.querySelector('.sr-tag');
    if(r.tag){tg.textContent=r.tag;tg.classList.add(socTab==='our'?'our':'my');}else tg.style.display='none';
    b.querySelector('.sr-last').textContent=socRoomLast(r);
    var ago=b.querySelector('.sr-ago');
    ago.textContent=(r.type==='req'&&r.req.ts)?timeAgo(r.req.ts):'';
    var un=b.querySelector('.sr-un');
    if(r.unread)un.textContent=r.unread;else un.style.display='none';
    b.addEventListener('click',function(){
      if(r.type==='req'){openContentPop('req',r.req);reqAnsSeen[r.req.id]=1;renderSocial();return;} // Request 는 스레드=상세 팝업
      socRoom={key:r.key,name:r.name};renderSocial();
    });
    wrap.appendChild(b);
  });
  if(!list.length){
    var e=document.createElement('div');e.className='soc-empty';
    e.textContent=(socTab==='our')?'열려 있는 오픈 채팅이 없어요.':'아직 1:1 대화도, 내 Request 도 없어요.';
    wrap.appendChild(e);
  }
  body.appendChild(wrap);
}
function renderChatRoom(body,room){
  body.innerHTML='';
  var head=document.createElement('div');head.className='soc-chathead';
  // v1.91: 동네 방도 목록에서 들어오므로 **항상** 뒤로가기가 있다
  var back=document.createElement('button');back.type='button';back.className='soc-back';back.textContent='‹';
  back.addEventListener('click',function(){socRoom=null;renderSocial();});
  head.appendChild(back);
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
    t.addEventListener('click',function(){socTab=this.dataset.soc;socRoom=null;renderSocial();}); // v1.91: 탭을 바꾸면 항상 목록으로
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


/* ========== [M06] 소셜 컨텐츠 관리 (설정-컨텐츠: 방 개설/타입/삭제 · 동네 채팅 시드) ========== */
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

/* ========== [M13] 데모 시드 데이터 (관리자: 채우기/비우기 · 강남-잠실-성수 3지역 · 수량/밀집도 옵션) ========== */
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
 gwangjang:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Korean_pancakes_and_pan-fried_foods_at_Gwangjang_Market.jpg/960px-Korean_pancakes_and_pan-fried_foods_at_Gwangjang_Market.jpg',
 // 잠실·성수 시드용 (HEAD 200 검증 2026-07-07)
 lotteTower:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Lotte_World_Tower_near_Cheongdam_Bridge_crop.jpg/960px-Lotte_World_Tower_near_Cheongdam_Bridge_crop.jpg',
 lotteWorld:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Lotte_World_day_view_5.jpg/960px-Lotte_World_day_view_5.jpg',
 seongsuBrick:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Industrial_buildings_in_Seongsu-dong.jpg/960px-Industrial_buildings_in_Seongsu-dong.jpg',
 seongsuShop:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Camera_shop_seongsu_seoul_3.jpg/960px-Camera_shop_seongsu_seoul_3.jpg',
 ttukPark:'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Ttukseom_Hangang_Park_20260416_2.jpg/960px-Ttukseom_Hangang_Park_20260416_2.jpg',
 // v1.61 생성 이미지 → 실사진 전면 교체분 (Commons API 검증)
 parkRun:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Around_Samneung_Park.jpg/960px-Around_Samneung_Park.jpg',
 mural:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Drawing_on_the_brick_wall_-_street_art_in_Amsterdam.jpg/960px-Drawing_on_the_brick_wall_-_street_art_in_Amsterdam.jpg',
 nightRoad:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/%28Apgujeong-Sinsa%29_20190312_050439.jpg/960px-%28Apgujeong-Sinsa%29_20190312_050439.jpg',
 cherryStreet:'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/A_street_musician_in_Seoul_under_a_blossom_cherry_tree%2C_April%2C_2016.jpg/960px-A_street_musician_in_Seoul_under_a_blossom_cherry_tree%2C_April%2C_2016.jpg',
 foodAlley:'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Myeongdong_night_market_seoul_1.jpg/960px-Myeongdong_night_market_seoul_1.jpg',
 shopStreet:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Myeongdong_night_market_seoul_2.jpg/960px-Myeongdong_night_market_seoul_2.jpg',
 roastery:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Nolita_Roastery_Coffee_Machines_and_Seating_Area_Rio_de_Janeiro.jpg/960px-Nolita_Roastery_Coffee_Machines_and_Seating_Area_Rio_de_Janeiro.jpg',
 dogWalk:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Fullsizeoutput_2b11.jpg/960px-Fullsizeoutput_2b11.jpg',
 gukbap:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Gugil_Ttaro_gukbap.jpg/960px-Gugil_Ttaro_gukbap.jpg',
 bookNight:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Bookshop_interior_by_night_%2830248939176%29.jpg/960px-Bookshop_interior_by_night_%2830248939176%29.jpg',
 flavin:'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Dan_Flavin%2C_Untitled_%28to_Don_Judd%2C_Colorist%29_1%E2%80%935_%281987%29%2C_Tate_Modern%2C_London%2C_UK.jpg/960px-Dan_Flavin%2C_Untitled_%28to_Don_Judd%2C_Colorist%29_1%E2%80%935_%281987%29%2C_Tate_Modern%2C_London%2C_UK.jpg',
 burger:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Cheeseburger_and_Fries_2.jpg/960px-Cheeseburger_and_Fries_2.jpg',
 bakery:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Bread_at_a_Bakery_%28Unsplash%29.jpg/960px-Bread_at_a_Bakery_%28Unsplash%29.jpg',
 climb:'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Man_climbing_in_bouldering_gym.jpg/960px-Man_climbing_in_bouldering_gym.jpg',
 cherryCampus:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Hanyang_University_ERICA_Cherry_blossoms.jpg/960px-Hanyang_University_ERICA_Cherry_blossoms.jpg',
 barista:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Barista_prepares_espresso_at_coffee_shop.jpg/960px-Barista_prepares_espresso_at_coffee_shop.jpg'};
var SEED_OWNER='shoomerion@gmail.com'; // 시드 콘텐츠 소유자 — 이 계정으로 로그인하면 수정·이동·삭제 가능
// 지역 앵커: 밀집도 옵션의 스케일 기준점 (앵커에서의 오프셋을 배율로 늘리고 줄임 — seedFlat)
var SEED_AREAS={
 gangnam:{name:'강남·역삼·논현',lat:37.5050,lng:127.0310},
 jamsil:{name:'잠실·석촌호수',lat:37.5110,lng:127.0975},
 seongsu:{name:'성수·서울숲',lat:37.5435,lng:127.0500},
 // 중심가 밖 — 일부러 희박하게 둔다. "우리 동네엔 아무것도 없다" 우려 시나리오(M16)가
 // 실제로 빈 화면을 보여줘야 성립하므로, 여기 콘텐츠를 늘리면 그 시연이 죽는다.
 dobong:{name:'방학·쌍문(한산)',lat:37.6650,lng:127.0345}};
var SEED_AREA_ORDER=['gangnam','jamsil','seongsu','dobong']; // 평탄화 순서 고정 = 문서 id(전체 인덱스) 안정. 새 지역은 반드시 뒤에 붙인다(앞에 끼우면 기존 gi가 밀려 문서가 어긋난다)
// 시드 좌표: 지역별 일대에 골고루 분산(같은 성격만 근접 허용 — 밀집 시 지도 클러스터가 묶어줌). 동 라벨은 채우기 시점에 dongAt로 재판정.
var SEED_FEED={
 gangnam:[
 {theme:'food',img:'gopchang',label:'수요미식회 그 집',desc:'웨이팅 40분인데 후회 없음. 곱창은 진리',kind:'cam',region:'역삼1동',zone:null,lat:37.4983,lng:127.0301,likes:14,h:2,name:'퇴근길미식가'},
 {theme:'food',img:'kfood8',label:'점심 특선',desc:'강남 직장인 점심 1만원 이하 몇 없는 집',kind:'post',region:'역삼1동',zone:null,lat:37.4996,lng:127.0338,likes:9,h:5,name:'강남11년차'},
 {theme:'cafe',img:'latte',label:'골목 안 로스터리',desc:'원두 직접 볶는 집. 라떼아트 미쳤다',kind:'cam',region:'역삼1동',zone:null,lat:37.5021,lng:127.0330,likes:12,h:3,name:'카페투어러'},
 {theme:'cafe',img:'cafeInt',label:'창가 자리 맛집',desc:'노트북 작업하기 좋아요. 콘센트 넉넉',kind:'post',region:'역삼1동',zone:null,lat:37.4972,lng:127.0322,likes:7,h:8,name:'프리랜서J'},
 {theme:'park',img:'parkRun',label:'아침 러닝',desc:'오늘 학동공원 5km 완주. 공기 최고',kind:'cam',region:'논현1동',zone:null,lat:37.5148,lng:127.0296,likes:11,h:1,name:'러닝크루장'},
 {theme:'pet',img:'dog',label:'댕댕이 산책',desc:'공원에서 만난 리트리버. 순둥이 그 자체',kind:'cam',region:'논현1동',zone:null,lat:37.5122,lng:127.0272,likes:16,h:4,name:'산책하는댕댕이'},
 {theme:'night',img:'pojang',label:'심야 포차',desc:'새벽 2시에도 자리 없는 그 포차',kind:'cam',region:'논현1동',zone:null,lat:37.5100,lng:127.0224,likes:8,h:26,name:'야식원정대'},
 {theme:'shop',img:'gangnam',label:'팝업 오픈',desc:'신논현 팝업스토어 오늘 오픈! 줄 김',kind:'cam',region:'논현1동',zone:null,lat:37.5052,lng:127.0243,likes:10,h:6,name:'트렌드헌터'},
 {theme:'gym',img:'gym',label:'새벽 운동',desc:'오운완. 6시 헬스장은 평화롭다',kind:'post',region:'역삼1동',zone:null,lat:37.4990,lng:127.0367,likes:5,h:7,name:'갓생살기'},
 {theme:'book',img:'book',label:'동네 책방',desc:'논현동에 이런 독립서점이 있었다니',kind:'post',region:'논현1동',zone:null,lat:37.5135,lng:127.0248,likes:6,h:30,name:'책읽는밤'},
 {theme:'food',img:'brunch',label:'브런치 신상',desc:'주말 브런치 신상 오픈. 프렌치토스트 추천',kind:'post',region:'논현2동',zone:null,lat:37.5168,lng:127.0350,likes:9,h:20,name:'주말미식'},
 {theme:'cafe',img:'cheesecake',label:'디저트 맛집',desc:'치즈케이크 마감 전에 가세요',kind:'cam',region:'역삼2동',zone:null,lat:37.4972,lng:127.0450,likes:13,h:9,name:'디저트지도'},
 {theme:'art',img:'mural',label:'골목 벽화',desc:'출근길에 발견한 새 벽화. 사진각',kind:'cam',region:'역삼2동',zone:null,lat:37.4950,lng:127.0413,likes:4,h:11,name:'골목산책자'},
 {theme:'run',img:'nightRoad',label:'퇴근 러닝',desc:'테헤란로 야간 러닝 함께해요 (매주 화)',kind:'post',region:'역삼1동',zone:null,lat:37.5028,lng:127.0392,likes:7,h:28,name:'러닝크루장'},
 {theme:'shop',img:'flea3',label:'플리마켓',desc:'이번 주말 학동공원 플리마켓 열려요',kind:'post',region:'논현1동',zone:null,lat:37.5142,lng:127.0302,likes:8,h:14,name:'동네소식통'},
 {theme:'night',img:'rooftop',label:'루프탑',desc:'강남 야경 루프탑. 예약 필수',kind:'cam',region:'역삼1동',zone:null,lat:37.5008,lng:127.0284,likes:15,h:50,name:'야경수집가'},
 {theme:'food',img:'noodle',label:'칼국수 맛집',desc:'점심 칼국수 오픈런 성공. 육수가 예술',kind:'cam',region:'역삼1동',zone:null,lat:37.4959,lng:127.0345,likes:6,h:4,name:'점심원정대'},
 {theme:'cafe',img:'espresso',label:'에스프레소 바',desc:'서서 마시는 에바. 2잔이 국룰입니다',kind:'post',region:'역삼1동',zone:null,lat:37.5013,lng:127.0354,likes:10,h:12,name:'카페투어러'},
 {theme:'food',img:'kfood9',label:'전집 발견',desc:'비 오는 날 전+막걸리 조합 아시죠',kind:'cam',region:'논현1동',zone:null,lat:37.5088,lng:127.0263,likes:12,h:16,name:'막걸리동호회'},
 {theme:'park',img:'cherryStreet',label:'벚꽃 스팟',desc:'벚꽃 마지막 주라는데 오늘이 절정',kind:'cam',region:'논현1동',zone:null,lat:37.5133,lng:127.0310,likes:18,h:3,name:'꽃놀이객'},
 {theme:'food',img:'foodAlley',label:'먹자골목 저녁',desc:'6시 넘으니 골목 전체가 꽉 찼어요',kind:'cam',region:'역삼1동',zone:null,lat:37.4977,lng:127.0327,likes:11,h:5,name:'퇴근길미식가'},
 {theme:'cafe',img:'latteHeart',label:'조용한 2층 카페',desc:'혼자 오기 좋은 2층. 대화 소리 안 들려요',kind:'post',region:'역삼2동',zone:null,lat:37.4961,lng:127.0428,likes:8,h:13,name:'프리랜서J'},
 {theme:'shop',img:'garosu',label:'가로수길 나들이',desc:'주말 가로수길, 사람 많지만 구경거리 많아요',kind:'cam',region:'논현2동',zone:null,lat:37.5205,lng:127.0230,likes:9,h:22,name:'트렌드헌터'},
 {theme:'gym',img:'climb',label:'퇴근 후 클라이밍',desc:'역삼 클라이밍장 저녁 타임 자리 여유 있어요',kind:'post',region:'역삼1동',zone:null,lat:37.5036,lng:127.0371,likes:6,h:18,name:'갓생살기'}],
 jamsil:[
 {theme:'food',img:'foodAlley',label:'새내 먹자골목',desc:'잠실새내 전골목, 퇴근길 웨이팅 시작됐어요',kind:'cam',region:'잠실2동',zone:null,lat:37.5117,lng:127.0870,likes:13,h:2,name:'새내토박이'},
 {theme:'run',img:'seokchonLake',label:'석촌호수 러닝',desc:'호수 두 바퀴 5km, 야경이 진짜 미쳤어요',kind:'cam',region:'잠실3동',zone:null,lat:37.5081,lng:127.0989,likes:15,h:1,name:'호수러너'},
 {theme:'night',img:'lotteTower',label:'타워 야경',desc:'555m 위에서 보는 서울. 예약 필수',kind:'cam',region:'잠실6동',zone:null,lat:37.5124,lng:127.1027,likes:18,h:3,name:'전망대덕후'},
 {theme:'park',img:'cherry',label:'석촌호수 벚꽃',desc:'벚꽃축제 시작! 동호 쪽이 한산해요',kind:'cam',region:'잠실6동',zone:null,lat:37.5107,lng:127.1056,likes:20,h:2,name:'꽃놀이객'},
 {theme:'shop',img:'shopStreet',label:'쇼핑 득템',desc:'쇼핑 거리 한 바퀴, 가디건 득템했어요',kind:'post',region:'잠실6동',zone:null,lat:37.5138,lng:127.1004,likes:6,h:9,name:'쇼핑고수'},
 {theme:'cafe',img:'roastery',label:'석촌동 카페',desc:'석촌동 골목 조용한 로스터리 발견',kind:'post',region:'석촌동',zone:null,lat:37.5065,lng:127.1032,likes:8,h:6,name:'카페투어러'},
 {theme:'pet',img:'dogWalk',label:'한강 산책',desc:'잠실 한강공원 댕댕이 천국이에요',kind:'cam',region:'잠실3동',zone:null,lat:37.5170,lng:127.0917,likes:11,h:4,name:'산책하는댕댕이'},
 {theme:'shop',img:'lotteWorld',label:'놀이공원 대기',desc:'자이로드롭 대기 50분... 그래도 간다',kind:'cam',region:'잠실3동',zone:null,lat:37.5113,lng:127.0985,likes:17,h:5,name:'놀이공원러'},
 {theme:'food',img:'gukbap',label:'새내 심야식당',desc:'새벽까지 하는 국밥집, 해장 성지',kind:'post',region:'잠실본동',zone:null,lat:37.5098,lng:127.0846,likes:7,h:27,name:'야식원정대'},
 {theme:'book',img:'bookNight',label:'송리단길 책방',desc:'송리단길 독립서점, 큐레이션 좋아요',kind:'post',region:'송파1동',zone:null,lat:37.5077,lng:127.1063,likes:5,h:12,name:'책읽는밤'},
 {theme:'cafe',img:'espresso',label:'송리단길 에스프레소',desc:'송리단길 골목 에바 한 잔, 줄 짧을 때 가세요',kind:'cam',region:'송파1동',zone:null,lat:37.5063,lng:127.1071,likes:9,h:8,name:'카페투어러'},
 {theme:'food',img:'noodle',label:'호수 앞 칼국수',desc:'석촌호수 산책 끝나고 칼국수. 국물이 진해요',kind:'post',region:'잠실2동',zone:null,lat:37.5094,lng:127.0942,likes:7,h:11,name:'점심원정대'},
 {theme:'art',img:'mural',label:'지하보도 벽화',desc:'잠실역 지하보도 벽화 새로 칠했어요',kind:'cam',region:'잠실6동',zone:null,lat:37.5144,lng:127.1015,likes:5,h:19,name:'골목산책자'},
 {theme:'park',img:'parkMay',label:'한강공원 돗자리',desc:'잠실 한강공원 저녁 바람 최고. 자리 넉넉',kind:'cam',region:'잠실3동',zone:null,lat:37.5183,lng:127.0899,likes:12,h:6,name:'숲세권주민'},
 {theme:'night',img:'pojang',label:'새내 야장',desc:'새내 골목 야장 시즌. 12시 넘어도 북적',kind:'cam',region:'잠실본동',zone:null,lat:37.5106,lng:127.0855,likes:10,h:25,name:'야식원정대'}],
 seongsu:[
 {theme:'park',img:'parkMay',label:'서울숲 피크닉',desc:'서울숲 잔디밭 돗자리 자리 아직 있어요',kind:'cam',region:'성수1가1동',zone:null,lat:37.5442,lng:127.0392,likes:16,h:2,name:'숲세권주민'},
 {theme:'run',img:'parkPath',label:'숲길 러닝',desc:'아침 서울숲 러닝, 은행나무길 코스 추천',kind:'cam',region:'성수1가1동',zone:null,lat:37.5460,lng:127.0421,likes:12,h:1,name:'러닝크루장'},
 {theme:'cafe',img:'seongsuBrick',label:'붉은벽돌 카페',desc:'공장 개조 카페, 천장 높이 실화냐',kind:'cam',region:'성수2가3동',zone:null,lat:37.5424,lng:127.0559,likes:19,h:3,name:'카페투어러'},
 {theme:'art',img:'flavin',label:'창고 전시',desc:'이번 주 전시 무료, 굿즈도 예뻐요',kind:'post',region:'성수2가1동',zone:null,lat:37.5417,lng:127.0568,likes:9,h:7,name:'전시헌터'},
 {theme:'shop',img:'seongsuShop',label:'카메라 소품샵',desc:'필카 소품샵 구경만 1시간 순삭',kind:'cam',region:'성수2가3동',zone:null,lat:37.5447,lng:127.0526,likes:8,h:5,name:'트렌드헌터'},
 {theme:'food',img:'burger',label:'수제버거 신상',desc:'성수 수제버거 신상, 패티 두께 보소',kind:'cam',region:'성수2가3동',zone:null,lat:37.5436,lng:127.0545,likes:14,h:4,name:'점심원정대'},
 {theme:'park',img:'ttukPark',label:'뚝섬 한강뷰',desc:'뚝섬 유원지 자전거 타고 한 바퀴',kind:'cam',region:'성수1가1동',zone:null,lat:37.5385,lng:127.0475,likes:10,h:6,name:'자전거출근러'},
 {theme:'cafe',img:'bakery',label:'뚝섬역 베이커리',desc:'갓 나온 소금빵 시간 맞춰 가세요',kind:'post',region:'성수1가2동',zone:null,lat:37.5469,lng:127.0459,likes:13,h:6,name:'디저트지도'},
 {theme:'gym',img:'climb',label:'클라이밍장',desc:'성수 클라이밍 초보 강습 좋아요',kind:'post',region:'성수2가3동',zone:null,lat:37.5455,lng:127.0568,likes:6,h:10,name:'갓생살기'},
 {theme:'night',img:'garosu',label:'성수 야장',desc:'야장 시즌 시작, 골목 분위기 최고',kind:'cam',region:'성수2가1동',zone:null,lat:37.5412,lng:127.0530,likes:10,h:8,name:'야경수집가'},
 {theme:'food',img:'gopchang',label:'성수 곱창 골목',desc:'성수에도 곱창 골목이 있다는 걸 오늘 알았어요',kind:'cam',region:'성수2가1동',zone:null,lat:37.5404,lng:127.0553,likes:11,h:9,name:'퇴근길미식가'},
 {theme:'cafe',img:'roastery',label:'뚝섬 로스터리',desc:'평일 오전엔 거의 비어 있어요. 작업하기 좋음',kind:'post',region:'성수1가2동',zone:null,lat:37.5476,lng:127.0443,likes:7,h:14,name:'프리랜서J'},
 {theme:'pet',img:'dogWalk',label:'서울숲 반려견 놀이터',desc:'서울숲 반려견 놀이터, 주말 오전이 한산해요',kind:'cam',region:'성수1가1동',zone:null,lat:37.5451,lng:127.0403,likes:13,h:5,name:'산책하는댕댕이'},
 {theme:'shop',img:'flea7',label:'성수 플리마켓',desc:'연무장길 플리마켓 이번 주말까지래요',kind:'post',region:'성수2가3동',zone:null,lat:37.5438,lng:127.0561,likes:8,h:16,name:'동네소식통'},
 {theme:'book',img:'book',label:'연무장길 책방',desc:'성수 독립서점 조용하고 좋아요',kind:'post',region:'성수2가3동',zone:null,lat:37.5430,lng:127.0574,likes:5,h:21,name:'책읽는밤'}],
 // 한산한 동네 — 우려 시나리오용. 딱 2건만 둔다 (여기를 채우면 그 시연이 죽는다)
 dobong:[
 {theme:'park',img:'parkPath',label:'방학천 산책로',desc:'방학천 따라 걷기 좋아요. 사람은 별로 없네요',kind:'cam',region:'방학2동',zone:null,lat:37.6668,lng:127.0351,likes:2,h:31,name:'동네한바퀴'},
 {theme:'food',img:'gukbap',label:'쌍문 국밥집',desc:'20년 된 국밥집. 여긴 아직 아무도 안 올리네요',kind:'post',region:'쌍문4동',zone:null,lat:37.6558,lng:127.0312,likes:1,h:52,name:'쌍문토박이'}]};
var SEED_SPOTS={
 gangnam:[
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
 {t:'불금 번개 8시 어떠세요',emoji:'🍻',lat:37.5001,lng:127.0290}],
 jamsil:[
 {t:'새내 골목 지금 웨이팅 김',emoji:'🍜',lat:37.5120,lng:127.0862,color:'#ff5e7e'},
 {t:'호수 러닝 코스 최고',emoji:'🏃',lat:37.5087,lng:127.0967,color:'#2f9d6f'},
 {t:'전망대 뷰 미쳤다',emoji:'🌃',lat:37.5128,lng:127.1032,color:'#5b4bd6'},
 {t:'벚꽃 포토스팟은 동호 쪽',emoji:'📸',lat:37.5109,lng:127.1053,color:'#f78fb3'},
 {t:'지하상가 세일 중',emoji:'🛍️',lat:37.5139,lng:127.0997,color:'#2f7bff'},
 {t:'석촌동 카페 발견',emoji:'☕',lat:37.5063,lng:127.1030,color:'#a9764f'},
 {t:'심야 국밥 자리 있어요',emoji:'🍲',lat:37.5101,lng:127.0838},
 {t:'놀이공원 대기 50분',emoji:'🎡',lat:37.5111,lng:127.0981,color:'#2f7bff'},
 {t:'한강 돗자리 자리 넉넉',emoji:'🧺',lat:37.5179,lng:127.0905,color:'#2f9d6f'},
 {t:'송리단길 웨이팅 없음',emoji:'☕',lat:37.5069,lng:127.1068,color:'#a9764f'},
 {t:'야장 12시까지 합니다',emoji:'🍻',lat:37.5109,lng:127.0851}],
 seongsu:[
 {t:'서울숲 산책 최고',emoji:'🌳',lat:37.5439,lng:127.0387,color:'#56ab2f'},
 {t:'신상 카페 오픈했어요',emoji:'☕',lat:37.5426,lng:127.0552,color:'#a9764f'},
 {t:'전시 오늘 무료 입장',emoji:'🎨',lat:37.5419,lng:127.0571,color:'#b06ab3'},
 {t:'수제화 장인 가게 여기',emoji:'👟',lat:37.5450,lng:127.0530},
 {t:'갓 나온 소금빵 냄새',emoji:'🥐',lat:37.5470,lng:127.0462,color:'#ff9f43'},
 {t:'소품샵 구경 오세요',emoji:'🛍️',lat:37.5482,lng:127.0547,color:'#2f7bff'},
 {t:'강변 자전거길 뷰 맛집',emoji:'🚲',lat:37.5391,lng:127.0468,color:'#2f9d6f'},
 {t:'연무장길 플리마켓 주말까지',emoji:'🛍️',lat:37.5441,lng:127.0558,color:'#2f7bff'},
 {t:'평일 오전은 거의 비어요',emoji:'☕',lat:37.5473,lng:127.0447,color:'#a9764f'},
 {t:'반려견 놀이터 여기 있어요',emoji:'🐶',lat:37.5449,lng:127.0400,color:'#ff9f43'},
 {t:'곱창 골목 저녁 웨이팅 시작',emoji:'🍢',lat:37.5406,lng:127.0550,color:'#ff5e7e'}],
 // 한산한 동네 — 딱 1건 (우려 시나리오가 빈 화면을 보여줘야 성립한다)
 dobong:[
 {t:'여기 글 남기는 사람 저뿐인가요',emoji:'🫥',lat:37.6661,lng:127.0348}]};
var SEED_REQS={
 gangnam:[
 {q:'파이브가이즈 지금 웨이팅 얼마나 되나요?',lat:37.5060,lng:127.0272,place:'논현1동',answers:[{t:'지금 한 20분 정도예요! 회전 빨라요'}]},
 {q:'학동공원 벚꽃 아직 볼만한가요?',lat:37.5147,lng:127.0301,place:'논현1동',answers:[]},
 {q:'먹자골목 지금 자리 있는 집 있을까요?',lat:37.4981,lng:127.0322,place:'역삼1동',answers:[{t:'안쪽 골목은 아직 여유 있어요'}]}],
 jamsil:[
 {q:'롯데타워 전망대 지금 웨이팅 어때요?',lat:37.5126,lng:127.1023,place:'잠실6동',answers:[{t:'평일 낮이라 10분 컷이에요!'}]},
 {q:'석촌호수 벚꽃 지금 사람 많나요?',lat:37.5085,lng:127.0985,place:'잠실3동',answers:[{t:'동호 쪽은 한산해요'},{t:'서호는 발 디딜 틈 없어요'}]}],
 seongsu:[
 {q:'대림창고 오늘 전시 입장 줄 긴가요?',lat:37.5418,lng:127.0566,place:'성수2가1동',answers:[]},
 {q:'연무장길 주차 자리 있나요?',lat:37.5437,lng:127.0559,place:'성수2가3동',answers:[{t:'골목 안쪽 공영주차장 비어 있어요'}]}],
 // 한산한 동네 — Request 는 아예 없다. 물어볼 사람이 없는 게 이 동네의 사실이다
 dobong:[]};
var SEED_CHAT_LOCAL=[{who:'역삼동주민',t:'오늘 미세먼지 좋네요 ☀️'},{who:'퇴근길미식가',t:'역 근처 새로 생긴 쌀국수집 가보신 분?'},{who:'카페투어러',t:'가봤어요! 국물 진하고 좋던데요 👍'},{who:'동네소식통',t:'이번 주말 학동공원 플리마켓 열린대요'}];
var SEED_CHAT_DOCS=[
 {room:'local:역삼1동',name:'역삼동주민',t:'역삼동 채팅방 개설 기념 인사 드려요 🙌',h:30},
 {room:'local:역삼1동',name:'갓생살기',t:'다들 점심 어디서 드세요? 추천 좀',h:6},
 {room:'topic:🍜 맛집 탐방',name:'퇴근길미식가',t:'이번 주 미션: 강남 곱창 최강자 찾기',h:24},
 {room:'topic:🍜 맛집 탐방',name:'주말미식',t:'저는 먹자골목 안쪽 그 집에 한 표',h:22},
 {room:'topic:🏃 러닝 크루',name:'러닝크루장',t:'화요일 저녁 테헤란로 러닝 모집합니다!',h:20},
 {room:'local:잠실2동',name:'호수러너',t:'석촌호수 벚꽃 이번 주가 피크예요 🌸',h:5},
 {room:'local:잠실본동',name:'새내토박이',t:'새내 먹자골목에 국밥집 새로 열었어요',h:8},
 {room:'local:성수2가1동',name:'숲세권주민',t:'이번 주말 서울숲 플리마켓 다들 가시나요?',h:7},
 {room:'topic:🍜 맛집 탐방',name:'점심원정대',t:'성수 수제버거 vs 새내 국밥, 이번 주 미션',h:4},
 {room:'local:성수2가3동',name:'트렌드헌터',t:'연무장길 플리마켓 오늘까지래요. 가실 분?',h:3},
 {room:'local:성수2가1동',name:'전시헌터',t:'대림창고 전시 오늘 무료입장이래요',h:5},
 {room:'local:성수2가1동',name:'숲세권주민',t:'오 저도 지금 가는 중이에요 👋',h:4},
 {room:'local:역삼1동',name:'점심원정대',t:'오늘 칼국수집 12시 전에 가면 자리 있어요',h:2},
 {room:'local:역삼1동',name:'프리랜서J',t:'2층 카페 콘센트 자리 세 개 비었습니다',h:1},
 {room:'local:잠실2동',name:'호수러너',t:'벚꽃 동호 쪽이 훨씬 한산해요. 참고하세요',h:2},
 {room:'topic:🏃 러닝 크루',name:'호수러너',t:'토요일 아침 석촌호수 한 바퀴 같이 뛰실 분',h:9},
 // 한산한 동네: 방 자체는 있는데 답이 안 달린다 — 이것도 우려 시나리오의 근거다
 {room:'local:방학2동',name:'동네한바퀴',t:'여기 쓰는 분 계신가요? 방학천 산책로 좋더라고요',h:34}];
var SEED_NEWS=[
 {id:'ns_1',theme:'food',img:'gwangjang',label:'이번 주 동네 맛집',title:'강남 먹자골목 웨이팅 리포트',region:'역삼1동',tab:'map'},
 {id:'ns_2',theme:'park',img:'flea7',label:'주말 플리마켓',title:'학동공원 플리마켓 토·일 열려요',region:'논현1동',tab:'map'},
 {id:'ns_3',theme:'cafe',img:'latteHeart',label:'추천 카페 5',title:'역삼 카페로드 신상 5곳 모음',region:'역삼1동',tab:'feed'},
 {id:'ns_4',theme:'park',img:'cherryCampus',label:'석촌호수 벚꽃',title:'석촌호수 벚꽃길 주말 혼잡 예보',region:'잠실2동',tab:'map'},
 {id:'ns_5',theme:'cafe',img:'barista',label:'성수 신상 카페',title:'성수 붉은벽돌 카페 신상 6곳',region:'성수2가1동',tab:'feed'},
 {id:'ns_6',theme:'shop',img:'flea3',label:'연무장길 플리마켓',title:'성수 연무장길 플리마켓 이번 주말까지',region:'성수2가3동',tab:'map'},
 {id:'ns_7',theme:'food',img:'foodAlley',label:'새내 골목 리포트',title:'잠실새내 먹자골목 저녁 웨이팅 현황',region:'잠실2동',tab:'map'}];
// 수량 옵션: 지역별 배열에서 비율만큼 균등 샘플링(지리 분산 유지)
function seedPick(arr,ratio){
  if(ratio>=1)return arr.slice();
  var n=Math.max(1,Math.round(arr.length*ratio)),out=[],step=arr.length/n;
  for(var i=0;i<n;i++)out.push(arr[Math.floor(i*step)]);
  return out;
}
// 지역별 시드 배열 평탄화: gi=전체 목록 기준 고정 인덱스(→ 문서 id 안정, 재채우기 시 같은 문서 덮어씀),
// 밀집도(dens)≠1이면 지역 앵커(SEED_AREAS) 기준으로 좌표 오프셋을 스케일
function seedFlat(byArea,ratio,dens){
  var out=[],base=0;
  SEED_AREA_ORDER.forEach(function(a){
    var arr=byArea[a]||[],c=SEED_AREAS[a];
    var idx=arr.map(function(it,i){return{it:it,gi:base+i};});
    seedPick(idx,ratio).forEach(function(w){
      var o={gi:w.gi},k;for(k in w.it)o[k]=w.it[k];
      if(dens!==1&&typeof o.lat==='number'){o.lat=c.lat+(o.lat-c.lat)*dens;o.lng=c.lng+(o.lng-c.lng)*dens;}
      out.push(o);
    });
    base+=arr.length;
  });
  return out;
}
/* 시드 좌표를 **서로 겹치지 않게** 벌린다 (v2.6).

   시드는 종류별 배열(SEED_FEED·SEED_SPOTS·SEED_REQS)이 각자 손으로 적은 좌표라, 한 종류
   안에서는 떨어져 있어도 **종류를 가로지르면 겹친다** — 스팟 말풍선 위에 사진 핀이
   얹히는 그림이 그래서 났다. 밀집도(dens) 를 '촘촘' 으로 두면 더 심해진다.

   푸는 방식: 가까운 쌍을 서로 반대로 조금씩 밀어내는 완화(relaxation)를 몇 번 돌린다.
   **결정적이다** — 입력 순서만 보고 Math.random 을 안 쓴다(시드는 회차마다 같은 자리에
   있어야 한다). 완전히 같은 좌표면 나눗셈이 깨지므로 순번으로 방향을 준다(황금각).

   기준 거리는 줌 16 에서 핀 하나가 차지하는 폭 정도다 — 그 줌이 '동네 하나' 를 보는
   기본 배율이라 여기서 안 겹치면 더 확대해도 안 겹친다. */
var SEED_MIN_M=85;
function seedSpread(items,minM){
  var n=items.length;if(n<2)return;
  var mLat=1/111320;
  for(var pass=0;pass<8;pass++){
    var moved=false;
    for(var i=0;i<n;i++)for(var j=i+1;j<n;j++){
      var a=items[i],b=items[j];
      if(typeof a.lat!=='number'||typeof b.lat!=='number')continue;
      var d=haversineM(a.lat,a.lng,b.lat,b.lng);
      if(d>=minM)continue;
      var dy=b.lat-a.lat,dx=b.lng-a.lng,norm=Math.sqrt(dy*dy+dx*dx);
      if(norm<1e-9){var ang=i*2.399963;dy=Math.cos(ang);dx=Math.sin(ang);norm=1;} // 같은 자리 — 황금각으로 가른다
      var push=(minM-d)/2+0.5; // 0.5m 여유: 경계에 딱 붙어 다음 패스에서 다시 걸리지 않게
      var mLng=1/(111320*Math.max(0.2,Math.cos(a.lat*Math.PI/180)));
      var uy=dy/norm,ux=dx/norm;
      a.lat-=uy*push*mLat; a.lng-=ux*push*mLng;
      b.lat+=uy*push*mLat; b.lng+=ux*push*mLng;
      moved=true;
    }
    if(!moved)break;
  }
}
function seedDemoData(opts){
  // opts.silent: 임베드(M16) 전용 무음 경로 — 확인창·완료 알림 없이 깐다.
  // IS_EMBED 로 한 번 더 막는다: 임베드가 아니면 클라우드에 쓰이므로 관리자 확인을 거쳐야 한다.
  var silent=!!(opts&&opts.silent&&IS_EMBED);
  if(!silent&&currentRole!=='admin'){alert('관리자만 실행할 수 있어요.');return;}
  var amtEl=document.getElementById('seed-amount'),denEl=document.getElementById('seed-density');
  var ratio=amtEl?(parseFloat(amtEl.value)||1):1,dens=denEl?(parseFloat(denEl.value)||1):1;
  var feeds=seedFlat(SEED_FEED,ratio,dens),spots=seedFlat(SEED_SPOTS,ratio,dens),reqs=seedFlat(SEED_REQS,ratio,dens);
  /* 종류를 **가로질러** 벌린다 (v2.6) — 한 종류 안에서만 떨어뜨려 놨더니 스팟 위에 사진
     핀이 얹혔다. 동 라벨은 아래에서 어차피 dongAt 으로 다시 판정하므로(밀집도 경로와
     같은 이유) 좌표가 몇십 m 움직여도 표기가 어긋나지 않는다. */
  seedSpread(feeds.concat(spots).concat(reqs),SEED_MIN_M);
  if(!silent&&!confirm('강남·잠실·성수·방학(한산) 데모 데이터를 채울까요?\n(피드 '+feeds.length+' · 스팟 '+spots.length+' · Request '+reqs.length+' · 채팅 시드 — 공유 컬렉션에 기록되어 모든 계정에 보여요.\n수량 '+Math.round(ratio*100)+'% · 밀집도 '+(dens===1?'보통':(dens<1?'촘촘':'넓게'))+' — 수량을 줄여 다시 채울 땐 🧹 비우기 먼저.\n⚠️ v1.70 에서 시드가 늘어 문서 인덱스가 밀렸어요 — 기존 시드가 있으면 🧹 비우기 먼저 하세요.\n트렌드 존은 만들지 않아요. 컨텐츠 소유자: '+SEED_OWNER+')'))return;
  var now=Date.now();
  // ① 트렌드 존 시드는 만들지 않음(기존 tzs_* 존은 🧹 비우기로 삭제) — 존은 관리자가 직접 관리
  // ② 요약 지면 (관리자 수동 이미지와 동일 구조 — 수량·밀집도 무관 전체)
  SEED_NEWS.forEach(function(n){
    if(newsItems.some(function(x){return x.id===n.id;}))return;
    newsItems.push({id:n.id,src:(n.img?SEED_IMG[n.img]:seedImg(n.theme,n.label)),region:n.region,tab:n.tab,title:n.title});
  });
  saveNews();renderNews();
  // ③ 피드 / 스팟 / Request / 채팅 (라이브=공유, 폴백=로컬). 밀집도로 좌표가 움직이면 동 라벨 재판정(dongAt, 경계 밖=원 라벨 유지)
  feeds.forEach(function(f){
    var likes={};for(var j=0;j<f.likes;j++)likes['seed_l'+j]=true;
    var doc={src:(f.img?SEED_IMG[f.img]:seedImg(f.theme,f.label)),region:dongAt(f.lat,f.lng)||f.region,zone:f.zone,lat:f.lat,lng:f.lng,kind:f.kind,desc:f.desc,name:f.name,by:'seed_u'+f.gi,byEmail:SEED_OWNER,ts:now-f.h*3600e3,likes:likes,seed:true};
    if(hasLive())fbDb.collection('liveFeed').doc('fs_'+f.gi).set(doc).catch(liveWriteErr);
    else{doc.id='fs_'+f.gi;doc.type='photo';if(!feedItems.some(function(x){return x.id===doc.id;}))feedItems.push(doc);}
  });
  spots.forEach(function(s){
    var doc={id:'sps_'+s.gi,lat:s.lat,lng:s.lng,text:s.t,emoji:s.emoji,color:s.color||null,by:'seed_u'+s.gi,byEmail:SEED_OWNER,ts:now-s.gi*3600e3,seed:true};
    if(hasLive())fbDb.collection('liveSpots').doc(doc.id).set(doc).catch(liveWriteErr);
    else if(!demoSpots.some(function(x){return x.id===doc.id;})){doc.live=true;demoSpots.push(doc);}
  });
  reqs.forEach(function(r){
    var doc={id:'rqs_'+r.gi,lat:r.lat,lng:r.lng,q:r.q,place:dongAt(r.lat,r.lng)||r.place,answers:r.answers.map(function(a){return {t:a.t,ts:now-3600e3};}),by:'seed_u'+r.gi,ts:now-2*3600e3,seed:true};
    if(hasLive())fbDb.collection('liveRequests').doc(doc.id).set(doc).catch(liveWriteErr);
    else if(!fieldRequests.some(function(x){return x.id===doc.id;}))fieldRequests.unshift(doc);
  });
  SEED_CHAT_DOCS.forEach(function(c,i){
    if(hasLive())fbDb.collection('liveChat').doc('cs_'+i).set({room:c.room,t:c.t,by:'seed_u'+i,name:c.name,ts:now-c.h*3600e3,seed:true}).catch(liveWriteErr);
  });
  socSeedLocal=SEED_CHAT_LOCAL.slice();saveChat();
  if(!hasLive()){saveFeed();saveLocalSpots();saveRequests();rebuildSpots();renderFeedColList();renderFeedMarkers();renderRequestMarkers();renderDrawerDemo();if(currentTab==='feed')renderFeed();}
  markCloudDirty(); // 존·소셜 시드 → 공유문서 저장 (임베드는 fbDb 가 없어 no-op)
  if(!silent)alert('🌱 데모 데이터를 채웠어요 (피드 '+feeds.length+' · 스팟 '+spots.length+' · Request '+reqs.length+'). 강남·잠실·성수 지도를 확인해 보세요.');
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

/* ========== [M13] v1.93 지역 시드 생성기 · 그룹 관리 (콘솔 전용) ==========
   기존 `seedDemoData` 는 **고정 4지역**에 미리 써 둔 문구를 깐다. 시연 지역이 늘 때마다
   상수를 고쳐야 하고, 처음 가 보는 동네에서는 아무것도 못 깐다.
   이 생성기는 **지금 보고 있는 지역**에 컨텐츠를 만든다.

   ── 어디서 '연관있는' 것을 가져오나 ─────────────────────────────────────
   ① **Places 근접 검색**이 그 반경 안의 **실제 상호**를 준다(카페·식당·공원·상점…).
   ② 그 상호를 **AI 에이전트**(M08 과 같은 엔드포인트)에 넘겨 동네 앱 말투의 문구를 받는다.
   ③ **AI 가 없거나 실패해도 멈추지 않는다** — 장소 종류별 템플릿으로 문구를 채운다.
      생성기가 외부 서비스 상태에 인질로 잡히면 시연 직전에 못 쓴다.

   ── 그룹 ───────────────────────────────────────────────────────────────
   한 번의 생성 = **그룹 하나**. 만들어진 항목은 전부 `sgroup:<id>` 를 달고,
   그룹 단위로 지도 이동·숨김·삭제한다. 기존 시드(`seed:true` · `fs_`/`sps_`/`rqs_`)와는
   **id 공간이 다르다**(`sg_`) — 🧹 비우기가 그룹을 건드리지 않고, 그룹 삭제가 기존 시드를
   건드리지 않는다. 둘을 같은 플래그로 묶으면 한쪽을 지울 때 다른 쪽이 같이 날아간다. */
var seedGroups=[], SG_KEY='nowhere_seedgroups', sgBusy=false;
function loadSeedGroups(){try{var a=JSON.parse(localStorage.getItem(SG_KEY)||'[]');if(Array.isArray(a))seedGroups=a;}catch(e){}}
function saveSeedGroups(){try{localStorage.setItem(SG_KEY,JSON.stringify(seedGroups.slice(0,40)));}catch(e){}}

/* Places 종류 → 이 앱의 테마(사진 팔레트·문구 세트). 목록에 없으면 'shop' 으로 떨어진다 */
var SG_THEME={cafe:'cafe',bakery:'cafe',restaurant:'food',meal_takeaway:'food',bar:'food',
  park:'park',gym:'gym',book_store:'book',library:'book',
  store:'shop',clothing_store:'shop',convenience_store:'shop',supermarket:'shop',
  tourist_attraction:'park',art_gallery:'book',museum:'book'};
/* 템플릿 — AI 없이도 성립하는 세트. `{n}` 은 실제 상호로 치환된다.

   v2.9: **종류마다 여러 벌**이다. 전에는 한 벌뿐이라 12곳을 만들면 상호만 다르고 문장이
   전부 같았다 — 사용자가 "재고 있다 이런 것만 만들어진다" 고 한 것이 이것이다.
   고르기는 장소 순번(i)이라 결정적이다(회차마다 같은 자리에 같은 글). */
var SG_TPL={
  cafe:{e:'☕',img:'latte',
    spot:['{n} 창가 자리 비어 있어요','{n} 지금 조용해요, 작업하기 좋음','{n} 콘센트 자리 아직 있어요',
          '{n} 방금 디저트 나왔어요','{n} 2층이 훨씬 한산해요'],
    feed:['{n} 라떼 맛있다. 조용해서 오래 앉아 있기 좋음','{n} 오늘 원두 바뀌었대요. 산미 있는 쪽',
          '{n} 창가 햇살 들어올 때가 제일 예쁨','{n} 케이크 종류 생각보다 많다',
          '{n} 아침 일찍 오면 자리 골라 앉을 수 있어요'],
    req:['{n} 지금 웨이팅 있나요?','{n} 콘센트 있는 자리 남았을까요?','{n} 디카페인 되나요?',
         '{n} 몇 시까지 하는지 아시는 분','{n} 지금 시끄러운 편인가요?'],
    deal:['{n} 오후 음료 20% 타임딜','{n} 마감 전 디저트 떨이','{n} 원두 소진 임박 할인']},
  food:{e:'🍜',img:'noodle',
    spot:['{n} 지금 웨이팅 없어요','{n} 점심 줄 방금 빠졌어요','{n} 브레이크타임 곧 들어가요',
          '{n} 포장이 훨씬 빨라요','{n} 오늘 재료 소진 임박이래요'],
    feed:['{n} 점심 특선 가성비 좋다','{n} 국물이 진해서 해장에 딱','{n} 양이 생각보다 많아요',
          '{n} 반찬 리필 편하게 해주심','{n} 혼밥하기 편한 자리 많음'],
    req:['{n} 오늘 브레이크타임 언제예요?','{n} 지금 웨이팅 얼마나 되나요?','{n} 포장 되나요?',
         '{n} 주차 가능한지 아시는 분','{n} 예약 받나요?'],
    deal:['{n} 마감 임박 30% 타임딜','{n} 저녁 세트 할인','{n} 포장 주문 할인']},
  park:{e:'🌳',img:'parkPath',
    spot:['{n} 산책로 한산해요','{n} 벤치 자리 넉넉해요','{n} 지금 노을 예쁨',
          '{n} 그늘 쪽이 훨씬 시원해요','{n} 강아지 산책 많이 나왔어요'],
    feed:['{n} 오늘 공기 좋다. 러닝 완주','{n} 한 바퀴 딱 좋은 거리','{n} 잔디밭 자리 아직 많아요',
          '{n} 저녁에 조명 들어오면 분위기 좋음','{n} 유아차 다니기 편한 길'],
    req:['{n} 주차 자리 있나요?','{n} 지금 사람 많나요?','{n} 화장실 어디쪽인가요?',
         '{n} 돗자리 펴도 되나요?','{n} 야간 조명 몇 시까지예요?'],
    deal:[]},
  gym:{e:'💪',img:'gym',
    spot:['{n} 지금 사람 없어요','{n} 러닝머신 다 비어 있어요','{n} 샤워실 한산해요',
          '{n} 저녁 타임은 붐벼요','{n} 신규 기구 들어왔어요'],
    feed:['{n} 새벽 타임이 제일 한산','{n} 기구 상태 깔끔해요','{n} 샤워실이 넓고 좋음',
          '{n} PT 상담 부담 없이 해주심','{n} 주차 2시간 무료라 편함'],
    req:['{n} 일일권 얼마예요?','{n} 지금 붐비나요?','{n} 락커 대여 되나요?',
         '{n} 몇 시부터 여나요?','{n} 샤워용품 있나요?'],
    deal:['{n} 오늘 등록 30% 할인','{n} 일일권 반값','{n} 3개월 등록 추가 할인']},
  book:{e:'📚',img:'book',
    spot:['{n} 신간 들어왔어요','{n} 열람석 아직 비어 있어요','{n} 지금 아주 조용해요',
          '{n} 창가 자리 좋아요','{n} 오늘 늦게까지 한대요'],
    feed:['{n} 여기 이런 곳이 있었다니','{n} 큐레이션이 취향 저격','{n} 앉아서 읽을 자리가 많음',
          '{n} 조명이 눈이 편해요','{n} 조용해서 집중 잘 됨'],
    req:['{n} 오늘 몇 시까지 해요?','{n} 열람석 남았나요?','{n} 노트북 써도 되나요?',
         '{n} 이 책 있나요?','{n} 주말에도 여나요?'],
    deal:[]},
  shop:{e:'🛍',img:'gangnam',
    spot:['{n} 오늘 신상 들어왔어요','{n} 지금 계산대 안 붐벼요','{n} 세일 코너 생겼어요',
          '{n} 재고 정리 중이래요','{n} 이월 상품 싸게 나왔어요'],
    feed:['{n} 구경만 해도 재밌음','{n} 생각보다 종류가 많다','{n} 가격대가 착한 편',
          '{n} 직원분이 편하게 둘러보게 해주심','{n} 여기 이 브랜드도 들어와 있네요'],
    req:['{n} 재고 있나요?','{n} 오늘 몇 시까지 해요?','{n} 교환 되나요?',
         '{n} 주차 되나요?','{n} 지금 줄 긴가요?'],
    deal:['{n} 마감 할인 25%','{n} 이월 상품 반값','{n} 오늘만 1+1']}
};
function sgTheme(types){
  for(var i=0;i<(types||[]).length;i++)if(SG_THEME[types[i]])return SG_THEME[types[i]];
  return 'shop';
}
/* Places 근접 검색. 라이브러리가 없으면 **조용히 실패하지 않고** 이유를 돌려준다 —
   Places API 는 GCP 에서 따로 켜야 해서, 안 켜져 있으면 그 사실이 보여야 한다. */
function sgSearchPlaces(lat,lng,radius,cb){
  if(typeof google==='undefined'||!google.maps||!google.maps.places||!google.maps.places.PlacesService){
    cb(null,'Places 라이브러리를 못 불러왔어요. GCP 콘솔에서 Places API 를 켜 주세요.');return;
  }
  /* ⚠️ **지도 컨테이너 div 를 넘기지 않는다** (v2.9). PlacesService 의 인자는 "출처 표기를
     그릴 곳" 이라, `#map` 을 주면 Maps 가 자기 DOM 을 채워 둔 그 자리에 표기 노드를 끼워
     넣는다 — 관리자 콘솔에서 시드 생성을 돌리면 **지도가 통째로 사라지던 것**이 이것이다.
     Map 객체를 주면 Maps 가 자기 규칙대로(지도 안 구석에) 표기를 그린다. */
  var host=(typeof map!=='undefined'&&map)||(typeof phoneMap!=='undefined'&&phoneMap)||null;
  if(!host){cb(null,'지도가 아직 준비되지 않았어요.');return;}
  var svc=new google.maps.places.PlacesService(host);
  svc.nearbySearch({location:new google.maps.LatLng(lat,lng),radius:Math.max(50,Math.min(3000,radius))},
    function(res,status){
      var S=google.maps.places.PlacesServiceStatus;
      if(status===S.ZERO_RESULTS){cb([],null);return;}
      /* REQUEST_DENIED = **키가 아니라 API 가 안 켜진 것**이다(Maps 는 되는데 Places 만 막힘).
         메시지에 그 사실과 할 일을 그대로 적는다 — '실패'만 띄우면 키를 의심하게 된다. */
      if(status===S.REQUEST_DENIED){cb(null,'DENIED');return;}
      if(status!==S.OK||!res){cb(null,'Places 검색 실패 ('+status+')');return;}
      cb(res.filter(function(r){return r.geometry&&r.geometry.location;}).map(function(r){
        return {name:r.name,lat:r.geometry.location.lat(),lng:r.geometry.location.lng(),
                types:r.types||[],theme:sgTheme(r.types)};
      }),null);
    });
}
/* AI 문구 — M08 과 같은 엔드포인트지만 **Ask Map 대화 이력은 안 건드린다**.
   섞이면 사용자의 다음 질문에 시드 생성 프롬프트가 문맥으로 딸려 들어간다. */
function sgAskAgent(prompt,onOk,onFail){
  var c=(typeof aiAgentCfg==='function')?aiAgentCfg():null;
  if(!c||!c.ENABLED||!c.ENDPOINT){onFail('agent-off');return;}
  var ctl=(typeof AbortController!=='undefined')?new AbortController():null;
  var timer=setTimeout(function(){if(ctl)ctl.abort();},c.TIMEOUT_MS||12000);
  fetch(c.ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question:prompt,context:{mode:'seed-gen'},history:[]}),
    signal:ctl?ctl.signal:undefined})
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(d){clearTimeout(timer);var t=((d&&d.answer)||'').trim();if(!t)throw new Error('빈 응답');onOk(t);})
    ['catch'](function(e){clearTimeout(timer);onFail(String(e&&e.message||e));});
}
/* 에이전트 응답에서 JSON 배열만 건져낸다. 모델이 앞뒤에 말을 붙이는 건 흔한 일이라
   **파싱 실패를 정상 경로로 취급**한다 — 실패하면 템플릿으로 간다. */
function sgParseLines(text){
  try{
    var m=text.match(/\[[\s\S]*\]/);if(!m)return null;
    var arr=JSON.parse(m[0]);
    return Array.isArray(arr)?arr:null;
  }catch(e){return null;}
}
/* 템플릿 하나를 골라 상호를 끼운다. 여러 벌이면 순번으로 고른다 — 결정적이다.
   문자열 하나만 준 옛 형태도 그대로 받는다(호출부를 한 번에 다 못 고칠 때를 위해). */
function sgFill(tpl,name,i){
  var t=Array.isArray(tpl)?(tpl.length?tpl[Math.abs(i|0)%tpl.length]:''):tpl;
  return (t||'').replace(/\{n\}/g,name);
}
function sgHas(tpl){return Array.isArray(tpl)?tpl.length>0:!!tpl;} // 빈 배열은 truthy 라 따로 본다

function sgUI(){
  function v(id,d){var e=document.getElementById(id);if(!e)return d;var n=parseFloat(e.value);return isNaN(n)?d:n;}
  function ck(id){var e=document.getElementById(id);return !!(e&&e.checked);}
  return {count:Math.max(1,Math.min(40,v('sg-count',12))),radius:Math.max(50,Math.min(3000,v('sg-radius',400))),
          spot:ck('sg-k-spot'),feed:ck('sg-k-feed'),req:ck('sg-k-req'),deal:ck('sg-k-deal')};
}
function sgFocusPoint(){
  var c=(phoneMap&&phoneVisibleCenter())||(map&&map.getCenter());
  if(!c)return null;
  return {lat:c.lat(),lng:c.lng(),name:focusedRegionName()||currentCenterDong()||'이 지역'};
}
function sgSyncFocus(){
  var el=document.getElementById('sg-region');if(!el)return;
  var f=sgFocusPoint();
  el.textContent=f?f.name:'지도를 먼저 불러오세요';
}
function sgStatus(msg){var el=document.getElementById('sg-status');if(el)el.textContent=msg||'';}

function sgGenerate(){
  if(currentRole!=='admin'){alert('관리자만 실행할 수 있어요.');return;}
  if(sgBusy)return;
  var f=sgFocusPoint();if(!f){alert('지도가 아직 준비되지 않았어요.');return;}
  var o=sgUI();
  if(!o.spot&&!o.feed&&!o.req&&!o.deal){alert('만들 컨텐츠 종류를 하나 이상 골라 주세요.');return;}
  sgBusy=true;sgStatus('주변 장소를 찾는 중…');
  sgSearchPlaces(f.lat,f.lng,o.radius,function(places,err){
    if(err==='DENIED'){
      /* Places API 가 꺼져 있어도 **메뉴가 죽지는 않게** 한다. 실제 상호 대신 동 이름으로
         자리를 만들어 반경 안에 뿌린다 — 켜는 즉시 같은 버튼이 진짜 상호를 가져온다. */
      sgStatus('');
      if(!confirm('Places API 가 꺼져 있어요(REQUEST_DENIED).\n\nGCP 콘솔 → API 및 서비스에서 '+
                  '"Places API"를 켜면 주변 실제 상호로 만들 수 있어요.\n\n'+
                  '지금은 ‘'+f.name+'’ 이름 기반 기본 장소로 대신 만들까요?')){sgBusy=false;return;}
      var fb=sgFallbackPlaces(f,o);
      sgStatus('문구를 만드는 중…');
      sgAfterPlaces(f,o,fb);
      return;
    }
    if(err){sgBusy=false;sgStatus('');alert(err);return;}
    if(!places||!places.length){sgBusy=false;sgStatus('');alert('반경 '+o.radius+'m 안에서 장소를 못 찾았어요. 반경을 넓혀 보세요.');return;}
    sgAfterPlaces(f,o,places.slice(0,o.count));
  });
}
/* Places 없이 쓸 자리 — 동 이름 + 종류로 만든 **가짜 상호**를 반경 안에 결정적으로 흩는다.
   진짜 검색 결과인 척하지 않는다: 이름이 '역삼1동 카페 2' 처럼 보이므로 구분이 된다. */
function sgFallbackPlaces(f,o){
  var themes=['cafe','food','park','gym','book','shop'],out=[];
  var LABEL={cafe:'카페',food:'식당',park:'공원',gym:'짐',book:'책방',shop:'상점'};
  for(var i=0;i<o.count;i++){
    var th=themes[i%themes.length];
    var ang=(i*137.5)*Math.PI/180, rad=o.radius*(0.35+0.6*((i%5)/5)); // 황금각 분산(결정적)
    out.push({
      name:f.name+' '+LABEL[th]+(i<themes.length?'':' '+(Math.floor(i/themes.length)+1)),
      lat:f.lat+(rad*Math.cos(ang))/111000,
      lng:f.lng+(rad*Math.sin(ang))/(111000*Math.cos(f.lat*Math.PI/180)),
      types:[th],theme:th
    });
  }
  return out;
}
function sgAfterPlaces(f,o,picked){
  sgStatus('장소 '+picked.length+'곳 · 문구를 만드는 중…');
  /* v2.9: 프롬프트를 다시 썼다. 전에는 "짧은 문구를 만들어 주세요" 뿐이라 12곳이
     "재고 있나요? / 웨이팅 있나요?" 같은 한 패턴으로 돌아왔다. 셋을 더한다:
     ①장소의 실제 분류(types)를 같이 준다 — theme 만 주면 다 같은 상점으로 읽힌다.
     ②지금 시각을 준다 — 아침·점심·밤에 할 말이 다르다.
     ③**같은 말투를 반복하지 말라고 못박는다** + 각 칸이 서로 다른 각도를 보게 한다.
     ⚠️ '서울' 을 붙이지 않는다 — 수원 매탄3동에서 돌렸을 때 프롬프트가 거짓을 말했다. */
  var hour=new Date().getHours();
  var prompt='아래는 「'+f.name+'」 주변의 실제 장소 목록입니다. 지금은 '+hour+'시입니다.\n'+
    picked.map(function(p,i){
      var t=(p.types||[]).filter(function(x){return x!=='point_of_interest'&&x!=='establishment';}).slice(0,3).join(', ');
      return (i+1)+'. '+p.name+(t?' — '+t:'')+' [분류:'+p.theme+']';
    }).join('\n')+
      '\n\n동네 실시간 지도 앱에 이웃들이 올릴 법한 한국어 문구를 장소마다 하나씩 만들어 주세요.\n'+
      '- spot: 지도 위 한 줄 (20자 내외). 지금 그 앞을 지나는 사람이 남길 말.\n'+
      '- feed: 사진에 붙는 설명 (25자 내외). 다녀온 사람의 감상.\n'+
      '- req: 가기 전에 근처 사람에게 물을 질문 (20자 내외).\n'+
      '- deal: 그 가게가 낼 법한 타임딜 제목 (20자 내외). 장소 성격상 할인이 어색하면 빈 문자열.\n'+
      '\n지킬 것:\n'+
      '- **12곳이 다 다른 말을 해야 합니다.** 같은 문장 틀("~있나요?", "~좋아요")을 반복하지 마세요.\n'+
      '- 그 장소의 분류에 맞는 구체적인 것을 말하세요 (카페=자리·원두, 공원=산책로·주차,\n'+
      '  헬스장=기구·샤워실, 서점=열람석·신간). 아무 데나 붙는 말은 쓰지 마세요.\n'+
      '- 시간대를 살리세요 — 아침이면 문 여는 시간, 점심이면 웨이팅, 밤이면 마감.\n'+
      '- **지어내지 마세요**: 가격·영업시간·전화번호·주소·평점. 상호는 준 것만 씁니다.\n'+
      '\n설명 없이 JSON 배열만 출력하세요. 형식:'+
      ' [{"spot":"...","feed":"...","req":"...","deal":"..."}]'+
      ' 배열 길이는 정확히 '+picked.length+'개여야 합니다.';
  /* 왜 템플릿으로 떨어졌는지 구분해 둔다 (v2.8) — 전에는 파싱 실패까지 "응답을 못
     받았어요" 로 뭉쳐서, 실제로는 200 이 오는데 형식만 안 맞던 상황을 못 알아봤다. */
  sgAskAgent(prompt,function(text){
    var lines=sgParseLines(text);
    sgCommit(f,o,picked,lines,lines?'':'형식이 안 맞아 못 썼어요');
  },function(why){
    sgCommit(f,o,picked,null,'응답을 못 받았어요 ('+String(why||'').slice(0,40)+')');
  });
}
function sgCommit(focus,o,places,ai,aiWhy){
  var gid='g'+Date.now().toString(36);
  var now=Date.now(), counts={spot:0,feed:0,req:0,deal:0};
  places.forEach(function(p,i){
    var T=SG_TPL[p.theme]||SG_TPL.shop;
    var a=(ai&&ai[i])||{};
    var jit=function(k){return (((i*37+k*13)%11)-5)/20000;}; // 같은 좌표 겹침 방지(결정적 — Math.random 금지)
    if(o.spot){
      var st=(a.spot||sgFill(T.spot,p.name,i)).slice(0,60);
      var sd={id:'sg_'+gid+'_s'+i,lat:p.lat+jit(1),lng:p.lng+jit(2),text:st,emoji:T.e,
              by:'sg_'+gid,byEmail:SEED_OWNER,ts:now-i*600e3,sgroup:gid};
      if(hasLive())fbDb.collection('liveSpots').doc(sd.id).set(sd).catch(liveWriteErr);
      else{sd.live=true;demoSpots.push(sd);}
      counts.spot++;
    }
    if(o.feed){
      var ft=(a.feed||sgFill(T.feed,p.name,i)).slice(0,80);
      var fd={id:'sg_'+gid+'_f'+i,src:(SEED_IMG[T.img]||seedImg(p.theme,p.name)),
              region:dongAt(p.lat,p.lng)||focus.name,zone:null,lat:p.lat+jit(3),lng:p.lng+jit(4),
              kind:'post',desc:ft,name:p.name,by:'sg_'+gid,byEmail:SEED_OWNER,
              ts:now-i*900e3,likes:{},sgroup:gid};
      if(hasLive())fbDb.collection('liveFeed').doc(fd.id).set(fd).catch(liveWriteErr);
      else{fd.type='photo';feedItems.push(fd);}
      counts.feed++;
    }
    if(o.req&&i%3===0){ // Request 는 드물어야 '현장 질문'으로 읽힌다 — 3곳마다 하나
      var qt=(a.req||sgFill(T.req,p.name,i)).slice(0,60);
      var rd={id:'sg_'+gid+'_r'+i,lat:p.lat+jit(5),lng:p.lng+jit(6),q:qt,
              place:dongAt(p.lat,p.lng)||focus.name,answers:[],by:'sg_'+gid,ts:now,seed:true,sgroup:gid};
      if(hasLive())fbDb.collection('liveRequests').doc(rd.id).set(rd).catch(liveWriteErr);
      else fieldRequests.unshift(rd);
      counts.req++;
    }
    if(o.deal&&sgHas(T.deal)&&i%4===0){ // 타임딜은 더 드물게 — 흔하면 특가가 아니다
      var dt=(a.deal||sgFill(T.deal,p.name,i)).slice(0,40);
      var pct=[20,25,30,33][i%4];
      timeDeals.push({id:'sg_'+gid+'_d'+i,lat:p.lat+jit(7),lng:p.lng+jit(8),e:T.e,title:dt,
        shop:p.name,pct:pct,price:'현장가',was:'정가',stock:(6+i%9)+'개',secs:1800,ts:now,seed:true,sgroup:gid});
      counts.deal++;
    }
  });
  if(!hasLive()){saveFeed();saveLocalSpots();saveRequests();}
  saveDeals();
  seedGroups.unshift({id:gid,name:focus.name,lat:focus.lat,lng:focus.lng,radius:o.radius,
    places:places.length,counts:counts,ts:now,hidden:false,ai:!!ai});
  saveSeedGroups();
  rebuildSpots();renderFeedMarkers();renderRequestMarkers();renderDrawerDemo();
  if(typeof renderContentTable==='function')renderContentTable();
  if(currentTab==='feed')renderFeed();
  sgBusy=false;sgStatus('');
  renderSeedGroups();
  alert('🌱 ‘'+focus.name+'’에 '+places.length+'곳 기준으로 만들었어요.\n'+
        '스팟 '+counts.spot+' · 사진 '+counts.feed+' · Request '+counts.req+' · 타임딜 '+counts.deal+
        (ai?'\n(문구: AI 생성)':'\n(문구: 기본 템플릿 — AI '+(aiWhy||'응답을 못 받았어요')+')'));
}
function sgGroupSetHidden(gid,v){
  var g=seedGroups.filter(function(x){return x.id===gid;})[0];if(!g)return;
  g.hidden=!!v;saveSeedGroups();
  feedItems.forEach(function(f){if(f.sgroup===gid){f.hidden=!!v;if(hasLive())feedUpdate(f,{hidden:!!v});}});
  demoSpots.forEach(function(s){if(s.sgroup===gid)s.hidden=!!v;});
  adminSpots.forEach(function(s){if(s.sgroup===gid)s.hidden=!!v;});
  if(!hasLive())saveFeed();
  rebuildSpots();renderFeedMarkers();if(currentTab==='feed')renderFeed();
  if(typeof renderContentTable==='function')renderContentTable();
  renderSeedGroups();
}
function sgGroupDelete(gid){
  var g=seedGroups.filter(function(x){return x.id===gid;})[0];if(!g)return;
  if(!confirm('‘'+g.name+'’ 그룹(스팟 '+g.counts.spot+' · 사진 '+g.counts.feed+
              ' · Request '+g.counts.req+' · 타임딜 '+g.counts.deal+')을 지울까요? 되돌릴 수 없어요.'))return;
  var pre='sg_'+gid+'_';
  if(hasLive()){
    ['liveFeed','liveSpots','liveRequests'].forEach(function(col){
      fbDb.collection(col).where('sgroup','==',gid).get()
        .then(function(sn){sn.forEach(function(d){d.ref.delete();});})
        .catch(function(e){console.warn('sg delete',col,e);});
    });
  }
  feedItems=feedItems.filter(function(f){return f.sgroup!==gid&&f.id.indexOf(pre)!==0;});
  demoSpots=demoSpots.filter(function(s){return s.sgroup!==gid&&s.id.indexOf(pre)!==0;});
  adminSpots=adminSpots.filter(function(s){return s.sgroup!==gid&&s.id.indexOf(pre)!==0;});
  fieldRequests=fieldRequests.filter(function(r){return r.sgroup!==gid&&r.id.indexOf(pre)!==0;});
  timeDeals=timeDeals.filter(function(d){return d.sgroup!==gid&&d.id.indexOf(pre)!==0;});
  seedGroups=seedGroups.filter(function(x){return x.id!==gid;});
  saveFeed();saveLocalSpots();saveRequests();saveDeals();saveSeedGroups();
  rebuildSpots();renderFeedMarkers();renderRequestMarkers();renderDealMarkers();renderDrawerDemo();
  if(typeof renderContentTable==='function')renderContentTable();
  if(currentTab==='feed')renderFeed();
  renderSeedGroups();
}
function renderSeedGroups(){
  var box=document.getElementById('sg-groups');if(!box)return;
  box.innerHTML='';
  if(!seedGroups.length){
    var e=document.createElement('p');e.className='section-hint';
    e.textContent='아직 만든 그룹이 없어요. 위에서 지역을 확인하고 생성해 보세요.';
    box.appendChild(e);return;
  }
  seedGroups.forEach(function(g){
    var row=document.createElement('div');row.className='sg-row'+(g.hidden?' off':'');
    var c=g.counts||{};
    row.innerHTML='<span class="sg-mid"><b></b><i></i></span><span class="sg-acts"></span>';
    row.querySelector('b').textContent=g.name+' · '+g.places+'곳';
    row.querySelector('i').textContent=
      '스팟 '+(c.spot||0)+' · 사진 '+(c.feed||0)+' · Req '+(c.req||0)+' · 딜 '+(c.deal||0)+
      ' · 반경 '+g.radius+'m · '+timeAgo(g.ts)+(g.ai?' · AI':' · 템플릿');
    var acts=row.querySelector('.sg-acts');
    function btn(label,cls,fn){var b=document.createElement('button');b.type='button';
      b.className='action-btn small'+(cls?' '+cls:'');b.textContent=label;b.addEventListener('click',fn);acts.appendChild(b);return b;}
    btn('지도로','',function(){
      if(typeof goMapCam==='function')goMapCam(g.lat,g.lng,16);
      else if(map)map.setCenter({lat:g.lat,lng:g.lng});
    });
    btn(g.hidden?'표시':'숨김','',function(){sgGroupSetHidden(g.id,!g.hidden);});
    btn('삭제','danger',function(){sgGroupDelete(g.id);});
    box.appendChild(row);
  });
}
function initSeedGen(){
  loadSeedGroups();
  var gen=document.getElementById('sg-gen');if(!gen)return;
  gen.addEventListener('click',sgGenerate);
  var rf=document.getElementById('sg-refresh');if(rf)rf.addEventListener('click',sgSyncFocus);
  sgSyncFocus();renderSeedGroups();
}

/* ========== [M09] 기능 맵 (기능 관리 페이지) ========== */
var FEATURES=[
 {id:'mode',icon:'🗺️',name:'베이직/트렌드 모드',st:'live',grp:'코어',desc:'같은 지도·같은 컨텐츠를 "구획 단위"만 바꿔 보는 두 렌즈 — 베이직=행정동, 트렌드=관리자 선정 존. 위치명·렌즈·피드 필터·동네 채팅방이 모드에 따라 동↔존으로 함께 전환되고, 존 밖에서는 동 이름으로 폴백(모드 간 연결). 트렌드 전환 시 근접 존 N개 자동 뷰.',rel:['lens','zone','feed','social','sum']},
 {id:'lens',icon:'🔍',name:'포커스 렌즈',st:'live',grp:'코어',desc:'보는 구역(동/존)만 선명하게, 주변은 안개 — 두 모드가 하나의 렌즈 엔진 공유. 축척 자동 발동 + 지역 선택 시 핀 고정·맵 조정. 렌즈 밖 스팟은 옅게, 동네소식은 해당 동으로 슬라이드.',rel:['mode','spot','news'],prev:'lens'},
 {id:'zone',icon:'⬡',name:'트렌드 존',st:'live',grp:'코어',desc:'헥사곤 묶음으로 관리자가 지정하는 핫플 구역. 사진·설명 카드(🖼️ 편집), 썸네일=태깅 사진 중 최다 하트, 하트 합산=존 태깅+존에 속한 동 컨텐츠.',rel:['mode','feed','like'],prev:'trendzone'},
 {id:'sum',icon:'🗞️',name:'요약 공간',st:'live',grp:'코어',desc:'상단 카드 지면 — 베이직=동네소식 카드(3버전·컴팩트 접기), 트렌드=존 리스트(사이드바와 동일 카드). 탭별 이미지 분리.',rel:['map','news','zone']},
 {id:'ai',icon:'🤖',name:'AI Agent',st:'plan',grp:'코어',desc:'우하단 에이전트. 동네 질문 응답과 현장 Request 알림 채널.',rel:['req']},
 {id:'spot',icon:'💬',name:'스팟 메시지',st:'live',grp:'컨텐츠',desc:'지도 위 말풍선 일상 공유 — 관리자+유저 모두 작성, 유저 스팟은 계정 간 실시간 공유(liveSpots). 본인이 올린 스팟은 데모도 길게 눌러(터치) 이동·수정·삭제 가능. 드로어=현재 지역 워드 클라우드. 렌즈 포커스 밖은 옅게.',rel:['lens','feed'],prev:'spot'},
 {id:'cam',icon:'📸',name:'라이브 카메라',st:'live',grp:'컨텐츠',desc:'찍으면 바로 피드 업로드(실시간 공유) — 현 위치의 동+트렌드존 자동 태깅. 관리자는 사이드바에서 업로드/링크로도 추가.',rel:['feed','like']},
 {id:'like',icon:'❤️',name:'좋아요',st:'live',grp:'컨텐츠',desc:'피드 더블탭 하트 — 계정당 1개, 실시간 합산. 존 하트 합산·베스트 썸네일의 원천 데이터.',rel:['feed','zone']},
 {id:'req',icon:'📍',name:'현장 Request',st:'live',grp:'컨텐츠',desc:'원격 질문 등록(지도 위 컴포저·10분 타임아웃) → 타겟 지역(1.5km/같은 동) 사용자에게 AI Agent 수신 카드(💬 Chat 참여·📷 사진 제출, 요청자 제외) → 답하면 🪙 코인 적립. 요청자는 도착 알림+드로어 내 Request에서 답변 확인.',rel:['map','ai']},
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
/* 🧩 기능 보기의 ⚙ 설정 버튼이 가는 곳 (관리자에게만 붙는다). */
var SETTING_PANEL_OF={'spot':'s-spot','region':'s-region','lens':'s-lens','trendzone':'s-zone','spot-view':'c-spot'};
function jumpToSetting(prevKey){
  var fp=document.getElementById('feature-page');if(fp)fp.style.display='none';
  var panel=SETTING_PANEL_OF[prevKey]||'s-spot';
  if(IS_ADMIN_PAGE&&typeof openAdminMenu==='function'){openAdminMenu(panel);return;} // 콘솔 안 — 그 자리에서 팝업
  /* v1.77: 서비스 페이지에는 설정이 없다(콘솔은 별도 페이지). 콘솔을 열되 어느 블록을
     보려던 건지 같이 넘긴다 — 안 넘기면 사용자가 목록에서 다시 찾아야 한다. */
  window.open('admin.html?adm='+encodeURIComponent(panel),'_blank','noopener');
}
function initFeaturePage(){
  var cl=document.getElementById('feature-close');
  if(cl)cl.addEventListener('click',function(){document.getElementById('feature-page').style.display='none';});
  var pg=document.getElementById('feature-page');
  if(pg)pg.addEventListener('click',function(e){if(e.target===pg)pg.style.display='none';});
}

/* ========== [M09] 웹앱 설치 유도 (모바일 브라우저): Android=네이티브 프롬프트 · iOS=홈 화면 추가 안내 ========== */
function initInstallPrompt(){
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone)return; // 이미 앱으로 실행 중
  // 임베드(시연 무대)에서는 안 띄운다 (v2.18) — iframe 에선 원래 안 오지만, 직접 연 임베드에서도 무대 위 배너는 앱이 아닌 것이다.
  if(!window.matchMedia('(max-width:768px)').matches||IS_ADMIN_PAGE||IS_EMBED)return;      // 모바일 브라우저 · 서비스 페이지만
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

/* ========== [M11] 관리자 메뉴 팝업 (admin.html 전용 · v1.65) ==========
   PC 화면 기준 대형 팝업: 좌측 카테고리 내비(컨텐츠/스타일/시스템) + 우측 패널.
   패널=기존 .settings-section 블록(id·배선 그대로, data-adm 키로 표시 전환).
   스타일 그룹은 #settings-section 래퍼(적용 바 포함) 노출, 컨텐츠 그룹은 #content-section 래퍼 노출. */
function initAdminMenu(){
  if(!IS_ADMIN_PAGE)return;
  var menu=document.getElementById('admin-menu');if(!menu)return;
  var title=document.getElementById('adm-title');
  /* 미리보기→적용(드래프트)을 타는 패널만 — 적용 바·안내문은 여기서만 보인다 (v2.5).
     즉시 적용 패널(s-skin·s-view)에 그 안내가 같이 뜨면 "적용을 눌러야 하나" 로 헷갈린다. */
  var DRAFT_PANELS=['s-spot','s-region','s-zone','s-lens'];
  function show(key){
    menu.style.display='flex';
    var grp=key.charAt(0);
    var active=null;
    document.querySelectorAll('#adm-nav [data-panel]').forEach(function(b){
      var on=b.dataset.panel===key;b.classList.toggle('active',on);if(on)active=b;
    });
    var cs=document.getElementById('content-section'),ss=document.getElementById('settings-section');
    if(cs)cs.style.display=(grp==='c')?'':'none';
    if(ss)ss.style.display=(grp==='s')?'':'none';
    var draft=DRAFT_PANELS.indexOf(key)>=0;
    var bar=document.getElementById('settings-apply-bar');if(bar)bar.style.display=draft?'':'none';
    var hint=document.getElementById('sab-hint');if(hint)hint.style.display=draft?'':'none';
    document.querySelectorAll('#adm-panels .adm-sys').forEach(function(p){p.style.display=(p.dataset.adm===key)?'block':'none';}); // 기본 CSS가 none이라 명시적 block
    document.querySelectorAll('#adm-panels .settings-section[data-adm]').forEach(function(p){p.classList.toggle('adm-active',p.dataset.adm===key);});
    // 팝업 제목 = 내비의 그룹 캡션 (v2.5) — 그룹이 다섯이라 키 첫 글자로는 못 가른다.
    var cap=null,el=active;
    while(el&&(el=el.previousElementSibling))if(el.classList&&el.classList.contains('adm-nav-cap')){cap=el.textContent;break;}
    if(title)title.textContent=(cap||'관리자 메뉴').replace(/\s+—.*$/,''); // 캡션의 부연("— 즉시 적용")은 제목에서 뺀다
    var pn=document.getElementById('adm-panels');if(pn)pn.scrollTop=0;
  }
  window.openAdminMenu=show;
  document.querySelectorAll('[data-adm-open]').forEach(function(b){b.addEventListener('click',function(){show(this.dataset.admOpen);});});
  document.querySelectorAll('#adm-nav [data-panel]').forEach(function(b){b.addEventListener('click',function(){show(this.dataset.panel);});});
  var close=document.getElementById('adm-close');if(close)close.addEventListener('click',function(){menu.style.display='none';});
  menu.addEventListener('click',function(e){if(e.target===menu)menu.style.display='none';});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&menu.style.display!=='none')menu.style.display='none';});
  var alb=document.getElementById('adm-allowlist');if(alb)alb.addEventListener('click',openAllowlistManager); // 시스템 › 계정·권한
}
/* [M15] 디자인 스킨 셀렉트. 드래프트(적용 버튼)를 태우지 않고 **고르는 즉시 바뀐다** —
   보면서 고르는 설정이라 미리보기와 적용을 나눌 이유가 없다. 저장만 markCloudDirty 로
   다른 설정과 같은 흐름을 탄다. */
function initSkinControl(){
  var sel=document.getElementById('app-skin');if(!sel)return;
  sel.value=appSkin;
  sel.addEventListener('change',function(){setAppSkin(this.value);markCloudDirty();});
}
/* v1.77: 서비스 페이지의 ⚙ 설정이 admin.html?adm=<패널> 로 넘겨준 블록을 연다.
   값은 URL 에서 온다 — 셀렉터에 끼워 넣지 않고 실제 내비 버튼들과 대조해서 통과시킨다. */
function openAdmPanelFromUrl(){
  if(!IS_ADMIN_PAGE||typeof openAdminMenu!=='function')return;
  var want='';try{want=new URLSearchParams(location.search).get('adm')||'';}catch(e){return;}
  if(!want)return;
  var ok=false;
  document.querySelectorAll('#adm-nav [data-panel]').forEach(function(b){if(b.dataset.panel===want)ok=true;});
  if(ok)openAdminMenu(want);
}

/* ========== [M16] scenario-bridge 임베드 · 시나리오 재생 ==========
   콘솔(Persona VC)이 이 앱을 iframe 으로 띄우고 시나리오를 재생시키기 위한 모듈.
   앱을 조작하는 것은 전부 기존 동결 앵커(switchTab·switchMode·openContentPop…)이고,
   이 모듈은 그 호출 순서와 페르소나 대사만 들고 있다 — 화면 로직을 새로 만들지 않는다.

   임베드(?embed=1)는 Firebase 를 붙이지 않는다. 시연은 매번 같은 화면이어야 하는데
   실데이터는 그날 비어 있을 수도 달라질 수도 있고, 로그인·allowlist·규칙이 전부
   시연 중 실패 지점이 되기 때문이다. 대신 M13 시드를 무음으로 깔아 화면을 채운다. */

var IS_EMBED=(function(){try{return /[?&]embed=1(?:&|$)/.test(location.search);}catch(e){return false;}})();

/* **빈 무대 임베드** (`?embed=1&clean=1`, v1.96.0 · 콘솔 D82).

   기본 임베드는 M13 시드를 깔아 화면을 채운다 — 유저 시나리오는 "사람이 실제 앱을 쓴다"
   가 전제라 동네에 남의 글이 있어야 성립하기 때문이다(콘솔 D25).

   기능 데모는 정반대다. 제품의 **어떤 기능**을 보여주는 연출이라 화면에 있어야 할 것은
   그 데모가 선언한 것뿐이고, 사이트 데이터셋이 깔려 있으면 "빈 화면에서 시작한다" 는
   데모가 아예 성립하지 않는다. 게다가 시나리오가 아무것도 안 깔았을 때 `nhPick` 이
   전역 시드로 폴백하므로, **깔지도 않은 남의 글이 조용히 열린다**.

   그래서 이 모드는 시드를 아예 안 깐다 — 화면은 비어서 시작하고, 뜨는 것은 시나리오가
   깐 것(`nhSeedScenario`)과 재생 중 만든 것뿐이다. */
var IS_CLEAN_EMBED=(function(){try{return IS_EMBED&&/[?&]clean=1(?:&|$)/.test(location.search);}catch(e){return false;}})();

// 명령을 받아들일 부모 오리진. 여기 없는 곳에서 온 메시지는 무시한다.
var EMBED_ORIGINS=[
  'https://persona-vc--persona-lab-503406.asia-east1.hosted.app',
  'http://localhost:3010','http://localhost:3011',
  'https://gihoon-mx.github.io' // 이 저장소 자체(직접 테스트용)
];

/* 시나리오 — 서베이에서 페르소나가 말한 상황을 Now Here 위에서 재현한다.
   concern:true 인 스텝은 "우려 상황" 으로 콘솔에서 따로 표시된다. */
var NH_SCENARIOS=[
  {
    id:'first-visit', name:'처음 온 동네 둘러보기',
    persona:'낯선 동네에 막 도착한 사람', area:'seongsu',
    // 이 사람이 볼 것은 "낯선 동네의 지금" 이다 — 그 장면을 직접 깐다 (v1.72).
    seed:{
      spots:[{t:'30분 때울 데 찾으면 여기 3층 조용해요',emoji:'☕'},
             {t:'서울숲 쪽 출구가 덜 붐벼요',emoji:'🌳'}],
      feeds:[{theme:'cafe',label:'처음 온 사람용',desc:'성수 처음이면 연무장길부터. 30분이면 한 바퀴 돌아요',name:'성수토박이'},
             {theme:'park',label:'지금 서울숲',desc:'지금 서울숲 잔디밭 자리 넉넉해요',name:'숲세권주민'}]
    },
    steps:[
      {a:'wait',ms:900,say:'약속보다 30분 일찍 도착했다. 여기 뭐가 있는지 하나도 모르겠는데.'},
      {a:'area',v:'seongsu',ms:1800,say:'성수에서 보기로 했는데, 와 본 적이 없다.'},
      {a:'pop',v:'spot',i:0,ms:2600,say:'누가 남긴 한마디가 보인다. 리뷰 앱보다 이게 더 지금 같다.'},
      {a:'popclose',ms:600},
      {a:'ai',ms:4200,say:'물어보면 알려주나? 이 동네 뭐가 좋은지 아직 감이 안 온다.',key:true},
      {a:'scope',v:'local',ms:2400,say:'이 동네 것만 모아서 보니 훨씬 정리된다.'},
      {a:'like',i:0,ms:2200,say:'여기 가봐야겠다. 일단 저장해 두는 느낌으로 하트.',key:true},
      {a:'mode',v:'trend',ms:2400,say:'트렌드로 바꾸니 사람들이 몰리는 구역이 묶여서 보인다.'}
    ]
  },
  {
    id:'field-request', name:'지금 거기 어떤지 물어보기',
    persona:'가기 전에 확인하고 싶은 사람', area:'jamsil',
    // 답변 대기 중인 내 Request 가 화면에 있어야 이 시나리오가 성립한다.
    // 전역 시드로는 못 만든다(10분 타임아웃) — 회차마다 새로 깐다.
    seed:{reqs:[{q:'석촌호수 벚꽃 지금 사람 많나요?',answerIn:9000,
                 answer:'동호 쪽은 아직 걸을 만해요. 서호는 붐빕니다'}],
          feeds:[{theme:'park',label:'20분 전 석촌호수',desc:'방금 서호 쪽 지나왔는데 줄이 꽤 길어요',name:'호수러너'}]},
    steps:[
      {a:'wait',ms:900,say:'지금 줄이 긴지 아닌지가 제일 궁금하다. 전화하기는 좀 그렇고.'},
      {a:'area',v:'jamsil',ms:1800,say:'석촌호수 벚꽃 보러 가려는데 사람이 얼마나 많을까.'},
      {a:'request',ms:2800,say:'그 자리에 있는 사람한테 물어볼 수 있다니. 검색으로는 안 되는 거다.',key:true},
      {a:'popclose',ms:600},
      {a:'drawer',ms:3000,say:'올려두고 기다리는 중. 답이 오면 여기서 보면 되는구나.'},
      {a:'wait',ms:4200,say:'…'},
      {a:'answer',v:'동호 쪽은 아직 걸을 만해요. 서호는 붐빕니다',ms:4000,
       say:'답이 왔다. 동호 쪽으로 가면 되겠다 — 이건 지도만 봐서는 절대 모르는 정보다.',key:true}
    ]
  },
  {
    id:'privacy-worry', name:'내 위치가 얼마나 드러나나',
    persona:'위치 공개가 꺼려지는 사람', area:'gangnam',
    concern:true,
    // 이 시나리오는 "동 이름이 같이 찍힌 남의 글" 이 화면에 있어야 성립한다 (v1.72).
    seed:{spots:[{t:'퇴근길에 여기 자주 옵니다',emoji:'🍜'},
                 {t:'주말마다 이 공원에서 산책해요',emoji:'🐕'}]},
    steps:[
      {a:'wait',ms:900,say:'써보기 전에 이것부터 확인하고 싶다. 내가 어디 있는지 어디까지 남지?'},
      {a:'area',v:'gangnam',ms:1700},
      {a:'pop',v:'spot',i:1,ms:3000,say:'남의 글에도 동 이름이 같이 찍혀 있다. 내 것도 그렇게 되나?'},
      {a:'popclose',ms:600},
      {a:'write',v:'커피 맛있는 집 찾는 중',ms:5200,
       say:'직접 하나 써 보자. 어디까지 남는지는 써 봐야 안다.',key:true},
      // i:-1 = 방금 쓴 글. i:0 이면 남의 글이 열려서 "방금 쓴 글" 이 거짓말이 된다.
      {a:'pop',v:'spot',i:-1,ms:3400,
       say:'방금 쓴 글에 동 이름이 그대로 붙었다. 이게 내 계정이랑 묶이면 사는 곳이 드러나는 거 아닌가.',
       concern:true,key:true},
      {a:'popclose',ms:600},
      {a:'drawer',ms:3000,say:'지운다는 버튼은 보이는데, 이미 본 사람한테서도 지워지는 건지는 모르겠다.',concern:true}
    ]
  },
  {
    id:'empty-neighborhood', name:'우리 동네엔 아무것도 없다',
    persona:'중심가 밖에 사는 사람', area:'dobong',
    concern:true,
    steps:[
      {a:'wait',ms:900,say:'강남은 꽉 차 있던데, 우리 동네도 그런지 보자.'},
      {a:'area',v:'gangnam',ms:2400,say:'강남은 이렇게 빽빽하다. 볼 게 계속 나온다.'},
      {a:'area',v:'dobong',ms:3200,say:'우리 동네로 오니 화면이 텅 비었다. 결국 사람 많은 데만 굴러가는 서비스인가.',concern:true,key:true},
      {a:'pop',v:'spot',i:0,ms:3000,say:'하나 있는 글이 "여기 글 남기는 사람 저뿐인가요" 다. 딱 내 얘기다.',concern:true},
      {a:'popclose',ms:600},
      {a:'scope',v:'local',ms:2800,say:'현재 동네로 거르니 남는 게 손에 꼽는다.',concern:true},
      {a:'chat',v:'local',ms:3400,say:'채팅방이라도 있나 했는데 여기도 조용하다.',concern:true,key:true},
      {a:'wait',ms:2600,say:'내가 첫 글을 써야 하는 건 부담스럽다. 아무도 안 보는 데다 쓰는 기분이라.',concern:true}
    ]
  }
];;

function nhScenario(id){for(var i=0;i<NH_SCENARIOS.length;i++)if(NH_SCENARIOS[i].id===id)return NH_SCENARIOS[i];return null;}
/* 표본 시나리오 목록. `steps` 는 **개수와 정의를 같이** 준다 (v1.74) —
   콘솔이 재생 전에 타임라인을 다 보여주고(그전에는 번호만 있는 자리였다), 특정 단계부터
   다시 보기(앞 단계 빨리감기)를 하려면 콘솔이 정의를 알아야 한다. 개수만 주던 시절의
   콘솔과도 호환되도록 `steps` 는 숫자 그대로 두고 `plan` 을 따로 싣는다. */
function nhScenarioList(){return NH_SCENARIOS.map(function(s){
  return {id:s.id,name:s.name,persona:s.persona,concern:!!s.concern,steps:s.steps.length,
    plan:s.steps.map(function(st){
      return {a:st.a,v:st.v||'',i:st.i|0,say:st.say||'',
        concern:!!st.concern,key:!!st.key,ms:st.ms|0};}),
    seed:s.seed||null,
    area:s.area||'',areaName:(s.area&&SEED_AREAS[s.area]?SEED_AREAS[s.area].name:'')};});}

/* ⚠️교차 M04/M05/M06/M07/M10 — 임베드는 상태를 남기지도 물려받지도 않는다.
   시연은 매번 같은 화면에서 시작해야 한다(D25). v1.71 에서 시나리오가 **글을 쓰기**
   시작하면서 두 구멍이 생겼다:
   (a) 쓰기 경로가 localStorage 에 저장해서 회차마다 콘텐츠가 쌓인다.
   (b) 임베드와 실제 앱이 **같은 오리진**(github.io)이라, 실제 앱을 써 본 사람의
       localStorage 가 임베드로 그대로 새어 들어온다.
   저장 함수가 다섯 군데에 흩어져 있어 각각 막는 대신 **저장 자체를 무음으로** 만들고,
   부팅 때 담겨 있던 콘텐츠를 비운 뒤 시드를 깐다. 임베드에서만 걸린다. */
function nhEmbedIsolate(){
  try{
    var set=localStorage.setItem.bind(localStorage);
    localStorage.setItem=function(k,v){
      // 이 앱의 상태 키만 막는다. 예외 하나(v2.3): 사람이 옮긴 무대 자리(NH_POS_KEY)는
      // "사람이 정한 연출" 이라 다음 재생에 남아야 뜻이 있다.
      if(String(k).indexOf('nowhere_')===0&&k!==NH_POS_KEY)return;
      return set(k,v);
    };
  }catch(e){}
  nhWipeWorld();
  try{
    if(typeof feedLikes!=='undefined')Object.keys(feedLikes).forEach(function(k){delete feedLikes[k];});
    if(typeof socMsgs!=='undefined')Object.keys(socMsgs).forEach(function(k){delete socMsgs[k];});
  }catch(e){}
}

/* 화면의 컨텐츠를 통째로 비운다 (v2.12, 콘솔 D95).
   **빈 무대 임베드의 단일 기준**이다 — 기능 데모에 뜨는 것은 컨텐츠 탭이 깐 것과 재생 중
   만든 것뿐이어야 하는데, 그 약속이 여태 "부팅에서 한 번 비운다" 였다. 부팅 뒤에도 새는
   길이 있었다: 지도 부팅의 geojson 콜백이 `loadLocalSpotsInto` 로 저장된 글을 다시 깔고
   (임베드는 실서비스와 같은 오리진이다), 딜은 걷는 사람이 아무도 없어 회차를 넘어 남았다.
   각 loader 를 막는 것과 **함께** 회차 시작마다 여기서 한 번 더 비운다 — 어느 경로로
   새어 들어왔든 재생은 늘 빈 화면에서 시작한다. */
function nhWipeWorld(){
  try{
    if(typeof feedItems!=='undefined')feedItems.length=0;
    if(typeof demoSpots!=='undefined')demoSpots.length=0;
    // 관리자 스팟도 비운다 — 클라우드 스냅샷이 붙은 채로 임베드가 열릴 수 있다.
    if(typeof adminSpots!=='undefined')adminSpots.length=0;
    if(typeof fieldRequests!=='undefined')fieldRequests.length=0;
    if(typeof newsItems!=='undefined')newsItems.length=0;
    if(typeof timeDeals!=='undefined')timeDeals.length=0;
  }catch(e){}
}

/* 지금 시나리오가 서 있는 지역 (area 스텝이 정한다). 빈 값이면 전 지역에서 고른다. */
var nhAreaKey='';
/* ── 무대 콘텐츠의 **사람이 옮긴 자리** (v2.3) ──
   무대는 nhSpread 로 결정적으로 깔리지만, 사람이 임베드에서 핀을 끌어 옮기면 그 자리가
   여기 남아 **다음 재생에도 그 자리에 깔린다** — "매번 같은 화면" 이라는 무대의 약속을
   사람이 고친 자리까지 포함해서 지킨다.
   키는 시나리오 id + 종류 + 항목 번호(id 접미사 — 회차가 달라도 같은 항목은 같은 값)다.
   임베드의 localStorage 차단(nhEmbedIsolate)에서 이 키만 예외다 — 나머지 상태는 회차마다
   버리는 것이 맞지만, 이 값은 "사람이 정한 연출" 이라 남아야 뜻이 있다. */
var NH_POS_KEY='nowhere_stagepos';
var nhScenarioKey=''; // 지금 재생 중인 시나리오 id — nhRun 이 채운다
/* **콘솔이 들고 있는 자리** (v2.20). localStorage 는 이 기기의 것이라 다른 PC 에서는 없는
   값이었다 — 같은 데모인데 자리가 PC 마다 달랐다. 이제 콘솔(데모 문서)이 저장소고,
   여기는 이번 회차에 받은 사본이다. 받은 값이 **먼저다**: 이 기기의 옛 값이 팀이 정한
   자리를 덮으면 안 된다. 옮기면 nh:pos 로 콘솔에 알려 다음 회차부터 모두가 그 자리를 본다. */
var nhPosRecv={};
function nhPosAll(){try{var o=JSON.parse(localStorage.getItem(NH_POS_KEY)||'{}');return (o&&typeof o==='object')?o:{};}catch(e){return {};}}
/* 무대 중심에서 5km 넘게 벗어난 저장값은 무시한다 — 데모의 동네를 옮기면 옛 자리는
   다른 동네에 남은 값이라, 그대로 쓰면 화면 밖에 깔린다. */
function nhPosGet(kind,i,c){
  if(!nhScenarioKey)return null;
  var k=kind+'_'+i;
  var p=(nhPosRecv&&nhPosRecv[k])||null; // 콘솔이 준 값이 먼저 (v2.20)
  if(!p){var o=nhPosAll()[nhScenarioKey];p=o&&o[k];}
  if(!p||!isFinite(p.lat)||!isFinite(p.lng))return null;
  if(c&&typeof haversineM==='function'&&haversineM(c.lat,c.lng,p.lat,p.lng)>5000)return null;
  return p;
}
function nhPosSave(kind,i,lat,lng){
  if(!nhScenarioKey)return;
  var k=kind+'_'+i;
  var all=nhPosAll();
  (all[nhScenarioKey]=all[nhScenarioKey]||{})[k]={lat:lat,lng:lng};
  try{localStorage.setItem(NH_POS_KEY,JSON.stringify(all));}catch(e){}
  nhPosRecv[k]={lat:lat,lng:lng}; // 이번 회차에도 곧바로 반영
  /* 콘솔에 알린다 (v2.20) — 저장은 그쪽이 한다(데모 문서). 부모가 없으면(임베드가 아니면)
     조용히 지나간다: 실서비스에서 핀을 옮기는 것은 무대와 상관없는 일이다. */
  if(window.parent&&window.parent!==window){
    try{window.parent.postMessage({source:'now-here',type:'nh:pos',
      scenario:nhScenarioKey,key:k,lat:lat,lng:lng},'*');}catch(e){}
  }
}
/* 드래그된 것이 무대 항목이면 그 자리를 남긴다 — id 접미사가 곧 항목 번호다. */
/** write 로 쓴 글의 id → 그 회차의 write 순번 (v2.12). 그 글은 id 규칙이 달라 표가 필요하다. */
var nhWriteIds={};
/** request 액션으로 올린 Request 의 id → 그 회차의 순번 (v2.18) — write 와 같은 약속이다. */
var nhReqIds={};
function nhPosNote(id,lat,lng){
  var m=/^(spn|fdn|rqn|dln)_\d+_(\d+)$/.exec(String(id||''));
  if(m){nhPosSave({spn:'spot',fdn:'feed',rqn:'req',dln:'deal'}[m[1]],Number(m[2]),lat,lng);return;}
  // 사용자가 재생 중 쓴 글(write)도 옮긴 자리를 기억한다 — 무대 항목과 같은 약속이다.
  if(nhWriteIds[id]!=null){nhPosSave('write',nhWriteIds[id],lat,lng);return;}
  if(nhReqIds[id]!=null)nhPosSave('rqw',nhReqIds[id],lat,lng);
}
/* 이번 회차가 만든 것들 — 시나리오 seed 와 재생 중 쓴 글, 그리고 전역 카드에 남긴
   좋아요(v1.94 — 회차를 넘어 살아남으면 두 번째 재생에서 하트가 이미 차 있다).
   nhReset 이 전부 걷어낸다. */
var nhTempIds={spot:[],feed:[],req:[],chat:[],like:[],deal:[],page:[],zone:[]};
/* 무대에서 받은 코인은 회차가 끝나면 돌려놓는다 (v2.19) — 잔액은 이 기기에 남는 값이라
   재생할 때마다 500 씩 쌓여서, 두 번째 회차의 프로필이 첫 회차와 다른 숫자로 시작했다.
   시연은 몇 번을 돌려도 같은 곳에서 시작해야 한다 (nhReset 의 규칙 그대로). */
/* 회차가 고른 존 카드 모양 (v2.26) — 코인·소리와 같은 규칙이다: **되돌릴 값을 적어 두고**
   회차가 끝나면(nhReset) 원래대로 돌린다. 시연이 이 기기의 관리자 설정을 영구히 바꾸면 안 된다.
   저장(localStorage)은 안 건드린다 — 화면에 걸리는 값만 바꾼다. */
var nhZoneCard0=null;
function nhZoneCardSet(v){
  var want=String(v||'');
  if(!want||typeof ZONE_CARD_STYLES==='undefined'||ZONE_CARD_STYLES.indexOf(want)<0)return;
  if(nhZoneCard0===null)nhZoneCard0=zoneCardStyle;
  if(zoneCardStyle===want)return;
  zoneCardStyle=want;
  if(typeof renderSummaryZones==='function')renderSummaryZones();
  if(typeof renderDrawerDemo==='function')renderDrawerDemo();
}
function nhZoneCardRestore(){
  if(nhZoneCard0===null)return;
  var back=nhZoneCard0;nhZoneCard0=null;
  if(zoneCardStyle===back)return;
  zoneCardStyle=back;
  if(typeof renderSummaryZones==='function')renderSummaryZones();
  if(typeof renderDrawerDemo==='function')renderDrawerDemo();
}
var nhCoins0=null;
function nhCoinsMark(){if(typeof myCoins!=='undefined')nhCoins0=myCoins;}
function nhCoinsRestore(){
  if(nhCoins0==null||typeof myCoins==='undefined'||myCoins===nhCoins0)return;
  myCoins=nhCoins0;
  try{localStorage.setItem('nowhere_coins',String(myCoins));}catch(e){}
  if(typeof syncCoinUI==='function')syncCoinUI();
}
/* 지역 이동 줌 — "동네 전체" 가 보이는 값. 시연은 매번 같은 그림이어야 하므로 고정한다. */
var NH_AREA_ZOOM=14;
/* 임베드가 처음 서는 곳 — 시나리오가 area 로 옮기기 전까지 시연 세계의 기본값이다.
   GPS 대신 이걸 쓴다(initMyLocation): 첫 화면부터 시드가 깔린 동네여야 콘텐츠가 보인다. */
var NH_HOME_AREA='gangnam';
function nhGoHome(){
  var c=SEED_AREAS[NH_HOME_AREA]||SEED_AREAS.gangnam;
  nhAreaKey=NH_HOME_AREA;
  // goMapCam 을 쓰는 이유: 임베드의 PC 지도는 display:none 이라 투영이 없고 panTo 가
  // 조용히 무시된다. 카메라는 PC → 폰 단방향 미러라 그러면 폰까지 같이 멈춘다.
  if(typeof goMapCam==='function'){
    goMapCam(map,c.lat,c.lng,NH_AREA_ZOOM);
    if(typeof phoneMap!=='undefined'&&phoneMap)goMapCam(phoneMap,c.lat,c.lng,NH_AREA_ZOOM);
  }
}

/* 시드된 콘텐츠에서 i 번째를 고른다 — 시나리오가 좌표를 직접 들지 않게 한다.
   area 스텝으로 지역이 정해져 있으면 그 지역 반경 안의 것만 고른다: 방학동으로 옮겨 놓고
   강남 스팟을 열면 지도는 방학동인데 팝업만 강남이라 시연이 거짓말을 한다.
   그 지역에 아무것도 없으면 null 을 돌려준다 — 없는 게 사실이면 없는 채로 보여준다. */
/* 종류별 저장소. **폴백을 두지 않는다** — 전에는 마지막 가지가 fieldRequests 라
   모르는 종류가 조용히 Request 를 집었다 (v2.2). 모르는 종류는 빈 배열이다. */
function nhStore(kind){
  if(kind==='spot')return (typeof demoSpots!=='undefined')?demoSpots:[];
  if(kind==='feed')return (typeof feedItems!=='undefined')?feedItems:[];
  if(kind==='req')return (typeof fieldRequests!=='undefined')?fieldRequests:[];
  if(kind==='deal')return (typeof timeDeals!=='undefined')?timeDeals:[];
  if(kind==='page')return (typeof newsItems!=='undefined')?newsItems:[];
  return [];
}
/* 이번 회차에 **이 시나리오가 만든 것** — 깔아둔 seed + 재생 중 직접 쓴 글. 생성 순서 그대로. */
function nhOwn(kind){
  var ids=(nhTempIds&&nhTempIds[kind])||[];
  if(!ids.length)return [];
  var arr=nhStore(kind),out=[],i,j;
  for(i=0;i<ids.length;i++)for(j=0;j<arr.length;j++)
    if(arr[j]&&arr[j].id===ids[i]){out.push(arr[j]);break;}
  return out;
}
/* i 는 시나리오가 선언한 순서. **음수면 뒤에서부터** — i:-1 = 방금 만든 것(직접 쓴 글). */
function nhAt(arr,i){
  i=i|0;
  var k=(i<0)?(arr.length+i):i;
  return arr[Math.min(Math.max(k,0),arr.length-1)];
}
/* 콘텐츠 고르기 (v1.72).
   **이번 회차가 만든 것이 있으면 그 안에서만** 고른다. 전역 시드에서 앞에서부터 고르면
   지역만 같으면 시나리오가 달라도 **똑같은 콘텐츠**가 열려서, 화면상으로는 네 시나리오가
   다 같은 이야기가 된다 (v1.71까지 "매번 똑같이 보이던" 원인).
   시나리오가 아무것도 안 깔았을 때만 전역 시드로 간다 — 그때는 지역 반경으로 거른다. */
function nhPick(kind,i){
  var own=nhOwn(kind);
  if(own.length)return nhAt(own,i);
  var arr=nhStore(kind);
  if(!arr||!arr.length)return null;
  var c=nhAreaKey&&SEED_AREAS[nhAreaKey];
  if(c&&typeof haversineM==='function'){
    arr=arr.filter(function(d){
      return d&&d.lat!=null&&d.lng!=null&&haversineM(c.lat,c.lng,d.lat,d.lng)<=4000;
    });
    if(!arr.length)return null;
  }
  return nhAt(arr,i);
}

/* ── v1.71 쓰기 액션이 쓰는 보조들 ─────────────────────────
   전부 기존 앵커/전역을 거치고, 만든 것은 nhTempIds 에 적어 nhReset 이 걷어간다.
   임베드는 저장이 무음이므로(nhEmbedIsolate) 이 콘텐츠는 새로고침에도 남지 않는다. */

/* 지금 지역의 피드 하나 — 좋아요·스크롤 대상 */
function nhFeedPick(i){return nhPick('feed',i);}

/* 지금 보고 있는 지도 중심. 임베드에서 PC 지도가 숨어 있어도 좌표는 살아 있다. */
function nhCenter(){
  var m=map||phoneMap;if(!m)return null;
  var c=m.getCenter&&m.getCenter();
  if(c)return {lat:c.lat(),lng:c.lng()};
  var a=nhAreaKey&&SEED_AREAS[nhAreaKey];
  return a?{lat:a.lat,lng:a.lng}:null;
}
/* 줌만 바꾼다 — 중심은 그대로. 'in'/'out' 은 한 단계, 숫자면 그 값으로.
   v1.94: 실행 여부를 돌려준다 — nh:step 의 ok 재료 (콘솔 D72). */
function nhZoom(v){
  var m=map||phoneMap;if(!m||!m.getZoom)return false;
  var now=m.getZoom()||NH_AREA_ZOOM,z;
  if(v==='in')z=now+2;else if(v==='out')z=now-2;else z=parseInt(v,10);
  if(!isFinite(z))return false;
  // 너무 멀면 동네가 안 보이고 너무 가까우면 핀만 남는다.
  z=Math.min(18,Math.max(11,z));
  var c=nhCenter();if(!c)return false;
  goMapCam(map,c.lat,c.lng,z);
  if(phoneMap)goMapCam(phoneMap,c.lat,c.lng,z);
  return true;
}
/* i 번째 콘텐츠로 카메라를 옮겨 확대한다. **팝업은 열지 않는다** — 여는 것은 pop 의 일이고,
   focus 는 "저기를 보라" 는 연출이다. 둘을 합치면 시나리오가 둘을 따로 쓸 수 없다.
   v1.94: 두 박자다 — 먼저 지금 줌으로 거기까지 가고(팬), 잠깐 뒤 들여다본다(줌 17).
   사람의 시선 이동이 그렇다: 한 프레임에 이동과 확대가 같이 튀면 순간이동으로 보인다.
   nhAi 가 이미 같은 패턴(버튼 → ms*0.4 뒤 프리셋)을 쓴다. */
function nhFocus(kind,i,token,ms){
  var d=nhPick(kind||'spot',i);
  if(!d||d.lat==null||d.lng==null)return false;
  if(typeof switchTab==='function')switchTab('map');
  var m=map||phoneMap;
  var now=(m&&m.getZoom&&m.getZoom())||NH_AREA_ZOOM;
  goMapCam(map,d.lat,d.lng,now);
  if(phoneMap)goMapCam(phoneMap,d.lat,d.lng,now);
  setTimeout(function(){
    if(token!==nhRunToken)return;
    goMapCam(map,d.lat,d.lng,17);
    if(phoneMap)goMapCam(phoneMap,d.lat,d.lng,17);
  },Math.max(400,Math.round((ms||2500)*0.4)));
  return true;
}

/* 글쓰기: 진짜 컴포저를 열어 보여주고(addSpotContent) 잠시 뒤 커밋한다.
   바로 넣지 않는 이유 — 시연에서 "이 사람이 쓰는 중" 이 보여야 한다. */
/** write 로 쓴 글이 몇 번째인가 — 사람이 옮긴 자리를 기억하는 키다 (v2.12). */
var nhWriteN=0;
function nhWriteSpot(text,token,ms,emoji,fast){
  if(typeof addSpotContent!=='function')return false;
  // **지도 중심에 기대지 않는다.** addSpotContent 는 중심이 없으면(투영 전·지도 오류)
  // 조용히 아무것도 안 한다 — 시연에서는 "글을 썼는데 아무 일도 없음" 으로 보인다.
  // 시나리오가 서 있는 지역 좌표를 직접 준다: 회차마다 같은 자리에 남는 이점도 있다.
  var c=SEED_AREAS[nhAreaKey]||null;
  var ctr=(typeof phoneMap!=='undefined'&&phoneMap&&phoneMap.getCenter)?phoneMap.getCenter():null;
  /* 사람이 옮긴 자리를 먼저 본다 (v2.12) — 무대 콘텐츠가 v2.3 에 얻은 것과 같은 규칙이다.
     write 로 쓴 글은 여태 늘 지역 좌표 +0.0012 에 박혀서, 임베드에서 끌어 옮겨도 다음
     재생에 제자리로 돌아갔다. 키는 이 회차의 write 순번이라 여러 개를 써도 각자 기억한다. */
  var wi=nhWriteN++;
  var saved=nhPosGet('write',wi,c||(ctr?{lat:ctr.lat(),lng:ctr.lng()}:null));
  var ll=saved?new google.maps.LatLng(saved.lat,saved.lng)
    :(c?new google.maps.LatLng(c.lat+0.0012,c.lng+0.0012):ctr);
  if(!ll)return false;
  /* fast (v2.21, 콘솔 D117) — 컴포저를 아예 안 연다. 컴포저의 textEl 은 onAdd(다음
     프레임)에서 생겨서, 그 자리에서 commit() 하면 빈 글이 등록된다. 대신 컴포저의
     commit 이 하는 일(비관리자 갈래)을 그대로 한다 — 조립 결과가 같아야 한다.
     바운스도 안 붙인다: 조립 중에 깔린 것이 튀면 화면이 깜박인다. */
  if(fast){
    if(typeof demoSpots==='undefined')return false;
    var spF={id:'sp_'+Date.now(),lat:ll.lat(),lng:ll.lng(),
      text:String(text||'').slice(0,80),
      emoji:String(emoji||'').slice(0,4)||currentSpotEmoji||'💬',
      live:true,by:(typeof myUid==='function'?myUid():'anon'),
      byEmail:(typeof myEmail==='function'?myEmail():'')};
    demoSpots.push(spF);
    nhTempIds.spot.push(spF.id);
    nhWriteIds[spF.id]=wi;
    if(typeof rebuildSpots==='function')rebuildSpots();
    return true;
  }
  addTargetMap=(typeof phoneMap!=='undefined')?phoneMap:null;
  addAtLatLng=ll;
  addSpotContent();
  addAtLatLng=null; // 다음 사용자 조작이 이 좌표를 물려받지 않게 바로 비운다
  var ov=(typeof composerOverlay!=='undefined')?composerOverlay:null;
  if(!ov)return false;
  /* 이모지도 시나리오가 정한다 (v2.12) — 스팟 메시지·post 와 같은 어휘다. 여태 컴포저의
     현재 선택(currentSpotEmoji)을 그대로 써서, 앞 회차에 고른 이모지가 따라왔다.
     비우면 예전대로 컴포저 기본값이다. 픽커도 같이 맞춘다 — 화면에 보이는 것과
     등록되는 것이 달라지면 시연이 거짓말을 한다. */
  var em=String(emoji||'').slice(0,4);
  if(em){
    ov.emoji=em;
    if(typeof buildEmojiPicker==='function'&&ov.div){
      var pick=ov.div.querySelector('.sc-emoji');
      if(pick)buildEmojiPicker(pick,function(){return ov.emoji;},function(x){ov.emoji=x;});
    }
  }
  var typed=String(text||'').slice(0,80);
  var commitAt=Math.max(900,Math.round((ms||2600)*0.55));
  // 글자별 타이핑 (v1.94). 220ms 뒤 통째로 박히는 것이 화면에서 가장 큰 로봇 티였다.
  // 커밋 150ms 전까지를 타이핑 창으로 쓰고, 틱 간격은 글자 수에서 역산한다 (30~90ms).
  // 매 틱 토큰을 본다 — 새 재생이 시작되면 잘린 글자가 남지 않게 그 자리에서 멈춘다.
  var t0=220,win=Math.max(300,commitAt-t0-150);
  var per=Math.min(90,Math.max(30,Math.round(win/Math.max(1,typed.length))));
  var pos=0;
  setTimeout(function(){
    if(token!==nhRunToken||!ov.textEl)return;
    var iv=setInterval(function(){
      if(token!==nhRunToken||!ov.textEl){clearInterval(iv);return;}
      // 한 틱에 1~2자 — 등속 타자기가 아니라 사람의 몰아치는 손이다.
      pos+=(pos%3===2)?2:1;
      if(pos>=typed.length){pos=typed.length;clearInterval(iv);}
      nhSfxPlay('type'); // 글자가 박히는 소리 (v2.25) — 최소 간격이 촘촘한 자리다
      ov.textEl.value=typed.slice(0,pos);
    },per);
  },t0);
  setTimeout(function(){
    if(token!==nhRunToken)return;
    // 중단 없이 왔으면 전체 문자열로 보정하고 커밋한다 — 잘린 글이 등록되지 않게.
    if(ov.textEl)ov.textEl.value=typed;
    var before=(typeof demoSpots!=='undefined')?demoSpots.length:0;
    try{ov.commit();}catch(e){}
    if(typeof demoSpots!=='undefined')
      for(var i=before;i<demoSpots.length;i++){
        nhTempIds.spot.push(demoSpots[i].id);
        // 이 글이 몇 번째 write 인지 적어 둔다 — 끌어 옮기면 그 번호로 자리를 남긴다.
        nhWriteIds[demoSpots[i].id]=wi;
        nhBounceMark(demoSpots[i].id,2); // 내가 쓴 글도 뿅 하고 앉는다 (v2.12)
      }
  },commitAt);
  return true;
}

/* 사용자가 Request 를 **올리는 모습**을 보여준다 (v2.18, 콘솔 D114).
   여태 request 액션은 openRequestComposer(preset) 이 그 자리에서 등록해 버렸다 —
   "묻는 사람" 이 화면에 없었다. write 와 같은 문법으로 만든다: 지도를 꾹 누르는 링,
   컴포저 카드, 글자별 타이핑, 등록, 핀 등장 바운스까지가 한 장면이다. */
var nhReqN=0;
function nhRequestTyped(text,token,ms,fast){
  if(typeof ReqComposer!=='function'||typeof google==='undefined')return false;
  if(typeof switchTab==='function')switchTab('map');
  var c=SEED_AREAS[nhAreaKey]||null;
  var ctr=(typeof phoneMap!=='undefined'&&phoneMap&&phoneMap.getCenter)?phoneMap.getCenter():null;
  /* 자리는 write 와 같은 규칙이다 (v2.12) — 사람이 끌어 옮긴 자리가 있으면 거기,
     없으면 지역 좌표에서 살짝 비껴 놓는다 (write 의 +0.0012 와 다른 쪽 — 겹치지 않게). */
  var wi=nhReqN++;
  var saved=nhPosGet('rqw',wi,c||(ctr?{lat:ctr.lat(),lng:ctr.lng()}:null));
  var ll=saved?new google.maps.LatLng(saved.lat,saved.lng)
    :(c?new google.maps.LatLng(c.lat-0.0012,c.lng+0.0016):ctr);
  if(!ll)return false;
  var typed=String(text||'지금 여기 사람 많나요?').slice(0,120);
  /* fast (v2.21) — 링·컴포저·타이핑을 접고 그 자리에서 등록한다 (write 의 fast 와 같은 이유). */
  if(fast){
    var rqF=null;
    try{rqF=commitFieldRequest(ll,typed,{stage:true,quiet:true});}catch(e){}
    if(!rqF)return false;
    nhTempIds.req.push(rqF.id);
    nhReqIds[rqF.id]=wi;
    if(typeof renderRequestMarkers==='function')renderRequestMarkers();
    if(typeof renderDrawerDemo==='function')renderDrawerDemo();
    return true;
  }
  closeReqComposer();
  var ov=reqComposer=new ReqComposer(ll,(typeof phoneMap!=='undefined'&&phoneMap)||map,{press:true,auto:true,stage:true});
  /* 커밋 바닥 1200: 롱프레스 링(560)이 차오른 뒤에야 타이핑 창이 열린다 —
     write 의 900 을 그대로 쓰면 링과 타이핑이 겹쳐 둘 다 안 보인다.
     단 **이 스텝 안에서는 반드시 커밋한다** (v2.19): nhRun 은 st.ms 뒤에 다음 스텝을
     시작하므로, 바닥이 스텝보다 길면 뒤따르는 answer/pop 의 i:-1 이 아직 없는 Request 를
     집는다(빈손이거나 남의 것). 짧게 적힌 스텝은 연출이 접힐 뿐 사슬은 안 끊긴다. */
  var commitAt=Math.min(Math.max(1200,Math.round((ms||2600)*0.6)),Math.max(300,(ms||2600)-120));
  var t0=760,win=Math.max(300,commitAt-t0-150);
  var per=Math.min(90,Math.max(30,Math.round(win/Math.max(1,typed.length))));
  var pos=0;
  setTimeout(function(){
    if(token!==nhRunToken||!ov.textEl)return;
    var iv=setInterval(function(){
      if(token!==nhRunToken||!ov.textEl){clearInterval(iv);return;}
      pos+=(pos%3===2)?2:1;
      if(pos>=typed.length){pos=typed.length;clearInterval(iv);}
      nhSfxPlay('type'); // 글자가 박히는 소리 (v2.25) — 최소 간격이 촘촘한 자리다
      ov.textEl.value=typed.slice(0,pos);
    },per);
  },t0);
  setTimeout(function(){
    if(token!==nhRunToken){try{ov.close();}catch(e){}return;}
    if(ov.closed)return; // 사람이 취소했거나 이미 등록했다 (v2.19) — 타이머가 한 번 더 올리지 않는다
    var rq=null;
    try{rq=commitFieldRequest(ll,typed,{stage:true,quiet:true});}catch(e){}
    try{ov.close();}catch(e){}
    if(!rq)return;
    nhTempIds.req.push(rq.id); // 회차가 걷는다 — 두 번째 재생에 내 Request 가 이미 있으면 안 된다
    nhReqIds[rq.id]=wi;
    nhBounceMark(rq.id,1); // 렌더 **전에** 적어야 onAdd 가 본다 (v2.11)
    if(typeof renderRequestMarkers==='function')renderRequestMarkers();
    if(typeof renderDrawerDemo==='function')renderDrawerDemo();
  },commitAt);
  return true;
}

/* Request 에 **답이 쓰이는 모습**을 보여준다 (v2.12, 콘솔 D95).
   여태 `answer` 는 값을 그냥 꽂았다 — 답은 도착했는데 아무도 답하는 것을 못 봤다.
   write 와 같은 문법으로 만든다: 팝업을 열고, 답장 칸에 글자를 하나씩 넣고, 보낸다.

   누가 답하는가는 **그 Request 가 누구 것인가**가 정한다 (v2.18, 콘솔 D114):
   남의 Request(mine:false)면 사용자가 답하는 장면 — 답장 칸이 이미 있고, 보내면
   answerRequest 가 코인을 적립한다. 내 Request 면 현장 유저가 답해 주는 장면 —
   팝업이 답장 칸을 안 그리므로(그 자리는 "내가 받은 답 목록") 여기서 한 줄을 만든다. */
function nhAnswerTyped(rq,text,token,ms,fast){
  if(!rq||typeof openContentPop!=='function'||typeof answerRequest!=='function')return false;
  /* fast (v2.21) — 타이핑을 접고 답을 그 자리에서 싣는다. 팝업은 연다: 보통 재생도
     이 스텝이 끝나면 답이 실린 팝업이 열려 있는 상태라, 조립 결과가 같아야 한다. */
  if(fast){
    answerRequest(rq.id,String(text||'지금은 여유 있어요').slice(0,120));
    openContentPop('req',rq);
    if(typeof renderDrawerDemo==='function')renderDrawerDemo();
    return true;
  }
  openContentPop('req',rq);
  var body=document.getElementById('cpop-body');if(!body)return false;
  var row=body.querySelector('.cpr-reply');
  if(!row){
    row=document.createElement('div');row.className='cpr-reply';
    row.innerHTML='<input class="cpr-in" type="text" maxlength="120" readonly />'
      +'<button type="button" class="action-btn accent small cpr-send">보내기</button>';
    body.appendChild(row);
  }
  var inp=row.querySelector('.cpr-in');if(!inp)return false;
  inp.value='';
  var typed=String(text||'지금은 여유 있어요').slice(0,120);
  // 타이밍은 write 와 같은 규칙이다 — 두 곳이 다르면 같은 연출이 다른 속도로 보인다.
  // 바닥이 스텝보다 길면 안 된다 (v2.19, nhRequestTyped 와 같은 이유) — 답 전송이
  // 다음 스텝(예: 팝업 닫기) 뒤로 밀리면 닫은 팝업이 되살아난다.
  var commitAt=Math.min(Math.max(900,Math.round((ms||2600)*0.6)),Math.max(260,(ms||2600)-100));
  var t0=220,win=Math.max(300,commitAt-t0-150);
  var per=Math.min(90,Math.max(30,Math.round(win/Math.max(1,typed.length))));
  var pos=0;
  setTimeout(function(){
    if(token!==nhRunToken)return;
    var iv=setInterval(function(){
      if(token!==nhRunToken||!inp.isConnected){clearInterval(iv);return;}
      pos+=(pos%3===2)?2:1;
      if(pos>=typed.length){pos=typed.length;clearInterval(iv);}
      nhSfxPlay('type'); // 글자가 박히는 소리 (v2.25) — 최소 간격이 촘촘한 자리다
      inp.value=typed.slice(0,pos);
    },per);
  },t0);
  setTimeout(function(){
    if(token!==nhRunToken)return;
    if(inp.isConnected)inp.value=typed;
    answerRequest(rq.id,typed);
    // 답이 실린 팝업을 다시 그린다 — 방금 쓴 말이 목록에 앉는 것까지가 이 장면이다.
    if(typeof openContentPop==='function')openContentPop('req',rq);
    if(typeof renderDrawerDemo==='function')renderDrawerDemo();
  },commitAt);
  return true;
}

/* 타임딜 쿠폰을 받는 장면 (v2.20) — 시트의 '쿠폰 받기' 를 실제로 누른다.
   쿠폰이 사는 자리를 보여주고 누르는 것까지가 이 액션이다: 시트가 안 열려 있으면 열고,
   버튼에 터치 표식을 세운 뒤 한 박자 두고 받는다.
   리워드 문구는 **따로 정한다** (v=문구 · e=표시 초, '0'이면 안 띄운다) — 쿠폰은 받되
   말은 다음 장면이 하게 두는 연출이 있다. */
function nhCouponMs(e){
  var s=String(e==null?'':e).trim();
  if(!s)return 4000;              // 빈 값 = 여태처럼 4초
  var n=parseFloat(s);
  if(!isFinite(n)||n<0)return 4000;
  return Math.min(20000,Math.round(n*1000)); // 0 = 안 띄움 (claimDeal 이 판단)
}
function nhCoupon(i,say,e,token,ms,fast){
  if(typeof claimDeal!=='function')return false;
  var d=nhPick('deal',i);
  if(!d)return false;
  if(typeof dealActive==='function'&&!dealActive(d))return false; // 끝난 딜의 쿠폰은 못 받는다 (v2.2 유령 방지)
  /* fast (v2.21) — 시트도 리워드 문구도 없이 받기만 한다. 문구는 시간이 지나면 사라지는
     연출이라 조립 결과에 안 남는다 — ms 0 은 claimDeal 이 "안 띄움" 으로 읽는 값이다. */
  if(fast){
    if(typeof closeDealSheet==='function')closeDealSheet();
    claimDeal(d,{ms:0,say:say});
    return true;
  }
  if(typeof dealSheetId==='undefined'||dealSheetId!==d.id){
    if(typeof openDealSheet!=='function')return false;
    openDealSheet(d.id);
  }
  var btn=document.getElementById('ds-claim');
  if(btn&&typeof nhTouch==='function')nhTouch(btn);
  var wait=Math.min(900,Math.max(260,Math.round((ms||1500)*0.45)));
  setTimeout(function(){
    if(token!==nhRunToken)return;
    if(typeof closeDealSheet==='function')closeDealSheet();
    claimDeal(d,{ms:nhCouponMs(e),say:say});
  },wait);
  return true;
}

/* 채팅: 동네방 또는 주제방을 열고, 말이 있으면 보낸다. */
function nhChat(kind,say){
  if(typeof socTab==='undefined'||typeof socRoomsFor!=='function')return false;
  /* v1.95: 세그먼트 값은 **our/my** 다 (v1.91 Our/My Talk 분리). 그전까지 여기는
     'local'/'topic' 을 넣고 있었는데 그건 방의 종류지 세그먼트가 아니다 —
     어느 탭에도 안 맞아서 활성 탭이 하나도 없는 채로 socRoomsFor 의 else 가
     걸려 **My Talk(1:1·내 Request)** 이 열렸다. 동네방·주제방은 둘 다 Our 안에 있다.
     방 목록은 socRoomsFor 에서 그대로 받는다 — 키 규칙을 여기 베껴 두면 또 어긋난다. */
  socTab='our';
  var want=(kind==='topic')?'topic':'local';
  var rooms=socRoomsFor('our')||[];
  var r=rooms.filter(function(x){return x.type===want;})[0]||rooms[0];
  if(!r)return false; // 열 방이 없으면 시연은 실패다 (대사만 흐르게 두지 않는다)
  socRoom={key:r.key,name:r.name}; // 목록이 아니라 **방을 연다** (ACTION_GUIDE: "채팅방을 연다")
  if(typeof switchTab==='function')switchTab('social');
  if(typeof renderSocial==='function')renderSocial();
  if(say&&typeof socRoom!=='undefined'&&socRoom&&typeof socMsgs!=='undefined'){
    var k=socRoom.key;(socMsgs[k]=socMsgs[k]||[]).push({name:'나',t:String(say).slice(0,120),ts:Date.now()});
    nhTempIds.chat.push(k);
    if(typeof renderSocial==='function')renderSocial();
  }
  return true;
}

/* AI 에이전트: 실제 버튼을 눌러 패널을 열고, 프리셋 하나를 고른다. */
function nhAi(token,ms,fast){
  var btn=document.querySelector('#phone-mirror .pn-ai')||document.querySelector('.pn-ai');
  if(!btn)return false;
  btn.click();
  /* fast (v2.21) — 한 박자 기다리지 않고 바로 프리셋을 고른다 (조립 결과는 같다). */
  if(fast){
    var itF=document.querySelector('#aip-list .aip-item');
    if(itF)itF.click();
    return true;
  }
  setTimeout(function(){
    if(token!==nhRunToken)return;
    var item=document.querySelector('#aip-list .aip-item');
    if(item)item.click();
  },Math.max(700,Math.round((ms||2600)*0.4)));
  return true;
}

/* 피드 보기 범위 칩 (전체보기 / 현재 동네 / Trend Zone) — 실제 칩을 누른다 */
function nhScope(v){
  var b=document.querySelector('.fsc[data-s="'+(v||'local')+'"]');
  if(b){b.click();return true;}
  if(typeof feedScope!=='undefined'){feedScope=(v==='all'||v==='zone')?v:'local';
    if(typeof renderFeed==='function')renderFeed();return true;}
  return false;
}

/* ── v1.94 사람 손맛 연출 (콘솔 D72) ─────────────────────
   전부 화면 연출이다 — 계약(NH_ACTIONS·메시지 스키마)과 무관하고, 실패해도 재생을
   막지 않는다. 새 액션을 만들지 않으므로 콘솔·프롬프트와의 3중 동기화도 없다. */

/* 지금 화면에서 **실제로 스크롤되는 칸** (v1.95).
   v1.94 까지 여기 있던 `.pd-body`·`.tabpage`·`.feed-col` 은 **어느 파일에도 없는 클래스**였다
   (마크업이 #feed-page·#social-page·#phone-drawer-body 로 바뀐 뒤 선택자만 남았다).
   그래서 scroll 스텝은 언제나 대상을 못 찾고 아무것도 안 했다 — 지금은 ok:false 로 보고까지 된다.
   후보를 **여는 순서**로 훑고, 넘치는 칸을 먼저 고른다. 없으면 넘치지 않아도 스크롤 가능한 칸을
   돌려준다 (내용이 짧아 안 밀리는 것과 칸을 못 찾은 것은 다른 일이다). */
function nhScrollTarget(){
  var ids=[];
  if(document.querySelector('#phone-drawer.open'))ids.push('phone-drawer-body'); // 서랍이 위에 있으면 그것부터
  if(typeof currentTab!=='undefined'&&currentTab==='feed')ids.push('feed-page');
  if(typeof currentTab!=='undefined'&&currentTab==='social')ids.push('soc-body','social-page');
  ids.push('feed-page','social-page','phone-drawer-body');
  var able=[],i,el,cs;
  for(i=0;i<ids.length;i++){
    el=document.getElementById(ids[i]);
    if(!el||!el.scrollBy)continue;
    cs=getComputedStyle(el);
    if(cs.overflowY!=='auto'&&cs.overflowY!=='scroll')continue;
    if(el.scrollHeight>el.clientHeight+2)return el; // 실제로 밀리는 칸
    able.push(el);
  }
  return able[0]||null;
}

/* 손가락 자국 — 상태가 "스스로" 바뀌면 유령이 조작하는 것처럼 보인다.
   .phone-screen 좌표계에 점 하나를 확장-소멸로 띄운다. */
function nhTouch(el){
  try{
    var scr=document.querySelector('.phone-screen');if(!scr||!el)return;
    var r=el.getBoundingClientRect(),s=scr.getBoundingClientRect();
    if(!r.width&&!r.height)return;
    var d=document.createElement('div');d.className='nh-touch';
    d.style.left=(r.left+r.width/2-s.left)+'px';
    d.style.top=(r.top+r.height/2-s.top)+'px';
    scr.appendChild(d);
    nhSfxPlay('tap'); // 누르는 손이 나는 소리 (v2.25) — 표식이 뜨는 자리가 곧 "지금 눌렀다" 다
    setTimeout(function(){try{d.remove();}catch(e){}},600);
  }catch(e){}
}
/* 액션이 "누르는" 요소 — 표식이 뜰 자리. 못 찾으면 null (표식만 생략, 실행은 그대로). */
function nhTouchTarget(st){
  try{
    if(st.a==='tab')return document.querySelector('.pn-item[data-nav="'+st.v+'"]');
    if(st.a==='ai')return document.querySelector('#phone-mirror .pn-ai')||document.querySelector('.pn-ai');
    if(st.a==='scope')return document.querySelector('.fsc[data-s="'+(st.v||'local')+'"]');
    /* 딜 시트가 열려 있으면 실제로 눌리는 것은 ds-close 다 (v2.2) — cpop-close 는
       딜 시트가 열려 있을 때 화면에 없어(hidden) 표식이 안 뜨고 조용히 170ms 만 죽는다. */
    if(st.a==='popclose'){
      var dsSheet=document.getElementById('deal-sheet');
      if(dsSheet&&dsSheet.style.display!=='none')return document.getElementById('ds-close');
      return document.getElementById('cpop-close');
    }
    /* Request 를 여는 것은 핀을 고르는 손이다 (v2.18) — "사용자가 그 Request 를 눌러
       연다" 가 시나리오의 장면이라, 표식이 핀 위에 서야 화면이 그 말을 한다. */
    if(st.a==='pop'&&st.v==='req'){
      var rd=nhPick('req',st.i);
      if(rd&&typeof reqMarkers!=='undefined')
        for(var ri=0;ri<reqMarkers.length;ri++)
          if(reqMarkers[ri]&&reqMarkers[ri].rq&&reqMarkers[ri].rq.id===rd.id)return reqMarkers[ri].div;
    }
  }catch(e){}
  return null;
}
/* concern 스텝의 한 박자 — 화면 가장자리가 잠깐 어두워진다. 타임라인의 빨간 글씨는
   무대 밖에 있어서, 막힌 순간이 정작 화면에서는 아무 일도 아닌 것처럼 지나갔다. */
function nhConcernBeat(){
  try{
    var scr=document.querySelector('.phone-screen');if(!scr)return;
    scr.classList.add('nh-concern');
    setTimeout(function(){try{scr.classList.remove('nh-concern');}catch(e){}},950);
  }catch(e){}
}
/* 훑는 스크롤 — 한 번에 미끄러지는 단발 이동은 기계 티가 난다. 60% 내리고,
   잠깐 뒤 나머지 40%, 길게 내렸으면 끝에서 15% 되올린다 (사람이 지나친 것을 다시 보는 손). */
function nhScrollHuman(el,dist,ms,token){
  el.scrollBy({top:Math.round(dist*0.6),behavior:'smooth'});
  setTimeout(function(){
    if(token!==nhRunToken)return;
    el.scrollBy({top:Math.round(dist*0.4),behavior:'smooth'});
  },Math.max(250,Math.round((ms||1500)*0.45)));
  if(dist>=280)setTimeout(function(){
    if(token!==nhRunToken)return;
    el.scrollBy({top:-Math.round(dist*0.15),behavior:'smooth'});
  },Math.max(500,Math.round((ms||1500)*0.8)));
}

/* 스텝 하나를 화면 동작으로 옮긴다. 여기서만 앵커를 부른다.
   v1.94 (콘솔 D72):
   ① **화면이 실제로 따라왔는가를 돌려준다.** 앵커·대상이 없으면 false — nhRun 이
     nh:step 의 ok 로 실어 보낸다. 지금까지는 실패를 warn 으로 삼키고 대사만 흘렀다.
   ② 누르는 액션(탭·AI·범위 칩·팝업 닫기)은 **터치 표식을 먼저** 띄우고 한 박자(170ms)
     뒤에 실행한다 — 사람 손가락의 박자다. 대상을 못 찾으면 표식만 생략하고 즉시 실행. */
function nhAct(st,token){
  function exec(){
    try{
      if(st.a==='tab'){if(typeof switchTab!=='function')return false;switchTab(st.v);return true;}
      if(st.a==='mode'){if(typeof switchMode!=='function')return false;
        if(st.v!==currentMode)switchMode(st.v);return true;}
      // 지역 이동 — 자체 지도 조작을 만들지 않고 동결 앵커 cpopGoMap 을 부른다.
      // 그쪽이 팝업·서랍 닫기 → 지도 탭 → 양쪽 지도 이동까지 이미 한다. 줌 14 는 "동네 전체" —
      // 기본값 16 은 항목 하나를 붙여 보는 값이라 동네가 비었는지 차 있는지가 안 보인다.
      // **폰 지도만 움직이면 안 된다**: 카메라는 PC → 폰 단방향 미러라 map 의 다음 idle 이
      // 폰을 원래 자리로 되돌린다. 반드시 map 을 움직여 미러를 태워 보낸다.
      if(st.a==='area'){var c=SEED_AREAS[st.v];
        if(!c||typeof cpopGoMap!=='function')return false;
        // c.z = 사람이 맞춰 둔 배율(custom 만 갖는다, v1.99). 없으면 여태와 같은 기본값.
        nhAreaKey=st.v;cpopGoMap('area',{lat:c.lat,lng:c.lng},c.z||NH_AREA_ZOOM);return true;}
      if(st.a==='pop'){var d=nhPick(st.v,st.i);
        if(!d)return false;
        /* 딜은 다른 물건이다 (v2.2) — 상세 팝업(#content-pop)이 아니다.
           v2.15 부터 핀 탭=매장 전용 페이지고, v2.20 부터 **어느 쪽으로 열지 단계가 정한다**
           (e:'sheet'=쿠폰 시트 · 'page'/빈 값=매장 전용 페이지). 같은 딜이라도 장면에 따라
           보여줄 것이 다르다 — 매장을 소개하는 장면과 쿠폰을 받는 장면은 화면이 다르다.
           만료는 못 여는 게 정직하다(v2.2 유령 방지 규칙 그대로). */
        if(st.v==='deal'){
          if(typeof dealActive==='function'&&!dealActive(d))return false;
          if(String(st.e||'')==='sheet'){
            if(typeof openDealSheet!=='function')return false;
            openDealSheet(d.id);return true;}
          if(typeof openStorePage==='function'){openStorePage(d.id);return true;}
          if(typeof openDealSheet!=='function')return false;
          openDealSheet(d.id);return true;}
        if(typeof openContentPop!=='function')return false;
        openContentPop(st.v,d);return true;}
      if(st.a==='popclose'){
        var did=false;
        /* 딜 시트를 안 닫으면 다음 단계들 위에 그대로 얹힌다 (v2.2). 매장 페이지도 같다 (v2.15). */
        if(typeof closeDealSheet==='function'){closeDealSheet();did=true;}
        if(typeof closeStorePage==='function'){closeStorePage();did=true;}
        if(typeof closeContentPop==='function'){closeContentPop();did=true;}
        return did;}
      // 꾹 누르기 → 컴포저 → 타이핑 → 등록 — 묻는 손이 화면에 보인다 (v2.18).
      if(st.a==='request')return nhRequestTyped(st.v||st.say,token,st.ms,st.fast)!==false;
      if(st.a==='drawer'){if(typeof openPhoneDrawer!=='function')return false;
        openPhoneDrawer();return true;}
      if(st.a==='wait')return true; // 화면은 그대로 — 그것이 이 스텝의 전부다
      // ── v1.71 실제로 무언가를 하는 액션들 ──
      if(st.a==='like'){var f=nhFeedPick(st.i);
        if(!f||typeof toggleLike!=='function')return false;
        var L=toggleLike(f.id);
        // 전역 시드 카드에 남긴 좋아요는 회차가 걷어야 한다 — 켠 것만 적는다 (v1.94).
        if(L&&L.me)nhTempIds.like.push(f.id);
        if(typeof renderFeed==='function'&&currentTab==='feed')renderFeed();
        if(typeof renderFeedMarkers==='function')renderFeedMarkers();
        return true;}
      if(st.a==='write'){if(typeof switchTab==='function')switchTab('map');
        // e = 이모지 (v2.12) — post 와 같은 자리, 같은 뜻이다.
        return nhWriteSpot(st.v||st.say,token,st.ms,st.e,st.fast)!==false;}
      if(st.a==='answer'){var rq=nhPick('req',st.i);
        if(!rq||typeof answerRequest!=='function')return false;
        // v2.12: 값만 꽂지 않고 **쓰이는 모습**을 보여준다 (write 와 같은 문법).
        return nhAnswerTyped(rq,st.v||'지금 그렇게 안 붐벼요',token,st.ms,st.fast)!==false;}
      // 쿠폰 받기 (v2.20) — v=리워드 문구 · e=문구 표시 초('0'=안 띄움) · i=어느 딜
      if(st.a==='coupon')return nhCoupon(st.i,st.v,st.e,token,st.ms,st.fast)!==false;
      /* 리워드 지급 (v2.27) — answer(답 작성)와 **분리된** 액션이다. 답을 쓰면 팝업이
         닫히고, 시간이 지나 이 스텝이 오면 우하단 agent 말풍선 + 코인 버스트로 지급을
         보여준다. v = 말풍선 문구 (콘솔 편집기에서 수정, 비우면 앱 기본 문구). */
      if(st.a==='reward'){if(typeof showRewardBubble!=='function')return false;
        if(typeof hideReqBubble==='function')hideReqBubble();
        return showRewardBubble(st.v)!==false;}
      if(st.a==='chat')return nhChat(st.v,st.say&&st.v==='send'?st.say:(st.i?st.say:''))!==false;
      if(st.a==='ai')return nhAi(token,st.ms,st.fast)!==false;
      // 투명도 연출 (v2.21, 콘솔 D117) — 지금 깔린 지도 컨텐츠를 흐리게 / 원복.
      // dim 이후에 뜨는 것은 제 불투명도로 온다 — "이 다음 것만 봐 달라" 는 연출이다.
      if(st.a==='dim')return nhDim(st.v)!==false;
      if(st.a==='undim')return nhUndim()!==false;
      if(st.a==='scope'){if(typeof switchTab==='function')switchTab('feed');
        return nhScope(st.v)!==false;}
      // ── v1.75 카메라 연출 ──
      // 자체 지도 조작을 만들지 않고 goMapCam(동결 앵커)만 부른다. **양쪽 지도를 같이 움직인다** —
      // 카메라는 PC → 폰 단방향 미러라 폰만 움직이면 다음 idle 이 되돌린다 (area 와 같은 이유).
      // e (v2.21): drop v:feed 만 본다 — 'keep' 이면 상단 지면에 카드를 얹지 않는다.
      if(st.a==='drop')return nhDrop(st.v,st.i,st.e,st.fast)!==false;
      if(st.a==='post')return nhPostSpot(st.v,st.e,st.fast);
      if(st.a==='postfeed')return nhPostFeed(st.v,st.e,st.n,st.fast);
      if(st.a==='burst')return nhBurst(st.v,st.i,st.e,st.ms,token);
      if(st.a==='page')return nhPage(st.v);
      if(st.a==='zoom')return nhZoom(st.v)!==false;
      if(st.a==='focus')return nhFocus(st.v,st.i,token,st.ms)!==false;
      if(st.a==='scroll'){
        var el=nhScrollTarget();
        if(!el||!el.scrollBy)return false;
        nhScrollHuman(el,Math.max(120,(st.i||0)*80||220),st.ms,token);
        return true;}
      return false; // 모르는 액션 — nhSanitize 가 걸렀어야 하지만, 오면 실패다
    }catch(e){console.warn('[M16] step fail',st,e);return false;}
  }
  // fast 스텝은 표식도 박자도 없다 (v2.21) — 화면 조립이지 연출이 아니다.
  var tapEl=st.fast?null:nhTouchTarget(st);
  if(tapEl){
    nhTouch(tapEl);
    setTimeout(function(){if(token!==nhRunToken)return;exec();},170);
    return true; // 누를 대상이 화면에 있다 = 화면이 따라온다
  }
  return exec();
}

var nhRunToken=0;
function nhStop(){nhRunToken++;}

/* 재생 전 초기화 — 시연은 몇 번을 돌려도 같은 곳에서 시작해야 한다.
   앞 시나리오가 열어둔 팝업·드로어가 남으면 다음 회차가 그 뒤에서 조용히 흘러간다. */
/* 이번 회차가 만든 것(시나리오 seed + 재생 중 쓴 글)을 전부 걷어낸다.
   이게 없으면 두 번째 재생부터 "내가 쓴 글" 이 이미 있어서 시연이 매번 달라진다. */
function nhSweepTemp(){
  try{
    if(nhTempIds.spot.length&&typeof demoSpots!=='undefined'){
      demoSpots=demoSpots.filter(function(s){return nhTempIds.spot.indexOf(s.id)<0;});
      if(typeof rebuildSpots==='function')rebuildSpots();
    }
    if(nhTempIds.feed.length&&typeof feedItems!=='undefined'){
      feedItems=feedItems.filter(function(f){return nhTempIds.feed.indexOf(f.id)<0;});
      if(typeof renderFeedMarkers==='function')renderFeedMarkers();
      if(typeof renderFeedColList==='function')renderFeedColList();
    }
    if(nhTempIds.req.length&&typeof fieldRequests!=='undefined'){
      fieldRequests=fieldRequests.filter(function(r){return nhTempIds.req.indexOf(r.id)<0;});
      if(typeof renderRequestMarkers==='function')renderRequestMarkers();
    }
    /* 딜을 걷는다 (v2.2). 여태 timeDeals 는 nhReset 도 안 걷는 유일한 콘텐츠였다.
       열려 있는 시트도 닫는다 — 지운 딜의 시트가 남으면 syncDealSheet 가
       dealById 에서 못 찾아 스스로 닫지만, 그 한 박자가 화면에 보인다. */
    if(nhTempIds.deal.length&&typeof timeDeals!=='undefined'){
      timeDeals=timeDeals.filter(function(d){return nhTempIds.deal.indexOf(d.id)<0;});
      if(typeof closeDealSheet==='function')closeDealSheet();
      if(typeof closeStorePage==='function')closeStorePage(); // 지운 딜의 매장 페이지도 함께 (v2.15)
      if(typeof renderDealMarkers==='function')renderDealMarkers();
    }
    if(nhTempIds.page.length&&typeof newsItems!=='undefined'){
      newsItems=newsItems.filter(function(n){return nhTempIds.page.indexOf(n.id)<0;});
      if(typeof renderNews==='function')renderNews();
    }
    if(nhTempIds.chat.length&&typeof socMsgs!=='undefined')
      nhTempIds.chat.forEach(function(k){delete socMsgs[k];});
    /* 무대 트렌드 존을 걷는다 (v2.21) — 지도 폴리곤·라벨을 먼저 떼고 배열에서 뺀다.
       폰 지도 오버레이는 syncPhoneZones 가 배열 기준으로 다시 만든다. */
    if(nhTempIds.zone.length&&typeof trendZones!=='undefined'){
      trendZones.filter(function(z){return nhTempIds.zone.indexOf(z.id)>=0;})
        .forEach(function(z){if(typeof removeZoneFromMap==='function')try{removeZoneFromMap(z);}catch(e){}});
      trendZones=trendZones.filter(function(z){return nhTempIds.zone.indexOf(z.id)<0;});
      if(typeof syncPhoneZones==='function')syncPhoneZones();
      if(typeof renderDrawerDemo==='function')renderDrawerDemo();
    }
    // 전역 시드 카드에 남긴 좋아요를 되돌린다 (v1.94) — 자기 seed 카드는 회차마다
    // 새 id 라 상관없지만, 전역 카드는 살아남아서 두 번째 재생부터 하트가 이미
    // 차 있었다 (toggleLike 는 토글이라 "채워지는" 장면이 "꺼지는" 장면이 된다).
    if(nhTempIds.like&&nhTempIds.like.length&&typeof feedLikes!=='undefined'&&typeof toggleLike==='function'){
      nhTempIds.like.forEach(function(id){
        if(feedLikes[id]&&feedLikes[id].me)toggleLike(id);
      });
      if(typeof renderFeed==='function'&&typeof currentTab!=='undefined'&&currentTab==='feed')renderFeed();
      if(typeof renderFeedMarkers==='function')renderFeedMarkers();
    }
  }catch(e){console.warn('[M16] sweep',e);}
  nhTempIds={spot:[],feed:[],req:[],chat:[],like:[],deal:[],page:[],zone:[]};
}

/* 시나리오가 선언한 seed 를 깐다 — "이 시나리오가 성립하려면 화면에 무엇이 있어야 하나".
   전역 시드로는 못 만드는 상황(답변 대기 중인 내 Request 등)을 회차마다 새로 만든다. */
/* 배치는 **결정적**이어야 한다 — 시연은 몇 번을 돌려도 같은 자리에 같은 것이 있어야 한다
   (v1.71까지는 Math.random 이라 회차마다 위치가 달라졌다). 황금각으로 중심 둘레에 흩어
   개수가 늘어도 서로 겹치지 않는다. 종류마다 base 를 달리 줘서 스팟·피드·Request 가 포개지지 않는다. */
function nhSpread(c,i){
  var a=i*2.399963,r=0.0015+0.0008*(i%3);
  return {lat:c.lat+r*Math.cos(a),lng:c.lng+r*Math.sin(a)*1.25};
}
/* 무대에 깔 수 있는 개수 (v2.10) — **콘솔의 MAX_SEED_* 와 같은 값이어야 한다.**
   화면이 허용한 것을 앱이 조용히 버리면 시연이 설명과 어긋난다. 10 이던 시절에는
   "무대 = 여는 장면의 전제" 였는데, 콘솔이 컨텐츠 탭을 따로 내면서(콘솔 D93) 여기가
   동네를 채우는 자리가 됐다. */
/* dealPhoto: 딜 하나의 매장 페이지 사진 그리드 상한 (v2.17) — 시안이 3열이라 9장이면
   세 줄로 꽉 찬다. 콘솔의 MAX_DEAL_PHOTOS 와 같은 값이다. */
/* zone (v2.21): 무대 트렌드 존 상한 — 콘솔의 MAX_SEED_ZONES 와 같은 값. */
var NH_MAX={req:10,spot:40,feed:40,deal:10,page:12,dealPhoto:9,zone:6};
/* 존 하나가 들고 올 수 있는 칸 수 (v2.24) — 앱 zoneBookSnapshot 의 상한과 같은 값이다. */
var NH_ZONE_CELLS_MAX=30;
/* 자리 대역 (v2.10) — `nhSpread` 는 번호 하나로 자리를 정하므로, 종류가 겹치지 않게
   하는 유일한 길이 대역이다. 상한이 10 이던 시절에는 10 칸(스팟 10+i · 피드 20+i)이면
   충분했지만 40 이 되면 다른 종류가 **같은 자리에** 깔린다. 종류마다 100 칸을 준다:
   앞 절반(0~49)은 무대가 미리 깐 것, 뒤(50~)는 재생 중 생긴 남의 글이다.
   ⚠️ 대역이 바뀌면 옛 데모의 콘텐츠 자리도 같이 바뀐다 — 사람이 끌어 옮긴 자리
   (NH_POS_KEY)는 종류+번호로 저장돼서 그대로 살아남는다. */
var NH_BAND={req:0,spot:100,feed:200,deal:300};
/* 재생 중 생긴 것이 무대와 겹치지 않게 하는 시작 번호 (대역 안의 뒤 절반). */
var NH_POST_FROM=50;
/* 트렌드 온도 (v2.4) — 사람이 적은 값을 0~100 으로 자르고, 안 적었으면 null 이다.
   빈 문자열과 0 을 가른다: 0 은 "가장 식은" 이라는 **선택**이고 빈 값은 "안 정했다" 다. */
function nhTemp(v){
  if(v===null||v===undefined||v==='')return null;
  var n=Number(v);
  return isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):null;
}
/* 콘솔이 실어 보낸 좌표 (v2.24) — 무대 항목이 **제 자리**를 들고 올 수 있다.
   앱에서 가져온 트렌드 존과 그 안의 컨텐츠가 실제 지도의 그 자리에 서야 뜻이 있다.
   못 믿을 값은 null 이고, 그러면 여태처럼 무대가 자리를 편다(nhSpread). */
function nhLatLng(v){
  if(!v)return null;
  var la=Number(v.lat),ln=Number(v.lng);
  if(!isFinite(la)||!isFinite(ln))return null;
  if(Math.abs(la)>90||Math.abs(ln)>180)return null;
  return {lat:la,lng:ln};
}
/* 존이 그려진 칸 좌표. **두 모양을 다 받는다** (v2.25.1):
   공개 목록(zoneBook)은 `[[lat,lng],…]` 로 납작하게 싣고(키를 반복하면 문서가 두 배다),
   콘솔은 그것을 `{lat,lng}` 로 풀어서 무대에 넣는다. 쌍만 받던 v2.24 는 콘솔이 보낸
   모양을 통째로 버렸고, 그래서 중심만 살아 **칸 수·배열이 앱과 달랐다**(로제트로 새로 폄). */
function nhShape(v){
  if(!Array.isArray(v))return null;
  var out=[];
  for(var i=0;i<v.length&&out.length<NH_ZONE_CELLS_MAX;i++){
    var p=v[i];if(!p)continue;
    var q=Array.isArray(p)?nhLatLng({lat:p[0],lng:p[1]}):nhLatLng(p);
    if(q)out.push(q);
  }
  return out.length?out:null;
}
/* 헥사 반경(km) — 앱의 그리드 설정과 같은 범위 안에서만 받는다. */
function nhZoneRadius(v){
  var n=Number(v);
  if(!isFinite(n)||n<=0)return null;
  return Math.min(2,Math.max(0.05,n));
}
/* 안 정했을 때의 온도 — **결정적 랜덤**이다 (Math.random 금지, v1.72 와 같은 이유:
   시연은 몇 번을 돌려도 같은 화면이어야 한다). 22~92 사이로 편다 — 0 근처만 나오면
   전부 식은 색이라 트렌드 모드를 켠 뜻이 화면에 안 보인다.

   ⚠️ **id 를 넣지 않는다.** id 에는 회차마다 달라지는 stamp 가 박혀 있어서, 그걸 섞으면
   같은 데모를 두 번 재생할 때 색이 달라진다 — 결정적이라는 말이 무색해진다.
   대신 그 항목의 **글과 순번**을 섞는다: 시나리오가 같으면 늘 같고, 항목마다 다르다. */
function nhAutoTemp(key){
  // 섞기는 heatJitter 한 벌만 쓴다 (v2.6) — 여기도 `h*31+c` 였는데, 끝 글자만 다른 키가
  // 이웃 값으로 몰리는 같은 결함이 있었다. 두 벌로 두면 한쪽만 고쳐진다.
  return 22+Math.floor(heatJitter(key)*71);
}
/* 사람이 올린 사진 주소만 통과시킨다 (v2.4) — `javascript:` 같은 것이 img src 로 들어가지
   않게. data: 는 이미지 한정. 못 믿을 값이면 빈 문자열이고, 그러면 테마 색으로 그린다. */
function nhImgSrc(v){
  var s=String(v||'').trim();
  if(!s)return '';
  if(/^https:\/\//i.test(s))return s.slice(0,2000);
  if(/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s))return s.slice(0,2000000);
  return '';
}
/* 무대에 넣을 것을 **재생 중에도** 깔 수 있어야 한다 (v1.98, 콘솔 D86 "뿅뿅").
   그래서 항목 하나를 깔는 일을 seed 시점에서 떼어냈다 — nhSeedScenario 와 nhDrop 이
   같은 코드를 쓴다. 두 벌로 두면 한쪽만 고쳐져 "처음부터 깐 것" 과 "중간에 뜬 것" 이
   서로 다른 물건이 된다. */
function nhLayReq(r,i,c,stamp,token){
  if(typeof fieldRequests==='undefined')return null;
  var id='rqn_'+stamp+'_'+i,p=nhPosGet('req',i,c)||nhSpread(c,NH_BAND.req+i); // 사람이 옮긴 자리 우선 (v2.3)
  var lat=p.lat,lng=p.lng;
  /* mine:false = **다른 사용자가 올린** Request (v2.18, 콘솔 D114). by 를 남으로 적으면
     팝업이 답장 칸을 그리고(1182), answer 가 "내가 답하는" 장면이 되며 코인이 적립된다.
     여태는 전부 myUid 라 남의 Request 를 무대에 깔 길이 없었다. */
  fieldRequests.push({id:id,q:String(r.q||'').slice(0,120),lat:lat,lng:lng,
    place:(typeof dongAt==='function'?dongAt(lat,lng):'')||c.name,
    // stage: 무대가 깐 것 — 10분 만료를 안 탄다 (v2.13, reqActive 참조).
    answers:[],ts:Date.now(),stage:true,
    by:(r.mine===false?'nh_other':(typeof myUid==='function'?myUid():'anon')),seed:false});
  nhTempIds.req.push(id);
  // 자동 도착은 **내 Request 만** (v2.18) — 남의 것에 걸리면 아무도 안 답했는데
  // 코인이 적립되는 화면이 된다 (answerRequest 가 "남의 것에 답함" 으로 읽는다).
  if(r.answerIn&&r.mine!==false){ // 재생 도중에 답이 도착한다 — 이 시연의 핵심 장면
    setTimeout(function(){
      if(token!==nhRunToken)return;
      if(typeof answerRequest==='function')answerRequest(id,String(r.answer||'지금은 여유 있어요'));
      if(typeof renderDrawerDemo==='function')renderDrawerDemo();
    },Math.min(Math.max(r.answerIn|0,800),20000));
  }
  return id;
}
function nhLaySpot(s,i,c,stamp){
  if(typeof demoSpots==='undefined')return null;
  // 자리: 사람이 옮긴 것(v2.3) → 항목이 들고 온 제 자리(v2.24, 앱에서 가져온 존의 컨텐츠) → 무대가 편 자리
  var id='spn_'+stamp+'_'+i,p=nhPosGet('spot',i,c)||nhLatLng(s.at)||nhSpread(c,NH_BAND.spot+i);
  demoSpots.push({id:id,lat:p.lat,lng:p.lng,
    text:String(s.t||'').slice(0,80),emoji:s.emoji||'💬',
    /* 트렌드 온도 (v2.4) — heatTOf 가 이 값을 자동 계산보다 먼저 본다. 안 정했으면
       id 로 편 결정적 값이다: 무대 콘텐츠는 좋아요가 0 이라 자동 계산이 전부 같은
       색을 내고, 그러면 트렌드 모드가 아무것도 구분해 보여주지 못한다. */
    temp:(s.temp!=null?s.temp:nhAutoTemp('spot'+i+(s.t||''))),
    live:true});
  nhTempIds.spot.push(id);
  return id;
}
function nhLayFeed(f,i,c,stamp){
  if(typeof feedItems==='undefined')return null;
  // 자리: 사람이 옮긴 것(v2.3) → 항목이 들고 온 제 자리(v2.24) → 무대가 편 자리
  var id='fdn_'+stamp+'_'+i,p=nhPosGet('feed',i,c)||nhLatLng(f.at)||nhSpread(c,NH_BAND.feed+i);
  feedItems.push({id:id,
    /* 사진: 사람이 올린 것이 있으면 그것, 없으면 테마 색으로 그린다 (v2.10 — 지면
       카드가 v2.4 에 얻은 길을 피드 카드도 갖는다). 콘솔이 Storage 에 두고 주소만
       실어 보낸다 — 시나리오 문서에 이미지를 통째로 담으면 Firestore 상한에 닿는다. */
    src:(nhImgSrc(f.img)||(typeof seedImg==='function'?seedImg(f.theme||'cafe',f.label||''):'')),
    region:(typeof dongAt==='function'?dongAt(p.lat,p.lng):'')||c.name,zone:null,
    lat:p.lat,lng:p.lng,kind:'post',
    desc:String(f.desc||f.label||'').slice(0,120),
    name:String(f.name||'동네주민').slice(0,20),
    temp:(f.temp!=null?f.temp:nhAutoTemp('feed'+i+(f.desc||f.label||''))), // 트렌드 온도 (v2.4) — nhLaySpot 과 같은 이유
    by:'nh_tmp',ts:Date.now()-(i+1)*3600e3,likes:{},seed:false,type:'photo'});
  nhTempIds.feed.push(id);
  return id;
}
/* 무대에 타임딜 하나 (v2.2, 콘솔 D90).
   **`seed:false` 다** — dealRemain 이 이 값을 보고 갈린다. `seed:true` 는 벽시계를
   주기로 접어 안 끝나지만 화면의 남은시간이 여는 순간의 벽시계에 달린다. 무대가
   "남은시간" 을 받는 이상 적은 값에서 정직하게 줄어야 "마감 1분 전" 이 성립한다.
   짧게 적으면 재생 중 dealActive 가 false 가 되며 핀이 사라진다 — 연출로 쓸 수 있다.
   가격 3칸은 만든다(사람은 5칸만 적는다). **결정적**이어야 한다 — Math.random 금지. */
function nhLayDeal(d,i,c,stamp){
  if(typeof timeDeals==='undefined')return null;
  var id='dln_'+stamp+'_'+i,p=nhPosGet('deal',i,c)||nhSpread(c,NH_BAND.deal+i); // 사람이 옮긴 자리 우선 (v2.3)
  var pct=Math.min(90,Math.max(5,(d.pct|0)||20));
  var secs=Math.min(7200,Math.max(30,(d.secs|0)||1800));
  /* 순번을 섞는다 — 셋이 다 같으면 지어낸 게 보인다. **%8 로 접는다** (v2.11):
     burst 가 NH_POST_FROM(50)+ 순번으로 깔면서, 접지 않으면 원가가 25만 원대로 튄다 —
     v2.2 에서 hold 딜이 "30만 원짜리 모자" 가 되던 것과 같은 결이다. */
  var was=9900+(i%8)*5000;
  var now=Math.floor(was*(100-pct)/100/100)*100;   // 백 원 단위로 내림
  timeDeals.push({id:id,lat:p.lat,lng:p.lng,
    // 사진 (v2.12) — 피드·지면과 같은 규칙: 통과한 주소만, 없으면 이모지로 그린다.
    img:nhImgSrc(d.img),
    e:String(d.e||'⏰').slice(0,4),
    title:String(d.title||'').slice(0,40),
    shop:String(d.shop||'근처 매장').slice(0,30),
    // 매장 페이지(v2.15)용 optional 칸 — 콘솔이 안 주면 페이지가 파생값(동네·템플릿·근처 사진)으로 채운다.
    // desc 는 300자까지 받는다 (v2.17) — 매장 소개는 한 문장으로 안 끝나는 일이 잦다.
    addr:d.addr?String(d.addr).slice(0,60):undefined,
    desc:d.desc?String(d.desc).slice(0,300):undefined,
    // 사진 그리드 (v2.17) — 통과한 주소만, 없으면 storeFeedPhotos 가 근처 피드에서 모은다.
    photos:Array.isArray(d.photos)?d.photos.slice(0,NH_MAX.dealPhoto).map(nhImgSrc).filter(Boolean):undefined,
    pct:pct,
    price:now.toLocaleString('ko-KR')+'원',
    was:was.toLocaleString('ko-KR')+'원',
    stock:Math.max(3,20-Math.round(pct/5))+'개',
    secs:secs,ts:Date.now(),seed:false});
  nhTempIds.deal.push(id);
  return id;
}
/* 무대에 상단 지면 카드 하나 (v2.2, 콘솔 D90).
   좌표를 안 남긴다 — 캐러셀은 지도가 아니다. `c` 는 place 가 비었을 때 지도 중심의
   동 이름을 얻는 데만 쓴다.
   renderNews 가 이미 it.tab·it.title·it.region 을 읽으므로(클라우드 저장이 그 셋을
   실어 나른다) 그리는 쪽은 손대지 않는다.
   seedImg 의 두 번째 인자를 **비운다**: 그 인자는 사진 안에 라벨 칩을 그리는데,
   같은 글이 cps-title 로도 나가면 한 카드에 두 번 적힌다. */
function nhLayNews(p,i,c,stamp){
  if(typeof newsItems==='undefined')return null;
  var id='nwn_'+stamp+'_'+i;
  var tab=(p.tab==='feed'||p.tab==='social')?p.tab:'map';
  var region=String(p.place||'').slice(0,20);
  if(!region)region=((typeof dongAt==='function'?dongAt(c.lat,c.lng):'')||c.name||'');
  /* 사진: 사람이 올린 것이 있으면 그것, 없으면 테마 색으로 그린다 (v2.4).
     올린 사진은 콘솔이 Storage 에 두고 주소만 실어 보낸다 — 시나리오 문서에 이미지를
     통째로 담으면 Firestore 문서 상한(1MB)에 금세 닿는다. */
  newsItems.push({id:id,tab:tab,stage:true,
    src:(p.img||(typeof seedImg==='function'?seedImg(p.theme||'cafe',''):'')),
    region:region,title:String(p.title||'').slice(0,60)});
  nhTempIds.page.push(id);
  return id;
}
/* 무대에 트렌드 존 하나 (v2.21, 콘솔 D117) — 이름·설명·사진·색·온도를 시나리오가 정한다.
   기하는 앱이 만든다: 지역 좌표 둘레의 결정적 자리에 헥사 클러스터(r:1=7칸 · r:2=19칸)를
   편다 — 사람이 관리자 화면에서 셀을 골라 그리는 존과 같은 모양(trendZones 항목)이라,
   드로어 카드·존 리스트·온도(heatTOf 의 존 온도)·포커스가 전부 그대로 동작한다.
   **트렌드 모드에서만 보인다** (renderZoneOnMap/syncPhoneZones 의 기존 게이트).
   saveZonesToStorage 는 부르지 않는다 — 무대는 회차가 깔았다 걷는 것이다 (nhSweepTemp). */
var NH_ZONE_COLORS=['#e23b2a','#f2862e','#f2c53d','#9dc64c','#1428A0'];
function nhLayZone(z,i,c,stamp){
  if(typeof trendZones==='undefined'||typeof getHexGridParams!=='function')return null;
  var id='tzn_'+stamp+'_'+i;
  /* 자리 (v2.24): 앱에서 가져온 존은 **제 자리와 모양을 들고 온다** — 그러면 지도의 그
     자리에 그대로 편다. 손으로 적은 존은 여태처럼 무대가 편다: 지역 중심 둘레 황금각
     — 컨텐츠 핀 대역(nhSpread ~0.002)보다 넓게 (존은 면이다). */
  var rad=(z.radiusKm!=null?z.radiusKm:hexRadiusKm);
  var centers=null;
  if(z.shape&&z.shape.length)centers=z.shape.map(function(p){return {lat:p.lat,lng:p.lng};});
  if(!centers){
    var ctr=z.at||null;
    if(!ctr){
      var a=i*2.399963+0.9,dd=0.006+0.004*(i%3);
      ctr={lat:c.lat+dd*Math.cos(a),lng:c.lng+dd*Math.sin(a)*1.25};
    }
    var gp=getHexGridParams(rad),x=gp.colSpacing,y=gp.rowSpacing;
    var offs=[[0,0],[0,y],[0,-y],[x,y/2],[x,-y/2],[-x,y/2],[-x,-y/2]];
    if(z.r===2)offs=offs.concat([[0,2*y],[0,-2*y],[x,1.5*y],[x,-1.5*y],[-x,1.5*y],[-x,-1.5*y],
      [2*x,0],[2*x,y],[2*x,-y],[-2*x,0],[-2*x,y],[-2*x,-y]]);
    centers=offs.map(function(o){return {lat:ctr.lat+o[1],lng:ctr.lng+o[0]};});
  }
  var zone={id:id,name:String(z.name||'').slice(0,20),
    color:z.color||NH_ZONE_COLORS[i%NH_ZONE_COLORS.length],
    fillA:null,desc:String(z.desc||'').slice(0,80),
    temp:(z.temp!=null?z.temp:null),
    photo:z.img||null,radiusKm:rad,
    hexCenters:centers,
    originalCenters:JSON.parse(JSON.stringify(centers)),
    originalRadiusKm:rad,
    polygons:[],label:null,stage:true};
  trendZones.push(zone);
  nhTempIds.zone.push(id);
  return id;
}

/* 상단 지면을 한 칸 옆으로 (v2.2, 콘솔 D90 · 액션 `page`).
   스와이프가 쓰는 .28s 전환을 그대로 타므로 미끄러지는 그림이 공짜로 나온다.

   ⚠️ **손가락 표식을 nhTouchTarget 으로 붙이지 않는다.** nhAct 는 표식 대상을 찾으면
   `return true` 로 즉시 성공을 보고한다("누를 대상이 화면에 있다 = 화면이 따라온다") —
   그러면 끝에 닿아 아무 일도 안 일어난 회차도 ok:true 가 된다. 여기서 직접 부른다.

   접혀 있으면 먼저 펼친다: 접힘은 nowhere_sumfold 로 localStorage 에 남고 임베드는
   관리자 콘솔과 같은 오리진이라, 관리자가 접어 둔 채로 시연에 들어올 수 있다. */
function nhPage(v){
  var dir=(v==='prev')?-1:((v==='next')?1:0);
  if(!dir)return false;
  var frame=document.getElementById('cp-frame');
  if(!frame)return false;
  if(frame.classList.contains('folded')){
    var btn=document.getElementById('sum-collapse');
    if(btn)btn.click();
  }
  if(typeof newsView==='undefined'||!newsView||newsView.length<2)return false;
  var next=newsIndex+dir;
  if(next<0||next>=newsView.length)return false;
  if(typeof nhTouch==='function')nhTouch(frame);
  newsIndex=next;
  setTrackAnim(true);snapTrack();
  if(typeof updateDots==='function')updateDots();
  if(typeof updateFoldBtnTone==='function')updateFoldBtnTone();
  return true;
}

/* 남이 방금 올린 글 (v2.0) — 무대에 미리 깔지 않고 **그 단계에서 만든다.**
   hold+drop 은 무대에 항목을 만들고 토글을 켜고 번호를 맞춰야 해서, "남의 글이 하나둘
   올라온다" 처럼 흔한 장면에 손이 너무 많이 갔다 (콘솔 D88). 깔기는 시드와 **같은
   함수**(nhLaySpot)를 쓴다 — 뒤늦게 뜬 글만 모양이나 정리 대상이 달라지면 안 된다. */
var nhPostN=0;
function nhPostCenter(){return nhHeld.c||SEED_AREAS[nhAreaKey]||SEED_AREAS.gangnam;}
function nhPostSpot(v,e,fast){
  var t=String(v||'').slice(0,80);if(!t)return false;
  // NH_POST_FROM 에서 세는 이유: 무대가 미리 깐 것(0~)과 자리가 겹치지 않게 한다.
  var id=nhLaySpot({t:t,emoji:String(e||'').slice(0,4)||'💬'},NH_POST_FROM+(nhPostN++),
                   nhPostCenter(),nhHeld.stamp||Date.now());
  if(!id)return false;
  if(!fast)nhBounceMark(id,2); // "방금 올라온 글" 은 뿅 하고 나타난다 (v2.11 — PC·폰 두 지도)
  if(typeof rebuildSpots==='function')rebuildSpots();
  return true;
}
/* 남이 방금 올린 **피드 카드** (v2.1). post 와 같은 이유로 있다 — 무대에 적고 hold 를
   켜고 번호를 맞추는 세 손을 없앤다. 사진은 seedImg(테마 색 + 라벨)로 그려서 외부
   이미지에 기대지 않는다(nhLayFeed 안). e = 테마, n = 올린 사람. */
function nhPostFeed(v,e,n,fast){
  var d=String(v||'').slice(0,120);if(!d)return false;
  var id=nhLayFeed({desc:d,label:d,theme:String(e||'')||'cafe',name:String(n||'')||'동네주민'},
                   NH_POST_FROM+(nhPostN++),nhPostCenter(),nhHeld.stamp||Date.now());
  if(!id)return false;
  if(!fast)nhBounceMark(id,2); // "방금 올라온 카드" 는 뿅 하고 나타난다 (v2.11 — PC·폰 두 지도)
  if(typeof renderFeed==='function')renderFeed();
  if(typeof renderFeedMarkers==='function')renderFeedMarkers();
  if(typeof renderNews==='function')renderNews(); // 지도 탭 상단 지면에도 실린다 (v2.10)
  return true;
}

/* ── 엔딩 연출: 줌아웃 + 컨텐츠 쏟아짐 (v2.11, 콘솔 D94 · 액션 `burst`) ──
   st.v = 종류 — `spot`·`feed`·`deal` 을 **`+` 로 이어 여러 개**를 고를 수 있다
   ("spot+feed"), `mix`·빈 값은 셋 다 (v2.12) · st.i = 개수(1~50) ·
   st.e = 줌(11~16, 비면 13) · st.ms = 이 단계의 길이 = 쏟아지는 시간.

   **전부 결정적이다** (Math.random 금지, v1.72 와 같은 이유) — 자리·문구·등장 시각이
   순번과 시나리오 키(heatJitter)로 정해져, 같은 데모는 몇 번을 돌려도 같은 그림이다.
   자리는 줌 레벨에 비례해 편다: 줌 13 의 화면은 14 의 두 배라, 고정 반경으로 깔면
   줌아웃한 화면의 가운데 한 줌에만 몰린다. 깔기는 nhLay* 그대로라 리셋이 걷어 간다.

   **바운스를 안 붙인다** (v2.12) — 하나 깔 때마다 렌더가 전부를 다시 만드는데, 그때
   먼저 깔린 것들이 같이 튀어 화면이 깜박이는 것으로 보였다. 쏟아지는 장면의 리듬은
   등장 시각이 만들고, 개별 튀김은 여기서 방해가 된다. */
var NH_BURST_SPOTS=[['여기 줄 서기 시작했어요','🔥'],['방금 자리 났어요','🪑'],['오늘 분위기 최고','✨'],
  ['골목 안쪽이 진짜예요','👀'],['지금 노을 봐요','🌇'],['여기 신상 오픈했어요','🎉'],
  ['산책하기 딱 좋은 날','🌿'],['웨이팅 없이 들어왔어요','🏃']];
var NH_BURST_FEEDS=[['지금 이 골목','cafe'],['오늘의 발견','food'],['방금 찍었어요','park'],
  ['신상 스팟','shop'],['야경 맛집','night'],['운동 끝!','gym'],['전시 보러 왔어요','art'],['독서 한 판','book']];
var NH_BURST_NAMES=['동네주민','골목탐험가','산책러','단골손님','뚜벅이','로컬큐레이터'];
var NH_BURST_DEALS=[['마감 직전 딜','🥐','베이커리',40],['오늘만 이 가격','☕','카페',30],
  ['라스트 오더','🍜','분식집',25],['깜짝 타임딜','🛍️','편집숍',35]];
/** burst 가 한 번에 만들 수 있는 개수 — 콘솔의 MAX_BURST_COUNT 와 같은 값이어야 한다. */
var NH_BURST_MAX=50;
/** `v` 를 종류 목록으로 — "spot+feed" 처럼 이어 붙일 수 있다 (v2.12). */
function nhBurstKinds(v){
  var out=[];
  String(v||'').split(/[+,\s]+/).forEach(function(x){
    if((x==='spot'||x==='feed'||x==='deal')&&out.indexOf(x)<0)out.push(x);
  });
  return out.length?out:['spot','feed','deal']; // mix·빈 값·모르는 값 = 셋 다
}
function nhBurst(v,n,e,ms,token){
  var c=nhPostCenter();if(!c)return false;
  var kinds=nhBurstKinds(v);
  n=Math.min(NH_BURST_MAX,Math.max(1,n|0||12));
  ms=Math.max(800,ms|0||4000);
  var z=parseInt(e,10);if(!isFinite(z))z=13;z=Math.min(16,Math.max(11,z));
  if(typeof switchTab==='function')switchTab('map');
  var at=nhCenter()||c;
  var salt=String(nhScenarioKey||'burst');
  var stamp=nhHeld.stamp||Date.now();
  /* 줌아웃을 **한 번의 매끄러운 움직임**으로 (v2.14). v2.13 은 setZoom 을 열두 번 나눠
     불렀는데, `setZoom` 은 부를 때마다 Maps **자체 애니메이션**(0.3초쯤)을 시작한다 —
     다음 걸음이 그 애니메이션을 중간에 자르고 새로 시작하니 끊기고 튀었다.
     그래서 걸음이 아니라 **프레임**으로 돈다: `moveCamera` 는 애니메이션 없이 카메라를
     그 값에 바로 놓으므로, rAF 로 매 프레임 조금씩 옮기면 그것이 곧 부드러운 줌아웃이다.
     이징은 easeInOutSine — 시작과 끝이 느려져 "빠져나가는" 느낌이 난다.
     `moveCamera` 가 없는 지도(래스터)면 setZoom 한 번으로 떨어진다(끊김 없음). */
  var z0=(phoneMap&&phoneMap.getZoom&&phoneMap.getZoom())||(map&&map.getZoom&&map.getZoom())||NH_AREA_ZOOM;
  var zoomWin=Math.max(300,Math.round(ms*0.85));
  /* 지금 카메라가 어느 줌에 있나 — 컨텐츠 자리를 그 순간의 화면에 맞추는 데 쓴다.
     프레임 루프가 갱신하고, 깔기 콜백이 읽는다(둘이 같은 값을 봐야 화면 안에 앉는다). */
  var zNow=z0;
  function camLand(){ // 마지막에 PC 지도를 목표 줌에 앉힌다 — 미러(map idle → phoneMap)와
    goMapCam(map,at.lat,at.lng,z);   // 뒤따르는 단계(zoom·area)가 같은 값을 보게.
    if(phoneMap)goMapCam(phoneMap,at.lat,at.lng,z);
    zNow=z;
  }
  if(phoneMap&&phoneMap.moveCamera&&typeof requestAnimationFrame==='function'){
    var camT0=(window.performance&&performance.now)?performance.now():Date.now();
    var camDone=false;
    /* 안전망 — rAF 는 탭이 화면에 없으면 아예 안 돈다(백그라운드·숨은 iframe).
       그대로 두면 카메라가 z0 에 멈춘 채 컨텐츠만 쌓인다. 시간이 지나면 목표에 앉힌다. */
    setTimeout(function(){
      if(camDone||token!==nhRunToken)return;
      camDone=true;camLand();
    },zoomWin+400);
    (function frame(){
      if(token!==nhRunToken||camDone)return;
      var now=(window.performance&&performance.now)?performance.now():Date.now();
      var p=Math.min(1,(now-camT0)/zoomWin);
      var eased=0.5-Math.cos(Math.PI*p)/2; // easeInOutSine — 시작·끝이 느려 "빠져나가는" 느낌
      var zz=z0+(z-z0)*eased;
      try{
        /* **폰 지도만 매 프레임 움직인다.** PC 지도는 임베드에서 display:none 이라
           카메라 호출이 조용히 무시될 수 있는데, 그 상태로 PC 가 idle 을 쏘면 미러
           (map → phoneMap)가 폰을 z0 로 되돌려 버린다 — 끊김의 근원이다.
           PC 는 끝에서 한 번만 맞춘다(camLand). */
        phoneMap.moveCamera({center:{lat:at.lat,lng:at.lng},zoom:zz});
        zNow=zz;
      }catch(err){ camDone=true;camLand(); return; } // 벡터가 아니면 한 번에 (끊기느니 즉시가 낫다)
      if(p<1)requestAnimationFrame(frame);
      else{camDone=true;camLand();}
    })();
  }else{
    camLand();
  }
  for(var k=0;k<n;k++)(function(k){
    /* 등장 시각 (v2.12) — **줌아웃이 도는 동안부터** 마구 생긴다.
       v2.11 은 앞 15% 를 비우고 등간격으로 놨더니 메트로놈처럼 규칙적이었고, 카메라가
       다 빠진 뒤에야 시작해 "줌아웃하며 쏟아진다" 가 두 장면으로 갈렸다. 이제 처음부터
       끝까지 쓰되 자리를 **결정적 흔들기**로 민다 — 몰렸다 뜸했다 하는 리듬이 생긴다. */
    var base=(n>1?k/(n-1):0);
    var t=Math.round(ms*Math.min(0.98,Math.max(0,base*0.92+(heatJitter(salt+'t'+k)-0.5)*0.16)));
    setTimeout(function(){
      if(token!==nhRunToken)return;
      // 종류도 순번이 아니라 섞기로 고른다 — 둘을 고르면 번갈아 나오는 티가 났다.
      var kind=kinds[Math.floor(heatJitter(salt+'k'+k)*kinds.length)%kinds.length];
      var a=k*2.399963+heatJitter(salt)*6.283; // 황금각 + 시나리오별 시작각
      /* 반경은 **그 순간 보이는 화면**을 따라 넓어진다 (v2.13).
         목표 줌 기준으로 한 번에 정하면, 카메라가 아직 안 빠진 초반에 깔린 것들이 화면
         밖에 떨어져서 "줌아웃이 끝난 뒤에야 뜬다" 로 보였다 — 실제로는 이미 있었다.
         v2.14: 계산 대신 **카메라가 실제로 있는 줌**(zNow)을 읽는다 — 이징이 붙어
         진행이 시간에 비례하지 않으므로, 예측값을 쓰면 다시 어긋난다. */
      var zAt=zNow;
      var rVis=0.028*Math.pow(2,13-zAt); // 줌 13 화면 반폭 기준 — 레벨당 두 배
      var r=rVis*(0.25+0.7*Math.sqrt(heatJitter(salt+'r'+k))); // sqrt = 면적 균등
      var p={lat:at.lat+r*Math.cos(a)*0.8,lng:at.lng+r*Math.sin(a),name:c.name};
      var pick=function(pool){return pool[(k+Math.floor(heatJitter(salt)*pool.length))%pool.length];};
      var idx=NH_POST_FROM+(nhPostN++);
      /* 소리는 burst 도 낸다 (v2.23) — 바운스는 안 붙이지만(깜박임) 컨텐츠가 쏟아지는
         것은 등장이다. nhSfxPlay 의 최소 간격이 50개를 기관총이 아니라 성긴 빗소리로 만든다. */
      nhSfxPlay();
      // 바운스를 안 붙인다 (v2.12) — 위 주석 참조.
      if(kind==='spot'){
        var sp=pick(NH_BURST_SPOTS);
        if(nhLaySpot({t:sp[0],emoji:sp[1]},idx,p,stamp)&&typeof rebuildSpots==='function')rebuildSpots();
      }else if(kind==='feed'){
        var fd=pick(NH_BURST_FEEDS);
        if(nhLayFeed({desc:fd[0],label:fd[0],theme:fd[1],name:pick(NH_BURST_NAMES)},idx,p,stamp)){
          if(typeof renderFeedMarkers==='function')renderFeedMarkers();
          if(typeof renderFeed==='function'&&currentTab==='feed')renderFeed();
          if(typeof renderNews==='function')renderNews();}
      }else{
        var dl=pick(NH_BURST_DEALS);
        if(nhLayDeal({title:dl[0],e:dl[1],shop:dl[2],pct:dl[3],secs:600+120*(k%5)},idx,p,stamp)
           &&typeof renderDealMarkers==='function')renderDealMarkers();
      }
    },t);
  })(k);
  return true;
}

/* 아직 안 깐 것 — `hold` 가 붙은 항목은 여기 담아 두고 `drop` 이 꺼낸다.
   무대(c)와 stamp 도 같이 들고 있어야 나중에 깔 때 같은 자리에 같은 규칙으로 깔린다. */
var nhHeld={spot:[],feed:[],req:[],deal:[],page:[],c:null,stamp:0,token:0};

function nhSeedScenario(sc,token){
  // 회차마다 0 부터 — write 의 "옮긴 자리" 키가 회차를 넘어 같아야 한다 (v2.12).
  nhHeld={spot:[],feed:[],req:[],deal:[],page:[],c:null,stamp:0,token:token};nhPostN=0;nhWriteN=0;nhWriteIds={};nhReqN=0;nhReqIds={};
  /* 등장 효과음 (v2.23) — 회차를 시작할 때 건다(소리가 없는 시나리오면 빈 값으로 꺼서
     앞 회차의 소리가 따라오지 않게). **무대를 까는 동안에는 안 운다** — 여기서 깔리는
     것들은 바운스 표를 안 찍기 때문이다(재생 시작 전에 이미 있던 화면이라 등장이 아니다).
     소리는 drop·post·write 처럼 **재생 중에 생기는 것**에만 붙는다. */
  nhSfxSet(sc&&sc.seed&&sc.seed.sfx);
  /* 존 카드 모양 (v2.26) — 회차가 정한 값을 걸고, 원래 값은 되돌리려고 적어 둔다.
     이 기기의 관리자 설정을 시연이 영구히 바꾸면 안 된다(소리·코인과 같은 규칙). */
  nhZoneCardSet(sc&&sc.seed&&sc.seed.zoneCard);
  if(!sc||!sc.seed)return;
  var c=SEED_AREAS[sc.area||nhAreaKey]||SEED_AREAS.gangnam;
  var stamp=Date.now();
  nhHeld.c=c;nhHeld.stamp=stamp;
  (sc.seed.reqs||[]).slice(0,NH_MAX.req).forEach(function(r,i){
    if(r&&r.hold){nhHeld.req.push({v:r,i:i});return;}
    nhLayReq(r,i,c,stamp,token);
  });
  /* 보관하는 번호는 **배열 순번 그대로**다 (v2.10). 전에는 스팟만 `10+i`, 피드만 `20+i`
     로 대역을 미리 얹어서, 같은 항목이라도 hold 를 켠 것과 안 켠 것이 다른 자리에
     깔렸다 — 대역은 nhLay* 안에서 한 번만 붙는다(NH_BAND). */
  (sc.seed.spots||[]).slice(0,NH_MAX.spot).forEach(function(s,i){
    if(s&&s.hold){nhHeld.spot.push({v:s,i:i});return;}
    nhLaySpot(s,i,c,stamp);
  });
  /* 피드도 시나리오가 깐다 (v1.72) — 없으면 `like`·`scroll`·`scope` 가 늘 같은 전역 카드를
     건드려서 "이 사람이 무엇에 반응했나" 가 시나리오마다 같아진다.
     사진은 seedImg 로 그린다(테마 색 + 라벨) — 외부 이미지에 기대지 않아 회차마다 똑같이 뜬다. */
  (sc.seed.feeds||[]).slice(0,NH_MAX.feed).forEach(function(f,i){
    if(f&&f.hold){nhHeld.feed.push({v:f,i:i});return;}
    nhLayFeed(f,i,c,stamp);
  });
  /* 타임딜 (v2.2) — **여기서는 60 을 더하지 않는다.** nhLayDeal 안에서 이미
     nhSpread(c,60+i) 로 스팟(10+i)·피드(20+i)·post(40+n)와 자리를 가른다.
     스팟·피드와 달리 이 i 는 자리만이 아니라 원가(9900+i*5000)도 정한다 —
     여기서 60+i 를 미리 얹으면 hold 로 보관했다가 drop 한 딜이 배열 순번이 아니라
     "60+순번" 으로 가격을 매겨 원가가 30만 원대로 튄다(모자가 30만 원짜리가 된다).
     그래서 보관하는 i 는 배열 순번 그대로 — nhLayReq 와 같은 방식이다. */
  (sc.seed.deals||[]).slice(0,NH_MAX.deal).forEach(function(d,i){
    if(d&&d.hold){nhHeld.deal.push({v:d,i:i});return;}
    nhLayDeal(d,i,c,stamp);
  });
  /* 상단 지면 (v2.2) — 좌표가 없으니 base 도 없다. 상한은 관리자 화면의
     NEWS_MAX_COUNT(6)보다 클 수 있다 — 그 상한은 렌더에 안 걸리고, 무대는 관리자가
     올린 지면이 아니라 이 회차가 깔았다 걷는 것이다. */
  (sc.seed.pages||[]).slice(0,NH_MAX.page).forEach(function(p,i){
    if(p&&p.hold){nhHeld.page.push({v:p,i:i});return;}
    nhLayNews(p,i,c,stamp);
  });
  /* 무대 트렌드 존 (v2.21) — hold 가 없다: 존은 면이라 "뿅 하고 뜨는" 연출 대상이 아니고,
     mode:trend 로 넘어가는 순간 기존 게이트가 한꺼번에 그린다. */
  var zoneN=(sc.seed.zones||[]).slice(0,NH_MAX.zone);
  zoneN.forEach(function(z,i){nhLayZone(z,i,c,stamp);});
  if(zoneN.length){
    if(typeof rerenderZones==='function')rerenderZones(); // 트렌드 모드였다면 즉시, 아니면 전환 때 그려진다
    if(typeof renderDrawerDemo==='function')renderDrawerDemo();
  }
  if(typeof rebuildSpots==='function')rebuildSpots();
  if(typeof renderRequestMarkers==='function')renderRequestMarkers();
  if((sc.seed.feeds||[]).length){
    if(typeof renderFeed==='function')renderFeed();
    if(typeof renderFeedMarkers==='function')renderFeedMarkers();
  }
  if((sc.seed.deals||[]).length&&typeof renderDealMarkers==='function')renderDealMarkers();
  /* 지면을 **피드만 깔았을 때도** 다시 그린다 (v2.10).
     지도 탭의 상단 지면은 관리자 지면 + `feedSummaryItems`(사진 있는 가까운 피드 4장)
     인데, 여기서 pages 가 있을 때만 renderNews 를 불렀다 — 피드 카드만 깐 데모는
     탭을 갈아탈 때까지 지면이 빈 채로 있었고, 그게 "피드 사진이 왜 위에 안 뜨나" 의
     원인이다 (콘솔 D93). 무대를 깐 직후가 그 지면이 정해지는 자리다. */
  if(((sc.seed.pages||[]).length||(sc.seed.feeds||[]).length)&&typeof renderNews==='function')renderNews();
}

/* 보관해 둔 것 하나를 **지금** 깐다 (v1.98). "실시간으로 올라온다" 를 보여주는 연출이라,
   무대에 미리 깔지 않고 그 단계에서 화면에 나타나야 한다.
   못 깔면 false 를 돌려준다 — 콘솔이 그 단계를 "화면이 따라오지 못함" 으로 표시한다.
   조용히 성공으로 넘기면 자막만 흐르고 아무 일도 안 일어난 채 시연이 끝난다. */
function nhDrop(v,i,e,fast){
  /* 모르는 종류를 spot 으로 떨어뜨리지 않는다 (v2.2) — 전에는 삼항의 else 가 spot 이라
     `drop:deal` 이 조용히 스팟을 집었다. 아는 것만 받고 나머지는 실패다. */
  var kind=(v==='feed'||v==='req'||v==='deal'||v==='page')?v:(v==='spot'?'spot':'');
  if(!kind)return false;
  var list=nhHeld[kind]||[],n=(i|0);
  if(n<0||n>=list.length)return false;
  var item=list.splice(n,1)[0]; // 한 번 깐 것은 다시 깔지 않는다
  var c=nhHeld.c||SEED_AREAS[nhAreaKey]||SEED_AREAS.gangnam;
  /* 지금 깐 것의 id — 등장 바운스 표시용 (v2.11). 렌더 **전에** 적어야 onAdd 가 본다.
     두 번째 인자는 그 종류를 그리는 지도 수다 (스팟·피드는 PC+폰 둘, 나머지는 폰 하나).
     fast(v2.21)면 바운스를 안 붙인다 — 화면 조립이지 연출이 아니다. */
  var laid;
  if(kind==='spot'){
    laid=nhLaySpot(item.v,item.i,c,nhHeld.stamp);
    if(!laid)return false;if(!fast)nhBounceMark(laid,2);
    if(typeof rebuildSpots==='function')rebuildSpots();
  }else if(kind==='feed'){
    laid=nhLayFeed(item.v,item.i,c,nhHeld.stamp);
    if(!laid)return false;
    /* e:'keep' (v2.21, 콘솔 D117) — 이 카드는 **상단 지면에 얹지 않는다.** 지면은
       feedSummaryItems 가 사진 있는 가까운 피드를 매 렌더마다 다시 고르므로, 한 번
       건너뛰는 것으로는 안 되고 항목 자체에 표시가 남아야 한다 (nonews). */
    if(String(e||'')==='keep'&&typeof feedItems!=='undefined'){
      var fKeep=feedItems.find(function(x){return x.id===laid;});
      if(fKeep)fKeep.nonews=true;
    }
    if(!fast)nhBounceMark(laid,2);
    if(typeof renderFeed==='function')renderFeed();
    if(typeof renderFeedMarkers==='function')renderFeedMarkers();
    if(typeof renderNews==='function')renderNews(); // 지도 탭 상단 지면에도 실린다 (v2.10)
  }else if(kind==='deal'){
    laid=nhLayDeal(item.v,item.i,c,nhHeld.stamp);
    if(!laid)return false;if(!fast)nhBounceMark(laid,1);
    if(typeof renderDealMarkers==='function')renderDealMarkers();
  }else if(kind==='req'){
    laid=nhLayReq(item.v,item.i,c,nhHeld.stamp,nhHeld.token);
    if(!laid)return false;if(!fast)nhBounceMark(laid,1);
    if(typeof renderRequestMarkers==='function')renderRequestMarkers();
    if(typeof renderDrawerDemo==='function')renderDrawerDemo();
    /* 남의 Request 가 지금 도착했다 — 하단 AI Agent 카드가 그 소식을 말한다 (v2.18).
       실서비스에서 근처 사용자에게 뜨는 그 카드(실시간 리스너)의 무대판이다.
       내 Request 는 안 띄운다: 요청자 본인에게는 원래 안 가는 알림이다. */
    var drq=fieldRequests.find(function(x){return x.id===laid;});
    if(drq&&!isMyReq(drq)&&typeof showReqBubble==='function')showReqBubble(drq,true);
  }else if(kind==='page'){
    laid=nhLayNews(item.v,item.i,c,nhHeld.stamp);
    if(!laid)return false;if(!fast)nhBounceMark(laid,1);
    if(typeof renderNews==='function')renderNews();
  }else{
    return false;
  }
  return true;
}

function nhReset(){
  try{
    /* **되돌리는 동안은 무음이다** (v2.25). 여기서 부르는 것들(모드 되돌리기·팝업 닫기)은
       연출이 아니라 청소인데, 앞 회차의 소리가 아직 걸려 있으면 회차를 시작할 때마다
       "삐-" 하고 한 번 운다. 다음 회차의 소리는 nhSeedScenario 가 다시 건다. */
    if(typeof nhSfxSet==='function')nhSfxSet(null);
    if(typeof nhZoneCardRestore==='function')nhZoneCardRestore(); // 회차가 바꾼 카드 모양도 되돌린다 (v2.26)
    nhSweepTemp();
    nhCoinsRestore(); // 이 회차가 적립한 코인도 되돌린다 (v2.19)
    if(typeof nhUndim==='function')nhUndim(); // dim 액션의 흐림도 회차와 함께 걷는다 (v2.21)
    /* 빈 무대는 **매 회차 처음부터 빈다** (v2.12, 콘솔 D95). nhSweepTemp 는 이번 회차가
       만든 것(nhTempIds)만 걷으므로, 다른 경로로 새어 들어온 것은 걷을 사람이 없었다 —
       "컨텐츠 탭에 없는 타임딜이 뜨고 안 사라진다" 가 그 자리다. */
    if(IS_CLEAN_EMBED){
      nhWipeWorld();
      if(typeof rebuildSpots==='function')rebuildSpots();
      if(typeof renderFeedMarkers==='function')renderFeedMarkers();
      if(typeof renderRequestMarkers==='function')renderRequestMarkers();
      if(typeof renderDealMarkers==='function')renderDealMarkers();
      if(typeof closeDealSheet==='function')closeDealSheet();
      if(typeof renderNews==='function')renderNews();
      if(typeof renderFeed==='function'&&currentTab==='feed')renderFeed();
    }
    // 앞 회차가 방학동에 서 있었으면 다음 회차의 pop 이 조용히 빈손이 된다 —
    // 비워 두지 않고 **기본 무대로 되돌린다** (v1.73). 회차마다 같은 곳에서 시작해야 한다.
    if(typeof nhGoHome==='function')nhGoHome();else nhAreaKey='';
    if(typeof closeComposer==='function')closeComposer();
    /* Request 컴포저·도착 카드도 걷는다 (v2.18) — 앞 회차가 열어 둔 채 끊기면
       다음 회차가 그 카드 뒤에서 재생된다 (매장 페이지와 같은 이유). */
    if(typeof closeReqComposer==='function')closeReqComposer();
    if(typeof hideReqBubble==='function')hideReqBubble();
    if(typeof closeContentPop==='function')closeContentPop();
    /* 매장 페이지·딜 시트는 **무조건** 닫는다 (v2.15 리뷰) — sweep 은 이번 회차가 깐
       임시 딜이 있을 때만 닫으므로, 전역 시드 딜을 열어 둔 채(재생 중단·수동 탭) 다음
       회차가 오면 z-29 전면 페이지가 화면을 덮은 채 뒤에서 재생된다. */
    if(typeof closeStorePage==='function')closeStorePage();
    if(typeof closeDealSheet==='function')closeDealSheet();
    if(typeof closeDrawer==='function')closeDrawer();
    if(typeof closeComposer==='function')closeComposer();
    if(typeof switchTab==='function')switchTab('map');
    if(typeof switchMode==='function'&&currentMode!=='local')switchMode('local');
  }catch(e){console.warn('[M16] reset',e);}
}

/* 콘솔이 보내온 시나리오를 받아들인다 (v1.68) — 서베이에서 뽑은 시나리오는 여기 상수에
   없고 콘솔에 있다. 액션 어휘는 여전히 아래 화이트리스트뿐이라 임의 코드가 돌지 않는다. */
var NH_ACTIONS=['tab','mode','pop','popclose','request','drawer','wait','area',
  'like','write','answer','chat','ai','scope','scroll', // v1.71: 보기만 하지 않고 실제로 한다
  'zoom','focus', // v1.75: 카메라 연출 — 시연에서 "어디를 보라" 를 화면이 말한다
  'drop', // v1.98: 무대에 보관해 둔 것을 지금 띄운다 ("실시간으로 올라온다" 연출)
  'post','postfeed', // v2.0/v2.1: 남이 방금 올린 글·피드 카드 — 무대 없이 그 자리에서 만든다
  'burst', // v2.11: 엔딩 연출 — 줌아웃하며 컨텐츠가 쏟아진다 (v=종류·i=개수·e=줌·ms=시간)
  'coupon', // v2.20: 타임딜 쿠폰을 받는다 (v=리워드 문구·e=문구 표시 초·i=어느 딜)
  'dim','undim', // v2.21: 깔린 지도 컨텐츠를 흐리게/원복 — 이후 뜨는 것만 강조하는 연출 (v=남길 불투명도 %)
  'page', // v2.2: 상단 지면을 옆으로 넘긴다
  'reward']; // v2.27: 현장 답변 리워드 지급 — answer 와 분리. 우하단 agent 말풍선 + 코인 버스트 (v=문구)
/* area 로 갈 수 있는 곳 = 시드가 깔린 지역뿐이다. 콘솔은 nh:ready 의 areas 로 이 목록을 받는다 —
   콘솔에 복사해 두면 지역이 늘 때 두 곳이 어긋나고 어긋난 걸 알아챌 장치가 없다. */
function nhAreaList(){return SEED_AREA_ORDER.map(function(k){
  return {key:k,name:SEED_AREAS[k].name};});}
/* 콘솔이 정한 동네를 등록한다 (v1.98, 콘솔 D85). 앱이 미리 아는 네 곳 밖에서 시연하려면
   이 길뿐이다 — 여기 심으면 배포가 묶이고, 시연할 동네는 제품보다 자주 바뀐다.
   **SEED_AREA_ORDER 에는 넣지 않는다**: 그 배열은 시드 평탄화 순서라 문서 id 를 정하고,
   앞뒤가 바뀌면 기존 문서가 통째로 어긋난다. custom 은 카메라·무대 앵커로만 쓴다.
   좌표가 이상하면 등록하지 않는다 — 그러면 아래 게이트가 그 스텝을 버려서, 엉뚱한 자리에
   무대가 깔리는 대신 "지역이 안 움직였다" 는 실패가 남는다. */
function nhCustomArea(raw){
  /* **먼저 지운다.** 앞 회차가 등록해 둔 좌표가 남아 있으면, areaPlace 없이 custom 만 온
     시나리오가 그 자리에 무대를 깔고도 성공한 것처럼 보인다 (조용한 거짓말). */
  try{delete SEED_AREAS.custom;}catch(e){SEED_AREAS.custom=undefined;}
  var p=raw&&raw.areaPlace;if(!p)return;
  var lat=Number(p.lat),lng=Number(p.lng);
  if(!isFinite(lat)||!isFinite(lng))return;
  if(Math.abs(lat)>90||Math.abs(lng)>180)return;
  var a={name:String(p.name||'').slice(0,20)||'직접 정한 동네',lat:lat,lng:lng};
  /* 사람이 맞춰 둔 배율 (v1.99). 없으면 NH_AREA_ZOOM 이다 — "이 화면 그대로" 를 저장했는데
     배율이 안 따라오면 저장한 화면과 재생 화면이 다르다. 앱의 줌 범위로 자른다. */
  var z=Number(p.zoom);if(isFinite(z))a.z=Math.min(18,Math.max(11,Math.round(z)));
  SEED_AREAS.custom=a;
}
/* 지금 화면이 보고 있는 자리 (v1.99) — 콘솔의 "이 지도 저장" 이 읽어 간다.
   **폰 지도를 먼저 본다.** 임베드에서 사람 눈에 보이는 것도, 손으로 끄는 것도 폰이다
   (PC 지도는 display:none 이라 끌 수도 없고 미러의 출발점일 뿐이다). */
function nhHere(){
  var m=(typeof phoneMap!=='undefined'&&phoneMap)||map;
  if(!m||!m.getCenter)return null;
  var c=m.getCenter();if(!c)return null;
  return {lat:c.lat(),lng:c.lng(),zoom:(m.getZoom&&m.getZoom())||NH_AREA_ZOOM};
}
function nhSanitize(raw){
  if(!raw||!Array.isArray(raw.steps)||!raw.steps.length)return null;
  nhCustomArea(raw); // 아래 area 게이트보다 **먼저** — 등록돼 있어야 custom 스텝이 산다
  var steps=[];
  for(var i=0;i<raw.steps.length&&steps.length<20;i++){
    var s=raw.steps[i]||{};
    if(NH_ACTIONS.indexOf(s.a)<0)continue;              // 모르는 액션은 버린다
    // 모르는 지역도 버린다. 남겨두면 지도가 안 움직인 채로 다음 스텝이 흘러가서
    // "여기 비어 있다" 같은 대사가 엉뚱한 화면 위에 뜬다 (조용한 거짓말).
    if(s.a==='area'&&!SEED_AREAS[String(s.v||'')])continue;
    steps.push({a:s.a,v:String(s.v||''),i:(s.i|0),
      say:String(s.say||'').slice(0,300),
      // e = 이모지(post) 또는 테마(postfeed) · n = 올린 사람 이름 (v2.1). 옛 콘솔은 안 보낸다.
      e:String(s.e||'').slice(0,12),n:String(s.n||'').slice(0,20),
      /* fast (v2.21, 콘솔 D117) — 콘솔의 "이 단계만 보기" 가 앞 단계를 화면 조립용으로
         지나갈 때 붙인다. 연출(터치 표식·타이핑·바운스)을 접고 **그 자리에서 커밋**한다 —
         ms 바닥을 기다리지 않아도 사슬(i:-1)이 안 끊긴다. 옛 콘솔은 안 보낸다. */
      fast:!!s.fast,
      concern:!!s.concern,key:!!s.key,
      /* 상·하한 (시연이 멈춰 보이지 않게). **하한은 50 이다** — 400 이었는데, 콘솔의
         "이 단계 화면 보기" 가 앞 단계를 빨리 감아 지나가는 데 그 바닥이 곧 대기시간이라
         여덟 단계짜리는 3초를 기다려야 했다. 사람이 짜는 값은 콘솔이 400 아래로 못 만들고
         (MIN_STEP_MS), 여기 50 은 0·음수를 막는 가드다. 비동기 커밋이 있는 write·ai 는
         콘솔이 따로 바닥을 지킨다(play-pacing 의 FAST_FLOOR).
         burst 만 15초까지 (v2.11) — ms 가 곧 "쏟아지는 시간" 이라 6초에 24개를 접으면
         등장이 겹쳐 개별 바운스가 안 보인다. 콘솔의 MAX_BURST_MS 와 같은 값. */
      ms:Math.min(Math.max(s.ms|0,50),s.a==='burst'?15000:6000)});
  }
  if(!steps.length)return null;
  // 콘솔이 보낸 seed 도 받아들이되 모양과 양을 자른다 — 임의의 콘텐츠 주입이 되지 않게.
  // 여기서 만든 것은 전부 nhTempIds 에 적히고 다음 재생 때 걷힌다.
  var seed=null,rs=raw.seed;
  if(rs&&typeof rs==='object'){
    // hold: 처음에 안 깔고 보관만 한다 — `drop` 단계가 그때 꺼내 띄운다 (v1.98).
    var reqs=(Array.isArray(rs.reqs)?rs.reqs:[]).slice(0,NH_MAX.req).map(function(r){
      r=r||{};
      return {q:String(r.q||'').slice(0,120),answer:String(r.answer||'').slice(0,120),
        answerIn:Math.min(Math.max(r.answerIn|0,0),20000),hold:!!r.hold,
        // mine:false = 남이 올린 Request (v2.18) — 키가 없으면 여태처럼 내 것이다.
        mine:r.mine!==false};
    }).filter(function(r){return r.q;});
    var sps=(Array.isArray(rs.spots)?rs.spots:[]).slice(0,NH_MAX.spot).map(function(s){
      s=s||{};return {t:String(s.t||'').slice(0,80),emoji:String(s.emoji||'💬').slice(0,4),
        temp:nhTemp(s.temp), // v2.4: 트렌드 온도 (빈 값이면 null → 깔 때 결정적 랜덤)
        at:nhLatLng(s.at),   // v2.24: 항목이 들고 온 제 자리 (앱에서 가져온 존의 컨텐츠)
        hold:!!s.hold};
    }).filter(function(s){return s.t;});
    var fds=(Array.isArray(rs.feeds)?rs.feeds:[]).slice(0,NH_MAX.feed).map(function(f){
      f=f||{};return {label:String(f.label||'').slice(0,40),desc:String(f.desc||'').slice(0,120),
        theme:String(f.theme||'').slice(0,16),name:String(f.name||'').slice(0,20),
        temp:nhTemp(f.temp), // v2.4
        img:nhImgSrc(f.img), // v2.10: 사람이 올린 사진 (없으면 테마 색으로 그린다 — 지면 카드와 같은 규칙)
        at:nhLatLng(f.at),   // v2.24: 항목이 들고 온 제 자리
        hold:!!f.hold};
    // 사진만 올리고 글은 안 적을 수 있다 (v2.10) — 카드가 곧 사진인 피드다.
    }).filter(function(f){return f.desc||f.label||f.img;});
    /* 타임딜 (v2.2) — 사람은 5칸만 적고 가격 3칸은 nhLayDeal 이 만든다.
       상한과 자르기는 콘솔의 toSeed 와 **같은 값**이어야 한다. */
    var dls=(Array.isArray(rs.deals)?rs.deals:[]).slice(0,NH_MAX.deal).map(function(d){
      d=d||{};return {e:String(d.e||'').slice(0,4),
        title:String(d.title||'').slice(0,40),
        shop:String(d.shop||'').slice(0,30),
        img:nhImgSrc(d.img), // v2.12: 사람이 올린 사진 (없으면 이모지로 그린다)
        /* 매장 페이지(v2.15)의 글·사진을 **콘솔이 정한다** (v2.17). 세 칸이 다 optional 이라
           안 주면 여태처럼 파생값(동네 이름·템플릿 문장·근처 피드 사진)으로 그린다.
           v2.15 는 nhLayDeal 에만 addr/desc 를 뚫어 놓고 여기서 걷어내고 있었다 —
           콘솔이 보내도 도착하지 않았다. */
        addr:String(d.addr||'').slice(0,60),
        desc:String(d.desc||'').slice(0,300),
        photos:(Array.isArray(d.photos)?d.photos:[]).slice(0,NH_MAX.dealPhoto)
          .map(nhImgSrc).filter(Boolean),
        pct:Math.min(90,Math.max(5,(d.pct|0)||20)),
        secs:Math.min(7200,Math.max(30,(d.secs|0)||1800)),
        hold:!!d.hold};
    }).filter(function(d){return d.title;});
    /* 상단 지면 (v2.2). theme 은 SEED_PAL 의 키 — 모르는 값이면 seedImg 가 cafe 로 떨어진다.
       상한은 콘솔의 MAX_SEED_PAGES 와 같은 값이어야 한다. */
    var pgs=(Array.isArray(rs.pages)?rs.pages:[]).slice(0,NH_MAX.page).map(function(p){
      p=p||{};return {tab:String(p.tab||'map').slice(0,8),
        theme:String(p.theme||'').slice(0,16),
        place:String(p.place||'').slice(0,20),
        title:String(p.title||'').slice(0,60),
        img:nhImgSrc(p.img), // v2.4: 사람이 올린 사진 (https/data 만 — 없으면 테마 색으로 그린다)
        hold:!!p.hold};
    });
    /* 무대 트렌드 존 (v2.21, 콘솔 D117) — 이름은 필수, 색은 #rrggbb 만, r 은 1(7칸)·2(19칸).
       상한·자르기는 콘솔의 toSeed 와 같은 값이어야 한다. */
    var zns=(Array.isArray(rs.zones)?rs.zones:[]).slice(0,NH_MAX.zone).map(function(z){
      z=z||{};
      return {name:String(z.name||'').slice(0,20),
        desc:String(z.desc||'').slice(0,80),
        color:(/^#[0-9a-f]{6}$/i.test(String(z.color||''))?String(z.color):''),
        img:nhImgSrc(z.img),
        temp:nhTemp(z.temp),
        r:((z.r|0)===2?2:1),
        /* 앱에서 가져온 존은 **제 자리를 들고 온다** (v2.24) — 없으면 여태처럼 무대가 편다.
           shape 는 그린 칸 좌표 그대로라, 있으면 모양까지 그대로 선다. */
        at:nhLatLng(z.at),
        radiusKm:nhZoneRadius(z.radiusKm),
        shape:nhShape(z.shape)};
    }).filter(function(z){return z.name;});
    /* 소리만 있고 깐 것이 하나도 없을 수 있다 (v2.23) — `post`·`postfeed` 는 무대 없이
       그 자리에서 컨텐츠를 만드는 액션이라, 그것만 쓰는 데모는 seed 가 소리 하나뿐이다.
       여기서 조건에 안 넣으면 그 데모의 소리가 조용히 사라진다. */
    /* 효과음 (v2.23 하나 → v2.25 여섯 자리, 콘솔 D122).
       문자열 하나로 오면 등장음이다 — 옛 콘솔이 보낸 시나리오가 소리를 잃지 않는다. */
    var sfxBank=null;
    if(rs.sfx&&typeof rs.sfx==='object'){
      var bank={};
      NH_SFX_KEYS.forEach(function(k){var u=nhSfxSrc(rs.sfx[k]);if(u)bank[k]=u;});
      if(Object.keys(bank).length)sfxBank=bank;
    }else{
      var one=nhSfxSrc(rs.sfx);
      if(one)sfxBank={pop:one};
    }
    /* 존 목록 카드 모양을 **이 데모가 고른다** (v2.26) — 트렌드 모드 지도 탭의 상단은
       지면 캐러셀이 아니라 존 카드 자리다(renderSummaryZones). 그 모양은 여태 관리자
       설정이라 시연마다 바꿀 수 없었다. 안 주면 앱 설정 그대로다. */
    var zcard=(ZONE_CARD_STYLES.indexOf(String(rs.zoneCard||''))>=0)?String(rs.zoneCard):'';
    if(reqs.length||sps.length||fds.length||dls.length||pgs.length||zns.length||sfxBank||zcard)
      seed={reqs:reqs,spots:sps,feeds:fds,deals:dls,pages:pgs,zones:zns,sfx:sfxBank,zoneCard:zcard};
  }
  /* 사람이 옮긴 자리 (v2.20) — 콘솔이 들고 있다가 재생마다 실어 보낸다. 여태 이 값은
     localStorage 뿐이라 **다른 PC 에서는 없는 값**이었다(같은 데모인데 자리가 달랐다).
     여기서는 모양만 자른다: 키는 `종류_번호`, 값은 좌표. 개수도 상한을 둔다. */
  var pos=null,rp=raw.pos;
  if(rp&&typeof rp==='object'){
    pos={};
    Object.keys(rp).slice(0,120).forEach(function(k){
      if(!/^[a-z]{3,6}_\d{1,3}$/.test(String(k)))return;
      var pv=rp[k]||{},la=Number(pv.lat),ln=Number(pv.lng);
      if(!isFinite(la)||!isFinite(ln)||Math.abs(la)>90||Math.abs(ln)>180)return;
      pos[k]={lat:la,lng:ln};
    });
  }
  return {id:String(raw.id||'inline'),name:String(raw.name||'시나리오').slice(0,80),
    persona:String(raw.persona||'').slice(0,80),concern:!!raw.concern,
    area:(SEED_AREAS[String(raw.area||'')]?String(raw.area):''),seed:seed,pos:pos,steps:steps};
}

function nhRun(id,reply,inline){
  var sc=inline?nhSanitize(inline):nhScenario(id);
  if(!sc){nhPost(reply,{type:'nh:error',message:inline?'시나리오 형식이 올바르지 않습니다.':'없는 시나리오: '+id});return;}
  nhScenarioKey=String(sc.id||id||''); // 사람이 옮긴 무대 자리의 저장 단위 (v2.3)
  nhPosRecv=(sc&&sc.pos)||{};          // 콘솔이 들고 있던 자리 (v2.20) — 이 회차에 쓴다
  nhStop();nhReset();
  nhCoinsMark(); // 이 회차가 시작하는 잔액 — 끝나면(다음 nhReset) 여기로 돌아온다 (v2.19)
  var token=++nhRunToken, i=0;
  nhSeedScenario(sc,token); // 이 시나리오가 성립하려면 화면에 있어야 하는 것부터 깐다
  nhPost(reply,{type:'nh:begin',id:sc.id,name:sc.name,total:sc.steps.length,concern:!!sc.concern});
  (function next(){
    if(token!==nhRunToken)return;            // 새 재생/중지가 들어오면 이 회차는 조용히 끝난다
    if(i>=sc.steps.length){nhPost(reply,{type:'nh:done',id:sc.id});return;}
    var st=sc.steps[i];
    var ok=nhAct(st,token)!==false; // 화면이 실제로 따라왔는가 (v1.94, 콘솔 D72)
    if(st.concern)nhConcernBeat();  // 막힌 순간이 화면에서도 한 박자 보이게
    // v 도 같이 보낸다 — 콘솔이 "지역 이동 · 방학·쌍문" 처럼 적으려면 값이 필요하다.
    // 앱 표본 시나리오는 콘솔에 정의가 없어서 이 메시지가 유일한 정보원이다.
    // ok 는 additive 다 — 옛 콘솔은 모르는 필드를 무시한다 (M16).
    nhPost(reply,{type:'nh:step',id:sc.id,i:i,total:sc.steps.length,
      say:st.say||'',concern:!!st.concern,key:!!st.key,action:st.a,v:st.v||'',ok:ok});
    i++;
    setTimeout(next,st.ms||1500);
  })();
}

function nhPost(target,msg){
  if(!target||!target.win)return;
  msg.source='now-here';
  try{target.win.postMessage(msg,target.origin);}catch(e){}
}

function initScenarioBridge(){
  window.addEventListener('message',function(e){
    if(EMBED_ORIGINS.indexOf(e.origin)<0)return;                 // 허용 오리진만
    var d=e.data;if(!d||typeof d!=='object'||d.source!=='persona-vc')return;
    var reply={win:e.source,origin:e.origin};
    // clean 은 additive 다 — 옛 콘솔은 모르는 필드를 무시하고, 새 콘솔은 이 값으로
    // "빈 무대를 요청했는데 앱이 안 비웠다"(= 앱 배포가 뒤졌다)를 화면에 드러낸다.
    if(d.type==='nh:list')nhPost(reply,{type:'nh:ready',version:nhVersion(),scenarios:nhScenarioList(),actions:NH_ACTIONS,areas:nhAreaList(),clean:IS_CLEAN_EMBED});
    else if(d.type==='nh:run')nhRun(d.id,reply,d.scenario);
    /* "지금 보고 있는 지도를 알려 달라" (v1.99). 콘솔이 지도 링크를 파싱하는 대신
       **사람이 임베드 안에서 직접 맞춘 화면**을 그대로 가져가는 길이다 — 단축 주소·
       카카오 링크처럼 못 읽는 주소가 많아서 좌표를 얻는 것 자체가 관문이었다. */
    else if(d.type==='nh:where'){var h=nhHere();
      if(h)nhPost(reply,{type:'nh:here',lat:h.lat,lng:h.lng,zoom:h.zoom});
      else nhPost(reply,{type:'nh:error',message:'지도가 아직 준비되지 않았습니다.'});}
    /* 멈추기는 **화면도 처음 상태로** 되돌린다 (v1.97.0).
       여태 토큰만 올렸다 — 대본은 멈추는데 그 회차가 만든 것(쓴 글·좋아요·깐 무대)은
       화면에 그대로 남아서, 다시 재생하기 전까지 세계가 지저분한 채로 있었다.
       콘솔은 진작부터 이걸 초기화로 알고 있었다(그쪽 "처음부터" 버튼이 nh:stop 을
       보내며 "화면도 처음 상태로" 라고 적어 뒀다) — 계약을 코드에 맞춘다.
       끝까지 본 회차(nh:done)는 안 건드린다: 데모의 결말이 곧 보여줄 것이라, 끝나자마자
       치우면 방금 만든 글을 볼 수가 없다. */
    else if(d.type==='nh:stop'){nhStop();nhReset();nhPost(reply,{type:'nh:stopped'});}
  });
  // 부모가 언제 붙을지 모르므로 준비되면 알린다 (시나리오 목록은 비밀이 아니다)
  if(window.parent&&window.parent!==window){
    try{window.parent.postMessage({source:'now-here',type:'nh:ready',
      version:nhVersion(),scenarios:nhScenarioList(),actions:NH_ACTIONS,areas:nhAreaList(),clean:IS_CLEAN_EMBED},'*');}catch(e){}
  }
}
function nhVersion(){var el=document.getElementById('app-version');return el?el.textContent:'';}

/* 임베드 부팅 — 인증을 건너뛰고 지도를 띄운 뒤 시드를 무음으로 깐다. */
function startEmbed(){
  document.body.classList.add('embed-mode','role-user'); // role-user: 관리자 UI 를 CSS 로 닫아둔다
  currentRole='user'; // ⚠️교차 M12: 글쓰기 앵커(addSpotContent)가 역할을 본다. 로그인은 여전히 없다
  nhEmbedIsolate();
  loadSettingsCache(); // 관리자가 적용한 스킨·설정을 데모의 기본값으로 (v2.3 — 지도 그리기 전에)
  loadRemoteSettings(); // 공개 설정 문서 — cross-site iframe(persona-vc)에서도 닿는 유일한 실시간 경로 (v2.5)
  hideAuthOverlay();
  bootMap();
  var tries=0;
  (function whenReady(){
    if(typeof mapReady!=='undefined'&&mapReady){
      // 빈 무대 임베드(?clean=1)는 시드를 안 깐다 — 화면에 뜨는 것은 시나리오가 깐 것뿐이다.
      if(!IS_CLEAN_EMBED)seedDemoData({silent:true}); // 경계 로드 후에 깔아야 dongAt 이 동 이름을 제대로 붙인다
      initScenarioBridge();
      return;
    }
    if(++tries>200){initScenarioBridge();return;} // 24초 넘게 안 되면 시드 없이라도 브리지는 연다
    setTimeout(whenReady,120);
  })();
}

(function(){
  var avEl=document.getElementById('auth-ver'),apv=document.getElementById('app-version'); // 스플래시에 버전 노출 (#app-version 단일 소스)
  if(avEl&&apv)avEl.textContent=apv.textContent;
  initAdminMenu(); // 관리자 페이지 대형 메뉴 팝업(admin.html 전용 · 서비스 페이지는 no-op)
  initSkinControl(); // [M15] 디자인 스킨 셀렉트(콘솔 전용 — 서비스 페이지엔 컨트롤이 없다)
  initPanelCollapse();
  initPhoneControls();
  initSidebarResize();
  initPhoneMenu();
  FACTORY_SETTINGS=snapshotSettings();initDraft(); // 공장 기본값 + 설정 편집 버퍼(DRAFT)
  loadFileDefaults(); // repo 백스톱 설정(settings-default.json) — 공장값 캡처 후 비동기 적용, 클라우드가 오면 그쪽 우선
  initSettingsExport();
  initApplyBar();initMiniPreviews();initBlockBars();renderMiniPreviews();
  loadFeed();loadRequests();initSocial();initFeaturePage();initLiveCamera();initFeedPost();initRequestAnswer();initFeedTools();initFeedPinch();initSummaryCollapse();initSocialManager();initDemoSeed();initContentPop();renderFeedColList();initContentTable();initTimeDeals();initStorePage();initOverview();initPinViewUI();initUiScaleUI();syncCoinUI();initSeedGen();
  window.addEventListener('resize',layoutTabPages);
  setInterval(function(){if(typeof fieldRequests!=='undefined'&&fieldRequests.length)renderRequestMarkers();},30000); // Request 10분 타임아웃 경과 반영(마커+드로어)
  setInterval(function(){try{tickReqRemain();}catch(e){}},1000); // Request 남은 시간(분/초) 1초 갱신 — 텍스트만(경량)
  initInstallPrompt();
  if(typeof CONFIG==='undefined'||!CONFIG.GOOGLE_MAPS_API_KEY){var it=document.getElementById('info-text');if(it)it.textContent='⚠️ config.js에 API 키를 설정해 주세요.';hideMapLoading();hideAuthOverlay();return;}
  if(IS_EMBED){startEmbed();return;} // [M16] 임베드: Firebase 없이 시드로 띄운다 (로그인 없음)
  initAuth();
})();
