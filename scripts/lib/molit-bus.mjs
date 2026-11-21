// 국토교통부_버스노선별 경유정류장(15142031, npm run molit-bus) 노선에 정류장 자리를 붙인다.
// 이 자료에는 좌표가 없다. 그래서 먼저 시·군 버스정보 누리집(BIS) 정류장 번호로 찾고, 없으면 누리집(BIS·pti),
// 국토교통부 전국 버스정류장 위치정보(15067528), OpenStreetMap 버스 정류장에서 같은 이름을 찾는다. 시·군을 하나씩 불러 받은 자료라 정류장 줄마다 그 정류장이 있는 시·군을 안다.
// 그래서 후보는 그 시·군(행정동 경계) 안의 같은 이름 정류장만 쓴다.
// 같은 이름이 여럿이면(길 양쪽, 같은 이름 마을) 노선을 따라 가장 짧게 이어지는 것을 고른다.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeDongs, dongAt } from '../../src/sim/address.js';
import { readCsv } from './csv.mjs';

/**
 * TAGO 버스노선정보에 없는 강원 시·군(시군구 코드, 2026-11-21 이 API로 자료가 있음을 확인). 양양은 TAGO에 도시는 있지만 노선이 0개다.
 * sggName은 행정동 경계 이름의 시·군 부분이다.
 */
export const MOLIT_CITIES = [
  { sgg: '51150', name: '강릉', sggName: '강릉시', branchDigits: true },
  { sgg: '51170', name: '동해', sggName: '동해시' },
  { sgg: '51210', name: '속초', sggName: '속초시' },
  { sgg: '51230', name: '삼척', sggName: '삼척시' },
  { sgg: '51750', name: '영월', sggName: '영월군' },
  { sgg: '51760', name: '평창', sggName: '평창군' },
  { sgg: '51770', name: '정선', sggName: '정선군' },
  { sgg: '51790', name: '화천', sggName: '화천군' },
  { sgg: '51800', name: '양구', sggName: '양구군' },
  { sgg: '51810', name: '인제', sggName: '인제군' },
  { sgg: '51820', name: '고성(강원)', sggName: '고성군' },
  { sgg: '51830', name: '양양', sggName: '양양군' },
];

/**
 * 강원 시·군 버스정보 누리집(사용자가 2026-11-21에 알려 줌, npm run gangwon-bis). delay는 부른 뒤 쉬는 초.
 * 삼척시 누리집 robots.txt에 Crawl-delay 30이 있다.
 */
export const GANGWON_BIS_SITES = [
  { id: 'samcheok', name: '삼척', title: '삼척시 버스정보시스템', kind: 'bis', base: 'https://www.samcheok.go.kr/bis', delay: 30 },
  { id: 'jeongseon', name: '정선', title: '정선군 버스정보시스템', kind: 'bis', base: 'https://bis.jeongseon.go.kr', delay: 3, saveRoutes: true },
  { id: 'yangyang', name: '양양', title: '양양군 버스정보시스템', kind: 'bis', base: 'https://bis.yangyang.go.kr', delay: 3 },
  { id: 'inje', name: '인제', title: '인제군 버스정보시스템', kind: 'bis', base: 'https://bis.inje.go.kr', delay: 3 },
  { id: 'goseong', name: '고성(강원)', title: '고성군 버스정보시스템', kind: 'bis', base: 'https://bis.gwgs.go.kr', delay: 3 },
  { id: 'pyeongchang', name: '평창', title: '평창군 버스정보시스템', kind: 'bis', base: 'https://bus.pc.go.kr', delay: 3 },
  { id: 'gangneung', name: '강릉', title: '강릉시 버스정보시스템', kind: 'bis', base: 'https://bis.gn.go.kr', delay: 3 },
  { id: 'hwacheon', name: '화천', title: '화천군 대중교통정보', kind: 'pti', base: 'https://hwacheon-pti.kr', delay: 3, routePages: 'p2_3', saveRoutes: true },
  { id: 'sokcho', name: '속초', title: '속초시 대중교통정보', kind: 'pti', base: 'https://www.sokcho-pti.kr', delay: 3 },
  { id: 'donghae', name: '동해', title: '동해시 대중교통정보', kind: 'pti', base: 'https://www.donghae-pti.kr', delay: 3 },
  { id: 'yeongwol', name: '영월', title: '영월군 대중교통정보', kind: 'pti', base: 'https://www.yeongwol-pti.com', delay: 3, routePages: 'p2_3', saveRoutes: true },
  { id: 'yanggu', name: '양구', title: '양구군 버스정보시스템', kind: 'bis', base: 'https://bis.yanggubus.kr', delay: 3, saveRoutes: true },
];

/** 띄어쓰기와 문장 부호를 뺀 이름 */
export const squashName = (name) => String(name ?? '').replace(/[\s.·ㆍ,\-_'"]/g, '');
/** 괄호 안(방면, 상·하행 등)을 뗀 이름 */
const bare = (name) => squashName(String(name ?? '').replace(/\([^)]*\)|\[[^\]]*\]/g, ''));
/** 앞뒤 정류장과 모두 이보다 멀면(격자 ×100 단위, 10m) 같은 이름의 엉뚱한 곳으로 본다: 8km */
const STRAY = 800;

/**
 * @param {string} root 저장소 폴더
 * @param {(lon:number, lat:number) => ({x:number,y:number}|null)} gridPoint 경위도 → 격자(×100)
 * @param {string[]} sggNames 자료를 받은 시·군 이름(예: '강릉시'). 이 시·군 안의 정류장만 후보로 모은다.
 */
export function makeStopFinder(root, gridPoint, sggNames) {
  const dongs = decodeDongs(JSON.parse(readFileSync(resolve(root, 'data/build/dong-shapes.json'), 'utf8')));
  const wanted = new Set(sggNames);
  /** 이름 → 후보 [{x, y, sgg, from}] */
  const byName = new Map();
  const byBare = new Map();
  const counts = { bis: 0, pti: 0, national: 0, osm: 0, byId: 0 };
  const seen = new Set();
  /** BIS 정류장 번호 → 자리(번호가 15142031 sttn_id와 같다) */
  const byId = new Map();
  function add(name, lon, lat, from, id = null) {
    const point = gridPoint(lon, lat);
    if (!point || !name) return;
    const dong = dongAt(dongs, { x: point.x / 100, y: point.y / 100 });
    const sgg = dong?.split(' ')[1];
    if (!sgg || !wanted.has(sgg) || !dong.startsWith('강원')) return;
    const cand = { x: point.x, y: point.y, sgg, from };
    if (id && !byId.has(id)) byId.set(id, cand);
    const key = `${squashName(name)}|${Math.round(point.x / 2)}|${Math.round(point.y / 2)}`;
    if (seen.has(key)) return; // 두 자료에 같은 곳(20m 안)이 함께 있으면 하나만
    seen.add(key);
    for (const [map, k] of [
      [byName, squashName(name)],
      [byBare, bare(name)],
    ]) {
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(cand);
    }
    counts[from] += 1;
  }
  // 시·군 버스정보 누리집 정류장(npm run gangwon-bis). 가장 먼저 넣어 같은 곳이면 이 자리를 쓴다.
  for (const site of GANGWON_BIS_SITES) {
    const file = resolve(root, `data/raw/gangwon-bis/${site.id}.json`);
    if (!existsSync(file)) continue;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const f = Object.fromEntries(data.fields.map((name, i) => [name, i]));
    for (const r of data.rows) add(r[f.name], r[f.lon], r[f.lat], site.kind, site.kind === 'bis' ? String(r[f.id]) : null);
  }
  const nationalPath = resolve(root, 'data/raw/datagokr/15067528.csv');
  if (existsSync(nationalPath)) {
    for (const r of readCsv(nationalPath).records) {
      if (!String(r['도시명'] ?? '').startsWith('강원')) continue;
      add(String(r['정류장명'] ?? '').trim(), Number(r['경도']), Number(r['위도']), 'national');
    }
  }
  const osmPath = resolve(root, 'data/raw/osm/bus-stops-gangwon.json');
  if (existsSync(osmPath)) {
    for (const e of JSON.parse(readFileSync(osmPath, 'utf8')).elements ?? []) {
      const name = e.tags?.name ?? e.tags?.['name:ko'];
      if (name) add(String(name).trim(), e.lon, e.lat, 'osm');
    }
  }

  /** 정류장 이름과 시·군으로 찾은 후보들 */
  function candidatesOf(name, sgg, id) {
    // 번호는 누리집마다 따로 매기므로 다른 시·군 번호와 우연히 같을 수 있다(영월 노선 ID가 이웃 군 BIS 번호와 겹침). 같은 시·군 안일 때만 쓴다.
    if (id && byId.get(id)?.sgg === sgg) {
      counts.byId += 1;
      return [byId.get(id)];
    }
    const inCity = (list) => (list ?? []).filter((c) => c.sgg === sgg);
    let found = inCity(byName.get(squashName(name)));
    if (!found.length) found = inCity(byName.get(bare(name)));
    if (!found.length) found = inCity(byBare.get(bare(name)));
    if (!found.length) {
      // "시청.중앙시장"처럼 점으로 이은 이름: 한 부분(3글자 이상)이 같은 곳
      for (const part of String(name).split(/[.·ㆍ]/).map(bare)) {
        if (part.length >= 3) found.push(...inCity(byName.get(part) ?? byBare.get(part)));
      }
    }
    return found;
  }

  /**
   * 노선 한 개의 정류장 줄([{name, sgg}], 차례대로)에 자리를 붙인다. 자리를 못 찾은 줄은 빠진다.
   * @returns {{placed: {name:string, x:number, y:number}[], found:number, strays:number}}
   */
  function place(rows) {
    const known = rows.map((row) => ({ ...row, cands: candidatesOf(row.name, row.sgg, row.id) })).filter((row) => row.cands.length);
    if (!known.length) return { placed: [], found: 0, strays: 0 };
    const cost = [known[0].cands.map(() => 0)];
    const back = [known[0].cands.map(() => -1)];
    for (let i = 1; i < known.length; i++) {
      cost.push([]);
      back.push([]);
      for (const p of known[i].cands) {
        let best = Infinity;
        let arg = 0;
        for (const [k, q] of known[i - 1].cands.entries()) {
          const value = cost[i - 1][k] + Math.hypot(p.x - q.x, p.y - q.y);
          if (value < best - 1e-9) {
            best = value;
            arg = k;
          }
        }
        cost[i].push(best);
        back[i].push(arg);
      }
    }
    let last = cost.at(-1).indexOf(Math.min(...cost.at(-1)));
    const list = new Array(known.length);
    for (let i = known.length - 1; i >= 0; i--) {
      const c = known[i].cands[last];
      list[i] = { name: known[i].name, x: c.x, y: c.y };
      last = back[i][last];
    }
    // 앞뒤 정류장과 모두 먼 것(같은 이름의 엉뚱한 곳)을 뺀다
    const hop = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    let strays = 0;
    for (let changed = true; changed && list.length > 2; ) {
      changed = false;
      for (let i = 0; i < list.length; i++) {
        const before = i > 0 ? hop(list[i - 1], list[i]) : null;
        const after = i + 1 < list.length ? hop(list[i], list[i + 1]) : null;
        const far = (v) => v === null || v > STRAY;
        const skip = i > 0 && i + 1 < list.length ? hop(list[i - 1], list[i + 1]) : 0;
        if (far(before) && far(after) && skip < Math.min(before ?? Infinity, after ?? Infinity)) {
          list.splice(i, 1);
          strays += 1;
          changed = true;
          break;
        }
      }
    }
    return { placed: list, found: known.length, strays };
  }

  return { place, counts };
}

/**
 * 받은 시·군 파일들을 읽어 노선(rte_id)마다 정류장 줄을 모은다. 시·군을 넘는 노선은 여러 파일의 줄을 정류장 차례로 잇는다.
 * @returns {{id:string, no:string, city:string, rows:{seq:number, name:string, sgg:string}[]}[]}
 */
/**
 * 노선 번호를 고친다. 강릉은 이 자료에 가지 노선이 "1041", "5041"처럼 붙어 있다. 사용자 제공 「강릉시 시내버스 노선」 표(2026-11-20)와
 * 나무위키 「강릉시 마실버스」에는 104-1·104-2·504-1·504-2·930-1처럼 적혀 있고, 이 자료에는 "104-1" 꼴이 하나도 없다.
 * 그래서 강릉의 네 자리 번호는 "앞 세 자리-끝 한 자리"로 읽는다(우리가 정한 해석).
 */
export function routeNumberOf(no, city) {
  const text = String(no ?? '').trim();
  if (city?.branchDigits) return text.replace(/^(\d{3})(\d)(?=$|\()/, '$1-$2');
  return text;
}

export function readMolitRoutes(root, cities) {
  const byId = new Map();
  for (const city of cities) {
    const file = resolve(root, `data/raw/molit-bus/${city.sgg}.json`);
    if (!existsSync(file)) continue;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const f = Object.fromEntries(data.fields.map((name, i) => [name, i]));
    for (const row of data.rows) {
      const id = String(row[f.rte_id]);
      if (!byId.has(id)) byId.set(id, { id, no: routeNumberOf(row[f.rte_no], city), rows: [], perCity: {} });
      const route = byId.get(id);
      route.rows.push({ seq: Number(row[f.sttn_seq]), id: String(row[f.sttn_id] ?? ''), name: String(row[f.sttn_nm] ?? '').trim(), sgg: city.sggName });
      route.perCity[city.name] = (route.perCity[city.name] ?? 0) + 1;
    }
  }
  return [...byId.values()].map((route) => {
    const seen = new Set();
    const rows = route.rows
      .sort((a, b) => a.seq - b.seq)
      .filter((row) => (seen.has(row.seq) ? false : (seen.add(row.seq), true)));
    // 정류장 줄이 가장 많은 시·군을 노선의 도시로 본다(같으면 cities 차례가 앞인 쪽)
    const city = cities.map((c) => c.name).reduce((best, name) => ((route.perCity[name] ?? 0) > (route.perCity[best] ?? 0) ? name : best), cities[0].name);
    return { id: route.id, no: route.no, city, rows };
  });
}
