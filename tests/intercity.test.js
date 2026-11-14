// 고속·시외버스(걸어서 여행하기) 계산과 자료
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hasRestStop, nextDepartures, servesKind } from '../src/sim/intercity.js';
import { terminalBase } from '../scripts/lib/terminals.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('터미널 이름의 기본형: 꼬리와 괄호를 뗀다', () => {
  assert.equal(terminalBase('밀양시외버스터미널'), '밀양');
  assert.equal(terminalBase('부산서부(사상)'), '부산서부');
  assert.equal(terminalBase('순천종합버스터미널'), '순천');
  assert.equal(terminalBase('보성공용터미널'), '보성');
});

test('다음 출발: 갈 곳마다 지금 뒤로 가장 먼저 떠나는 버스', () => {
  const data = {
    grades: ['일반', '우등'],
    terminals: [{}, {}, {}],
    routes: [
      [0, 1, '고속', [[360, 180, 20000, 1], [600, 180, 20000, 0], [900, 180, 20000, 1]]],
      [0, 2, '고속', [[400, 60, 8000, 0]]],
      [0, 2, '시외', [[610, 70, 7000, 0]]],
      [1, 0, '고속', [[500, 180, 20000, 0]]],
    ],
  };
  const list = nextDepartures(data, 0, '고속', 500);
  assert.deepEqual(list.map((d) => [d.to, d.dep, d.grade, d.later]), [[1, 600, '일반', 1]]);
  assert.equal(nextDepartures(data, 0, '고속', 1000).length, 0);
  assert.ok(servesKind(data, 0, '시외'));
  assert.ok(!servesKind(data, 1, '시외'));
  assert.ok(hasRestStop(150) && !hasRestStop(90));
});

test('받은 배차: 터미널은 지도 안, 시각과 걸리는 시간이 말이 된다', { skip: existsSync(resolve(ROOT, 'data/build/intercity.json')) ? false : 'npm run intercity-build를 먼저 돌려요' }, () => {
  const data = JSON.parse(readFileSync(resolve(ROOT, 'data/build/intercity.json'), 'utf8'));
  const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
  for (const t of data.terminals) assert.ok(t.x >= 0 && t.y >= 0 && t.x < grid.cols && t.y < grid.rows, t.name);
  for (const [from, to, kind, trips] of data.routes) {
    assert.notEqual(from, to);
    assert.ok(['고속', '시외'].includes(kind));
    const km = Math.hypot(data.terminals[from].x - data.terminals[to].x, data.terminals[from].y - data.terminals[to].y);
    for (const [dep, dur, fare] of trips) {
      assert.ok(dep >= 0 && dep < 1440, `${dep}`);
      assert.ok(dur > 0 && dur < 12 * 60, `${data.terminals[from].name}→${data.terminals[to].name} ${dur}분`);
      // 곧게 잰 거리보다 빨리 갈 수는 없다(시속 120km를 넘지 않는다)
      assert.ok(km / (dur / 60) < 120, `${data.terminals[from].name}→${data.terminals[to].name} ${km.toFixed(0)}km를 ${dur}분`);
      assert.ok(fare === null || (fare > 0 && fare < 100000));
    }
  }
});
