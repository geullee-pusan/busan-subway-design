// 시승 모드 안내 방송 테스트: 부산교통공사 열차안내방송의 실제 문장과 같은 모양인지 본다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { announcementLines, roOf, viaText } from '../src/sim/announce.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templates = JSON.parse(readFileSync(resolve(ROOT, 'src/content/announcements.json'), 'utf8'));

test('방송 틀에는 출처와 확인한 날짜가 있다', () => {
  assert.match(templates.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(templates.sources.length > 0);
  for (const source of templates.sources) assert.match(source.url, /^https:\/\/www\.humetro\.busan\.kr\//);
});

test('도착 방송: 1호선 서면역 실제 방송과 같은 문장이 된다', () => {
  // 실제: "이번 역은 서면, 서면역입니다. 내리실 문은 오른쪽입니다.
  //       양산이나 해운대 방면으로 가실 고객께서는 이번 역에서 2호선으로 갈아타시기 바랍니다."
  const lines = announcementLines(templates, {
    type: '도착',
    name: '서면',
    transfers: [{ line: '2호선', via: ['양산', '해운대'] }],
  });
  assert.deepEqual(lines, [
    '이번 역은 서면, 서면역입니다.',
    '내리실 문은 오른쪽입니다.',
    '양산이나 해운대 방면으로 가실 고객께서는 이번 역에서 2호선으로 갈아타시기 바랍니다.',
  ]);
});

test('종착 방송: 1호선 노포역 실제 방송과 같은 문장이 된다', () => {
  const lines = announcementLines(templates, { type: '종착', name: '노포', place: '종합버스터미널' });
  assert.deepEqual(lines, [
    '이번 역은 이 열차의 마지막 역인 노포, 노포역입니다.',
    '내리실 문은 오른쪽입니다.',
    // 실제 노포역은 '종합버스터미널에'라고 하지만, 다른 역(청맥병원으로, 한국건강관리협회로)처럼 으로/로로 통일한다.
    '종합버스터미널로 가실 분은 이번 역에서 내리시기 바랍니다.',
    '내리실 때에는 두고 내리는 물건이 없는지 다시 한 번 살펴보시기 바랍니다.',
    '오늘도 도시철도를 이용해 주셔서 대단히 고맙습니다.',
    '안녕히 가십시오.',
  ]);
});

test('출발 방송: 1호선 다대포해수욕장역 실제 방송과 같은 문장이 된다', () => {
  // 실제: "고객 여러분 안녕하십니까. 이 열차는 노포, 노포행 열차입니다.
  //       서면이나, 연산방면으로 가실 고객께서는 이 열차를 이용하시기 바랍니다. 열차가 곧 출발합니다."
  const lines = announcementLines(templates, { type: '출발', name: '다대포해수욕장', end: '노포', via: ['서면', '연산'] });
  assert.deepEqual(lines, [
    '고객 여러분 안녕하십니까. 이 열차는 노포, 노포행 열차입니다.',
    '서면이나 연산 방면으로 가실 고객께서는 이 열차를 이용하시기 바랍니다.',
    '열차가 곧 출발합니다.',
  ]);
});

test('이름 끝의 "역"은 한 번만 쓰고, 받침에 맞춰 이나/나, 으로/로를 붙인다', () => {
  assert.equal(announcementLines(templates, { type: '도착', name: '하단역' })[0], '이번 역은 하단, 하단역입니다.');
  assert.equal(viaText(['해운대', '수영']), '해운대나 수영');
  assert.equal(viaText(['연산', '서면']), '연산이나 서면');
  assert.equal(viaText(['명지']), '명지');
  assert.equal(roOf('2호선'), '으로');
  assert.equal(roOf('부산김해경전철'), '로');
  assert.equal(roOf('해운대'), '로');
});

test('지나는 역이 없으면 끝 역을 방면으로 쓴다', () => {
  const lines = announcementLines(templates, { type: '출발', name: '하단', end: '명지역' });
  assert.equal(lines[0], '고객 여러분 안녕하십니까. 이 열차는 명지, 명지행 열차입니다.');
  assert.equal(lines[1], '명지 방면으로 가실 고객께서는 이 열차를 이용하시기 바랍니다.');
});
