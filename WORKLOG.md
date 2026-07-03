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
- **현재 최신: v1.18.0**

---

## 📸 현재 상태 스냅샷 (2026-07-03)

**최신 v1.18.0 · 라이브 정상.** 완료된 기능:
- **스팟 생성 위치 버그 수정**: 벡터 지도(mapId)에서 컴포저 팝업이 실제 생성점과 어긋나던 문제 → 생성점에 **펄스 점** + 그 위에 입력 팝업. 이모지 **꾹 눌러 삭제**.
- **폰 햄버거 메뉴**: 데모도 **트렌드 존/스팟 메시지 리스트**(탭→포커스/강조), 관리자는 **관리자 설정 메뉴**가 드로어에. ⚠️ 관리자 설정이 사이드바→**폰 햄버거 드로어로 이동**(데스크톱도 햄버거로 접근).
- **앱 아이콘/파비콘 = 마스코트 이미지**(구름 캐릭터). 페이지 타이틀 'Now Here Demo'. **UI 약한 글래스**(설정패널·폰 헤더 반투명+블러).
- **스팟 롤오버/선택 시 살짝 커지며 강조**(테두리 대신 스케일). **스팟 추가 = 화면 롱프레스/우클릭 → 좌측하단 컨텐츠 추가 팝업**, 또는 좌측하단 **+버튼** → 현재 보는 지도 센터에 추가(클릭 배치 폐지).
- **스팟**: 점 색상 = 버블 색상 자동(개별 색 포함). **데모(뷰어)도 스팟 추가 가능**(이 기기 localStorage 저장). **스팟 목록 관리**(컨텐츠 설정 > 스팟 메시지: 이동/삭제). 버블 좌우 여백 축소.
- **폰 상단바 3분할**: 햄버거(좌)·**모드토글(가운데)**·**위치(우)**. 하단 네비 살짝 위로. 스팟 외 모든 수치 설정 범위 시스템 최대로 확대.
- **PWA(홈 화면에 추가 → 전체화면 앱)**: manifest+아이콘+메타태그. 폰에서 브라우저 크롬 없이 standalone 실행, 노치/홈인디케이터 안전영역 처리.
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
- **v1.18.0 — 베이직 폰: 센터 동 스포트라이트**: 베이직 모드 + 폰 화면에서 **화면에 보이는 동 개수가 임계값(`BASIC_SPOTLIGHT_MAX_DONGS`=6) 이하**로 줄면(=충분히 줌인), **센터가 속한 동의 외곽을 강조**(하이라이트 stroke)하고 **나머지 동은 약간의 그레이 처리**(`#33373f` fill 0.42). 폰 지도 `idle`마다 재계산.
  - 구현: 기존 `dongIndex`(동별 bbox)로 뷰포트에 걸치는 동 수를 세고(`countVisibleDongs`), `regionAt(센터)`로 센터 동을 찾아(`buildDongIndex`에 `key`=featKey 규칙 추가) `refreshPhoneMapStyles`에서 센터=`getBasicCenterStyle`/그 외=`getBasicDimStyle`로 렌더. 트렌드 전환/모드 무관하게 로컬 아닐 땐 자동 해제.
  - 임계값 6은 상수(튜닝 가능). 검증: 실 geojson(497개 동)으로 센터 판별·개수 카운트 노드 테스트 통과(≈1.2km뷰=6동 ON, 3km=15동 off). 지도 렌더는 라이브(Maps+로그인)에서만 관측.
- **v1.17.1 — 햄버거 드로어 가독성 수정**: v1.17.0에서 드로어 글래스를 너무 투명(`rgba(...,0.6)`)하게 잡아, **밝은 지도 위에서 배경이 중간 회색으로 떠 dim-gray 설정 텍스트**(`.settings-section h4` #6b7280, `.setting-row label` #9ca3af, `.section-hint`)의 대비가 무너지던 문제 → 드로어 배경을 **`rgba(12,13,20,0.9)`로 상향**(블러는 유지). "약간의 글래스" 느낌은 남기되 지도가 배경을 밝히지 못하게 해 텍스트 가독성 복구. (검증: 밝은 지도 배경 하네스로 0.6 washed-out ↔ 0.9 readable 비교 확인)
- **v1.17.0 — 폰 UI 4종 마감 (웹앱 풀스크린·저작권 숨김·모드토글 강조·드로어 글래스)**:
  1. **iOS 웹앱 하단 빈공간 제거**: PWA 메타는 이미 있었으나 standalone에서 하단이 남던 문제 → 모바일(≤768px) `.phone-screen`을 `height:100dvh`(iOS에서 하단 여백 유발)에서 **`position:absolute;inset:0`로 고정된 `#sidebar`(inset:0)를 그대로 채우도록** 변경. dvh 의존 제거 → 노치/홈 인디케이터까지 꽉 참.
  2. **폰 지도 구글 저작권/로고 숨김**: `.phone-map` 스코프로 `.gm-style-cc`·구글 로고·약관 링크 `display:none`. **데스크톱 메인 `#map` 저작권은 유지**(폰 미리보기만 실제 앱처럼).
  3. **상단 모드 토글(베이직/트렌드) 강조**: 아이콘 추가(📍/🔥). 흰색 헤더에 맞춰 세그먼트 트랙을 옅은 그레이로, **베이직=차분한 블루**(`#2f7bff`), **트렌드=Hot 그라데이션**(오렌지→레드 `#ff9d42→#ff3d5e`)+은은한 글로우, 트렌드 활성 시 🔥 미세 flicker. 플랫 디자인 유지.
  4. **햄버거 드로어 글래스화**: `#phone-drawer` 불투명 배경(0.98) → **반투명 다크 글래스**(`rgba(14,16,24,0.6)` + `blur(26px)`)로 → 하단 네비처럼 뒤 지도가 비침(드로어 텍스트는 라이트온다크라 가독성 유지).
  - 검증: 로컬 정적 프리뷰 하네스로 토글(베이직/트렌드)·드로어 글래스 시각 확인, 실 index.html 콘솔 에러 없음. iOS safe-area·구글 저작권 숨김은 실기기/라이브 Maps 타일에서만 관측되나 표준 방식 적용.
- **v1.16.0 — 컴포저 위치버그 수정 + 이모지 삭제 + 햄버거 메뉴(데모 리스트·관리자 설정)**:
  - **컴포저 위치 버그(핵심)**: `mapId`(벡터 지도)에선 `fromLatLngToDivPixel`이 (0,0) 반환·pane 정렬 안 됨. 게다가 `.spot-composer`의 `animation:cpIn ... both` 최종 키프레임 `transform:none`이 위치용 `transform:translate(-50%,-100%…)`을 **덮어써서** 팝업이 생성점 우하단으로 밀림. → 컴포저를 **지도 컨테이너(`getMap().getDiv()`)에 부착 + `draw()`가 `fromLatLngToContainerPixel`로 left/top 직접 계산**(팝업 하단=생성점, transform 미사용, `scFade` 애니메이션으로 교체). 생성점에 **펄스 점**(`.sc-dot::after`) 강조. (검증: 점이 지도 센터와 오차 −1px)
  - **이모지 삭제**: `buildEmojiPicker`의 각 이모지에 **롱프레스(500ms)/우클릭 → 삭제**(`delEmoji`, 최소 1개 유지, 삭제 후 재렌더+공유문서 저장).
  - **폰 햄버거 드로어 = 메뉴 허브**: `initPhoneMenu`가 `#content-*`/`#settings-*`(관리자 설정)를 **드로어로 이동**, 상단에 `#drawer-demo`(트렌드 존/스팟 리스트) 생성. `renderDrawerDemo`가 `trendZones`/`spotMessages`로 리스트 렌더(존 탭→트렌드 전환+`selectPhoneZone`, 스팟 탭→`focusSpot`, 후 드로어 닫힘). 역할별: `body.role-admin #drawer-demo{display:none}`(관리자는 실제 섹션), 데모는 role-user CSS로 섹션 숨김·리스트만. ⚠️ **관리자 설정이 이제 사이드바가 아니라 폰 햄버거에** 있음(데스크톱 사이드바엔 계정/모드/안내만).
- **v1.15.1 — 스팟 추가 버그픽스(누른 지점 팝업·유지) + 글래스 조정**:
  - **롱프레스/우클릭 = 누른 지점에 팝업 + 그 자리에 생성**: 이전엔 팝업이 좌하단 고정이라 손 떼면 사라져 추가 불가. 이제 `positionAddMenuAt`으로 **누른 좌표(폰스크린 기준)에 팝업**을 띄우고, `ProjHelper`(OverlayView) `getProjection().fromContainerPixelToLatLng`로 **누른 지점 latLng**를 구해 그 자리에 컴포저. **자동닫힘 방지**: 롱프레스 직후 emulated click이 닫던 문제 → document click 핸들러에 `Date.now()-addMenuOpenedAt<600` 가드.
  - **+버튼/사이드바 버튼 = 화면 센터**: `addSpotContent`가 `addAtLatLng`(제스처) 있으면 그 자리, 없으면 `m.getCenter()`. (지오메트릭 센터로 단순화 — visibleCenter는 헤더>네비라 오히려 아래로 치우쳐 제거.)
  - `attachAddGestures(el,mapObj)`가 contextmenu·롱프레스에서 `clientToLatLng`로 좌표 산출. `ProjHelper` 인스턴스는 `mapProjHelper`/`phoneProjHelper`(각 지도 생성 직후).
  - **글래스 조정**: 설정 패널(`#left-panel`) 글래스 **원복(불투명 `#f4f6f9`)**. 폰 메뉴 버튼은 **프로스티드 글래스**로 — 하단 네비/+/AI `rgba(24,26,34,0.58)+blur(22px)`, 모드토글 `rgba(255,255,255,0.42)+blur(8px)`. 폰 헤더 글래스는 유지.
- **v1.15.0 — 마스코트 아이콘 + 타이틀 + 스팟 강조/추가방식 개편 + 글래스**:
  - **앱 아이콘/파비콘 교체**: 첨부 마스코트(구름) 이미지 → `icon-512.jpg`/`icon-192.jpg`/`apple-touch-icon.jpg`/`favicon.jpg`. 브라우저 canvas로 마스코트 중심 크롭·리사이즈(sx300 sy180 1500²)해 JPEG 생성(툴 없이). manifest 아이콘 png→jpg(image/jpeg), HTML apple-touch/icon 링크·`?v` 갱신. 옛 `icon-*.png` 제거.
  - **페이지 타이틀** '동 단위 행정구역…' → **'Now Here Demo'**.
  - **스팟 롤오버/선택 강조**: 테두리(box-shadow 링) 제거 → **`transform:scale(1.16)`**(hover + `.spot-sel`). `selectedSpotId`+`setSelectedSpot`(_render서 `.spot-sel` 토글), `focusSpot`이 선택. `.spot-marker` pointer-events auto로 전 스팟 hover 가능.
  - **스팟 추가 방식 개편**(클릭 배치 폐지): `placingSpot`/`startPlacingSpot`/`onMapClickForSpot`/`setPlaceCursor`/`cancelPlacingSpot` 제거. 대신 **화면 롱프레스(touch 520ms)·우클릭(contextmenu)** → `attachAddGestures`가 좌측하단 `#content-add-menu` 팝업(제스처가 있던 지도를 `addTargetMap`으로). **+버튼/사이드바 추가버튼** → `openAddMenu`. 팝업 '스팟 메시지' → `addSpotAtCenter`가 **`addTargetMap`(없으면 `primaryMap`=모바일 폰/데스크톱 메인) 센터**에 컴포저. ⚠️ 데스크톱 메인맵 우클릭 시 팝업은 폰 미러(우측)에 뜸(폰 중심 설계).
  - **약한 글래스**: `#left-panel` bg `rgba(245,247,250,0.8)`+`backdrop-filter blur(18px)`, `.phone-header` bg `rgba(255,255,255,0.8)`+`blur(14px)`. 시인성 유지 위해 불투명도 0.8 유지.
- **v1.14.0 — 스팟 점색=버블색 + 데모 스팟추가 + 스팟목록 + 상단바 3분할 + 범위확대 + 버블여백**:
  - **점 색상 = 버블 색상 자동**: `dotColor` 설정/컨트롤(`ct-spot-dot`) 제거, `_render`가 `s.color||bgColor`로(개별 변경 색 포함).
  - **데모(뷰어)도 스팟 추가**: `startPlacingSpot`의 admin 게이트 제거(로그인만 요구). 데모가 만든 스팟은 `local:true` 플래그로 이 기기 `localStorage('nowhere_localSpots')`에 저장(`persistSpotChange`=admin→클라우드/데모→로컬). `applyCloudData`·초기로드에서 `loadLocalSpotsInto`로 병합, `cloudSave`는 `!local`만 저장(공유문서 오염 방지). ⚠️ **Firestore 규칙은 그대로**(공유문서 쓰기=관리자만). 데모 스팟을 '공유'로 하려면 규칙 완화+콘솔 배포 필요(보안 검토).
  - **스팟 메시지 목록**(`renderSpotList`/`focusSpot`, `#spot-list-area` 컨텐츠 설정 내): 이모지·텍스트·색점 + 이동(panTo)/삭제. `renderSpots` 끝에서 갱신.
  - **스팟 외 수치 설정 범위 확대**(시스템 최대): 선굵기 →0~50, 헥사곤 반경 →0.1~50, 로컬/존 라벨 크기 →4~200. (스팟 설정은 이전 요청대로 별도.)
  - **버블 좌우 여백 축소**: `.spot-bubble` padding 5px 10px→**4px 7px**.
  - **하단 네비 위로**: `.phone-navbar` padding-bottom 3.6cqw→**5.5cqw**(모바일 safe-area calc도), ai버블·컨텐츠추가 팝업 bottom 19→21cqw.
  - **상단바 3분할**: `.phone-appbar` flex→**grid `1fr auto 1fr`**. 햄버거 `justify-self:start`(좌), 모드토글 `justify-self:center`(가운데), 위치 `justify-self:end`(우). HTML도 순서 재배치(hamburger→pa-mode→pa-loc). 위치 폰트/핀 약간 축소.
- **v1.13.1 — 스팟 글자/이모지 크기 범위 확대**: 너무 큰 최소값 제한 완화. `spot-font-size` 9~22→**4~80**, `spot-emoji-size` 16~48(step2)→**4~120(step1)**. 숫자 입력이라 주의문구(`정수 4~80` 등)·clamp도 자동 반영.
- **v1.13.0 — PWA(전체화면 앱처럼)**: 폰에서 '홈 화면에 추가' 시 브라우저 크롬 없이 전체화면(standalone) 실행.
  - 신규 파일: `manifest.webmanifest`(display:standalone, portrait, theme_color #fff, background #0b0d16, 아이콘 3개), `icon-192.png`/`icon-512.png`(any+maskable)/`apple-touch-icon.png`(180). 아이콘은 위치핀(블루→퍼플 그라디언트+흰점, 다크 그라디언트 배경) — 스크래치패드 `genicons.js`(zlib로 PNG 직접 인코딩)로 생성(스크립트는 repo에 없음, 재생성 시 참고).
  - `index.html <head>`: viewport에 `viewport-fit=cover, user-scalable=no` 추가, `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title`, `manifest`/`apple-touch-icon`/`icon` 링크.
  - CSS(≤768px): `.phone-header` top / `.phone-navbar` bottom / 드로어 헤드에 `env(safe-area-inset-*)` 안전영역 패딩(노치·홈인디케이터 대비).
  - **서비스워커는 의도적으로 미포함** — 자주 배포하는 데모라 캐시 구버전 문제 회피. iOS는 SW 없이도 '홈 화면 추가' 전체화면 됨(안드로이드도 메뉴에서 수동 추가 시 standalone). 자동 설치배너만 없음.
  - ⚠️ 알려진 한계: standalone(iOS)에서는 `signInWithPopup`이 막힐 수 있음(팝업 차단). 실제 모바일 PWA 로그인까지 필요해지면 `signInWithRedirect`로 전환 검토.
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
