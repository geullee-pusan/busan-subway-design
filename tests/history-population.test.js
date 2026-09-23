// 옛날 부산 인구(인구총조사를 지금 구·군 칸에 반영) 테스트
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { censusByCurrentDistrict, districtPopulationAt, populationRowsAt } from '../src/sim/history-population.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

test('그때 구를 지금 구로: 1995년 비율로 나누고 합은 그대로다', () => {
  const census = {
    1985: { 동래구: 900, 중구: 100 },
    1995: { 동래구: 300, 금정구: 200, 연제구: 100, 중구: 80 },
  };
  const groups = { 1985: { 동래구: ['동래구', '금정구', '연제구'] } };
  const out = censusByCurrentDistrict(census, groups, '1995');
  assert.deepEqual(out['1985'], { 동래구: 450, 금정구: 300, 연제구: 150, 중구: 100 });
  assert.deepEqual(out['1995'], census['1995']);
});

test('조사 사이의 해는 곧게 잇고, 없는 구는 처음 나온 해의 값을 쓴다', () => {
  const anchors = [
    { year: 1990, values: { 가: 100 } },
    { year: 1995, values: { 가: 200, 나: 50 } },
    { year: 2000, values: { 가: 300, 나: 70 } },
  ];
  assert.deepEqual(districtPopulationAt(1993, anchors), { 가: 160, 나: 50 });
  assert.deepEqual(districtPopulationAt(1980, anchors), { 가: 100, 나: 50 });
  assert.deepEqual(districtPopulationAt(2010, anchors), { 가: 300, 나: 70 });
  assert.equal(districtPopulationAt(1997.5, anchors).나, 60);
});

test('칸 인구: 부산 칸은 구마다 비율을 곱하고, 부산이 아닌 칸은 그대로다', () => {
  const grid = {
    rows: 1,
    cols: 3,
    population: [[100, 300, 50]],
    district: [[0, 1, 2]],
    districts: [
      { id: 0, name: '부산광역시 중구' },
      { id: 1, name: '부산광역시 동래구' },
      { id: 2, name: '경상남도 양산시' },
    ],
  };
  const table = { nowYear: 2026, census: { 1985: { 중구: 200, 동래구: 150 } } };
  const at = populationRowsAt(grid, 1985, table);
  assert.deepEqual(at.population, [[200, 150, 50]]);
  assert.equal(at.factors.중구, 2);
  assert.equal(at.factors.동래구, 0.5);
  // 지금 해면 그대로
  assert.deepEqual(populationRowsAt(grid, 2026, table).population, grid.population);
});

test('실제 자료: 1985년 부산 칸을 더하면 총조사 부산 인구와 거의 같고, 원도심은 지금보다 사람이 많다', { skip: !existsSync(resolve(ROOT, 'data/build/history-population.json')) }, () => {
  const grid = readJson('data/build/grid.json');
  const table = readJson('data/build/history-population.json');
  const facts = readJson('data/facts.json').historicPopulation;
  const at = populationRowsAt(grid, 1985, table);
  // 1985년에 부산이 아니던 기장군은 1995년 값을 쓰므로 그만큼 더 많다.
  const expected = facts.census['1985'].total + facts.census['1995'].value.기장군;
  assert.ok(Math.abs(at.total - expected) / expected < 0.01, `${at.total} vs ${expected}`);
  assert.ok(at.factors.중구 > 1.5, `중구 ${at.factors.중구}`);
  assert.ok(at.factors.강서구 < 0.5, `강서구 ${at.factors.강서구}`);
  // 늘 같은 결과
  assert.deepEqual(populationRowsAt(grid, 1985, table).population, at.population);
});
