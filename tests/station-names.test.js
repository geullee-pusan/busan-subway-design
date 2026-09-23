// 새 역 이름 짓기 테스트
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  cleanStationName,
  nameCandidates,
  nameStations,
  shortDongName,
  shortPlaceName,
} from '../src/sim/station-names.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

test('행정동 이름을 역 이름처럼 줄인다', () => {
  assert.equal(shortDongName('부산광역시 강서구 명지1동'), '명지');
  assert.equal(shortDongName('부산광역시 남구 대연3동'), '대연');
  assert.equal(shortDongName('부산광역시 기장군 기장읍'), '기장');
  assert.equal(shortDongName('부산광역시 중구 중앙동'), '중앙');
  assert.equal(shortDongName('부산광역시 서구 남부민1동'), '남부민');
  // 한 글자만 남으면 줄이지 않는다
  assert.equal(shortDongName('부산광역시 해운대구 우1동'), '우동');
  assert.equal(shortDongName('경상남도 양산시 동면'), '동면');
});

test('중심지 이름을 역 이름처럼 줄인다', () => {
  assert.equal(shortPlaceName('남포·자갈치'), '남포');
  assert.equal(shortPlaceName('센텀시티·벡스코'), '센텀시티');
  assert.equal(shortPlaceName('부산역'), '부산');
  assert.equal(shortPlaceName('명지'), '명지');
});

test('사람이 적은 이름을 다듬는다', () => {
  assert.equal(cleanStationName('  명지  '), '명지');
  assert.equal(cleanStationName('명지역'), '명지');
  assert.equal(cleanStationName('역'), '역');
  assert.equal(cleanStationName('   '), null);
  assert.equal(cleanStationName(null), null);
  assert.equal(cleanStationName('아주아주아주긴역이름입니다정말로'), '아주아주아주긴역이름입니');
});

// 4 × 3칸 연습 격자. 칸 번호 = 행 × 4 + 열
const toy = {
  cols: 4,
  existing: [{ name: '서면', cell: 5 }],
  dongs: [
    { name: '부산광역시 가구 가나1동', x: 0.5, y: 0.5 },
    { name: '부산광역시 가구 다라동', x: 3.5, y: 0.5 },
    { name: '부산광역시 가구 서면동', x: 2.5, y: 2.5 },
  ],
  places: [{ name: '큰시장·먹자골목', x: 3.4, y: 2.6 }],
};

test('후보는 가까운 중심지부터, 그다음 가까운 동네', () => {
  const near = nameCandidates(11, toy); // 열 3, 행 2
  assert.equal(near[0].name, '큰시장');
  assert.equal(near[0].source, '중심지');
  assert.equal(near[1].source, '동네');
  const far = nameCandidates(0, toy); // 중심지가 1km 밖
  assert.equal(far[0].name, '가나');
  assert.equal(far[0].distance, 0);
});

test('3km보다 먼 동네는 후보가 아니다(가까운 동네가 하나도 없으면 가장 가까운 하나)', () => {
  const wide = { cols: 20, dongs: [{ name: '부산광역시 가구 먼동', x: 15.5, y: 0.5 }, { name: '부산광역시 가구 옆동', x: 1.5, y: 0.5 }], places: [] };
  assert.deepEqual(
    nameCandidates(0, wide).map((c) => c.name),
    ['옆동'], // 줄이면 한 글자라 그대로 둔다
  );
  const lonely = { cols: 20, dongs: [{ name: '부산광역시 가구 먼동', x: 15.5, y: 0.5 }], places: [] };
  assert.deepEqual(
    nameCandidates(0, lonely).map((c) => c.name),
    ['먼동'],
  );
});

test('이름은 가장 가까이서 가리키는 역이 가져간다(선의 차례가 아니라)', () => {
  // 실제로 겪은 일: 하단역 바로 옆 새 역은 가장 가까운 동네가 "하단"인데 하단역이 이미 있어
  // 2km 떨어진 "명지"를 가져갔고, 명지 한가운데 역이 "명지2"가 됐다.
  const world = {
    cols: 10,
    existing: [{ name: '하단', cell: 6 }],
    dongs: [
      { name: '부산광역시 강서구 하단1동', x: 4.5, y: 0.5 },
      { name: '부산광역시 강서구 명지1동', x: 1.3, y: 0.4 },
    ],
    places: [{ name: '명지', x: 1.3, y: 0.4 }],
  };
  // 선: 하단(칸 6) → 서쪽으로 칸 1까지. 역은 6, 4, 1
  const design = { path: [6, 5, 4, 3, 2, 1], stations: [6, 4, 1] };
  const names = nameStations({ design, ...world });
  assert.deepEqual(
    names.map((n) => [n.name, n.source]),
    [
      ['하단', '갈아타는 역'],
      ['신하단', '동네'],
      ['명지', '중심지'],
    ],
  );
});

test('기존 역 칸이면 그 이름, 아니면 중심지나 동네 이름을 붙인다', () => {
  const design = { path: [4, 5, 6, 7, 11], stations: [4, 5, 11] };
  const names = nameStations({ design, ...toy });
  assert.deepEqual(
    names.map(({ name, source }) => [name, source]),
    [
      ['가나', '동네'],
      ['서면', '갈아타는 역'],
      ['큰시장', '중심지'],
    ],
  );
  assert.deepEqual(
    names.map((n) => n.order),
    [1, 2, 3],
  );
});

test('기존 역 이름과 겹치면 다음 후보로 넘어가거나 신을 붙인다', () => {
  // 칸 10(열 2, 행 2)에서 가장 가까운 동네는 "서면동" → "서면"인데, 이미 서면역이 있다.
  const names = nameStations({ design: { path: [9, 10], stations: [9, 10] }, ...toy, places: [] });
  const at10 = names.find((n) => n.cell === 10);
  // 두 역 모두 후보가 "서면"뿐이다(1km 안에 다른 동네가 없다). 첫 역은 신서면
  assert.equal(names.find((n) => n.cell === 9).name, '신서면');
  // 두 번째 역은 번호 대신 조금 더 먼 동네 이름을 쓴다
  assert.equal(at10.name, '다라');
});

test('새 역끼리도 이름이 겹치지 않는다', () => {
  const design = { path: [0, 1], stations: [0, 1] }; // 둘 다 가나동이 가장 가깝다
  const names = nameStations({ design, ...toy, dongs: [toy.dongs[0]], places: [] });
  assert.equal(names[0].name, '가나');
  assert.equal(names[1].name, '신가나');
});

test('신 이름도 겹치거나 이미 신으로 시작하면 번호 대신 구 이름을 쓴다', () => {
  const one = { cols: 4, existing: [{ name: '가나', cell: 5 }, { name: '신가나', cell: 6 }], dongs: [toy.dongs[0]], places: [] };
  assert.equal(nameStations({ design: { path: [0], stations: [0] }, ...one })[0].name, '가구');
  const shin = { cols: 4, existing: [{ name: '신평', cell: 5 }], dongs: [{ name: '부산광역시 사하구 신평1동', x: 0.5, y: 0.5 }], places: [] };
  // 신평 → 신신평은 만들지 않는다
  assert.equal(nameStations({ design: { path: [0], stations: [0] }, ...shin })[0].name, '사하');
});

test('다른 역 이름을 고쳐도 하단 옆 역은 신하단 그대로다', () => {
  // 실제로 겪은 일: 명지 역을 "명지신도시"로 고치자 "명지"가 비어 하단 옆 역이 "명지"로 바뀌었다.
  const world = {
    cols: 10,
    existing: [{ name: '하단', cell: 6 }],
    dongs: [
      { name: '부산광역시 강서구 하단1동', x: 4.5, y: 0.5 },
      { name: '부산광역시 강서구 명지1동', x: 1.3, y: 0.4 },
    ],
    places: [{ name: '명지', x: 1.3, y: 0.4 }],
  };
  const design = { path: [6, 5, 4, 3, 2, 1], stations: [6, 4, 1], names: { 1: '명지신도시' } };
  const names = nameStations({ design, ...world });
  assert.deepEqual(
    names.map((n) => n.name),
    ['하단', '신하단', '명지신도시'],
  );
});

test('사람이 고친 이름이 먼저다', () => {
  const design = { path: [4, 5, 6], stations: [4, 6], names: { 4: '우리집앞역', 6: '가나' } };
  const names = nameStations({ design, ...toy });
  assert.equal(names[0].name, '우리집앞');
  assert.equal(names[0].source, '직접');
  // 고친 이름("가나")은 다른 역이 먼저 가져가지 못한다
  assert.equal(names[1].name, '가나');
});

test('저절로 짓기를 끄면 "새 역 n"으로 부르고, 고친 이름과 갈아타는 역은 그대로다', () => {
  const design = { path: [4, 5, 6, 7], stations: [4, 5, 7], names: { 7: '끝' } };
  const names = nameStations({ design, ...toy, auto: false });
  assert.deepEqual(
    names.map((n) => n.name),
    ['새 역 1', '서면', '끝'],
  );
});

test('같은 설계는 늘 같은 이름', () => {
  const design = { path: [0, 1, 2, 3, 7, 11], stations: [0, 3, 11] };
  assert.deepEqual(nameStations({ design, ...toy }), nameStations({ design, ...toy }));
});

test('실제 부산 자료로 지으면 알아볼 만한 이름이 나온다', () => {
  const grid = readJson('data/build/grid.json');
  const stations = readJson('data/build/stations.json').stations.filter((s) => s.inGrid);
  const existing = stations.map((s) => ({ name: s.name, cell: s.row * grid.cols + s.col }));
  const dongs = readJson('data/build/dongs.json').dongs;
  const byId = new Map(stations.map((s) => [s.id, s]));
  const byCode = new Map(dongs.map((d) => [d.code, d]));
  const places = readJson('src/content/places.json')
    .places.map((p) => {
      const anchor = p.at.station ? byId.get(p.at.station) : byCode.get(p.at.dong);
      return { name: p.name, x: anchor?.x, y: anchor?.y };
    })
    .filter((p) => Number.isFinite(p.x));

  // 명지 중심지 칸 근처에 역 하나, 노포역 칸에 역 하나
  const myeongji = places.find((p) => p.name === '명지');
  const cellOf = (x, y) => Math.floor(y) * grid.cols + Math.floor(x);
  const nopo = stations.find((s) => s.name === '노포');
  const a = cellOf(myeongji.x, myeongji.y);
  const b = nopo.row * grid.cols + nopo.col;
  const names = nameStations({ design: { path: [a, b], stations: [a, b] }, cols: grid.cols, existing, dongs, places });
  assert.equal(names[0].name, '명지');
  assert.equal(names[1].name, '노포');
  assert.equal(names[1].source, '갈아타는 역');
  // 이름에 숫자 동 표기나 "역"이 남지 않는다
  for (const { name } of names) assert.doesNotMatch(name, /\d동$|역$/);
});

test('역을 촘촘히 많이 놓아도 숫자가 붙지 않고 이름이 겹치지 않는다', () => {
  const grid = readJson('data/build/grid.json');
  const stations = readJson('data/build/stations.json').stations.filter((s) => s.inGrid);
  const existing = stations.map((s) => ({ name: s.name, cell: Math.floor(s.y) * grid.cols + Math.floor(s.x) }));
  const dongs = readJson('data/build/dongs.json').dongs;
  // 서면 둘레 가로 한 줄(열 15~34, 행 27)에 칸마다 역 20개
  const path = Array.from({ length: 20 }, (_, i) => 27 * grid.cols + 15 + i);
  const names = nameStations({ design: { path, stations: path }, cols: grid.cols, existing, dongs, places: [] });
  assert.equal(names.length, 20);
  for (const { name } of names) assert.doesNotMatch(name, /d/, `${name}에 숫자가 있어요`);
  const fresh = names.filter((n) => n.source !== '갈아타는 역').map((n) => n.name);
  assert.equal(new Set(fresh).size, fresh.length, '새 역끼리 이름이 겹쳐요');
  const taken = new Set(stations.map((s) => s.name));
  for (const name of fresh) assert.ok(!taken.has(name), `${name}은 이미 있는 역 이름이에요`);
});
