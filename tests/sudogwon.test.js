// 수도권 도시철도(수도권 넓히기 1단계): 노선, 역, 구간, 갈아타기, 길 찾기
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { allShortestTimes, buildRailGraph } from '../src/sim/rail.js';
import { rulesFromCards } from '../src/sim/world.js';
import { withoutSudogwon } from '../src/sim/regions.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const skip = !existsSync(resolve(ROOT, 'data/build/lines.json'));
const load = () => ({
  lines: readJson('data/build/lines.json').lines,
  stations: readJson('data/build/stations.json').stations,
  links: readJson('data/build/links.json').links,
  transfers: readJson('data/build/transfers.json').transfers,
});

test('수도권: 범위의 노선이 모두 있고, 역은 격자 안에 있다', { skip }, () => {
  const { lines, stations } = load();
  const sd = lines.filter((l) => l.region === '수도권');
  const names = sd.map((l) => l.name);
  for (const n of ['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', '경의·중앙선', '수인·분당선', '경춘선', '경강선', '서해선', '신분당선', '공항철도', 'GTX-A', '인천 1호선', '인천 2호선', '우이신설선', '신림선', '의정부경전철', '용인경전철', '김포골드라인']) {
    assert.ok(names.includes(n), `${n}이 없어요`);
  }
  // 1호선 충남 구간(오산~신창)도 들어 있다
  const s1k = stations.filter((s) => s.line === 'S1K').map((s) => s.name);
  assert.ok(s1k.includes('천안') && s1k.at(-1).startsWith('신창'));
  for (const s of stations.filter((x) => sd.some((l) => l.id === x.line))) assert.ok(s.inGrid, `${s.name}(${s.line})이 격자 밖이에요`);
});

test('수도권: 노선마다 이웃 역이 구간으로 이어지고, 시간과 거리는 양수, 출처가 있다', { skip }, () => {
  const { lines, links } = load();
  for (const line of lines.filter((l) => l.region === '수도권')) {
    const own = links.filter((k) => k.line === line.id);
    assert.equal(own.length, line.stations.length - 1 + (line.loop ? 1 : 0), `${line.name} 구간 수`);
    for (let i = 1; i < line.stations.length; i++) {
      assert.ok(own.some((k) => k.from === line.stations[i - 1] && k.to === line.stations[i]), `${line.name} ${i}번째 구간이 없어요`);
    }
    for (const k of own) {
      assert.ok(k.runS > 0 && k.distanceM > 0, `${line.name} ${k.from}–${k.to}`);
      assert.ok(k.runSource, `${line.name} ${k.from}–${k.to} 시간 출처`);
      // 시속 10~200km 안(GTX-A는 빠르다)
      const kmh = k.distanceM / 1000 / (k.runS / 3600);
      assert.ok(kmh > 10 && kmh < 200, `${line.name} ${k.from}–${k.to}: 시속 ${kmh.toFixed(0)}km`);
    }
  }
});

test('수도권: 2호선은 순환선이라 충정로에서 시청으로 바로 이어진다', { skip }, () => {
  const { lines, stations, links } = load();
  const s2 = lines.find((l) => l.id === 'S2');
  assert.equal(s2.loop, true);
  const name = (id) => stations.find((s) => s.id === id).name;
  assert.equal(name(s2.stations[0]), '시청');
  const closing = links.find((k) => k.line === 'S2' && k.from === s2.stations.at(-1) && k.to === s2.stations[0]);
  assert.ok(closing && closing.runS < 300);
});

test('수도권: 같은 이름 역끼리 갈아탈 수 있다(서울역, 종로3가)', { skip }, () => {
  const { stations, transfers } = load();
  for (const name of ['서울역', '종로3가']) {
    const ids = stations.filter((s) => s.name === name && s.line.startsWith('S')).map((s) => s.id);
    assert.ok(ids.length >= 2, `${name}이 두 노선 넘게 있어요`);
    assert.ok(transfers.some((g) => ids.every((id) => g.stations.includes(id))), `${name}에서 갈아탈 수 없어요`);
  }
});

test('수도권: 길 찾기로 서울역 → 강남과 인천 → 수원을 갈 수 있고 시간이 말이 된다', { skip }, () => {
  const net = load();
  const rules = rulesFromCards(readJson('src/content/rules.json').rules);
  const lineInfo = Object.fromEntries(net.lines.map((l) => [l.id, { ...l, headwayMin: l.headwayMin ?? rules.defaultHeadwayMin, dwellS: l.dwellS ?? 0 }]));
  const graph = buildRailGraph(net.stations, net.links, net.transfers, lineInfo, rules);
  const { times, count } = allShortestTimes(graph);
  const index = new Map(net.stations.map((s, i) => [s.id, i]));
  const minutes = (a, b) => {
    const from = net.stations.filter((s) => s.name === a && s.line.startsWith('S')).map((s) => index.get(s.id));
    const to = net.stations.filter((s) => s.name === b && s.line.startsWith('S')).map((s) => index.get(s.id));
    return Math.min(...from.flatMap((f) => to.map((t) => times[f * count + t])));
  };
  const a = minutes('서울역', '강남');
  assert.ok(a > 15 && a < 60, `서울역 → 강남 ${a}분`);
  const b = minutes('인천', '수원');
  assert.ok(b > 50 && b < 150, `인천 → 수원 ${b}분`);
});

test('수도권: 부산 하루 운행에서는 수도권 노선을 뺀다', { skip }, () => {
  const net = load();
  const near = withoutSudogwon(net);
  assert.ok(near.lines.every((l) => l.region !== '수도권'));
  assert.ok(near.stations.every((s) => !s.line.startsWith('S') || /^\d/.test(s.line)));
  assert.ok(near.stations.length < net.stations.length);
  assert.ok(near.transfers.every((g) => g.stations.every((id) => near.stations.some((s) => s.id === id))));
});
