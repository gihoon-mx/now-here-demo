# WORKLOG — now-here-demo

> 여러 PC를 오가며 작업하기 위한 **단일 상태 소스**입니다.
> 새 PC에서 시작할 때 이 파일을 먼저 읽고, 작업을 마치면 아래 규칙대로 갱신·push 하세요.

> ✅ **정식 repo: `gihoon-mx/now-here-demo`** — https://github.com/gihoon-mx/now-here-demo
> 새 PC에서는 이것만 clone 하세요: `gh repo clone gihoon-mx/now-here-demo`
> (구 repo `now-here-map-demo-pages`는 **폐기(deprecated)** — 더 쓰지 않음. 상세는 아래 이전 이력 참고.)

---

## 🔁 다른 PC에서 이어가기 (매번 이 순서)

```bash
# 1) 최신 상태 받기 (작업 시작 전 항상)
git pull

# 2) ...작업...

# 3) 작업 끝나면: WORKLOG 갱신 → 커밋 → push
git add -A
git commit -m "작업 내용 요약 vX.Y.Z"
git push
```

- **push 전 반드시 `git pull`** 먼저 (다른 PC에서 올린 변경과 충돌 방지).
- 배포: **GitHub Actions 워크플로우(`.github/workflows/pages.yml`)로 배포**(2026-07-03 legacy→Actions 전환). `main` push마다 자동 실행.
- 배포 URL: **https://gihoon-mx.github.io/now-here-demo/**

> 🛠 **배포가 라이브에 안 뜰 때**:
> 1. Actions 탭에서 최근 run 확인: `gh run list --workflow=pages.yml` / 재실행: `gh workflow run pages.yml --ref main`
> 2. `Deploy to GitHub Pages` 단계가 **`Deployment failed, try again later`**로 실패하면 = **GitHub Pages 백엔드 일시 장애**(코드 문제 아님). 몇 분~수시간 뒤 자동 회복되며, 회복 후 재실행하면 배포됨.
> 3. 폰/브라우저에서 옛 버전이면 URL에 `?x=1` 붙여 캐시 우회(그래도 안 바뀌면 아직 미배포).
> - (참고) 2026-07-03 오전, legacy·Actions **양쪽 모두** 배포 지연/실패 관측 → GitHub Pages 측 이슈로 판단. Actions 방식이 로그·상태가 보여 진단이 쉬움.

> ⚠️ **repo 이전됨(2026-07-03)**: `gihoon-mx/now-here-map-demo-pages` → **`gihoon-mx/now-here-demo`**.
> 다른 PC에서는 remote를 새 repo로 바꾸거나 새로 clone:
> ```bash
> git remote set-url origin https://github.com/gihoon-mx/now-here-demo.git   # 기존 clone 재지정
> # 또는:  gh repo clone gihoon-mx/now-here-demo
> ```
> (이전 repo는 GitHub Pages 배포 큐가 꼬여서 새 repo로 이전. 같은 `gihoon-mx.github.io` 호스트라 GCP/Firebase 도메인은 그대로 유효 — 경로만 `/now-here-demo/`로 바뀜.)

### 🔢 버전 규칙 (코드/스타일 바꿀 때마다 필수)
제작(코드·스타일·기능 변경)마다 버전을 올리고 **3곳을 동기화**:
1. `index.html` → `<span id="app-version">vX.Y.Z</span>`
2. asset 캐시버스트 → `style.css?v=X.Y.Z`, `app.js?v=X.Y.Z`, `config.js?v=X.Y.Z`
3. 커밋 메시지에 `vX.Y.Z`
- 증가: 일반 변경 = 패치(+0.0.1), 큰 기능 = 마이너(+0.1.0). 문서(WORKLOG 등)만 바뀌면 버전 유지.
- **현재 최신: v1.12.0**

---

## 📸 현재 상태 스냅샷 (2026-07-03)

**최신 v1.12.0 · 라이브 정상.** 완료된 기능:
- **설정 = 숫자 직접입력 전용**(슬라이더 제거) + 정수/소수·범위 주의문구. **설정 패널 Light 테마**. 스팟은 **지도에 고정된 실제 크기**(줌해도 같은 미터 범위 유지). 스팟은 **베이직·트렌드 양쪽 모두 표시**(모드는 지도 구획 방식일 뿐).
- **폰 하단 네비**: 지도/피드/소셜(미션 제거) + **네비 왼쪽 컨텐츠 추가(+) 버튼**(누르면 스팟 메시지/사진 올리기 팝업).
- **모드 이름: 로컬→베이직**(UI만, 내부 식별자 `local` 유지). 모드 토글=지도 전환 전용, 스타일 설정은 관리자 설정에 통합 상시 표시.
- **사이드바 관리자 UI = 두 최상위 메뉴**(블록 카드로 가독성↑): **🗂 컨텐츠 설정**(스팟 추가·트렌드 존 관리) + **⚙ 관리자 설정**(스타일 9블록 아코디언). 슬라이더 옆 숫자 직접입력.
- **스팟 추가**: 커서 crosshair + 클릭 포인트 옆 지도 팝업 입력. **스팟은 지도 배율에 붙음**(줌인 확대·줌아웃 축소), 점 전환 줌 미만은 **점 또는 이모지**(옵션)로, **점 색상**도 설정.
- **상단 위치 라벨**: 베이직=화면 센터의 **동**(예 논현1동), 트렌드=보고 있는 **트렌드 존 이름**.
- **트렌드 존(데모)**: 폰에서 존 터치→**존 전체가 한 화면에 맞춰지고 주변은 그레이 처리**로 강조(재터치/빈곳 터치 해제).
- **인증/역할**: Google 로그인(Firebase) + allowlist 접근제어. `관리자`(admin) / `데모유저`(user) 역할.
- **레이아웃**: 좌 전체화면 지도 / 우 사이드바(폰 미러). 사이드바 폭 드래그 조절 → 폰 크기 변경(내부 UI는 `cqw`로 비율 유지).
- **폰 미러(앱처럼)**: 상단 좌 햄버거(→설정 드로어)·우 로컬/트렌드 모드토글, 하단 네비(지도/피드/미션/커뮤니티/AI), 접기 버튼.
- **로컬 모드**: 동 경계 하이라이트 + 선택 라벨 + **스팟 메시지**(이모지+말풍선, 관리자 생성).
- **트렌드 모드**: 헥사곤 그리드 + 트렌드 존.
- **데모유저**: 뷰잉 + 로컬/트렌드 전환만. 관리자가 만든 존·스팟 **열람 가능**(편집 불가).
- **모바일 접속**: 폰 화면만 전체표시(폰맵 터치 조작).
- **저장**: `shared/mapContent` 공유 문서(관리자 쓰기 / 로그인 사용자 모두 읽기). **Firestore `shared` 규칙 콘솔 배포 완료.**
- **외부 설정(GCP/Firebase)**: `gihoon-mx.github.io` 호스트 기준 완료 — 추가 조치 불필요.

---

## 🤝 다른 PC에서 이어서 작업 시작하기

**1) 터미널 준비:**
```bash
gh auth switch --user gihoon-mx           # push 권한 계정으로
gh repo clone gihoon-mx/now-here-demo      # 처음이면 clone (기존 clone이면 생략)
cd now-here-demo && git pull
git config user.name "gihoon-mx" && git config user.email "gihoon.mx@gmail.com"
```

**2) Claude Code에 붙여넣을 시작 프롬프트 (예시 — 대괄호만 바꿔 사용):**
> now-here-demo 프로젝트를 이어서 작업할 거야. 먼저 repo 루트의 `WORKLOG.md`를 읽고 현재 상태(v1.6.0)와 규칙을 파악해줘:
> - 버전: 코드/스타일 바꿀 때마다 3곳(app-version, `?v=` 캐시버스트, 커밋메시지) 동기화해서 올리기
> - 배포: `main`에 push하면 GitHub Pages 자동 배포 (반영 1~15분)
> - 저장: 관리자 콘텐츠는 `shared/mapContent` 공유 문서 (데모유저 열람용)
> - 데모유저는 뷰잉+모드전환만, 편집 UI는 `role-user`로 숨김
>
> 그다음 **[여기에 하고 싶은 작업]**을 진행해줘. 작업 중 로컬 프리뷰로 검증하고, 끝나면 버전 올리고 WORKLOG 갱신 후 commit·push 해줘.
>
> _작업 예시_: "스팟 메시지에 목록·편집 기능 추가" / "데모 로그인 화면 디자인 개선" / "트렌드 존 색상 프리셋" / "폰 피드/미션 탭 실제 화면 구현" 등

**핵심 흐름**: ① WORKLOG 먼저 읽기 → ② 작업(+프리뷰 검증) → ③ 버전업 + WORKLOG 갱신 + commit/push.
- GCP/Firebase는 손댈 것 없음(같은 호스트). 로그인이 안 되면 아래 ☁️ 외부설정의 `firebaseapp.com` 리퍼러 주의 참고.

---

## 🔐 계정 / 인증 (중요)

- GitHub repo 소유: **`gihoon-mx`** (2026-07-02에 `gihoonmx-source`에서 rename됨).
- 이 Mac은 gh CLI에 계정 2개가 있음. **push하려면 gihoon-mx가 active여야 함**:
  ```bash
  gh auth switch --user gihoon-mx     # 이 프로젝트 작업 시
  # (HAOS 등 shoomerion 작업으로 돌아갈 땐 gh auth switch --user shoomerion)
  ```
- 커밋 identity(로컬 repo 한정): `gihoon-mx <gihoon.mx@gmail.com>`.
  - 새 PC에서 clone 후 필요하면:
    ```bash
    git config user.name "gihoon-mx"
    git config user.email "gihoon.mx@gmail.com"
    ```

---

## 🗂️ 프로젝트 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 진입점 |
| `app.js` | 앱 로직 (지도, 로그인, 관리자 뷰 등) |
| `style.css` | 스타일 |
| `config.js` | 설정값 (Maps/Firebase 키, ADMIN_EMAIL 등) |
| `firestore.rules` | Firestore 보안 규칙 (소스 오브 트루스 — 콘솔과 동기화 유지) |
| `dong_boundary.geojson` | 동 단위 행정구역 경계 데이터 |

---

## ☁️ 외부 설정 (코드 밖 — GCP/Firebase 콘솔)

계정: `gihoon.mx@gmail.com` / GCP 프로젝트 2개

- **`now-here-demo`**: Firebase 프로젝트. Firebase 브라우저 키, OAuth 웹 클라이언트, Firebase Authentication(Google 로그인).
- **`hot-hot-map`**: Maps Platform API 키.

⚠️ **배포 도메인(github.io)이 바뀌면** 아래 4곳에 새 도메인을 추가해야 지도·로그인이 안 깨짐:
1. now-here-demo → Firebase 브라우저 키 · HTTP 리퍼러
2. now-here-demo → OAuth 웹 클라이언트 · 승인된 JavaScript 원본
3. hot-hot-map → Maps Platform 키 · HTTP 리퍼러
4. Firebase Console → Authentication → Settings → **승인된 도메인**

⚠️⚠️ **Firebase 브라우저 키(1번)의 HTTP 리퍼러에는 앱 도메인과 별개로 아래가 항상 있어야 함** (없으면 Google 로그인이 403 `API_KEY_HTTP_REFERRER_BLOCKED` → "The requested action is invalid."로 깨짐. 로그인 팝업이 이 도메인에서 돌기 때문):
- `https://now-here-demo.firebaseapp.com/*`
- `https://now-here-demo.web.app/*`

### Firestore 규칙
- 소스 오브 트루스: repo의 **`firestore.rules`**. 콘솔(Firebase → Firestore → 규칙)에 배포하며, 양쪽을 항상 같게 유지.
- 규칙의 관리자 이메일(`gihoon.mx@gmail.com`)은 `config.js`의 `ADMIN_EMAIL`과 일치해야 함.

---

## 📝 변경 이력

### 2026-07-03
- **v1.12.0 — 숫자입력 전용 + Light 설정테마 + 스팟 고정크기 + 모드무관 스팟 + 폰 네비/컨텐츠추가**:
  - **모든 수치 설정 슬라이더 제거 → 숫자 직접입력만**(`enhanceRangeInputs`가 range를 `display:none`, `.range-num`만). 각 칸 옆 **주의문구**(`.num-hint`: `정수/소수` + `min~max`, 음수 여부는 범위로 표시). 정수 필드는 입력 시 반올림·clamp. 기존 range 핸들러는 `input` 이벤트 디스패치로 재사용(로직 유지).
  - **설정 패널 Light 테마**: `#left-panel` 및 하위(계정/모드토글/토글버튼/아코디언/입력/버튼/토글스위치/존관리)를 밝은 배경+어두운 글자로 오버라이드(`#left-panel …` 스코프). 폰 미러·색상팝업·모달은 기존 다크 유지.
  - **스팟 = 지도 고정 크기**: `SPOT_REF_ZOOM` 14→**16**, 클램프 0.02~40으로 넓혀 사실상 무제한 → `2^(z-16)` 순수 배율(줌아웃=절반씩 축소, 줌인=2배씩). 설정 크기가 어느 줌에서도 같은 '미터 범위'를 덮음(건물 블럭 크기 유지).
  - **스팟 모드 무관 표시**: `renderSpots`의 `currentMode!=='local'` 게이트 제거, `switchMode` 트렌드 분기 `clearSpots→renderSpots`, `applyCloudData`/`initPhoneMirror`도 항상 `renderSpots`. 모드는 지도 구획(동경계 vs 헥사곤)만 바꾸고 스팟 등 컨텐츠는 양쪽 유지.
  - **폰 하단 네비 개편**: `미션` 탭 제거(지도/피드/소셜). 네비 왼쪽에 **컨텐츠 추가(+) 버튼**(`.pn-add`, AI 버튼과 동일 원형칩) → 클릭 시 `#content-add-menu` 팝업 2개: **스팟 메시지**(`startPlacingSpot`) / **사진 올리기**(`#feed-photo-input` 파일선택, 피드 업로드는 데모 alert). `.phone-navbar` justify-content center→space-between(+ 좌 / 그룹 / AI 우).
  - **스팟 배치 폰맵 지원**: `SpotComposer(latLng,targetMap)`·`onMapClickForSpot(latLng,targetMap)`로 클릭한 지도 위에 팝업. 커서(crosshair)를 메인·폰 지도 둘 다 적용(`setPlaceCursor`). 폰맵 click 리스너에 placing 분기 추가(모바일 배치).
- **v1.11.1 — 전체 폰트 Pretendard로 교체**: `style.css` 상단 `@import`를 Inter(Google Fonts)→**Pretendard Variable**(jsDelivr `orioncactus/pretendard@v1.3.9`)로, `html,body` font-family를 `'Pretendard Variable','Pretendard',…`로. 나머지는 전부 `font-family:inherit`라 body만 바꿔 전체 적용(커스텀 지도 오버레이 `.map-label-tag`/`.spot-bubble` 포함). Google Maps 타일 자체 텍스트는 구글 관할이라 무관.
- **v1.11.0 — 베이직 리네임 + 메뉴 블록화 + 스팟 배율/점옵션 + 존 스포트라이트 + 동 라벨**:
  - **로컬→베이직 리네임**(모드 토글·폰 토글 UI 텍스트만; `data-mode="local"`/`currentMode='local'` 등 내부 식별자·CSS 클래스는 그대로).
  - **메뉴 가독성**: 아코디언 섹션을 **블록(카드)**으로(`.acc-section` 테두리+배경+라운드, 헤더 크게·소문자·펼침 시 하이라이트). 최상위 토글(`#content-toggle`/`#settings-toggle`)도 큰 카드 버튼으로.
  - **스팟 배율 스케일**: `SpotBubble.draw`가 `spotScale(z)=2^(z-기준줌)` 적용, 상한만 6배(하한 0.16). **줌인=확대·줌아웃=축소**(기존 1배 상한 제거).
  - **점 표시 옵션**: 점 전환 줌 미만일 때 `spotConfig.dotStyle`='dot'(점) | 'emoji'(이모지 축소). **점 색상** `spotConfig.dotColor`(색 컨트롤 `ct-spot-dot`). 설정에 "작을 때/점 색상" 추가. 공유문서 자동 저장.
  - **위치 라벨 소스 교정**: `updatePhoneLocation`이 **폰맵 센터**(`phoneMap||map`) 기준. 베이직=`dongAt`(동, 기존 `guAt`서 변경), 트렌드=`zoneAtCenter`(존명). 폰맵 idle에도 라벨 갱신(모바일 팬 반영).
  - **트렌드 존 스포트라이트(데모)**: 폰 존 폴리곤 `clickable:true`+클릭→`selectPhoneZone` = **`fitBounds`로 존 전체 표시 + 마스크 폴리곤**(존 주변 사각 outer[시계]+헥사곤 holes[반시계]로 존 밖만 그레이 `#0a0c14`/0.62). 재클릭·빈곳 클릭 해제(`clearPhoneSpotlight`), `syncPhoneZones`/모드전환 시 해제. ⚠️ outer는 전세계 링 쓰면 안/밖 모호로 **반전**돼서 존 주변 사각형(존 span×8 패딩)으로 사용.
- **v1.10.0 — 컨텐츠/관리자 설정 분리 + 모드 토글 단순화 + 스팟 지도 팝업**:
  - **최상위 메뉴 2개**로 재편(같은 레벨): **🗂 컨텐츠 설정**(`#content-toggle`/`#content-section`, `initContentPanel`) = ①스팟 메시지(추가 버튼) ②트렌드 존 관리(존 저장/편집/목록). **⚙ 관리자 설정**(`#settings-section`) = 서비스 스타일 9섹션.
  - **모드 토글은 지도 전환 전용**: `#local-settings`/`#trend-settings` 래퍼 제거 → 두 모드 스타일 설정을 `#settings-section`에 평면화해 **모드 무관 항상 표시**(`switchMode`에서 display 토글 삭제). 존 목록(`renderZoneList`)도 모드 게이트 제거—어느 모드서든 열람, 존 편집(수정) 클릭 시 트렌드 모드 자동 전환.
  - **스팟 추가 = 지도 위 팝업**(`SpotComposer` OverlayView, `initSpotComposerClass`): 버튼→`map.setOptions({draggableCursor:'crosshair'})`(타일 위에서도 커서 확실 변경)→지도 클릭→**클릭한 포인트 옆 팝업**(이모지 픽커+메시지+등록/취소, 앵커 점+꼬리). 사이드바 입력폼(`#spot-form`) 및 `confirmSpot/showSpotForm/cancelSpotForm` 제거. 이모지 픽커는 `buildEmojiPicker`로 재사용화. 스팟은 로컬 콘텐츠라 추가 시 로컬 모드 자동 전환.
  - **JSON 내보내기/불러오기 제거**: `exportZones/importZones/initZoneIO` + `#zone-io-row` 삭제(콘텐츠가 Firestore `shared/mapContent`에 자동 저장돼 불필요).
  - 데모(role-user) 숨김 목록을 `#content-toggle-row`/`#content-section`/`#settings-*`로 갱신.
- **v1.9.0 — 관리자 설정 UI 정비 + 스팟 줌 스케일 + 숫자 직접입력**:
  - **설정 패널을 폰 미리보기 하단으로 분리**: `initPhoneMenu`에서 `#left-panel`을 폰 드로어로 옮기던 로직 제거 → 사이드바(폰 아래)에 상시 표시. `#settings-toggle` 라벨 "⚙ 설정"→**"⚙ 관리자 설정"**. 폰 햄버거 드로어는 이제 데모 앱 '메뉴'(계정 블록)만 담당(`drawer-account` 관리자도 노출).
  - **설정 섹션 아코디언화**(`initSettingsAccordion`): `#settings-section` 내 모든 `.settings-section`을 `.acc-section`으로, `h4`를 클릭 헤더(`.acc-head`, ▾ 회전)로. **기본 접힘**—탭처럼 필요한 것만 펼침. 9개 섹션 UX 일관화.
  - **스팟 줌 스케일**(지도에 붙어 보임): `SpotBubble.draw()`에서 `transform:scale` 적용. 기준 줌 `SPOT_REF_ZOOM`(=`CONFIG.MAP_ZOOM`+3=14) 이상은 **설정한 크기(1배) 유지**, 줌아웃 시 `2^(z-ref)`로 축소(최소 0.16배). 폰 지도도 동일(줌 동기화).
  - **점 전환 줌 관리자 설정화**: 하드코딩 `SPOT_DOT_ZOOM`(13) 제거 → `spotConfig.dotZoom` 슬라이더(8~18, 기본 13). 이 줌 미만이면 점으로 표시. 공유문서(`spotConfig`)에 자동 저장/복원.
  - **이모지 자간 음수 허용**: `spot-emoji-letter` min `0`→**`-8`**(붙이기 가능).
  - **슬라이더 숫자 직접입력**(`enhanceRangeInputs`): 모든 range 옆에 `.range-num` 숫자 필드 추가—슬라이더↔숫자 **양방향 동기화 + min/max clamp**. 기존 range 핸들러를 그대로 재사용(숫자 입력 시 `input` 이벤트 디스패치). `hex-radius`엔 `km` 단위 표기. `setRange`도 숫자필드 동기화.
  - ⚠️ 부수효과: 관리자 설정이 사이드바(데스크톱)에만 있음 → **모바일(≤768px)에선 관리자 설정 접근 불가**(폰 화면만 표시). 관리자 작업은 데스크톱 전제. 데모 뷰잉은 영향 없음.
- **v1.8.1 — 스팟/네비/AI 디테일 개선**: ①스팟 기본스타일 메뉴를 `#local-settings` 밖으로 이동→**모드 무관 항상 표시**(트렌드에서 사라지던 문제 해결) ②스팟 **이모지 자간**(`emojiLetterSpacing`, 2개+ 이모지 간격) 추가 ③스팟 편집 시 **컬러팝업 z-index 100010**로 모달 위에 표시 ④**줌아웃(z<`SPOT_DOT_ZOOM`=13) 시 스팟을 약한 점**으로 표시(`.spot-dot`, draw에서 토글) ⑤**데모 드로어 계정 블록**(`#drawer-account`: 이메일·버전·로그아웃, role-user만) ⑥하단 네비 커뮤니티→**소셜**(라벨 2자 균일)로 hug-content→**아이콘간격==외곽마진 항상 동일·팝핑 없음** ⑦AI 말풍선 꼬리를 **AI 아이콘 중심 위**(right 6.7cqw) 정렬 ⑧AI 클릭 시 **아이콘 360° 회전+AI색(블롭 stop #8ed0ff→#a78bfa, .ai-on 틴트)**, 재클릭/타임아웃 시 말풍선 사라지며 원복.
- **v1.8.0 — 스팟 편집/드래그 + 네비 고정폭 + AI 말풍선 + 플랫화**:
  - **하단 네비 고정폭**(`.pn-group` width:58cqw, justify center) → 메뉴 전환해도 바 크기 불변(팝핑 방지). gap==padding(3cqw) 균등·확대. [그룹+AI] 통째 가운데.
  - **스팟 메시지 편집/이동(관리자)**: 메인지도에서 스팟을 **드래그로 이동**(`SpotBubble._onDown`, fromContainerPixelToLatLng), **이동 없이 클릭하면 편집 모달**(`#spot-edit-modal`)—해당 스팟의 **텍스트·버블색·이모지** 개별 수정 + 삭제. per-spot `color` 필드 추가(`_render`가 `s.color||bgColor`), cloudSave/applyCloudData에 color 포함.
  - **AI 말풍선(데모)**: AI 아이콘 클릭 시 `#ai-bubble` "오늘 우리 동네 일상이 궁금하신가요?" 역동적 팝(overshoot bounce, 4.5s 후 자동 숨김, 재클릭 토글).
  - **플랫 디자인 패스**: 네비 그룹·AI·헤더·모드버튼·스팟버블·모달/팝업의 과한 그림자/inset 하이라이트/blur 깊이감 제거 → 플랫.
  - **데모 드로어 계정**: 데모(뷰어) 햄버거 드로어에 버전+로그인 이메일(· 뷰어)+로그아웃 노출 확인(showUserChip/account-row, 설정은 role-user로 숨김).
- **v1.7.1 — 폰 UI 미세조정**: ①하단 네비 그룹을 아이콘에 맞춰 컴팩트(`.pn-group` flex:0 0 auto), [그룹+AI] 통째로 가운데(`.phone-navbar` justify-content:center) ②네비 아이콘 간격 확대(gap 1.7cqw) ③상단 헤더 상단여백 확대(padding-top 5.5cqw)+앱바 세로중앙(min-height 9cqw, align-items center) ④상단 위치표시=로컬은 **구(sggnm)**, 트렌드는 **중심 트렌드존**(`regionAt`/`guAt`/`zoneAtCenter`, dongIndex에 gu 추가) ⑤AI 버튼을 좌측 네비와 통일—다크 글래스 원형+플랫 라이트 블롭(#cbd0d8, 그라디언트/그림자 제거).
- **v1.7.0 — 폰 UI 정리 + 스팟 디자인 메뉴 + 축척 범례**:
  - **폰 상단 = 흰색 헤더**: 상태바(시간/신호/배터리) 제거. `.phone-topscrim`(어두운 스크림) → `.phone-header`(불투명 흰색). 햄버거·위치라벨·모드토글을 흰배경용으로 배경 제거+재스타일(햄버거 라인 #33373f, 위치 텍스트 #1f2430, 모드토글 라이트 세그먼트). 헤더 하단에 **예약 흰색 슬롯 `#phone-header-slot`**(추후 컨텐츠에 따라 가변).
  - **하단 네비 컴팩트**: `.pn-group` space-between→center+gap축소로 아이콘 중앙 클러스터, 활성 라벨 확장 시 밀착.
  - **스팟 메시지 디자인 메뉴**: 설정에 이모지 위치(위/아래/좌/우)·간격, 말풍선 둥글기, 꼬리 표시 토글 추가(기존 글자/이모지/색 설정과 통합). `SpotBubble._render`가 flex-direction/order/gap/borderRadius/꼬리클래스(no-tail·tail-up) 반영. `spotConfig`에 emojiPos/emojiGap/bubbleRadius/tail 추가.
  - **이모지 팔레트 + 커스텀 추가**: 이모지 픽커를 `spotConfig.emojis`(기본 12개) 기반으로 렌더 + `＋`로 사용자 이모지 추가(prompt). 공유 문서에 저장/복원.
  - **축척 범례**: 관리자 지도 좌상단에 간단한 축척 바+거리(`#scale-legend`), zoom 변경 시 갱신(m/px 계산→nice 반올림). 모바일에선 숨김.
- **v1.6.0 — 폰 앱화 (햄버거 메뉴 + 모드 토글)**: 폰 상단바에 **좌=햄버거(≡)**, **우=로컬/트렌드 모드 토글** 추가. 햄버거 클릭 시 기존 "폰 아래 설정 패널"(`#left-panel`)이 **폰 안 드로어**로 슬라이드 인(닫기 X 버튼). 패널을 런타임에 `#phone-drawer`로 이동(`initPhoneMenu`). 데모 노출 규칙 동일 — 햄버거·모드토글은 노출, 설정·스팟추가 등은 `role-user`로 숨김. (부수효과: 데스크톱 사이드바 하단이 비게 됨 — 폰 중심 UI)
- **v1.5.0 — 스팟 메시지(관리자 기능)**: 로컬모드에서 지도 위 위치에 **이모지+말풍선** 메시지. `💬 스팟 메시지 추가`(설정 위, 관리자만)→지도 클릭으로 위치 선택→이모지 선택+텍스트 입력→등록. 스팟 클릭 시 삭제(관리자). 설정: 최대 글자수/글자크기/이모지 크기/글자색/배경색·투명도. 메인+폰 지도 양쪽 렌더(`SpotBubble` OverlayView).
  - **저장 구조 변경**: 관리자 콘텐츠(존+스팟+설정)를 `users/{uid}` → **`shared/mapContent`** 공유 문서로 이전. 관리자만 쓰기, **로그인 사용자(데모 포함) 모두 읽기** → 데모유저도 관리자가 만든 존/스팟을 볼 수 있음.
  - ✅ **Firestore 규칙**: `firestore.rules`에 `match /shared/{docId}`(관리자 쓰기/로그인 읽기) 추가 → **콘솔 배포 완료(2026-07-03)**. 스팟 저장·데모 뷰잉 동작.
- **v1.4.1 — 폰 UI 6종 개선**: ①폰을 사이드바 상단 `position:sticky`로 고정(설정 스크롤해도 폰 유지) ②폰 화면 접기/펴기 버튼(`#phone-collapse`) 추가 ③하단 네비 좌우 끝 여백 추가(균형 정렬) ④비선택 아이콘 컴팩트(패딩 축소, 선택 항목만 라벨 확장) ⑤AI 버튼 무채색화(그라데이션 #aab3c0→#7b8494, 눈/입 #2b3038) ⑥폰 버튼 탭 시 선택박스 안 뜨게(user-select:none + tap-highlight 투명).
- **repo 이전: `now-here-map-demo-pages` → `now-here-demo`** (배포 URL `/now-here-demo/`). 기존 repo의 GitHub Pages 배포가 계속 큐에서 멈춰(당시 **GitHub Pages 전체 장애 `degraded_performance`** 진행 중이던 영향) 깨끗한 새 repo로 이전. 새 repo는 legacy(브랜치 직접) 배포 + Actions 비활성 + `.nojekyll`. GitHub 장애 복구되면 자동 배포됨. 로컬 origin은 새 repo로 전환(기존은 `oldrepo` remote로 보존).
- **v1.4.0 — 사이드바/폰/역할/모바일 4종 개선**:
  - **사이드바 폭 드래그 조절**(map↔sidebar 사이 `#sidebar-resizer`) → 폰 크기 변경. 폰 내부 UI는 `.phone-screen`을 `container-type:inline-size`로 만들고 상태바/앱바/네비를 **cqw 단위**로 바꿔 **폭이 바뀌어도 비율 유지**. 폭은 localStorage(`nowhere_sidebarW`) 저장.
  - **폰 하단 네비 정리**: navbar/그룹/아이템/AI를 cqw 기반으로 일관 정리.
  - **데모유저(role='user') 뷰어 모드**: 로그인 시 지도 부팅 + 로컬/트렌드 토글만 가능, 설정·존편집·allowlist UI는 `body.role-user`로 숨김, 헥사곤 선택(`toggleHex`) 차단. (클라우드 로드/저장 없음)
  - **모바일(≤768px) 접속 시 폰 화면만 전체표시**: map/패널 숨김, `.phone-screen`이 뷰포트 채움. 모바일에선 폰 지도 `gestureHandling:'greedy'`로 상호작용 가능.
- **레이아웃 재정의 v1.3.0**: 관리자 화면을 2컬럼으로 분리. **왼쪽=전체화면 지도만**, **오른쪽=사이드바**(상단: 폰 화면(프레임/레일 제거), 하단: 컨트롤/설정 패널). 기존 플로팅 폰 미러/좌측 플로팅 패널 → 사이드바에 도킹. HTML `#app-shell`(flex)+`#sidebar`, CSS만 변경. 폰 컨트롤 JS(드래그/크기/접기)는 요소 제거해도 방어적 가드라 무변경. 캐시버스트 `?v=1.3.0`.
  - TODO(후속): 폰 위 저장/뷰상태, 사이드바 폭 조절, 데모유저 화면 등.
- **Google 로그인 복구**: Firebase 브라우저 키 리퍼러에 `now-here-demo.firebaseapp.com`(+`web.app`)이 빠져 403으로 로그인이 깨졌던 것 → 리퍼러 추가로 해결 (위 ⚠️⚠️ 참고).
- **Firestore 규칙을 repo로 편입**: `firestore.rules` 추가. 기존 `allow read,write: if false`(전면 차단)에서 → 로그인/allowlist/유저데이터 접근을 실제 앱 패턴에 맞춰 허용하는 규칙으로 교체(콘솔 배포). allowlist(본인 문서 읽기/관리자 관리) + users/{uid}(관리자 본인 데이터) 구조.

### 2026-07-02
- **GitHub username 변경: `gihoonmx-source` → `gihoon-mx`.**
  - 배포 URL이 `gihoon-mx.github.io/now-here-map-demo-pages/`로 변경 (옛 주소는 404).
  - 위 외부 설정 4곳에 `gihoon-mx.github.io` 도메인 추가 완료.
  - 로컬 remote를 새 주소로 갱신 완료.
- 이 `WORKLOG.md` 추가 (cross-machine 작업 연속성용).

### ~v1.2.0 (기존 커밋 히스토리 참고)
- Google 로그인 + 계정 저장/접근제어 (Firebase)
- 관리자 뷰포트 오버레이 / 폰 미러 / AI 캐릭터 등
- 자세한 내역은 `git log --oneline` 참고.

---

## ✅ 다음 작업 (TODO)

_(여기에 진행 중/다음 할 일을 적어두면 다른 PC에서 바로 이어갈 수 있음)_

- [ ]
