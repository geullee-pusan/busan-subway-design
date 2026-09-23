// 새 노선을 넣고 견주는 계산 테스트(Phase 4)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NEW_LINE_ID, withDesign } from '../src/sim/design-world.js';
import { compareRuns } from '../src/sim/effect.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tables = JSON.parse(readFileSync(resolve(ROOT, 'src/content/rules.json'), 'utf8')).tables;

const grid = { cols: 10, rows: 10 };
const world = {
  stations: [{ id: 'A', line: '1', x: 2.5, y: 2.5, name: '가' }],
  links: [],
  transfers: [],
  lines: [{ id: '1', name: '1호선', dwellS: 20, headwayMin: 6 }],
  zones: [],
  centers: [],
};
// 2행에 가로로 그은 길: 칸 22, 23, 24, 25 (열 2~5, 행 2)
const design = { path: [22, 23, 24, 25], stations: [22, 25], kind: '경전철', trainsPerHour: 8 };

test('새 노선을 넣으면 역과 구간과 노선이 생긴다', () => {
  const next = withDesign(world, design, grid, tables);
  const newStations = next.stations.filter((s) => s.line === NEW_LINE_ID);
  assert.equal(newStations.length, 2);
  assert.deepEqual(
    newStations.map((s) => [s.x, s.y]),
    [
      [2.5, 2.5],
      [5.5, 2.5],
    ],
  );
  const newLinks = next.links.filter((l) => l.line === NEW_LINE_ID);
  assert.equal(newLinks.length, 1);
  assert.equal(newLinks[0].distanceM, 3000);
  const line = next.lines.find((l) => l.id === NEW_LINE_ID);
  assert.equal(line.headwayMin, 7.5);
  assert.equal(line.capacityPerTrain, tables.lineKinds['경전철'].capacityPerTrain);
});

test('같은 칸에 있는 기존 역과 갈아타는 역으로 묶인다', () => {
  const next = withDesign(world, design, grid, tables);
  const group = next.transfers.find((t) => t.stations.includes('A'));
  assert.ok(group, '갈아타는 묶음이 생겨야 해요');
  assert.ok(group.stations.some((id) => id.startsWith(`${NEW_LINE_ID}-`)));
});

test('역이 두 개보다 적으면 노선을 넣지 않는다', () => {
  const next = withDesign(world, { ...design, stations: [22] }, grid, tables);
  assert.equal(next, world);
});

test('빨라진 사람: 시간이 줄어든 만큼만 센다', () => {
  const before = { pairTime: new Float64Array([30, 20, Infinity]), pairPeople: new Float64Array([10, 10, 0]), totals: { board: 100 }, stations: [] };
  const after = {
    pairTime: new Float64Array([20, 20, 15]),
    pairPeople: new Float64Array([10, 10, 5]),
    totals: { board: 140 },
    stations: [{ id: `${NEW_LINE_ID}-1`, board: 20, alight: 20 }],
  };
  const effect = compareRuns(before, after);
  // 첫 짝: 10분 빨라짐 → 20명(왕복), 셋째 짝: 전에는 못 가던 길 → 10명
  assert.equal(effect.fasterPeople, 30);
  assert.equal(effect.savedMinutes, 200);
  assert.equal(effect.newlyReachable, 10);
  assert.equal(effect.newLineRiders, 40);
  assert.equal(Math.round(effect.averageSavedMin * 10) / 10, 6.7);
});
