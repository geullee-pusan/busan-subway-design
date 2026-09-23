// 옛날 부산(연표) 테스트(docs/SPEC.md 12장 Phase 6)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRailGraph, timeBetween } from '../src/sim/rail.js';
import { networkAt, openedBy, openingYears, sizeAt, sizeByYear, yearOf } from '../src/sim/history.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const dataReady = ['data/build/stations.json', 'data/build/station-info.json'].every((p) =>
  existsSync(resolve(ROOT, p)),
);
const skip = dataReady ? false : 'npm run data를 먼저 돌려요';

// 역 네 개짜리 연습 노선. 가운데 '다'는 나중에 끼어든 역이다.
const toy = {
  lines: [{ id: 'T', name: '연습선', stations: ['가', '나', '다', '라'] }],
  stations: [
    { id: '가', line: 'T', x: 0, y: 0, name: '가' },
    { id: '나', line: 'T', x: 1, y: 0, name: '나' },
    { id: '다', line: 'T', x: 2, y: 0, name: '다' },
    { id: '라', line: 'T', x: 3, y: 0, name: '라' },
  ],
  links: [
    { line: 'T', from: '가', to: '나', distanceM: 1000, runS: 100 },
    { line: 'T', from: '나', to: '다', distanceM: 1000, runS: 100 },
    { line: 'T', from: '다', to: '라', distanceM: 1000, runS: 100 },
  ],
  transfers: [{ id: 'X', name: '나', stations: ['나', '딴'], source: '연습' }],
  stationInfo: {
    가: { openedOn: '1990-01-01' },
    나: { openedOn: '1990-01-01' },
    다: { openedOn: '2010-01-01' },
    라: { openedOn: '1995-06-01' },
  },
};

test('연도 읽기', () => {
  assert.equal(yearOf('1985-07-19'), 1985);
  assert.equal(yearOf(null), null);
  assert.equal(yearOf('없음'), null);
  assert.equal(openedBy(1985, '1985-07-19'), true);
  assert.equal(openedBy(1984, '1985-07-19'), false);
  assert.equal(openedBy(2026, null), false);
});

test('아직 안 생긴 역은 빠진다', () => {
  const at1990 = networkAt(1990, toy);
  assert.deepEqual(
    at1990.stations.map((s) => s.id),
    ['가', '나'],
  );
  assert.equal(at1990.links.length, 1);
  assert.equal(at1990.links[0].distanceM, 1000);
  assert.equal(at1990.links[0].skipped, 0);
});

test('사이에 끼어들 역이 아직 없으면 앞뒤 역을 바로 잇고 거리를 더한다', () => {
  const at1995 = networkAt(1995, toy);
  assert.deepEqual(
    at1995.stations.map((s) => s.id),
    ['가', '나', '라'],
  );
  const merged = at1995.links.find((l) => l.from === '나' && l.to === '라');
  assert.ok(merged, '나와 라가 이어져 있어야 한다');
  assert.equal(merged.distanceM, 2000);
  assert.equal(merged.runS, 200);
  assert.equal(merged.skipped, 1);
});

test('끼어든 역이 생기면 구간이 둘로 나뉜다', () => {
  const at2010 = networkAt(2010, toy);
  assert.equal(at2010.stations.length, 4);
  assert.equal(at2010.links.length, 3);
  assert.ok(at2010.links.every((l) => l.skipped === 0));
});

test('역이 하나도 없는 해에는 노선이 없다', () => {
  const at1980 = networkAt(1980, toy);
  assert.deepEqual(at1980, { lines: [], stations: [], links: [], transfers: [] });
});

test('갈아타기는 두 역이 모두 열려 있을 때만 남는다', () => {
  assert.equal(networkAt(2010, toy).transfers.length, 0, "'딴' 역은 자료에 없으니 갈아타기도 없다");
  const withBoth = { ...toy, transfers: [{ id: 'X', name: '나', stations: ['나', '라'], source: '연습' }] };
  assert.equal(networkAt(1990, withBoth).transfers.length, 0);
  assert.equal(networkAt(1995, withBoth).transfers.length, 1);
});

test('같은 해를 두 번 물어도 같은 답이 나온다', () => {
  assert.deepEqual(networkAt(1995, toy), networkAt(1995, toy));
});

// --- 실제 자료 ---

function loadData() {
  return {
    lines: readJson('data/build/lines.json').lines,
    stations: readJson('data/build/stations.json').stations,
    links: readJson('data/build/links.json').links,
    transfers: readJson('data/build/transfers.json').transfers,
    stationInfo: readJson('data/build/station-info.json').stations,
  };
}

test('1985년 부산에는 1호선 첫 구간 17개 역만 있다', { skip }, () => {
  const data = loadData();
  const at1985 = networkAt(1985, data);
  assert.equal(at1985.lines.length, 1);
  assert.equal(at1985.lines[0].id, '1');
  assert.equal(at1985.stations.length, 17);
  assert.equal(at1985.links.length, 16);
  assert.equal(at1985.transfers.length, 0);
});

test('2026년 부산은 지금 노선망과 같다', { skip }, () => {
  const data = loadData();
  const now = networkAt(2026, data);
  assert.equal(now.stations.length, data.stations.length);
  assert.equal(now.links.length, data.links.length);
  assert.equal(now.lines.length, data.lines.length);
  assert.ok(
    now.links.every((link) => link.skipped === 0),
    '지금은 건너뛴 역이 없어야 한다',
  );
});

test('끼워 넣은 역(증산, 부산원동)이 없던 해에도 노선이 끊기지 않는다', { skip }, () => {
  const data = loadData();
  // 증산은 2015년, 부산원동은 2020년에 문을 열었다.
  const before = networkAt(2014, data);
  const line2 = before.links.filter((l) => l.line === '2');
  assert.ok(line2.some((l) => l.skipped > 0), '증산 자리를 건너뛴 구간이 있어야 한다');
  const stations2 = before.stations.filter((s) => s.line === '2').length;
  assert.equal(line2.length, stations2 - 1, '2호선이 한 줄로 이어져 있어야 한다');

  const before2020 = networkAt(2019, data);
  const dh = before2020.links.filter((l) => l.line === 'DH');
  const dhStations = before2020.stations.filter((s) => s.line === 'DH').length;
  assert.equal(dh.length, dhStations - 1);
  assert.ok(dh.some((l) => l.skipped > 0), '부산원동 자리를 건너뛴 구간이 있어야 한다');
});

test('해가 갈수록 노선이 길어지고 역이 는다', { skip }, () => {
  const data = loadData();
  const years = openingYears(data.stationInfo);
  assert.equal(years[0], 1985);
  assert.ok(years.length >= 15);
  const sizes = sizeByYear(years, data);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i].km >= sizes[i - 1].km, `${sizes[i].year}년에 길이가 줄었다`);
    assert.ok(sizes[i].stations > sizes[i - 1].stations, `${sizes[i].year}년에 역이 늘지 않았다`);
  }
  const last = sizeAt(2026, data);
  assert.equal(last.stations, data.stations.length);
  assert.ok(last.km > 100, '지금 부산 도시철도는 100km가 넘는다');
});

test('노선의 역 차례도 그 해에 있던 역만 남는다', { skip }, () => {
  const data = loadData();
  const at1985 = networkAt(1985, data);
  assert.equal(at1985.lines[0].stations.length, 17);
  assert.ok(
    at1985.lines[0].stations.every((id) => at1985.stations.some((s) => s.id === id)),
    '노선이 가리키는 역이 모두 있어야 한다',
  );
  const now = networkAt(2026, data);
  for (const line of now.lines) {
    const original = data.lines.find((l) => l.id === line.id);
    assert.deepEqual(line.stations, original.stations);
  }
});

test('그 해 노선망으로 두 역 사이 시간을 잰다', { skip }, () => {
  const data = loadData();
  const rules = { transferWalkMin: 3 };
  const lineInfo = Object.fromEntries(data.lines.map((l) => [l.id, { dwellS: l.dwellS, headwayMin: l.headwayMin ?? 10 }]));
  const timeAt = (year, from, to) => {
    const net = networkAt(year, data);
    const graph = buildRailGraph(net.stations, net.links, net.transfers, lineInfo, rules);
    return timeBetween(graph, from, to);
  };
  // 서면(119)과 노포(134)는 둘 다 1호선 첫 구간에 있다.
  const at1985 = timeAt(1985, '134', '119');
  assert.ok(at1985 > 0, '1985년에도 노포에서 서면까지 갈 수 있어야 한다');
  // 해운대(203)는 2002년에 문을 열었다. 그 전에는 못 간다.
  assert.equal(timeAt(1995, '134', '203'), null);
  assert.ok(timeAt(2026, '134', '203') > 0);
});
