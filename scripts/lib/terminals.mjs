// 고속·시외버스 터미널 짝짓기: TAGO 터미널(이름만 있다)을 OpenStreetMap 버스터미널(자리가 있다)과 이름으로 잇는다.
// 받는 스크립트(fetch-intercity)와 만드는 스크립트(build-intercity)가 같은 규칙을 쓴다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeDongs, dongAt } from '../../src/sim/address.js';
import { utm52 } from './utm.mjs';

/**
 * 이름의 기본형: 띄어쓰기, 괄호 속, 뒤에 붙은 영어 이름, "시외버스터미널"·"정류장" 같은 꼬리를 뗀다
 * (밀양시외버스터미널 → 밀양, 부산서부(사상) → 부산서부, 장수버스터미널 Jangsu Bus Terminal → 장수,
 * 무주시외버스공용정류장 → 무주, 장계 시외 버스 터미날 → 장계)
 */
export function terminalBase(name) {
  return String(name ?? '')
    .replace(/\s+/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[A-Za-z'’-]+$/, '')
    .replace(/(종합|공용|시외|고속|버스)*(터미[널날]|정류장|정류소|대합실)$/, '')
    .replace(/(종합|공용|시외|고속|버스)+$/, '')
    .replace(/[·.]/g, '');
}

/** 이름이 터미널인지(정류장이 아닌지). OSM 이름에 "터미날"로 잘못 적힌 곳도 있다. */
const IS_TERMINAL = /터미[널날]/;

/** 터미널을 넣는 지역의 행정동 이름 머리 */
// 지도 네모 안의 모든 지역(2026-11-14 전북, 경북 북쪽, 충남·충북·대전 남쪽까지 넓혔다)
const AREA = ['부산광역시', '울산광역시', '대구광역시', '경상남도', '경상북도', '전남광주통합특별시', '전북특별자치도', '충청남도', '충청북도', '대전광역시', '세종특별자치시', '강원특별자치도'];
/** TAGO 시외버스 도시 이름 → 행정동 이름 머리 */
const CITY_TO_AREA = [
  [/부산/, '부산광역시'],
  [/울산/, '울산광역시'],
  [/대구/, '대구광역시'],
  [/경상남도|경남/, '경상남도'],
  [/전라남도|전남|광주/, '전남광주통합특별시'],
  [/경상북도|경북|경산북도/, '경상북도'],
  [/전라북도|전북/, '전북특별자치도'],
  [/충청남도|충남/, '충청남도'],
  [/충청북도|충북/, '충청북도'],
  [/대전/, '대전광역시'],
  [/세종/, '세종특별자치시'],
  [/강원/, '강원특별자치도'],
];

/**
 * OSM 버스터미널 가운데 지도에 넣은 지역 안에 있는 것(격자 좌표 km와 그곳 행정동 이름을 붙인다).
 * @returns {{id: string, name: string, base: string, x: number, y: number, dong: string, isTerminal: boolean}[]}
 */
export function areaTerminals(root) {
  const grid = JSON.parse(readFileSync(resolve(root, 'data/build/grid.json'), 'utf8'));
  const dongs = decodeDongs(JSON.parse(readFileSync(resolve(root, 'data/build/dong-shapes.json'), 'utf8')));
  const osm = JSON.parse(readFileSync(resolve(root, 'data/raw/osm/bus-terminals.json'), 'utf8'));
  const out = [];
  for (const e of osm.elements) {
    const name = e.tags?.name;
    if (!name) continue;
    const p = e.center ?? { lat: e.lat, lon: e.lon };
    const [east, north] = utm52.forward(p.lon, p.lat);
    const x = Math.round((east - grid.origin.easting) / 10) / 100;
    const y = Math.round((grid.origin.northing - north) / 10) / 100;
    if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue;
    const dong = dongAt(dongs, { x, y });
    if (!dong || !AREA.some((a) => dong.startsWith(a))) continue;
    out.push({ id: `${e.type}/${e.id}`, name, base: terminalBase(name), x, y, dong, isTerminal: IS_TERMINAL.test(name) });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * TAGO 터미널을 OSM 터미널과 잇는다. 같은 기본형이 여럿이면, 시외버스는 도시 이름이 맞는 쪽, 그다음은 "터미널"이 이름에 든 쪽을 고른다.
 * @param {{terminalId: string, terminalNm: string, cityName?: string}[]} tago
 * @param {ReturnType<typeof areaTerminals>} places
 * @param {Record<string, string>} edits TAGO 터미널 ID → OSM 요소("way/123") 또는 "" (잇지 않음). data/edits/bus-terminals.json
 * @returns {Map<string, ReturnType<typeof areaTerminals>[number]>} TAGO 터미널 ID → OSM 터미널
 */
export function matchTerminals(tago, places, edits = {}) {
  const byBase = new Map();
  for (const p of places) {
    if (!byBase.has(p.base)) byBase.set(p.base, []);
    byBase.get(p.base).push(p);
  }
  const byId = new Map(places.map((p) => [p.id, p]));
  const out = new Map();
  for (const t of tago) {
    if (t.terminalId in edits) {
      // 손으로 이은 곳은 이름에 "터미널"이 없어도 터미널로 본다(예: 광주 유·스퀘어)
      const p = byId.get(edits[t.terminalId]);
      if (p) out.set(t.terminalId, { ...p, isTerminal: true });
      continue;
    }
    let list = byBase.get(terminalBase(t.terminalNm)) ?? [];
    if (!list.length) continue;
    if (t.cityName) {
      const area = CITY_TO_AREA.find(([re]) => re.test(t.cityName))?.[1];
      if (!area) continue;
      list = list.filter((p) => p.dong.startsWith(area));
      if (!list.length) continue;
    }
    const best = [...list].sort((a, b) => Number(b.isTerminal) - Number(a.isTerminal) || a.id.localeCompare(b.id))[0];
    out.set(t.terminalId, best);
  }
  return out;
}
