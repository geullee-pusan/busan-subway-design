// 대구권 전철(대구 도시철도 1·2·3호선, 대경선) 테스트
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRailGraph, timeBetween } from '../src/sim/rail.js';
import { networkAt } from '../src/sim/history.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const dataReady = ['data/build/lines.json', 'data/build/stations.json', 'data/build/station-info.json'].every((p) =>
  existsSync(resolve(ROOT, p)),
);
const skip = dataReady ? false : 'npm run data를 먼저 돌려요';

function load() {
  return {
    lines: readJson('data/build/lines.json').lines,
    stations: readJson('data/build/stations.json').stations,
    links: readJson('data/build/links.json').links,
    transfers: readJson('data/build/transfers.json').transfers,
    stationInfo: readJson('data/build/station-info.json').stations,
    ridership: readJson('data/build/ridership.json'),
  };
}

test('대구 노선은 부산 노선과 번호가 겹치지 않고, 역 수가 공식 자료와 같다', { skip }, () => {
  const { lines, stations } = load();
  const count = (id) => lines.find((l) => l.id === id).stations.length;
  // 역 수: 대구교통공사 역간거리 정보(15002510) 1호선 35, 2호선 29, 3호선 30. 대경선 7역 + 북삼
  assert.equal(count('DG1'), 35);
  assert.equal(count('DG2'), 29);
  assert.equal(count('DG3'), 30);
  assert.equal(count('DK'), 8);
  assert.deepEqual(
    lines.filter((l) => l.region === '대구').map((l) => l.label),
    ['대경', '대구1', '대구2', '대구3'],
  );
  const ids = stations.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, '역 id가 겹치면 안 된다');
});

test('대경선 북삼역은 사곡과 왜관 사이에 있다', { skip }, () => {
  const { lines, stations } = load();
  const name = (id) => stations.find((s) => s.id === id).name;
  const order = lines.find((l) => l.id === 'DK').stations.map(name);
  assert.deepEqual(order, ['구미', '사곡', '북삼', '왜관', '서대구', '대구', '동대구', '경산']);
});

test('대구 갈아타는 역: 반월당, 명덕, 청라언덕, 대경선 대구·동대구', { skip }, () => {
  const { transfers, stations } = load();
  const lineOf = (id) => stations.find((s) => s.id === id).line;
  const daegu = transfers.filter((t) => t.stations.some((id) => /^D[GK]/.test(lineOf(id))));
  assert.deepEqual(daegu.map((t) => t.name).sort(), ['대구', '동대구', '명덕', '반월당', '청라언덕']);
});

test('대구 도심에서 대경선을 갈아타고 구미까지 갈 수 있다', { skip }, () => {
  const { lines, stations, links, transfers } = load();
  const lineInfo = Object.fromEntries(lines.map((l) => [l.id, { dwellS: l.dwellS ?? 0, headwayMin: l.headwayMin ?? 10 }]));
  const graph = buildRailGraph(stations, links, transfers, lineInfo, { transferWalkMin: 3 });
  const find = (line, name) => stations.find((s) => s.line === line && s.name === name).id;
  const minutes = timeBetween(graph, find('DG2', '영남대'), find('DK', '구미'));
  assert.ok(Number.isFinite(minutes), '이어져 있어야 한다');
  // 영남대 → 반월당(2호선) → 대구역(1호선) → 구미(대경선): 한 시간 반쯤
  assert.ok(minutes > 60 && minutes < 150, `${minutes}분`);
});

test('대구 노선의 배차 간격은 시각표에서, 대경선은 발표 값에서 온다', { skip }, () => {
  const { lines } = load();
  for (const id of ['DG1', 'DG2', 'DG3']) {
    const line = lines.find((l) => l.id === id);
    assert.ok(line.headwayMin > 3 && line.headwayMin < 15, `${id} ${line.headwayMin}분`);
    assert.match(line.serviceSource, /시각표/);
  }
  assert.equal(lines.find((l) => l.id === 'DK').headwayMin, 25);
});

test('대구 역은 모두 개통일이 있고, 1998년에는 1호선만 있다', { skip }, () => {
  const data = load();
  const daeguIds = data.stations.filter((s) => /^D[GK]/.test(s.line)).map((s) => s.id);
  assert.ok(daeguIds.every((id) => data.stationInfo[id]?.openedOn), '개통일이 없는 대구 역이 있다');
  const then = networkAt(1998, data);
  const daeguLines = then.lines.filter((l) => /^D[GK]/.test(l.id)).map((l) => l.id);
  assert.deepEqual(daeguLines, ['DG1']);
});

test('대구 실제 이용객은 보정 자료(stations)와 따로 있다', { skip }, () => {
  const { ridership, stations } = load();
  const daeguIds = stations.filter((s) => /^DG/.test(s.line)).map((s) => s.id);
  assert.ok(daeguIds.every((id) => ridership.daegu.stations[id]?.['평일']), '평일 자료가 없는 대구 역이 있다');
  assert.ok(daeguIds.every((id) => !ridership.stations[id]), '보정 자료에 대구 역이 섞이면 안 된다');
  const day = ridership.daegu.stations[daeguIds[0]]['평일'];
  assert.equal(day.hourly.board.length, 24);
  assert.equal(day.board, day.hourly.board.reduce((s, v) => s + v, 0));
});
