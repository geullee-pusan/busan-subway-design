// 열차 시각표를 게임 자료로 만든다(data/build/trains.json). npm run rail 다음에 돌린다(npm run rail이 함께 부른다).
//
// 원본(npm run trains로 받아 둔 것)
//  - data/raw/korail/run-info-20261014.json: 코레일 열차운행정보. 2026-10-14(수) 하루 동안 지도 안 기차역마다 지나간 열차.
//  - data/raw/korail/tago-trains-20261021.json: TAGO 열차정보. 2026-10-21(수) 열차의 종류와 운임. 열차번호로 잇는다.
//  - data/raw/korail/run-plan-20261014.json(있으면): 운행계획. 열차마다 처음 출발역과 마지막 도착역(지도 밖이어도).
//  - data/raw/korail/tago-fares-20261020.json(있으면): 지도 안 역 쌍마다 열차별 어른 운임.
//  - data/facts.json의 trainKinds: 열차 종류별 사실(출처 있음). 화면에서 쓰도록 함께 담는다.
// 지도 안에서 두 역 넘게 서는 열차만 넣는다(통과하는 역은 뺀다). 광역전철(동해선 광역, 대경선)은 이 자료에 없다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runInfo = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/korail/run-info-20261014.json'), 'utf8'));
const tago = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/korail/tago-trains-20261021.json'), 'utf8'));
const rail = JSON.parse(readFileSync(resolve(ROOT, 'data/build/rail.json'), 'utf8'));
const optional = (file) => (existsSync(resolve(ROOT, file)) ? JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) : null);
const runPlan = optional('data/raw/korail/run-plan-20261014.json');
const tagoFares = optional('data/raw/korail/tago-fares-20261020.json');
const facts = JSON.parse(readFileSync(resolve(ROOT, 'data/facts.json'), 'utf8'));
const planByNo = new Map((runPlan?.plans ?? []).map((p) => [Number(p.trn_no), p]));
const key = (name) => String(name ?? '').replace(/\s+/g, '').replace(/[()]/g, '').replace(/역$/, '');
const issues = [];

/** 열차 종류 이름을 화면에 쓸 이름으로: KTX-산천(A-type), KTX-산천(B-type) → KTX-산천 */
// 운행계획의 역 이름. 수서역은 "S수서"처럼 앞에 S가 붙어 와서 뗀다.
const stationName = (name) => (name ? String(name).replace(/^S(?=[가-힣])/, '') : null);
const kindName = (grade) => String(grade).replace(/\((A|B)-type\)$/, '');
/** 2026-10-14 기준 하루 시작부터 분. 다음 날 새벽은 1440을 더한다. */
function minutesOf(text) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/.exec(text ?? '');
  if (!m) return null;
  const day = m[1].replace(/-/g, '') > runInfo.runDate ? 1440 : 0;
  return day + Number(m[2]) * 60 + Number(m[3]);
}

// 열차 종류와 운임(TAGO). 같은 번호가 여러 쌍에 나오면 처음 것.
const tagoByNo = new Map();
for (const pair of tago.pairs) {
  for (const t of pair.trains) {
    const no = Number(t.trainno);
    if (!tagoByNo.has(no)) tagoByNo.set(no, { kind: kindName(t.traingradename), grade: t.traingradename, fare: Number(t.adultcharge) || null, from: pair.fromName, to: pair.toName });
  }
}

const stationOf = new Map(rail.stations.map((s) => [key(s.name), s.id]));
const STOP = new Set(['01', '02', '05', '11']); // 시발, 정차, 종착, 여객취급
const byTrain = new Map();
let notOnMap = 0;
for (const list of Object.values(runInfo.runs)) {
  for (const r of list) {
    if (!STOP.has(r.stop_se_cd)) continue;
    const station = stationOf.get(key(r.stn_nm));
    if (!station) {
      notOnMap += 1;
      continue;
    }
    if (!byTrain.has(r.trn_no)) byTrain.set(r.trn_no, { no: Number(r.trn_no), line: r.mrnt_nm, direction: r.uppln_dn_se_cd, stops: [] });
    byTrain.get(r.trn_no).stops.push({ station, arr: minutesOf(r.trn_arvl_dt), dep: minutesOf(r.trn_dptre_dt), first: r.stop_se_cd === '01', last: r.stop_se_cd === '05' });
  }
}

const trains = [];
let oneStop = 0;
let noKind = 0;
for (const train of [...byTrain.values()].sort((a, b) => a.no - b.no)) {
  const stops = train.stops
    .filter((s, i, all) => all.findIndex((o) => o.station === s.station) === i)
    .sort((a, b) => (a.dep ?? a.arr) - (b.dep ?? b.arr));
  if (stops.length < 2) {
    oneStop += 1;
    continue;
  }
  const info = tagoByNo.get(train.no);
  if (!info) noKind += 1;
  trains.push({
    no: train.no,
    kind: info?.kind ?? null,
    line: train.line,
    stops: stops.map((s) => [s.station, s.arr, s.dep]),
    // 처음 출발역과 마지막 도착역(운행계획). 지도 밖 역일 수 있다(예: 서울).
    origin: stationName(planByNo.get(train.no)?.dptre_stn_nm),
    destination: stationName(planByNo.get(train.no)?.arvl_stn_nm),
    fromOrigin: stops[0].first,
    toTerminus: stops.at(-1).last,
  });
}
if (noKind) issues.push(`열차 종류를 TAGO에서 찾지 못한 열차 ${noKind}개: 종류를 "종류 모름"으로 둔다. TODO(확인 필요)`);

// 역마다 열차 종류별 하루 열차 수(정차 기준, 두 방향 합)
const perStation = {};
for (const t of trains) {
  for (const [station] of t.stops) {
    perStation[station] ??= {};
    const kind = t.kind ?? '종류 모름';
    perStation[station][kind] = (perStation[station][kind] ?? 0) + 1;
  }
}

// 역 쌍별 운임표: "A|B" → {byTrain: {열차번호: 어른 운임}, byKind: {종류: 가장 싼 어른 운임}}
const stationOfName = new Map(rail.stations.map((st) => [key(st.name), st.id]));
const fareTable = {};
for (const pair of tagoFares?.pairs ?? []) {
  const a = stationOfName.get(key(pair.fromName));
  const b = stationOfName.get(key(pair.toName));
  if (!a || !b) continue;
  const row = (fareTable[`${a}|${b}`] = { byTrain: {}, byKind: {} });
  for (const t of pair.trains) {
    if (!t.fare) continue;
    row.byTrain[t.no] = t.fare;
    const kind = kindName(t.grade);
    row.byKind[kind] = Math.min(row.byKind[kind] ?? Infinity, t.fare);
  }
}
if (!tagoFares) issues.push('역 쌍별 운임(tago-fares)이 없어요. node scripts/fetch-train-extras.mjs로 받아요.');
// 운임표에 없는 열차와 역 쌍
let noFare = 0;
for (const t of trains) {
  for (let i = 0; i < t.stops.length; i++) {
    for (let j = i + 1; j < t.stops.length; j++) {
      const row = fareTable[`${t.stops[i][0]}|${t.stops[j][0]}`];
      if (!row || (row.byTrain[t.no] === undefined && row.byKind[t.kind] === undefined)) noFare += 1;
    }
  }
}
if (tagoFares && noFare) issues.push(`운임을 찾지 못한 열차·역 쌍 ${noFare}개(화면에 "운임 모름").`);

// 열차 종류별 사실(출처는 data/facts.json): 화면에서 쓰는 값만
const kindInfo = {};
for (const [kind, f] of Object.entries(facts.trainKinds ?? {})) {
  if (kind.startsWith('_') || kind === 'childFare') continue;
  const pick = (name) => (f[name] ? { value: f[name].value, detail: f[name].detail ?? null, source: f[name].source } : null);
  kindInfo[kind] = Object.fromEntries(
    ['speedKmh', 'cars', 'seats', 'power', 'seatsTurn', 'look', 'name', 'windows', 'room', 'features', 'firstRun', 'maker'].map((k) => [k, pick(k)]).filter(([, v]) => v),
  );
}

const out = {
  _설명:
    '지도 안 일반·고속 열차 시각표. trains[].stops는 [기차역 id(rail.json), 도착(분), 출발(분)](하루 시작부터 분, 다음 날 새벽은 1440 넘음, 없으면 null). kind는 열차 종류(TAGO). fromOrigin/toTerminus는 그 역이 이 열차의 처음·끝 역인지(아니면 지도 밖에서 오거나 지도 밖으로 간다). 만든 곳: scripts/build-trains.mjs',
  source: `한국철도공사 열차운행정보(15125762) ${runInfo.runDate} 하루, 국토교통부 TAGO 열차정보(15098552) ${tago.runDate}의 열차 종류(열차번호로 이음)`,
  runDate: runInfo.runDate,
  kinds: [...new Set(trains.map((t) => t.kind).filter(Boolean))].sort(),
  trains,
  perStation,
  fareTable,
  fareSource: tagoFares ? `국토교통부 TAGO 열차정보(15098552) ${tagoFares.runDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')} 역 쌍별 어른 운임` : null,
  kindInfo,
  childFare: facts.trainKinds?.childFare ? { text: facts.trainKinds.childFare.value, source: facts.trainKinds.childFare.source } : null,
  issues,
};
writeFileSync(resolve(ROOT, 'data/build/trains.json'), JSON.stringify(out));
const kinds = {};
for (const t of trains) kinds[t.kind ?? '종류 모름'] = (kinds[t.kind ?? '종류 모름'] ?? 0) + 1;
console.log(`열차 ${trains.length}개(지도 안 한 역에만 서는 열차 ${oneStop}개는 뺌), 종류별: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`trains.json ${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)}KB`);
if (issues.length) console.log(`확인할 것:\n- ${issues.join('\n- ')}`);
