// 설계 화면의 역 정보 창에 쓰는 계산(src/model.js). 게임 자료 JSON을 함께 읽어야 해서 vite로 불러온다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let model;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  model = await server.ssrLoadModule('/src/model.js');
});
after(() => server?.close());

// 서면 둘레 칸: UTM 동쪽 509~511km, 격자 위에서 132번째 줄. 지도 범위가 넓어져도 같은 자리를 가리키게 UTM 좌표로 적는다.
const grid = JSON.parse(readFileSync(new URL('../data/build/grid.json', import.meta.url), 'utf8'));
const cell = (eastKm, row) => row * grid.cols + (eastKm - grid.origin.easting / 1000);

test('역 정보: 역이 하나일 때도, 선로로 이은 역이 여럿일 때도 계산된다', () => {
  const one = cell(511, 132);
  const single = model.designStationInfo({ id: 'test', path: [one], stations: [one], kind: '지하철', trainsPerHour: 8 }, { year: 2024, dayType: '평일' }, 0);
  assert.equal(single[one].riderLevel, null);
  assert.ok(single[one].walkPeople > 0, '둘레에 사는 사람을 세요');

  const path = [cell(509, 132), cell(510, 132), cell(511, 132)];
  const stations = [path[0], path[2]];
  const info = model.designStationInfo({ id: 'test', path, stations, kind: '지하철', trainsPerHour: 8 }, { year: 2024, dayType: '평일' }, 0);
  for (const station of stations) {
    assert.ok(info[station], '역마다 정보가 있어요');
    assert.ok(Array.isArray(info[station].places));
    assert.notEqual(info[station].riderLevel, null, '역이 둘이면 예상 승객 단계가 나와요');
  }
});
