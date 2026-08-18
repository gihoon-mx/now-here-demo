# MODULES — now-here-demo 개발 모듈 맵

> **세션별 모듈 단위 작업의 기준 문서.** 새 세션은 `WORKLOG.md` → 이 파일 순으로 읽고,
> 지정된 모듈의 코드 앵커(함수/섹션)만 수정합니다. 시각화 버전은 [dev.html](dev.html) (개발 관리 페이지).

## 🧱 모듈 단위 세션 규칙

1. **한 세션 = 한 모듈** 원칙. 세션 시작 프롬프트에 모듈 ID를 명시한다 (프롬프트 템플릿은 dev.html에서 복사).
2. **코드 탐색은 grep만** (크레딧 절약 핵심): `grep -n "\[M07\]" app.js` → 그 모듈의 섹션 시작 줄들. 앵커 함수명 grep으로 보조. **파일 통독 금지.**
3. **다른 모듈 코드는 수정하지 않는다.** 불가피한 교차 수정(공용 헬퍼·CSS 토큰 등)은 최소화하고 WORKLOG 항목에 `⚠️교차: M##` 로 명시한다.
4. 공용 파일은 예외적으로 항상 수정 가능: `index.html`(버전·마크업 앵커), `WORKLOG.md`, `MODULES.md`, 버전 3곳 동기화.
5. 작업 완료 시: 버전업(3곳) → WORKLOG 갱신 → **이 파일의 모듈 상태/최근 버전 갱신** → **dev.html(모듈 데이터+`data-app-ver`)·diagram.html(`data-app-ver`, 구조 변경 시 블럭도) 갱신**(소개 덱은 제외·지연 허용) → commit·push.
6. **push 전 `node tools/check.js`** — 버전 3곳 동기화·dev/diagram 스탬프 일치·app.js 문법을 검사. 배포 워크플로우(pages.yml)에서도 실행되어 실패 시 배포가 중단된다.
7. 물리적 파일 분리(app.js 분할)는 별도 결정 전까지 하지 않는다 — 논리 모듈(섹션 태그 경계)로 운영.
8. **페이지 분리(v1.65)**: `index.html`=서비스(폰 앱, `PAGE_MODE='app'`) / `admin.html`=관리자(PC 지도+대형 메뉴 팝업, `'admin'`) — 같은 app.js/style.css 공유, `IS_APP_PAGE`/`IS_ADMIN_PAGE`로 분기. **공통 요소(폰 화면 마크업·모달·설정 섹션·색상 트리거)를 고치면 두 HTML 모두 반영**(check.js가 버전 동기 강제).

## 🤝 공유 상태 계약 (전역 변수 소유권)

전 코드는 전역 함수 기반(호이스팅)이라 **로드 순서 리스크는 없음**. 대신 아래 전역은 소유 모듈만 쓰기(재할당·구조 변경)하고, 다른 모듈은 **읽기 전용**으로 쓴다:

| 전역 | 소유 | 비고 |
|---|---|---|
| `map` `phoneMap` `currentMode` `originalGeoJson` | M01 | 모드 전환은 `switchMode()` 경유만 |
| `phoneLens` `phoneSelectedZoneId` `phoneSelectedDongKey` | M02/M03 | 렌즈·선택 상태 |
| `trendZones` | M03 | 존 CRUD 함수 경유 |
| `spotMessages` `adminSpots` `demoSpots` | M04 | `rebuildSpots()`로 재구성 |
| `feedItems` `feedLikes` `feedScope` `feedTypes` | M05 | 추가/수정은 `feedAdd`/`feedUpdate` 경유 |
| `socMsgs` `socRoomList` `socLiveMsgs` | M06 | |
| `fieldRequests` `reqAnsSeen` | M07 | |
| `currentTab` | M09 | 전환은 `switchTab()` 경유만 |
| `newsItems` | M10 | |
| `styleConfig` `spotConfig` `localLabelConfig` | M11 | 적용은 설정 블록 경유 |
| `currentUser` `currentRole` `fbAuth` `fbDb` `cloudData` | M12 | 로그인 상태는 읽기만 |

## 🛡 안전 규칙 (전 모듈 공통)

- **공용 앵커 시그니처 동결**: 다른 모듈이 호출하는 함수(`renderDrawerDemo` `switchTab` `switchMode` `renderFeed` `renderNews` `cloudSave` 등)는 시그니처를 바꾸지 않는다. 인자 추가는 **optional**로만.
- **카메라는 `map` 을 움직인다** (v1.70): 카메라는 PC 지도 → 폰 지도 **단방향 미러**다(`map.center_changed`/`zoom_changed` → `phoneMap.setCenter/setZoom`). `phoneMap` 만 움직이면 `map` 의 다음 idle 이 되돌려 놓으므로, 위치를 옮길 때는 반드시 `map` 을 움직여 미러를 태워 보낸다. 또 **`panTo` 는 투영이 없으면 조용히 무시된다** — 지도가 숨겨져 있으면(임베드의 PC 지도) `getBounds()` 가 없다. 카메라 이동은 `goMapCam()` 을 거친다(투영 없으면 `setCenter` 폴백).
- **M00 공용 헬퍼는 수정 금지, 추가만**: `escHtml` `hexToRgba` `haversineM` `compressNews` `timeAgo` `MapLabel` `emoji 픽커` 등 — 바꾸면 전 모듈에 파급.
- **Firestore 스키마는 additive-only**: 문서에 필드 추가는 OK, 기존 필드 의미 변경·삭제는 금지 (다른 PC의 구버전 클라이언트가 라이브에 붙어 있을 수 있음). `firestore.rules` 변경은 콘솔 배포 필요 — WORKLOG에 ⚠️ 표기.
- **CSS**: style.css의 `:root` 토큰(M15)은 값 변경 금지(추가만). 모듈별 컴포넌트 클래스(`.rq-*` `.tz-*` `.aip-*` `.fc-*` `.sp-*` 등)만 수정.
- **SVG `<text>`에 이모지 금지** (v1.57 Twemoji): 전역 이모지 치환이 `<img>`를 삽입하므로 SVG 내부 텍스트에 이모지가 있으면 라벨이 깨진다(옵저버는 svg 내부를 스킵하지만 넣지 말 것). CSS `content:'이모지'`도 치환 불가 — 배경이미지(twemoji svg URL) 사용.
- **지도 오버레이 draw()는 앵커 픽셀을 `_ax/_ay`에 저장** (v1.59 declutter): SpotBubble·FeedThumb·ReqPin은 `fromLatLngToDivPixel` 결과를 `this._ax/_ay`에 남겨 `declutterBoxes`(M00)가 겹침 계산에 쓴다. 새 지도 마커 오버레이를 추가하면 같은 규약을 따르고 `declutterMarkers()` 대상에 포함할 것. 말풍선류는 `_dir`(up/down/left/right)로 방향을 받는다.
- **탭 UX 통일 규칙** (v1.62): **컨텐츠**(스팟/피드/Request)는 지도 핀·드로어·피드 리스트 어디서 탭하든 **상세 팝업**(`openContentPop`) — 지도 이동은 팝업 안 📍(`cpopGoMap`)로만. **지역**(동/존) 탭=포커스 이동(핀 고정). 지면 캐러셀=스와이프 열람 전용(클릭 액션 없음). 새 컨텐츠/진입점을 추가하면 이 규칙을 따를 것.
- **포커스 규칙** (v1.62): 선택 핀 고정은 드래그로 센터가 영역을 벗어나면 자동 해제(`autoReleaseFocus`) → 자동 렌즈가 센터 추종. 지도 탭 선택은 화면에 지역/존 3개 이상일 때만(`visibleRegionCount`/`visibleZoneCount`) — 재탭 해제·드로어/리스트 선택은 게이트 없음.

## 📦 모듈 레지스트리

| ID | 모듈 | 상태 | 범위 | 주요 앵커 (grep) | 파일 | 최근 |
|---|---|---|---|---|---|---|
| M00 | utils 공용 헬퍼 | 동결 | 전 모듈 공용 — **수정 금지·추가만** | `escHtml` `hexToRgba` `haversineM` `compressNews` `timeAgo` `MapLabel` `buildEmojiPicker` `initTwemoji` `heatColor` `heatTOf` `declutterBoxes` `MapLabel(줌 스케일·위치보정)` `contentScale`(v2.16 지면 고정 배율) `labelScale`(이름표 전용 0.7~1.6) `contentDot`(점 전환·크기 이어짐) `paintTagCell`/`reactPopOn`(v2.47 미니 라벨 칸·팝 — 이모지와 숫자를 나눠 담고 각자 제 칸 위에서 튄다) `tagBg`(라벨 톤 단일 출입구) | app.js | v2.47 |
| M01 | core-map 지도 코어 | 안정 | 지도 초기화·GeoJSON 경계·모드 전환·메인 지도 이벤트 | `nhCamTo`/`nhCamGo`/`nhCamCancel`/`nhCamSeq`(v2.36 카메라 엔진 — 프레임마다 moveCamera·미러 잠금·끝에서 한 번 착지, 멀면 아크) `goMapCamRaw` `initMap` `applyGeoJsonToMap` `switchMode` `refreshMapStyles` `chaikinSmooth` | app.js | v2.36 |
| M02 | lens 포커스 렌즈 | 안정 | 베이직/트렌드 마스크 렌즈·포그·전환 애니 | `updatePhoneLens` `lensBuild` `lensApply` `holeRing` `phoneLens` `autoReleaseFocus` | app.js | v1.62 |
| M03 | zones 트렌드 존 | 활성 | 헥사 그리드·존 CRUD·존 카드/리스트·병합 아웃라인·라벨 표시 토글·채움 투명도 | `generateHexagons` `trendZones` `zoneOutlineLoops` `makeZoneCard` `buildZoneScroll` `remapZoneToGrid` `sortedZonesForList` `visibleZoneCount` `zoneLabelsShown` `zoneFillA` `--zone-c`/`data-temp`(v1.90 스토리 서클) `ZONE_CARD_STYLES`(v2.26 'page' 지면형 · **v2.27 'circle' 원형 썸네일** — `#cp-zones.circle` 전 스킨 공용, 캐러셀 여백=지면과 동일+블리드) · **v2.29 캡션 행 순서**(설명이 위 · 이름·온도가 항상 맨 아랫줄) | app.js | v2.29 |
| M04 | spots 스팟 메시지 | 안정 | 스팟 버블(자유 방향·겹침 방지)·컴포저·편집/드래그·워드클라우드 (모드 컬러: 베이직 무채색/트렌드 온도)·개별 색 투명도 | `SpotBubble` `SpotComposer` `renderSpots` `spotsInFocusedRegion` `canEditSpot` `declutterMarkers` `openSpotEditor` `spotComments(뱃지)` | app.js · **미니 라벨**(v2.47 — 숫자 흰색·연한 톤 `tagBg`, 하트/의견이 각자 칸 위에서 튄다) · **컴포저 hold**(v2.48 — `SpotComposer.commit({hold:true})`, 무대만 쓴다) | v2.62 |
| M05 | feed 피드 | 활성 | 피드 탭·그리드·썸네일 핀(스팟과 동일 줌 스케일·온도 링/뱃지)·클러스터·좋아요·업로드 · **지도 아이콘 크기 분리 옵션**(v2.3 — `feedIconSize` 0=스팟 크기 따름, 클라우드 동기) | `renderFeed` `feedEntriesScoped` `FeedThumb` `clusterFeedPins` `toggleLike` `feedAdd` `initFeedTools` `staticMapUrl` `fc-body`(새 스킨 본문) `hidden`(v1.88 숨김 필드) `feedIconBase` `FeedThumb._tap`/`_paintLikes`/`.fp-heart`(v2.34 지도 피드 더블탭 하트) `feedPinsFor` `mapDblGuard`/`guardDblClick`(v2.34 더블탭이 지도 줌으로 안 새게) `heartPopOn` `feedPinKey`/`syncFeedPins`/`FeedThumb._adopt`(v2.16 핀 재사용 — 지우고 새로 만들지 않는다) | app.js · **미니 라벨**(v2.47 — `--heat-a` 로 트렌드 톤도 연하게) | v2.47 |
| M06 | social 소셜 | 활성 | 소셜 탭 **Our/My Talk 2세그먼트**(목록→대화 2단)·방 카드·liveChat — 방 저장 키(`local:`/`topic:`/`private:`)는 불변 | `renderSocial` `socRoomsFor` `socRoomLast` `renderRoomList` `socRoomList` `roomMsgs` `initSocialManager` | app.js | v1.91 |
| M07 | request 현장 Request | 활성 | Request 등록(**v2.18: 지도 위 컴포저 카드** — prompt() 제거)·AI Agent 수신 카드(**v2.18 시안: 검정 필+🪙500 · 📷사진 제출·💬Chat 참여**)·내 Request 답변 보기·전용 핀(ReqPin)·삭제·**남의 Request 에 답하면 코인 적립 연출** | `openRequestComposer` `ReqComposer` `commitFieldRequest` `showReqBubble` `reqNearMe` `reqActive` `isMyReq` `answerRequest` `liveRequests` `ReqPin` `deleteRequest`·핀 줌 스케일(스팟 동일) `reqRemainLabel` · **코인**(`REQ_COIN` `myCoins` `addCoins` `syncCoinUI`) · **리워드 분리**(v2.27 — 즉시 적립+coinFly 삭제, `REQ_REWARD_MS` 뒤 `showRewardBubble`(agent 말풍선)+`coinBurst`, 임베드는 'reward' 액션이 시점·문구를 정한다) · **v2.29 지급이 그 Request 를 닫는다**(`reqPopAway` `lastAnsweredReqId` `rq.rewarded` · CSS `.rp-pop` — 핀이 펑 터지며 사라지고 데이터는 남는다) · **v2.29 보낸 쪽 안내 삭제**(리워드 말풍선과 중복) · **v2.30 Request 팝업이 뜨면 agent 말풍선을 걷는다**(`showReqBubble`·`openContentPop('req')` → `hideAiBubble` — 둘은 우하단 같은 좌표에 겹쳐 떴다) | app.js · **답글 라벨**(v2.47 — `_paintAns` 가 오를 때 튄다, 첫 페인트는 제외) · **답변자 이름**(v2.48 — `nhAnsPlan` 3번째 칸) · **채택은 popclose 를 기다린다**(v2.48 `nhAfterClose`) · **핀 폭죽**(`reqSparkBurst`) | v2.48 |
| M08 | ai-agent AI 에이전트 | 활성 | AI 버튼·상황 프리셋·**트렌드=선글라스 무지개 발광(v2.15 — 온도 흐름·웜톤 재도색 삭제)**·**원격 에이전트(persona-vc)** | `initAiAgent` `aiPresetPool` `updateAiVisual` `AI_PALETTE(단일 팔레트)` `sh-lens`(CSS) `aiMapSummary` `aiChatAnswer` `aiAgentOn` `aiAskRemote` `aiContextSnapshot` `aiChatHistory` · **v2.30 말풍선 단일 funnel**(`aiSay` `hideAiBubble` `nhBubbleMs` — 여섯 자리로 흩어져 있던 textContent+setTimeout 을 한 손으로. 유지 시간 우선순위는 좁은 규칙부터: 액션 고유값(`coupon` 의 `e`) → 단계의 `bh` → 그 자리 기본값) · **v2.29 배경 정지**(`aiHeatFlow` 삭제 — 정지한 115° 두 색 사선만, 스킨 두 벌 재선언도 정지) | app.js · config.js | v2.30 |
| M09 | shell 폰 셸 | 안정 | 폰 미러·탭 전환·하단 네비(스와이프)·**드로어(둘러보기 전용)**·헤더·페이지 모드 분기·카메라 이동 | `initPhoneMirror` `switchTab` `layoutTabPages` `initPhoneMenu` `renderDrawerDemo` `setDrawerView` `dsSection` `openContentPop` `cpopGoMap` `goMapCam` `PAGE_MODE` `setNavActive`(switchTab 내부) · **보기 토글**(`boundaryShown` `reqCardShown` `setBoundaryShown` `setReqCardShown`) · **UI 크기**(v2.27 — `uiScale` `applyUiScale` `initUiScaleUI`, 모드 토글·네비 transform scale, 기본 88/90%) · 지도 롱프레스 **마우스** 지원(v2.27 `attachAddGestures`) · **여기에 추가 자리표**(v2.29 — `AddPin` `addPinShow` `addPinHide` `feedDropAt` `feedDropArm`, 사진·지면도 꾹 누른 자리에 놓인다) | app.js | v2.29 |
| M10 | news 요약 지면 | 안정 | 헤더 아래 캐러셀 지면·카드 3버전·접기·메타 줄(거리·시간) | `renderNews` `newsItems` `initContentPage` `initSummaryCollapse` `cp-frame` `feedSummaryItems` `cps-meta` · **지역 Overview**(`openOverview` `ovChipData` `initOverview`) · **무대가 깐 카드**(`stage` 표시 — `allFeedEntries` 가 건너뛴다) | app.js | v2.2 |
| M11 | settings 관리자 설정 | 활성 | 설정 블록·드래프트/적용·미니 프리뷰·관리자 메뉴 대형 팝업·색상 팝업(팔레트+투명도) — **admin.html 에만 있다**(서비스 페이지에는 없음) | `BLOCK_DEFS` `MINI_RENDER` `initDraft` `initBlockBars` `syncSettingsUI` `initAdminMenu` `openAdmPanelFromUrl` `jumpToSetting` `openColorPopup` `makeColorControl` `initSettingsAccordion` · **전체 컨텐츠 표**(`ctEntries` `renderContentTable` `initContentTable` `ctSetHidden` `ctMoveZone` `ctDelete` `ctKind` `ctSel`) · **지도 컨텐츠 표시**(v2.15 — `mapPinView` `mergePinView` `savePinView` `pinScale` `renderAllPins` `syncPinViewUI` `initPinViewUI`, s-pins 패널·즉시 적용·additive 클라우드 키, `#feed-icon-size` 는 s-view→s-pins 이사) · **UI 크기**(v2.27 — s-view 에 `ui-mode-scale`/`ui-nav-scale`, additive `uiScale`) | app.js · **지도 요소 스타일**(v2.47 — 가게 이름표 크기·글자색·배경색·투명도 `mapPinView.name`, Request 아이콘 색(인라인)·투명도, 미니 라벨 톤 `mapPinView.tag`, `applyPinStyle` CSS 변수 한 벌) | v2.47 |
| M12 | auth-sync 인증·동기화 | 안정 | Google 로그인·역할·스플래시·클라우드 실시간 동기·관리자 페이지 게이팅 | `initAuth` `showAuthOverlay` `liveOn` `loadSharedContent` `cloudSave` `grantAccess` + `firestore.rules` | app.js | v1.65 |
| M13 | seed 데모 시드 | 활성 | 고정 4지역 시드(채우기/비우기) + **지역 시드 생성기**(포커스 지역 Places 검색 → AI 문구 → 종류 선택·수량·반경) + **그룹 관리**(지도 이동·숨김·삭제) | `SEED_FEED` `SEED_IMG` `SEED_AREAS` `seedFlat` `initDemoSeed` `clearDemoData` · **생성기**(`seedGroups` `sgSearchPlaces` `sgAskAgent` `sgFallbackPlaces` `sgGenerate` `sgCommit` `sgGroupDelete` `sgGroupSetHidden` `renderSeedGroups` `SG_TPL` `SG_THEME`) | app.js | v1.93 |
| M14 | pages 정적 페이지 | 활성 | 관리자 페이지(v1.65 신설)·소개 덱·다이어그램·개발 관리 — **콘솔 크롬은 v3 스킨을 함께 탄다**(v1.87) | `initAdminMenu`(M11 공유) `body[data-skin="v3"].page-admin` | admin.html deck.html diagram.html dev.html | v1.87 |
| M15 | tokens 디자인 토큰 · 스킨 | 활성 | CSS 변수·프로스트/글래스 공통 문법 + **폰 셸 스킨 3종(legacy / new=v2.0 / v3=v3.0, 기본)** — v3 는 석촌동 에셋 기준 재설계(웜 오프화이트+코랄·°C 지표) | `:root` `--acc` `--frost` `--glass-*` · `appSkin` `applySkin` `setAppSkin`(v1.84: 마크업까지 가르므로 재렌더) `initSkinControl` `body[data-skin]` `APP_SKINS` `--nk-*` `--v3-*` · **스킨을 나르는 세 경로**(v2.3.1 — 클라우드 `applyCloudData` · 로컬 캐시 `loadSettingsCache` · repo 파일 `loadFileDefaults`, 셋 다 `applyExtraSettings` 로 같은 범위) · **콘솔 크롬 정리**(v2.15 — 토큰 승격 `--v3-hover/tabface/danger-bg/danger-bg2/dirty`, 재도색 누락 모달·버튼·입력 보완, 토글 132px 버그 수정, `.num-in`) · **팝업 문법 통일**(v2.27 — 추가 메뉴·프로필 메뉴·cpop 을 req-bubble 프로스트·5cqw 로 · **v2.29 뒷배경까지**: `#content-pop` 오버레이 스크림 제거 · 딜 시트 스크림 제거+유리 · 스킨 두 벌의 불투명 재선언도 유리로) · v3 접기 버튼 여백·캐러셀 이중 패딩 보정(v2.27) | style.css · skin-new.css · **skin-v3.css** · app.js | v2.29 |
| M17 | deals 매장·타임딜 | 활성 | **v2.58 (콘솔 D189): ⏰ 원형 핀을 없애고 매장·타임딜을 한 물건으로** — 지도 위의 가게는 <code>DealLabel</code> 하나이고, 딜은 그 이름표의 강조색·맥동(<code>.dl-live</code>)과 미니 라벨(<code>.dl-tag</code>: <code>⏰타임딜</code> + <code>lab</code> 이 고른 남은시간/할인율)이다. 라벨은 컨텐츠의 <code>.spot-tag</code> 와 같은 문법(<code>paintTagCell</code>·<code>tagBg</code>). <code>dealLabelTick</code>(1초)이 시간을 줄이고 끝나는 순간 강조를 걷는다 · <code>dealShown</code> 이 넓어져 딜이 끝나도 가게는 남는다 · <code>dealName</code> 상호→제목→기본값 · nhSanitize 필터 = 상호 or 제목 · burst <code>dealpin</code> 제거. 아래는 그 전의 이력이다 — 바텀시트(할인율·가격·재고·`mm:ss` 티커·쿠폰/공유)·콘솔 표 편입 — **자동 시드 폐지(v2.3)**: 딜은 무대(`nhLayDeal`)·시드 생성기가 명시적으로 깐 것만 뜬다 (옛 `dl_N` 시드는 `loadDeals` 가 걸러냄) | `timeDeals` `DealLabel` `dealLabelTick` `dealName` `renderDealMarkers` `openDealSheet` `closeDealSheet` `syncDealSheet` `dealRemain` `dealActive` · **무대 딜**(`nhLayDeal` — `seed:false` 라 실제로 줄어든다, v2.15 optional `addr`/`desc`, **v2.17 `photos[]`(최대 `NH_MAX.dealPhoto`=9) + `nhSanitize` 통과** — v2.15 는 nhLayDeal 에만 뚫려 있어 콘솔이 보낸 `addr`/`desc` 가 sanitize 에서 걷혔다) · **매장 전용 페이지**(v2.15 — 핀 탭=`openStorePage`(#store-page z-29, index/admin 양쪽 마크업) `closeStorePage` `syncStorePage` `initStorePage` `storeFeedPhotos`(v2.17 — `d.photos` 가 있으면 **그것만**) `storeChipData`, 쿠폰받기=딜 시트 z-30 이 위로. 임베드 pop v:'deal' 도 페이지, popclose·sweep 이 닫음. **액션 4버튼은 언제나 한 줄**이고 CTA 하이라이트는 잉크다(v2.17) · **쿠폰 수집 연출**(v2.29 `couponFly` — v2.31 부터 **누른 `쿠폰 받기` 버튼에서 나와 하단 AI 버튼으로** 들어간다. 부르는 쪽이 시트를 닫기 **전에** claimDeal 을 부르고 버튼 요소를 `opts.from` 으로 넘긴다 — couponFly 가 그 자리에서 rect 를 읽고 티켓을 `.phone-screen` 에 붙이므로 다음 줄에서 닫아도 된다. 받는 링은 `.pn-ai.cf-catch::after`(2.2cqw 상한 — 그보다 크면 `overflow:hidden` 에 잘린다). `coupon e:0` 에서도 난다) · **시트 유리화·가운데 팝업**(v2.29~v2.30.1 — 스크림 제거, `dealSheetFrame` 이 보이는 지도에 맞춘다, `.ds-scroll` 이 가운데만 굴려 `쿠폰 받기` 가 늘 눌린다. 매장 전용 페이지는 불투명 그대로) · **끌어 옮기기**(v2.30.1 `moveDeal` — v2.43 부터 이름표가 든다) | app.js · **딜↔매장 연동**(v2.49 — `of` 로 붙이면 매장 항목이 딜로 승격. v2.58 통합 뒤 콘솔은 이 값을 더 안 쓴다) · **딜 팝업 값 줄**(v2.62.1 — 뱃지는 종류만(`dealOfferLabel(d,brief)`), 값·재고는 `nowrap;flex:none` 이라 안 접힌다. 줄어들 칸은 뱃지 하나) | v2.62.1 |
| M16 | scenario-bridge 임베드·시나리오 | 활성 | `?embed=1` 무로그인·무상태 부팅 / postMessage 시나리오 재생 / 지역 이동 + **실제 쓰기 동작**(글·좋아요·답변·채팅·AI) / **시나리오별 무대(seed) 주입·회수 — pop·like 는 그 무대에서만 고른다** / 카메라 연출(zoom·focus) | `nhViewK`/`nhZ`/`nhUnZ`/`nhViewSync`(v2.35 기준 폭 390 대비 줌 정규화 — 칸이 커져도 같은 지리 범위·같은 컨텐츠 비중) `IS_EMBED` `startEmbed` `nhEmbedIsolate` `NH_SCENARIOS` `NH_ACTIONS` `nhRun` `nhAct` `nhReset` `nhSweepTemp` `nhSeedScenario` `nhSpread` `nhGoHome` `NH_HOME_AREA` `nhTempIds` `nhOwn` `nhAt` `nhStore` `nhWriteSpot` `nhChat` `nhAi` `nhScope` `nhPick` `nhAreaKey` `nhAreaList` `nhSanitize` `nhZoom` `nhFocus` `nhCenter` `nhScrollTarget` `nhAddHold`(v2.43 팝업 붙잡기=단계의 30%) `nhAnsPlan`(v2.43 답변 계획) `nhAnswers`/`nhAdopt`(v2.41 답 도착·채택) `nhAfterMenu`(v2.41 팝업 뒤에 만든다) `paintReactTag`(v2.40 리액션 미니 라벨) `nhReact`/`nhCommentAdd`(v2.40 하트+의견) `contentComments` `NH_NAT`/`nhRateSet`/`nhT`(v2.39 단계의 시간 = 연출의 속도) `nhFeedTabEl`(v2.38 사진이 앉을 자리) `NH_BURST_SPREAD`/`nhBurstSpread`(v2.38 밀집도) `nhShutter`/`nhPhotoFly`(v2.37 찰칵) `addMenuHoldFor`(v2.37 팝업이 손보다 늦게 닫힌다) `NH_BURST_PHOTOS`(v2.37 테마별 실사진) `nhCustomArea` `nhHere` `nhPostSpot` `nhPostFeed` `nhHeld` `nhDrop` `nhLaySpot` `nhLayFeed` `nhLayReq` `nhLayDeal` `nhLayNews` `nhPage` `IS_CLEAN_EMBED` `initScenarioBridge` `EMBED_ORIGINS` · **옮긴 자리 기억**(v2.3 — `NH_POS_KEY` `nhScenarioKey` `nhPosGet` `nhPosSave` `nhPosNote`: 임베드에서 무대 핀을 끌면 다음 재생도 그 자리, 시나리오 id 단위 · **v2.20 저장소는 콘솔이다** — `nhPosRecv`(`nh:run` 의 `pos`)가 먼저고 옮기면 `nh:pos` 로 알린다. localStorage 는 폴백) · **설정 캐시**(v2.3 — `SETTINGS_CACHE_KEY` `saveSettingsCache` `loadSettingsCache`: 관리자 적용 스킨·설정이 같은 오리진 임베드의 기본값) · **reward 액션**(v2.27 — answer 와 분리된 리워드 지급 연출, v=말풍선 문구·콘솔 PLAY_ACTIONS 동기) · **하트·올리는 손**(v2.34 — `nhHearts`/`nhHeartAdd`/`nhLikeRepaint`/`nhLikeOverlays` 와 `nhAddMenu`/`nhAddTap`/`nhAddSpot`/`nhAddReq`/`nhAddFeedCard`/`nhAddPinMoved` — ⚠️ v2.45 정정: 자리표 드래그(`nhAddPinMoved`)는 `.add-pin{pointer-events:none}` 때문에 **v2.45 까지 도달 불가 코드였다**. 실제로 끌 수 있게 된 것은 v2.45: `like` 는 사용자의 더블탭, `hearts` 는 남의 손, `addmenu`+네 항목은 컨텐츠를 올리는 손. 추가 팝업 자리는 `addat_<순번>` 으로 기억한다) | app.js · **nh:peek**(v2.47 — 방금 만든 매장을 지도 한가운데 임시로 세운다 `nhPeek`/`nhPeekClear`/`nhPlaying`) · **팝업은 popclose 가 닫는다**(v2.48 — `nhOnClose`/`nhAfterClose`/`nhRunAfterClose`: 컴포저는 등록해도 남고, 닫힐 때 말풍선·핀 걷기가 온다. nhReset 은 실행 않고 버린다) · **매장 보관함 분리·burst store**(v2.49 — `nhHeld.store`, `drop v:"store"`) · **burst 가 지도의 여섯 종류를 다 쏟는다**(v2.51 — `NH_BURST_REQS`, `nhBurstKinds` 에 `req`·`dealpin` 추가: 타임딜의 ⏰ 핀과 이름표를 갈라 고른다. 콘솔 check-contract 가 이 어휘를 대조한다) · **소리는 이 서비스의 것**(v2.52 — `NH_SFX_DEFAULT`(저장소 `sfx/*.wav`) `appSfx` `nhSfxApp` `nhSfxAppSet` `nhSfxMute` `syncSfxUI`/`initSfxPanel`: 관리자 콘솔에서 한 번 정하면 모든 데모와 실제 앱이 같은 소리. 데모의 `seed.sfx` 는 그 자리만 덮어쓴다. nhSfxPlay 가 은행이 비면 늦게 채우므로 재생 밖에서도 운다) | v2.61 |

상태: **안정**(변경 적음) / **활성**(현재 개발 중) / **계획**(예정)

## 🔗 주요 의존 관계

- M02 lens · M03 zones · M04 spots · M05 feed → **M01 core-map** (지도 인스턴스·좌표 헬퍼)
- M05 feed · M06 social · M07 request → **M12 auth-sync** (live 컬렉션 리스너·hasLive)
- M07 request · M08 ai-agent → 서로 연동 (AI 버블/팝업 공유)
- 모든 UI 모듈 → **M15 tokens** (색·프로스트 문법)
- M09 shell 은 각 탭 모듈(M05/M06)의 진입점 (switchTab)
- **M16 scenario-bridge → M01·M09·M13** (읽기·호출 전용). 자기 화면 로직을 만들지 않고
  동결 앵커만 부른다 — 앵커 시그니처가 바뀌면 시나리오가 조용히 멈춘다.

## 🎬 M16 임베드 계약 (Persona VC 콘솔 ↔ Now Here)

콘솔이 `index.html?embed=1` 을 iframe 으로 띄운다. **임베드는 Firebase 를 붙이지 않는다** —
시연은 매번 같은 화면이어야 하는데 실데이터는 그날 달라지고, 로그인·allowlist·규칙이 전부
시연 중 실패 지점이 되기 때문이다. 대신 M13 시드를 무음(`seedDemoData({silent:true})`)으로 깐다.

| 방향 | 메시지 |
|---|---|
| 콘솔 → 앱 | `{source:'persona-vc', type:'nh:list'}` · `{type:'nh:run', id}` · `{type:'nh:run', scenario:{...,seed,pos}}` (seed 의 zones 는 `at`·`shape`·`radiusKm`, spots·feeds 는 `at` 을 들 수 있다 — v2.24) · `{type:'nh:stop'}` |
| 앱 → 콘솔 | `nh:ready{version,scenarios[],actions[],areas[]}` · `nh:begin{id,name,total,concern}` · `nh:step{i,total,say,concern,key,action,v,ok}` · `nh:done{id}` · `nh:error{message}` · `nh:pos{scenario,key,lat,lng}`(v2.20 — 사람이 핀을 옮겼다. 저장은 콘솔이 한다) |

**프레임 비율은 콘솔이 책임진다** (v1.70): 앱은 `?embed=1` 에서 받은 프레임을 그냥 꽉 채운다
(`.phone-screen{width:100%;height:100%}`). v1.69 까지는 앱이 폰 폭을 높이에서 계산해서,
프레임이 그보다 넓으면 남는 폭이 전부 무대 배경으로 보였다. **양쪽이 다 계산하면 반드시
어긋나므로 계산하는 자리를 하나로 모았다** — 콘솔이 iframe 을 `aspect-ratio:9/19.5` 로 준다.
라운드·그림자도 콘솔 래퍼가 들고 있어서 앱에서는 뺀다.

**`nh:step` 은 `ok` 를 같이 보낸다** (v1.94, 콘솔 D72): 앵커·대상이 없어 화면이 실제로
따라오지 못한 스텝이 `ok:false` 다. 그전에는 실패를 `console.warn` 으로 삼키고 스텝
메시지를 그대로 흘려서, 화면은 멈췄는데 콘솔의 대사·기록은 성공한 사용자를 그렸다.
additive 필드라 옛 콘솔은 무시하고, 옛 앱(필드 없음)을 새 콘솔은 성공으로 읽는다 —
**두 저장소의 배포 순서와 무관하게 동작한다.** 같은 판에 들어간 화면 연출(터치 표식·
글자별 타이핑·훑는 스크롤·focus 두 박자·concern 비네트)은 전부 앱 내부라 계약 무관.

`nh:ready` 는 표본 시나리오의 **스텝 정의(`plan`)와 `seed` 도 같이 준다** (v1.74).
개수만 주던 시절에는 콘솔 타임라인이 앱 표본을 "번호만 있는 자리" 로 두고 재생하면서
채웠고, 특정 단계부터 다시 보기도 할 수 없었다(콘솔이 정의를 몰라 inline run 을 못 만든다).
`steps` 는 **숫자 그대로 두고** `plan` 을 따로 실어 옛 콘솔과도 호환된다.

**임베드는 GPS 를 쓰지 않는다** (v1.73): `initMyLocation` 이 `IS_EMBED` 면 위치를 묻지 않고
기본 무대(`NH_HOME_AREA`=강남)에 선다. 실제 위치로 지도가 가면 **모든 시나리오가 "지금 내가
있는 곳"에서 시작**하는데 거기엔 시드가 없어서 화면이 비고, 회차마다 다른 동네에서 벌어진다
(D25 "시연은 매번 같은 결과여야 한다" 와 정면 충돌). 시연 중 위치 권한 팝업도 뜨지 않고
내 위치 점(`myLocation`)도 찍지 않는다. `nhReset` 도 빈 값 대신 기본 무대로 되돌린다.

**시나리오별 무대** (v1.72): 시나리오는 `seed` 로 자기 화면을 깐다 —
`{reqs:[{q,answer,answerIn,mine}] , spots:[{t,emoji}] , feeds:[{theme,label,desc,name,img}] ,
deals:[…] , pages:[…] , zones:[{name,desc,img,color,temp,r}]}` (`zones` 는 v2.21 — 무대
트렌드 존, 최대 6. 기하는 앱이 결정적으로 편다 · `r` 1=7칸 · 2=19칸 · 트렌드 모드에서만 보인다). **깐 것이 하나라도 있으면 `pop`·`like` 는 그 안에서만 고른다**(`nhOwn`).
`reqs[].mine:false` (v2.18) = **남이 올린 Request** — 팝업이 답장 칸을 그리고 `answer` 가
"사용자가 답하는" 장면이 되어 🪙 코인이 적립되며, `drop v:req` 로 띄우면 하단 AI Agent
수신 카드도 같이 뜬다. 키가 없으면 여태처럼 내 Request(답이 도착하는 쪽)다.
`request` 액션(v2.18)은 꾹 누르는 링 → 컴포저 → 글자별 타이핑 → 등록까지 한 장면이고
(`nhRequestTyped`, 커밋 바닥 1200ms), 방금 올린 것은 다음 스텝에서 `i:-1` 로 가리킨다.
전역 시드에서 앞에서부터 고르던 v1.71 까지는 **지역만 같으면 시나리오가 달라도 같은 콘텐츠**가
열려서, 화면상으로는 네 시나리오가 다 같은 이야기로 보였다. `i` 는 선언 순서이고 **음수는
뒤에서부터** — `i:-1` 이 "방금 쓴 글" 이다(그 전에는 `i:0` 이 남의 글을 열어 대사가 거짓이 됐다).
배치는 `nhSpread` 로 **결정적**이다 — 시연은 몇 번을 돌려도 같은 자리여야 한다.
피드 사진은 사람이 올린 것(`img`, v2.10)이 있으면 그것이고, 없으면 `seedImg`(테마 색 + 라벨)로
그려서 외부 이미지에 기대지 않는다.

**개수 상한과 자리 대역** (v2.10, 콘솔 D93): 상한은 `NH_MAX`
(`req 10 · spot 40 · feed 40 · deal 10 · page 12`) 한 곳에만 있고 **콘솔의 `MAX_SEED_*` 와
같은 값이어야 한다** — 화면이 허용한 것을 앱이 조용히 버리면 시연이 설명과 어긋난다.
`nhSpread` 는 번호 하나로 자리를 정하므로 종류가 겹치지 않으려면 대역이 필요하다(`NH_BAND`
= 종류당 100 칸: 앞 절반이 무대, `NH_POST_FROM`(50) 뒤가 재생 중 생긴 남의 글). 상한이 10 이던
시절의 대역은 10 칸이라(스팟 `10+i` · 피드 `20+i`) 40 개를 깔면 **다른 종류가 같은 자리에**
떨어졌다. ⚠️ 대역이 바뀌면 옛 데모의 콘텐츠 자리도 같이 바뀐다 — 사람이 끌어 옮긴 자리
(`NH_POS_KEY`)는 종류+번호로 저장돼 그대로 살아남는다.

**보관했다가 띄우기** (v1.98, 콘솔 D86): 무대 항목에 `hold:true` 를 주면 `nhSeedScenario` 가
깔지 않고 `nhHeld` 에 쌓아 둔다. `{a:'drop', v:'spot'|'feed'|'req', i:n}` 이 그 보관함에서
**하나를 꺼내 그 자리에서 깐다** — "빈 지도에서 시작해 남의 글이 하나둘 올라온다" 는 연출은
무대가 시작할 때 통째로 깔리는 한 만들 수 없었다. 꺼낸 것은 보관함에서 빠지므로 연달아
띄울 때는 `i:0` 을 반복하면 되고, 방금 깔린 것은 목록 맨 뒤라 `pop i:-1` 로 연다.
깔기는 `nhLaySpot`/`nhLayFeed`/`nhLayReq` 로 떼어 **시작 때와 drop 때가 같은 코드**를 쓴다.

**지금 보고 있는 지도** (v1.99, 콘솔 D87): `{source:'persona-vc', type:'nh:where'}` 에
`nh:here{lat,lng,zoom}` 로 답한다(`nhHere`). **폰 지도를 읽는다** — 임베드에서 사람 눈에
보이는 것도 손으로 끄는 것도 폰이고, PC 지도는 `display:none` 이라 미러의 출발점일 뿐이다.
콘솔은 이것으로 "화면을 맞춘 뒤 그 자리를 저장" 을 만든다 (지도 링크 파싱이 단축 주소에서
막혀 자리를 정하는 것 자체가 관문이었다). 재생 중에는 콘솔이 버튼을 막는다 — 그때 지도를
움직이는 것은 대본이다.

**사람이 정한 동네** (v1.98, 콘솔 D85): 시나리오에 `areaPlace:{name,lat,lng,zoom?}` 가 오면
`nhCustomArea` 가 그것을 `SEED_AREAS.custom` 에 등록한다 — **`nhSanitize` 의 area 검사보다
먼저** 해야 `{a:'area', v:'custom'}` 단계가 살아남는다. `SEED_AREA_ORDER` 에는 넣지 않는다
(그 배열은 시드 문서 id 를 정한다). 매번 갈아끼우므로 앞 회차의 좌표가 남지 않는다.
`zoom` 은 `SEED_AREAS.custom.z` 로 남아 `area` 단계의 카메라 배율이 된다 (v1.99) —
없으면 `NH_AREA_ZOOM`(14) 이다.

**지역 이동** (v1.70): `{a:'area', v:'gangnam'|'jamsil'|'seongsu'|'dobong'}`. 갈 수 있는 곳은
시드가 깔린 지역뿐이라 `nh:ready` 의 `areas[]` 로 알려준다 — 콘솔에 복사해 두지 않는다.
`area` 는 자체 지도 조작을 만들지 않고 **동결 앵커 `cpopGoMap`** 을 부른다(팝업·서랍 닫기 →
지도 탭 → 양쪽 지도 pan/zoom → 폰 인셋 보정). 지역이 정해지면 그 뒤의 `pop` 은 **그 지역
반경 4km 안에서만** 고른다(`nhPick`) — 방학동으로 옮겨 놓고 강남 스팟을 열면 지도와 팝업이
서로 다른 동네를 가리켜 시연이 거짓말을 한다. 그 지역에 아무것도 없으면 아무것도 열지 않는다.
모르는 지역 키가 온 스텝은 `nhSanitize` 가 버린다(지도가 안 움직인 채 대사만 흐르는 것을 막는다).

**콘솔이 보내온 시나리오** (v1.68): `nh:run` 에 `scenario` 를 실으면 `NH_SCENARIOS` 에 없는
시나리오도 재생한다 — 서베이에서 뽑은 시나리오는 콘솔에 있기 때문이다. 받은 정의는
`nhSanitize()` 를 반드시 통과한다: 액션은 `NH_ACTIONS` 화이트리스트뿐(모르는 액션은 버림),
대사 300자·스텝 간격 50~6000ms 로 자른다(**스텝 수 상한은 v2.31 에서 없앴다** — 20개가 걸려
있었고 21번째부터 조용히 버려졌다). **임의 코드는 돌지 않는다.**

**카메라 연출** (v1.75): `zoom`(in/out — 중심 유지, 줌 11~18 로 자름) ·
`focus`(i번째 콘텐츠로 카메라를 옮겨 확대, **팝업은 열지 않는다** — 여는 것은 pop 의 일이다).
둘 다 `goMapCam`(M09 앵커)만 부르고 **양쪽 지도를 같이 움직인다** — 카메라는 PC → 폰
단방향 미러라 폰만 움직이면 다음 idle 이 되돌린다 (area 와 같은 이유).
`nh:ready` 가 `actions` 로 지금 앱이 아는 액션 목록을 같이 알려주므로, 콘솔은 그것만 쓰면 된다.

- 명령은 `EMBED_ORIGINS` 에 있는 오리진에서 온 것만 받는다. 새 콘솔 주소가 생기면 여기에 추가.
- 시나리오 추가는 `NH_SCENARIOS` 에 항목을 넣는 것으로 끝난다. 스텝의 `a` 는
  `tab·mode·pop·popclose·request·drawer·wait·area·like·write·answer·chat·ai·scope·scroll·
  zoom·focus·drop·post·postfeed·burst·coupon·dim·undim·page·reward·bubbleclose`
  (v2.27 `reward` — 현장 답변 리워드 지급 / v2.31 `bubbleclose` — 우하단 말풍선 셋을 함께 걷는다)
  뿐이고, **새 액션을 만들 때도
  기존 앵커만 부른다.** 스텝의 `fast:true`(v2.21, additive)는 연출을 접고 그 자리에서
  커밋한다 — 콘솔 "이 단계만 보기" 의 조립 구간이 쓴다. `pop`·`focus`(`nhPick`/`nhStore` 경유)·`drop` 은 이제 `v:'deal'` 도
  받는다 — 딜은 `#content-pop` 이 아니라 `#deal-sheet` 라 `pop`/`popclose` 안에서 따로 갈린다.
  `drop` 은 `v:'page'` 도 받아 보관해 둔 지면 카드를 하나 깐다(모르는 종류는 더 이상 `spot`
  으로 새지 않는다 — v2.2 전에는 삼항의 else 가 `spot` 이라 `drop:deal` 같은 것이 조용히
  스팟을 집었다).
- **임베드는 상태를 남기지도 물려받지도 않는다** (v1.71, `nhEmbedIsolate`): `nowhere_*`
  localStorage 쓰기가 무음이고, 부팅 때 담겨 있던 콘텐츠를 비운 뒤 시드를 깐다.
  임베드와 실제 앱이 **같은 오리진**이라 이게 없으면 남의 localStorage 가 시연에 섞인다.
- **쓰기 액션이 만든 것은 회차마다 걷어낸다** (`nhTempIds` → `nhSweepTemp`). 안 걷으면
  두 번째 재생부터 "내가 쓴 글" 이 이미 있어서 시연이 매번 달라진다.
- **지도 중심에 기대지 않는다**: `getCenter()` 는 투영 전·지도 오류 시 없다. 글쓰기는
  시나리오가 서 있는 지역 좌표를 직접 준다 — 안 그러면 "썼는데 아무 일도 없음" 이 된다.
- **액션 어휘를 늘리면 세 곳이 같이 움직여야 한다**: 여기 `NH_ACTIONS`, 콘솔의 `PLAY_ACTIONS`,
  그리고 콘솔 프롬프트의 `ACTION_GUIDE`. 어긋나면 모델이 뽑은 액션을 앱이 **조용히** 버린다.
- `nhRun` 은 항상 `nhReset()` 으로 시작한다 (앞 회차가 연 팝업·드로어가 남으면 다음 시연이 가려진다).

## 🤖 M08 앱 에이전트 계약 (Now Here → Persona VC `/api/app-agent`)

두 저장소를 잇는 **두 번째** 계약이다 (첫 번째는 위 M16). 방향이 반대다 — M16 은 콘솔이
앱을 조종하고, 이건 앱이 콘솔의 모델을 빌려 쓴다.

- **부르는 곳**: `aiAskRemote()` — Ask Map 의 채팅 입력과 추천 질문 탭. 🗺 지도 요약은
  화면 실데이터를 조립하는 것이라 **로컬로 남긴다**(모델을 부를 이유가 없고 공짜다).
- **보내는 것**: `{question, context, history}`. `context` 는 `aiContextSnapshot()` —
  지역·렌즈·탭·시각·존 수·최고 인기 존·피드/스팟/Request 수. **화면에 보이는 숫자뿐이다.**
  사용자 식별자·좌표·글 내용은 보내지 않는다.
- **기억은 이 탭 안에서만 산다**: `aiChatHistory` 는 저장하지 않고(새로고침하면 사라진다)
  최근 6턴만 실어 보낸다. 콘솔도 저장하지 않는다 — 평가 파이프라인의 페르소나·세션과
  섞이지 않게 프롬프트·기억·사용량 원장 세 층이 전부 갈라져 있다.
- **끊기면 조용히 예전 동작으로 간다**: 실패·12초 초과·오프라인·서버 스위치 off(503) →
  `aiChatAnswer(q,{offline:true})` 템플릿 매칭. **템플릿 코드를 지우지 않는 이유가 이것이다.**
- **임베드(`?embed=1`)는 절대 원격을 부르지 않는다** — 시연은 매번 같은 답이어야 한다.
  M16 의 `ai` 액션이 여는 것도 템플릿 답이다.
- **롤백**: `config.js` 의 `AI_AGENT.ENABLED=false` 하나. 콘솔 쪽에서 급히 잠글 때는
  App Hosting 의 `APP_AGENT_ENABLED=0`.
- **오리진이 바뀌면 콘솔의 허용 목록도 바꾼다**: 콘솔 라우트가 `Origin` 을 검사한다
  (기본 허용은 `https://gihoon-mx.github.io` · `localhost:8765`). 새 주소에서 열면
  403 이 오고 앱은 조용히 템플릿으로 답한다 — 화면만 보면 원인을 알 수 없으니 여기를 볼 것.

## 📝 모듈 변경 로그 (최근)

- 2026-08-18 M09+M11+M16+M17: **v2.62.6** — **팝업 면은 한 토큰 · 다크 누락분 · 무대가 정하는 밝기 · 지도 타일 덮개 · 딜 라벨과 전환 효과** (사용자 요청 6건). ① **`--pop-surface`** — 스팟 팝업·딜 시트·agent 말풍선·추가 메뉴가 한 토큰의 **불투명** 면을 쓴다(뒤 지도는 `--pop-blur` 가 맡는다). ② 다크에서 **밝은 바탕 + 밝은 글자**이던 여섯 자리 — v3 스킨이 잉크를 버튼 배경으로 써서 배경만 뒤집힌 것이 원인. 글자를 어둡게 했고 `:not(.active)` 로 좁혔다(안 좁히면 고친 것을 다시 덮는다). ③ **`MapTint`** — `getPanes().mapPane` 에 사는 한 겹. 앱 오버레이는 전부 `overlayMouseTarget` 이라 **타일만** 어두워진다. ⚠️ 지도 스타일 자체는 mapId 벡터라 런타임에 못 바꾼다. ④ **`seed.theme`** — 회차 동안만(`nhThemeSet`/`nhThemeRestore`), 저장 안 함. 단계 `theme` 액션은 저장한다 — 그것이 둘의 차이다. ⑤ `dl-onair` 앵커를 미니 라벨 자리(-20px)로 옮겨 가게명을 안 가린다 + **`dealOnFx`** on/off. ⑥ `dl-tag` 9→11px.
- 2026-08-18 M09+M10+M11: **v2.62.5** — **네비 아이콘도 다크로 · 지면 카드를 사진만으로 · 데모 프로필 사진** (사용자 요청 3건). ① 하단 네비의 유리는 어두워졌는데 **그 위의 선 색**(`.pn-add` #3c434e · 안 고른 탭 #5f6672)이 그대로라 어두운 유리 위에 어두운 아이콘이었다 — 토큰 색으로 바꾸고 v3 의 선택 칩 유리(`--v3-glass-ic`·`--v3-glass-on`)도 덮었다. 고른 탭의 3색 그라디언트는 그대로(탭의 정체성). ② 지면 항목마다 **`사진만`**(`bare`) — 글자칸과 그라데이션을 **함께** 접는다(그라데이션은 글자용이라 하나만 빼면 목적이 반만 이뤄진다). 값은 안 지운다. ③ **`demoPhoto`** — 우상단 프로필 원을 관리자가 정한다(주소 또는 파일, 160px 정사각). 비우면 계정 사진 → 이니셜. `paintAccount` 보다 이 값이 먼저다. ⚠️ 색을 잴 때 `.pn-add` 는 background 트랜지션이 있어 **프레임 합성이 없는 세션에서는 옛 색에 멈춘다** — `transition:none` 을 걸고 재야 참값이다.
- 2026-08-18 M04+M09+M11+M16: **v2.62.4** — **뒷배경은 흐림만 · 말머리는 연둣빛 · 다크 모드와 `theme` 액션 · burst 도 등장한다 · 폰 안 스크롤바를 감춘다** (사용자 요청 5건). ① `popScrim` 의 어둡기 기본을 0 으로(흐림 5px) — 어둡기가 팝업 카드의 유리에 비쳐 카드까지 어두워지고 있었다. ② 말머리 배경을 연둣빛 파스텔로(내가 쓴 글이어도 같은 초록 — 이 자리는 "누가" 가 아니라 "무엇에 관한" 이다). ③ **테마**(`appTheme` light|dark) — `:root` 토큰 한 벌 + **스킨 둘의 제 팔레트**까지 덮는다(그것을 안 덮으면 앱바·지면 프레임·서랍·요약 상자가 흰 채로 남는다). 관리자 › 표시 옵션 › 테마 와 단계 액션 **`theme`**(v=dark|light, 비우면 뒤집기)이 같은 값. ⚠️ 지도 타일은 클라우드 스타일(mapId)이라 안 바뀐다. ④ **burst 가 `nhBounceMark` 를 찍는다** — v2.12 가 안 붙인 이유(깜박임)는 v2.61 의 `nhRenderSoon` 으로 없어졌다. burst 가 따로 부르던 `nhSfxPlay()` 는 뺐다(표 찍는 자리가 운다 — 안 빼면 두 번). ⑤ `.phone-screen` 안의 스크롤바를 감춘다(#sidebar 는 제외).
- 2026-08-18 M04+M09+M11: **v2.62.3** — **말머리는 그냥 말풍선 · 팝업 뒷배경을 사람이 정한다 · 리액션은 뿅** (사용자 요청 3건). ① v2.62.2 의 말머리 강조(기둥·각진 모서리·큰 글씨)를 되돌렸다 — 남긴 것은 한 톤 짙은 바탕과 1px 테두리뿐이고 나머지는 의견 말풍선과 같은 값이다. ② **`popScrim`**(블러 px · 어둡기 %) — 지도 위 팝업(`#content-pop`)과 딜 시트 스크림 뒤를 덮는 정도를 관리자가 정한다(🖥 화면·디자인 › 📐 표시 옵션 › 팝업 뒷배경, 기본 3px/18%, 둘 다 0 이면 v2.29 그대로). `uiScale` 과 같은 즉시 적용·additive 클라우드 동기(왕복 4지점 배선). ③ 지도 위 리액션이 제 곡선을 갖는다(**`reactPop`** 0.62초·4마디) — `heartPop`(1.15초·6마디)의 되돌아오는 마디가 바운스였다. `.fc-heart` 는 그대로.
- 2026-08-18 M04+M16: **v2.62.2** — **말머리가 줄을 맞춘다 · 의견 문구를 사람이 적는다 · `comment` 액션** (콘솔 D194 짝, 사용자 요청 3건). ① 스팟 팝업 말머리의 **아바타를 뗐다** — 26px+6px 이 말머리만 32px 안쪽에서 시작하게 만들어 왼쪽 줄의 시작점이 둘이었다. 빠진 몫은 무게가 대신한다(잉크 기둥 3px · 14.4px/700). ② `react` 가 단계의 `n` 을 `|` 로 나눠 **의견 문구**로 쓴다 — 안 적은 자리는 앱 표(`NH_CMT_TEXT`)가 채운다. `n` 전송 상한 20→200(이름으로 쓰는 자리는 nhLayFeed 가 20자로 다시 자른다). ③ **`comment` 액션** — 사용자가 스팟 팝업 입력줄에 의견을 타이핑해 싣는다(`nhCommentTyped`). `answer` 와 같은 타이밍 규칙이고 **스스로 안 닫는다**(popclose 가 닫는다).
- 2026-08-18 M17: **v2.62.1** — **사은품 딜의 값 줄이 무너져 있었다**. 긴 뱃지가 형제를 줄여 `19,900원`·`남은 수량`이 둘 다 두 줄로 접히고(줄 높이 72.7→120.9px) 뱃지 자신도 잘렸다. 팝업 뱃지는 **종류만**(`🎁 사은품` — 이름은 바로 아래 `ds-offer` 가 적는다), 지도 미니 라벨은 여태처럼 이름. 값·재고는 `nowrap;flex:none` 으로 못박아 줄어들 칸을 뱃지 하나로 정했다.
- 2026-08-18 M04+M17: **v2.62.0** — **스팟 팝업은 미니 채팅창 · 지도보기가 곧 위치 · 매장 정보 · 딜이 무엇을 주는가** (콘솔 v0.154.0 D193 와 짝, 사용자 요청 4건).
  ① **M04 스팟 팝업 = 미니 채팅창** — 올린 사람의 글이 **첫 말풍선**이 되고 의견이 그 아래로 이어진다(`cpopComments(body,id,lead)`). 여태는 위에 큰 이모지 + 본문 블록(`.cps`)이 있고 아래에 따로 의견 목록이 있어서, **같은 대화가 두 화면**이었다. 말머리는 아바타(그 글의 이모지) + 말풍선 한 줄이고, `lead` 가 있으면 "아직 의견이 없어요" 안내를 안 띄운다 — 이미 말이 하나 있다. ⚠️ 내 말풍선으로 오른쪽에 붙이는 판정(`spotMine`)은 **`by` 가 있을 때만**이다: 무대가 깐 스팟도 `live:true` 라(`canEditSpot` 이 관리 편의로 그렇게 읽는다) 그것만 보면 **남이 올린 글이 전부 내 것**으로 붙는다. `.chat` 은 스팟만 단다 — 피드 팝업은 사진·설명이 본문이라 여태 그대로다.
  ② **M04 지도보기 버튼이 곧 위치다** (`cpopPlace`) — 버튼이 `📍 석촌동` 을 달고 그리로 데려간다. 여태는 버튼이 `📍 지도보기` 라고만 하고 본문에 `📍 석촌동` 이 따로 있어서, **어디인지**와 **거기로 간다**가 서로 남남이었다. 본문의 `.cps-region`·`.cpf-region` 은 뺐다. 항목이 들고 온 값(피드 `region`·Request `place`)이 좌표 역산보다 먼저다 — 올릴 때 정해진 값이라 더 정확하다. 매장 페이지의 `지도보기` 도 같은 규칙이다.
  ③ **M17 `매장 정보` 버튼** (딜 팝업) — 딜 중인 가게는 이름표를 눌러도 이 시트가 열려서(v2.59), **딜을 보는 사람이 그 가게가 어떤 곳인지 볼 방법이 아예 없었다.** ⚠️ 시트를 **먼저 닫고** 연다: 시트 z-30 · 매장 페이지 z-29 라 안 닫으면 열린 페이지가 뒤에 가려 아무 일도 안 일어난 것처럼 보인다.
  ④ **M17 딜이 무엇을 주는가** — 여태 딜은 곧 `pct` 였다(가격 세 칸이 할인율에서 파생되고 라벨·배너·팝업이 전부 `%` 를 적었다). 셋이 됐다: `pct`(기본 — 안 싣는다) · `bogo`(1+1) · `gift`(사은품, `gift` 칸의 이름). 늘리는 자리를 **네 함수로 모았다**(`dealType`·`dealHasPrice`·`dealOfferLabel`·`dealOfferLine`) — 그리는 쪽은 종류를 안 묻는다. ⚠️ **값을 깎는 딜만 지금가가 내려간다**: 1+1·사은품에 취소선 원가를 띄우면 "깎이지 않았는데 깎인 것처럼" 보인다. 미니 라벨의 `lab:'pct'` 칸도 이제 "무엇을 주는가" 다. 콘솔 `DEAL_TYPES` 와 같은 목록이어야 한다 — **check-contract ⑩** 을 새로 뒀다(⑥ burst 종류와 같은 사고를 막는다).
  검증(로컬 :8765, `?embed=1&clean=1`): 종류 파서 — 빈 값·모르는 값·`store` 는 전부 `pct` 로, 라벨 `30%`/`1+1`/`🎁 아메리카노 1잔`, 한 줄 `30% 할인`/`하나 사면 하나 더`/`쿠키 증정` · 실제로 셋을 깔아 **`pct` 만 지금가가 내려가고**(5,900 vs 9,900) 1+1·사은품은 정가 그대로 · 딜 팝업이 종류마다 뱃지·취소선·한 줄을 맞게 그리고 `pct` 에서는 한 줄이 `:empty` 로 접힘 · `매장 정보` 가 시트를 닫고 그 가게 페이지를 열며 페이지의 지도보기가 `📍 논현1동` · 스팟 팝업이 아바타 🔥 + 말머리 + 의견 2말풍선 + 입력줄이고 `.cps` 블록이 사라짐, 헤더 버튼 `📍 논현2동` · 피드/Request 팝업도 헤더가 동네를 달고 본문의 중복 위치 줄이 사라짐(피드는 채팅 모양이 아님). **못 밟은 것: 픽셀로는 못 봤다**(구글맵이 프레임을 안 그리는 세션 — DOM·계산값으로만 확인).

- 2026-08-18 M17+M16: **v2.61.0** — **쏟아지는 동안 안 움찔거린다 · 화면 안에만 · 종류마다 개수 · 딜로 바뀌는 순간** (콘솔 v0.153.0 D192 와 짝, 사용자 요청 4건).
  ① **M17 `renderDealMarkers` 가 이름표를 다시 안 짓는다** — 여태 한 번 그릴 때마다 `setMap(null)` 로 **전부 걷고 새로 만들었다.** `burst` 는 컨텐츠 하나마다 이 함수를 부르므로 쏟아지는 몇 초 동안 이미 서 있던 이름표가 수십 번 새 DOM 이 됐다 — 사용자가 본 "기존 컨텐츠, 특히 매장 라벨이 움찔움찔" 이 그 자리다. 스팟이 v2.13 에 배운 그 규칙(id 로 짝을 맞춰 남은 것은 값만 물린다)을 그대로 쓴다: `DealLabel._sync`(상호·한마디·강조) · `_syncTag`(미니 라벨을 켜고 끈다) · `reuse`(자리가 바뀐 것만 다시 그린다). ⚠️ 한마디 칸(`.dl-msg`)을 **비어 있어도 만든다** — `shopsay` 로 나중에 붙는 한마디가 여태는 통째 재생성을 타고 들어왔다. ⚠️ 짝을 맞출 때 `o.div` 를 **안 본다**: Maps 는 `setMap` 뒤 다음 그리기 차례에 `onAdd` 를 부르므로, div 를 조건에 넣으면 촘촘한 구간에서 아직 안 그려진 이름표가 매번 버려져 이 고침이 헛돈다. ⚠️ 이름표가 여러 렌더를 살아남으므로 클릭 핸들러가 잡는 것은 만들 때의 `d` 가 아니라 **`self.d`** 다.
  ② **M16 `nhRenderSoon`** — 쏟아지는 동안의 렌더를 32ms 창으로 모은다(상단 지면 `renderNews`·피드 목록이 항목마다 통째로 다시 그려지던 몫). rAF 가 아니라 setTimeout 인 이유: 안 보이는 창에서는 rAF 가 멈춰 **컨텐츠가 영영 안 뜬다**.
  ③ **M16 burst 를 '지금 보이는 지도 안에만'** (`sp:'view'`) — 반경을 줌에서 짐작하지 않고 `nhViewBox()` 가 **실제 화면 상자**를 잰다(헤더·하단 네비 인셋을 뺀다 — `phoneVisibleCenter` 와 같은 자). 원이 아니라 상자에 고르게 뿌린다: 화면은 네모라 원으로 깔면 네 귀퉁이가 빈다. ⚠️ `nhLay*` 가 넘겨받은 점을 **중심 삼아 한 번 더 편다**(`nhSpread`) — 그 최대치(`NH_SPREAD_MAX`)를 미리 빼지 않으면 가장자리 것이 화면 밖에 떨어진다(검증에서 실제로 하나가 샜다). 상자를 못 읽으면(지도가 아직 안 붙었다) 조용히 여태 규칙으로 떨어진다.
  ④ **M16 종류마다 개수** — `v` 에 얹는다(`spot*5+feed*3`, `nhBurstCounts`). 적힌 것이 하나도 없으면 `null` 이라 **여태 규칙**(총 개수를 종류가 나눠 갖는다)이 그대로 돈다 — 저장된 옛 데모가 안 바뀐다. 이어 붙인 순서 그대로 쏟으면 종류가 뭉텅이로 나오므로 `nhShuffleDet` 로 **결정적 셔플**한다.
  ⑤ **M17 `nhDealOnFx`** — 매장이 타임딜로 바뀌는 순간 ⏰ 가 이름표에서 솟아오르고 딜 색 링이 두 번 퍼진다(1.8초 뒤 걷는다). ⚠️ 붙이는 곳은 이름표 **루트**(`.deal-label`)다 — 상호칩에는 `backdrop-filter:blur` 가 걸려 있어 그 안에서 무엇이 움직이면 글자가 떤다(v2.58 이 맥동을 칩에서 빼낸 그 이유).
  ⑥ **(덤) `dev.html` 이 이미 깨져 있었다** — 모듈 레지스트리 스크립트가 `SyntaxError` 로 멈춰 **카드가 한 장도 안 그려지고 있었다.** 원인은 `desc:'…'` 안의 **맨 홑따옴표**다(`'추가된 매장'`·`drop v:'store'` 처럼 본문에 코드값을 적으면 문자열이 그 자리에서 닫힌다). 11군데를 활자 따옴표(`‘’`)로 바꿨다. ⚠️ `tools/check.js` 는 **app.js 문법만** 본다 — 이 페이지는 아무도 안 세고 있어서 여러 판을 그대로 지나왔다. **`desc` 본문에는 홑따옴표를 쓰지 않는다.**
  검증(로컬 :8765, 임베드): 파서 — `spot*5+feed*3` → 종류 `[spot,feed]`·개수 `{spot:5,feed:3}`, 옛 값 `spot+feed` → `null`(여태 경로), 모르는 종류는 버림, 셔플 두 번 같은 결과 · `nhViewBox` 가 인셋 60/90 을 반영해 정확히 계산 · 실제 `nhBurst('spot*4+store*3+deal*2+req*2+feed*2', sp:'view')` → **13개가 요청한 종류·개수 그대로**이고 **전부 보이는 상자 안** · 이름표 — 렌더 5회에 같은 객체·같은 DOM 유지, 새 매장이 늘어도 기존 DOM 그대로, `msg` 를 나중에 붙여도 같은 DOM 에서 뜸, 사라진 것만 배열에서 빠짐 · `nhDealOnFx` 가 링 2개(`dloRing`)·⏰(`dloEm`)를 붙이고 두 번 불러도 안 겹침, 그 이름표가 `dl-live` 로 서고 라벨이 `⏰타임딜15:00` · 렌더 횟수 — 1.5초에 60개를 쏟을 때 딜 렌더 18→12·지면 21→18·스팟 21→14. **못 밟은 것: 두 화면 다 눈으로 못 봤다** (브라우저 패널 미표시 — 구글맵이 프레임을 안 그려 `OverlayView.onAdd` 가 안 불린다. 위 DOM 검증은 판을 흉내 내 `onAdd` 를 직접 불러 잰 것이다).
- 2026-08-17 M09+M10: v2.57.0 → **v2.57.1** — **탭 전환에 방향을 준다 · 모드 전환 컬러 와이프 · 접힌 만큼 따라 올라온다** (사용자 요청 3건). ⚠️교차: M15 — 새 규칙은 전부 `style.css` 공용부에 있고 스킨 3종은 무수정(스킨이 `.tab-page`·`.pa-mode` 의 `top`/`animation` 을 재선언하지 않는다).
  ① **M09 `animateTabSwap`** — 탭 전환이 `display:none/block` 한 줄이라 화면이 순간이동했다. 하단 네비 순서(`TAB_ORDER` = 지도 0 · 피드 1 · 소셜 2)를 **그대로 방향으로** 쓴다. ⚠️ 호출 시점은 `.open` 토글 **뒤**다 — `display:none` 인 채로 애니메이션을 걸면 시작 프레임을 놓친다. 나가는 페이지는 `.open` 이 이미 떨어져 있으므로 **`.tp-exiting` 이 display 를 대신 잡고** 340ms 뒤에 걷는다(`#social-page` 만 flex 라 `.open` 의 display 규칙을 하나로 못 묶고 복제한다). `prev===next` 면 아무것도 안 한다 — `switchTab('map')` 은 여러 곳에서 반복 호출된다.
  ② **M09 `runModeReveal` · `#mode-reveal`** (v2.57.1 — v2.57.0 의 가로 와이프 `runModeWipe` 를 **폐기 교체**했다: 0.62s 인데 띠의 앞뒤가 투명해 **느리고 잘 안 보였다**) — 누른 토글 자리에서 그 모드의 색 원이 터져 화면을 **꽉 덮고** 흩어진다(0.5s · 확산은 0.29s 완료 · `--hot1/--hot2` ↔ 블루). 원점은 인자가 아니라 `#phone-mode .pm-btn[data-mode]` **실측**이다 — 부르는 쪽이 무엇이든 사람의 눈이 가 있는 자리는 늘 폰 토글이고, 토글이 숨은 탭에서는 폭 0 → 지도 상단 한가운데로 폴백한다. 반지름 = 원점→가장 먼 모서리(어느 자리에서 터져도 전면 커버). ⚠️ `transform:scale` 로만 큰다(width/height 면 레이아웃이 지도 위에서 끊긴다). ⚠️ z-index **4** 가 계약이다: 지도·`.tab-page`(3) 위, `.phone-header`·`.pa-mode`(5) 아래 — 누른 버튼이 원 **위**에 살아 있어야 인과가 보인다. `pointer-events:none`, `.phone-screen{overflow:hidden}` 이 라운드 밖을 자른다.
  ③ **지도 div 에 영구 transform 금지** — `#phone-map.tab-settle`(`scale(.985)→1`)은 `mapMorph` 와 같은 규칙으로 **identity 로 끝나는 one-shot** 이다. 남기면 구글맵 좌표 투영·히트테스트가 밀린다.
  ④ **M10 접기 리프트** — 접기가 `body.sum-folded` 를 심고 CSS 가 축척·모드 토글을 **29cqw**(44cqw→15cqw 차) 올린다. v2.28 의 "토글은 화면에 못 박는다" 규칙은 그대로 — 캐러셀·존 카드 높이 변화에는 안 움직이고 **사람이 명시적으로 접었을 때만** 따라온다. ⚠️ **`:not(.mode-trend)` 가드 필수**: 트렌드 지도 탭은 지면 대신 `#cp-zones`(44cqw)가 서므로 접힘이 남아 있으면 토글이 존 카드 위로 파고든다(존 요약은 접기 자체가 없다 — `renderSummaryZones` 가 버튼을 숨긴다).
  ⑤ **`prefers-reduced-motion`** — ①②의 애니메이션과 ④의 `top` 트랜지션을 끈다. 상태 전환 자체는 그대로 일어난다.
  검증(v2.57.1 로컬 :8765, 375×812): 리빌 원점이 누른 버튼을 따라가고(베이직 x=149.7 / 트렌드 x=224.9) 반지름 521px ≥ 최원거리 모서리 520.1px = 전면 커버 보장 · 색·`modeReveal 0.5s`·z4·`pointer-events:none` 실측 · 와이프 잔여 참조 0건. 접기 리프트 실측 108.66/108.65px = **29cqw 정확**, 접힘+트렌드는 원위치(258.51px) 복귀 = 가드 동작. 탭 3방향 클래스·애니메이션 실측(map→feed `tpInR` / feed→social `tpOutL`+`tpInR`, 나가는 페이지 display 유지 / social→map `tpOutR`+`mapSettle`). 와이프 색·방향 실측(→트렌드 `#ff7a45→#ff4d67` `modeWipeR` / →베이직 `#4a8bff→#2b6ff0` `modeWipeL`), z 순서 4/5/3. `node tools/check.js` OK. ⚠️ 로컬은 로그인 게이트 앞이라 구글맵 미로드(`map` undefined) — **모드 전환 실동작은 배포본/실기기 확인 필요**.
- 2026-08-13 M04+M05+M16: v2.33.0 — **지도 컨텐츠 더블탭 좋아요 · 하트 수를 무대가 심는다 · 단계 사이 군더더기 제거** (콘솔 v0.106.0 과 짝, 사용자 요청 3건). ⚠️교차: M04↔M05 — 좋아요 저장소(`feedLikes`·`rebuildLikes`·`toggleLike`)는 M05 소유인데 M04(스팟)가 함께 쓴다.
  ① **`SpotBubble._tap`** — 한 번=상세 팝업 / 두 번=좋아요. 상수(340·360·1200ms)는 피드 카드가 오래 쓰던 값 그대로. ⚠️ 카운터는 **인스턴스**(`_lastTap`·`_tapTimer`)다: 진입점이 둘이라(권한 없는 손 click 450 · 권한자 `_onDown` cleanup 495) 클로저에 두면 한쪽이 센 탭을 다른 쪽이 못 본다.
  ② **`.spot-heart` 배지** — `.spot-cmt` 와 같은 문법, 반대쪽 어깨. **말풍선의 자식**이라 `draw` 의 CSS zoom 을 그대로 탄다(px 로 써도 줌에 맞게 큰다). `_render` 가 `textContent` 대입으로 자식을 지우므로 **다시 부착**한다 — 빠뜨리면 다음 렌더에 사라지고 그것은 에러가 아니다.
  ③ **(회귀 수정) `toggleLike` 의 라이브 조기 반환** — `feedItems` 에 없는 id(스팟)를 만나면 그 자리에서 돌아섰다. 피드 탭 목록은 스팟·지면을 섞어 돌므로 **스팟 카드 더블탭은 이미 있었고 라이브에서만 죽어 있었다.** 이제 로컬 경로로 내려간다. 함께: `rebuildLikes` 가 표를 통째로 비우던 것을 **피드 id 만** 다시 짓게 (id 네임스페이스가 안 겹쳐 표는 하나로 족하다).
  ④ **`seed.spots[].likes` · `seed.feeds[].likes`** (0~999) — `nhLaySeedLikes` 가 `feedLikes` 에 `{n,me:0}` 으로 심는다(시드 생성기가 쓰던 수법과 같은 자리). ⚠️ 상한 999: 피드 온도(`feedHeatT`)가 **최다 좋아요 대비 비율**이라 한 장에 큰 수를 주면 전역 시드 카드가 전부 식는다.
  ⑤ **액션은 안 늘렸다** — `like` 가 이미 `toggleLike` 를 부른다. 대신 `nhTempIds.like` 중복 push 를 막았다(같은 카드에 like 를 세 번 두면 sweep 이 두 번 토글해 전역 시드 카드가 켜진 채 남았다).
  ⑥ **단계 사이 군더더기** — `nhAct` 의 손가락 표식 **170ms 리드인 제거**(표식은 CSS 애니메이션이라 실행과 나란히 돈다). `nhWriteSpot`·`nhAi` 의 커밋 시각을 `min(…, ms-여유)` 로 **스텝 안에 접었다** — answer·request 가 이미 쓰던 문법이고, 이것이 콘솔 하한을 낮추는 전제다(D115 사슬이 ms 와 무관해진다).
  검증(로컬 :8765, 390×844): seed likes 12/0/34 가 그대로 뱃지 값이 되고 sanitize 가 5/0/999 로 자름 · 한 번 탭=팝업 타이머만·두 번째 탭에서 12→13(me:1)이고 팝업 타이머가 취소됨·다시 더블탭하면 12 로 복귀 · `tab` 액션이 11ms 만에 실행되고 표식은 그대로 뜸(전에는 170ms) · write 700ms + `pop i:-1` 사슬이 네 스텝 모두 ok 로 완주 · 배지가 의견 수 왼쪽 어깨에 9px·mine 색 · `heartPop` 연출 · 콘솔 에러 0.
- 2026-08-13 M17+M16: v2.32.0 — **가게 이름표 · 가게 한마디 · 이름표에서 매장 페이지로** (콘솔 v0.105.0 과 짝, 사용자 요청 3건).
  ① **가게는 딜 항목 안에 산다** (`msg`·`store`). 새 컨텐츠 종류를 세우면 앱 여덟 자리(`nhTempIds` 두 곳·`NH_MAX`·`NH_BAND`·`nhPosNote`·`nhStore`·`nhSweepTemp`·`nhDrop`·`nhDim`)와 콘솔 네 자리(`PlaySeed`·`CONTENT_KINDS`/`OPENABLE_KINDS`/`DROPPABLE_KINDS`·`indexChoices`)가 는다 — `deal` 은 거기 이미 전부 등록돼 있다. 옛 시나리오도 `shop` 을 이미 들고 있어 앱만 배포하면 이름표가 뜬다.
  ② **`DealLabel`** — 앵커 **아래**에 [상호칩][한마디▲]. 핀이 앵커 위를 다 쓰고 그 높이가 `contentDot`(0.02~40)으로 변하므로 위에 두면 줌마다 흔들린다. 배율은 `labelScale`(0.7~1.6) — 멀어져도 점이 안 된다. 클릭은 상호칩만 받는다(루트가 받으면 지도 팬이 걸린다).
  ③ **색을 명시한다** — `.map-label-tag` 에는 background 가, `.spot-bubble` 에는 color 가 없다(둘 다 호출부가 인라인으로 주던 값). 클래스만 빌리면 투명 배경 흰 글씨 + 폴백 파란 말풍선이 된다. 스킨 3종은 `.spot-bubble` 을 알고 `.map-label-tag` 는 모르므로 **스킨 파일은 무수정**이다.
  ④ **`dealActive` 를 좁혔다**(`!d.store &&`). `nhLayDeal` 이 모든 항목에 `secs`·`ts` 를 넣어 가게만 항목도 30분간 "진행 중" 이 됐다 — 한 술어를 좁히니 `nDeal`·관리자 표·`nhCoupon`·`pop e:'sheet'`·`storeChipData` **다섯 자리가 무수정으로** 정직해진다. 렌더만 `dealShown` 을 쓴다.
  ⑤ **`storeView` + `.no-deal`** — 딜 없는 가게의 매장 페이지는 배너·쿠폰 CTA 를 통째로 접는다(회색 비활성은 "딜이 있는데 못 받는다" 로 읽힌다).
  ⑥ **이름표 컬링** — 겹치면 뒤에 온 것을 `dl-hide` 로 숨긴다(자리는 안 옮긴다, v2.27 규칙). 우선순위 ①열린 매장 ②한마디 있음 ③나머지. 이름표는 declutter 에 `fixed` 장애물로도 들어가 말풍선이 피한다.
  ⑦ **`shopsay` 액션** — i=어느 가게·v=문구(비우면 걷는다). ⚠️ 바운스는 공용 소비형 표(`nhBounceTake`)를 안 쓴다 — 핀이 먼저 가져가면 이름표가 안 튄다.
  검증(로컬 :8765, 390×844): 실제 `nh:run` 으로 무대에 가게 셋을 깔아 상호 없는 것만 걸러지고(2/3) 딜 가게는 핀+이름표, 가게만은 이름표만(pins 1 · labels 2) · `dealActive` 가 store 에 false · `shopsay` 가 seed 의 한마디를 갈아 끼움 · 매장 페이지가 store 에서 `no-deal`(칩 2개·배너 none·쿠폰 none) / 딜에서는 칩 3개·배너 flex·쿠폰 block · CSS 계측으로 상호칩이 앵커에 붙고(0px) 말풍선이 6px 아래·꼬리 `top:-6px`·꼬리색이 `--spot-bg` 를 따름·루트 `pointer-events:none` · 관리자 토글 on/off 가 이름표 1↔0 · `mergePinView` 가 새 키를 살림 · `nhReset` 이 전부 걷음 · 콘솔 에러 0.
- 2026-08-13 M17+M16+M08: v2.31.0 — **쿠폰이 버튼에서 Agent 로 · 말풍선 닫기 액션 · 단계 수 상한 제거** (콘솔 v0.104.0 과 짝, 사용자 요청 4건 중 앱 몫 3건).
  ① **M17 `couponFly` 의 두 끝이 바뀌었다** — 출발은 누른 `쿠폰 받기` 버튼, 도착은 하단 AI 버튼. 부르는 쪽이 **시트를 닫기 전에** `claimDeal(d,{from:btn})` 을 부른다(couponFly 가 그 자리에서 rect 를 읽고 티켓을 `.phone-screen` 에 붙이므로 다음 줄에서 닫아도 된다 — 같은 tick 이라 시트가 보이는 프레임도 안 그려진다). 세 자리(시트 버튼·`nhCoupon` fast·일반) 모두 같은 순서. ⚠️ 도착 rect 가 0 이면 **연출을 안 한다** — `.phone-navbar` 에 `transform:scale(--ui-nav-s)`(기본 90%)가 걸려 있어 자리를 상수로 못 짐작한다. ⚠️ 받는 링은 `.pn-ai.cf-catch::after` 로 그린다(`.pn-ai.spin` 의 animation 축약과 안 싸우고, 스킨의 box-shadow 재선언도 안 덮는다). 확산은 **2.2cqw 상한** — `.phone-screen{overflow:hidden}` 에 네비 아래 여백이 2.75cqw 뿐이라 그보다 크면 잘린다.
  ② **M16 `bubbleclose` 액션 신설** — 우하단에 뜨는 것은 하나가 아니라 **셋**이다(`#ai-bubble` z6 · `#ai-presets` z7 · `#req-bubble` z8, 전부 right:3cqw·bottom:21cqw 한자리). 하나만 걷으면 "닫았는데 안 닫혔다" 가 되므로 `nhHush` 가 셋을 함께 걷는다. 어휘 동기화는 **여섯 곳**: 앱 `NH_ACTIONS`·`nhAct` / 콘솔 `PLAY_ACTIONS`·`ACTION_LIST`(프롬프트)·`ACTION_INFO`(편집기) / 유저 시나리오 편집기의 하드코딩 두 곳(`actionLabel`·`ACTION_OPTIONS` — 타입 검사가 없어 빠뜨려도 조용하다).
  ③ **M16 단계 수 상한 제거** — `nhSanitize` 의 `steps.length<20` 을 걷었다. 21번째부터 통째로 버려졌고 **버렸다는 말이 어디에도 안 남아** "뒷단계가 그냥 안 돈다" 로만 보였다. 재생 루프(`nhRun` 의 `next`)는 한 번에 타이머 하나만 들고 재귀하므로 단계가 늘어도 쌓이는 것이 없다. 콘솔이 `nh:begin.total` 을 듣고 보낸 수와 대조해 몇 개가 걸러졌는지 화면에 말한다(콘솔 D127).
  검증(로컬 :8765, 390×844): 57단계 대본이 57개 그대로 통과 · `bubbleclose` 가 어휘·sanitize·nhAct 를 타고 셋을 함께 걷음(ai·req·presets 전부 show 해제) · 쿠폰 티켓의 출발점이 버튼 중심(158,600)·도착점이 AI 버튼 중심(327,796)과 일치, 1초 뒤 `.pn-ai` 에 `cf-catch` 와 `::after` 애니메이션, 링 9px < 버튼 아래 여백 20px(안 잘림) · 시트는 그 뒤 닫힘.
- 2026-08-13 M17: v2.30.1 — **딜 팝업이 지도 가운데로 · 쿠폰 받기가 눌린다 · 딜도 끌어 옮긴다** (앱 단독, 사용자 3건).
  ① **(버그) 쿠폰 받기가 안 눌렸다** — v2.30 이 시트를 가운데 카드로 만들며 `max-height`+`overflow-y:auto` 를 걸었는데, 내용이 그 높이를 넘으면 `.ds-acts` 가 접힌 아래로 내려가 **보이지도 눌리지도** 않았다(그 자리를 누르면 뒤의 `.ds-scrim` 이 받아 시트가 닫힌다). 카드를 flex 세로로 바꾸고 가운데(`.ds-scroll`, 마크업 신설 — index/admin 둘 다)만 구르게. `elementFromPoint` 로 회귀 확인.
  ② **`dealSheetFrame`** — 팝업을 **보이는 지도**에 맞춘다(헤더 높이 + `phoneMapInsets`). ⚠️ `#phone-map` rect 는 안 쓴다: 지도가 안 붙은 화면에서 높이 0 이라 프레임이 어긋난다. 가리는 것이 화면의 62% 를 넘으면 프레임을 걷는다.
  ③ **`couponFly(anchor)`** — 티켓이 **Agent 에서** 출발한다(리워드 코인이 말풍선 위에서 터지는 것과 같은 규칙). 그래서 `claimDeal` 이 말풍선을 **먼저** 띄우고 그다음 날린다. `e:0`(문구 없음)이면 AI 버튼이 앵커.
  ④ **`DealPin._onDown` + `moveDeal`** — ReqPin 과 같은 문법(터치=롱프레스, 마우스=즉시). 무대 항목이면 `nhPosNote` 가 `dln_` id 를 읽어 다음 재생에도 그 자리 — 그 계약은 v2.3 부터 있었고 `nhLayDeal` 도 `nhPosGet` 으로 읽고 있었는데 **끄는 손이 없어** 죽어 있었다(M07 이 v2.20 에 겪은 자리와 같다). 무대가 깐 딜은 `saveDeals` 를 안 탄다 — 회차가 걷을 물건이다.
  검증(로컬 :8765): 390×844 에서 프레임 top 314px·bottom 85px(네비), 카드 중심이 화면 중심보다 114px 아래·모드 토글과 131px 떨어짐 / 카드 오버플로 0(scrollH=clientH) · `쿠폰 받기` 가 `elementFromPoint` 에서 `ds-claim` 으로 잡힘(전에는 `ds-scrim`) · 눌렀을 때 티켓 출발점이 말풍선 중심과 정확히 일치 · 1279×720 같은 가로 창에서는 안전판이 걸려 전체 화면 폴백. ⚠️ 딜 핀 드래그는 이 환경에 지도 오버레이가 없어 **코드 대칭(ReqPin 과 동일)으로만** 확인했다.
- 2026-08-13 M08+M07+M16: v2.30.0 — **agent 말풍선을 한 손이 든다 · 단계가 유지 시간을 정한다 · 타이핑 소리 한 번** (콘솔 v0.102.0 과 짝, 사용자 4건 중 앱 몫 3건).
  ① **M08 `aiSay`/`hideAiBubble` 단일 funnel** — `#ai-bubble` 을 띄우던 여섯 자리(Request 전송 2.6초 · claimDeal 4초 · 답변/리워드 5초 · 라이브 도착 6초 · ai 답 7초)가 제각각 `textContent`+`setTimeout` 을 했다. 무대가 "이 단계의 말풍선은 몇 초" 를 정하려면 그 값이 한 곳에 있어야 한다.
  ② **M16 스텝 `bh`(초, additive)** — `nhAct` 가 **액션별 분기 밖에서, 실행 전에** 심는다(요청이 "모든 action 대상"). 실행 직후에 안 지우는 이유: `ai` 의 답은 `ms*0.4` 뒤에 뜬다 — 다음 단계가 덮을 때까지 살려 둔다. 우선순위는 좁은 규칙부터: `coupon` 의 `e` → `bh` → 자리 기본값. ⚠️ `nhCouponMs` 가 빈 값에 **null** 을 돌려주도록 바꿨다(여태 4000) — 안 그러면 `e` 를 비운 단계에서 `bh` 가 영영 못 온다. `nhStop` 이 회차 끝에 되돌린다.
  ③ **M07 Request 팝업이 뜨면 말풍선을 걷는다** — `.req-bubble` 과 `.ai-bubble` 은 우하단 **같은 좌표**(right:3cqw · bottom:calc(21cqw+safe))에 겹쳐 떴다. `showReqBubble`·`openContentPop('req')` 둘 다에서 `hideAiBubble()`(프리셋 패널까지).
  ④ **M16 타이핑 소리 1회** — `nhSfxPlay('type')` 이 틱마다(1~2자) 울려 16자에 열한 번 났다. 세 자리 모두 `setInterval` **밖**, 타이핑 시작 지점으로.
  검증(로컬 :8765, `?embed=1&clean=1`): `nhSanitize` 가 bh 2.5 통과·없음/99 는 0 · `nhAct({a:'reward',bh:1.2})` 말풍선이 1208ms 뒤 사라짐 / bh 없으면 2초 시점에도 떠 있음(기본 5초) · `showReqBubble`·`openContentPop('req')` 뒤 ai 말풍선 `show` 해제 · `answer` 액션 16자에 `type` 소리 **1회**(전에는 ~11회)·답 1건 커밋 · 콘솔 에러 0.
- 2026-08-13 M03+M16+M17: v2.29.1 — **시연 중에는 지도가 혼자 안 움직인다 · 타임딜이 가운데 팝업으로** (앱 2건 + 콘솔 v0.101.1 짝 1건).
  ① **M03+M16 `focusNearbyZones` 를 임베드에서 끈다** — 베이직→트렌드 전환 80ms 뒤에 근접 존 3개를 담는 `fitBounds` 가 혼자 걸려, 무대가 맞춰 둔 화면(`zoom`·`focus`·`burst` 가 앉힌 자리)을 소리 없이 밀어냈다. 시연에서 카메라를 움직이는 주체는 **단계뿐**이어야 한다. `IS_EMBED` 로만 막는다 — index/admin 은 여태와 같고, 손으로 토글을 눌러도 시연 중이면 안 움직인다.
  ② **M17 딜이 바텀시트 → 화면 가운데 팝업** — 바닥을 통째로 밀고 올라오면 지도가 반쯤 가려 어느 핀의 딜인지가 사라진다. 78cqw 카드가 정중앙(`dsPop`), 내부 치수를 한 단계씩 축소(사진 34→24 · 이모지 18.4→13.4 · 제목 5.1→4.2 · 할인율 6.6→5.4 · 버튼 12.2→10.4cqw). 마크업 무수정, 손잡이(`ds-grip`)만 숨긴다. `couponFly` 출발점도 화면 중앙.
  ③ **회귀 아님을 확인** — 임베드에 실제 `nh:run` 을 태워 카메라 궤적을 150ms 간격으로 찍었다: 14 → `mode trend` → `zoom in` 16 → `burst e:12` 12, 컨텐츠 8개(스팟·피드·딜). 액션 자체는 정상이고 되돌리던 것은 ①뿐이었다.
  ⚠️교차(콘솔): `paceSteps` 가 새 객체를 필드별로 조립하며 `e`·`n` 을 떨어뜨리고 있었다 — 유저 시나리오 재생에서만 burst 줌·drop keep·coupon 초·pop deal sheet 가 사라졌다(기능 데모는 `paceFast` 라 무사). 콘솔 v0.101.1 에서 두 줄 추가.
  검증(로컬 :8765, `?embed=1&clean=1`): 임베드 switchMode 에서 focusNearbyZones 호출 0회 / IS_EMBED 를 끄면 1회 · 딜 카드가 화면 정중앙(dx·dy=0)·78cqw·`position:relative`·손잡이 none · 콘솔 에러 0.
- 2026-08-13 M15+M17+M07+M08+M03+M09: v2.29.0 — **지도 컨텐츠 팝업이 유리로 · 여기에 추가 자리표 · Agent 배경 정지 · 리워드가 Request 를 닫는다 · 쿠폰 수집 · 존 카드 행 순서** (앱 단독, 사용자 요청 7건).
  ① **M15+M17 팝업 뒷배경까지 통일** — v2.27 은 카드만 유리로 바꾸고 `.modal-overlay` 의 짙은 스크림을 남겨 두었다. `#content-pop` 을 투명 오버레이로, 딜 시트도 스크림 제거 + `--frost`. 스크림 div 는 바깥 클릭으로 닫는 자리라 남긴다. ⚠️교차: skin-v3 `.ds-card`·skin-new `.cpop-card` 의 불투명 재선언도 같이 유리로 — 안 하면 **기본 스킨(v3)에서만** 통일이 깨진다.
  ② **M09+M05 `AddPin` 자리표** — 꾹 눌러 추가 메뉴가 뜨면 그 좌표에 점선 링+`+`. 스팟·Request 는 컴포저가 곧 그 자리에 앉으므로 메뉴가 닫힐 때 걷고, 사진·지면은 파일 고르는 동안 살려 둔다(`feedDropAt`). ⚠️ 사진·지면이 여태 꾹 누른 자리를 무시하고 화면 센터에 올라갔다 — 자리표를 세우는 이상 참이어야 해서 좌표·동 이름을 함께 옮겼다. 파일 고르기 취소는 이벤트가 없어 창 복귀 후 확인해 걷는다(`feedDropArm`).
  ③ **M08 `aiHeatFlow` 삭제** — 정지한 115° 두 색 사선만. v2.15 가 렌즈 무지개를 걷은 것과 같은 이유. 스킨 두 벌의 `background-size`·reduced-motion 예외도 같이 걷었다.
  ④ **M07 리워드가 Request 를 닫는다** — `showRewardBubble` 이 `lastAnsweredReqId`(무대의 `reward` 액션도 이 길)의 핀을 `rp-pop` 으로 터뜨리고 `rq.rewarded` 로 렌더에서 뺀다. 데이터는 남아 답변 목록·드로어는 그대로. 답을 **보낸** 쪽의 "전달됐어요" 안내는 삭제(리워드 말풍선과 중복).
  ⑤ **M17 `couponFly`** — 티켓이 시트 자리에서 부풀었다 우상단 프로필로 날아가 접히고 프로필이 노란 링으로 받는다. `claimDeal` 맨 앞이라 `coupon e:0`(문구 없음) 에서도 난다.
  ⑥ **M03 존 카드 캡션 행 순서** — 설명이 위, 이름·온도가 항상 맨 아랫줄(설명 유무로 이름 줄 높이가 카드마다 달라지던 것도 함께 해소).
  검증(로컬 :8765, `?embed=1&clean=1`): cpop 오버레이 `rgba(0,0,0,0)`·카드 `rgba(255,255,255,.6)`+`blur(26px) saturate(1.8)` = 추가 메뉴와 동일값 · 딜 시트도 동일값·스크림 투명 · ai-flame `animation:none` + 두 색 사선 · 자리표 상태기계(롱프레스=섬 / 사진 선택=유지 / 커밋=걷힘 / +버튼=없음 / 닫힘=걷힘) · 답변 후 말풍선 안 뜸 → 리워드 뒤 `rewarded=1`·마커 1→0 · `couponFly` 가 `--dx/--dy` 를 px 로 싣고 `cfFly` 재생 · 존 카드 설명(511px) 이 이름·온도(556px) 위 · 콘솔 에러 0. ⚠️ 이 환경은 Google Maps 타일이 안 뜨므로(`gm-style` 없음) 오버레이 DOM(`req-pin`·`add-pin`)은 합성 대신 **CSS 규칙을 주입 계측**으로 확인했다.
- 2026-08-13 M03+M16: v2.26.0 — **가져온 존이 그린 모양 그대로 · 존 카드 지면형** (콘솔 v0.100.0 과 짝).
  ① **(버그) `nhShape` 가 쌍(`[lat,lng]`)만 받아** 콘솔이 보낸 `{lat,lng}` 모양을 통째로 버렸다 — 중심만 살아 7칸 로제트가 새로 펴졌다. 두 모양을 다 받는다.
  ② **존 카드 `page`(지면형)** — 상단 지면 3번과 같은 문법(사진 풀블리드 + 유리 캡션), 스킨 재해석 없음(v3 원형 서클 규칙에서 `:not(.page)` 로 비킨다), 폭 30cqw(한 화면 3개).
  ③ **`seed.zoneCard`** — 무대가 카드 모양을 고르고 회차가 끝나면 되돌린다(관리자 설정을 시연이 영구히 바꾸지 않는다).

- 2026-08-12 M03+M16: v2.24.0 — **가져온 트렌드 존이 제 자리에 선다 · 존 안 컨텐츠도 나른다** (콘솔 v0.98.0 과 짝, 사용자 요청 2건).
  ① **M03 `zoneBook` 에 자리·모양** — `at`(중심)·`radiusKm`·`shape`(그린 칸 좌표 [[lat,lng],…] 30칸까지). v2.22 는 이름·색·칸 수만 날라서 콘솔이 가져온 존이 **실제 지도의 그 자리가 아니었다**.
  ② **M03 `zoneBook` 에 존 안 컨텐츠** — `spots`(10) · `feeds`(6). 소속 판정은 화면과 같다(스팟=`ptInZone` 좌표 · 피드=`zone` 태깅 또는 좌표). 각 항목이 제 좌표를 들고 가고, 사진은 https 주소만 싣는다(data URI 는 1MB 상한).
  ③ **M16 무대 항목이 제 자리를 들 수 있다** — `nhLayZone` 은 `at`·`shape`·`radiusKm` 을, `nhLaySpot`·`nhLayFeed` 는 `at` 을 본다. 우선순위는 **사람이 옮긴 자리(v2.20 `pos`) → 항목의 `at` → 무대가 편 자리**. 값이 없으면 v2.23 과 한 픽셀도 다르지 않다(손으로 적은 무대는 그대로).
  검증(로컬 :8766): 존 안팎 컨텐츠를 만들어 `zoneBook` 이 존 안 것만(태깅 포함) 싣는 것 · 자리를 든 존이 그 좌표에 3칸 그대로, 자리 없는 존은 7칸 로제트 · 자리를 든 스팟도 그 좌표에.

- 2026-08-12 M16+M08+M03: v2.21.0 — **dim/undim 액션 · fast 스텝 · 무대 트렌드 존 · 드랍의 지면 옵션 · 지면 바운스 제외 · AI 버튼 사선 흐름** (콘솔 v0.94.0 과 짝, 사용자 요청 7건 중 앱 몫).
  ① **M16 `dim`/`undim` 액션 신설** (어휘 3중 동기화: 앱 `NH_ACTIONS` · 콘솔 `PLAY_ACTIONS` · 프롬프트 `ACTION_LIST`) — `dim`(v=남길 불투명도 %, 5~80 · 빈 값 22)이 **그 순간 깔려 있던** 지도 컨텐츠(스팟·피드 핀·Request·딜)의 id 를 `nhDimIds` 에 적고 그 오버레이만 `filter:opacity()` 로 흐린다. 이후 뜨는 것은 표에 없어 제 불투명도 — "이 다음 것만 봐 달라". 렌더가 DOM 을 새로 만들므로 각 오버레이 `onAdd` 가 표를 다시 본다(바운스 표와 같은 구조, 클러스터는 멤버 전원이 표에 있을 때만). `undim`·`nhReset` 이 되돌린다.
  ② **M16 스텝 `fast:true`** (additive) — 연출(터치 표식·타이핑·바운스·시트)을 접고 **그 자리에서 동기 커밋**한다(write 는 컴포저 없이 직접 — 컴포저 textEl 은 onAdd 다음 프레임에 생겨 그 자리 commit 이 빈 글을 등록한다). 콘솔의 "단계 클릭 = 그 단계만 재생" 이 앞 단계를 60ms 로 조립하는 길 — 여태는 write 1.7초·request 2.1초 바닥 때문에 앞 단계들이 눈앞에서 순차 재생됐다.
  ③ **M16+M03 무대 트렌드 존** — `seed.zones`(최대 `NH_MAX.zone` 6, 이름 필수 · 설명 80자 · 사진 `img` · 색 `#rrggbb` · 온도 · `r` 1=7칸·2=19칸). `nhLayZone` 이 지역 둘레 결정적 자리에 헥사 클러스터를 펴 `trendZones` 에 넣는다 — 드로어 카드·존 리스트·온도(`heatTOf`)·포커스가 전부 기존 게이트로 동작하고, 트렌드 모드에서만 그려진다. `nhSweepTemp` 가 회차마다 걷는다. 색을 안 주면 `NH_ZONE_COLORS`(온도 팔레트+블루)에서 순번으로.
  ④ **M16 `drop v:feed` 에 `e`** — `'keep'` 이면 그 카드를 **상단 지면에 얹지 않는다**(`feedItems[].nonews`, `feedSummaryItems` 가 거른다). 지면은 매 렌더마다 다시 고르므로 항목에 표시가 남아야 한다. 빈 값 = 여태처럼 지면에도 실린다.
  ⑤ **M16 지면의 피드 파생 카드는 등장 바운스를 안 탄다** — `renderNews` 가 `it.feed` 카드에서도 바운스 표를 떼 가서 ①상단 지면 사진이 지도 핀과 **같이 튀고** ②표 2장(PC·폰 지도 몫)에서 한 장을 훔쳐 지도 핀 하나가 안 튀었다. 이제 지면 카드(`page` 드랍)만 튄다 — 지도 위 컨텐츠만 바운스.
  ⑥ **M08 트렌드 AI 버튼 = 붉은 두 색 사선 흐름** — v2.15 의 렌즈 무지개(`aiLensRainbow`)·발광(`aiShadeGlow`)을 걷었다(색이 계속 바뀌어 산만하다는 피드백). 선글라스는 **정지한 다크 렌즈**로 남고, 배경이 온도 팔레트 붉은 두 색(`#f2862e`·`#e23b2a`)의 115° 사선 흐름(`aiHeatFlow` 5s)이 된다. ⚠️ new·v3 스킨이 `.pn-ai` 배경을 축약형으로 덮으므로 **스킨 두 벌에도 흐름 배경을 재선언**했다 (v2.15 가 "재선언 삭제" 로 뒤집었던 자리를 다시 뒤집은 것 — 이번엔 배경이 곧 트렌드 구분이라 필수다).
  검증(로컬 :8765, `?embed=1&clean=1`): nhSanitize 가 fast·e:keep·zones 를 통과시키고 빈 이름·엉터리 색을 버림 · fast write/request 가 스텝 안에서 동기 커밋(demoSpots·fieldRequests 즉시 증가) · dim 5건 표시→drop 항목은 제외→undim 원복 · drop e:keep 이 nonews 를 남기고 feedSummaryItems 가 거름 · 존 3개(7·19·7칸, 지정 색/온도·자동 색) 깔리고 nhReset 이 전부 걷음 · 2회차 동일 · v3 스킨 트렌드에서 두 색 그라디언트+aiHeatFlow, 베이직 원상, 렌즈/선글라스 애니 없음 · 콘솔 에러 0.
- 2026-08-12 M17+M07+M16: v2.20.0 — **딜을 어떻게 열지 단계가 정한다 · 쿠폰 받기 액션 · Request 핀이 똑바로 서고 끌린다 · 옮긴 자리가 PC 를 넘는다** (콘솔 v0.93.0 과 짝, 사용자 요청 5건).
  ① **M16+M17 `pop v:deal` 에 `e` 가 붙는다** — `'sheet'` 면 쿠폰 시트, 빈 값·`'page'` 면 매장 전용 페이지(v2.15 기본 그대로). 같은 딜이라도 매장을 소개하는 장면과 쿠폰을 받는 장면은 화면이 달라야 한다.
  ② **M17+M16 `coupon` 액션 신설** — 시트의 '쿠폰 받기' 를 실제로 누르는 장면(터치 표식 → 한 박자 → 받기). 리워드 문구는 **따로 정한다**: `v`=문구 · `e`=표시 초(`'0'` 이면 안 띄운다). 받는 일과 말하는 일을 갈라 놔야 "쿠폰만 받고 말은 다음 장면이" 같은 연출이 된다. 시트의 `alert()` 도 함께 걷었다(`claimDeal`) — 그 창은 **자바스크립트를 멈춰** 재생이 그 자리에 섰다(v2.18 의 `prompt()` 와 같은 이유).
  ③ **M07 Request 핀이 똑바로 선다** — 물방울을 만들려던 `rotate(-45deg)` 가 세 스킨 모두에 남아 legacy 는 핀이 기울고, 원으로 다시 그린 new·v3 에서도 **그림자가 45° 비껴** 떨어졌다. 회전을 걷고 원으로 통일(글리프의 되돌림 회전도 함께 제거).
  ④ **M07+M16 Request 핀을 끌어 옮긴다** — 스팟·피드가 오래 하던 제스처를 Request 도 갖는다(`ReqPin._onDown`·`moveRequest`). 무대 항목이면 `nhPosNote` 가 자리를 남긴다 — `rqw`·`nhReqIds` 계약(v2.3·v2.18)은 적혀만 있고 **끄는 손이 없어 죽어 있었다**.
  ⑤ **M16 옮긴 자리의 저장소가 콘솔로 올라간다** — `NH_POS_KEY`(localStorage)는 이 기기의 것이라 **다른 PC 에서는 없는 값**이었다(같은 데모인데 자리가 달랐다). 이제 `nh:run` 이 `pos` 를 실어 오고(`nhPosRecv`, 받은 값 우선), 핀을 옮기면 `nh:pos` 로 콘솔에 알린다 — 저장은 콘솔의 데모 문서가 한다. localStorage 는 폴백으로 남긴다(콘솔 없이 여는 임베드).
  검증(로컬 :8766, `?embed=1&clean=1`): `pop v:deal e:sheet`=시트·빈 값=매장 페이지 · `coupon` 이 시트를 닫고 지정한 문구를 3초 띄움(alert 0회) · `nhPosGet` 이 받은 값 → localStorage 순, 5km 밖 무시 · `moveRequest` 가 좌표와 동 이름을 함께 옮김(역삼1동→서초2동) · `nhSanitize` 가 잘못된 pos 키·좌표를 버림. ⚠️ 핀 **드래그 제스처**와 핀 픽셀은 창이 표시되지 않는 세션이라 미검증(지도 오버레이가 프레임을 못 그린다) — 모양은 puppeteer 로 따로 찍어 확인했다.
- 2026-08-12 M17+M16: v2.17.0 — **매장 페이지의 글·사진을 콘솔이 정한다 · 액션 한 줄 · 잉크 CTA** (콘솔 v0.90.0 과 짝, 사용자 요청 3건 중 앱 몫).
  ① **M16 `nhSanitize` 가 딜의 `addr`·`desc`·`photos` 를 통과시킨다.** v2.15 는 `nhLayDeal` 에만 두 칸을 뚫어 놓고 sanitize 에서 걷어냈다 — 콘솔이 보내도 도착하지 않는, 화면만 보면 알 수 없는 종류의 누락이다(임베드는 **모든** 시나리오가 sanitize 를 지난다). `photos` 는 최대 `NH_MAX.dealPhoto`(9, 시안 3열 기준)이고 `nhImgSrc` 를 통과한 주소만 남는다. `desc` 상한은 120 → **300** (매장 소개는 한 문장으로 안 끝난다).
  ② **M17 `storeFeedPhotos` 는 사람이 올린 사진이 있으면 그것만 쓴다.** 근처 피드를 섞으면 "내가 올린 것" 과 "앱이 주워온 것" 이 한 그리드에 뒤섞여 무엇을 고쳐야 그 칸이 바뀌는지 알 수 없다. 안 올렸으면 여태 그대로(같은 매장 → 400m → 결정적 `seedImg`).
  ③ **M17 액션 4버튼이 언제나 한 줄이다.** `flex-wrap:wrap` 이라 폰 폭에서 **'타임딜 쿠폰받기' 가 둘째 줄로 내려가** CTA 가 접힌 자리에 숨었다. `nowrap` + 알약을 조인다(글자 3.1→2.9cqw · 좌우 3.8→2.8cqw · gap 2→1.6cqw). 넘칠 때는 잘리지 않고 옆으로 밀린다(`overflow-x:auto`, 스크롤바 숨김) — 줄은 어떤 경우에도 하나다. 375px 실측 308/341px.
  ④ **M17 CTA 하이라이트가 보라(#7b61ff) → 잉크(#1a1a1a)** — 딜 시트의 '쿠폰 받기'(`ds-claim`)와 같은 색이다. 기본형·v3 양쪽. (칩의 보라는 시안 그대로 남겼다.)
  검증(로컬 :8765, `?embed=1&clean=1`): `nhSanitize` 가 세 칸을 실어 나름 · 매장 페이지가 콘솔 값으로 주소줄·소개·그리드 4칸을 그림 · 액션 **1줄**(375px 308/341 · 1146px 폭에서도 1줄) · CTA computed `rgb(26,26,26)` · `node tools/check.js` PASS.
- 2026-08-12 M00+M05+M04+M07+M17+M15 (⚠️교차 `contentScale` 계약 변경): v2.16.0 — **컨텐츠는 지면에 고정 · 점까지 크기가 이어진다 · 피드 핀 깜박임 · 토글 폭** (사용자 요청 4건).
  ① **M00 `contentScale` 의 클램프(0.7~1.6)를 걷었다.** v1.95 는 컨텐츠끼리의 크기 관계를 맞추려고 한 곡선·한 클램프로 모았는데, 그 클램프가 곧 **"줌아웃하면 컨텐츠가 지면 대비 커진다"** 였다 — 지도는 절반이 되는데 컨텐츠는 0.7 에서 멈추니 줌 16 의 건물 하나가 줌 13 에서 블록 하나가 된다. 이제 `2^(z-16)` 순수 지면 고정이다(설정 px = 고정된 미터 범위). 컨텐츠끼리 같이 움직인다는 v1.95 의 성질은 그대로다 — 곡선은 여전히 하나다. ⚠️ **지역·존 이름표는 뺐다**(`labelScale`, 0.7~1.6 유지): 이름표는 지면 위 컨텐츠가 아니라 지도의 이름표라 지면에 고정하면 시 단위 줌에서 0.4px 가 된다. `MapLabel.draw` 만 이 함수를 쓴다.
  ② **M00 `contentDot(m,z,basePx,dotPx)` 신설 — 점 전환이 크기에서 이어진다.** 점 시점은 관리자 설정(`spotDotScaleM`)인데 크기 곡선과 무관해서 줌 17 의 50px 사진이 줌 16 에서 12px 점이 됐다(4배 점프 = 사용자의 "확 변한다"). **임계값 한 줌 전부터**(`DOT_RAMP=0.5`) 배율을 점 크기로 당겨, 임계값에 닿는 순간의 크기가 정확히 점 크기다 — 크기는 그대로고 모양만 바뀐다. 그 구간 밖은 순수 지면 고정. 지면 고정이라 아주 멀리서 설정과 무관하게 점보다 작아질 때도 점 크기에서 멈춘다. `SpotBubble.draw`(이모지 기준 8px) · `FeedThumb.draw`(12px) · `DealPin.draw`(34→12px) · `ReqPin.draw` 가 쓴다. **ReqPin 은 점 모양이 없어 점 크기까지만 줄고 사라지지 않는다.** 남는 모양 변화는 CSS 트랜지션 .22s(reduced-motion 이면 없음).
  ③ **M05 피드 핀을 지우고 새로 만들지 않는다.** `renderFeedMarkers` 가 매번 `clearFeedMarkers()` 로 전부 날려서, 줌 변경마다(`reclusterFeedMarkers` ← idle) `<img>` 가 새로 붙고 디코딩 전 한 프레임이 빈 원으로 그려졌다 — 그것이 "줌할 때 사진이 깜박인다" 다. `feedPinKey`(클러스터 멤버 id 집합) → `syncFeedPins` diff → `FeedThumb._adopt`(좌표·사진·온도·개수만 덮어씀). `img` 비교는 `getAttribute('src')` — `.src` 는 절대경로로 정규화돼 매번 달라 보인다. 온도 칠은 `_paintHeat` 로 떼어 onAdd 와 공유. 실측 재사용률: 같은 줌 29/29 · 줌 16→16.4 28/30 · 16→15 22/26 (전엔 매번 0). 고아가 된 `clearFeedMarkers` 제거.
  ④ **M15 토글 트랙이 36px 인데 48px 로 늘어나 있었다.** `.toggle-switch` 도 label 이라 `.setting-row label{min-width:48px}`(특정성이 더 높다)를 물려받는다. v2.15 가 잡은 v3 132px 건은 `#adm-panels` 안에서만이라 앱 페이지 좌측 패널·다른 스킨은 그대로였다. 베이스 CSS `.setting-row label.toggle-switch{min-width:0}` 한 줄로 전 페이지·전 스킨 수렴.
  검증(로컬 :8765): 배율·점 전환 크기표 줌 0.5 단위 실측(피드 z14→19 = 12·12·12·19·42·71·100·141·200px) · 핀 DOM 재사용률 · `_adopt` 후 img 동일성/뱃지/`--heat` · 토글 48→36 · 콘솔 에러 0 · `node tools/check.js` PASS. ⚠️ 샌드박스 Maps 가 오버레이 수명주기를 안 돌려 라이브 줌 애니메이션 육안 확인은 못 했다(v2.15 와 같은 한계) — draw() 를 직접 돌려 값으로 검증.
- 2026-08-11 M16: v2.14.0 — **burst 줌아웃을 프레임으로 돌린다** (사용자: "줌아웃이 끊기기도 하고 자연스럽지 않다"). v2.13 은 `setZoom` 을 열두 번 나눠 불렀는데, `setZoom` 은 **부를 때마다 Maps 자체 애니메이션(0.3초쯤)을 시작한다** — 다음 걸음이 그것을 중간에 자르고 새로 시작하니 계단처럼 끊겼다. 이제 `moveCamera`(애니메이션 없이 카메라를 그 값에 놓는다) + `requestAnimationFrame` 으로 **매 프레임** 조금씩 옮긴다. 이징은 easeInOutSine — 시작·끝이 느려 "빠져나가는" 느낌이 난다. ⚠️ **폰 지도만 매 프레임 움직인다**: PC 지도는 임베드에서 `display:none` 이라 카메라 호출이 무시될 수 있고, 그 상태로 PC 가 idle 을 쏘면 미러(map → phoneMap)가 폰을 시작 줌으로 되돌린다. PC 는 끝에서 한 번만 맞춘다(`camLand`). 컨텐츠 반경도 계산값이 아니라 **카메라가 실제로 있는 줌**(`zNow`)을 읽는다 — 이징이 붙어 진행이 시간에 비례하지 않는다. rAF 가 안 도는 곳(백그라운드 탭·숨은 iframe)을 위해 `zoomWin+400ms` 안전망이 목표 줌에 앉힌다.
- 2026-08-11 M04+M16+M07: v2.13.0 — **스팟 오버레이 재사용 · burst 가 줌아웃과 함께 · 무대 Request 는 안 만료된다** (사용자 요청 3건).
  ① M04: `renderSpots` 가 **있는 것은 두고 바뀐 것만** 만든다(id 로 짝맞춤). 여태 매 렌더마다 전부 지우고 다시 만들었는데, 등장 연출이 붙으면서 `drop` 하나에 모든 말풍선이 새 DOM 이 돼 **이미 있던 것까지 같이 튀었다**. 피드 핀은 사진 한 장이라 다시 만들어도 티가 안 나서 증상이 스팟에서만 보였다. 재사용 시 좌표·설정을 물리고(`_dir`/`_gap` 은 자리가 바뀔 때만 버린다), 사라진 것만 `setMap(null)`.
  ② M16: `burst` 의 줌아웃을 **듀레이션에 걸쳐** 돈다(앞 80% 를 12걸음, 소수 줌). 시작하자마자 목표 줌으로 가던 v2.12 는 카메라가 0.3초 만에 다 빠져 "줌아웃하며 쏟아진다" 가 두 장면으로 갈렸다. ⚠️ 처음 한 번은 **지금 줌 그대로 자리만** 잡는다 — 목표로 먼저 튀면 걸음이 도로 줌인이 된다. 반경도 그 순간의 줌(`zAt`)을 따라 넓어진다: 목표 줌 기준 고정 반경이면 초반 항목이 아직 좁은 화면 **밖**에 떨어져 "줌아웃 뒤에야 뜬다" 로 보였다.
  ③ M07: 무대가 깐 Request 에 `stage:true` — `reqActive` 가 10분 만료를 면제한다. 데모를 만드는 사이 10분이 지나면 핀·드로어·팝업에서 통째로 사라지고, `pop v:req` 는 빈손, `answer` 는 "종료된 Request" **네이티브 alert 로 재생을 멈춰 세웠다.** 무대의 시간은 시연의 시간이지 벽시계가 아니다.
- 2026-08-11 M16+M17+M07+M04: v2.12.0 — **빈 무대 누수 차단 · 바운스 소비 · burst 재조정 · write 이모지/자리 · Request 답장 연출 · 딜 사진** (콘솔 v0.84.0 D95 와 짝, 사용자 요청 8건).
  ① **빈 무대(`clean=1`)에 다른 데서 온 컨텐츠가 새던 것** — `nhEmbedIsolate` 는 부팅에서 한 번 비우는데, **지도 부팅의 geojson 콜백이 그 뒤에** `loadLocalSpotsInto` 로 저장된 글을 다시 깔았다(임베드는 실서비스와 같은 오리진). 딜은 걷는 사람이 아무도 없어 회차를 넘어 남았다 — "컨텐츠 탭에 없는 타임딜이 뜨고 안 사라진다" 의 정체. 다섯 loader(`loadLocalSpotsInto`·`loadNews`·`loadFeed`·`loadRequests`·`loadDeals`)를 clean 에서 막고, `nhWipeWorld()` 를 만들어 `nhEmbedIsolate` 와 **`nhReset` 이 함께** 쓴다 — 어느 경로로 새어 들어왔든 재생은 늘 빈 화면에서 시작한다.
  ② M16: 바운스 표를 **쓰고 버린다**(`nhBounceTake`). 시간(1.6초)으로 지우던 v2.11 은 그 창 안에 다른 항목이 깔리면 전체 재렌더로 **앞 항목까지 다시 튀어** 화면이 깜박였다. `nhBounceMark(id,n)` 의 n = 그 종류를 그리는 지도 수(스팟·피드 2, 나머지 1).
  ③ M16: `burst` 재조정 — 상한 50(`NH_BURST_MAX`), 종류를 `+` 로 **여럿**(`nhBurstKinds("spot+feed")`), 등장 시각을 결정적 흔들기로 흩어 **줌아웃이 도는 동안부터** 마구 생긴다(v2.11 은 앞 15% 를 비우고 등간격이라 메트로놈이었다), **바운스를 안 붙인다**(깜박임의 원인).
  ④ M04+M16: `write` 에 `e`(이모지)와 **옮긴 자리 기억** — `nhPosGet('write',n)`. 여태 지역 좌표 +0.0012 에 박혀서 끌어 옮겨도 다음 재생에 제자리로 돌아갔다. id 규칙이 달라(`sp_…`) `nhWriteIds` 표로 잇는다.
  ⑤ M07+M16: `answer` 가 **쓰이는 모습**을 보여준다(`nhAnswerTyped`) — 팝업의 답장 줄에 글자를 하나씩 넣고 보낸다. 상세 팝업의 `prompt()` 도 인라인 입력으로 바꿨다(그 창은 스크립트를 멈춰 재생이 그 자리에 선다).
  ⑥ M17: `seed.deals[].img` — 바텀시트 위 히어로 사진(`#ds-img`). 없으면 여태처럼 이모지만.
- 2026-08-11 M16+M17+M05+M11: v2.11.0 — **임베드가 지면 타입을 받는다 · 딜 점 표시 · 클러스터 중앙값 · 등장 바운스 · `burst` 액션** (콘솔 v0.83.0 D94 와 짝, 사용자 요청 6건 중 앱 몫 5건).
  ① M11+M16: **상단 지면 타입(`newsCardVer`)이 임베드에 영영 기본값이던 것** — 스킨·스타일은 `cloudSave → shared/publicSettings` 로 건너가는데 cardVer 만 `shared/news`(SDK 전용)로 다녀서 REST 로 읽는 persona-vc 임베드가 못 봤다. `settingsSnapshotFull`·`applyExtraSettings` 에 넣고, 지면 타입 변경이 `markCloudDirty` 도 부른다. ⚠️ **배포 후 관리자가 지면 타입(또는 아무 설정)을 한 번 다시 적용해야** 공개 문서에 실린다.
  ② M17: 딜 핀도 축소에서 **점**이 된다 — 스팟·피드와 같은 기준(`spotDotScaleM`), `.dl-dot`(12px·라벨 숨김·중심 앵커). v3 스킨의 3.5px 테두리는 점에서 1.5px 로.
  ③ M05: **클러스터 핀 위치=멤버 중앙값** — 첫 멤버 좌표로 두면 줌아웃 중 클러스터가 합쳐질 때마다 그때의 첫 멤버 자리로 널뛰었다. 그룹핑 기준(첫 멤버 픽셀)은 그대로 — 멤버 구성까지 흔들면 다른 문제다.
  ④ M16: **등장 바운스**(`nhBounceMark`·`.nh-pop-in`) — drop·post·postfeed·burst 로 지금 생긴 것만 뿅 하고 나타난다. 렌더가 전체를 다시 만들므로 만든 쪽이 id 를 적고 각 오버레이 onAdd 가 본다. 시간(1.6초)으로 지운다 — 첫 소비에서 지우면 PC·폰 두 지도 중 먼저 만든(임베드에선 안 보이는) 쪽이 먹는다. 루트가 아니라 자식을 흔든다(루트 transform 은 지도 배치가 쓴다). reduced-motion 존중.
  ⑤ M16: **`burst`** — 엔딩 연출. `v`=종류(spot|feed|deal|mix)·`i`=개수(1~24)·`e`=줌(11~16, 기본 13)·`ms`=쏟아지는 시간(이 액션만 15초까지 — sanitize 특례). 줌아웃 먼저, 자리는 줌 레벨에 비례해 편다(고정 반경이면 줌아웃 화면의 가운데 한 줌에 몰린다). 문구·자리·시각 전부 결정적(heatJitter + 시나리오 키). ⚠️ `nhLayDeal` 원가를 `%8` 로 접었다 — burst 가 NH_POST_FROM(50)+ 순번으로 깔면 원가가 25만 원대로 튄다(v2.2 의 "30만 원 모자" 와 같은 결).
- 2026-08-11 M16+M05+M10: v2.10.0 — **피드 카드에 올린 사진 · 무대가 지면을 깨움 · 상한 확대** (콘솔 v0.82.0 D93 과 짝). ① `seed.feeds[].img` — 지면 카드가 v2.4 에 얻은 길을 피드 카드도 갖는다(`nhImgSrc` 통과분만, 없으면 `seedImg` 테마 색). 사진만 있고 글이 없는 카드도 받는다. ② **`nhSeedScenario` 가 피드만 깔았을 때도 `renderNews` 를 부른다** — 지도 탭 상단 지면은 관리자 지면 + `feedSummaryItems`(사진 있는 가까운 피드 4장)인데, `pages` 가 있을 때만 다시 그려서 **피드 카드만 깐 데모는 지면이 빈 채로 시작**했다("피드 사진이 왜 위에 안 뜨나" 의 원인 — 탭을 갈아타야 비로소 떴다). `nhDrop('feed')`·`nhPostFeed` 도 같이 부른다. ③ `NH_MAX` 로 상한을 한 곳에 모으고 올렸다(req 10 · spot 40 · feed 40 · deal 10 · page 12) — 콘솔이 컨텐츠 탭을 따로 내면서 무대가 "여는 장면의 전제" 에서 "동네를 채우는 자리" 가 됐다. ④ 상한이 커지면 옛 자리 대역(스팟 `10+i` · 피드 `20+i`)이 겹치므로 `NH_BAND`(종류당 100 칸 · `NH_POST_FROM` 뒤가 재생 중 생긴 글)로 갈랐다. 보관(`hold`) 항목의 번호도 **배열 순번 그대로**로 통일 — 스팟·피드만 대역을 미리 얹어서 같은 항목이라도 hold 를 켠 것과 안 켠 것이 다른 자리에 깔렸다(v2.2 의 딜 가격 사고와 같은 결).
- 2026-08-11 M13+M00+M04+M05+M07+M17: v2.9.0 — **시드가 지도를 죽이던 것 · 문구 다양화 · 겹침 방지 전면 개편.** ①M13: `sgSearchPlaces` 가 `PlacesService` 에 **지도 컨테이너 div** 를 넘겨 Maps 의 DOM 자리에 출처 표기가 끼어들었다 — 관리자 콘솔에서 시드 생성 시 지도가 사라지던 원인. **Map 객체**를 넘긴다. ②M13: `SG_TPL` 을 종류마다 3~5벌로(순번으로 고름 — 결정적), AI 프롬프트에 장소 분류·현재 시각·"같은 틀 반복 금지"·"지어내지 말 것" 추가. 프롬프트의 `'서울'` 하드코딩 제거(수원에서 거짓을 말했다). ③M00: `declutterBoxes` 전면 개편 — **모든 마커가 후보를 갖는다**(말풍선 4방향×3거리 `declGaps`, 핀 제자리+황금각 14곳 `pinNudges`). 첫 후보가 제자리라 안 겹치면 안 움직인다. 순서=우선순위(딜→Request→사진→말풍선). 후보 거리는 **마커 크기 비례** — 고정값이면 큰 핀이 여전히 물린다. `declutterOn` 이 딜 핀을 받는다(전엔 빠져 있었다). 핀은 `_ndx`·`_ndy` 를 draw 에서 얹고 앵커(`_ax`·`_ay`)는 원래 좌표를 지킨다(안 그러면 잴 때마다 흘러간다).
- 2026-08-11 M13+M08: v2.8.0 — **지역 시드 생성이 AI 문구를 받는다** (콘솔 v0.81.0 D92 와 짝). 콘솔의 `/api/app-agent` 가 Ask Map 전용으로 잠겨 있어 seed-gen 이 **구조적으로 불가능**했다: 질문 300자 상한(장소 목록이 잘림) · 시스템 규칙 "200자·평문·목록 금지·역할 불변"(모델이 거절) · `tidyAppAgentAnswer` 의 240자 절단(JSON 파괴). 콘솔이 `context.mode` 로 갈라 seed-gen 전용 시스템/상한/후처리를 쓴다. 앱 쪽은 `sgAfterPlaces`→`sgCommit(…,aiWhy)` 로 **폴백 사유를 구분**해 표시한다 — 전에는 파싱 실패까지 "응답을 못 받았어요" 로 뭉쳐 200 이 오는 상황을 못 알아봤다.
- 2026-08-11 M05+M00+M08+M15: v2.7.0 — **피드 카드 높이 통일 · 온도 팔레트 4색 · AI 대각선 순차.** ①M05/M15: 사진 카드도 `aspect-ratio:1` 로 두고 `.fc-body` 를 **사진 위 글래스 캡션**으로(지면 카드 V3 와 같은 문법). 글 카드(1:1)와 높이가 안 맞던 것이 원인. ⚠️ 캡션이 absolute 가 되며 `.fc-like` 의 기준이 카드→캡션으로 바뀐다 — `static` + `margin-left:auto` 로 메타 줄 오른쪽 끝에 둔다. ②M00: **`HEAT_STOPS` 를 app.js 최상단 단일 기준으로** (`#9dc64c·#f2c53d·#f2862e·#e23b2a`), `PALETTE`(색상 팝업 프리셋)가 여기서 파생 — 전에는 두 곳에 적혀 빨강이 달랐다(#DE2F2A vs #E23B2A). `heatColor` 는 정거장 N개 보간으로(0.5 기준 2구간 하드코딩이라 4색에서 가운데가 빠질 참). CSS `--heat` 폴백 5곳 동기화. ③M08/M15: `aiHeatFlow` 를 135° 순차 이동 하나로(플리커 제거, 글로우는 고정값). 팔레트를 두 바퀴 적고 끝=시작색 — 대각선은 0%→100% 가 한 주기가 아니라 이어 붙는 자리가 튄다.
- 2026-08-11 M05+M04+M00+M13+M08+M15: v2.6.0 — **지도 표시 6종.** ①M05/M15: 베이직 피드 핀의 `filter:grayscale(1)` 제거 — 무채색 규칙 대상은 크롬(링·뱃지)이고 사진은 예외다(v1.58). ②M13: `seedSpread`(`SEED_MIN_M=85`) — 종류를 가로지르는 겹침을 완화로 없앤다(결정적 8패스, dongAt 재판정이 라벨을 지킨다). ③M00/M04: `spotDirById` — 말풍선 방향을 **스팟 id 로 기억**해 줌·팬·재렌더에 안 움직인다. 이미 자리를 정한 것은 declutter 에서 고정 장애물(`spotDirForget` 가 청소). ④M00: `zoneHeatAt`/`contentHeatT`/`HEAT_SPREAD` — 존 온도를 **분포의 중심**으로 항목마다 흩는다(뜨거운 존일수록 뜨거운 항목 비율↑). 수동 `temp` 우선. 섞기는 `heatJitter`(FNV-1a+fmix32) 한 벌 — `h*31+c` 는 끝 글자만 다른 id 를 이웃 값으로 몰아 같은 존이 한 색이 됐다(`nhAutoTemp` 도 이 함수로 통합). ⑤M05/M15: v3 `.fc-like` 에 `right:auto;bottom:auto` — 바탕 규칙의 우하단 값과 물려 칩이 328×576px 로 늘어나 사진을 덮었다. ⑥M08/M15: `aiHeatFlow` — 트렌드 AI 버튼 배경이 HEAT_STOPS 를 따라 흐른다(활성은 링으로, reduced-motion 은 정지). ⚠️ v3 스킨에 그라디언트 재선언 필요 — `body[data-skin="v3"] .pn-ai` 의 `background` 축약이 명시도로 이긴다.
- 2026-08-11 M11+M12+M15+M16: v2.5.0 — **공개 설정 문서 · 관리자 메뉴 재정비.** ① `shared/publicSettings` — 관리자 설정 스냅샷을 json 문자열 하나로 담는 문서. `cloudSave` 가 쓰고 임베드가 **REST fetch** 로 읽는다(`loadRemoteSettings` — SDK 를 안 붙이는 M16 설계 유지). cross-site iframe 에서 localStorage 캐시가 안 보이는 문제(D91 ③)의 자동화 답. 우선순위: 공개 문서 > 캐시 > settings-default.json > 코드. 스냅샷 생성·적용은 `settingsSnapshotFull`/`applyFullSettings` 한 벌. **firestore.rules 에 비로그인 읽기 매치 추가 — 콘솔 게시 필요**(게시 전 403 = 조용히 폴백). ② 관리자 메뉴 5그룹 재편(📦 컨텐츠 / 🌱 채우기 / 🖥 화면·디자인 / 🗺 지도 스타일 / 🛠 시스템) + **📐 표시 옵션(s-view) 신설** — 컨텐츠 패널에 섞여 있던 표시 컨트롤 7종(피드 5 + 존 목록 카드 + 지면 카드)을 이동(id·배선 그대로). 적용 바·안내문은 드래프트 패널에서만 보이고, 팝업 제목은 내비 캡션에서 파생(`DRAFT_PANELS`, initAdminMenu).
- 2026-08-11 M16+M04+M05+M10: v2.4.0 — **무대 콘텐츠의 트렌드 온도 · 지면 카드에 올린 사진** (콘솔 v0.80.0 D91 과 짝). ① `seed.spots[].temp`·`seed.feeds[].temp`(0~100) — `heatTOf` 가 이미 항목 `temp` 를 자동 계산보다 먼저 보므로 **렌더는 무수정**이고 `nhLaySpot`·`nhLayFeed` 가 값을 실어 주기만 한다. 안 정하면 `nhAutoTemp` 가 22~92 를 붙인다: 무대 콘텐츠는 좋아요가 0 이라 자동 계산이 전부 같은 식은 색을 내서 트렌드 모드가 아무것도 구분해 보여주지 못했다. ⚠️ **씨앗에 id 를 안 쓴다** — id 의 stamp 가 회차마다 달라 색이 재생마다 바뀌었다(검증에서 잡음). 항목의 **글+순번**을 섞는다. `nhTemp` 가 빈 값과 0 을 가른다(0 은 "가장 식은" 이라는 선택이다). ② `seed.pages[].img` — 있으면 그 사진, 없으면 테마 색. `nhImgSrc` 가 https·data:image 만 통과시킨다(이 값이 `<img src>` 로 간다). 콘솔은 Storage 에 올리고 주소만 보낸다 — 문서에 이미지를 담으면 Firestore 상한 1MB 에 닿고 재생마다 postMessage 로 통째로 건너간다. ③ M05 지도 아이콘 크기 옵션을 피드 컨텐츠 **맨 위**로(전에는 목록·안내문 아래 맨 끝이라 안 보인다는 말이 나왔다).
- 2026-08-11 M15+M11: v2.3.1 — **파일 백스톱도 스킨을 나른다.** v2.3.0 의 로컬 캐시는 브라우저 하나에만 있어서, **처음 보는 기기**는 `settings-default.json` 이 유일한 기준이다. 그런데 그 경로가 스타일 + `spotConfig` 까지만 알아서 스킨·존 카드·피드 시간·`spotMapBg`·`feedIconSize` 다섯이 빠졌다 — 설정 JSON 을 파일에 붙여 넣어도 그 기기만 다른 화면으로 떴다. 다섯을 `applyExtraSettings(s)` 한 함수로 묶어 **클라우드·캐시·파일이 같은 범위**를 적용한다(두 벌로 두면 한쪽만 고쳐진다). `initSettingsExport` 도 그 다섯을 평평하게 얹어 담는다 — `loadFileDefaults` 가 읽는 형식 그대로다. ⚠️ 파일 가드(`!s.styleConfig&&!s.spotConfig` 면 무시)는 그대로다: 내보내기는 언제나 `styleConfig` 를 담으므로 통과한다. ⚠️ 캐시를 심어 시험할 때는 **임베드 밖**에서 써야 한다 — `nhEmbedIsolate` 가 임베드 안의 `localStorage.setItem` 을 막는다(NH_POS_KEY 만 예외).
- 2026-08-11 M17+M16+M05+M15: v2.3.0 — **딜 자동 시드 폐지 · 옮긴 무대 자리 기억 · 피드 아이콘 크기 · 관리자 설정이 임베드 기본값** (사용자 요청 4건).
  ① M17: `SEED_DEALS`·`ensureDealSeed`·`DEAL_NEAR_M` 삭제 — 추가하지 않은 딜 2개가 기본으로 떠 있었다. 딜은 무대(`nhLayDeal`)·시드 생성기가 명시한 것만 뜨고, 옛 자동 시드(`dl_N`·seed:true)는 `loadDeals` 가 걸러낸다(코드만 지우면 localStorage 의 것이 영영 남는다).
  ② M16: **사람이 옮긴 무대 자리를 기억한다** — 임베드에서 무대 스팟·피드 핀을 끌면(`nhPosNote`) 시나리오 id 단위로 `nowhere_stagepos` 에 남고, 다음 재생의 `nhLay*` 가 `nhSpread` 대신 그 자리를 쓴다(`nhPosGet` — 무대 중심 5km 밖 옛 값은 무시). `nhEmbedIsolate` 의 localStorage 차단에서 이 키만 예외. 무대 피드 핀(`fdn_`)은 임베드에서 소유자 없이도 끌 수 있게 했다. 딜·Request 핀은 드래그 장치 자체가 없어 이번 범위 밖.
  ③ M05: 피드 썸네일 핀 기준 크기 분리 옵션(`feedIconSize`, 0=스팟 이모지 크기 따름 — v1.63 의 한 몸 규칙은 기본값으로 유지). 피드 컨텐츠 설정 `#feed-icon-size`, 클라우드 동기(additive).
  ④ M15+M16: **관리자 적용 설정의 로컬 캐시**(`nowhere_settings_cache`) — `cloudSave`/`applyCloudData` 가 통째 스냅샷(스타일·spotConfig·스킨·카드스타일·피드시간·spotMapBg·feedIconSize)을 남기고, 임베드가 부팅에서 읽는다(코드 기본값 < settings-default.json < 캐시). 임베드는 Firebase 를 안 붙인다는 설계는 그대로 — 같은 오리진의 localStorage 만 읽는다. ⚠️ 그 브라우저에서 앱을 한 번도 안 연 기기는 캐시가 없어 파일 백스톱이 기준이다.
- 2026-08-10 M10+M16: v2.2.0 — **무대가 지면 카드를 깐다 · `page` 액션** (콘솔 D90). `seed.pages`(최대 6, admin.html `NEWS_MAX_COUNT` 와 맞춘 상한)를 받아 `nhLayNews` 가 깐다 — 사진 테마·지역이름(비우면 지도 중심의 동 이름)·한 줄, 탭(map/feed/social)별. 기능 데모의 **피드 탭 지면은 여태 항상 빈 껍데기였다** — `nhEmbedIsolate` 가 `newsItems` 를 비우고, 지도 탭에만 근처 피드가 자동으로 덧붙기 때문이다. `renderNews` 가 이미 `it.tab`·`it.title`·`it.region` 을 읽으므로 그리는 쪽은 **마크업 무수정**. `seedImg` 의 라벨 인자는 **비운다**(사진 안 칩 + `cps-title` 로 두 번 적힌다). `page` 는 `next|prev` 뿐이다 — 지도 탭의 `newsView` 는 무대 카드 뒤에 근처 피드가 최대 4장 붙어서 몇 번째가 될지 사람이 맞힐 수 없다(D89). 끝에 닿으면 실패를 보고한다. 접혀 있으면(`nowhere_sumfold` — 같은 오리진의 관리자 값일 수 있다) **먼저 펼친다.** ⚠️ **손가락 표식을 `nhTouchTarget` 에 걸지 않고 `nhPage` 안에서 직접 띄운다** — 그 등록표에 걸면 `nhAct` 가 표식 대상을 찾는 순간 `return true` 로 즉시 성공을 보고해서, 끝에 닿아 아무 일도 안 일어난 회차까지 `ok:true` 가 될 뻔했다.
  ⚠️ **리뷰에서 드러난 누수**: `allFeedEntries`(M05)도 `tab` 을 안 보고 `newsItems` 를 그대로 피드 풀에 얹고 있었다 — `nhEmbedIsolate` 가 늘 비워 임베드에서는 죽어 있던 경로였는데, 무대가 그 배열을 채우기 시작하며 살아나서 `#feed-grid` 에 제목 없는 사진 카드가 한 번 더 떴다. 무대가 깐 항목에만 `stage:true` 를 달아 `allFeedEntries` 가 **그것만** 건너뛴다 — `it.tab==='feed'` 로 거르는 안은 기각했다: 관리자가 URL·업로드로 올린 실제 뉴스는 `tab` 필드 자체가 없어서, 그 기준이면 기존 피드 그리드 콘텐츠까지 통째로 사라진다.
- 2026-08-10 M17+M16: v2.2.0 — **무대가 타임딜을 깐다** (콘솔 D90). 사람은 `seed.deals`(최대 3)에 5칸(이모지·제목·가게·할인율·남은시간)만 적고, 가격 3칸은 **결정적으로** 만든다 — 원가 `9900+i*5000`원 · 지금가는 백 원 단위 내림 · 수량 `max(3,20-round(pct/5))`개. ⚠️ **`seed:false` 로 깐다** — `seed:true` 는 벽시계를 주기로 접어 안 끝나지만, 그러면 화면의 "남은시간" 이 여는 순간의 벽시계에 달려 "마감 1분 전" 이 성립하지 않는다. 짧게 적으면 재생 중 `dealActive` 가 false 가 되며 핀이 사라진다(연출로 쓸 수 있다). `pop`·`focus`·`drop` 이 `v:'deal'` 을 안다.
  그 과정에서 드러난 세 결함: ①`nhStore` 의 마지막 삼항이 모르는 종류를 전부 `fieldRequests` 로 집었다(모르는 종류는 이제 빈 배열) — `nhDrop` 의 kind 삼항도 else 가 `spot` 이라 `drop:deal` 이 스팟을 집던 것을 같은 모양으로 고쳤다. ②`popclose` 가 `closeContentPop()` 만 불러 딜 시트가 다음 스텝들 위에 그대로 얹혀 있었다 — 열려 있으면 `closeDealSheet()` 도 부르고, 손가락 표식도 `#ds-close` 를 겨눈다(전에는 숨은 `#cpop-close` 를 짚어 170ms 를 허공에 흘렸다). ③`timeDeals` 는 `nhReset`/`nhSweepTemp` 가 여태 안 걷는 유일한 콘텐츠였다 — `nhTempIds.deal`·`nhTempIds.page` 신설로 편입.
  ⚠️ **리뷰 수정 — 보관(`hold`) 딜의 가격이 자리 오프셋에 물려 있었다.** `nhLayDeal` 은 자리(`nhSpread`)와 원가(`9900+i*5000`)에 **같은 인덱스**를 쓰는데, `nhSeedScenario` 가 보관 항목을 `{v:d,i:60+i}` 로 담아서 드롭한 딜이 원가 30만 원대로 튀었다(자리 오프셋 60은 `nhLayDeal` 안에서 다시 더해진다). 이제 배열 순번 그대로 보관한다(`nhLayReq` 와 같은 방식). 만료된 딜은 `pop` 이 열지 않는다 — `dealActive` 로 막아 `0:00` 유령 시트를 없앴다.
  ⚠️ **`ensureDealSeed` 가 `IS_CLEAN_EMBED` 를 안 봐서** 빈 무대에 시드 딜 2개가 떠 있었고, 그 함수는 3km 이동마다 `timeDeals` 를 비우고 다시 세우므로 **무대 딜의 전제**였다 — 리뷰에서 한 겹 더 드러났다: 일반 임베드에서도 무대 딜을 깐 뒤 지역을 옮기면 `renderDealMarkers`→`ensureDealSeed` 의 자가복구가 방금 깐 것을 통째로 비웠다. 이번 회차가 깐 무대 딜이 있으면(`nhTempIds.deal`) 자가복구를 끈다. `loadDeals()` 가 `nowhere_deals` 를 읽는 것도 같은 오리진 누출이라 `nhEmbedIsolate` 가 비운다.
- 2026-08-10 M16: v2.1.0 — **피드 카드도 무대 없이(`postfeed`) · 곁들이는 값(e·n) · ms 하한 50** (콘솔 v0.78.0 D89 와 짝).
  ① `postfeed` — `post`(v2.0)의 피드판. `nhPostFeed` 가 `nhLayFeed` 로 깐다(시드와 같은 함수). 자리는 `nhSpread(c,60+n)`. ② 스텝에 **곁들이는 값 두 개**를 실어 보낸다: `e`(post=이모지 · postfeed=사진 테마) · `n`(올린 사람). additive — 옛 콘솔은 안 보내고 기본값(💬·cafe·동네주민)이 된다. ③ ⚠️ **ms 하한을 400 → 50 으로 내렸다.** 콘솔의 "이 단계 화면 보기" 가 앞 단계를 빨리 감는데 그 하한이 곧 단계당 대기시간이라 여덟 단계짜리가 3초를 기다렸다. 사람이 짜는 값은 콘솔이 400 아래로 못 만든다(MIN_STEP_MS) — 여기 50 은 0·음수 가드다. 비동기 커밋이 있는 write·ai 는 콘솔의 FAST_FLOOR 가 지킨다. ④ 무대 상한: 지도 글·피드 카드 4 → **10** (Request 는 3 유지)
  검증(로컬 :8765): post `e:"☕"` 반영 · postfeed 2건(이름 있는 것/기본값 동네주민, 사진은 data:image/svg+xml) · sanitizer 가 ms:60 을 그대로 통과 · `node tools/check.js` 통과
- 2026-08-10 M16: v2.0.0 — **남이 방금 올린 글 (`post`)** (콘솔 v0.77.0 D88 과 짝).
  hold+drop(v1.98)은 무대에 항목을 만들고 토글을 켜고 번호를 맞춰야 해서, "남의 글이 하나둘 올라온다" 는 가장 흔한 장면에 손이 세 번 갔다. `{a:"post",v:"글"}` 은 **무대를 안 거치고** 그 단계에서 지도 글을 만든다(`nhPostSpot`) — 여러 번 쓰면 실시간으로 올라오는 그림이 된다. ⚠️ 깔기는 시드와 **같은 함수**(`nhLaySpot`)를 쓴다: 뒤늦게 뜬 글만 모양·id·정리 대상이 달라지면 안 된다. 자리는 `nhSpread(c,40+n)` 으로 시드 스팟(10+i)·피드(20+i)와 안 겹치게 하고, n 은 회차마다 0 으로 돌아간다. 빈 글이면 `ok:false`. 액션 어휘 3중 동기화(NH_ACTIONS·PLAY_ACTIONS·ACTION_LIST). hold+drop 은 남는다 — 피드 카드·Request 를 뒤늦게 띄우는 길이다
  검증(로컬 :8765): post 2회 → 스팟 2건 생성 · `pop i:-1` 이 방금 것을 연다 · 빈 글 `ok:false` · `nhTempIds` 2건(멈추기가 걷어간다) · `node tools/check.js` 통과
- 2026-08-10 M16: v1.99.0 — **보고 있는 지도를 콘솔이 그대로 가져간다** (콘솔 v0.76.0 D87 과 짝).
  콘솔이 동네를 정하는 길은 **지도 링크 파싱**뿐이었는데 `naver.me` 단축 주소·카카오가 안 읽혀 자리를 정하는 것 자체가 관문이었다. 임베드의 지도는 원래 손으로 끌 수 있으니, 맞춰 놓고 가져가게 한다: 새 계약 `nh:where` → `nh:here{lat,lng,zoom}` (`nhHere()`). **폰 지도를 읽는다** — 임베드에서 보이는 것도 끄는 것도 폰이고 PC 지도는 `display:none` 인 미러의 출발점이다. **배율도 같이** 실어 `areaPlace.zoom` → `SEED_AREAS.custom.z` → `area` 단계가 `NH_AREA_ZOOM` 대신 쓴다(자리와 배율은 한 짝 — 같은 좌표라도 11 은 서울 전역, 17 은 골목 하나다). 배율 없는 옛 시나리오는 14 그대로.
  검증(로컬 :8765): `nh:where` → 폰 지도를 옮긴 그대로 `{37.5024,127.1063,17}` · `areaPlace.zoom:17` 시나리오 재생에서 PC·폰 둘 다 배율 17 · 배율 없는 시나리오는 14 · `node tools/check.js` 통과
- 2026-08-10 M16: v1.98.0 — **사람이 정한 동네 · 콘텐츠가 하나씩 뜬다** (콘솔 v0.74.0 D85·D86 과 짝).
  ① `areaPlace:{name,lat,lng}` → `nhCustomArea` 가 `SEED_AREAS.custom` 에 등록한다. **`nhSanitize` 의 area 검사보다 먼저** 해야 `{a:'area',v:'custom'}` 이 안 버려진다. `SEED_AREA_ORDER` 에는 넣지 않는다(시드 문서 id 를 정하는 배열이다). ② **`hold` + `drop`** — 무대는 시작 때 통째로 깔려서 "빈 지도에서 글이 하나둘 올라온다" 는 연출이 원리적으로 불가능했다. `hold:true` 항목은 `nhHeld` 에 보관하고 `{a:'drop',v:'spot'|'feed'|'req',i}` 가 하나씩 꺼내 깐다(꺼낸 것은 보관함에서 빠진다 → `i:0` 반복, 방금 깔린 것은 맨 뒤라 `pop i:-1`). ⚠️ 깔기를 `nhLaySpot`/`nhLayFeed`/`nhLayReq` 로 떼어 **시작 때와 drop 때가 같은 코드**를 쓴다. 보관함이 비면 `ok:false` 로 보고한다. 액션 어휘 3중 동기화(NH_ACTIONS·PLAY_ACTIONS·ACTION_LIST)
  검증(로컬 :8765): area/custom=true · drop 3회 true · 빈 뒤 false · 지도 중심 37.5024,127.1063 · `node tools/check.js` 통과
- 2026-08-10 M16: v1.97.0 — **멈추기가 화면도 처음 상태로.**
  `nh:stop` 이 `nhStop()` 만 불렀다 — 그건 토큰만 올린다. 대본은 멈추는데 그 회차가 만든 것(쓴 글·좋아요·깐 무대)이 화면에 남아, 다시 재생하기 전까지 세계가 지저분한 채였다(다시 재생하면 `nhRun` 의 `nhReset()` 이 쓸어내므로 "재생은 되는데 멈추면 남는" 모양이었다). 콘솔은 진작부터 이걸 초기화로 알고 있었다 — 유저 시나리오의 "처음부터" 가 `nh:stop` 을 보내며 "화면도 처음 상태로" 라고 적어 뒀다. **계약을 코드에 맞춘다**: `nh:stop` → `nhStop(); nhReset();`. **`nh:done` 은 안 건드린다** — 데모의 결말이 곧 보여줄 것이라, 끝나자마자 치우면 방금 만든 글을 볼 수가 없다.
  검증(로컬 :8765): 재생 뒤 스팟 2건 → 멈추기 → 0건 · `nhTempIds` 0 · `node tools/check.js` 통과

- 2026-08-10 M16: v1.96.0 — **빈 무대 임베드 `?embed=1&clean=1`.**
  `startEmbed()` 이 부팅 끝에 늘 `seedDemoData({silent:true})` 를 불러 **사이트 데모 데이터셋**(스팟 39·피드 56·Request 7)을 깔았다. 유저 시나리오에는 맞다 — "사람이 실제 앱을 쓴다" 가 전제라 동네에 남의 글이 있어야 한다(콘솔 D25). 하지만 **기능 데모**(콘솔 D79)는 제품의 한 기능을 보여주는 연출이라 화면에 있어야 할 것은 그 데모가 선언한 것뿐인데, 깔린 데이터 때문에 **"빈 화면에서 시작한다" 는 연출이 아예 성립하지 않았다.** 더 조용한 문제도 있었다: 시나리오가 아무것도 안 깔면 `nhPick` 이 **전역 시드로 폴백**해 깔지도 않은 남의 글을 열고 `ok:true` 로 보고했다 — 틀렸는데 실패조차 안 났다. `IS_CLEAN_EMBED` 신설 → 그때만 `seedDemoData` 를 건너뛴다. `nh:ready` 에 `clean` 을 실어 콘솔이 "빈 무대를 요청했는데 앱이 안 비웠다"(=앱 배포가 뒤졌다)를 화면에 띄울 수 있게 했다(additive — 옛 콘솔은 무시). **기본 임베드(`?embed=1`)는 안 바뀐다.**
  검증(로컬 :8765): clean → spots/feeds/reqs/news 전부 0 · 기본 → 39/56/7 회귀 없음 · `node tools/check.js` 통과

- 2026-08-08 M00 신설 앵커 + M16 (⚠️교차 M04 `SpotBubble.draw` · M05 `FeedThumb.draw` · M07 `ReqPin.draw` · M17 `DealPin.draw` · M00 `MapLabel.draw`): v1.95.0 — **줌 배율을 한 곡선으로 · 죽어 있던 데모 액션 셋.**
  ① **`contentScale(z)` 신설(M00 추가).** 지도 위 컨텐츠가 같은 `spotScale` 곡선에 **서로 다른 클램프 세 벌**을 걸고 있었다 — 라벨 `0.7~1.6` · Request/딜 핀 `0.34~1.3` · **스팟 버블과 피드 썸네일은 클램프 없음**. 그래서 줌 한 단계에 스팟은 2배로 뛰는데 핀은 상한에 걸려 거의 안 움직였고, 컨텐츠끼리의 크기 관계가 줌마다 달라졌다. 실측(줌13→18): 말풍선 14.6→260px, 이모지 3.7→118.5px(420px 폭 화면에서 28%), 피드 핀 10→104px, 핀은 3.8배가 상한. **한 곡선·한 클램프(0.7~1.6)** 로 모으니 전부 ×2.3~2.5 범위에서 **같이** 움직인다. 범위는 이미 쓰이던 것 중 가장 보수적인 라벨 값 그대로 — 양 끝에서 읽히는 것이 확인된 폭이다. 멀리서 스팟이 점이 되는 것은 `mapMpp` 기준 `isDot` 이라 이 변경과 무관하다
  ② **`scroll` 액션이 처음부터 아무것도 안 하고 있었다.** 선택자 `.pd-body`·`.tabpage`·`.feed-col` 이 **어느 파일에도 없는 클래스**다(마크업이 `#feed-page`·`#social-page`·`#phone-drawer-body` 로 바뀐 뒤 선택자만 남았다). v1.94 의 `ok` 보고가 붙으면서 이제 매번 `ok:false` 로 드러난다 → `nhScrollTarget()` 신설: 서랍→현재 탭 순으로 후보를 훑고 **실제로 넘치는 칸**을 먼저 고른다
  ③ **`chat` 액션이 엉뚱한 화면을 열고 성공이라 보고했다.** `socTab` 에 `'local'`/`'topic'` 을 넣고 있었는데 그건 방의 종류지 세그먼트가 아니다 — v1.91 Our/My Talk 분리 이후 값은 `'our'`/`'my'` 다. 어느 탭에도 안 맞아 **활성 탭이 하나도 없는 채로** `socRoomsFor` 의 else 가 걸려 **My Talk(1:1·내 Request)** 이 열렸다. 이제 `socTab='our'` + `socRoomsFor('our')` 에서 방을 받아 **목록이 아니라 방을 연다**(키 규칙을 베껴 두지 않는다 — 그게 어긋난 원인이다)
  ④ **`request` 액션이 네이티브 `prompt()` 를 띄웠다.** iframe 위에 브라우저 대화상자가 서서 재생이 멈추고, 그 순간만 앱이 아닌 것이 보인다. 게다가 진행자가 취소하면 Request 가 안 생기는데 스텝은 성공으로 기록됐다. `openRequestComposer(presetQ)` **optional 인자**(동결 앵커 규칙)로 시나리오의 질문을 그대로 넘긴다 — 사람이 직접 누르는 길은 그대로 prompt 다
  검증(puppeteer 실제 창): 줌12~18 배수 말풍선 2.52·이모지 2.29·피드 3.5·Request 2.29 · `chat:local`→Our Talk/역삼1동 채팅방 · `chat:topic`→🍜 맛집 탐방 · `scroll` `#feed-page` scrollTop 0→220 · `request` 대화상자 0건·Request 1건 생성
- 2026-08-06 M16: v1.94.0 — **재생이 실제 사용자처럼 (콘솔 v0.60.0 D72 와 짝).** ① `nh:step` 에 `ok` — 앵커·대상이 없어 화면이 못 따라온 스텝을 이제 콘솔에 알린다(그전에는 warn 으로 삼키고 대사만 흘렀다 = 조용한 거짓말). additive 라 배포 순서 무관. ② 터치 표식 — 누르는 액션(탭·AI·범위 칩·팝업 닫기)은 손가락 자국을 먼저 띄우고 170ms 뒤 실행. ③ write 글자별 타이핑(220ms 일괄 대입이 가장 큰 로봇 티였다 — 커밋 시점은 그대로라 콘솔 타이밍 계약 불변). ④ scroll 3박자(60%→40%→-15% 되올림). ⑤ focus 두 박자(팬→ms*0.4 뒤 줌 17 — nhAi 와 같은 패턴). ⑥ concern 스텝에서 화면 가장자리 비네트 한 박자. ⑦ 전역 카드에 남긴 좋아요를 `nhTempIds.like` 로 적어 sweep 이 되돌린다 — 두 번째 재생에서 하트가 이미 차 있던 결정성 누수. 전부 앱 내부 연출 + additive 필드라 **NH_ACTIONS 3중 동기화 불필요**, 저장된 시나리오·옛 콘솔 그대로 동작
- 2026-08-04 M13 (⚠️교차 M01 Maps 로더 `libraries=places` · M04/M05/M07/M17 항목 생성): v1.93.0 — **지역 시드 생성기 · 그룹 관리.** 기존 `seedDemoData` 는 고정 4지역에 미리 써 둔 문구를 깐다 — 시연 지역이 늘 때마다 상수를 고쳐야 하고 **처음 가 보는 동네에서는 아무것도 못 깐다.** 생성기는 **지금 보고 있는 지역**에 만든다: ①Places 근접 검색이 반경 안의 **실제 상호**를 주고 ②그 상호를 AI 에이전트에 넘겨 문구를 받고 ③**AI 가 없거나 실패해도 멈추지 않는다**(종류별 템플릿). 한 번의 생성 = **그룹 하나**, 항목은 `sgroup` 을 달고 그룹째 지도 이동·숨김·삭제. ⚠️ **기존 시드와 id 공간을 분리했다**(`sg_` vs `fs_`/`sps_`/`rqs_`) — 같은 플래그로 묶으면 🧹 비우기가 그룹을, 그룹 삭제가 기존 시드를 같이 날린다. ⚠️ **Places API 는 GCP 에서 따로 켜야 한다** — 현재 키는 `REQUEST_DENIED`. 그 경우 원인과 할 일을 그대로 알리고, 동 이름 기반 기본 장소로 만들지 물어본다(메뉴가 죽지는 않게)

- 2026-08-04 M09+M07+M03 (v3 8단계·마지막): v1.92.0 — **동 경계 토글 · 코인 적립 · °C 지표.** 드로어에 '보기' 섹션 신설(동 경계 City View · 현장 Request 도착 카드). 둘 다 **관리자 설정이 아니라 이 기기의 취향**이라 설정 블록(드래프트→적용)을 타지 않고 localStorage 에만 남는다 — 클라우드로 보내면 한 사람의 보기 취향이 모두에게 적용된다. 경계는 `phoneDataVisibility` 에 `boundaryShown` 을 AND 로 물렸다(모드 규칙은 그대로). 남의 Request 에 답하면 `🪙 500` 적립(내 것에 답하는 건 적립 대상이 아니다). 존 리스트 카드에 °C 배지 — 시안은 좋아요가 아니라 **온도로 지역을 말한다**

- 2026-08-04 M06 (⚠️교차 M07 Request 스레드): v1.91.0 — **Our Talk / My Talk(v3 7단계).** 3탭(동네·주제·프라이빗)에서 **2세그먼트**로 재편. Our=동네 채팅방+주제방, My=프라이빗+**내 Request 스레드**. ⚠️ **방의 저장 키는 그대로 둔다**(`local:` `topic:` `private:`) — 키를 바꾸면 이미 쌓인 대화가 통째로 고아가 된다. Our/My 는 목록을 고르는 **뷰**일 뿐이고 방 자신의 type 은 예전 그대로다. 예전엔 '동네' 탭이 목록 없이 바로 방으로 들어갔는데 시안은 **목록 → 대화 2단**이라 동네 방도 목록의 첫 줄이 됐다(그래서 뒤로가기가 항상 있다). 내 Request 는 방이 아니라 스레드라 탭하면 기존 상세 팝업(질문+답변)이 열린다

- 2026-08-04 M10+M03: v1.90.0 — **지역 Overview 패널 + 스토리 서클(v3 6단계).** 지면 카드를 탭하면 그 지역의 '지금'이 유리판 한 장에 뜬다(칩 줄·AI 한 줄 요약·사진 서클·소식 카드·둘러보기). ⚠️ **v1.62 규칙을 하나 바꿨다** — '지면 캐러셀=클릭 액션 없음'이었는데 시안이 지면 카드를 Overview 로 가는 문으로 쓴다. 스와이프는 그대로 두고 **탭에만** 액션을 붙였다(`newsDragging` 이면 무시). 칩은 **세어지는 것만** 올린다 — 시안의 `💬 40k`·`👥 현장 682명` 은 이 앱에 없는 숫자다(v1.81 교훈). 스토리 서클은 `#cp-zones` 존 카드를 **원형으로 다시 짠 것**이고, 링 색·온도는 `makeZoneCard` 가 `--zone-c`·`data-temp` 로 실어 보낸다(마크업 무수정). 배지는 `Hot Rising` 같은 등급이 아니라 **실제로 있는 값(°C)** 을 쓴다

- 2026-08-04 M17 신설 (⚠️교차 M07 렌더 시점·M11 표): v1.89.0 — **타임딜(v3 5단계).** 지도 ⏰ 핀 + 바텀시트. **왜 새 모듈인가**: 스팟·피드·Request 와 달리 딜은 **시간이 핵심**이라(남은 시간이 줄고 0 이면 사라진다) 기존 컨텐츠 배열에 얹으면 그 시간 규칙이 피드·지면 전체로 새어 나간다. 시드 딜은 만료되지 않고 (`seed:true` — `reqActive` 와 같은 장치) 남은 시간만 벽시계를 주기로 접어 계속 흐르게 한다. ⚠️ **딜은 무대를 따라와야 한다** — 처음엔 `feedItems` **배열 순서**로 자리를 골랐는데 시드가 5개 지역에 흩어져 있어 **13.8km 밖**에 세워졌다(실측). 센터에서 **가까운 순**으로 고르고, 이미 있어도 3km 를 넘으면 다시 세운다(임베드 시나리오가 지역을 옮겨 다닌다 — M16)

- 2026-08-04 M11 (⚠️교차 M04/M05/M07 숨김 필터·`allFeedEntries` 필드): v1.88.0 — **전체 컨텐츠 표 신설(v3 4단계).** 지금까지 콘솔의 컨텐츠 관리는 **종류별로 흩어져 있었다** — 스팟은 스팟 패널, 피드는 피드 패널, Request 는 어디에도 없었다. 한 표에 모으면 '지금 이 서비스에 뭐가 올라와 있나'를 한 번에 본다. 행은 만들지 않고 **기존 데이터를 읽어 조립한다**(`allFeedEntries` 재사용 + `fieldRequests`) — 표는 소유자가 아니라 **뷰**이고, 쓰기는 각 모듈의 함수를 부른다. `hidden` 은 **additive 필드**(없으면 공개).
  ⚠️ 두 가지가 조용히 틀릴 뻔했다: ①`allFeedEntries` 매핑이 `hidden` 을 안 실어 보내 소비 쪽 필터가 늘 통과하고 표 상태가 늘 '공개'였다 — **매핑이 필드를 빠뜨리면 에러가 아니라 무음 실패다.** ②숨김을 `rebuildSpots` 에서 걸렀더니 `spotMessages` 에서 사라져 **표에서도 안 보였다** — 숨긴 것을 되돌릴 방법이 없어진다. 목록은 원본을 갖고 화면(`renderSpots`)만 숨긴다

- 2026-08-04 M15+M14 (M11 화면): v1.87.0 — **v3.0 3단계(콘솔 재도색).** v3 는 폰 스킨이 아니라 **제품 전체의 재설계**다 — 핸드오프가 웹앱과 콘솔을 같이 그렸으므로 스킨 스위치가 콘솔까지 함께 움직인다(`body[data-skin="v3"].page-admin` 스코프, 되돌리기는 여전히 속성 하나). 시안의 콘솔 문법 셋을 가져왔다: ①종이 캔버스 위에 **흰 카드**(패널이 아니라 카드다) ②컨트롤은 전부 알약이고 **확정 동작만 검정 알약** ③좌측 내비는 회색 레일 위에서 **선택된 행만 흰 카드로 떠오른다** — legacy 는 색(옅은 파랑)으로 표시했는데 시안은 **높이**로 말한다. 콘솔은 폰 컨테이너 밖이라 전부 px

- 2026-08-04 M15 (⚠️교차 M05/M10 스킨 조건): v1.86.0 — **v3.0 2단계(지도 오버레이·탭 페이지).** 사진 핀이 **원형 + 두꺼운 컬러 링**이 되고 Basic 에서는 흑백으로 가라앉는다(색은 Trend 의 언어다). Request 핀은 검정 원 + 흰 링, 스팟 버블은 **컬러 몸통을 그대로 살린다**(v2 는 흰 유리로 바꿨지만 v3 는 에셋 그대로다 — `--spot-bg` 를 안 건드린다). 피드 카드는 v1.84 의 `.fc-body` 구조를 그대로 쓰되 **좋아요를 사진 좌상단 흰 알약**으로 — `position:absolute` 로 흐름에서 빼면 부모(카드) 좌상단이 곧 사진 좌상단이라 마크업을 안 건드리고 옮겨진다. ⚠️ **흰색은 헤더가 아니라 앱바가 갖는다** — 헤더를 통째로 칠했더니 트렌드에서 존이 없을 때 그 자리가 빈 흰 판(490px)이 됐다. 헤더는 지면 카드·존 칩 줄까지 품고 있다.

- 2026-08-04 M15: v1.85.0 — **새 디자인 v3.0 1단계(토큰·셸).** Claude Design 핸드오프(석촌동 에셋 기준 전면 재설계)를 **세 번째 스킨**으로 들인다. `APP_SKINS` 목록 하나로 모았다 — 전에는 `legacy 아니면 new` 라는 **둘을 전제로 한 분기**가 세 곳에 흩어져 있어서, 셋이 되는 순간 전부 틀렸다. v3 는 웜 오프화이트(#F4F3F1) + 코랄(#E8574A) + 온도 램프(36.5~99.9°C)이고, 하단 네비가 **회색 유리 위 아이콘만**(글자 없음)으로 바뀐다. `.pn-lb` 는 숨기기만 한다 — 마크업에서 지우면 legacy·new 가 같이 깨진다. 규칙은 전부 `skin-v3.css` 안에만 있고 style.css·skin-new.css 는 무수정 (스킨끼리 서로를 모른다)

- 2026-08-04 M05+M10 (⚠️교차: M15 `setAppSkin` 재렌더): v1.84.0 — **카드 부제·메타 줄.** v1.81 에서 "마크업 변경이라 스킨 밖의 일"로 미뤄 둔 마지막 조각이다. 피드 카드는 **사진 아래 흰 본문**(설명글 2줄 + `동 · 시간 … ♥n`)을 얻는다 — **설명글은 지금까지 상세 팝업에서만 보였다.** 카드를 세로 flex 로 만들고 본문에 `flex:1` 을 줘서, 한 줄짜리와 두 줄짜리가 나란히 서도 **메타 줄이 같은 높이에 선다**. 좋아요는 사진 위 흰 원형에서 메타 줄 오른쪽 숫자로 내려왔다. 지면 카드에는 `거리 · 시간` — 정렬용 제곱 좌표차 대신 `haversineM` 실측을 따로 뽑았고, **데이터가 없는 관리자 지면에는 줄 자체를 만들지 않는다.** 캐러셀 점이 그 줄과 자리를 다퉈 흰 본문에서는 오른쪽 끝 잉크색 점으로, 사진 위 캡션(cv3)에서는 본문을 점 위로 들어올렸다. **legacy 는 마크업까지 그대로** — 새 요소를 CSS 로 숨기는 게 아니라 새 스킨일 때만 만든다(그래서 스킨 전환이 재렌더를 부른다)

- 2026-08-02 M09: v1.83.0 — **(버그) 코드로 탭을 바꾸면 하단 네비가 안 따라가던 문제.** `.active` 는 네비 클릭 핸들러와 `setNavActive` 가 따로 관리했고, 호출부 여섯 곳이 `setNavActive(x); switchTab(x);` 를 짝지어 부르고 있었다. **M16 임베드 브리지의 `tab` 액션만 짝을 빠뜨려** 시연 중 화면과 네비가 어긋났다 — 하필 그 한 곳이 시연 경로다. 짝짓기를 외워야 하는 구조가 원인이라 `switchTab` 안으로 합쳐 **문을 하나로** 했다. 겸사겸사 `body[data-tab]` 훅도 심는다(스킨이 탭별로 갈라질 수 있게)

- 2026-08-02 M15: v1.83.0 — 지면 **풀블리드 히어로** (⚠️교차: M10 지면 CSS·M09 switchTab 훅). 사진이 화면 가장자리·최상단까지 차고 앱바가 그 위에 뜬다. 앱바를 **흐름에서 빼서**(absolute) 음수 마진 계산을 없앴다 — 끌어올릴 값이 앱바 실측 높이와 정확히 같아야 하는데 그 높이는 내용에 따라 변한다. 높이는 `body[data-tab]` 으로 갈린다(지도 78cqw / 피드·소셜 50cqw — 같은 높이면 그리드가 밀린다). 접으면 다시 카드로 내려온다

- 2026-08-02 M15: v1.82.0 — **(버그) 팝업 모서리가 내용을 잘라 먹던 문제.** `#content-pop` 은 `position:fixed` 오버레이라 폰 컨테이너 밖인데 `cqw` 를 썼다 — 컨테이너가 없으면 `cqw` 는 **조용히 뷰포트 폭으로 풀린다**(878px 창에서 6cqw=52.7px, 카드 폭 326px). px 로 되돌리고, 같은 이유로 부풀던 `.pdh-feature`(PC 드로어에도 있는 클래스)와 드로어 안쪽 반지름도 px 로 통일. 파일 머리말에 **"컨테이너 밖은 px"** 규칙과 해당 요소 목록을 명시

- 2026-08-02 M15: v1.81.0 — 새 스킨 **톤 재조정**. 딥 로열블루 → **밝은 시안**(`#1C9BD4`/`#5AC8F0`), 배경도 회색에서 물빛으로. 사진 카드는 칩을 흩는 대신 **하단 그라디언트 스크림 + 흰 캡션**, 좋아요는 우하단 흰 원형. 소셜 세그먼트는 **시안 트랙 위 흰 알약**. Ask Map 시트 상단에 옅은 시안. 레퍼런스에서 가져온 것은 **팔레트·유리·사진 처리지 정보구조가 아니다** — 별점·리뷰 수 같은 건 이 앱에 데이터가 없다

- 2026-08-02 M15: v1.80.0 — 새 디자인 스킨 **④ 오버레이(마지막 단계)**. Ask Map 이 오른쪽 위로 뜨던 작은 카드에서 **화면 폭을 다 쓰는 바텀 시트**가 된다(손잡이·ASK MAP 캡션·요약 카드·갈매기 붙은 질문 목록·채워진 입력바). 드로어·프로필 메뉴·상세 팝업·AI/Request 버블도 카드 문법으로. 상세 팝업은 `.modal-card` 가 아니라 `#content-pop` 으로 좁혔다 — 관리자 모달까지 따라 바뀌면 안 된다

- 2026-08-02 M15: v1.79.0 — 새 디자인 스킨 **②지도 오버레이 + ③탭 페이지**. 스팟 버블은 색이 **몸통에서 테두리로** 옮겨간다(흰 유리 + 온도/스팟색 링 — `--spot-bg` 를 링 색으로 재사용해 색 설정이 계속 의미를 갖는다). 피드 핀=라운드 사각 + 하단 중앙 온도 배지, Request 핀=액센트 원 + 흰 링. 탭 페이지는 지면 카드·피드 필터칩/카드·소셜 세그먼트/방 카드. **존 헥사와 동/존 라벨은 손대지 않았다** — 헥사는 Maps 폴리곤이고 라벨 색은 관리자 설정이 inline 으로 칠한다(설정을 이기는 스킨은 만들지 않는다)

- 2026-08-02 M15: v1.78.0 — **폰 셸 새 디자인(v2.0) 스킨 1단계.** `body[data-skin]` 하나로 갈리고 새 규칙은 전부 `skin-new.css` 안에만 있다(`style.css` 무수정 = 되돌리기가 속성 하나). 이번 단계는 **토큰·셸**까지 — 배경·타이포·헤더 컨트롤·모드 토글·하단 네비·AI 버튼. 렌즈가 트렌드면 변수 두 개를 갈아 액센트 계열이 통째로 넘어간다. 남은 단계: ②지도 오버레이 ③탭 페이지 ④팝업/드로어

- 2026-08-02 M09+M11: v1.77.0 — **폰 안에 콘솔이 없다.** 서비스 페이지 드로어의 `🧭 둘러보기 / 🛠 관리자` 탭과, 폰 드로어로 옮겨오던 설정·컨텐츠 섹션을 없앴다. 콘솔은 프로필 메뉴 → `admin.html` 하나뿐이다. 🧩 기능 보기의 ⚙ 설정은 `admin.html?adm=<패널>` 로 넘어가 그 블록을 바로 연다

- 2026-08-02 M08: v1.76.0 — Ask Map 의 답을 **persona-vc 콘솔의 격리 라우트에서 받아온다**(실제 모델·과금). 템플릿 매칭은 지우지 않고 폴백·롤백 경로로 남겼다. 계약은 바로 위 절 참고

- 2026-08-02 M16: v1.75.0 — 카메라 연출 액션 `zoom`·`focus` 추가. 시연에서 "어디를 보라" 를 화면이 말하게 하는 것. 자체 지도 조작을 만들지 않고 `goMapCam`(M09 앵커)만 부르고 양쪽 지도를 같이 움직인다. 액션 어휘는 콘솔 `PLAY_ACTIONS`·프롬프트 `ACTION_GUIDE` 와 **세 곳이 같이** 움직였다

- 2026-08-01 M16: v1.74.0 — `nh:ready` 가 표본 시나리오의 스텝 정의(`plan`)·`seed` 를 같이 준다. 콘솔이 재생 전 타임라인 전체를 보여주고, 단계를 눌러 그 지점부터 다시 보기(앞 단계 빨리감기)를 할 수 있다. `steps`(개수)는 그대로 둬서 옛 콘솔과 호환
- 2026-08-01 M16: v1.73.0 — **임베드 GPS 미사용**. `initMyLocation` 이 임베드면 기본 무대(`nhGoHome`, 강남)에 서고 위치를 묻지 않는다. 그전에는 실제 GPS 로 지도가 가서 모든 시나리오가 사용자의 현재 위치에서 시작했다(시드가 없는 자리 → 빈 화면). `nhReset` 도 기본 무대로 복귀
- 2026-08-01 M16 (M13 ⚠️교차): v1.72.0 — **시나리오마다 다른 콘텐츠**. `nhPick` 이 그 시나리오가 깐 것(`nhOwn`)에서만 고르고, 없을 때만 전역 시드로 간다. `seed.feeds` 신설(좋아요·스크롤 대상도 시나리오 것). 음수 인덱스(`i:-1`=방금 쓴 글) — privacy-worry 의 `pop i:0` 이 남의 글을 열어 대사가 거짓이던 것을 고침. 배치를 `nhSpread` 결정적 좌표로(Math.random 제거). 표본 4종에 각자 무대 부여
- 2026-08-01 M16+M13 ⚠️교차 M04/M05/M06/M07/M10/M12(임베드 격리·역할): v1.71.0 — 액션 7종 추가(`like` `write` `answer` `chat` `ai` `scope` `scroll`)로 시나리오가 **보기만 하지 않고 실제로 쓴다**. 시나리오별 `seed` 블록(재생 직전 주입·리셋 시 회수, `answerIn` 으로 재생 도중 답변 도착). 시나리오 4종을 서로 다른 기능을 쓰도록 재작성. `nhEmbedIsolate` — 임베드는 localStorage 를 쓰지도 읽지도 않는다
- 2026-08-01 M16+M13 ⚠️교차 M09(`cpopGoMap` optional 줌 + `goMapCam` 투영 폴백)·M15(CSS): v1.70.0 — `area` 지역 이동 액션(동결 앵커 `cpopGoMap` 호출), `nhPick` 이 지역 반경으로 콘텐츠를 거른다, `nh:ready` 에 `areas[]` 추가. 시드 4지역으로 확장(강남·잠실·성수 보강 + **방학·쌍문 신설, 일부러 희박하게**) — 우려 시나리오 `empty-neighborhood` 가 실제로 빈 화면을 보여주게 됐다. 임베드 여백 제거(프레임 비율은 콘솔이 책임진다). ⚠️ 시드 항목이 늘어 `gi`(문서 인덱스)가 밀렸다 — 클라우드 시드는 🧹 비우기 후 다시 채워야 한다
- 2026-08-01 M16 + M15 ⚠️교차: v1.69.0 — 임베드는 폭과 무관하게 항상 폰 UI (`page-app` 무대 연출을 미디어쿼리 밖에서 다시 검). *(레지스트리 갱신이 v1.67 에서 멈춰 있던 것을 v1.70 에서 같이 바로잡음)*
- 2026-08-01 M16: v1.68.0 — `nh:run` 이 콘솔이 보내온 시나리오 정의(`scenario`)를 받는다. 서베이에서 뽑은 시나리오는 앱 상수에 없고 콘솔에 있기 때문. `nhSanitize()` 로 액션 화이트리스트·길이 상한을 강제하고, `nh:ready` 가 `actions` 목록을 알려준다
- 2026-08-01 M16 신설 + M13 ⚠️교차: v1.67.0 — `?embed=1` 임베드 모드(무로그인 부팅·무음 시드), postMessage 시나리오 브리지, Now Here 시나리오 4종(우려 상황 2종 포함). `seedDemoData(opts)` 에 optional `silent` 추가(IS_EMBED 일 때만 유효 — 아니면 클라우드에 쓰이므로 관리자 확인 유지)

- 2026-07-09 M11+M14 + M09 CSS ⚠️교차: v1.66.0 — 관리자 메뉴 내비 카테고리 강조(글자 확대+경계선), 관리자 지도 햄버거 제거(admin.html #pc-menu-btn/#pc-drawer), 관리자 설정 아코디언 비활성(전부 펼침, initSettingsAccordion 분기), 폰 드로어 설정 터치 최적화 CSS(page-app 스코프 — PC/폰 설정 화면 분리·값만 공유)
- 2026-07-09 M09+M11+M12+M14 + M03/M04 ⚠️교차: v1.65.0 — 서비스/관리자 페이지 분리(index=폰 앱·admin.html 신설, PAGE_MODE 분기), 관리자 대형 메뉴 팝업(initAdminMenu: 컨텐츠/스타일/시스템 카테고리 내비+패널), 색상 팝업 통일(팔레트=온도4+#1428A0, 전 팝업 투명도: textOpacity·스팟 alpha·존 fillA — 네이티브 컬러 입력 3곳 팝업 교체), check.js admin 검사 추가
- 2026-07-08 M03 + M00(MapLabel 위치보정 버그픽스) + M11 ⚠️교차: v1.64.0 — 줌 시 존 라벨 위치 밀림 픽스(CSS `zoom`이 `left/top`까지 배율 곱하던 문제 → `pos/s` 보정), 존 라벨 표시/숨김 토글(`zoneLabelsShown`·`zoneLabelConfig.show`, 동 라벨 `enabled` 패턴 미러링·클라우드 동기·additive)
- 2026-07-07 M00(MapLabel 수정)+M02+M03+M05+M07+M09 ⚠️교차: v1.62.0 — 라벨 spotScale 줌 연동(0.7~1.6), 컨텐츠 탭=팝업 통일(📍 지도 보기), 포커스 자동 해제(autoReleaseFocus)+지도 탭 선택 3개 이상 게이트
- 2026-07-07 M03+M05+M07+M08+M09+M13 ⚠️교차: v1.61.0 UX 5종 — 시드 생성 이미지 17건 전량 실사진(Commons 검증), 존 리스트 좋아요순(포커스 맨앞 이동 폐지), 핀 클램프 2.4→1.3, 트렌드 AI 선글라스(.ai-shades), 스팟 의견 버블(liveChat room='spot:<id>' 재사용)
- 2026-07-07 M00+M04+M05+M07+M09 ⚠️교차: v1.60.0 UX 7종 — declutter 방향 안정화(줌 흔들림 픽스), 컨텐츠 상세 팝업(`openContentPop`), 스팟 카드 지도 배경(Static API·투명도/축척), Request 남은시간(분/초 1초 티커), 온도 수동 오버라이드(`heatTOf` 존/피드/스팟), 스플래시 투명, 아이콘 라운드 PNG
- 2026-07-07 M00(declutter 추가) ⚠️교차 M04+M05+M07: 마커 겹침 방지(`declutterBoxes` 4방향 배치)·말풍선 자유 방향(꼬리 tl-* 4종)·피드/Request 핀 줌 스케일을 `spotScale`로 통일 (v1.59.0)
- 2026-07-07 M04+M05+M07 ⚠️교차(M00 추가): 지도 컨텐츠 모드 컬러 — 베이직=무채색 통일/트렌드=좋아요 온도색(`heatColor`·`feedHeatT`·`zoneHeatT`, --heat+body.mode-trend 스코프) + Request 핀 26→34px 크기 통일 (v1.58.0)
- 2026-07-07 M00(추가) ⚠️교차 M10: Twemoji 통일 렌더링 — `initTwemoji`(초기 파싱+MutationObserver 자동 치환, svg 내부 스킵), img.emoji CSS, 뉴스 placeholder 📰→배경이미지. SVG `<text>`에 이모지 금지 (v1.57.0)
- 2026-07-07 M13: 시드 3지역 확장(강남+잠실·성수, 지역별 배열 구조 `SEED_AREAS`) + 채우기 수량(균등 샘플링)·밀집도(앵커 기준 좌표 스케일+동 재판정) 옵션 (v1.56.0)
- 2026-07-07 인프라: app.js 전 섹션 `[M##]` 태깅(59곳, grep 탐색용), `tools/check.js`(버전·스탬프·문법 CI 검사), dev/diagram `data-app-ver` 스탬프, 공유 상태 계약·안전 규칙 문서화 (v1.55.0)
- 2026-07-07 M07+M03+M08+M09 ⚠️교차: Request 전용 핀·삭제, 드로어 타이틀 정돈, 존 리스트 정렬(포커스→❤→거리)+포커스 표시, Ask Map 패널(요약 버튼·풀 50/5·채팅) (v1.54.0)
- 2026-07-07 M07: 요청자 팝업 제외·10분 타임아웃(reqActive, 시드 예외)·드로어 '내 Request' 뱃지+답변 목록 보기 (v1.53.1)
- 2026-07-07 M07+M08: AI Agent 실시간 Request 팝업(타겟 지역 수신, 응답 2버튼), 응답 상태/결과 노출 제거 (v1.53.0)
- 2026-07-07 M14: dev.html 개발 관리 페이지 신설 (v1.53.0)
- 2026-07-06 M05/M08/M09/M12: v1.52.0 UX 7종 (피드 칩·AI 프리셋·불꽃·스와이프·드로어 탭·스플래시)
