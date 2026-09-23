// 떨어진 역을 선로로 잇기 테스트(src/sim/design.js connectStations, cheapestRoute)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkDesign, cheapestRoute, connectStations, isNextTo } from '../src/sim/design.js';
import { nameStations } from '../src/sim/station-names.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tables = JSON.parse(readFileSync(resolve(ROOT, 'src/content/rules.json'), 'utf8')).tables;

/** 모두 평지인 격자. special: {칸 번호: 지형} */
function flatGrid(cols, rows, special = {}) {
  const terrain = [];
  for (let r = 0; r < rows; r++) {
    terrain.push([]);
    for (let c = 0; c < cols; c++) terrain[r].push(special[r * cols + c] ?? 'flat');
  }
  return { cols, rows, terrain };
}

const isLine = (grid, path) => path.every((cell, i) => i === 0 || isNextTo(grid, path[i - 1], cell));
const noRepeat = (path) => new Set(path).size === path.length;

test('길 찾기: 붙은 칸으로만 잇고, 같은 칸을 두 번 지나지 않는다', () => {
  const grid = flatGrid(6, 6);
  const route = cheapestRoute(grid, 0, 35, tables);
  assert.equal(route[0], 0);
  assert.equal(route.at(-1), 35);
  assert.equal(route.length, 11); // 가로 5 + 세로 5 + 1
  assert.ok(isLine(grid, route));
  assert.ok(noRepeat(route));
});

test('길 찾기: 대각선 방향이면 계단처럼 곧은 선을 따라간다(ㄱ자로 꺾지 않는다)', () => {
  const grid = flatGrid(6, 6);
  const route = cheapestRoute(grid, 0, 35, tables);
  // 곧은 선(0,0)–(5,5)에서 한 칸 넘게 벗어나지 않는다.
  for (const cell of route) assert.ok(Math.abs((cell % 6) - Math.floor(cell / 6)) <= 1, `칸 ${cell}`);
});

test('길 찾기: 공사비가 비싼 바다와 산은 돌아간다', () => {
  // 가운데 줄에 바다가 두 칸(8, 9). 곧장 가면 9, 돌아가면 7이 든다.
  const grid = flatGrid(6, 3, { 8: 'sea', 9: 'sea' });
  const route = cheapestRoute(grid, 6, 11, tables);
  assert.ok(!route.includes(8) && !route.includes(9));
  assert.ok(isLine(grid, route));
});

test('길 찾기: 막힌 칸은 지나지 않고, 길이 없으면 null', () => {
  const grid = flatGrid(3, 3);
  assert.equal(cheapestRoute(grid, 0, 8, tables, new Set([1, 4, 7])), null);
  const route = cheapestRoute(grid, 0, 2, tables, new Set([1]));
  assert.ok(!route.includes(1));
});

test('역 잇기: 선이 없으면 처음 놓은 역에서 시작해 가까운 역부터 잇는다', () => {
  const grid = flatGrid(10, 1);
  // 놓은 차례: 0, 9, 4 → 0에서 시작해 가까운 4, 그다음 9
  const { path, missed } = connectStations(grid, { path: [], stations: [0, 9, 4] }, tables);
  assert.deepEqual(path, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(missed, []);
  assert.equal(checkDesign({ path, stations: [0, 9, 4] }).ok, true);
});

test('역 잇기: 가운데 역을 먼저 놓아도 양 끝으로 뻗는다', () => {
  const grid = flatGrid(9, 1);
  const { path } = connectStations(grid, { path: [], stations: [4, 0, 8] }, tables);
  assert.equal(path.length, 9);
  assert.deepEqual([path[0], path.at(-1)].sort((a, b) => a - b), [0, 8]);
  assert.ok(isLine(grid, path));
});

test('역 잇기: 그어 둔 선은 그대로 두고 가까운 끝에 붙인다', () => {
  const grid = flatGrid(10, 3);
  // 가운데 줄 3~6칸에 선이 있다. 떨어진 역: 오른쪽 끝(19)과 왼쪽 끝(10)
  const design = { path: [13, 14, 15, 16], stations: [13, 16, 19, 10] };
  const { path } = connectStations(grid, design, tables);
  assert.deepEqual(path.slice(3, 7), [13, 14, 15, 16], '원래 선이 그대로 있다');
  assert.equal(path[0], 10);
  assert.equal(path.at(-1), 19);
  assert.ok(isLine(grid, path));
  assert.ok(noRepeat(path));
});

test('역 잇기: 갈 수 없는 역은 남겨 두고 알려 준다', () => {
  const grid = flatGrid(3, 3);
  // 선이 가운데 역(4)을 둘러싸서 끝에서 갈 수 없다.
  const design = { path: [0, 1, 2, 5, 8, 7, 6, 3], stations: [0, 3, 4] };
  const { path, missed } = connectStations(grid, design, tables);
  // 끝(3)은 4 바로 옆이라 이어진다.
  assert.deepEqual(missed, []);
  assert.equal(path.at(-1), 4);
  const boxed = connectStations(flatGrid(5, 5), { path: [6, 7, 8, 13, 18, 17, 16, 11, 10], stations: [6, 10, 12] }, tables);
  // 12는 선에 둘러싸여 어느 끝에서도 갈 수 없다.
  assert.deepEqual(boxed.missed, [12]);
});

test('역 잇기: 늘 같은 결과', () => {
  const grid = flatGrid(12, 12, { 50: 'mountain', 51: 'mountain', 62: 'sea' });
  const design = { path: [], stations: [0, 143, 70, 11] };
  assert.deepEqual(connectStations(grid, design, tables), connectStations(grid, design, tables));
});

test('역 이름: 떨어진 역도 선 위 역 다음 차례로 이름을 받는다', () => {
  const named = nameStations({
    design: { path: [0, 1, 2], stations: [2, 9, 0] },
    cols: 10,
    existing: [],
    dongs: [],
    places: [],
    auto: false,
  });
  assert.deepEqual(
    named.map((e) => [e.cell, e.order]),
    [
      [0, 1],
      [2, 2],
      [9, 3],
    ],
  );
});
