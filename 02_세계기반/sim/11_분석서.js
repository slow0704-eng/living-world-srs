/* 섬 생태 시뮬레이터 — 분석서 서식 (결과 json -> 사람이 읽는 txt)
   소스는 이 모듈이고, 32_섬생태_시뮬레이터.html 은 `node 빌드.mjs` 산출물이다.

   서식은 여기 한 곳에만 있다. 세 경로가 전부 이것을 부른다.
     헤드리스 --run      저장하면서 (32_..._검증.mjs)
     판독.mjs            이미 있는 json 을 다시 읽을 때
     브라우저 [보고서]    돌리는 중에 내려받을 때

   절 구성
     설정 · 종 구성 · 연도별 표
     자동 판독      궤적에서 눈에 띄는 것
     사멸 추적      무엇이 죽었고 그때 무슨 일이 있었는가
     명예의 전당    종별 최장수 · 최다번식 · 최다사냥 · 최대무리와 그 생애
     개체 기록      추적 표본의 사인 분포
     사건 기록

   파일을 만지지 않는다(fs 없음). 그래야 브라우저에서도 같은 코드가 돈다. */

const rptN = n => Math.round(n).toLocaleString('en-US');
const rptPad = (v, w) => String(v).padStart(w);
const rptMean = (a, k) => a.reduce((s, r) => s + (typeof k === 'function' ? k(r) : r[k]), 0) / Math.max(a.length, 1);
const rptPct = (a, b) => (a / Math.max(b, 1e-9) * 100).toFixed(0) + '%';
const RPT_TIERS = ['T2', 'T3', 'T4', 'T5'];
const RPT_TIER_LAB = { T2: 'T2 소형초식', T3: 'T3 대형초식', T4: 'T4 소형육식', T5: 'T5 대형육식' };
const RPT_KIND_LAB = { fire:'화재', loss:'손실', gain:'회복', act:'개입', spec:'종' };
const RPT_SPEC_LAB = { seed:'정착', peak:'최대', boom:'폭증', crash:'급감',
                       trough:'최저', brink:'위기', recover:'회복', extinct:'절멸',
                       range:'확산', shrink:'위축', crowd:'밀집', aging:'고령',
                       young:'세대', predation:'피식', decline:'감소', rebound:'반등' };
/* 무리 병합은 죽음이 아니다. 옛 json 에는 fate 가 없으므로 이름으로도 거른다. */
const rptIsMerge = i => (i.fate === 'merge') || i.cause === '무리 흡수';

export function buildReport(j) {
  const L = [];
  const push = (...a) => L.push(a.join(''));
  const m = j.meta, Y = j.years || [];
  const tail = Y.slice(Math.floor(Y.length * 0.3));
  const head = Y.slice(0, Math.max(5, Math.floor(Y.length * 0.2)));

  push('='.repeat(78));
  push(` 시뮬레이션 실행 기록 · ${m.stamp}`);
  push('='.repeat(78));
  push(`설정   ${m.tier} · ${m.climate} · 시드 ${m.seed} · ${m.years}년 · 육지 ${rptN(m.landCells)}셀`
     + (m.source === 'browser' ? ' · 브라우저 개체판' : ''));
  push(`유도   [I-4] T2 ${rptN(m.derived.T2)} · T3 ${rptN(m.derived.T3)} · T4 ${rptN(m.derived.T4)} · T5 ${rptN(m.derived.T5)}`);
  push('');

  /* ── 종 구성 ─────────────────────────────────────────────────────── */
  push('─ 종 구성 ─────────────────────────────────────────────────────────────');
  push('  등급 종            체중kg  초기      최종   상태');
  for (const s of j.species)
    push(`  ${rptPad(s.trophic, 4)} ${s.name.padEnd(12)} ${rptPad(s.massKg, 6)} ${rptPad(rptN(s.seedN), 8)}`
       + ` ${rptPad(rptN(s.finalN), 9)}   ${s.extinctYear != null ? `절멸 ${s.extinctYear}년` : s.status}`);
  push('');

  /* ── 연도별 ──────────────────────────────────────────────────────── */
  const step = Math.max(1, Math.round(Y.length / 30));
  push(`─ 연도별 (${step}년 간격) ${'─'.repeat(Math.max(0, 50 - String(step).length))}`);
  push('    연차       T2       T3     T4    T5   초본천t 충전% 목본%  화재%  발화  종');
  for (let i = 0; i < Y.length; i += step) {
    const r = Y[i];
    push(`  ${rptPad(r.year, 6)} ${rptPad(rptN(r.T2), 8)} ${rptPad(rptN(r.T3), 8)} ${rptPad(r.T4, 6)} ${rptPad(r.T5, 5)}`
       + ` ${rptPad(rptN(r.grassKt), 9)} ${rptPad(r.grassFill != null ? r.grassFill.toFixed(0) : '-', 5)}`
       + ` ${rptPad(r.woodyPct.toFixed(0), 5)} ${rptPad(r.burnPct.toFixed(0), 6)}`
       + ` ${rptPad(r.fires, 5)} ${rptPad(r.species, 3)}`);
  }
  push('');

  /* ── 자동 판독 ───────────────────────────────────────────────────── */
  push('─ 자동 판독 ───────────────────────────────────────────────────────────');
  if (!Y.length) push('  기록 없음');
  else {
    const t3 = tail.map(r => r.T3);
    push(`  평형(후반 70%) T3 ${rptN(rptMean(tail, 'T3'))} · T5 ${rptMean(tail, 'T5').toFixed(0)}`
       + ` · 화재 ${rptMean(tail, 'burnPct').toFixed(1)}%/년 · 목본 임관 ${rptMean(tail, 'woodyPct').toFixed(0)}%`);
    push(`  T3 진폭 ${rptN(Math.min(...t3))}~${rptN(Math.max(...t3))}`
       + ` (${(Math.max(...t3) / Math.max(Math.min(...t3), 1)).toFixed(1)}배)`
       + ` · 유도 대비 ${rptPct(rptMean(tail, 'T3'), m.derived.T3)}`);
    push('  유도 대비 ' + RPT_TIERS.map(t => `${t} ${rptPct(rptMean(tail, t), m.derived[t])}`).join(' · ')
       + (Y[0].T1 != null && m.derived.T1
          ? ` · T1 ${rptPct(rptMean(tail, 'T1'), m.derived.T1)}(분해자 · 실측 순생산 기준이라 낮게 나온다)` : ''));
    const w0 = Y[0].woodyPct, wN = Y[Y.length - 1].woodyPct;
    push(wN - w0 > 20
      ? `  목본 임관 ${w0.toFixed(0)}% → ${wN.toFixed(0)}% — 초지가 관목림으로 천이 중 [C-4.6]`
      : `  목본 임관 ${w0.toFixed(0)}% → ${wN.toFixed(0)}% — 체제 전환 없음`);
    if (Y[0].grassFill != null)
      push(`  초본 충전율 ${rptMean(head, 'grassFill').toFixed(0)}% → ${rptMean(tail, 'grassFill').toFixed(0)}%`
         + ` — 부양력 대비 현존량. 낮으면 뜯기거나 탄 것이고, 부양력 자체가 준 것은 목본 쪽을 본다`);
    const b0 = rptMean(head, 'burnPct'), bN = rptMean(tail, 'burnPct');
    push(b0 > 0 && bN < b0 * 0.5
      ? `  화재 ${b0.toFixed(0)}% → ${bN.toFixed(0)}% — 연료 고갈로 화재 체제가 무너짐`
      : `  화재 초기 ${b0.toFixed(0)}% → 후반 ${bN.toFixed(0)}% — 화재 체제 유지`);
    if (j.totals) {
      const t = j.totals;
      push(`  누계 출생 ${rptN(t.births)} · 사망 ${rptN(t.deaths)} · 피식 ${rptN(t.kills)} (사망의 ${rptPct(t.kills, t.deaths)})`);
      push(`  누계 화재 ${rptN(t.fires)}건 · 소실 ${rptN(t.burned)}셀 (육지의 ${rptPct(t.burned / m.years, m.landCells)}/년)`);
    }
  }
  push('');

  /* ── 사멸 추적 ───────────────────────────────────────────────────── */
  push('─ 사멸 추적 ───────────────────────────────────────────────────────────');
  for (const line of traceDeaths(j)) push('  ' + line);
  push('');

  /* ── 종의 발자취 ─────────────────────────────────────────────────── */
  const trailed = j.species.filter(s => s.milestones && s.milestones.length);
  if (trailed.length) {
    push('─ 종의 발자취 ────────────────────────────────────────────────────────');
    push('  주요(폭증 · 급감 · 위기 · 회복 · 절멸)는 사건 기록에도 남는다.');
    push('');
    for (const s of trailed) {
      push(`  ${s.trophic} ${s.name} — 최대 ${rptN(s.peakN)}(${s.peakYear}년)`
         + ` · 최저 ${rptN(s.minN)}(${s.minYear}년) · 유도 배분 ${rptN(s.seedN)}`
         + (s.peakCells ? ` · 최대 서식 ${rptN(s.peakCells)}셀 · 최대 군집 ${rptN(s.peakClump)}` : ''));
      for (const e of s.milestones)
        push(`     ${rptPad(e.year, 5)}년 [${RPT_SPEC_LAB[e.kind] || e.kind}] ${e.msg}`);
      /* 해석 이전의 숫자. 사건이 왜 그 해에 났는지는 여기서 확인한다. */
      const Yr = s.yearly || [];
      /* T2 는 밀도장이라 개체 단위 집계가 없다. 0으로 채운 표를 내놓으면
         "아무 일도 없었다"로 읽히므로 아예 붙이지 않는다. */
      const detailed = Yr.some(r => r.born || r.died || r.eaten || r.cells);
      if (Yr.length && !detailed) push('      (밀도장이라 개체 단위 집계가 없다 — 개체수만 남는다)');
      if (Yr.length && detailed) {
        const st = Math.max(1, Math.round(Yr.length / 18));
        push('      연차   개체수    출생    사망    피식   서식셀 서식%  최대군집 평균나이');
        for (let k = 0; k < Yr.length; k += st) {
          const r = Yr[k];
          push(`     ${rptPad(r.year, 5)} ${rptPad(rptN(r.n), 8)} ${rptPad(rptN(r.born), 7)}`
             + ` ${rptPad(rptN(r.died), 7)} ${rptPad(rptN(r.eaten), 7)} ${rptPad(rptN(r.cells), 8)}`
             + ` ${rptPad(r.rangePct.toFixed(0), 4)} ${rptPad(rptN(r.maxClump), 8)} ${rptPad(r.meanAge.toFixed(1), 8)}`);
        }
      }
      push('');
    }
  }

  /* ── 명예의 전당 ─────────────────────────────────────────────────── */
  const hall = j.legacy || null;
  if (hall && hall.length) {
    push('─ 명예의 전당 ─────────────────────────────────────────────────────────');
    push('  판 전체의 추적 개체에서 종별 기록을 뽑았다.');
    push("  출생이 '시작전'인 개체는 처음부터 어른으로 놓인 것이다(나이를 흩어 놓는다).");
    push('');
    for (const g of hall) {
      push(`  ${g.trophic} ${g.name} — 추적 ${rptN(g.tracked)}마리`
         + ` (생존 ${rptN(g.alive)} · 사망 ${rptN(g.deaths)}${g.merges ? ` · 무리 흡수 ${rptN(g.merges)}` : ''})`
         + (g.meanLifeYr != null ? ` · 평균 수명 ${g.meanLifeYr}년 / 종 수명 ${g.lifespanYr}년` : ''));
      const cz = Object.entries(g.causes || {}).sort((a, b) => b[1] - a[1]);
      if (cz.length) push('     사인 ' + cz.map(([c, n]) => `${c} ${n}(${rptPct(n, g.deaths)})`).join(' · '));
      for (const r of g.records) {
        const i = r.ind;
        const born = i.bornYear < 0 ? `시작전 ${(-i.bornYear).toFixed(1)}년생` : `${i.bornYear}년생`;
        push(`     [${r.lab}] ${r.value}${r.unit} — ${i.name} (${i.sex === 'M' ? '수' : '암'}`
           + ` · ${born}${i.deathYear != null ? ` · ${i.deathYear}년 ${i.cause}` : ' · 생존'})`);
        for (const line of rptLifeLines(i)) push('       ' + line);
      }
      push('');
    }
  } else if (j.individuals && j.individuals.length) {
    push('─ 명예의 전당 (표본 기준) ──────────────────────────────────────────────');
    push('  이 json 에는 전체 기록(legacy)이 없어 추적 표본 안에서만 뽑았다.');
    push('  표본은 최근 개체 쪽으로 치우쳐 있으므로 판 전체의 기록이 아니다.');
    push('');
    for (const line of rptHallFromSample(j.individuals)) push('  ' + line);
    push('');
  }

  /* ── 개체 기록 ───────────────────────────────────────────────────── */
  if (j.individuals && j.individuals.length) {
    const I = j.individuals;
    push('─ 개체 기록 (표본) ────────────────────────────────────────────────────');
    const dead = I.filter(i => i.deathYear != null && !rptIsMerge(i));
    const merged = I.filter(rptIsMerge);
    push(`  표본 ${I.length}마리 · 사망 ${dead.length} · 무리 흡수 ${merged.length}`
       + ` · 생존 ${I.filter(i => i.deathYear == null).length}`);
    push('');
    push('  등급 종            표본   평균수명  최장    사냥  자손');
    const bySp = new Map();
    for (const i of I) { if (!bySp.has(i.sp)) bySp.set(i.sp, []); bySp.get(i.sp).push(i); }
    for (const [n, g] of bySp) {
      const gd = g.filter(i => i.deathYear != null && !rptIsMerge(i));
      const life = i => i.deathYear - i.bornYear;
      push(`  ${rptPad(g[0].trophic, 4)} ${n.padEnd(12)} ${rptPad(g.length, 5)}`
         + ` ${rptPad(gd.length ? rptMean(gd, life).toFixed(1) : '-', 8)}`
         + ` ${rptPad(gd.length ? Math.max(...gd.map(life)).toFixed(1) : '-', 6)}`
         + ` ${rptPad(rptMean(g, 'kills').toFixed(1), 7)} ${rptPad(rptMean(g, 'offspring').toFixed(1), 5)}`);
    }
    const causes = new Map();
    for (const i of dead) causes.set(i.cause, (causes.get(i.cause) || 0) + 1);
    if (causes.size) push('  사인   ' + [...causes.entries()].sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${n}(${rptPct(n, dead.length)})`).join(' · '));
    push('');
  }

  /* ── 사건 기록 ───────────────────────────────────────────────────── */
  const ch = j.chronicle || [];
  const kinds = new Map();
  for (const e of ch) kinds.set(e.kind, (kinds.get(e.kind) || 0) + 1);
  push('─ 사건 기록 (최근 40) ─────────────────────────────────────────────────');
  if (kinds.size) push('  집계   ' + [...kinds.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${RPT_KIND_LAB[k] || k} ${n}건`).join(' · '));
  for (const e of ch.slice(-40))
    push(`  ${rptPad(e.year, 5)}년 [${RPT_KIND_LAB[e.kind] || e.kind}] ${e.msg}`);
  push('='.repeat(78));
  return L;
}

/* 생애를 몇 줄로 줄인다.
   같은 사건이 이어지면 한 줄로 묶고(×rptN), 자리가 모자라면 이동부터 버린다.
   탄생과 죽음, 사냥과 번식은 어떤 경우에도 남긴다 — 그게 이야기다. */
function rptLifeLines(i, keep = 7) {
  const K = { birth: '탄생', death: '사망', hunt: '사냥', breed: '번식', move: '이동', fire: '화재' };
  const ev = [];
  for (const e of (i.events || [])) {
    const last = ev[ev.length - 1];
    if (last && last[1] === e[1] && last[2] === e[2]) { last.n++; last[0] = e[0]; }
    else ev.push(Object.assign([e[0], e[1], e[2]], { n: 1 }));
  }
  let pick = ev;
  if (ev.length > keep) {
    const core = ev.filter(e => e[1] !== 'move');
    const rest = ev.filter(e => e[1] === 'move');
    const room = Math.max(0, keep - Math.min(core.length, keep));
    pick = core.slice(0, keep).concat(rest.slice(0, room)).sort((a, b) => a[0] - b[0]);
    const cut = ev.length - pick.length;
    if (cut > 0) pick = pick.slice(0, 2).concat([[null, null, `… ${cut}종류 생략`]]).concat(pick.slice(2));
  }
  const out = pick.map(e => e[0] == null ? `      ${e[2]}`
    : `${rptPad(e[0].toFixed(1), 6)}년 ${(K[e[1]] || e[1]).padEnd(2)} ${e[2]}${e.n > 1 ? ` ×${e.n}` : ''}`);
  const tag = [];
  if (i.kills > 0) tag.push(`사냥 ${rptN(i.kills)}마리`);
  if (i.offspring > 0) tag.push(`자손 ${i.offspring}`);
  if (i.peakHerd > 0) tag.push(`최대 무리 ${rptN(i.peakHerd)}`);
  if (tag.length) out.push('      ' + tag.join(' · '));
  /* 계보 — 누구의 자식이고 누구와 짝을 이뤘고 누구와 함께 났는가.
     형제는 저장하지 않고 부모의 자식 목록에서 자기를 뺀 것으로 센다. */
  const k = i.kin;
  if (k) {
    const kin = [];
    if (k.parents && k.parents.length) kin.push(`부모 ${k.parents.join(' · ')}`);
    if (k.mates && k.mates.length) kin.push(`배우자 ${k.mates.join(' · ')}`);
    if (k.siblings && (k.siblings.full || k.siblings.half))
      kin.push(`형제 ${k.siblings.full + k.siblings.half}`
        + (k.siblings.half ? `(반 ${k.siblings.half})` : '')
        + (k.siblings.names.length ? ` — ${k.siblings.names.join(' · ')}` : ''));
    if (k.children && k.children.length) kin.push(`자식 ${k.children.join(' · ')}`);
    for (const line of kin) out.push('      ' + line);
  }
  return out;
}

/* legacy 가 없는 옛 json 용. 표본 안에서만 최고 기록을 뽑는다. */
function rptHallFromSample(I) {
  const out = [], bySp = new Map();
  for (const i of I) { if (!bySp.has(i.sp)) bySp.set(i.sp, []); bySp.get(i.sp).push(i); }
  for (const [n, g] of bySp) {
    const alive = i => (i.deathYear == null ? null : i.deathYear - i.bornYear);
    const best = (f) => g.slice().sort((a, b) => (f(b) ?? -1) - (f(a) ?? -1))[0];
    const oldest = best(i => alive(i) ?? -1), breeder = best(i => i.offspring), hunter = best(i => i.kills);
    const line = [];
    if (oldest && alive(oldest) != null) line.push(`최장수 ${oldest.name} ${alive(oldest).toFixed(1)}년(${oldest.cause})`);
    if (breeder && breeder.offspring > 0) line.push(`최다번식 ${breeder.name} ${breeder.offspring}마리`);
    if (hunter && hunter.kills > 0) line.push(`최다사냥 ${hunter.name} ${rptN(hunter.kills)}마리`);
    out.push(`${g[0].trophic} ${n} — ` + (line.length ? line.join(' · ') : '기록 없음'));
  }
  return out;
}

/* ── 무엇이 죽었고, 그때 무슨 일이 있었는가 ──────────────────────────────
   절멸한 종은 절멸 직전 창의 환경을 함께 보여 준다. 절멸이 없더라도
   개체군이 꺾인 구간과 유도 부양력에 한참 못 미치는 등급은 추적한다. */
export function traceDeaths(j) {
  const out = [], Y = j.years || [], m = j.meta;
  if (!Y.length) return ['기록 없음'];
  const at = y => Y.find(r => r.year === y) || Y[Y.length - 1];
  const win = (a, b) => Y.filter(r => r.year >= a && r.year <= b);
  const env = r => `초본 ${rptN(r.grassKt)}천t · 목본 ${r.woodyPct.toFixed(0)}% · 화재 ${r.burnPct.toFixed(0)}%`
                 + ` · T3 ${rptN(r.T3)} · T4 ${r.T4} · T5 ${r.T5}`;

  /* 1. 절멸 종 */
  const ext = j.species.filter(s => s.extinctYear != null).sort((a, b) => a.extinctYear - b.extinctYear);
  if (!ext.length) out.push(`절멸 없음 — ${m.years}년 내내 ${Y[Y.length - 1].species}종 유지`);
  for (const s of ext) {
    const y = s.extinctYear;
    out.push(`절멸 · ${s.name} (${s.trophic}, ${y}년, 초기 ${rptN(s.seedN)}마리, 수명 ${s.lifespanYr}년)`);
    const before = win(Math.max(0, y - 12), y);
    if (before.length >= 2) {
      const a = before[0], b = before[before.length - 1];
      out.push(`   ${a.year}년 ${env(a)}`);
      out.push(`   ${b.year}년 ${env(b)}`);
      const dTier = (b[s.trophic] - a[s.trophic]) / Math.max(a[s.trophic], 1) * 100;
      out.push(`   같은 등급 총량 ${dTier >= 0 ? '+' : ''}${dTier.toFixed(0)}% · 목본 ${(b.woodyPct - a.woodyPct).toFixed(0)}%p`
             + ` · 화재 ${(b.burnPct - a.burnPct).toFixed(0)}%p`);
    }
    const near = (j.chronicle || []).filter(e => e.year >= y - 3 && e.year <= y && e.kind !== 'fire');
    for (const e of near.slice(-4)) out.push(`   ${e.year}년 [${e.kind}] ${e.msg}`);
    /* 마지막 한 마리 : 그 종의 개체 기록 중 가장 늦게 죽은 것 */
    const last = (j.individuals || []).filter(i => i.sp === s.name && i.deathYear != null)
      .sort((a, b) => b.deathYear - a.deathYear)[0];
    if (last) out.push(`   마지막 기록 개체 ${last.name} — ${last.deathYear}년 ${last.cause}`);
  }

  /* 2. 급감 구간 : 연 대비 25% 이상 꺾인 해 */
  const drops = [];
  for (const t of RPT_TIERS) {
    for (let i = 1; i < Y.length; i++) {
      const p = Y[i - 1][t], c = Y[i][t];
      if (p >= 20 && c < p * 0.75) drops.push({ t, year: Y[i].year, from: p, to: c, r: c / p, row: Y[i] });
    }
  }
  drops.sort((a, b) => a.r - b.r);
  if (drops.length) {
    out.push(`급감 ${drops.length}건 (연 대비 −25% 이상) — 큰 것부터 ${Math.min(4, drops.length)}건`);
    for (const d of drops.slice(0, 4)) {
      out.push(`   ${d.year}년 ${RPT_TIER_LAB[d.t]} ${rptN(d.from)} → ${rptN(d.to)} (−${(100 - d.r * 100).toFixed(0)}%)`);
      out.push(`      ${env(d.row)} · 발화 ${d.row.fires}건`);
    }
  } else out.push('급감 없음 (연 대비 −25% 이상인 해가 없다)');

  /* 3. 유도 부양력에 못 미치는 등급 — 왜 안 늘었는가 */
  const tail = Y.slice(Math.floor(Y.length * 0.3));
  for (const t of RPT_TIERS) {
    const v = rptMean(tail, t), cap = m.derived[t];
    if (!(v < cap * 0.6)) continue;
    out.push(`미달 · ${RPT_TIER_LAB[t]} 후반 평형 ${rptN(v)} / 유도 ${rptN(cap)} (${rptPct(v, cap)})`);
    const causes = rptDeathCauseMix(j, t);
    if (causes.length) out.push('   표본 사인 ' + causes.map(([c, n, p]) => `${c} ${n}(${p})`).join(' · '));
    if (t === 'T4') {
      const t5 = rptMean(tail, 'T5');
      out.push(`   같은 기간 T5 ${rptN(t5)} (유도 대비 ${rptPct(t5, m.derived.T5)})`
             + ` — 길드내 포식(intraguildP ${m.tune?.intraguildP ?? '?'})과 먹이 경쟁을 함께 본다`);
    }
    if (t === 'T3') {
      out.push(`   초본 ${rptN(rptMean(tail, 'grassKt'))}천t · 목본 ${rptMean(tail, 'woodyPct').toFixed(0)}%`
             + ` — 목본 침입이 초지를 깎으면 먹이 쪽이 먼저 걸린다 [C-4.6]`);
    }
  }

  /* 4. 표본 전체 사인 */
  const mix = rptDeathCauseMix(j);
  if (mix.length) out.push('표본 사인 전체 · ' + mix.map(([c, n, p]) => `${c} ${n}(${p})`).join(' · '));
  return out;
}

/* 사인 분포. tier 를 주면 그 등급만 본다. 무리 흡수는 제외한다. */
function rptDeathCauseMix(j, tier) {
  const I = (j.individuals || []).filter(i => i.deathYear != null && !rptIsMerge(i)
    && (!tier || i.trophic === tier));
  if (!I.length) return [];
  const c = new Map();
  for (const i of I) c.set(i.cause, (c.get(i.cause) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n, rptPct(n, I.length)]);
}
