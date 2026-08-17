/* 모듈 -> 단일 HTML 빌드
 *
 *   node 빌드.mjs
 *
 * 아티팩트는 CSP 때문에 외부 요청을 할 수 없어 반드시 단일 파일이어야 한다.
 * 그래서 소스는 sim/ · ui/ 로 나눠 두고, 이 스크립트가 하나로 합친다.
 * 편집은 언제나 모듈 쪽에서 하고, 산출물(32_섬생태_시뮬레이터.html)은 건드리지 않는다.
 *
 * 합치는 방식은 단순하다. import/export 문을 걷어내고 의존 순서대로 이어 붙인다.
 * 그래서 두 가지 규칙을 지켜야 한다.
 *   1) 모듈 간 이름이 겹치면 안 된다 (같은 스코프에 놓이므로)
 *   2) 순환 의존이 없어야 한다 (아래 ORDER 가 곧 의존 순서다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '32_섬생태_시뮬레이터.html');

/* 의존 순서. 위에 있는 것이 아래를 참조하지 않는다(단, 함수 호출은 예외 —
   호이스팅되므로 선언 순서와 무관하다). */
const ORDER = [
  'sim/01_사양상수.js',
  'sim/02_튜닝상수.js',
  'sim/03_유틸.js',
  'sim/04_유도.js',
  'sim/05_종.js',
  'sim/06_개체.js',
  'sim/10_기록.js',
  'sim/12_종발자취.js',
  'sim/09_통계이력.js',
  'sim/07_세계생성.js',
  'sim/13_환경과화재.js',
  'sim/14_초식.js',
  'sim/15_포식.js',
  'sim/08_하루.js',
  'sim/11_분석서.js',
  'ui/표현.js',
];

const read = p => fs.readFileSync(path.join(here, p), 'utf8');

/* import 줄과 export 키워드를 걷어낸다. 합쳐지면 한 스코프가 되므로 필요 없다. */
function strip(src, file) {
  const out = [];
  let inImport = false;
  for (const line of src.split('\n')) {
    if (inImport) { if (/;\s*$/.test(line)) inImport = false; continue; }
    if (/^\s*import\s/.test(line)) { if (!/;\s*$/.test(line)) inImport = true; continue; }
    if (/^\s*export\s*\*/.test(line) || /^\s*export\s*\{[^}]*\}\s*from/.test(line)) continue;
    if (/^\s*export\s*\{/.test(line)) continue;
    out.push(line.replace(/^(\s*)export\s+/, '$1'));
  }
  return `/* ══ ${file} ══════════════════════════════════════════════ */\n`
       + out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const title = '섬 생태 시뮬레이터 · 종과 개체';
const body = [
  `<title>${title}</title>`,
  '<style>',
  read('ui/스타일.css').trim(),
  '</style>',
  '',
  read('ui/레이아웃.html').trim(),
  '',
  '<script>',
  '"use strict";',
  '/* ═══════════════════════════════════════════════════════════════════════════',
  '   이 파일은 빌드 산출물이다. 직접 편집하지 말 것.',
  '   소스는 sim/ 와 ui/ 에 있고, `node 빌드.mjs` 가 여기로 합친다.',
  '   ═══════════════════════════════════════════════════════════════════════════ */',
  '',
  ...ORDER.map(f => strip(read(f), f)),
  '',
  '/* 헤드리스 검증은 모듈을 직접 import 한다. 브라우저에서만 화면을 띄운다. */',
  "if (typeof document !== 'undefined') boot();",
  '</script>',
].join('\n');

fs.writeFileSync(OUT, body, 'utf8');
const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
console.log(`빌드 완료 · ${path.basename(OUT)} · ${kb} KB · 모듈 ${ORDER.length}개`);
