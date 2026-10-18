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
  assert.deepEqual(names('KTX'), ['김천구미', '대구', '동대구', '경주', '울산', '부산']);
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

test('선로 모양의 길이가 거리표와 크게 다르지 않다(중앙선 새 선로는 빼고)', { skip }, () => {
  const rail = load();
  for (const line of rail.lines.filter((l) => l.id !== 'JA')) {
    line.links.forEach((link, i) => {
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
