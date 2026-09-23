// 새 노선 여러 개(설계 묶음) 테스트
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { designCost } from '../src/sim/design.js';
import { withDesign } from '../src/sim/design-world.js';
import {
  MAX_LINES,
  asPlan,
  checkPlan,
  isNewLineId,
  isNewStationId,
  lineIdAt,
  planCost,
  splitNewStationId,
  withPlan,
} from '../src/sim/plan.js';
import { prepareWorld, runDay } from '../src/sim/run.js';
import { buildWorld, rulesFromCards } from '../src/sim/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const rulesFile = readJson('src/content/rules.json');
const rules = rulesFromCards(rulesFile.rules);
const tables = rulesFile.tables;
const dataReady = existsSync(resolve(ROOT, 'data/build/grid.json'));

test('노선 번호: NEW, NEW2 … 와 새 역 번호', () => {
  assert.equal(lineIdAt(0), 'NEW');
  assert.equal(lineIdAt(1), 'NEW2');
  assert.equal(lineIdAt(MAX_LINES - 1), `NEW${MAX_LINES}`);
  assert.ok(isNewLineId('NEW') && isNewLineId('NEW3') && !isNewLineId('1') && !isNewLineId('NEWS'));
  assert.ok(isNewStationId('NEW-12') && isNewStationId('NEW2-7') && !isNewStationId('101'));
  assert.deepEqual(splitNewStationId('NEW2-345'), { line: 'NEW2', cell: 345 });
  assert.equal(splitNewStationId('201'), null);
});

test('설계 하나(옛 모양)도 묶음으로 바뀐다', () => {
  const plan = asPlan({ path: [1, 2], stations: [1, 2], kind: '경전철', trainsPerHour: 8 });
  assert.equal(plan.lines.length, 1);
  assert.equal(plan.lines[0].id, 'NEW');
  assert.equal(asPlan(plan), plan);
});

test('공사비: 노선마다 더하고, 앞 노선과 같은 칸의 역은 갈아타는 역 값이다', () => {
  const grid = { cols: 5, rows: 1, terrain: [['flat', 'flat', 'flat', 'flat', 'flat']] };
  const a = { id: 'NEW', path: [0, 1, 2], stations: [0, 2], kind: '경전철', trainsPerHour: 8 };
  const b = { id: 'NEW2', path: [2, 3, 4], stations: [2, 4], kind: '경전철', trainsPerHour: 8 };
  const cost = planCost({ lines: [a, b] }, grid, rules, tables);
  const alone = designCost(b, grid, rules, tables);
  const shared = designCost(b, grid, rules, tables, new Set([2]));
  assert.equal(cost.lines[1].total, shared.total);
  assert.ok(shared.total > alone.total, '갈아타는 역은 더 비싸다');
  assert.equal(cost.total, cost.lines[0].total + cost.lines[1].total);
  assert.equal(cost.lengthKm, 4);
  assert.equal(cost.stations, 4);
});

test('설계 검사: 빈 노선은 빼고, 노선이 둘 넘으면 이름을 붙여 알려 준다', () => {
  const good = { path: [0, 1], stations: [0, 1], lineName: '가선' };
  const empty = { path: [], stations: [], lineName: '빈선' };
  const bad = { path: [5], stations: [5], lineName: '나선' };
  assert.equal(checkPlan({ lines: [good, empty] }).ok, true);
  const check = checkPlan({ lines: [good, bad] });
  assert.equal(check.ok, false);
  assert.ok(check.problems.every((p) => p.startsWith('나선: ')));
  assert.equal(checkPlan({ lines: [empty] }).ok, false);
});

test('세상에 넣기: 노선마다 번호가 다르고, 같은 칸의 새 역끼리 갈아탈 수 있다', { skip: !dataReady }, () => {
  const grid = readJson('data/build/grid.json');
  const world = buildWorld({
    grid,
    stations: readJson('data/build/stations.json').stations,
    lines: readJson('data/build/lines.json').lines,
    links: readJson('data/build/links.json').links,
    transfers: readJson('data/build/transfers.json').transfers,
    places: readJson('src/content/places.json').places,
    dongs: readJson('data/build/dongs.json').dongs,
    hourShape: readJson('data/build/ridership.json').shape['평일'],
    defaultHeadwayMin: rules.defaultHeadwayMin,
  });
  const cell = (c, r) => r * grid.cols + c;
  // 사상–당감–서면 가로선과, 당감 칸(21, 26)에서 만나는 세로선. 당감 칸에는 기존 역이 없다.
  const across = [...[18, 19, 20, 21, 22, 23, 24, 25].map((c) => cell(c, 26)), cell(25, 27)];
  const down = [26, 25, 24, 23, 22].map((r) => cell(21, r));
  const a = { id: 'NEW', path: across, stations: [across[0], across[3], across.at(-1)], kind: '경전철', trainsPerHour: 8 };
  const b = { id: 'NEW2', path: down, stations: [down[0], down[2], down[4]], kind: '지하철', trainsPerHour: 6 };
  const next = withPlan(world, { lines: [a, b] }, grid, tables);
  assert.ok(next.lines.some((l) => l.id === 'NEW') && next.lines.some((l) => l.id === 'NEW2'));
  assert.equal(next.stations.filter((s) => isNewStationId(s.id)).length, 6);
  const group = next.transfers.find((t) => t.stations.includes(`NEW2-${cell(21, 26)}`));
  assert.ok(group?.stations.includes(`NEW-${cell(21, 26)}`), '새 노선끼리 갈아탈 수 있다');
  // 노선 하나만 넣은 것과 첫 노선은 같다(옛 설계와 같은 결과).
  const one = withDesign(world, a, grid, tables);
  assert.deepEqual(withPlan(world, { lines: [a] }, grid, tables).stations, one.stations);
  // 하루를 돌리면 새 노선에 타는 사람이 있고, 늘 같은 결과다.
  const result = runDay(next, prepareWorld(next, rules), rules);
  const riders = (prefix) => result.stations.filter((s) => s.id.startsWith(prefix)).reduce((sum, s) => sum + s.board, 0);
  assert.ok(riders('NEW') > 0);
  assert.deepEqual(runDay(next, prepareWorld(next, rules), rules).stations, result.stations);
});
