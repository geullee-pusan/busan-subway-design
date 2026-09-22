import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cellColRow, cellDistanceM, cellIndex, flattenRows, inGrid, neighbors4 } from '../src/sim/grid.js';

const GRID_JSON = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'build', 'grid.json');
const small = { cols: 4, rows: 3 };

test('칸 번호와 (열, 행)이 서로 바뀐다', () => {
  for (let i = 0; i < small.cols * small.rows; i++) {
    const [c, r] = cellColRow(small, i);
    assert.equal(cellIndex(small, c, r), i);
  }
  assert.deepEqual(cellColRow(small, 5), [1, 1]);
});

test('격자 밖은 이웃에서 빠진다', () => {
  assert.deepEqual(neighbors4(small, 0), [1, 4]); // 북서쪽 모서리: 오른쪽, 아래
  assert.deepEqual(neighbors4(small, 5), [1, 6, 9, 4]); // 가운데: 위, 오른쪽, 아래, 왼쪽
  assert.equal(inGrid(small, 4, 0), false);
  assert.equal(inGrid(small, 0, -1), false);
  assert.equal(inGrid(small, 1.5, 0), false);
});

test('칸 사이 거리: 오른쪽으로 3칸, 아래로 4칸이면 5km', () => {
  const grid = { cols: 10, rows: 10 };
  assert.equal(cellDistanceM(grid, cellIndex(grid, 0, 0), cellIndex(grid, 3, 4)), 5000);
});

test('결정론: 같은 입력을 두 번 넣으면 결과가 완전히 같다', () => {
  const run = () => JSON.stringify(Array.from({ length: 12 }, (_, i) => [cellColRow(small, i), neighbors4(small, i)]));
  assert.equal(run(), run());
});

test('data/build/grid.json 배열이 격자 크기와 맞다', { skip: !existsSync(GRID_JSON) && 'npm run data를 먼저 돌려요' }, () => {
  const grid = JSON.parse(readFileSync(GRID_JSON, 'utf8'));
  for (const key of ['terrain', 'population', 'populationBusan', 'elevationM', 'slopeDeg', 'district']) {
    assert.equal(flattenRows(grid[key]).length, grid.cols * grid.rows, key);
  }
});
