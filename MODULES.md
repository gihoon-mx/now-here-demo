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
| M00 | utils 공용 헬퍼 | 동결 | 전 모듈 공용 — **수정 금지·추가만** | `escHtml` `hexToRgba` `haversineM` `compressNews` `timeAgo` `MapLabel` `buildEmojiPicker` `initTwemoji` `heatColor` `heatTOf` `declutterBoxes` `MapLabel(줌 스케일·위치보정)` | app.js | v1.64 |
| M01 | core-map 지도 코어 | 안정 | 지도 초기화·GeoJSON 경계·모드 전환·메인 지도 이벤트 | `initMap` `applyGeoJsonToMap` `switchMode` `refreshMapStyles` `chaikinSmooth` | app.js | v1.28 |
| M02 | lens 포커스 렌즈 | 안정 | 베이직/트렌드 마스크 렌즈·포그·전환 애니 | `updatePhoneLens` `lensBuild` `lensApply` `holeRing` `phoneLens` `autoReleaseFocus` | app.js | v1.62 |
| M03 | zones 트렌드 존 | 활성 | 헥사 그리드·존 CRUD·존 카드/리스트·병합 아웃라인·라벨 표시 토글·채움 투명도 | `generateHexagons` `trendZones` `zoneOutlineLoops` `makeZoneCard` `buildZoneScroll` `remapZoneToGrid` `sortedZonesForList` `visibleZoneCount` `zoneLabelsShown` `zoneFillA` | app.js | v1.65 |
| M04 | spots 스팟 메시지 | 안정 | 스팟 버블(자유 방향·겹침 방지)·컴포저·편집/드래그·워드클라우드 (모드 컬러: 베이직 무채색/트렌드 온도)·개별 색 투명도 | `SpotBubble` `SpotComposer` `renderSpots` `spotsInFocusedRegion` `canEditSpot` `declutterMarkers` `openSpotEditor` `spotComments(뱃지)` | app.js | v1.65 |
| M05 | feed 피드 | 활성 | 피드 탭·그리드·썸네일 핀(스팟과 동일 줌 스케일·온도 링/뱃지)·클러스터·좋아요·업로드 | `renderFeed` `feedEntriesScoped` `FeedThumb` `clusterFeedPins` `toggleLike` `feedAdd` `initFeedTools` `staticMapUrl` | app.js | v1.63 |
| M06 | social 소셜 | 안정 | 소셜 탭·채팅방(동네/주제/프라이빗)·liveChat | `renderSocial` `socRoomList` `roomMsgs` `initSocialManager` | app.js | v1.45 |
| M07 | request 현장 Request | 활성 | Request 등록(10분 타임아웃)·AI Agent 실시간 응답 팝업·내 Request 답변 보기·전용 핀(ReqPin)·삭제 | `openRequestComposer` `showReqBubble` `reqNearMe` `reqActive` `isMyReq` `answerRequest` `liveRequests` `ReqPin` `deleteRequest`·핀 줌 스케일(스팟 동일) `reqRemainLabel` | app.js | v1.63 |
| M08 | ai-agent AI 에이전트 | 활성 | AI 버튼·상황 프리셋·모드별 톤(불꽃) | `initAiAgent` `aiPresetPool` `updateAiVisual` `AI_PALETTE` `aiMapSummary` `aiChatAnswer` | app.js | v1.61 |
| M09 | shell 폰 셸 | 안정 | 폰 미러·탭 전환·하단 네비(스와이프)·드로어(탭)·헤더·페이지 모드 분기·카메라 이동 | `initPhoneMirror` `switchTab` `layoutTabPages` `initPhoneMenu` `renderDrawerDemo` `setDrawerView` `dsSection` `openContentPop` `cpopGoMap` `goMapCam` `PAGE_MODE` | app.js | v1.70 |
| M10 | news 요약 지면 | 안정 | 헤더 아래 캐러셀 지면·카드 3버전·접기 | `renderNews` `newsItems` `initContentPage` `initSummaryCollapse` `cp-frame` | app.js | v1.46 |
| M11 | settings 관리자 설정 | 활성 | 설정 블록·드래프트/적용·미니 프리뷰·관리자 메뉴 대형 팝업·색상 팝업(팔레트+투명도) — PC=전부 펼침·폰 드로어=아코디언 | `BLOCK_DEFS` `MINI_RENDER` `initDraft` `initBlockBars` `syncSettingsUI` `initAdminMenu` `openColorPopup` `makeColorControl` `initSettingsAccordion` | app.js | v1.66 |
| M12 | auth-sync 인증·동기화 | 안정 | Google 로그인·역할·스플래시·클라우드 실시간 동기·관리자 페이지 게이팅 | `initAuth` `showAuthOverlay` `liveOn` `loadSharedContent` `cloudSave` `grantAccess` + `firestore.rules` | app.js | v1.65 |
| M13 | seed 데모 시드 | 활성 | 강남·잠실·성수 + **방학·쌍문(한산)** 4지역 시드(피드/스팟/Request/채팅)·채우기(수량·밀집도 옵션)/비우기 | `SEED_FEED` `SEED_IMG` `SEED_AREAS` `SEED_AREA_ORDER` `seedFlat` `initDemoSeed` `clearDemoData` | app.js | v1.70 |
| M14 | pages 정적 페이지 | 활성 | 관리자 페이지(v1.65 신설)·소개 덱·다이어그램·개발 관리 | `initAdminMenu`(M11 공유) | admin.html deck.html diagram.html dev.html | v1.65 |
| M15 | tokens 디자인 토큰 | 안정 | CSS 변수·프로스트/글래스 공통 문법 | `:root` `--acc` `--frost` `--glass-*` | style.css | v1.52 |
| M16 | scenario-bridge 임베드·시나리오 | 활성 | `?embed=1` 무로그인 부팅·무음 시드 / postMessage 시나리오 재생 / `area` 지역 이동 (Persona VC 콘솔이 iframe 으로 사용) | `IS_EMBED` `startEmbed` `NH_SCENARIOS` `NH_ACTIONS` `nhRun` `nhAct` `nhReset` `nhPick` `nhAreaKey` `nhAreaList` `nhSanitize` `initScenarioBridge` `EMBED_ORIGINS` | app.js | v1.70 |

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
| 콘솔 → 앱 | `{source:'persona-vc', type:'nh:list'}` · `{type:'nh:run', id}` · `{type:'nh:run', scenario:{...}}` · `{type:'nh:stop'}` |
| 앱 → 콘솔 | `nh:ready{version,scenarios[],actions[],areas[]}` · `nh:begin{id,name,total,concern}` · `nh:step{i,total,say,concern,key,action}` · `nh:done{id}` · `nh:error{message}` |

**프레임 비율은 콘솔이 책임진다** (v1.70): 앱은 `?embed=1` 에서 받은 프레임을 그냥 꽉 채운다
(`.phone-screen{width:100%;height:100%}`). v1.69 까지는 앱이 폰 폭을 높이에서 계산해서,
프레임이 그보다 넓으면 남는 폭이 전부 무대 배경으로 보였다. **양쪽이 다 계산하면 반드시
어긋나므로 계산하는 자리를 하나로 모았다** — 콘솔이 iframe 을 `aspect-ratio:9/19.5` 로 준다.
라운드·그림자도 콘솔 래퍼가 들고 있어서 앱에서는 뺀다.

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
스텝 20개·대사 300자·스텝 간격 400~6000ms 로 자른다. **임의 코드는 돌지 않는다.**
`nh:ready` 가 `actions` 로 지금 앱이 아는 액션 목록을 같이 알려주므로, 콘솔은 그것만 쓰면 된다.

- 명령은 `EMBED_ORIGINS` 에 있는 오리진에서 온 것만 받는다. 새 콘솔 주소가 생기면 여기에 추가.
- 시나리오 추가는 `NH_SCENARIOS` 에 항목을 넣는 것으로 끝난다. 스텝의 `a` 는
  `tab·mode·pop·popclose·request·drawer·wait·area` 뿐이고, **새 액션을 만들 때도 기존 앵커만 부른다.**
- **액션 어휘를 늘리면 세 곳이 같이 움직여야 한다**: 여기 `NH_ACTIONS`, 콘솔의 `PLAY_ACTIONS`,
  그리고 콘솔 프롬프트의 `ACTION_GUIDE`. 어긋나면 모델이 뽑은 액션을 앱이 **조용히** 버린다.
- `nhRun` 은 항상 `nhReset()` 으로 시작한다 (앞 회차가 연 팝업·드로어가 남으면 다음 시연이 가려진다).

## 📝 모듈 변경 로그 (최근)

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
