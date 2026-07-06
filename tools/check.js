#!/usr/bin/env node
/* 버전 동기화·문법 검사 — push 전 필수 (`node tools/check.js`), pages.yml 배포 전에도 자동 실행.
   실패 시 exit 1 → CI가 배포를 막아 dev.html/diagram.html 최신화 의무를 강제한다. */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
var fail = [];

// ① index.html 버전 3곳 동기화 (#app-version = 모든 ?v= 캐시버스트)
var idx = read('index.html');
var av = (idx.match(/id="app-version">v([\d.]+)</) || [])[1];
if (!av) fail.push('index.html: #app-version 스팬 없음');
['style.css', 'app.js', 'config.js'].forEach(function (f) {
  var m = idx.match(new RegExp(f.replace('.', '\\.') + '\\?v=([\\d.]+)'));
  if (!m) fail.push('index.html: ' + f + ' 캐시버스트(?v=) 없음');
  else if (m[1] !== av) fail.push('index.html: ' + f + '?v=' + m[1] + ' ≠ 앱 v' + av);
});

// ② dev.html·diagram.html 반영 버전 스탬프 = 앱 버전 (매 push 변경 반영 + 스탬프 갱신 의무)
//    deck.html은 콘텐츠 기준 버전이라 지연 허용 — 참고 출력만.
function stamp(f) { var m = read(f).match(/data-app-ver="v([\d.]+)"/); return m ? m[1] : null; }
['dev.html', 'diagram.html'].forEach(function (f) {
  var v = stamp(f);
  if (!v) fail.push(f + ': data-app-ver 스탬프 없음');
  else if (v !== av) fail.push(f + ': 반영 버전 v' + v + ' ≠ 앱 v' + av + ' — 이 페이지는 push마다 변경 반영 후 data-app-ver를 앱 버전으로 갱신해야 합니다');
});
console.log('deck.html 반영 버전: v' + (stamp('deck.html') || '?') + ' (소개 덱은 지연 허용)');

// ③ app.js 문법
try { new Function(read('app.js')); } catch (e) { fail.push('app.js 문법 오류: ' + e.message); }

if (fail.length) {
  console.error('\n❌ check 실패 (' + fail.length + '건):\n- ' + fail.join('\n- ') + '\n');
  process.exit(1);
}
console.log('✅ check OK — 앱 v' + av + ' · 버전 3곳 동기화 · dev/diagram 스탬프 일치 · app.js 문법 정상');
