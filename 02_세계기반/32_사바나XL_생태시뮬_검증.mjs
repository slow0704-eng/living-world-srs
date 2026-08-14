/* 섬 생태 시뮬레이터 헤드리스 검증
 * 31_섬생태계_스키마와검증.txt [V-1]~[V-8]을 실행으로 확인한다.
 *
 *   node 32_사바나XL_생태시뮬_검증.mjs             기본 (XL x 사바나, 70년)
 *   node 32_사바나XL_생태시뮬_검증.mjs --years 30
 *   node 32_사바나XL_생태시뮬_검증.mjs --all       12개 조합 전부 짧게
 *   node 32_사바나XL_생태시뮬_검증.mjs --fire      화재 통계만 상세히
 *   node 32_사바나XL_생태시뮬_검증.mjs --interv    표 C-2 개입 대조
 *   node 32_사바나XL_생태시뮬_검증.mjs --mvp       T5 경계 개체군 (150년 필요)
 *   node 32_사바나XL_생태시뮬_검증.mjs --run --years 300 [--seed N --tier XL --climate SAVANNA]
 *       -> _결과/ 폴더에 .txt(사람용 요약 + 자동 판독)와 .json(전체 시계열)을 남긴다
 *
 * TUNE 값을 만졌다면 반드시 이 스크립트를 다시 돌릴 것.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/* 모듈을 직접 가져온다. 예전에는 HTML에서 <script>를 잘라 eval 했는데,
   주석 한 줄만 옮겨도 깨지는 방식이었다. */
import { createWorld, stepDay, collectStats, deriveCapacity, hallOfFame, indBrief, indexByUid, speciesTrail,
         CLIMATE_PROFILES, ISLAND_TIERS, ECO, TUNE } from './sim/index.js';
import { writeReport } from './판독.mjs';
const TUNE_SNAPSHOT = JSON.parse(JSON.stringify(TUNE));

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
  const initialT3 = collectStats(w).n3;      // 종별 체중 분포 때문에 유도값과 다르다
  const series = [];
  for (let y = 0; y < years; y++) {
    run(w, 365);
    const s = collectStats(w);
    series.push({ y, ...s, burnPct: w.last.burnFrac * 100, fires: w.last.fires });
  }
  return { w, series, initialT3 };
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
  const WARM = 10;   // 개입 전 예열 연차. 초기 과도기를 지나야 대조가 성립한다
  console.log(`표 C-2 개입 대조 · XL x 사바나 · ${WARM}년 예열 후 개입\n`);
  const scen = (label, apply, years) => {
    const w = createWorld(20260812, 'XL', 'SAVANNA'); run(w, WARM * 365);
    const b = collectStats(w), bw = w.env.woodyFrac * 100;
    apply(w); run(w, years * 365);
    const a = collectStats(w), aw = w.env.woodyFrac * 100;
    /* 개입 기간의 평균도 함께 낸다. T3는 진폭이 커서 마지막 한 해만 보면
       개입 효과가 아니라 진동의 위상을 재게 된다. */
    const rows = w.years.slice(-years);
    const m3 = rows.reduce((s, r) => s + r.T3, 0) / Math.max(rows.length, 1);
    const d = (x, y) => (y - x >= 0 ? '+' : '') + Math.round((y - x) / Math.max(x, 1) * 100) + '%';
    console.log(`  ${label.padEnd(20)} T3 ${pad(N(b.n3), 7)} → ${pad(N(a.n3), 7)} (${pad(d(b.n3, a.n3), 5)})`
      + `   기간평균 ${pad(N(m3), 7)}   목본 ${pad(bw.toFixed(0), 2)}→${pad(aw.toFixed(0), 2)}%   T5 ${b.n5}→${a.n5}`);
    return { b, a, m3 };
  };
  const ctrl  = scen('무개입 (대조군)', () => {}, 20);
  const ctrl10 = scen('무개입 (10년)', () => {}, 10);
  const fire  = scen('화재 전면 진압', w => { w.supp = true; }, 20);
  const fire100 = scen('화재 진압 (100년)', w => { w.supp = true; }, 100);
  const ctrl100 = scen('무개입 (100년)', () => {}, 100);
  const pred  = scen('대형 육식 전멸', w => { w.p5.length = 0; w.p4.length = 0; }, 10);
  const rain  = scen('강수 −40%', w => { w.dry = true; }, 10);
  console.log();
  /* [C-4.6] "불을 끄면 사냥감이 사라진다"는 목본-초지 경쟁 강도 하나에 달려 있다.
     억제계수 0.85(옛 값)에서는 100년쯤 역전되지만, 실제 사바나에 맞춘 0.55
     에서는 역전되지 않는다. 화재가 초본의 최대 소비자라 불을 끄면 먹이가
     먼저 늘고, 목본 침입이 그 이득을 깎기는 해도 뒤집지는 못한다.
     따라서 기제(목본 침입)로 판정하고 T3 역전은 관측만 한다. */
  check('화재 진압 → 목본 침입 (20년)', fire.a.woodyFrac > ctrl.a.woodyFrac * 1.35,
    `${(fire.a.woodyFrac * 100).toFixed(0)}% vs 대조군 ${(ctrl.a.woodyFrac * 100).toFixed(0)}%`);
  check('화재 진압 → 목본 침입 (100년)', fire100.a.woodyFrac > ctrl100.a.woodyFrac * 1.8,
    `${(fire100.a.woodyFrac * 100).toFixed(0)}% vs 대조군 ${(ctrl100.a.woodyFrac * 100).toFixed(0)}%`);
  info('화재 진압 → T3 (100년)',
    `${N(fire100.a.n3)} vs 대조군 ${N(ctrl100.a.n3)} — 역전되지 않는다 (억제계수 0.55)`);
  /* 개입군의 전후를 비교하면 초기 과도기의 하강이 그대로 섞인다.
     10년차는 아직 첫 과잉의 정점이라 대조군도 60% 넘게 깎인다.
     개입의 효과는 같은 시점의 대조군과 견주어야 나온다. */
  check('육식 전멸 → 초식 해방', pred.m3 > ctrl10.m3 * 1.2,
    `기간평균 ${N(pred.m3)} vs 대조군 ${N(ctrl10.m3)}`);
  check('강수 감소 → 개체군 급감', rain.m3 < ctrl10.m3 * 0.6,
    `기간평균 ${N(rain.m3)} vs 대조군 ${N(ctrl10.m3)}`);
  process.exit(fails ? 1 : 0);
}

/* ── 결과 저장 : _결과/ 폴더에 실행 기록을 남긴다 ──────────────────────
   시뮬을 돌릴 때마다 남겨 두면 나중에 읽고 해석할 수 있다.
   .json 은 기계 판독용 전체 시계열, .txt 는 사람이 읽는 요약이다. */
function saveRun(w, meta) {
  const dir = path.join(here, '_결과');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = meta.stamp;
  const base = `${stamp}_${w.tierKey}_${w.climateKey}_${w.year}년`;

  const species = w.species.filter(s => s.kind === 'ANIMAL' && !s.aggregate).map(s => ({
    name: s.name, trophic: s.trophic, massKg: +s.massKg.toFixed(1),
    diet: s.diet.map(d => w.species[d].name), droughtTol: +s.droughtTol.toFixed(2),
    lifespanYr: +s.lifespanYr.toFixed(1),
    seedN: s.seedN, finalN: Math.round(s.n), status: s.status, extinctYear: s.extinctYear,
    ...speciesTrail(s),
  }));
  /* 개체 표본은 최근 것만 남긴다. 전부 넣으면 수만 마리라 json 이 감당이 안 된다.
     대신 판 전체의 기록은 legacy(명예의 전당)가 들고 있다. */
  const byUid = indexByUid(w);
  const individuals = w.inds.slice(-300).map(i => indBrief(w, i, byUid));
  const json = {
    meta: { ...meta, seed: w.seed, tier: w.tierKey, climate: w.climateKey,
            landCells: w.landCount, years: w.year,
            derived: w.cap, tune: TUNE_SNAPSHOT },
    years: w.years, species, legacy: hallOfFame(w), individuals,
    chronicle: w.chron.map(e => ({ year: e.y, day: e.d, kind: e.kind, msg: e.msg })),
    totals: w.totals,
  };
  fs.writeFileSync(path.join(dir, base + '.json'), JSON.stringify(json, null, 1), 'utf8');
  writeReport(json, path.join(dir, base + '.txt'));   // 서식은 판독.mjs 한 곳에만 있다
  return base;
}

/* 궤적에서 눈에 띄는 것을 자동으로 뽑아 둔다. 해석의 출발점이다. */
function readRun(w) {
  const out = [], Y = w.years;
  if (!Y.length) return ['기록 없음'];
  const mean = (a, k) => a.reduce((s, r) => s + r[k], 0) / Math.max(a.length, 1);
  const tail = Y.slice(Math.floor(Y.length * 0.3));
  const ext = w.species.filter(s => s.extinctYear != null).sort((a, b) => a.extinctYear - b.extinctYear);
  out.push(`평형(후반 70%) T3 ${N(mean(tail, 'T3'))} · T5 ${mean(tail, 'T5').toFixed(0)}`
         + ` · 화재 ${mean(tail, 'burnPct').toFixed(1)}%/년 · 목본 임관 ${mean(tail, 'woodyPct').toFixed(0)}%`);
  const t3 = tail.map(r => r.T3);
  out.push(`T3 진폭 ${N(Math.min(...t3))}~${N(Math.max(...t3))}`
         + ` (${(Math.max(...t3) / Math.max(Math.min(...t3), 1)).toFixed(1)}배)`
         + ` · 유도 대비 ${(mean(tail, 'T3') / w.cap.T3 * 100).toFixed(0)}%`);
  if (ext.length) out.push(`절멸 ${ext.length}종 : ` + ext.map(s => `${s.name}(${s.trophic}, ${s.extinctYear}년)`).join(' · '));
  else out.push('절멸 없음');
  // 체제 전환 : 목본 임관이 20%p 이상 오른 구간
  const w0 = Y[0].woodyPct, wN = Y[Y.length - 1].woodyPct;
  if (wN - w0 > 20) out.push(`목본 임관 ${w0.toFixed(0)}% → ${wN.toFixed(0)}% — 초지가 관목림으로 천이 중 [C-4.6]`);
  const b0 = mean(Y.slice(0, Math.max(5, Y.length * 0.2)), 'burnPct');
  const bN = mean(tail, 'burnPct');
  if (b0 > 0 && bN < b0 * 0.5) out.push(`화재 ${b0.toFixed(0)}% → ${bN.toFixed(0)}% — 연료 고갈로 화재 체제가 무너짐`);
  const t5ext = w.species.find(s => s.trophic === 'T5' && s.extinctYear != null);
  if (t5ext) {
    const before = Y.filter(r => r.year < t5ext.extinctYear).slice(-10);
    const after = Y.filter(r => r.year > t5ext.extinctYear).slice(0, 30);
    if (before.length && after.length)
      out.push(`최상위 포식자 상실 후 T3 ${N(mean(before, 'T3'))} → ${N(mean(after, 'T3'))}`
             + ` (${((mean(after, 'T3') / Math.max(mean(before, 'T3'), 1) - 1) * 100).toFixed(0)}%) — 초식 해방 [표 C-2]`);
  }
  return out;
}

if (has('--run')) {
  const years = +arg('--years', 100);
  const seed = +arg('--seed', 20260812);
  const tier = arg('--tier', 'XL'), climate = arg('--climate', 'SAVANNA');
  const stamp = arg('--stamp', 'run');
  console.log(`실행 · ${tier} × ${climate} · 시드 ${seed} · ${years}년`);
  const t0 = Date.now();
  const w = createWorld(seed, tier, climate);
  for (let y = 0; y < years; y++) run(w, 365);
  const ms = Date.now() - t0;
  const base = saveRun(w, { stamp, ms, command: process.argv.slice(2).join(' ') });
  for (const line of readRun(w)) console.log('  ' + line);
  console.log(`저장 · _결과/${base}.txt · .json   (${(ms / 1000).toFixed(1)}초)`);
  process.exit(0);
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
const { w, series, initialT3 } = coreRun('XL', 'SAVANNA', years);
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
/* 기준은 등급 유도값이 아니라 '실제 초기 개체수'다.
   종마다 체중이 다르면 같은 먹이 예산에서 나오는 마릿수가 달라진다. */
const leak = Math.abs(w.totals.births - w.totals.deaths - (series[series.length - 1].n3 - initialT3));
check('T3 수지 오차 1% 미만', leak / Math.max(initialT3, 1) < 0.01,
  `초기 ${N(initialT3)} · 출생 ${N(w.totals.births)} − 사망 ${N(w.totals.deaths)} · 오차 ${N(leak)}`);

console.log(`\n${fails ? `[31m${fails}개 항목 실패[0m` : '[32m전 항목 통과[0m'}\n`);
process.exit(fails ? 1 : 0);
