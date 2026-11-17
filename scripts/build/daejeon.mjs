// 대전 도시철도 1호선(대전교통공사)을 만든다. 충남·대전·세종 넓히기 1단계(2026-11-17).
//  - 역 차례, 공식 역 이름과 한자: 대전교통공사 역명 및 주소(15083331, 2025-10-31)
//  - 역 자리와 지금 쓰는 역 이름: OSM 노선(역 차례와 개수가 공식 자료와 같은지 확인한다)
//  - 역 사이 거리: OSM 노선 선로를 따라 잰 길이. 대전교통공사 선로곡선현황(15043921)의 거리표(km)와 어긋나지 않는지 확인한다.
//  - 역 사이 시간과 배차: 대전교통공사 열차시각표(15000960, 2025-08-31). 시각표는 분 단위라 역 사이 시간에 서는 시간이 들어 있다.
//  - 실제 이용객(보여 주기만, 보정에는 쓰지 않는다): 대전교통공사 시간대별 승하차인원(15060591, 2026년 1~10월)
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { toNumber } from '../lib/csv.mjs';
import { readOsmFile } from '../lib/osm.mjs';
import { displayName, metersBetween, normalizeName } from './network.mjs';

export const DAEJEON_LINE = { id: 'DJ1', no: '1', label: '대전1' };

const decode = (buf) => {
  const utf = new TextDecoder('utf-8').decode(buf);
  return utf.includes('�') ? new TextDecoder('euc-kr').decode(buf) : utf;
};
/** 쉼표로 나눈 줄(따옴표 안 쉼표는 나누지 않는다) */
function splitRow(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function tableOf(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = splitRow(lines[0].replace(/^﻿/, ''));
  return { head, rows: lines.slice(1).map(splitRow) };
}
function rowsOf(text) {
  const { head, rows } = tableOf(text);
  return rows.map((cells) => Object.fromEntries(head.map((h, i) => [h.replace(/\s+/g, ''), cells[i] ?? ''])));
}
/** ZIP 안 파일들(이름은 UTF-8 표시가 없으면 EUC-KR로 읽는다) */
function unzip(buffer) {
  const files = {};
  let end = buffer.length - 22;
  while (buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const packed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const rawName = buffer.subarray(at + 46, at + 46 + nameLength);
    const name = flags & 0x800 ? rawName.toString('utf8') : new TextDecoder('euc-kr').decode(rawName);
    at += 46 + nameLength + extraLength + commentLength;
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const body = buffer.subarray(start, start + packed);
    files[name] = method === 0 ? body : inflateRawSync(body);
  }
  return files;
}

/** 이름 견주기: 빈칸, 괄호 속, 가운뎃점, 끝의 "역"을 뗀다 */
const key = (name) => normalizeName(String(name).replace(/\(.*?\)/g, '').replace(/[\s·.]/g, '').replace(/역$/, ''));
const sameStation = (a, b) => {
  const x = key(a);
  const y = key(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 2 && (x.startsWith(y) || y.startsWith(x)));
};

/** 공식 역 목록(판암 → 반석): 역번호, 이름, 한자 */
export function daejeonOfficial(raw) {
  return rowsOf(decode(readFileSync(raw('datagokr/15083331.csv')))).map((r) => ({
    code: r['역번호'],
    name: r['한글'].replace(/\s+/g, ''),
    hanja: r['한자'].replace(/\s+/g, ''),
    roman: r['로마자'],
  }));
}

/** 관계의 선로(way)를 한 줄로 잇는다 */
function chainWays(rel) {
  const ways = rel.members.filter((m) => m.type === 'way' && m.geometry?.length).map((m) => m.geometry.map((p) => ({ lat: p.lat, lon: p.lon })));
  if (!ways.length) return [];
  const line = [...ways[0]];
  const rest = ways.slice(1);
  // 첫 선로의 방향: 다음 선로와 닿는 끝이 뒤로 가게
  if (rest.length) {
    const n = rest[0];
    const dEnd = Math.min(metersBetween(line.at(-1), n[0]), metersBetween(line.at(-1), n.at(-1)));
    const dStart = Math.min(metersBetween(line[0], n[0]), metersBetween(line[0], n.at(-1)));
    if (dStart < dEnd) line.reverse();
  }
  while (rest.length) {
    let best = 0;
    let flip = false;
    let bestD = Infinity;
    rest.forEach((w, i) => {
      const a = metersBetween(line.at(-1), w[0]);
      const b = metersBetween(line.at(-1), w.at(-1));
      if (a < bestD) [best, flip, bestD] = [i, false, a];
      if (b < bestD) [best, flip, bestD] = [i, true, b];
    });
    const w = rest.splice(best, 1)[0];
    line.push(...(flip ? [...w].reverse() : w));
  }
  return line;
}

/** 선 위에서 점과 가장 가까운 자리까지 선을 따라 잰 거리(m) */
function alongLine(line, cum, p) {
  let best = { d: Infinity, at: 0 };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    // 짧은 선분이라 경위도를 평면처럼 다룬다(경도는 위도에 맞춰 줄인다)
    const k = Math.cos((a.lat * Math.PI) / 180);
    const bx = (b.lon - a.lon) * k;
    const by = b.lat - a.lat;
    const px = (p.lon - a.lon) * k;
    const py = p.lat - a.lat;
    const len2 = bx * bx + by * by;
    const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
    const q = { lat: a.lat + by * t, lon: a.lon + (bx * t) / k };
    const d = metersBetween(q, p);
    if (d < best.d) best = { d, at: cum[i - 1] + (cum[i] - cum[i - 1]) * t };
  }
  return best;
}

/** "1k534" → 1534(m) */
const chainage = (text) => {
  const m = /^(\d+)k(\d+)/.exec(String(text).trim());
  return m ? Number(m[1]) * 1000 + Number(m[2]) : null;
};

/**
 * @param {(p: string) => string} raw
 * @param {string[]} issues
 */
export function daejeonLines(raw, issues) {
  const def = DAEJEON_LINE;
  const official = daejeonOfficial(raw);
  const routes = readOsmFile(raw('osm/routes.json'));
  const osmStations = readOsmFile(raw('osm/stations.json'));
  const osmNodes = new Map(osmStations.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const stopsOf = (rel) => rel.members.filter((m) => m.type === 'node' && /^stop/.test(m.role));
  const nameOf = (m) => osmNodes.get(m.ref)?.tags?.name ?? null;
  // 판암에서 떠나는 쪽
  const rel = routes.elements.find((e) => {
    if (e.type !== 'relation' || e.tags?.route_master || !/대전.*1호선/.test(e.tags?.name ?? '')) return false;
    const first = stopsOf(e)[0];
    return first && sameStation(nameOf(first) ?? '', official[0].name);
  });
  if (!rel) throw new Error(`OSM에서 대전 도시철도 1호선(${official[0].name} 출발)을 찾지 못했어요.`);
  const osmStops = stopsOf(rel).map((m) => ({ osmId: m.ref, name: nameOf(m), lat: m.lat, lon: m.lon }));
  if (osmStops.length !== official.length) {
    throw new Error(`대전 1호선: OSM ${osmStops.length}역, 공식 ${official.length}역으로 달라 이름을 맞출 수 없어요.`);
  }
  // 선로를 따라 잰 역 자리
  const track = chainWays(rel);
  const cum = [0];
  for (let i = 1; i < track.length; i++) cum.push(cum[i - 1] + metersBetween(track[i - 1], track[i]));
  const along = osmStops.map((s) => alongLine(track, cum, s));
  const far = osmStops.filter((s, i) => along[i].d > 150).map((s) => s.name);
  if (far.length) issues.push(`대전 1호선: OSM 선로에서 150m 넘게 떨어진 역 ${far.join(', ')}`);

  const run = daejeonRunTimes(raw, official, issues);
  const stations = [];
  const links = [];
  const ids = [];
  const renamed = [];
  official.forEach((o, i) => {
    const osm = osmStops[i];
    if (!sameStation(osm.name ?? '', o.name)) renamed.push(`${o.name}→${osm.name}`);
    const id = `J${o.code}`;
    stations.push({
      id,
      line: def.id,
      name: displayName(osm.name ?? o.name),
      code: o.code,
      lat: Math.round(osm.lat * 1e6) / 1e6,
      lon: Math.round(osm.lon * 1e6) / 1e6,
      coordSource: 'OSM 노선의 역 자리',
      osmId: osm.osmId,
    });
    ids.push(id);
    if (i > 0) {
      const d = Math.round(along[i].at - along[i - 1].at);
      if (d <= 0) issues.push(`대전 1호선 ${official[i - 1].name}–${o.name}: 선로를 따라 잰 거리가 ${d}m예요.`);
      links.push({
        line: def.id,
        from: ids[i - 1],
        to: id,
        distanceM: d,
        runS: run[i - 1],
        distanceSource: 'OSM 노선 선로를 따라 잰 길이',
        runSource: '15000960 평일 시각표(양방향 평균, 서는 시간 포함)',
      });
    }
  });
  if (renamed.length) issues.push(`대전 1호선: 공식 자료와 OSM의 역 이름이 다른 곳(OSM 이름을 씀): ${renamed.join(', ')}`);
  checkCurves(raw, official, links, issues);
  const lengthKm = Math.round(links.reduce((s, l) => s + l.distanceM, 0) / 100) / 10;
  const lines = [
    {
      id: def.id,
      label: def.label,
      name: '대전 1호선',
      fullName: '대전 도시철도 1호선',
      operator: '대전교통공사',
      status: '운행 중',
      stations: ids,
      lengthKm,
      lengthSource: 'OSM 노선 선로를 따라 잰 역 사이 거리의 합(판암~반석)',
      runSource: '15000960 평일 시각표',
      dwellS: 0,
      dwellSource: '역 사이 시간에 포함(시각표가 분 단위)',
      osmRelation: rel.id,
      osmColour: rel.tags.colour ?? null,
      region: '대전',
    },
  ];
  return { lines, stations, links };
}

/** 시각표 묶음(15000960)의 네 표: 평일·휴일 × 상선·하선 */
function timetables(raw) {
  const zip = unzip(readFileSync(raw('datagokr/15000960.zip')));
  const out = {};
  for (const [name, buf] of Object.entries(zip)) {
    const m = /(평일|휴일)\s*(상선|하선)/.exec(name);
    if (!m) continue;
    const { head, rows } = tableOf(decode(buf));
    out[`${m[1]}${m[2]}`] = { trains: head.slice(1), rows: rows.map((r) => ({ name: r[0], times: r.slice(1).map(minutesOf) })) };
  }
  return out;
}
/** "05:30" → 하루 시작부터 분(새벽 3시 전은 다음 날) */
function minutesOf(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(text ?? '');
  if (!m) return null;
  const t = Number(m[1]) * 60 + Number(m[2]);
  return t < 180 ? t + 1440 : t;
}

/** 역 사이 시간(초, 판암 → 반석 차례): 평일 두 방향의 모든 열차에서 이웃 역 시각 차이의 평균 */
function daejeonRunTimes(raw, official, issues) {
  const tt = timetables(raw);
  const sums = new Array(official.length - 1).fill(0);
  const counts = new Array(official.length - 1).fill(0);
  for (const k of ['평일상선', '평일하선']) {
    const t = tt[k];
    if (!t) {
      issues.push(`대전 1호선 시각표(15000960)에 ${k} 표가 없어요.`);
      continue;
    }
    const at = official.map((o) => t.rows.find((r) => sameStation(r.name, o.name)));
    const missing = official.filter((o, i) => !at[i]).map((o) => o.name);
    if (missing.length) issues.push(`대전 1호선 시각표 ${k}: 역 ${missing.join(', ')}이 없어요.`);
    for (let i = 0; i < official.length - 1; i++) {
      const a = at[i];
      const b = at[i + 1];
      if (!a || !b) continue;
      for (let c = 0; c < a.times.length; c++) {
        const x = a.times[c];
        const y = b.times[c];
        if (x === null || y === null || x === undefined || y === undefined) continue;
        const gap = Math.abs(y - x);
        if (gap > 10) continue;
        sums[i] += gap;
        counts[i] += 1;
      }
    }
  }
  return sums.map((s, i) => {
    if (!counts[i]) {
      issues.push(`대전 1호선 ${official[i].name}–${official[i + 1].name}: 시각표로 역 사이 시간을 구하지 못했어요. TODO(확인 필요)`);
      return null;
    }
    return Math.round((s / counts[i]) * 60);
  });
}

/** 선로곡선현황(15043921)의 곡선 자리(km)가 역 사이 순서와 어긋나지 않는지 본다 */
function checkCurves(raw, official, links, issues) {
  const zip = unzip(readFileSync(raw('datagokr/15043921.zip')));
  const file = Object.entries(zip).find(([name]) => name.includes('하선'));
  if (!file) return;
  const rows = rowsOf(decode(file[1]));
  // 공식 거리표의 0은 판암 쪽 차량기지다. 판암 자리는 "차량기지~판암" 곡선 끝과 "판암~신흥" 곡선 처음 사이에 있다.
  const idx = (n) => official.findIndex((o) => sameStation(o.name, n));
  let lo = -Infinity;
  let hi = Infinity;
  const rel = [0];
  for (const l of links) rel.push(rel.at(-1) + l.distanceM);
  for (const r of rows) {
    const [a, b] = String(r['역구간']).split('~');
    const s = chainage(r['시작위치(sta)']);
    const e = chainage(r['끝위치(sta)']);
    if (s === null || e === null) continue;
    const i = idx(a);
    const j = idx(b);
    // 곡선이 역 i와 역 j 사이에 있다: 판암 자리 + rel[i] ≤ s, e ≤ 판암 자리 + rel[j]
    if (i >= 0) hi = Math.min(hi, s - rel[i]);
    if (j >= 0) lo = Math.max(lo, e - rel[j]);
  }
  if (lo > hi + 150) issues.push(`대전 1호선: OSM으로 잰 역 사이 거리가 선로곡선현황(15043921) 거리표와 ${Math.round(lo - hi)}m 어긋나요.`);
}

/**
 * 시각표로 평일 시간대별 열차 수와 배차 간격을 센다(가운데 역, 판암 → 반석 방향).
 */
export function daejeonService(raw, line, stations, issues) {
  const tt = timetables(raw);
  const t = tt['평일하선'];
  if (!t) {
    issues.push('대전 1호선 시각표(15000960)에 평일 하선 표가 없어요.');
    return null;
  }
  const order = line.stations.map((id) => stations.find((s) => s.id === id));
  const ref = order[Math.floor(order.length / 2)];
  const row = t.rows.find((r) => sameStation(r.name, ref.name));
  const perHour = new Array(30).fill(0);
  for (const m of row?.times ?? []) if (m !== null) perHour[Math.floor(m / 60)] += 1;
  const counts = perHour.slice(6, 23);
  const mean = counts.reduce((s, n) => s + n, 0) / counts.length;
  return {
    trainsPerHourPeak: Math.max(...counts),
    trainsPerHourTypical: Math.round(mean * 10) / 10,
    headwayMin: Math.round((60 / mean) * 10) / 10,
    serviceSource: `15000960 시각표에서 셈(평일 6~22시, ${ref.name}역, 판암→반석)`,
    hourly: perHour.reduce((acc, n, h) => ((acc[h % 24] += n), acc), new Array(24).fill(0)),
    hourlySource: `15000960 시각표, 평일 ${ref.name}역을 지나는 열차(판암→반석)`,
    dwellS: 0,
    dwellSource: '역 사이 시간에 포함(시각표가 분 단위)',
  };
}

/**
 * 대전 역별 하루 평균 이용객(평일, 토요일, 일요일). 15060591(2026년 1~10월).
 * @returns {Record<string, object>}
 */
export function daejeonRidership(raw, stations, issues) {
  const rows = rowsOf(decode(readFileSync(raw('datagokr/15060591.csv'))));
  const WEEKDAY_NAMES = ['일요일', '평일', '평일', '평일', '평일', '평일', '토요일'];
  const byCode = new Map(stations.filter((s) => s.line === DAEJEON_LINE.id).map((s) => [String(Number(s.code) + 1000), s]));
  const tally = new Map();
  const unknown = new Set();
  let first = null;
  let last = null;
  for (const r of rows) {
    const station = byCode.get(r['역번호']);
    if (!station) {
      unknown.add(`${r['역번호']} ${r['역명']}`);
      continue;
    }
    const [y, mo, d] = r['날짜'].split('-').map(Number);
    if (!first || r['날짜'] < first) first = r['날짜'];
    if (!last || r['날짜'] > last) last = r['날짜'];
    const type = WEEKDAY_NAMES[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
    const k = `${station.id}|${type}`;
    const t = tally.get(k) ?? { days: new Set(), board: new Array(24).fill(0), alight: new Array(24).fill(0) };
    t.days.add(r['날짜']);
    const into = r['구분'] === '승차' ? t.board : t.alight;
    for (let h = 0; h < 24; h++) {
      const cell = r[`${String(h).padStart(2, '0')}-${String((h + 1) % 24).padStart(2, '0')}시`];
      if (cell !== undefined && cell !== '') into[h] += toNumber(cell);
    }
    tally.set(k, t);
  }
  if (unknown.size) issues.push(`대전 이용객(15060591): 역 목록에 없는 역 ${[...unknown].join(', ')}`);
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
  return { stations: out, period: first && last ? `${first}~${last}` : null };
}
