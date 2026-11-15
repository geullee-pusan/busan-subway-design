// 기차 3D 보기의 역사·승강장 자료(data/build/station-areas.json, npm run station-areas)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rail = JSON.parse(readFileSync(new URL('../data/build/rail.json', import.meta.url), 'utf8'));
const areas = JSON.parse(readFileSync(new URL('../data/build/station-areas.json', import.meta.url), 'utf8'));

test('모든 기차역에 자료 칸이 있고 원점이 rail.json 역 자리와 10m 안이다', () => {
  for (const st of rail.stations) {
    const a = areas.stations[st.id];
    assert.ok(a, st.name);
    assert.ok(Math.hypot(a.origin[0] - st.x, a.origin[1] - st.y) < 0.011, `${st.name} 원점`);
  }
});

test('좌표는 유한한 수이고 역 건물·승강장은 역에서 460m 안에 있다', () => {
  for (const [id, a] of Object.entries(areas.stations)) {
    const pts = [...a.buildings.flatMap((b) => b.ring), ...a.platforms.flatMap((p) => p.shape)];
    for (const [x, y] of pts) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y), id);
      assert.ok(Math.hypot(x, y) < 900, `${a.name}: ${x}, ${y}`);
    }
    for (const b of a.buildings) {
      const cx = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length;
      const cy = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length;
      assert.ok(Math.hypot(cx, cy) < 460, `${a.name} 건물 ${b.name ?? b.osm}`);
      assert.ok(b.ring.length >= 3);
    }
  }
});

test('주요 역 겉모습(stationLooks)은 출처와 함께 들어간다', () => {
  const facts = JSON.parse(readFileSync(new URL('../data/facts.json', import.meta.url), 'utf8'));
  for (const [name, f] of Object.entries(facts.stationLooks)) {
    if (name.startsWith('_')) continue;
    assert.ok(f.source && f.url, `${name} 출처`);
    const st = rail.stations.find((s) => s.name === name);
    assert.ok(st, `${name}이 rail.json에 있다`);
    assert.equal(areas.stations[st.id].look?.source, f.source);
  }
});
