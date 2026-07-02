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
- 이 repo는 **`main` 브랜치 루트에서 GitHub Pages(legacy, deploy-from-branch) 배포**됨.
- 배포 URL: **https://gihoon-mx.github.io/now-here-demo/**

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
- **현재 최신: v1.6.0**

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
- **v1.6.0 — 폰 앱화 (햄버거 메뉴 + 모드 토글)**: 폰 상단바에 **좌=햄버거(≡)**, **우=로컬/트렌드 모드 토글** 추가. 햄버거 클릭 시 기존 "폰 아래 설정 패널"(`#left-panel`)이 **폰 안 드로어**로 슬라이드 인(닫기 X 버튼). 패널을 런타임에 `#phone-drawer`로 이동(`initPhoneMenu`). 데모 노출 규칙 동일 — 햄버거·모드토글은 노출, 설정·스팟추가 등은 `role-user`로 숨김. (부수효과: 데스크톱 사이드바 하단이 비게 됨 — 폰 중심 UI)
- **v1.5.0 — 스팟 메시지(관리자 기능)**: 로컬모드에서 지도 위 위치에 **이모지+말풍선** 메시지. `💬 스팟 메시지 추가`(설정 위, 관리자만)→지도 클릭으로 위치 선택→이모지 선택+텍스트 입력→등록. 스팟 클릭 시 삭제(관리자). 설정: 최대 글자수/글자크기/이모지 크기/글자색/배경색·투명도. 메인+폰 지도 양쪽 렌더(`SpotBubble` OverlayView).
  - **저장 구조 변경**: 관리자 콘텐츠(존+스팟+설정)를 `users/{uid}` → **`shared/mapContent`** 공유 문서로 이전. 관리자만 쓰기, **로그인 사용자(데모 포함) 모두 읽기** → 데모유저도 관리자가 만든 존/스팟을 볼 수 있음.
  - ⚠️⚠️ **Firestore 규칙 배포 필요**: `firestore.rules`에 `match /shared/{docId}`(관리자 쓰기/로그인 읽기) 추가함. **Firebase 콘솔(Firestore→규칙)에 이 규칙을 배포해야** 스팟 저장·데모 뷰잉이 동작. 미배포 시 저장이 조용히 실패(`console.warn('shared save fail')`).
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
