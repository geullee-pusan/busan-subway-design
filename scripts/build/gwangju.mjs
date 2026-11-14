// 광주 도시철도 1호선(광주교통공사)을 만든다. 지도 범위 넓히기 4(2026-11-14).
//  - 역 차례, 역 사이 거리와 걸리는 시간: 광주교통공사 역간구간거리및소요시간(15046044)
//  - 역 자리와 지금 쓰는 역 이름: OSM 노선(역 차례와 개수가 공식 자료와 같은지 확인한다)
//  - 서는 시간과 배차 간격: 광주교통공사 열차 시간표 데이터(15111497, 2026-11-01)
//  - 실제 이용객(보여 주기만, 보정에는 쓰지 않는다): 광주교통공사 역일시간대별 승하차량(15060048, 2026년 1~9월)
import { readFileSync } from 'node:fs';
import { readCsv, toNumber } from '../lib/csv.mjs';
import { readOsmFile } from '../lib/osm.mjs';
import { displayName, metersBetween, normalizeName } from './network.mjs';

export const GWANGJU_LINE = { id: 'GJ1', no: '1', label: '광주1' };

/** 공공데이터포털 CSV는 EUC-KR일 때가 있다 */
function readText(path) {
  const buf = readFileSync(path);
  const utf = new TextDecoder('utf-8').decode(buf);
  return utf.includes('�') ? new TextDecoder('euc-kr').decode(buf) : utf;
}
function rowsOf(path) {
  const lines = readText(path).split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].replace(/^﻿/, '').split(',').map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}
/** 이름 견주기: 가운뎃점, 괄호 속, 끝의 "역"을 뗀다 */
const key = (name) => normalizeName(String(name).replace(/\(.*?\)/g, '').replace(/[·.]/g, '').replace(/역$/, ''));
/** 공식 자료는 줄인 이름을 쓴다(학동증심사 = 학동·증심사입구, 컨벤션센터 = 김대중컨벤션센터) */
const sameStation = (a, b) => {
  const x = key(a);
  const y = key(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)));
};

/**
 * @param {(p: string) => string} raw
 * @param {string[]} issues
 */
export function gwangjuLines(raw, issues) {
  const def = GWANGJU_LINE;
  const links = rowsOf(raw('datagokr/15046044.csv'));
  const names = [links[0]['시작역'], ...links.map((r) => r['도착역'])];

  const routes = readOsmFile(raw('osm/routes.json'));
  const osmStations = readOsmFile(raw('osm/stations.json'));
  const osmNodes = new Map(osmStations.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const rel = routes.elements.find((e) => {
    if (e.type !== 'relation' || e.tags?.route_master || !/광주.*1호선/.test(e.tags?.name ?? '')) return false;
    const firstStop = e.members.find((m) => m.type === 'node' && /^stop/.test(m.role));
    return firstStop && sameStation(osmNodes.get(firstStop.ref)?.tags?.name ?? '', names[0]);
  });
  if (!rel) throw new Error(`OSM에서 광주 도시철도 1호선(${names[0]} 출발)을 찾지 못했어요.`);
  const osmStops = rel.members
    .filter((m) => m.type === 'node' && /^stop/.test(m.role))
    .map((m) => ({ osmId: m.ref, name: osmNodes.get(m.ref)?.tags?.name ?? null, lat: m.lat, lon: m.lon }));
  if (osmStops.length !== names.length) {
    throw new Error(`광주 1호선: OSM ${osmStops.length}역, 공식 ${names.length}역으로 달라 이름을 맞출 수 없어요.`);
  }

  const stations = [];
  const out = [];
  const ids = [];
  const renamed = [];
  names.forEach((officialName, i) => {
    const osm = osmStops[i];
    if (!sameStation(osm.name ?? '', officialName)) renamed.push(`${officialName}→${osm.name}`);
    const name = displayName(osm.name ?? officialName);
    const id = `G${100 + i}`;
    stations.push({
      id,
      line: def.id,
      name,
      code: String(100 + i),
      lat: Math.round(osm.lat * 1e6) / 1e6,
      lon: Math.round(osm.lon * 1e6) / 1e6,
      coordSource: 'OSM 노선의 역 자리',
      osmId: osm.osmId,
    });
    ids.push(id);
    if (i > 0) {
      const r = links[i - 1];
      const km = toNumber(r['거리(km)']);
      const gap = metersBetween(stations[i - 1], stations[i]);
      if (Math.abs(gap - km * 1000) > Math.max(400, km * 500)) issues.push(`광주 1호선 ${r['시작역']}–${r['도착역']}: 공식 거리 ${km}km, 역 자리로 잰 곧은 거리 ${Math.round(gap)}m`);
      out.push({
        line: def.id,
        from: ids[i - 1],
        to: id,
        distanceM: Math.round(km * 1000),
        runS: Math.round(toNumber(r['소요시간(분)']) * 60),
        distanceSource: '15046044',
        runSource: '15046044 소요시간(분)',
      });
    }
  });
  if (renamed.length) issues.push(`광주 1호선: 공식 자료와 OSM의 역 이름이 다른 곳(OSM 이름을 씀): ${renamed.join(', ')}`);
  const lengthKm = Math.round(links.reduce((s, r) => s + toNumber(r['거리(km)']), 0) * 10) / 10;
  const lines = [
    {
      id: def.id,
      label: def.label,
      name: '광주 1호선',
      fullName: '광주 도시철도 1호선',
      operator: '광주교통공사',
      status: '운행 중',
      stations: ids,
      lengthKm,
      lengthSource: '15046044 역간 거리의 합',
      runSource: '15046044',
      dwellS: null,
      dwellSource: null,
      osmRelation: rel.id,
      osmColour: rel.tags.colour ?? null,
      region: '광주',
    },
  ];
  return { lines, stations, links: out };
}

/** "05:30" → 하루 시작부터 분(새벽 3시 전은 다음 날) */
function minutesOf(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(text ?? '');
  if (!m) return null;
  const t = Number(m[1]) * 60 + Number(m[2]);
  return t < 180 ? t + 1440 : t;
}

/**
 * 시간표로 평일 시간대별 열차 수와 중간 역에서 서는 시간을 센다.
 * 서는 시간 = (끝에서 두 번째 역끼리 걸린 시간 − 그 사이 역 사이 시간의 합) ÷ 그 사이 역 수
 */
export function gwangjuService(raw, line, links, stations, issues) {
  const rows = rowsOf(raw('datagokr/15111497.csv')).filter((r) => r['요일'] === '평일');
  if (!rows.length) {
    issues.push('광주 1호선 시간표(15111497)에 평일 줄이 없어요.');
    return null;
  }
  const order = line.stations.map((id) => stations.find((s) => s.id === id));
  // 역사코드가 역 이름과 어긋난 줄이 있어서 이름으로 역을 찾는다
  const stationOf = (r) => order.find((st) => sameStation(st.name, r['역사명']));
  const ref = order[Math.floor(order.length / 2)];
  // 한 방향(첫 줄의 방향)만 센다
  const dir = rows.find((r) => stationOf(r) === ref)?.['방향(상_하행)'];
  const perHour = new Array(30).fill(0);
  for (const r of rows) {
    if (stationOf(r) !== ref || r['방향(상_하행)'] !== dir) continue;
    const t = minutesOf(r['도착시간']);
    if (t !== null) perHour[Math.floor(t / 60)] += 1;
  }
  const counts = perHour.slice(6, 23);
  const mean = counts.reduce((s, n) => s + n, 0) / counts.length;
  // 서는 시간: 끝 역은 한쪽 방향 시각만 있어서 끝에서 두 번째 역끼리(소태~도산) 잰다.
  // 한쪽 역 시각마다 같은 방향으로 다른 쪽 역에 처음 닿는 시각을 짝짓고, 그 가운데 가장 짧은 것을 쓴다.
  const timesAt = (station, d) =>
    rows
      .filter((r) => stationOf(r) === station && r['방향(상_하행)'] === d)
      .map((r) => minutesOf(r['도착시간']))
      .filter((t) => t !== null)
      .sort((x, y) => x - y);
  const i = 1;
  const j = order.length - 2;
  const run = links.slice(i, j).reduce((sum, l) => sum + l.runS, 0);
  let dwellS = null;
  for (const d of new Set(rows.map((r) => r['방향(상_하행)']))) {
    for (const [from, to] of [
      [order[i], order[j]],
      [order[j], order[i]],
    ]) {
      const starts = timesAt(from, d);
      const ends = timesAt(to, d);
      const spans = starts
        .map((t) => {
          const u = ends.find((x) => x > t);
          return u === undefined ? Infinity : (u - t) * 60;
        })
        .filter((x) => x >= run && Number.isFinite(x));
      if (!spans.length) continue;
      const value = Math.round((Math.min(...spans) - run) / (j - i - 1));
      if (value >= 0 && value < 90 && (dwellS === null || value < dwellS)) dwellS = value;
    }
  }
  if (dwellS === null) issues.push('광주 1호선: 시간표로 서는 시간을 구하지 못했어요.');
  return {
    trainsPerHourPeak: Math.max(...counts),
    trainsPerHourTypical: Math.round(mean * 10) / 10,
    headwayMin: Math.round((60 / mean) * 10) / 10,
    serviceSource: `15111497 시간표에서 셈(평일 6~22시, ${ref.name}역, 한 방향)`,
    dwellS,
    dwellSource: dwellS === null ? null : '15111497 시간표: (소태~도산 걸린 시간 − 15046044 역 사이 시간의 합) ÷ 그 사이 역 수',
  };
}

/**
 * 광주 역별 하루 평균 이용객(평일, 토요일, 일요일). 2026년 1~9월.
 * @returns {Record<string, object>}
 */
export function gwangjuRidership(raw, stations, issues) {
  const rows = rowsOf(raw('datagokr/15060048.csv'));
  const WEEKDAY_NAMES = ['일요일', '평일', '평일', '평일', '평일', '평일', '토요일'];
  const mine = stations.filter((s) => s.line === GWANGJU_LINE.id);
  const tally = new Map();
  const unknown = new Set();
  for (const r of rows) {
    const station = mine.find((s) => sameStation(s.name, r['역명']));
    if (!station) {
      unknown.add(r['역명']);
      continue;
    }
    const [y, mo, d] = r['일자'].split('-').map(Number);
    const type = WEEKDAY_NAMES[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
    const k = `${station.id}|${type}`;
    const t = tally.get(k) ?? { days: new Set(), board: new Array(24).fill(0), alight: new Array(24).fill(0) };
    t.days.add(r['일자']);
    const into = r['구분'] === '승차' ? t.board : t.alight;
    for (let h = 0; h < 24; h++) {
      const cell = r[`${String(h).padStart(2, '0')}_${String(h + 1).padStart(2, '0')}`];
      if (cell !== undefined) into[h] += toNumber(cell);
    }
    tally.set(k, t);
  }
  if (unknown.size) issues.push(`광주 이용객(15060048): 역 목록에 없는 역 ${[...unknown].join(', ')}`);
  const out = {};
  for (const [k, t] of tally) {
    const [id, type] = k.split('|');
    out[id] ??= {};
    const hourly = {
      board: t.board.map((v) => Math.round(v / t.days.size)),
      alight: t.alight.map((v) => Math.round(v / t.days.size)),
    };
    out[id][type] = { days: t.days.size, board: hourly.board.reduce((s, v) => s + v, 0), alight: hourly.alight.reduce((s, v) => s + v, 0), hourly };
  }
  return out;
}
