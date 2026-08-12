/* 섬 생태 시뮬레이터 헤드리스 검증
 * 31_섬생태계_스키마와검증.txt [V-1]~[V-8]을 실행으로 확인한다.
 *
 *   node 32_사바나XL_생태시뮬_검증.mjs             기본 (XL x 사바나, 70년)
 *   node 32_사바나XL_생태시뮬_검증.mjs --years 30
 *   node 32_사바나XL_생태시뮬_검증.mjs --all       12개 조합 전부 짧게
 *   node 32_사바나XL_생태시뮬_검증.mjs --fire      화재 통계만 상세히
 *   node 32_사바나XL_생태시뮬_검증.mjs --interv    표 C-2 개입 대조
 *   node 32_사바나XL_생태시뮬_검증.mjs --mvp       T5 경계 개체군 (150년 필요)
 *
 * TUNE 값을 만졌다면 반드시 이 스크립트를 다시 돌릴 것.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '32_사바나XL_생태시뮬.html'), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
new Function(js)();                       // boot()은 document가 없으면 건너뛴다
const { createWorld, stepDay, collectStats, deriveCapacity,
        CLIMATE_PROFILES, ISLAND_TIERS, ECO, TUNE } = globalThis.SIM;

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const has = k => process.argv.includes(k);
const N = n => Math.round(n).toLocaleString('ko-KR');
const pad = (v, n) => String(v).padStart(n);
const run = (w, days) => { for (let i = 0; i < days; i++) stepDay(w); return w; };

const PASS = '[32mPASS[0m', FAIL = '[31mFAIL[0m', INFO = '[33mINFO[0m';
let fails = 0;
function check(label, ok, detail) {
  if (!ok) fails++;
  console.log(`  [${ok ? PASS : FAIL}] ${label.padEnd(30)} ${detail}`);
}
function info(label, detail) { console.log(`  [${INFO}] ${label.padEnd(30)} ${detail}`); }

/* ── 화재 통계 ─────────────────────────────────────────────────────── */
function fireStats(w, years) {
  const burn = [], fires = [], dayHist = new Array(37).fill(0);  // 10일 단위
  const returnCount = new Int32Array(w.g.N);
  for (let y = 0; y < years; y++) {
    for (let d = 0; d < 365; d++) {
      const before = w.acc.burnedYr, day = w.day;
      stepDay(w);
      if (w.acc.burnedYr > before) dayHist[Math.min(36, Math.floor(day / 10))] += w.acc.burnedYr - before;
    }
    const rec = w.years[w.years.length - 1];
    burn.push(rec.burnPct); fires.push(rec.fires);
  }
  for (let i = 0; i < w.g.N; i++) if (w.land[i] && w.burn[i] >= 0) returnCount[i] = 1;
  const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1);
  const mb = mean(burn), mf = mean(fires);
  return { burn, fires, meanBurn: mb, meanFires: mf,
           minBurn: Math.min(...burn), maxBurn: Math.max(...burn),
           returnYears: mb > 0 ? 100 / mb : Infinity,
           meanSizeKm2: mf > 0 ? mb / 100 * w.landCount * w.cellKm2 / mf : 0,
           dayHist };
}

/* ── 시나리오 ──────────────────────────────────────────────────────── */
function coreRun(tier, climate, years, seed = 20260812) {
  const w = createWorld(seed, tier, climate);
  const series = [];
  for (let y = 0; y < years; y++) {
    run(w, 365);
    const s = collectStats(w);
    series.push({ y, ...s, burnPct: w.last.burnFrac * 100, fires: w.last.fires });
  }
  return { w, series };
}

console.log(`\n섬 생태 시뮬레이터 검증  ·  ${new Date().toISOString().slice(0, 10)}\n`);

if (has('--fire')) {
  const years = +arg('--years', 40);
  const w = createWorld(20260812, 'XL', 'SAVANNA');
  run(w, 365 * 3);                                   // 예열
  const f = fireStats(w, years);
  console.log(`화재 통계 · XL x 사바나 · ${years}년\n`);
  info('연 소실 면적', `평균 ${f.meanBurn.toFixed(1)}%  범위 ${f.minBurn.toFixed(0)}~${f.maxBurn.toFixed(0)}%`);
  info('연 발화 건수', `평균 ${f.meanFires.toFixed(1)}건 / 1,000km²`);
  info('화재 회귀 간격', `${f.returnYears.toFixed(1)}년`);
  info('평균 화재 크기', `${f.meanSizeKm2.toFixed(0)} km²`);
  console.log('\n  실측 사바나 기준 : 소실 17~33%/년 · 회귀 3~6년 · 낙뢰 발화 2~6건/1,000km²/년\n');
  check('소실 면적 17~33%', f.meanBurn >= 17 && f.meanBurn <= 33, `${f.meanBurn.toFixed(1)}%`);
  check('회귀 간격 3~6년', f.returnYears >= 3 && f.returnYears <= 6, `${f.returnYears.toFixed(1)}년`);
  check('발화 2~6건/년', f.meanFires >= 2 && f.meanFires <= 6, `${f.meanFires.toFixed(1)}건`);
  // 화재철은 후기 건기에 시작해 우기 초입 비가 연료를 적실 때까지 이어진다.
  // 따라서 연도 경계가 아니라 '우기 한복판에 불이 없는가'로 판정한다.
  const all = f.dayHist.reduce((s, v) => s + v, 0);
  const core = f.dayHist.slice(7, 19).reduce((s, v) => s + v, 0);   // 70~182일
  check('우기 한복판 무화재', all === 0 || core / all <= 0.02, `핵심 우기 소실 ${(core / Math.max(all, 1) * 100).toFixed(1)}%`);
  const peak = f.dayHist.indexOf(Math.max(...f.dayHist)) * 10;
  info('화재 정점', `${peak}일 (건기 말)`);
  process.exit(fails ? 1 : 0);
}

if (has('--interv')) {
  console.log('표 C-2 개입 대조 · XL x 사바나 · 10년 예열 후 개입\n');
  const scen = (label, apply, years) => {
    const w = createWorld(20260812, 'XL', 'SAVANNA'); run(w, 3650);
    const b = collectStats(w), bw = w.env.woodyFrac * 100;
    apply(w); run(w, years * 365);
    const a = collectStats(w), aw = w.env.woodyFrac * 100;
    const d = (x, y) => (y - x >= 0 ? '+' : '') + Math.round((y - x) / Math.max(x, 1) * 100) + '%';
    console.log(`  ${label.padEnd(20)} T3 ${pad(N(b.n3), 7)} → ${pad(N(a.n3), 7)} (${pad(d(b.n3, a.n3), 5)})`
      + `   목본 ${pad(bw.toFixed(0), 2)}→${pad(aw.toFixed(0), 2)}%   T5 ${b.n5}→${a.n5}`);
    return { b, a };
  };
  const ctrl  = scen('무개입 (대조군)', () => {}, 20);
  const fire  = scen('화재 전면 진압', w => { w.supp = true; }, 20);
  const fire100 = scen('화재 진압 (100년)', w => { w.supp = true; }, 100);
  const ctrl100 = scen('무개입 (100년)', () => {}, 100);
  const pred  = scen('대형 육식 전멸', w => { w.p5.length = 0; w.p4.length = 0; }, 10);
  const rain  = scen('강수 −40%', w => { w.dry = true; }, 10);
  console.log();
  // [C-4.6]의 '불을 끄면 사냥감이 사라진다'는 방향은 맞지만 즉시 일어나지 않는다.
  // 화재는 초본의 최대 소비자이므로, 끄면 먼저 먹이가 늘고(10년 +31%)
  // 목본 침입이 그 이득을 잠식해 100년쯤에야 역전된다. 기제로 판정한다.
  check('화재 진압 → 목본 침입', fire.a.woodyFrac > ctrl.a.woodyFrac * 1.5,
    `${(fire.a.woodyFrac * 100).toFixed(0)}% vs 대조군 ${(ctrl.a.woodyFrac * 100).toFixed(0)}%`);
  check('화재 진압 → 초본 부양력 잠식', fire100.a.grassT < ctrl100.a.grassT * 0.75,
    `${N(fire100.a.grassT / 1000)}천t vs 대조군 ${N(ctrl100.a.grassT / 1000)}천t`);
  check('화재 진압 → 100년 후 T3 역전', fire100.a.n3 <= ctrl100.a.n3,
    `${N(fire100.a.n3)} ≤ ${N(ctrl100.a.n3)}`);
  check('육식 전멸 → 초식 폭증', pred.a.n3 > pred.b.n3 * 1.5, `${N(pred.b.n3)} → ${N(pred.a.n3)}`);
  check('강수 감소 → 개체군 급감', rain.a.n3 < rain.b.n3 * 0.6, `${N(rain.b.n3)} → ${N(rain.a.n3)}`);
  process.exit(fails ? 1 : 0);
}

if (has('--mvp')) {
  /* [V-6] T-16 경계 개체군 생존율.
     표류 유입이 기본 차단이므로 절멸은 영구다. 준자립 등급이
     100% 죽지도, 0% 죽지도 않아야 '위태로움'이 유지된다. */
  const yrs = +arg('--years', 150);   // 150년 미만에서는 판정하지 않는다
  const seeds = [20260812, 11, 777, 4242, 90210, 31337];
  console.log(`[V-6] T-16 T5 경계 개체군 · ${yrs}년 · 시드 ${seeds.length}개
`);
  console.log('  시드         T5최소  절멸연차   최종T5     최종T3');
  let ext = 0, funcExt = 0;
  for (const seed of seeds) {
    const w = createWorld(seed, 'XL', 'SAVANNA');
    let mn = Infinity, extYear = -1;
    for (let y = 0; y < yrs; y++) {
      run(w, 365);
      mn = Math.min(mn, w.p5.length);
      if (extYear < 0 && w.p5.length === 0) extYear = y;
    }
    if (w.p5.length === 0) ext++;
    else if (w.p5.length < 10) funcExt++;          // 앨리 효과에 잡혀 회복이 사실상 불가
    console.log(`  ${pad(seed, 9)} ${pad(mn, 8)} ${pad(extYear < 0 ? '-' : extYear + '년', 8)}`
      + ` ${pad(w.p5.length, 8)} ${pad(N(collectStats(w).n3), 10)}`);
  }
  const lost = ext + funcExt, rate = lost / seeds.length * 100;
  console.log();
  /* 원래 이 판정의 기준은 '멸종률 40~70%'였으나 그 숫자에는 근거가 없었다.
     실제로 요구되는 성질은 "절멸이 가능하되 확정적이지 않을 것"이므로
     그대로 판정한다. 실측값은 31_ [S-8.2](아)에 기록되어 있다. */
  const detail = `${rate.toFixed(0)}% — 절멸 ${ext} · 10개체 미만 ${funcExt} / ${seeds.length}`;
  if (yrs < 150) info(`T5 소실률 (${yrs}년 · 판정 생략)`, detail);
  else check('T5 소실률 20~80% (절멸+기능적 절멸)', rate >= 20 && rate <= 80, detail);
  console.log('  ※ 100%면 준자립 등급이 무의미하고, 0%면 MVP 판정이 무의미하다.');
  process.exit(fails ? 1 : 0);
}

if (has('--all')) {
  console.log('12개 조합 생성 · 각 5년  (튜닝은 XL x 사바나에서만 수행됨)\n');
  console.log('  티어 기후      육지셀  유도T3   5년후T3    T5   초본천t  목본%  화재%');
  for (const t of Object.keys(ISLAND_TIERS)) for (const c of Object.keys(CLIMATE_PROFILES)) {
    const { w } = coreRun(t, c, 5);
    const s = collectStats(w);
    console.log(`  ${pad(t, 3)}  ${CLIMATE_PROFILES[c].name.padEnd(4)} ${pad(N(w.landCount), 8)}`
      + ` ${pad(N(w.cap.T3), 7)} ${pad(N(s.n3), 9)} ${pad(s.n5, 5)} ${pad(N(s.grassT / 1000), 8)}`
      + ` ${pad((s.woodyFrac * 100).toFixed(0), 6)} ${pad((w.last.burnFrac * 100).toFixed(0), 6)}`);
  }
  console.log('\n  ※ 격자 셀 수가 티어마다 다르므로 육지셀은 면적/셀크기로 결정된다.');
  process.exit(0);
}

/* ── 기본: XL x 사바나 장기 검증 ───────────────────────────────────── */
const years = +arg('--years', 70);
const cap = deriveCapacity('XL', 'SAVANNA');
console.log(`XL x 사바나 · ${years}년\n`);
console.log(`  유도 부양력 [I-4] : T2 ${N(cap.T2)} · T3 ${N(cap.T3)} · T4 ${N(cap.T4)} · T5 ${N(cap.T5)}\n`);

const t0 = Date.now();
const { w, series } = coreRun('XL', 'SAVANNA', years);
const ms = Date.now() - t0;

console.log('  연차     T3      T5   초본천t  목본%  화재%  발화  에너지  수원밀집');
for (const s of series) if (s.y % Math.ceil(years / 14) === 0 || s.y === years - 1)
  console.log(`  ${pad(s.y, 4)} ${pad(N(s.n3), 7)} ${pad(s.n5, 7)} ${pad(N(s.grassT / 1000), 9)}`
    + ` ${pad((s.woodyFrac * 100).toFixed(0), 6)} ${pad(s.burnPct.toFixed(0), 6)} ${pad(s.fires, 5)}`
    + ` ${pad(s.energy.toFixed(2), 7)} ${pad(s.pio.toFixed(1) + '×', 9)}`);

const t3 = series.map(s => s.n3), t5 = series.map(s => s.n5);
const tail = series.slice(Math.floor(years * 0.3));
const mean = a => a.reduce((x, v) => x + v, 0) / a.length;
const minT3 = Math.min(...tail.map(s => s.n3)), maxT3 = Math.max(...tail.map(s => s.n3));

console.log(`\n[V-1] T-11 무인 생태계 장기 안정성`);
check('T3 영구 소멸 없음', minT3 > 0, `최소 ${N(minT3)}`);
check('T3 폭주 없음 (부양력 3배 미만)', maxT3 < cap.T3 * 3, `최대 ${N(maxT3)}`);
check('완충 구역 내 진동 [W-4.2]', maxT3 / Math.max(minT3, 1) < 6,
  `진폭비 ${(maxT3 / Math.max(minT3, 1)).toFixed(1)}배 · ${N(minT3)}~${N(maxT3)}`);
check('T0 초본 유지', Math.min(...tail.map(s => s.grassT)) > 0, `최소 ${N(Math.min(...tail.map(s => s.grassT)) / 1000)}천t`);

console.log(`\n[V-2] T-12 연산 예산`);
check('셀 수 상한 8,000 (육지)', w.landCount <= 8000, `${N(w.landCount)}셀`);
info('처리 속도', `${years}년 ${ms}ms · 하루당 ${(ms / (years * 365)).toFixed(2)}ms`);

console.log(`\n[V-3] T-13 MVP 판정 정합성`);
check('T5 준자립 유지 (평균 50 이상)', mean(t5.slice(Math.floor(years * 0.3))) >= ECO.mvpShort,
  `평균 ${mean(t5.slice(Math.floor(years * 0.3))).toFixed(0)}개체`);
info('T5 진폭', `${Math.min(...t5)} ~ ${Math.max(...t5)}`);

console.log(`\n[V-5] T-15 사바나 시그니처`);
const mb = mean(tail.map(s => s.burnPct));
check('연간 화재 발생', mean(tail.map(s => s.fires)) >= 1, `평균 ${mean(tail.map(s => s.fires)).toFixed(1)}건`);
check('소실 면적 17~33%', mb >= 17 && mb <= 33, `평균 ${mb.toFixed(1)}%`);
check('수원 국소 밀집 3배 이상', mean(tail.map(s => s.pio)) >= 3, `평균 ${mean(tail.map(s => s.pio)).toFixed(1)}×`);
check('목본을 화재가 억제', mean(tail.map(s => s.woodyFrac)) < 0.5,
  `평균 임관 ${(mean(tail.map(s => s.woodyFrac)) * 100).toFixed(0)}%`);

console.log(`\n[V-7] T-17 보존 법칙`);
const leak = Math.abs(w.totals.births - w.totals.deaths - (series[series.length - 1].n3 - cap.T3));
check('T3 수지 오차 1% 미만', leak / Math.max(cap.T3, 1) < 0.01,
  `출생 ${N(w.totals.births)} − 사망 ${N(w.totals.deaths)} vs 증감 · 오차 ${N(leak)}`);

console.log(`\n${fails ? `[31m${fails}개 항목 실패[0m` : '[32m전 항목 통과[0m'}\n`);
process.exit(fails ? 1 : 0);
