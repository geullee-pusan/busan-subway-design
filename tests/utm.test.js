import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeUtm, utm52 } from '../scripts/lib/utm.mjs';

test('중앙 경선(동경 129도)의 적도는 (500000, 0)', () => {
  const [x, y] = utm52.forward(129, 0);
  assert.ok(Math.abs(x - 500000) < 1e-6);
  assert.ok(Math.abs(y) < 1e-6);
});

test('부산 둘레의 점은 바꿨다가 되돌리면 0.1mm 안에서 제자리로 온다', () => {
  for (let lat = 34.8; lat <= 35.6; lat += 0.1) {
    for (let lon = 128.6; lon <= 129.5; lon += 0.1) {
      const [x, y] = utm52.forward(lon, lat);
      const [lon2, lat2] = utm52.inverse(x, y);
      assert.ok(Math.abs(lon2 - lon) < 1e-9 && Math.abs(lat2 - lat) < 1e-9, `${lon}, ${lat}`);
    }
  }
});

test('중앙 경선 양쪽은 좌우 대칭이다', () => {
  const [xe, ye] = utm52.forward(129.3, 35.2);
  const [xw, yw] = utm52.forward(128.7, 35.2);
  assert.ok(Math.abs(xe - 500000 - (500000 - xw)) < 1e-6);
  assert.ok(Math.abs(ye - yw) < 1e-6);
});

test('중앙 경선에서 동서 방향 축척은 0.9996이다', () => {
  // 위도 35도에서 경도 0.001도의 실제 길이 = N·cos(위도)·Δλ (N: 동서 곡률 반지름)
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const phi = (35 * Math.PI) / 180;
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const ground = n * Math.cos(phi) * ((0.001 * Math.PI) / 180);
  const [x1] = utm52.forward(129 - 0.0005, 35);
  const [x2] = utm52.forward(129 + 0.0005, 35);
  assert.ok(Math.abs((x2 - x1) / ground - 0.9996) < 1e-7);
});

test('다른 구역도 만들 수 있다(52구역 = EPSG:32652)', () => {
  assert.equal(utm52.epsg, 32652);
  assert.equal(makeUtm(51).epsg, 32651);
});
