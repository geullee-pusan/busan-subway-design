// npm run validate: data/build/의 게임용 JSON을 원본(data/raw/)과 대조해 검사한다.
// 반드시 통과해야 하는 검사가 하나라도 실패하면 종료 코드 1을 돌려준다.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { metersBetween, normalizeName } from './build/network.mjs';
import { readTrains, summarizeService } from './build/service.mjs';
import { readCsv, toNumber } from './lib/csv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(ROOT, p);
const readJson = (p) => JSON.parse(readFileSync(at(p), 'utf8'));

const results = [];
/** level: 'must'(반드시 통과) 또는 'check'(참고 검사). ok: true, false, null(자료 없음으로 건너뜀) */
function report(level, title, ok, details = []) {
  results.push({ level, title, ok, details });
}

const { stations } = readJson('data/build/stations.json');
const { lines } = readJson('data/build/lines.json');
const { links } = readJson('data/build/links.json');
const { transfers } = readJson('data/build/transfers.json');
const grid = readJson('data/build/grid.json');

// 0. 원본 파일이 raw-lock.json의 해시와 같은가
{
  const lock = readJson('data/raw-lock.json');
  const bad = [];
  for (const [key, entry] of Object.entries(lock)) {
    if (!existsSync(at(entry.file))) {
      bad.push(`${key}: 파일이 없어요 (${entry.file}). npm run fetch로 받아요.`);
      continue;
    }
    const hash = createHash('sha256').update(readFileSync(at(entry.file))).digest('hex');
    if (hash !== entry.sha256) bad.push(`${key}: 해시가 달라요`);
  }
  report('must', `원본 파일 ${Object.keys(lock).length}개가 받은 그대로다`, bad.length === 0, bad);
}

// 1. 모든 역에 좌표가 있는가
{
  const bad = stations.filter((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || !Number.isFinite(s.x) || !Number.isFinite(s.y));
  const outside = stations.filter((s) => !s.inGrid);
  const outsideNotDH = outside.filter((s) => s.line !== 'DH');
  report(
    'must',
    `모든 역(${stations.length}개)에 좌표가 있다`,
    bad.length === 0 && outsideNotDH.length === 0,
    [
      ...bad.map((s) => `좌표 없음: ${s.id} ${s.name}`),
      ...outsideNotDH.map((s) => `격자 밖: ${s.id} ${s.name}`),
      `격자 밖 동해선 역 ${outside.length - outsideNotDH.length}개(울산 방향, 지도 밖 화살표로 표시할 구간): ${outside
        .filter((s) => s.line === 'DH')
        .map((s) => s.name)
        .join(', ')}`,
    ],
  );
}

// 2. 노선 연결 그래프가 끊기지 않았는가
{
  const details = [];
  let ok = true;
  for (const line of lines) {
    const own = links.filter((l) => l.line === line.id);
    const pathOk =
      own.length === line.stations.length - 1 && own.every((l, i) => l.from === line.stations[i] && l.to === line.stations[i + 1]);
    if (!pathOk) {
      ok = false;
      details.push(`${line.name}: 역 순서와 구간이 맞지 않아요`);
    }
  }
  // 구간과 환승으로 모든 역이 이어지는가
  const adj = new Map(stations.map((s) => [s.id, []]));
  for (const l of links) {
    adj.get(l.from).push(l.to);
    adj.get(l.to).push(l.from);
  }
  for (const t of transfers) {
    for (const a of t.stations) for (const b of t.stations) if (a !== b) adj.get(a).push(b);
  }
  const seen = new Set([stations[0].id]);
  const queue = [stations[0].id];
  while (queue.length) for (const n of adj.get(queue.shift())) if (!seen.has(n)) seen.add(n) && queue.push(n);
  const cut = stations.filter((s) => !seen.has(s.id));
  if (cut.length) {
    ok = false;
    details.push(`다른 노선과 이어지지 않은 역 ${cut.length}개: ${[...new Set(cut.map((s) => s.line))].join(', ')}호선`);
  }
  details.push(`노선 ${lines.length}개, 환승역 ${transfers.length}곳: ${transfers.map((t) => t.name).join(', ')}`);
  report('must', '노선 연결 그래프가 끊기지 않는다', ok, details);
}

// 3. 역 사이 시간의 합이 시각표의 전 구간 소요시간과 ±5% 안인가
{
  const trains = readTrains(at('data/raw/datagokr/15082980.csv'));
  const name = (id) => stations.find((s) => s.id === id).name;
  const summary = summarizeService(
    trains,
    lines.filter((l) => ['1', '2', '3', '4'].includes(l.id)).map((l) => ({ id: l.id, order: l.stations.map(name) })),
  );
  const details = [];
  let ok = true;
  for (const s of summary) {
    // 역 사이 시간 = 주행시간(3033564) + 중간역 정차시간(표정속도로 계산한 노선 평균)
    const line = lines.find((l) => l.id === s.line);
    const run = links.filter((l) => l.line === s.line).reduce((t, l) => t + l.runS, 0);
    const sum = (run + line.dwellS * (line.stations.length - 2)) / 60;
    const tt = s.directions.map((d) => d.endToEndMin.median).filter((x) => x !== null);
    if (tt.length === 0) {
      ok = false;
      details.push(`${s.line}호선: 시각표에서 전 구간 열차를 찾지 못했어요`);
      continue;
    }
    const ref = tt.reduce((a, b) => a + b, 0) / tt.length;
    const diff = ((sum - ref) / ref) * 100;
    if (Math.abs(diff) > 5) ok = false;
    details.push(
      `${s.line}호선: 주행 ${(run / 60).toFixed(1)}분 + 정차 ${line.dwellS}초 × ${line.stations.length - 2}역 = ${sum.toFixed(1)}분, 시각표 ${s.directions.map((d) => `${d.from}→${d.to} ${d.endToEndMin.median}분`).join(', ')} → 차이 ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`,
    );
  }
  for (const line of lines.filter((l) => !['1', '2', '3', '4'].includes(l.id))) {
    details.push(`${line.name}: 비교할 시각표 자료 없음 (${line.runSource ?? '역 사이 시간 없음'})`);
  }
  report('must', '역 사이 시간의 합이 노선 전 구간 소요시간과 ±5% 안이다 (1~4호선)', ok, details);
}

// 4. 칸에 나눈 인구 합계가 공식 부산 인구와 맞는가
{
  const rows = readCsv(at('data/raw/datagokr/15097972.csv')).records.filter((r) => r['행정기관코드'].startsWith('26'));
  const official = rows.reduce((s, r) => s + toNumber(r['계']), 0);
  const inGrid = grid.populationBusan.flat().reduce((s, n) => s + n, 0);
  const all = grid.population.flat().reduce((s, n) => s + n, 0);
  const cellsOk = grid.population.every((row, r) => row.every((n, c) => n >= grid.populationBusan[r][c]));
  report('must', '칸에 나눈 부산 인구 합계가 공식 부산 인구와 같다', official === inGrid && cellsOk, [
    `공식(행정안전부 2026-08, 부산 ${rows.length}개 행정동 합): ${official.toLocaleString()}명`,
    `격자 안 부산 인구: ${inGrid.toLocaleString()}명`,
    `격자 안 전체 인구(양산·김해 등 포함): ${all.toLocaleString()}명`,
  ]);
}

// 5. 역이 바다나 강 칸에 있지 않은가
{
  const wet = stations.filter((s) => s.inGrid && ['sea', 'river'].includes(grid.terrain[s.row][s.col]));
  const mountain = stations.filter((s) => s.inGrid && grid.terrain[s.row][s.col] === 'mountain');
  report('must', '역이 바다나 강 칸에 있지 않다', wet.length === 0, [
    ...wet.map((s) => `${s.name}(${s.line}) → ${grid.terrain[s.row][s.col]} 칸 (${s.col}, ${s.row})`),
    `산 칸에 있는 역: ${mountain.length ? mountain.map((s) => s.name).join(', ') : '없음'}`,
  ]);
}

// 6. 행정동 코드가 경계 자료와 인구 자료에서 모두 짝지어지는가 (부산)
{
  const text = readFileSync(at('data/raw/admdongkor/HangJeongDong_ver20260701.geojson'), 'utf8');
  const boundary = new Set([...text.matchAll(/"adm_cd2": "(26\d{8})"/g)].map((m) => m[1]));
  const population = new Set(
    readCsv(at('data/raw/datagokr/15097972.csv'))
      .records.map((r) => r['행정기관코드'])
      .filter((c) => c.startsWith('26')),
  );
  const onlyB = [...boundary].filter((c) => !population.has(c));
  const onlyP = [...population].filter((c) => !boundary.has(c));
  report('must', '부산 행정동 코드가 경계(2026-07판)와 인구(2026-08) 자료에서 모두 짝지어진다', onlyB.length === 0 && onlyP.length === 0, [
    `경계 ${boundary.size}개, 인구 ${population.size}개`,
    ...onlyB.map((c) => `경계에만 있음: ${c}`),
    ...onlyP.map((c) => `인구에만 있음: ${c}`),
  ]);
}

// 7. 1~4호선 좌표가 두 출처(부산교통공사 15043686, 국가철도공단 15041165~8)에서 300m 안인가
{
  const files = { 1: '15041165', 2: '15041166', 3: '15041167', 4: '15041168' };
  const details = [];
  let far = 0;
  let matched = 0;
  for (const [line, id] of Object.entries(files)) {
    const krna = readCsv(at(`data/raw/datagokr/${id}.csv`)).records;
    for (const s of stations.filter((x) => x.line === line)) {
      const k = krna.find((r) => normalizeName(r['역명']) === normalizeName(s.name));
      if (!k) {
        details.push(`${line}호선 ${s.name}: 국가철도공단 파일에 같은 이름이 없어요`);
        continue;
      }
      matched++;
      const d = metersBetween(s, { lat: Number(k['위도']), lon: Number(k['경도']) });
      if (d > 300) {
        far++;
        details.push(`${line}호선 ${s.name}: ${Math.round(d)}m 차이`);
      }
    }
  }
  details.unshift(`이름으로 짝지은 역 ${matched}개, 300m 넘게 차이 나는 역 ${far}개`);
  report('check', '1~4호선 좌표가 두 출처에서 300m 안이다', far === 0, details);
}

// 8. 역마다 이용객 자료와 개통일이 있는가
{
  const ridership = readJson('data/build/ridership.json');
  const info = readJson('data/build/station-info.json').stations;
  const schematic = readJson('data/build/schematic.json');
  const details = [];

  const noRidership = stations.filter((s) => !ridership.stations[s.id]);
  const unexplained = noRidership.filter((s) => !ridership.missing.some((m) => m.id === s.id));
  details.push(`이용객 자료가 있는 역 ${Object.keys(ridership.stations).length}개, 없는 역 ${noRidership.length}개(모두 까닭을 적음)`);
  for (const m of ridership.missing.filter((m) => m.reason !== '자료 없음')) details.push(`${m.name}(${m.line}): ${m.reason}`);
  const noOpening = stations.filter((s) => !info[s.id]?.openedOn);
  const noPosition = stations.filter((s) => !schematic.positions[s.id]);
  report(
    'must',
    '모든 역에 개통일과 노선도 좌표가 있고, 이용객이 없는 역은 까닭이 적혀 있다',
    unexplained.length === 0 && noOpening.length === 0 && noPosition.length === 0,
    [
      ...details,
      ...unexplained.map((s) => `까닭 없이 이용객 자료가 없어요: ${s.id} ${s.name}`),
      ...noOpening.map((s) => `개통일이 없어요: ${s.id} ${s.name}`),
      ...noPosition.map((s) => `노선도 좌표가 없어요: ${s.id} ${s.name}`),
    ],
  );
}

// 9. 구·군 경계선이 있는가
{
  const districts = readJson('data/build/districts.json');
  const busan = districts.districts.filter((d) => d.name.startsWith('부산광역시'));
  report('check', '구·군 경계선과 해안선이 있다', busan.length === 16 && districts.boundaries.length > 0, [
    `구·군 ${districts.districts.length}곳(부산 ${busan.length}곳), 경계선 ${districts.boundaries.length}개, 해안선 ${districts.coastline.length}개`,
  ]);
}

// 10. 격자 배열 크기
{
  const keys = ['terrain', 'population', 'populationBusan', 'elevationM', 'slopeDeg', 'district'];
  const bad = keys.filter((k) => grid[k].length !== grid.rows || grid[k].some((row) => row.length !== grid.cols));
  report('must', `격자 배열이 모두 ${grid.cols} × ${grid.rows}칸이다`, bad.length === 0, bad.map((k) => `크기가 다름: ${k}`));
}

// 11. 앞으로 생길 노선(Phase 5)
{
  const future = readJson('data/build/future-lines.json');
  const planned = Object.fromEntries(readJson('data/facts.json').planned.map((line) => [line.id, line]));
  const details = [];
  let ok = future.lines.length > 0;
  for (const line of future.lines) {
    const fact = planned[line.id];
    const meters = future.links.filter((l) => l.line === line.id).reduce((sum, l) => sum + l.distanceM, 0);
    const sameCount = fact && line.stations.length === fact.stations;
    const sameLength = fact && Math.abs(meters - fact.lengthKm * 1000) <= 5;
    if (!sameCount || !sameLength) ok = false;
    details.push(
      `${line.name}: ${line.stations.length}역(발표 ${fact?.stations ?? '?'}), 이어 붙인 거리 ${(meters / 1000).toFixed(2)}km(발표 ${fact?.lengthKm ?? '?'}km)`,
    );
  }
  const outside = future.stations.filter((station) => !station.inGrid).map((station) => station.id);
  details.push(outside.length ? `격자 밖 역: ${outside.join(', ')}` : '모든 역이 격자 안에 있다');
  report('must', '앞으로 생길 노선의 역 수와 길이가 공식 발표와 같다', ok, details);
}

// 12. 교육과정 성취기준 원문(Phase 5)
{
  const standards = readJson('data/standards.json');
  const used = new Set();
  for (const mission of readJson('src/content/missions.json').missions) for (const code of mission.standards) used.add(code);
  for (const code of readFileSync(new URL('../docs/SPEC.md', import.meta.url), 'utf8').match(/4(?:사|수)\d{2}-\d{2}/g) ?? [])
    used.add(code);
  const missing = [...used].filter((code) => !standards.standards[code] || standards.standards[code].text.includes('TODO'));
  report('must', '과제 카드와 SPEC이 가리키는 성취기준에 원문이 있다', missing.length === 0, [
    `쓰는 성취기준 ${used.size}개, 원문을 적어 둔 것 ${Object.keys(standards.standards).length}개(${standards.checked} 대조)`,
    ...missing.map((code) => `원문 없음: ${code}`),
  ]);
}

// 13. 게임 안 출처 목록(Phase 6)
{
  const sources = readJson('src/content/sources.json');
  const lock = readJson('data/raw-lock.json');
  const problems = [];
  let count = 0;
  for (const group of sources.groups) {
    for (const item of group.items) {
      count += 1;
      for (const key of ['what', 'from', 'when', 'license']) {
        if (!item[key]) problems.push(`${group.title}/${item.what ?? '?'}: ${key}가 없다`);
      }
      if (item.lockKey && !lock[item.lockKey]) problems.push(`${item.what}: raw-lock에 ${item.lockKey}가 없다`);
      const text = JSON.stringify(item);
      if (/https?:\/\//.test(text.replace('openstreetmap.org/copyright', ''))) {
        problems.push(`${item.what}: 배포물에 바깥 주소를 넣지 않는다`);
      }
    }
  }
  report('must', '게임 안 출처 목록이 빠짐없이 적혀 있다', problems.length === 0, [
    `출처 ${count}개, 묶음 ${sources.groups.length}개`,
    ...problems,
  ]);
}

// 결과 출력
let failed = 0;
for (const r of results) {
  const mark = r.ok === true ? '통과' : r.ok === false ? (r.level === 'must' ? '실패' : '주의') : '건너뜀';
  if (r.ok === false && r.level === 'must') failed++;
  console.log(`[${mark}] ${r.title}`);
  for (const d of r.details) console.log(`        ${d}`);
}
console.log(failed ? `\n반드시 통과할 검사 ${failed}개가 실패했어요.` : '\n반드시 통과할 검사를 모두 통과했어요.');
process.exitCode = failed ? 1 : 0;
