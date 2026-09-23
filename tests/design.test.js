// 설계 계산 테스트(docs/SPEC.md 5.2, 6장)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { busFleet, checkDesign, designCost, extendPath, headway, isNextTo, stationGaps } from '../src/sim/design.js';
import { rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rulesFile = JSON.parse(readFileSync(resolve(ROOT, 'src/content/rules.json'), 'utf8'));
const rules = rulesFromCards(rulesFile.rules);
const tables = rulesFile.tables;

// 4 × 2칸 작은 격자: 평지, 언덕, 산, 바다 / 들판, 강, 평지, 평지
const grid = {
  cols: 4,
  rows: 2,
  terrain: [
    ['flat', 'hill', 'mountain', 'sea'],
    ['field', 'river', 'flat', 'flat'],
  ],
};

test('선은 위·아래·왼쪽·오른쪽으로만 잇는다', () => {
  assert.equal(isNextTo(grid, 0, 1), true); // 오른쪽
  assert.equal(isNextTo(grid, 0, 4), true); // 아래
  assert.equal(isNextTo(grid, 0, 5), false); // 대각선은 안 된다
  assert.deepEqual(extendPath(grid, [], 0), [0]);
  assert.deepEqual(extendPath(grid, [0], 1), [0, 1]);
  assert.deepEqual(extendPath(grid, [0, 1], 3), [0, 1]); // 붙어 있지 않으면 그대로
});

test('바로 앞 칸을 다시 누르면 한 칸 지운다. 같은 칸은 두 번 지나지 않는다', () => {
  assert.deepEqual(extendPath(grid, [0, 1, 2], 1), [0, 1]);
  assert.deepEqual(extendPath(grid, [0, 1, 2], 0), [0, 1, 2]);
});

test('공사비: 지형 계수를 두 칸 평균으로 쓴다', () => {
  const design = { path: [0, 1], stations: [], kind: '경전철', trainsPerHour: 8 };
  const cost = designCost(design, grid, rules, tables);
  // 평지(1.0)와 언덕(1.2)의 평균 1.1
  assert.equal(cost.segments[0].factor, 1.1);
  assert.equal(Math.round(cost.lineCost), Math.round(rules.costPerKm100M * 1.1));
  assert.equal(cost.stationCost, 0);
  assert.equal(cost.lengthKm, 1);
});

test('공사비: 역은 값이 정해져 있고, 이미 역이 있는 칸이면 두 배다', () => {
  const design = { path: [0, 1], stations: [0, 1], kind: '경전철', trainsPerHour: 8 };
  const cost = designCost(design, grid, rules, tables, new Set([1]));
  assert.equal(cost.stations[0].transfer, false);
  assert.equal(cost.stations[1].transfer, true);
  assert.equal(cost.stationCost, rules.costPerStation100M * 3);
});

test('공사비: 지하철은 경전철보다 비싸다', () => {
  const design = { path: [0, 1], stations: [0], kind: '지하철', trainsPerHour: 8 };
  const light = designCost({ ...design, kind: '경전철' }, grid, rules, tables);
  const heavy = designCost(design, grid, rules, tables);
  assert.ok(heavy.total > light.total);
  assert.equal(Math.round(heavy.total * 100) / 100, Math.round(light.total * tables.lineKinds['지하철'].costFactor * 100) / 100);
});

test('바다는 세 배, 들판은 0.6배', () => {
  const sea = designCost({ path: [3, 7], stations: [], kind: '경전철' }, grid, rules, tables);
  const field = designCost({ path: [4, 5], stations: [], kind: '경전철' }, grid, rules, tables);
  assert.equal(sea.segments[0].factor, (3 + 1) / 2);
  assert.equal(field.segments[0].factor, (0.6 + 1.3) / 2);
});

test('역 사이 거리와 시간', () => {
  const design = { path: [0, 1, 2], stations: [0, 2], kind: '경전철', trainsPerHour: 8 };
  const gaps = stationGaps(design, grid, tables);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].meters, 2000);
  assert.equal(gaps[0].seconds, Math.round((2 / tables.lineKinds['경전철'].speedKmh) * 3600));
});

test('배차 간격: 60분 ÷ 8대 = 7분 30초', () => {
  assert.deepEqual(headway(8), { minutes: 7, seconds: 30, totalMinutes: 7.5, trainsPerHour: 8 });
  assert.deepEqual(headway(6), { minutes: 10, seconds: 0, totalMinutes: 10, trainsPerHour: 6 });
  assert.equal(headway(12).minutes, 5);
});

test('설계 검사: 선과 역이 모자라면 알려 준다', () => {
  assert.equal(checkDesign({ path: [], stations: [] }).ok, false);
  assert.equal(checkDesign({ path: [0, 1], stations: [0, 1] }).ok, true);
  assert.deepEqual(checkDesign({ path: [0, 1], stations: [0, 3] }).problems, ['선로로 잇지 않은 역이 있어요. 역 잇기를 눌러요.']);
});

test('결정론: 같은 설계는 늘 같은 공사비', () => {
  const design = { path: [0, 1, 2], stations: [0, 2], kind: '지하철', trainsPerHour: 10 };
  const run = () => JSON.stringify(designCost(design, grid, rules, tables, new Set([2])));
  assert.equal(run(), run());
});

test('버스 노선: 선·정류장 공사비는 없고 버스 대수 × 한 대 값이 든다', () => {
  const kind = tables.lineKinds['버스'];
  assert.equal(kind.capacityPerTrain, 49);
  assert.equal(kind.costFactor, 0);
  // 3칸(3km) 노선, 시속 17km → 한 바퀴(6km) 약 21분 11초. 한 시간 6대(10분마다) → 3대
  const design = { path: [0, 1, 2, 3], stations: [0, 3], kind: '버스', trainsPerHour: 6 };
  const fleet = busFleet(design, tables, rules);
  assert.equal(fleet.buses, 3);
  const cost = designCost(design, grid, rules, tables);
  assert.equal(cost.lineCost, 0);
  assert.equal(cost.stationCost, 0);
  assert.equal(cost.vehicleCost, 3 * rules.busPrice100M);
  assert.equal(cost.total, cost.vehicleCost);
  // 자주 오게 하면 버스가 더 든다.
  assert.ok(busFleet({ ...design, trainsPerHour: 12 }, tables, rules).buses > fleet.buses);
  // 지하철은 버스 값이 없다.
  assert.equal(designCost({ ...design, kind: '지하철' }, grid, rules, tables).vehicleCost, 0);
});
