// 일반·고속 철도(코레일) 자료 테스트(data/build/rail.json, npm run rail)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(ROOT, 'data/build/rail.json');
const skip = existsSync(path) ? false : 'npm run rail을 먼저 돌려요';
const load = () => JSON.parse(readFileSync(path, 'utf8'));

test('경부고속선과 경부선의 주요 역이 차례대로 있다', { skip }, () => {
  const rail = load();
  const names = (id) => rail.lines.find((l) => l.id === id).stations.map((s) => s.replace(/^R-/, ''));
  // 지도를 경북 본토까지 넓혀(2026-11-15) 천안아산·오송이, 강원까지 넓혀(2026-11-20) 서울~광명이 지도 안에 들어왔다
  assert.deepEqual(names('KTX'), ['서울', '용산', '영등포', '광명', '천안아산', '오송', '대전', '김천구미', '대구', '동대구', '경주', '울산', '부산']);
  const gb = names('GB');
  for (const [a, b] of [
    ['구미', '왜관'],
    ['동대구', '밀양'],
    ['밀양', '구포'],
    ['구포', '부산'],
  ]) {
    assert.ok(gb.indexOf(a) < gb.indexOf(b), `${a}가 ${b}보다 앞이어야 한다`);
  }
});

test('역은 모두 지도 안에 있고, 노선에 속하고, 역 사이 거리와 선로 모양이 있다', { skip }, () => {
  const rail = load();
  const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
  const ids = new Set(rail.stations.map((s) => s.id));
  assert.equal(ids.size, rail.stations.length);
  for (const s of rail.stations) {
    assert.ok(s.x >= 0 && s.y >= 0 && s.x < grid.cols && s.y < grid.rows, `${s.name} 지도 밖`);
    assert.ok(s.lines.length > 0, `${s.name} 노선 없음`);
  }
  for (const line of rail.lines) {
    assert.equal(line.links.length, line.stations.length - 1);
    assert.equal(line.paths.length, line.links.length);
    for (const link of line.links) assert.ok(link.km > 0, `${line.name} ${link.from}–${link.to}`);
    for (const id of line.stations) assert.ok(ids.has(id));
  }
});

// 중앙선은 새 선로(2024)라 거리표와 다르고, 광주선 광주송정–극락강은 거리표가 북송정을 거쳐 센 거리(호남선 사슬과 연결선 사슬을 이음)다
// 경부선 신동–서대구는 거리표(신동–지천 7.4km + 지천–서대구 5.6km = 13km)와 OSM 선로(11km)가 2km 다르다. 충북선 삼탄–봉양도 거리표 14.4km, OSM 선로 11.4km로 다르다(data/SOURCES.md, TODO 확인 필요)
test('선로 모양의 길이가 거리표와 크게 다르지 않다(중앙선 새 선로는 빼고)', { skip }, () => {
  const rail = load();
  for (const line of rail.lines.filter((l) => l.id !== 'JA')) {
    line.links.forEach((link, i) => {
      if (line.id === 'GJS' && link.from === 'R-광주송정') return;
      if (line.id === 'GB' && link.from === 'R-신동' && link.to === 'R-서대구') return;
      if (line.id === 'CB' && link.from === 'R-삼탄' && link.to === 'R-봉양') return;
      // 강원 산길(2026-11-20): 그린 선로가 거리표보다 짧다(영동선 정동진–강릉 23km/16.8km: 남강릉을 거쳐 그리지만 경강선 구간도 거리표가 OSM보다 길다,
      // 태백선 태백–동백산 10.5km/8.0km, 정선선 민둥산–별어곡 6.4km/4.6km). 걸리는 시간은 거리표를 쓴다(data/SOURCES.md, TODO 확인 필요)
      // 영동선 동백산–도계는 솔안터널을 따라 그리도록 고쳐(2026-11-21, 17.7km) 이 검사를 받는다.
      const KANGWON = ['YD R-정동진 R-강릉', 'TB R-태백 R-동백산', 'JS R-민둥산 R-별어곡'];
      if (KANGWON.includes(`${line.id} ${link.from} ${link.to}`)) return;
      const pts = line.paths[i];
      let km = 0;
      for (let k = 1; k < pts.length; k++) km += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) / 100;
      assert.ok(Math.abs(km - link.km) <= Math.max(1.5, link.km * 0.15), `${line.name} ${link.from}–${link.to}: 거리표 ${link.km}km, 그림 ${km.toFixed(1)}km`);
    });
  }
});

test('열차 시각표: 시각이 차례대로 늘고, 정차역은 지도 안 기차역이며, 종류가 붙어 있다', { skip }, () => {
  const trainsPath = resolve(ROOT, 'data/build/trains.json');
  if (!existsSync(trainsPath)) return;
  const trains = JSON.parse(readFileSync(trainsPath, 'utf8'));
  const rail = load();
  const ids = new Set(rail.stations.map((s) => s.id));
  assert.ok(trains.trains.length > 100);
  for (const train of trains.trains) {
    assert.ok(train.stops.length >= 2, `${train.no} 정차역이 둘 넘어야 한다`);
    let last = -Infinity;
    for (const [station, arr, dep] of train.stops) {
      assert.ok(ids.has(station), `${train.no} ${station}`);
      const at = arr ?? dep;
      assert.ok(at >= last, `${train.no} 시각이 거꾸로 간다`);
      last = dep ?? arr;
    }
  }
  for (const kind of ['KTX', 'KTX-산천', 'KTX-청룡', 'KTX-이음', 'ITX-마음', '무궁화호']) {
    assert.ok(trains.kinds.includes(kind), `${kind}가 있어야 한다`);
  }
  const known = trains.trains.filter((x) => x.kind).length / trains.trains.length;
  assert.ok(known > 0.95, `종류를 아는 열차 ${(known * 100).toFixed(1)}%`);
});
