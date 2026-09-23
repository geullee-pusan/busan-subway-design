// 로마자 표기 테스트(국어의 로마자 표기법)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { romanize } from '../src/sim/romanize.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('로마자 표기: 표기법에 실린 소리 규칙', () => {
  const cases = {
    서면: 'Seomyeon',
    하단: 'Hadan',
    해운대: 'Haeundae',
    신라: 'Silla', // 유음화
    종로: 'Jongno', // ㅇ + ㄹ → n
    왕십리: 'Wangsimni', // ㅂ + ㄹ → m + n
    독립문: 'Dongnimmun', // 비음화
    백마: 'Baengma', // ㄱ + ㅁ → ng
    별내: 'Byeollae', // ㄹ + ㄴ → ll
    설악: 'Seorak', // 연음
    묵호: 'Mukho', // 이름에서는 ㅎ을 밝혀 적는다
    라온: 'Raon', // 낱말 첫 ㄹ
    '새 역 3': 'Sae Yeok 3',
  };
  for (const [korean, roman] of Object.entries(cases)) assert.equal(romanize(korean), roman, korean);
});

test('로마자 표기: 부산 역 이름 가운데 소리대로 적은 공식 영어 이름과 거의 다 같다', { skip: !existsSync(resolve(ROOT, 'data/build/stations.json')) }, () => {
  const stations = JSON.parse(readFileSync(resolve(ROOT, 'data/build/stations.json'), 'utf8')).stations;
  const norm = (text) => text.toLowerCase().replace(/[^a-z]/g, '');
  const pairs = new Map();
  for (const s of stations) if (s.nameEn && /^[가-힣]+$/.test(s.name) && !pairs.has(s.name)) pairs.set(s.name, s.nameEn);
  let same = 0;
  for (const [name, en] of pairs) if (norm(romanize(name)) === norm(en)) same += 1;
  // 다른 것은 뜻으로 옮긴 이름(Dadaepo Beach, City Hall)이나 예전 표기(Dongeui)다.
  assert.ok(same / pairs.size >= 0.85, `${same}/${pairs.size}`);
});
