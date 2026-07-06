# MODULES — now-here-demo 개발 모듈 맵

> **세션별 모듈 단위 작업의 기준 문서.** 새 세션은 `WORKLOG.md` → 이 파일 순으로 읽고,
> 지정된 모듈의 코드 앵커(함수/섹션)만 수정합니다. 시각화 버전은 [dev.html](dev.html) (개발 관리 페이지).

## 🧱 모듈 단위 세션 규칙

1. **한 세션 = 한 모듈** 원칙. 세션 시작 프롬프트에 모듈 ID를 명시한다 (프롬프트 템플릿은 dev.html에서 복사).
2. 코드는 앵커(아래 표의 함수·변수명)로 위치를 찾는다 — `app.js`는 단일 파일이지만 모듈별 섹션이 구분되어 있다.
3. **다른 모듈 코드는 수정하지 않는다.** 불가피한 교차 수정(공용 헬퍼·CSS 토큰 등)은 최소화하고 WORKLOG 항목에 `⚠️교차: M##` 로 명시한다.
4. 공용 파일은 예외적으로 항상 수정 가능: `index.html`(버전·마크업 앵커), `WORKLOG.md`, `MODULES.md`, 버전 3곳 동기화.
5. 작업 완료 시: 버전업(3곳) → WORKLOG 갱신 → **이 파일의 모듈 상태/최근 버전 갱신** → commit·push.
6. 물리적 파일 분리(app.js 분할)는 별도 결정 전까지 하지 않는다 — 논리 모듈(앵커 경계)로 운영.

## 📦 모듈 레지스트리

| ID | 모듈 | 상태 | 범위 | 주요 앵커 (grep) | 파일 | 최근 |
|---|---|---|---|---|---|---|
| M01 | core-map 지도 코어 | 안정 | 지도 초기화·GeoJSON 경계·모드 전환·메인 지도 이벤트 | `initMap` `applyGeoJsonToMap` `switchMode` `refreshMapStyles` `chaikinSmooth` | app.js | v1.28 |
| M02 | lens 포커스 렌즈 | 안정 | 베이직/트렌드 마스크 렌즈·포그·전환 애니 | `updatePhoneLens` `lensBuild` `lensApply` `holeRing` `phoneLens` | app.js | v1.28 |
| M03 | zones 트렌드 존 | 활성 | 헥사 그리드·존 CRUD·존 카드/리스트·병합 아웃라인 | `generateHexagons` `trendZones` `zoneOutlineLoops` `makeZoneCard` `buildZoneScroll` `remapZoneToGrid` `sortedZonesForList` | app.js | v1.54 |
| M04 | spots 스팟 메시지 | 안정 | 스팟 버블·컴포저·편집/드래그·워드클라우드 | `SpotBubble` `SpotComposer` `renderSpots` `spotsInFocusedRegion` `canEditSpot` | app.js | v1.51 |
| M05 | feed 피드 | 활성 | 피드 탭·그리드·썸네일 핀·클러스터·좋아요·업로드 | `renderFeed` `feedEntriesScoped` `FeedThumb` `clusterFeedPins` `toggleLike` `feedAdd` `initFeedTools` | app.js | v1.52 |
| M06 | social 소셜 | 안정 | 소셜 탭·채팅방(동네/주제/프라이빗)·liveChat | `renderSocial` `socRoomList` `roomMsgs` `initSocialManager` | app.js | v1.45 |
| M07 | request 현장 Request | 활성 | Request 등록(10분 타임아웃)·AI Agent 실시간 응답 팝업·내 Request 답변 보기·전용 핀(ReqPin)·삭제 | `openRequestComposer` `showReqBubble` `reqNearMe` `reqActive` `isMyReq` `answerRequest` `liveRequests` `ReqPin` `deleteRequest` | app.js | v1.54 |
| M08 | ai-agent AI 에이전트 | 활성 | AI 버튼·상황 프리셋·모드별 톤(불꽃) | `initAiAgent` `aiPresetPool` `updateAiVisual` `AI_PALETTE` `aiMapSummary` `aiChatAnswer` | app.js | v1.54 |
| M09 | shell 폰 셸 | 안정 | 폰 미러·탭 전환·하단 네비(스와이프)·드로어(탭)·헤더 | `initPhoneMirror` `switchTab` `layoutTabPages` `initPhoneMenu` `renderDrawerDemo` `setDrawerView` `dsSection` | app.js | v1.54 |
| M10 | news 요약 지면 | 안정 | 헤더 아래 캐러셀 지면·카드 3버전·접기 | `renderNews` `newsItems` `initContentPage` `initSummaryCollapse` `cp-frame` | app.js | v1.46 |
| M11 | settings 관리자 설정 | 안정 | 설정 블록·드래프트/적용·미니 프리뷰 | `BLOCK_DEFS` `MINI_RENDER` `initDraft` `initBlockBars` `syncSettingsUI` | app.js | v1.48 |
| M12 | auth-sync 인증·동기화 | 안정 | Google 로그인·역할·스플래시·클라우드 실시간 동기 | `initAuth` `showAuthOverlay` `liveOn` `loadSharedContent` `cloudSave` + `firestore.rules` | app.js | v1.52 |
| M13 | seed 데모 시드 | 안정 | 시드 데이터(피드/스팟/Request/채팅)·채우기/비우기 | `SEED_FEED` `SEED_IMG` `initDemoSeed` `clearDemoData` | app.js | v1.51 |
| M14 | pages 정적 페이지 | 활성 | 소개 덱·다이어그램·개발 관리 페이지 | — | deck.html diagram.html dev.html | v1.53 |
| M15 | tokens 디자인 토큰 | 안정 | CSS 변수·프로스트/글래스 공통 문법 | `:root` `--acc` `--frost` `--glass-*` | style.css | v1.52 |

상태: **안정**(변경 적음) / **활성**(현재 개발 중) / **계획**(예정)

## 🔗 주요 의존 관계

- M02 lens · M03 zones · M04 spots · M05 feed → **M01 core-map** (지도 인스턴스·좌표 헬퍼)
- M05 feed · M06 social · M07 request → **M12 auth-sync** (live 컬렉션 리스너·hasLive)
- M07 request · M08 ai-agent → 서로 연동 (AI 버블/팝업 공유)
- 모든 UI 모듈 → **M15 tokens** (색·프로스트 문법)
- M09 shell 은 각 탭 모듈(M05/M06)의 진입점 (switchTab)

## 📝 모듈 변경 로그 (최근)

- 2026-07-07 M07+M03+M08+M09 ⚠️교차: Request 전용 핀·삭제, 드로어 타이틀 정돈, 존 리스트 정렬(포커스→❤→거리)+포커스 표시, Ask Map 패널(요약 버튼·풀 50/5·채팅) (v1.54.0)
- 2026-07-07 M07: 요청자 팝업 제외·10분 타임아웃(reqActive, 시드 예외)·드로어 '내 Request' 뱃지+답변 목록 보기 (v1.53.1)
- 2026-07-07 M07+M08: AI Agent 실시간 Request 팝업(타겟 지역 수신, 응답 2버튼), 응답 상태/결과 노출 제거 (v1.53.0)
- 2026-07-07 M14: dev.html 개발 관리 페이지 신설 (v1.53.0)
- 2026-07-06 M05/M08/M09/M12: v1.52.0 UX 7종 (피드 칩·AI 프리셋·불꽃·스와이프·드로어 탭·스플래시)
