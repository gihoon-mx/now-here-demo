/* ===================================================
   config.js – 설정값 관리
   사내 배포용 – API 키 포함
   =================================================== */

// 단일 Google Cloud 키 — Maps JavaScript API + Firebase 공용 (2026-07-07 일원화, 구 지도전용 키 폐기).
// 클라이언트 키라 브라우저에 노출되는 게 정상 — 보안은 Cloud Console의 HTTP 리퍼러/API 제약으로.
const GCP_API_KEY = 'AIzaSyCF633b0Bjsln4lEf2DJ35k9bUzI5QGXY8';

const CONFIG = {
  GOOGLE_MAPS_API_KEY: GCP_API_KEY,
  MAP_ID: 'b14f18f7b1a7d77aa39cc4cf',
  /* 다크 모드에서 쓸 **두 번째 Map ID** (v2.62.7).
     Google Cloud Console › Google Maps Platform › 지도 관리(Map Management)에서
     지도 ID 를 하나 더 만들고(유형: JavaScript · 래스터/벡터 아무거나), 지도 스타일
     관리(Map Styles)에서 **어두운 스타일**을 만들어 그 ID 에 연결한 뒤 여기 붙이면 된다.
     비어 있으면 앱이 **덮개로 떨어진다**(mapPane 한 겹) — 그때도 지도는 어두워지지만
     라벨·도로까지 같이 눌리므로, 이 값이 채워지는 편이 훨씬 낫다. */
  MAP_ID_DARK: '',
  MAP_CENTER_LAT: 37.38,
  MAP_CENTER_LNG: 127.05,
  MAP_ZOOM: 11,
  GEOJSON_PATH: 'dong_boundary.geojson',
  ADMIN_EMAIL: 'gihoon.mx@gmail.com',
  FIREBASE: {
    apiKey: GCP_API_KEY,
    authDomain: "now-here-demo.firebaseapp.com",
    projectId: "now-here-demo",
    storageBucket: "now-here-demo.firebasestorage.app",
    messagingSenderId: "377718237179",
    appId: "1:377718237179:web:3f2fe8db8ed214a73a8d5e"
  },

  /* [M08] Ask Map 의 답을 어디서 받아오나.
     ENABLED=true  → persona-vc 콘솔의 /api/app-agent (실제 모델 · 과금)
     ENABLED=false → app.js 의 템플릿 매칭(aiChatAnswer). v1.75 까지의 동작이다.
     롤백은 이 값 하나만 false 로 두면 된다 — 템플릿 코드는 지우지 않고 남겨 뒀다.
     원격이 꺼져 있거나(503) 실패·시간초과여도 자동으로 템플릿으로 되돌아간다.
     임베드(?embed=1)에서는 값과 무관하게 항상 템플릿이다 — 시연은 매번 같아야 한다. */
  AI_AGENT: {
    ENABLED: true,
    ENDPOINT: 'https://persona-vc--persona-lab-503406.asia-east1.hosted.app/api/app-agent',
    TIMEOUT_MS: 12000,
    HISTORY_TURNS: 6
  },
};
