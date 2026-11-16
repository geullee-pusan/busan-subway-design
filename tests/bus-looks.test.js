// 버스 칠(src/ui/bus-looks.js): 시·군과 노선 종류에 맞는 칠을 고르고, 모든 칠에 출처가 있다.
// 게임 자료 JSON을 함께 읽어야 해서 vite로 불러온다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let looks;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  looks = await server.ssrLoadModule('/src/ui/bus-looks.js');
});
after(() => server?.close());

test('노선 이름을 도시와 번호로 나눈다', () => {
  assert.deepEqual(looks.splitRoute('대구 503'), ['대구', '503']);
  assert.deepEqual(looks.splitRoute('1000(급행)'), ['부산', '1000(급행)']);
});

test('부산 급행과 일반은 칠과 차체가 다르다', () => {
  const fast = looks.busLookOf('1000(급행)');
  const normal = looks.busLookOf('86');
  assert.notEqual(fast.lower, normal.lower);
  assert.equal(fast.vehicle, 'coach');
});

test('모든 칠은 색 형식이 맞고 출처가 있다', () => {
  const file = JSON.parse(readFileSync(new URL('../data/build/bus-looks.json', import.meta.url), 'utf8'));
  for (const [city, e] of Object.entries(file.cities)) {
    for (const t of [...e.types, e.default].filter(Boolean)) {
      if (!t.lower) continue;
      assert.match(t.lower, /^#[0-9A-Fa-f]{6}$/, city);
      assert.ok(t.source, `${city} ${t.type}`);
    }
  }
});

test('자료가 없는 도시는 게임 기본 칠을 쓴다', () => {
  assert.equal(looks.busLookOf('없는곳 1').lower, looks.DEFAULT_BUS_LOOK.lower);
});

test('고속·시외버스: 같은 배차는 늘 같은 회사 칠이고, 노선에 다니는 회사에서 고른다', async () => {
  const coach = await server.ssrLoadModule('/src/ui/coach-looks.js');
  const file = JSON.parse(readFileSync(new URL('../data/build/coach-looks.json', import.meta.url), 'utf8'));
  const [key, ids] = Object.entries(file.routes)[0];
  const [, from, to, kind] = /^(.+)→(.+) (고속|시외)$/.exec(key);
  const a = coach.coachLookOf({ kind, fromName: from, toName: to, grade: '우등', dep: 600 });
  const b = coach.coachLookOf({ kind, fromName: from, toName: to, grade: '우등', dep: 600 });
  assert.deepEqual(a, b);
  assert.ok(ids.includes(a.company), `${key}: ${a.company}`);
  for (const [id, c] of Object.entries(file.companies)) {
    assert.match(c.lower, /^#[0-9A-Fa-f]{6}$/, id);
    assert.ok(c.source, id);
  }
  assert.ok(!JSON.stringify(file).includes('http'), '배포물에 바깥 주소를 넣지 않는다');
});
