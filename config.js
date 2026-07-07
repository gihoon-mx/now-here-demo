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
};
