// npm run calibrate: 기존 노선망으로 모델을 돌려 실제 승하차 자료와 맞춘다(docs/SPEC.md 5.6).
//
// 조정 손잡이는 네 개다: 하루 이동 횟수, 거리에 따라 줄어드는 정도, 탑승 규칙 기울기, 중심지 크기 배율.
// 순위(스피어만, 상위 역 맞히기)는 하루 이동 횟수와 상관이 없다. 그래서 먼저 나머지 셋을 고르고,
// 마지막에 하루 이동 횟수로 총이용객을 맞춘다.
// 결과는 src/content/rules.json의 값과 docs/calibration.md에 쓴다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareToReal, meetsTargets } from '../src/sim/compare.js';
import { prepareWorld, runDay } from '../src/sim/run.js';
import { buildWorld, rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const grid = readJson('data/build/grid.json');
const stations = readJson('data/build/stations.json').stations;
const lines = readJson('data/build/lines.json').lines;
const links = readJson('data/build/links.json').links;
const transfers = readJson('data/build/transfers.json').transfers;
const ridership = readJson('data/build/ridership.json');
const dongs = readJson('data/build/dongs.json').dongs;
const placesFile = readJson('src/content/places.json');
const rulesFile = readJson('src/content/rules.json');

const rules = rulesFromCards(rulesFile.rules);
const world = buildWorld({
  grid,
  stations,
  lines,
  links,
  transfers,
  places: placesFile.places,
  dongs,
  hourShape: ridership.shape['평일'],
  defaultHeadwayMin: rules.defaultHeadwayMin,
});
const names = Object.fromEntries(stations.map((s) => [s.id, `${s.name}(${s.line})`]));
const real = {};
for (const [id, station] of Object.entries(ridership.stations)) {
  const day = station['평일'];
  if (day) real[id] = day.board + day.alight;
}

const prepared = prepareWorld(world, rules);
const evaluate = (params) => {
  const merged = { ...rules, ...params };
  const result = runDay(world, prepared, merged);
  return { result, comparison: compareToReal(result.stations, real, transfers, names), rules: merged };
};

// 1. 순위를 가장 잘 맞히는 조합 찾기 (하루 이동 횟수는 1로 두고 본다)
const decayOptions = [1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const slopeOptions = [0.02, 0.03, 0.045, 0.06, 0.08, 0.1];
const powerOptions = [0.2, 0.4, 0.6, 0.8, 1, 1.3, 1.6];
// 하루 이동 횟수가 이 범위를 벗어나면 고르지 않는다. 한 사람이 중심지로 하루에 몇 번 오가는지가
// 말이 되어야 규칙 카드도 말이 된다(왕복 한 번을 1로 센다).
const TRIPS_RANGE = [0.5, 2];
// 점수가 이만큼 안에 들면 "비슷하게 잘 맞는다"고 본다. 그 안에서는 규칙이 아이에게 잘 보이는 쪽을 고른다.
const SCORE_TOLERANCE = 0.03;
// SPEC 9.1절의 규칙 카드("10분 빠르면 10명 중 4명이 타요")가 되는 기울기.
const SPEC_SLOPE = 0.035;
const started = Date.now();
const candidates = [];
let runs = 0;
for (const decayKm of decayOptions) {
  for (const boardSlope of slopeOptions) {
    for (const centerPower of powerOptions) {
      const { comparison } = evaluate({ decayKm, boardSlope, centerPower, tripsPerDay: 1 });
      runs++;
      const impliedTrips = comparison.totals.real / comparison.totals.model;
      const score = (comparison.spearman ?? 0) + comparison.topMatch.matched * 0.02;
      candidates.push({ score, decayKm, boardSlope, centerPower, comparison, impliedTrips });
    }
  }
}
const inRange = candidates.filter((c) => c.impliedTrips >= TRIPS_RANGE[0] && c.impliedTrips <= TRIPS_RANGE[1]);
const pool = inRange.length > 0 ? inRange : candidates;
if (inRange.length === 0) console.log(`하루 이동 횟수가 ${TRIPS_RANGE[0]}~${TRIPS_RANGE[1]}번인 조합이 없어서, 모든 조합에서 고릅니다.`);
const topScore = Math.max(...pool.map((c) => c.score));
const near = pool.filter((c) => c.score >= topScore - SCORE_TOLERANCE);
// 사람이 하루에 중심지로 나가는 횟수. 왕복 한 번을 1로 세면 1.2번쯤이 그럴듯하다.
const PLAUSIBLE_TRIPS = 1.2;
near.sort(
  (a, b) =>
    Math.abs(a.impliedTrips - PLAUSIBLE_TRIPS) - Math.abs(b.impliedTrips - PLAUSIBLE_TRIPS) ||
    Math.abs(a.boardSlope - SPEC_SLOPE) - Math.abs(b.boardSlope - SPEC_SLOPE) ||
    b.score - a.score,
);
const best = near[0];
console.log(
  `비슷하게 잘 맞는 조합 ${near.length}개 가운데, 하루 이동 횟수가 가장 그럴듯한 것을 골랐어요. 가장 높은 점수와의 차이는 ${(topScore - best.score).toFixed(3)}이에요.`,
);
console.log(`${runs}번 돌려 봤어요. ${((Date.now() - started) / 1000).toFixed(1)}초 걸렸어요.`);

// 2. 하루 이동 횟수로 총이용객 맞추기
const unit = best.comparison.totals;
let tripsPerDay = Math.round((unit.real / unit.model) * 1000) / 1000;
let final = evaluate({ decayKm: best.decayKm, boardSlope: best.boardSlope, centerPower: best.centerPower, tripsPerDay });
// 아주 작은 이동을 빼는 규칙 때문에 완전히 비례하지는 않는다. 한 번 더 맞춘다.
tripsPerDay = Math.round(tripsPerDay * (final.comparison.totals.real / final.comparison.totals.model) * 1000) / 1000;
final = evaluate({ decayKm: best.decayKm, boardSlope: best.boardSlope, centerPower: best.centerPower, tripsPerDay });

const { comparison } = final;
const targets = meetsTargets(comparison);
const knobs = { tripsPerDay, decayKm: best.decayKm, boardSlope: best.boardSlope, centerPower: best.centerPower };

console.log('\n조정 손잡이:', knobs);
console.log(
  `총이용객: 우리 계산 ${Math.round(comparison.totals.model).toLocaleString()}명, 진짜 ${Math.round(comparison.totals.real).toLocaleString()}명 (${comparison.totals.diffPercent.toFixed(1)}%)`,
);
console.log(`순위 상관(스피어만): ${comparison.spearman.toFixed(3)}`);
console.log(`진짜 상위 10개 역 가운데 우리 계산 상위 15위 안: ${comparison.topMatch.matched}개`);
console.log('목표 달성:', targets);

// 3. 규칙 파일에 값 쓰기
if (!process.argv.includes('--dry')) {
  for (const rule of rulesFile.rules) {
    if (knobs[rule.id] !== undefined) rule.value = knobs[rule.id];
  }
  writeFileSync(resolve(ROOT, 'src/content/rules.json'), JSON.stringify(rulesFile, null, 2) + '\n');
  console.log('\nsrc/content/rules.json에 값을 썼어요.');
}

// 4. 보고서 쓰기
const worst = [...comparison.pairs]
  .map((p) => ({ ...p, diff: p.model - p.real, ratio: p.real > 0 ? p.model / p.real : null }))
  .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  .slice(0, 10);
const top10 = comparison.pairs.slice(0, 10);
const number = (value) => Math.round(value).toLocaleString('ko-KR');

const report = `# 현실 확인(보정) 보고서

기존 노선망으로 모델을 돌려 실제 승하차 자료와 견준 결과다. \`npm run calibrate\`로 다시 만든다.

- 견준 자료: 부산교통공사 시간대별 승하차인원 2025년 평일 하루 평균(공공데이터포털 3057229), 김해시 경전철 승하차 2025년(15105181)
- 견준 대상: 실제 자료가 있는 역 ${comparison.pairs.length}개. 게이트를 함께 쓰는 역(수영, 미남)은 모델 값도 합쳐서 견줬다.
- 모델 코드: \`src/sim/\`, 규칙 값: \`src/content/rules.json\`, 중심지: \`src/content/places.json\`

## 조정 손잡이 (네 개)

| 손잡이 | 값 | 뜻 |
|---|---|---|
| 하루 이동 횟수 | ${knobs.tripsPerDay} | 한 사람이 하루에 중심지로 나가는 횟수(왕복 한 번을 1로 센다) |
| 거리에 따라 줄어드는 정도 | ${knobs.decayKm}km | 이 거리를 갈 때마다 가고 싶은 마음이 약 2.7분의 1로 줄어든다 |
| 탑승 규칙 기울기 | ${knobs.boardSlope} | 도시철도가 1분 빠를 때마다 타는 사람이 이만큼 늘어난다 |
| 중심지 크기 배율 | ${knobs.centerPower} | 중심지 크기를 이 횟수만큼 곱해 가중치로 쓴다 |

## 목표 대비 결과

| 목표(SPEC 5.6) | 결과 | 달성 |
|---|---|---|
| 실제 하루 총이용객과 ±15% 안 | 우리 계산 ${number(comparison.totals.model)}명, 진짜 ${number(comparison.totals.real)}명 (${comparison.totals.diffPercent.toFixed(1)}%) | ${targets.total ? '예' : '아니오'} |
| 역별 순위 상관(스피어만) 0.6 이상 | ${comparison.spearman.toFixed(3)} | ${targets.spearman ? '예' : '아니오'} |
| 실제 상위 10개 역 중 6개 이상이 모델 상위 15위 안 | ${comparison.topMatch.matched}개 | ${targets.topMatch ? '예' : '아니오'} |

## 실제 상위 10개 역

| 역 | 진짜(하루) | 우리 계산 | 우리 계산 ÷ 진짜 |
|---|---|---|---|
${top10.map((p) => `| ${p.name} | ${number(p.real)} | ${number(p.model)} | ${(p.model / p.real).toFixed(2)} |`).join('\n')}

## 가장 크게 틀린 역 10개

| 역 | 진짜(하루) | 우리 계산 | 차이 |
|---|---|---|---|
${worst.map((p) => `| ${p.name} | ${number(p.real)} | ${number(p.model)} | ${p.diff > 0 ? '+' : ''}${number(p.diff)} |`).join('\n')}

## 왜 다를까 (생각해 본 까닭)

- 모델은 집에서 중심지로 가는 이동만 만든다. 학교, 병원, 친구 집처럼 중심지가 아닌 곳으로 가는 이동은 빠져 있다.
- 중심지 목록과 크기는 우리가 정한 값이다(\`src/content/places.json\`). 실제 일자리 수 자료로 바꾸면 더 잘 맞을 수 있다.
- 환승만 하고 나가지 않는 사람은 승하차에 안 잡히지만, 모델은 타는 역과 내리는 역만 센다.
- 버스 시간은 곧은 거리로 어림한다. 실제 버스 노선과 정체는 넣지 않았다.
- 부산 밖(양산, 김해)에서 들어오는 사람은 인구가 있는 칸에서만 만든다. 지도 밖에서 오는 사람은 빠져 있다.
`;

writeFileSync(resolve(ROOT, 'docs/calibration.md'), report);
console.log('docs/calibration.md에 보고서를 썼어요.');
