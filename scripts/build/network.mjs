// 역, 노선, 역 사이 구간, 환승역을 만든다.
//  - 1~4호선: 부산교통공사 역간 거리 및 소요시간(3033564) + 역사정보 좌표(15043686)
//  - 부산김해경전철, 동해선: OpenStreetMap 노선(역 순서, 위치). 역 사이 시간 자료가 없어 추정한다.
import { readFileSync } from 'node:fs';
import { readCsv } from '../lib/csv.mjs';
import { utm52 } from '../lib/utm.mjs';

/** 화면에 쓸 역 이름. 원자료의 마침표는 가운뎃점으로 바꾼다(경성대.부경대 → 경성대·부경대). */
export function displayName(name) {
  return name.replace(/\./g, '·').trim();
}

/** 비교용 역 이름. 괄호 속, 가운뎃점, 공백, 끝의 '역'을 지운다. */
export function normalizeName(name) {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/[·.\s]/g, '')
    .replace(/역$/, '');
}

/** "02:15"(분:초) → 135초 */
export function parseMinSec(text) {
  const m = /^(\d+):(\d{2})$/.exec(text);
  if (!m) throw new Error(`소요시간 형식이 달라요: ${text}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 두 경위도 점 사이 거리(m). UTM 평면에서 잰다. */
export function metersBetween(a, b) {
  const [ax, ay] = utm52.forward(a.lon, a.lat);
  const [bx, by] = utm52.forward(b.lon, b.lat);
  return Math.hypot(bx - ax, by - ay);
}

// 부산교통공사 노선. 노선번호는 역사정보(15043686)와 운행 정보(15082980)에 쓰인 코드다.
const HUMETRO_LINES = [
  { id: '1', codes: ['S2601'] },
  { id: '2', codes: ['S2602', 'S4802'] },
  { id: '3', codes: ['S2603'] },
  { id: '4', codes: ['S2604', 'L2604'] },
];
const LINE_BY_CODE = new Map([
  ...HUMETRO_LINES.flatMap((l) => l.codes.map((c) => [c, l.id])),
  ['L4801', 'BGL'],
]);

function humetroLines(raw, issues) {
  const linkRows = readCsv(raw('datagokr/3033564.csv')).records;
  const infoRows = readCsv(raw('datagokr/15043686.csv')).records;
  const infoById = new Map(infoRows.map((r) => [r['역번호'], r]));
  const timetable = readCsv(raw('datagokr/15082980.csv')).records;
  const fullNameByCode = new Map(timetable.map((r) => [r['노선번호'], r['노선명']]));
  const speedByLine = new Map(readCsv(raw('datagokr/15142581.csv')).records.map((r) => [r['호선'], Number(r['표정속도'])]));

  const lines = [];
  const stations = [];
  const links = [];
  for (const def of HUMETRO_LINES) {
    const rows = linkRows.filter((r) => r['호선'] === def.id).sort((a, b) => Number(a['연번']) - Number(b['연번']));
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const id = row['역번호'];
      const info = infoById.get(id);
      if (!info) {
        issues.push(`역사정보(15043686)에 역번호 ${id}(${row['역명']})가 없어요.`);
        continue;
      }
      stations.push({
        id,
        line: def.id,
        name: displayName(row['역명']),
        nameEn: info['영문역사명'],
        code: id,
        lat: Number(info['역위도']),
        lon: Number(info['역경도']),
        coordSource: '15043686',
      });
      ids.push(id);
      if (i > 0) {
        links.push({
          line: def.id,
          from: rows[i - 1]['역번호'],
          to: id,
          distanceM: Math.round(Number(row['역간거리(km)']) * 1000),
          runS: parseMinSec(row['소요시간(분)']),
          distanceSource: '3033564',
          runSource: '3033564 소요시간(정차시간 빠짐)',
        });
      }
    }
    const fullName = def.codes.map((c) => fullNameByCode.get(c)).find(Boolean) ?? `부산 도시철도 ${def.id}호선`;
    const lengthKm = Number(rows.at(-1)['호선별누계(km)']);
    // 3033564의 소요시간에는 정차시간이 없다. 표정속도(정차시간을 넣은 평균 속도)로 전 구간 시간을 구하고,
    // 주행시간 합을 뺀 나머지를 중간역 수로 나눠 역마다 평균 정차시간으로 쓴다.
    const speed = speedByLine.get(def.id);
    const runTotal = links.filter((l) => l.line === def.id).reduce((s, l) => s + l.runS, 0);
    const dwellS = speed ? Math.round(((lengthKm / speed) * 3600 - runTotal) / (ids.length - 2)) : null;
    if (!speed) issues.push(`${def.id}호선 표정속도(15142581)가 없어 정차시간을 정하지 못했어요.`);
    lines.push({
      id: def.id,
      label: def.id,
      name: `${def.id}호선`,
      fullName,
      operator: '부산교통공사',
      status: '운행 중',
      stations: ids,
      lengthKm,
      lengthSource: '3033564 호선별누계',
      runSource: '3033564',
      dwellS,
      dwellSource: `15142581 표정속도 ${speed}km/h로 계산: (전 구간 거리 ÷ 표정속도 − 주행시간 합) ÷ 중간역 수`,
    });
  }
  return { lines, stations, links, infoRows };
}

/** OSM 노선 relation 하나의 정차역을 순서대로 꺼낸다. */
function osmStops(routes, osmNodes, match) {
  const rel = routes.elements.find((e) => e.type === 'relation' && match(e.tags ?? {}));
  if (!rel) throw new Error('OSM 노선을 찾지 못했어요.');
  const stops = rel.members
    .filter((m) => m.type === 'node' && /^stop/.test(m.role))
    .map((m) => ({ osmId: m.ref, name: osmNodes.get(m.ref)?.tags?.name ?? null, lat: m.lat, lon: m.lon }));
  return { rel, stops };
}

function osmLines(raw, issues, stationEdits) {
  const routes = JSON.parse(readFileSync(raw('osm/routes.json'), 'utf8'));
  const osmStations = JSON.parse(readFileSync(raw('osm/stations.json'), 'utf8'));
  const osmNodes = new Map(osmStations.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const korail = readCsv(raw('datagokr/15137827.csv')).records.map((r) => ({
    code: r['역번호'],
    name: normalizeName(r['역사명']),
    lat: Number(r['역위도']),
    lon: Number(r['역경도']),
    transferCode: r['환승노선번호'],
  }));

  const defs = [
    {
      id: 'BGL',
      label: 'BGL',
      name: '부산김해경전철',
      prefix: 'BG',
      operator: null,
      match: (t) => t.route === 'light_rail' && t.ref === 'BGL' && t.from === '사상',
    },
    {
      id: 'DH',
      label: '동해',
      name: '동해선',
      prefix: 'DH',
      operator: null,
      match: (t) => t.route === 'train' && t.ref === '동해' && t.from === '부전',
    },
  ];

  const lines = [];
  const stations = [];
  const links = [];
  for (const def of defs) {
    const { rel, stops } = osmStops(routes, osmNodes, def.match);
    // OSM 노선에 빠진 역을 넣는다(data/edits/stations.json).
    for (const ins of (stationEdits.insert ?? []).filter((x) => x.line === def.id)) {
      const node = osmNodes.get(ins.osmNode);
      const after = stops.findIndex((s) => s.name && normalizeName(s.name) === normalizeName(ins.after));
      if (!node || after === -1) {
        issues.push(`역 넣기(data/edits/stations.json)를 쓰지 못했어요: ${def.name} ${ins.name}`);
        continue;
      }
      stops.splice(after + 1, 0, { osmId: node.id, name: node.tags.name, lat: node.lat, lon: node.lon, inserted: true });
    }
    const ids = [];
    for (const [i, stop] of stops.entries()) {
      const id = `${def.prefix}${String(i + 1).padStart(2, '0')}`;
      let name = stop.name;
      if (!name && def.id === 'DH') {
        // OSM 역 자료 범위 밖의 역은 한국철도공사 역 위치(15137827)에서 1km 안의 역 이름을 쓴다.
        const near = korail.map((k) => ({ ...k, d: metersBetween(k, stop) })).sort((a, b) => a.d - b.d)[0];
        if (near && near.d < 1000) name = near.name;
      }
      if (!name) {
        issues.push(`${def.name} ${i + 1}번째 정차역의 이름을 찾지 못했어요 (OSM node ${stop.osmId}).`);
        name = `이름 없음 ${i + 1}`;
      }
      stations.push({
        id,
        line: def.id,
        name: displayName(name),
        code: null,
        lat: stop.lat,
        lon: stop.lon,
        coordSource: stop.inserted ? 'OSM 역 노드(노선에 빠져 data/edits/stations.json으로 넣음)' : 'OSM',
        osmId: stop.osmId,
      });
      ids.push(id);
      if (i > 0) {
        const prev = stops[i - 1];
        links.push({
          line: def.id,
          from: ids[i - 1],
          to: id,
          distanceM: Math.round(metersBetween(prev, stop)),
          runS: null,
          distanceSource: 'OSM 직선거리',
          runSource: null,
        });
      }
    }
    lines.push({
      id: def.id,
      label: def.label,
      name: def.name,
      fullName: rel.tags.name,
      operator: rel.tags.operator ?? null,
      status: '운행 중',
      stations: ids,
      lengthKm: null,
      lengthSource: null,
      runSource: null,
      dwellS: null,
      dwellSource: null,
      osmRelation: rel.id,
    });
  }

  // 한국철도공사 역 위치(15137827)를 OSM 동해선 역과 이름으로 맞춰 보고, 어긋난 행을 알린다.
  const dh = stations.filter((s) => s.line === 'DH');
  const slightlyOff = [];
  for (const k of korail) {
    const same = dh.find((s) => normalizeName(s.name) === k.name);
    if (!same) {
      issues.push(`동해선 역 위치(15137827) ${k.code} ${k.name}: OSM 동해선에 이 이름의 역이 없어요.`);
      continue;
    }
    const d = metersBetween(k, same);
    if (d > 1000) {
      issues.push(`동해선 역 위치(15137827) ${k.code} ${k.name}: 좌표가 OSM 역과 ${(d / 1000).toFixed(1)}km 달라요.`);
    } else if (d > 300) {
      slightlyOff.push(`${k.name} ${Math.round(d)}m`);
    }
  }
  if (slightlyOff.length > 0) {
    issues.push(`동해선 역 위치(15137827) 좌표가 OSM 역과 300m~1km 다른 역: ${slightlyOff.join(', ')}`);
  }
  return { lines, stations, links, korail };
}

/**
 * 환승역 묶음을 만든다. 공식 파일에 적힌 환승만 쓴다.
 *  - 15043686 환승노선번호: 같은 이름의 역을 상대 노선에서 찾는다.
 *  - 15137827 환승노선번호: 같은 이름의 동해선 역을 찾고, 상대 노선에서 그 역과 가장 가까운 역(600m 안)을 찾는다.
 *    이 파일은 좌표가 틀린 행이 있어서 좌표 대신 이름으로 맞춘다.
 *  - edits(data/edits/transfers.json): 공식 파일에 없거나 틀린 환승을 출처와 함께 더하거나 뺀다.
 */
function transferGroups(stations, infoRows, korail, edits, issues) {
  const pairs = [];
  const onLine = (line) => stations.filter((s) => s.line === line);
  for (const row of infoRows) {
    if (!row['환승노선번호']) continue;
    const self = stations.find((s) => s.id === row['역번호']);
    for (const code of row['환승노선번호'].split('+')) {
      const line = LINE_BY_CODE.get(code);
      if (!line || line === self.line) continue;
      const partner = onLine(line).find((s) => normalizeName(s.name) === normalizeName(self.name));
      if (!partner) {
        issues.push(`환승 상대를 찾지 못했어요: ${self.name}(${self.line}) → ${code}`);
        continue;
      }
      pairs.push({ a: self.id, b: partner.id, source: '15043686' });
    }
  }
  const dh = onLine('DH');
  for (const k of korail) {
    if (!k.transferCode) continue;
    const self = dh.find((s) => normalizeName(s.name) === k.name);
    const line = LINE_BY_CODE.get(k.transferCode);
    if (!self || !line) {
      issues.push(`동해선 환승 정보를 쓰지 못했어요: ${k.code} ${k.name} → ${k.transferCode}`);
      continue;
    }
    const partner = onLine(line)
      .map((s) => ({ s, d: metersBetween(s, self) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!partner || partner.d > 600) {
      const handled = (edits.remove ?? []).some((r) => [r.a, r.b].some((x) => x?.line === 'DH' && normalizeName(x.name) === normalizeName(self.name)));
      if (!handled) issues.push(`동해선 ${self.name}의 환승 상대(${line}호선)가 600m 안에 없어요.`);
      continue;
    }
    pairs.push({ a: self.id, b: partner.s.id, source: '15137827' });
  }

  // 고침 파일의 역은 {line, name}으로 적는다. 역 id로 바꾼다.
  const resolve = (ref) =>
    typeof ref === 'string' ? stations.find((s) => s.id === ref) : onLine(ref.line).find((s) => normalizeName(s.name) === normalizeName(ref.name));
  const label = (ref) => (typeof ref === 'string' ? ref : `${ref.line} ${ref.name}`);
  const samePair = (p, a, b) => (p.a === a && p.b === b) || (p.a === b && p.b === a);
  let kept = pairs;
  for (const rm of edits.remove ?? []) {
    const a = resolve(rm.a);
    const b = resolve(rm.b);
    if (!a || !b) {
      issues.push(`환승 고침(data/edits/transfers.json)의 역을 찾지 못했어요: ${label(rm.a)}–${label(rm.b)}`);
      continue;
    }
    kept = kept.filter((p) => !samePair(p, a.id, b.id));
  }
  for (const add of edits.add ?? []) {
    const a = resolve(add.a);
    const b = resolve(add.b);
    if (!a || !b) {
      issues.push(`환승 고침(data/edits/transfers.json)의 역을 찾지 못했어요: ${label(add.a)}–${label(add.b)}`);
      continue;
    }
    kept.push({ a: a.id, b: b.id, source: 'data/edits/transfers.json' });
  }

  const parent = new Map(stations.map((s) => [s.id, s.id]));
  const find = (x) => (parent.get(x) === x ? x : find(parent.get(x)));
  for (const p of kept) parent.set(find(p.a), find(p.b));

  const groups = new Map();
  for (const s of stations) {
    const root = find(s.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(s.id);
  }
  const result = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const members = ids.map((id) => stations.find((s) => s.id === id));
    const sources = [...new Set(kept.filter((p) => ids.includes(p.a)).map((p) => p.source))].sort();
    result.push({
      id: `T-${members[0].id}`,
      name: members.map((m) => m.name).sort((a, b) => a.length - b.length)[0],
      stations: ids,
      source: sources.join('+'),
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 역, 노선, 구간, 환승 묶음을 만든다.
 * raw(p)는 data/raw/p의 전체 경로를 돌려준다.
 * transferEdits, stationEdits는 data/edits/transfers.json, data/edits/stations.json 내용이다.
 */
export function buildNetwork(raw, transferEdits = {}, stationEdits = {}) {
  const issues = [];
  const humetro = humetroLines(raw, issues);
  const osm = osmLines(raw, issues, stationEdits);
  const stations = [...humetro.stations, ...osm.stations];
  const transfers = transferGroups(stations, humetro.infoRows, osm.korail, transferEdits, issues);
  for (const s of stations) {
    const group = transfers.find((t) => t.stations.includes(s.id));
    s.transfer = group ? group.id : null;
  }
  return {
    lines: [...humetro.lines, ...osm.lines],
    stations,
    links: [...humetro.links, ...osm.links],
    transfers,
    issues,
  };
}
