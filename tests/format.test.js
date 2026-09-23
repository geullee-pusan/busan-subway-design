import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countText,
  dateText,
  distanceText,
  durationText,
  exactCount,
  moneyBlocks,
  moneyText,
  roParticle,
  roundedCount,
  yearText,
} from '../src/ui/format.js';

test('큰 수: 기본 모드는 어림수로 쓴다', () => {
  assert.equal(roundedCount(42380), '약 4만 2천 명');
  assert.equal(roundedCount(35809), '약 3만 6천 명');
  assert.equal(roundedCount(40000), '약 4만 명');
  assert.equal(roundedCount(9335), '약 9천 3백 명');
  assert.equal(roundedCount(1120), '약 1천 1백 명');
  assert.equal(roundedCount(2000), '약 2천 명');
  assert.equal(roundedCount(9985), '약 1만 명');
  assert.equal(roundedCount(950), '950명');
  assert.equal(roundedCount(0), '0명');
});

test('큰 수: 진짜 숫자 모드는 쉼표를 넣는다', () => {
  assert.equal(exactCount(42380), '42,380명');
  assert.equal(countText(42380, '진짜 숫자'), '42,380명');
  assert.equal(countText(42380), '약 4만 2천 명');
});

test('시간은 "2분 20초" 꼴로 쓴다', () => {
  assert.equal(durationText(140), '2분 20초');
  assert.equal(durationText(40), '40초');
  assert.equal(durationText(180), '3분');
  assert.equal(durationText(0), '0초');
});

test('거리는 "1km 600m" 꼴로 쓴다', () => {
  assert.equal(distanceText(1600), '1km 600m');
  assert.equal(distanceText(600), '600m');
  assert.equal(distanceText(2000), '2km');
});

test('조사: 받침이 없거나 ㄹ이면 "로", 아니면 "으로"', () => {
  assert.equal(roParticle('2호선'), '으로');
  assert.equal(roParticle('동해선'), '으로');
  assert.equal(roParticle('부산김해경전철'), '로');
  assert.equal(roParticle('버스'), '로');
});

test('돈: 기본 모드는 어림수, 진짜 숫자 모드는 조와 억', () => {
  assert.equal(moneyText(11265, '진짜 숫자'), '1조 1,265억 원');
  assert.equal(moneyText(8360, '진짜 숫자'), '8,360억 원');
  assert.equal(moneyText(20000, '진짜 숫자'), '2조 원');
  assert.equal(moneyText(11265), '약 1조 1천억 원');
  assert.equal(moneyText(8360), '약 8천 4백억 원');
  assert.equal(moneyText(9000), '약 9천억 원');
  assert.equal(moneyText(295), '약 300억 원');
  assert.equal(moneyBlocks(11265), 113);
});

test('날짜는 연도와 긴 날짜로 쓴다', () => {
  assert.equal(yearText('1985-07-19'), '1985년');
  assert.equal(dateText('1985-07-19'), '1985년 7월 19일');
  assert.equal(yearText(null), null);
});
