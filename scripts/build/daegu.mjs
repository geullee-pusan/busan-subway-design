// 대구 도시철도 1·2·3호선(대구교통공사)을 만든다.
//  - 역 순서, 역 번호, 역 사이 걸리는 시간, 정차시간: 대구교통공사 역 구간정보(15061836, 15061835, 15061797, 2025-12-31)
//  - 역 사이 거리: 대구교통공사 역간거리 정보(15002510)
//  - 역 자리: 대구교통공사 역별 출구별 위치정보(15133918, 15133920, 15133922)의 출구 좌표 가운데. 출구 자료가 없는 역은 OSM 역 자리
//  - 지금 쓰는 역 이름: OSM 노선(역 순서와 개수가 공식 자료와 같은지 확인한다). 공식 자료의 이름은 줄임말이나 예전 이름이 섞여 있다.
//  - 배차 간격: 대구교통공사 열차시각표(15138731, 3033376, 15138732, 15065532, 15138734)
//  - 실제 이용객(보여 주기만, 보정에는 쓰지 않는다): 대구교통공사 역별일별시간별승하차인원(15002503)
import { readFileSync } from 'node:fs';
import { readCsv, toNumber } from '../lib/csv.mjs';
import { displayName, metersBetween, normalizeName } from './network.mjs';

export const DAEGU_LINES = [
  { id: 'DG1', no: '1', label: '대구1', section: '15061836', exits: '15133918', timetables: ['15138731'] },
  { id: 'DG2', no: '2', label: '대구2', section: '15061835', exits: '15133920', timetables: ['3033376', '15138732'] },
  { id: 'DG3', no: '3', label: '대구3', section: '15061797', exits: '15133922', timetables: ['15065532', '15138734'] },
];

/** "00:01:50" → 110초 */
function seconds(text) {
  const [h, m, s] = String(text).split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/** 공식 자료의 역 이름: 환승역 번호(반월당1, 명덕3)와 괄호 속을 떼고 견준다. */
function officialKey(name) {
  return normalizeName(String(name).replace(/[0-9]+$/, ''));
}

/**
 * @param {(p: string) => string} raw
 * @param {string[]} issues
 */
export function daeguLines(raw, issues) {
  const routes = JSON.parse(readFileSync(raw('osm/routes.json'), 'utf8'));
  const osmStations = JSON.parse(readFileSync(raw('osm/stations.json'), 'utf8'));
  const osmNodes = new Map(osmStations.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const linkRows = readCsv(raw('datagokr/15002510.csv')).records;

  const lines = [];
  const stations = [];
  const links = [];
  for (const def of DAEGU_LINES) {
    const rows = readCsv(raw(`datagokr/${def.section}.csv`)).records.filter((r) => r['역종류'] === '일반역' && r['가동여부'] === 'Y');
    const distances = linkRows.filter((r) => r['호선'] === def.no);
    if (distances.length !== rows.length) {
      issues.push(`대구 ${def.no}호선: 역 구간정보(${def.section}) ${rows.length}역, 역간거리(15002510) ${distances.length}역으로 달라요.`);
    }

    // OSM 노선: 공식 자료의 첫 역에서 출발하는 것
    const first = officialKey(rows[0]['역명']);
    const rel = routes.elements.find((e) => {
      if (e.type !== 'relation' || e.tags?.route_master || e.tags?.name !== `대구 도시철도 ${def.no}호선`) return false;
      const firstStop = e.members.find((m) => m.type === 'node' && /^stop/.test(m.role));
      return firstStop && normalizeName(osmNodes.get(firstStop.ref)?.tags?.name ?? '') === first;
    });
    if (!rel) throw new Error(`OSM에서 대구 도시철도 ${def.no}호선(${rows[0]['역명']} 출발)을 찾지 못했어요.`);
    const osmStops = rel.members
      .filter((m) => m.type === 'node' && /^stop/.test(m.role))
      .map((m) => ({ osmId: m.ref, name: osmNodes.get(m.ref)?.tags?.name ?? null, lat: m.lat, lon: m.lon }));
    if (osmStops.length !== rows.length) {
      throw new Error(`대구 ${def.no}호선: OSM ${osmStops.length}역, 공식 ${rows.length}역으로 달라 이름을 맞출 수 없어요.`);
    }

    // 출구 좌표의 가운데 = 역 자리
    const exits = new Map();
    for (const r of readCsv(raw(`datagokr/${def.exits}.csv`)).records) {
      const key = officialKey(r['역명']);
      const e = exits.get(key) ?? { lat: 0, lon: 0, n: 0 };
      e.lat += Number(r['위도']);
      e.lon += Number(r['경도']);
      e.n += 1;
      exits.set(key, e);
    }
    // 출구 자료의 역 차례(이름이 예전 이름인 역은 차례로 맞춘다. 역 수가 노선과 같을 때만)
    const exitOrder = [...exits.values()];
    const byOrder = exitOrder.length === rows.length;

    const renamed = [];
    const ids = [];
    let dwellSum = 0;
    let dwellCount = 0;
    for (const [i, row] of rows.entries()) {
      const osm = osmStops[i];
      const officialName = String(row['역명']).replace(/[0-9]+$/, '');
      const name = displayName(osm.name ?? officialName);
      if (normalizeName(name) !== officialKey(officialName)) renamed.push(`${officialName}→${name}`);
      const exit = exits.get(officialKey(officialName)) ?? exits.get(normalizeName(name)) ?? (byOrder ? exitOrder[i] : undefined);
      const point = exit ? { lat: exit.lat / exit.n, lon: exit.lon / exit.n } : { lat: osm.lat, lon: osm.lon };
      const gap = metersBetween(point, osm);
      if (exit && gap > 500) issues.push(`대구 ${def.no}호선 ${name}: 출구 좌표 가운데가 OSM 역과 ${Math.round(gap)}m 달라요.`);
      const id = `D${row['역코드']}`;
      stations.push({
        id,
        line: def.id,
        name,
        code: row['역코드'],
        lat: Math.round(point.lat * 1e6) / 1e6,
        lon: Math.round(point.lon * 1e6) / 1e6,
        coordSource: exit ? `${def.exits} 출구 ${exit.n}곳 좌표의 가운데` : 'OSM(출구 자료에 없는 역)',
        osmId: osm.osmId,
      });
      ids.push(id);
      if (i > 0 && i < rows.length - 1) {
        dwellSum += seconds(row['정차시간']);
        dwellCount += 1;
      }
      if (i > 0) {
        const prev = rows[i - 1];
        const km = toNumber(distances[i]?.['역간거리']);
        links.push({
          line: def.id,
          from: ids[i - 1],
          to: id,
          distanceM: Math.round(km * 1000),
          runS: seconds(prev['하행시간']),
          distanceSource: '15002510',
          runSource: `${def.section} 하행시간(정차시간 빠짐)`,
        });
        const sectionKm = toNumber(prev['하행키로']);
        if (Math.abs(sectionKm - km) > 0.05) {
          issues.push(`대구 ${def.no}호선 ${prev['역명']}–${row['역명']}: 역간거리 ${km}km, 구간정보 ${sectionKm}km로 달라요.`);
        }
      }
    }
    if (renamed.length) issues.push(`대구 ${def.no}호선: 공식 자료와 OSM의 역 이름이 다른 곳(OSM 이름을 씀): ${renamed.join(', ')}`);
    lines.push({
      id: def.id,
      label: def.label,
      name: `대구 ${def.no}호선`,
      fullName: `대구 도시철도 ${def.no}호선`,
      operator: '대구교통공사',
      status: '운행 중',
      stations: ids,
      lengthKm: toNumber(distances.at(-1)['호선별 역간거리 누계']),
      lengthSource: '15002510 호선별 누계',
      runSource: def.section,
      dwellS: Math.round(dwellSum / dwellCount),
      dwellSource: `${def.section} 정차시간(중간역 평균)`,
      osmRelation: rel.id,
      osmColour: rel.tags.colour ?? null,
      region: '대구',
    });
  }
  return { lines, stations, links };
}

/** "05:25:30" → 하루 시작부터 분(새벽 3시 전은 다음 날) */
function minutesOf(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(text ?? '');
  if (!m) return null;
  const t = Number(m[1]) * 60 + Number(m[2]);
  return t < 180 ? t + 1440 : t;
}

/**
 * 대구 시각표로 평일 시간대별 열차 수를 센다. 노선 가운데쯤 역을 지나는 열차를 한 방향씩 센다.
 * @returns {Map<string, {trainsPerHourPeak: number, trainsPerHourTypical: number, headwayMin: number, serviceSource: string}>}
 */
export function daeguService(raw, lines, stations, issues) {
  const out = new Map();
  for (const def of DAEGU_LINES) {
    const line = lines.find((l) => l.id === def.id);
    const order = line.stations.map((id) => stations.find((s) => s.id === id));
    const ref = order[Math.floor(order.length / 2)];
    const counts = [];
    for (const file of def.timetables) {
      const text = new TextDecoder('euc-kr').decode(readFileSync(raw(`datagokr/${file}.csv`)));
      const perHour = new Array(30).fill(0);
      let found = false;
      for (const rowText of text.split(/\r?\n/)) {
        const cells = rowText.split(',');
        if (!/^평일/.test(cells[0] ?? '')) continue;
        if (normalizeName(String(cells[1]).replace(/[0-9]+$/, '')) !== normalizeName(ref.name)) continue;
        if (!['출발', '도착'].includes(cells[2])) continue;
        if (found && cells[2] === '도착') continue;
        found = true;
        for (const cell of cells.slice(3)) {
          const t = minutesOf(cell);
          if (t !== null) perHour[Math.floor(t / 60)] += 1;
        }
        break;
      }
      if (!found) {
        issues.push(`대구 ${def.no}호선 시각표(${file})에서 ${ref.name}을(를) 찾지 못했어요.`);
        continue;
      }
      for (let h = 6; h <= 22; h++) counts.push(perHour[h]);
    }
    if (counts.length === 0) continue;
    const mean = counts.reduce((s, n) => s + n, 0) / counts.length;
    out.set(def.id, {
      trainsPerHourPeak: Math.max(...counts),
      trainsPerHourTypical: Math.round(mean * 10) / 10,
      headwayMin: Math.round((60 / mean) * 10) / 10,
      serviceSource: `${def.timetables.join(', ')} 시각표에서 셈(평일 6~22시, ${ref.name.endsWith('역') ? ref.name : `${ref.name}역`}, 한 방향)`,
    });
  }
  return out;
}

/**
 * 대구 역별 하루 평균 이용객(평일, 토요일, 일요일). 자료에 연도가 없어서 파일 이름(2026-08-31)대로 2026년으로 본다.
 * @returns {{stations: Record<string, object>, days: string}}
 */
export function daeguRidership(raw, stations, issues) {
  const rows = readCsv(raw('datagokr/15002503.csv')).records;
  const WEEKDAY_NAMES = ['일요일', '평일', '평일', '평일', '평일', '평일', '토요일'];
  const byCode = new Map(stations.filter((s) => s.id.startsWith('D') && s.code).map((s) => [`${s.code}0`, s]));
  const tally = new Map();
  const unknown = new Set();
  for (const r of rows) {
    const station = byCode.get(r['역번호']);
    if (!station) {
      unknown.add(`${r['역번호']} ${r['역명']}`);
      continue;
    }
    const type = WEEKDAY_NAMES[new Date(Date.UTC(2026, Number(r['월']) - 1, Number(r['일']))).getUTCDay()];
    const key = `${station.id}|${type}`;
    const t = tally.get(key) ?? { days: new Set(), board: new Array(24).fill(0), alight: new Array(24).fill(0) };
    t.days.add(`${r['월']}-${r['일']}`);
    const into = r['승하차'] === '승차' ? t.board : t.alight;
    // 시간대 칸: "05시-06시" … "23시-24시"
    for (let h = 0; h < 24; h++) {
      const cell = r[`${String(h).padStart(2, '0')}시-${String(h + 1).padStart(2, '0')}시`];
      if (cell !== undefined) into[h] += toNumber(cell);
    }
    tally.set(key, t);
  }
  if (unknown.size) issues.push(`대구 이용객(15002503): 역 목록에 없는 역번호 ${[...unknown].join(', ')}`);
  const out = {};
  for (const [key, t] of tally) {
    const [id, type] = key.split('|');
    out[id] ??= {};
    // 부산 자료와 같은 모양: 시간대 값을 반올림하고, 하루 합계는 그 값들을 더한 값이다.
    const hourly = {
      board: t.board.map((v) => Math.round(v / t.days.size)),
      alight: t.alight.map((v) => Math.round(v / t.days.size)),
    };
    out[id][type] = {
      days: t.days.size,
      board: hourly.board.reduce((s, v) => s + v, 0),
      alight: hourly.alight.reduce((s, v) => s + v, 0),
      hourly,
    };
  }
  return out;
}
