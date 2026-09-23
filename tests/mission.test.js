// 과제 카드, 교육과정 성취기준, 앞으로 생길 노선 테스트(docs/SPEC.md 4장·8장, Phase 5)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

const { missions } = read('src/content/missions.json');
const standardsFile = read('data/standards.json');
const standards = standardsFile.standards;
const facts = read('data/facts.json');
const grid = read('data/build/grid.json');
const future = read('data/build/future-lines.json');
const stations = read('data/build/stations.json').stations;

test('SPEC 8장의 과제 카드가 모두 있다', () => {
  // 7번(1985년의 부산)은 옛날 노선망 자료가 필요해서 Phase 6에서 만든다.
  assert.deepEqual(
    missions.map((m) => m.number),
    [1, 2, 3, 4, 5, 6, 8],
  );
  assert.equal(new Set(missions.map((m) => m.id)).size, missions.length);
});

test('과제 카드에는 상황, 질문, 예산, 기준 연도가 있다', () => {
  for (const mission of missions) {
    assert.ok(mission.situation.length > 0, `${mission.number}번에 상황이 없다`);
    assert.match(mission.question, /\?$/, `${mission.number}번 질문은 물음표로 끝나야 한다`);
    assert.ok(mission.budget100M > 0);
    assert.ok([2026, 2027].includes(mission.baseYear));
    assert.ok(['평일', '토요일', '일요일'].includes(mission.dayType));
    assert.ok(mission.hint.length > 0);
  }
});

test('과제 카드의 시작 자리는 격자 안이다', () => {
  for (const mission of missions) {
    assert.ok(mission.focus.col >= 0 && mission.focus.col < grid.cols, `${mission.number}번 열이 격자 밖이다`);
    assert.ok(mission.focus.row >= 0 && mission.focus.row < grid.rows, `${mission.number}번 행이 격자 밖이다`);
  }
});

test('과제 카드의 문장은 아이 말(~해요체)이다', () => {
  for (const mission of missions) {
    for (const line of [...mission.situation, mission.hint]) {
      assert.match(line, /(요|에요|예요)[.?]$/, `"${line}"는 ~해요체여야 한다`);
    }
  }
});

test('과제 카드가 가리키는 성취기준은 원문이 있다', () => {
  for (const mission of missions) {
    for (const code of mission.standards) {
      const standard = standards[code];
      assert.ok(standard, `${code}의 원문이 data/standards.json에 없다`);
      assert.ok(standard.text.length > 0);
      assert.ok(!standard.text.includes('TODO'), `${code}가 아직 확인되지 않았다`);
      assert.ok(['사회', '수학'].includes(standard.subject));
    }
  }
});

test('성취기준 코드는 2022 개정 교육과정 꼴이다', () => {
  for (const [code, standard] of Object.entries(standards)) {
    assert.match(code, /^4(사|수)\d{2}-\d{2}$/, `${code}는 성취기준 코드 꼴이 아니다`);
    assert.equal(code.startsWith('4사'), standard.subject === '사회');
    assert.match(standard.text, /다\.$/, `${code} 원문이 "~다."로 끝나지 않는다`);
  }
  assert.equal(standardsFile.checked, '2026-09-23');
  assert.ok(standardsFile.source.name.includes('NCIC'));
});

test('SPEC 4장에 적은 성취기준은 모두 원문이 있다', () => {
  const spec = readFileSync(resolve(ROOT, 'docs/SPEC.md'), 'utf8');
  const codes = new Set(spec.match(/4(?:사|수)\d{2}-\d{2}/g) ?? []);
  assert.ok(codes.size >= 20);
  for (const code of codes) assert.ok(standards[code], `SPEC이 가리키는 ${code}의 원문이 없다`);
});

test('앞으로 생길 노선은 공식 발표와 역 수·길이가 같다', () => {
  const planned = Object.fromEntries(facts.planned.map((line) => [line.id, line]));
  for (const line of future.lines) {
    const fact = planned[line.id];
    assert.ok(fact, `${line.id}가 data/facts.json에 없다`);
    assert.equal(line.stations.length, fact.stations, `${line.name}의 역 수가 공식 발표와 다르다`);
    assert.equal(line.lengthKm, fact.lengthKm, `${line.name}의 길이가 공식 발표와 다르다`);
    assert.ok(fact.sources.length > 0);
  }
  // 하단–녹산선은 아직 자리가 없어서 지도에 넣지 않는다(과제 5의 견주기 대상으로만 쓴다).
  assert.deepEqual(
    future.lines.map((line) => line.id),
    ['YS', 'SH'],
  );
});

test('앞으로 생길 노선의 역 사이 거리 합이 공식 길이와 같다', () => {
  for (const line of future.lines) {
    const meters = future.links
      .filter((link) => link.line === line.id)
      .reduce((sum, link) => sum + link.distanceM, 0);
    const officialM = line.lengthKm * 1000;
    assert.ok(
      Math.abs(meters - officialM) <= 5,
      `${line.name}: 이어 붙인 거리 ${meters}m가 공식 길이 ${officialM}m와 다르다`,
    );
  }
});

test('앞으로 생길 노선의 구간과 역이 이어져 있다', () => {
  const ids = new Set(future.stations.map((s) => s.id));
  for (const line of future.lines) {
    const links = future.links.filter((link) => link.line === line.id);
    assert.equal(links.length, line.stations.length - 1);
    for (const link of links) {
      assert.ok(ids.has(link.from) && ids.has(link.to));
      assert.ok(link.runS > 0);
    }
  }
  for (const station of future.stations) {
    assert.ok(station.coordSource.length > 0, `${station.id}에 좌표 출처가 없다`);
  }
});

test('앞으로 생길 노선은 이미 있는 역에서 갈아탄다', () => {
  const ids = new Set(stations.map((s) => s.id));
  const futureIds = new Set(future.stations.map((s) => s.id));
  assert.ok(future.transfers.length > 0);
  for (const transfer of future.transfers) {
    assert.ok(transfer.stations.length >= 2);
    assert.ok(
      transfer.stations.some((id) => futureIds.has(id)),
      `${transfer.name}에 새 역이 없다`,
    );
    assert.ok(
      transfer.stations.some((id) => ids.has(id)),
      `${transfer.name}에 이미 있는 역이 없다`,
    );
    for (const id of transfer.stations) assert.ok(ids.has(id) || futureIds.has(id), `${id}를 찾을 수 없다`);
  }
});
