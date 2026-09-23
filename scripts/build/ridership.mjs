// 역별 이용객을 만든다.
//  - 부산교통공사 시간대별 승하차인원(3057229, 2025년)
//  - 김해시 경전철 역사별 시간대별 승하차(15105181, 2025년 부분)
// 요일 묶음(평일, 토요일, 일요일)마다 하루 평균을 내고, 시간대별 모양도 함께 낸다.
// 공휴일은 따로 빼지 않는다(자료에 표시가 없다). 그래서 평일 평균에 공휴일이 섞여 있다.
import { readCsv, toNumber } from '../lib/csv.mjs';
import { normalizeName } from './network.mjs';

const DAY_TYPES = ['평일', '토요일', '일요일'];
const WEEKDAY_NAMES = ['일요일', '평일', '평일', '평일', '평일', '평일', '토요일'];

/** "2025-01-01" → '평일' | '토요일' | '일요일' */
function dayTypeOfDate(text) {
  const [y, m, d] = text.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** '수' 같은 요일 글자 → 요일 묶음 */
function dayTypeOfName(korean) {
  if (korean === '토') return '토요일';
  if (korean === '일') return '일요일';
  return '평일';
}

function emptyTally() {
  return Object.fromEntries(
    DAY_TYPES.map((t) => [t, { days: new Set(), board: new Array(24).fill(0), alight: new Array(24).fill(0) }]),
  );
}

/** 더한 값을 하루 평균으로 바꾼다. 시간대 값을 반올림하고, 하루 합계는 그 값들의 합으로 둔다. */
function average(tally) {
  const out = {};
  for (const type of DAY_TYPES) {
    const t = tally[type];
    const days = t.days.size;
    if (days === 0) continue;
    const hourly = {
      board: t.board.map((v) => Math.round(v / days)),
      alight: t.alight.map((v) => Math.round(v / days)),
    };
    out[type] = {
      days,
      board: hourly.board.reduce((s, v) => s + v, 0),
      alight: hourly.alight.reduce((s, v) => s + v, 0),
      hourly,
    };
  }
  return out;
}

/**
 * @param {(p: string) => string} raw
 * @param {{id: string, line: string, name: string}[]} stations
 * @param {string[]} issues
 */
export function buildRidership(raw, stations, issues) {
  const tallies = new Map(); // 역 id → tally
  const forStation = (id) => {
    if (!tallies.has(id)) tallies.set(id, emptyTally());
    return tallies.get(id);
  };

  // 1. 부산교통공사 1~4호선 (역번호가 곧 역 id다)
  const humetro = readCsv(raw('datagokr/3057229_2025.csv')).records;
  const columns = Array.from({ length: 24 }, (_, h) => (h === 0 ? '24시-01시' : `${String(h).padStart(2, '0')}시-${String(h + 1).padStart(2, '0')}시`));
  const seen = new Set();
  for (const row of humetro) {
    const id = row['역번호'];
    seen.add(id);
    if (!stations.some((s) => s.id === id)) continue;
    const t = forStation(id)[dayTypeOfName(row['요일'])];
    t.days.add(row['년월일']);
    const target = row['구분'] === '승차' ? t.board : t.alight;
    for (const [h, col] of columns.entries()) target[h] += toNumber(row[col]);
  }

  // 2. 부산김해경전철 (이름으로 맞춘다. 2025년 자료만 쓴다)
  const bgl = readCsv(raw('datagokr/15105181.csv')).records.filter((r) => r['영업일자'].startsWith('2025'));
  const bglStations = stations.filter((s) => s.line === 'BGL');
  for (const row of bgl) {
    const station = bglStations.find((s) => normalizeName(s.name) === normalizeName(row['역사명']));
    if (!station) {
      issues.push(`부산김해경전철 이용객 자료의 역을 찾지 못했어요: ${row['역사명']}`);
      continue;
    }
    const t = forStation(station.id)[dayTypeOfDate(row['영업일자'])];
    t.days.add(row['영업일자']);
    const target = row['분류'] === '승차' ? t.board : t.alight;
    for (let h = 0; h < 24; h++) target[h] += toNumber(row[`${String(h).padStart(2, '0')}시 인원`]);
  }

  const result = {};
  for (const station of stations) {
    const tally = tallies.get(station.id);
    if (tally) result[station.id] = average(tally);
  }

  // 모든 역을 합친 시간대 모양(하루 중 몇 시에 얼마나 타는지). 모델이 하루를 시간대로 나눌 때 쓴다.
  const shape = {};
  for (const type of DAY_TYPES) {
    const hourly = new Array(24).fill(0);
    for (const station of Object.values(result)) {
      const day = station[type];
      if (!day) continue;
      for (let h = 0; h < 24; h++) hourly[h] += day.hourly.board[h];
    }
    const total = hourly.reduce((s, v) => s + v, 0);
    if (total > 0) shape[type] = hourly.map((v) => Math.round((v / total) * 10000) / 10000);
  }

  // 3. 자료가 없는 역: 게이트가 합쳐진 환승역과 동해선
  const missing = stations.filter((s) => !result[s.id]);
  return {
    stations: result,
    shape,
    missing: missing.map((s) => s.id),
    unusedRows: [...seen].filter((id) => !stations.some((s) => s.id === id)),
  };
}
