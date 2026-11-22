// 수도권 도시철도(전철·지하철)를 만든다. 수도권 넓히기 1단계(2026-11-21).
//  - 역 차례와 역 자리: OSM 운행 계통(route relation)의 역 차례와 역 점(routes-5·routes-6, 이름은 stations 파일).
//    OSM 계통에 역이 빠진 노선(GTX-A, 경강선)은 TAGO 역 번호 차례(번호가 실제 차례와 같음)와 OSM 역 점(이름으로 찾음).
//  - 역 번호와 시각표: 국토교통부 TAGO 지하철정보(15098554, npm run metro-sudogwon). 역은 같은 노선 묶음 안에서 이름으로 맞춘다.
//  - 역 사이 거리: 역 사이 곧은 거리(OSM 역 자리). 부산 동해선·김해경전철과 같다.
//  - 역 사이 시간: TAGO 평일 시각표에서 이웃한 두 역의 시각을 맞춰 센 값(가운데값, 서는 시간 포함).
//  - 시간대별 열차 수: 가운데쯤 역의 평일 시각표(한 방향)
// 갈래가 있는 노선은 짧은 노선으로 나눈다(같은 이름의 역끼리 갈아탈 수 있다).
import { readFileSync, existsSync } from 'node:fs';
import { readOsmFile } from '../lib/osm.mjs';
import { displayName, metersBetween, normalizeName } from './network.mjs';

/** TAGO 역 번호 앞머리로 수도권 역만 고른다(부산·김해, 동해선·대경선, 인천공항 자기부상은 뺀다) */
export const isSudogwonStation = (id) => /^MTR/.test(id) && !/^MTR(BS|BGB|KRK6|KRK7|IAM)/.test(id);

/**
 * 노선(게임 노선 하나 = 갈래 없는 한 줄).
 *  osm: [OSM 운행 계통 번호, 처음 역 이름?, 끝 역 이름?] 여럿이면 차례로 잇는다(이음 역은 한 번만).
 *  tago: OSM 계통이 모자라면 TAGO 노선 이름과 역 번호 차례(codes: 쓸 역 번호, 차례대로)
 *  tagoRoutes: 시각표를 찾을 TAGO 노선 이름(subwayRouteName)
 *  loop: 끝 역에서 첫 역으로 돌아온다(2호선)
 */
export const SUDOGWON_LINES = [
  { id: 'S1', mark: '1', name: '1호선', fullName: '수도권 전철 1호선(경원·경인선)', osm: [[16850861]], tagoRoutes: ['1호선'], colorRel: 16850861 },
  { id: 'S1K', mark: '1', name: '1호선(경부·장항)', fullName: '수도권 전철 1호선(경부·장항선, 구로~신창)', osm: [[14181832]], tagoRoutes: ['1호선'], colorRel: 14181832 },
  { id: 'S1G', mark: '1', name: '1호선(광명)', fullName: '수도권 전철 1호선 광명 셔틀(금천구청~광명)', osm: [[4748705, '금천구청', '광명']], tagoRoutes: ['1호선'], colorRel: 4748705 },
  { id: 'S1D', mark: '1', name: '1호선(서동탄)', fullName: '수도권 전철 1호선 병점~서동탄', osm: [[15833659, '병점', '서동탄']], tagoRoutes: ['1호선'], colorRel: 15833659 },
  { id: 'S2', mark: '2', name: '2호선', fullName: '서울 지하철 2호선(순환선)', osm: [[4729409]], tagoRoutes: ['2호선'], loop: true, colorRel: 4729409 },
  { id: 'S2A', mark: '2', name: '2호선(성수지선)', fullName: '서울 지하철 2호선 성수지선', osm: [[4729405]], tagoRoutes: ['2호선'], colorRel: 4729405 },
  { id: 'S2B', mark: '2', name: '2호선(신정지선)', fullName: '서울 지하철 2호선 신정지선', osm: [[4729407]], tagoRoutes: ['2호선'], colorRel: 4729407 },
  { id: 'S3', mark: '3', name: '3호선', fullName: '수도권 전철 3호선', osm: [[443803]], tagoRoutes: ['3호선'], colorRel: 443803 },
  { id: 'S4', mark: '4', name: '4호선', fullName: '수도권 전철 4호선', osm: [[13938878, '진접', '남태령'], [2718884, '남태령', '오이도']], tagoRoutes: ['4호선'], colorRel: 2718884 },
  { id: 'S5', mark: '5', name: '5호선', fullName: '서울 지하철 5호선', osm: [[12497486]], tagoRoutes: ['5호선'], colorRel: 12497486 },
  { id: 'S5M', mark: '5', name: '5호선(마천)', fullName: '서울 지하철 5호선 마천지선(강동~마천)', osm: [[4744338]], tagoRoutes: ['5호선'], colorRel: 4744338 },
  { id: 'S6', mark: '6', name: '6호선', fullName: '서울 지하철 6호선', osm: [[12080315]], tagoRoutes: ['6호선'], colorRel: 12080315 },
  { id: 'S7', mark: '7', name: '7호선', fullName: '서울 지하철 7호선', osm: [[12746493]], tagoRoutes: ['7호선'], colorRel: 12746493 },
  { id: 'S8', mark: '8', name: '8호선', fullName: '서울 지하철 8호선', osm: [[2718901]], tagoRoutes: ['8호선'], colorRel: 2718901 },
  { id: 'S9', mark: '9', name: '9호선', fullName: '서울 지하철 9호선', osm: [[2718888]], tagoRoutes: ['9호선'], colorRel: 2718888 },
  { id: 'SGJ', mark: '경의', name: '경의·중앙선', fullName: '수도권 전철 경의·중앙선(문산~지평)', osm: [[5993212]], tagoRoutes: ['경의중앙'], extendTago: ['지평'], colorRel: 5993212 },
  { id: 'SGJB', mark: '경의', name: '경의·중앙선(서울역)', fullName: '수도권 전철 경의·중앙선 서울역~가좌', osm: [[8667956, '서울역', '가좌']], tagoRoutes: ['경의중앙'], colorRel: 8667956 },
  { id: 'SSB', mark: '수인', name: '수인·분당선', fullName: '수도권 전철 수인·분당선', osm: [[11634612]], tagoRoutes: ['수인분당'], colorRel: 11634612 },
  { id: 'SGC', mark: '경춘', name: '경춘선', fullName: '수도권 전철 경춘선(청량리~춘천)', osm: [[8656357]], tagoRoutes: ['경춘'], colorRel: 8656357 },
  { id: 'SGCB', mark: '경춘', name: '경춘선(광운대)', fullName: '수도권 전철 경춘선 광운대~상봉', osm: [[8656364, '광운대', '상봉']], tagoRoutes: ['경춘'], colorRel: 8656364 },
  { id: 'SGG', mark: '경강', name: '경강선', fullName: '수도권 전철 경강선(판교~여주)', tago: { route: '경강', prefix: 'MTRKRK5K' }, tagoRoutes: ['경강'], colorRel: 6462562 },
  { id: 'SSH', mark: '서해', name: '서해선', fullName: '수도권 전철 서해선', osm: [[16244688]], tagoRoutes: ['서해선'], colorRel: 16244688 },
  { id: 'SSBD', mark: '신분', name: '신분당선', fullName: '신분당선', osm: [[6060963]], tagoRoutes: ['신분당'], colorRel: 6060963 },
  { id: 'SAR', mark: '공항', name: '공항철도', fullName: '인천국제공항철도', osm: [[7919000]], tagoRoutes: ['공항'], colorRel: 7919000 },
  { id: 'SGTXA', mark: 'A', name: 'GTX-A', fullName: '수도권 광역급행철도 A선', tago: { route: 'GTX-A' }, tagoRoutes: ['GTX-A'], colorRel: 18828088 },
  { id: 'SI1', mark: '인1', name: '인천 1호선', fullName: '인천 도시철도 1호선', osm: [[19425646]], tagoRoutes: ['인천1호선'], colorRel: 19425646 },
  { id: 'SI2', mark: '인2', name: '인천 2호선', fullName: '인천 도시철도 2호선', osm: [[7527496]], tagoRoutes: ['인천2호선'], colorRel: 7527496 },
  { id: 'SUI', mark: '우이', name: '우이신설선', fullName: '서울 경전철 우이신설선', osm: [[7533583]], tagoRoutes: ['우이신설'], colorRel: 7533583 },
  { id: 'SSL', mark: '신림', name: '신림선', fullName: '서울 경전철 신림선', osm: [[14191876]], tagoRoutes: ['신림선'], colorRel: 14191876 },
  { id: 'SUJ', mark: '의정', name: '의정부경전철', fullName: '의정부경전철', osm: [[7530880]], tagoRoutes: ['의정부'], colorRel: 7530880 },
  { id: 'SEV', mark: '용인', name: '용인경전철', fullName: '용인경전철(에버라인)', osm: [[6064093]], tagoRoutes: ['에버라인'], colorRel: 6064093 },
  { id: 'SGM', mark: '김포', name: '김포골드라인', fullName: '김포 도시철도(김포골드라인)', osm: [[10092719]], tagoRoutes: ['김포골드라인'], colorRel: 10092719 },
];
/** OSM 이름 → TAGO 이름(역 이름이 바뀌었는데 OSM이 아직 옛 이름인 역). 화면에는 TAGO 이름을 쓴다. */
const RENAMED = { 서구청: '서해구청' };

export const SUDOGWON_LINE_IDS = new Set(SUDOGWON_LINES.map((l) => l.id));

/** "HHMMSS" → 하루 시작부터 초(새벽 3시 전은 다음 날). 0이나 빈 값은 null */
function secondsOf(text) {
  const s = String(text ?? '').padStart(6, '0');
  if (!/^\d{6}$/.test(s) || Number(s) === 0) return null;
  const t = Number(s.slice(0, 2)) * 3600 + Number(s.slice(2, 4)) * 60 + Number(s.slice(4, 6));
  return t < 3 * 3600 ? t + 86400 : t;
}
const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * @param {(p: string) => string} raw
 * @param {string[]} issues
 */
export function sudogwonLines(raw, issues) {
  const empty = { lines: [], stations: [], links: [] };
  if (!existsSync(raw('tago-subway/stations.json'))) {
    issues.push('[수도권] TAGO 지하철 역 목록이 없어요(npm run metro-sudogwon). 수도권 도시철도를 빼요.');
    return empty;
  }
  const tagoStations = JSON.parse(readFileSync(raw('tago-subway/stations.json'), 'utf8')).rows.filter(([id]) => isSudogwonStation(id));
  const schedPath = raw('tago-subway/schedules-weekday.json');
  const sched = existsSync(schedPath) ? JSON.parse(readFileSync(schedPath, 'utf8')).stations : {};
  const routes = readOsmFile(raw('osm/routes.json'));
  const relById = new Map(routes.elements.filter((e) => e.type === 'relation').map((e) => [e.id, e]));
  const osmStations = readOsmFile(raw('osm/stations.json'));
  const nodeName = new Map();
  /** OSM 역 점의 영어 이름(name:en) */
  const nodeEn = new Map();
  for (const e of osmStations.elements) {
    const name = e.tags?.name ?? e.tags?.['name:ko'];
    if (name) nodeName.set(e.id, name);
    const en = e.tags?.['name:en'];
    if (en) nodeEn.set(e.id, en);
  }
  // 이름으로 역 점 찾기(TAGO 차례로 만드는 노선): OSM 역·정거장 점
  const pointsByName = new Map();
  for (const e of osmStations.elements) {
    const name = e.tags?.name;
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!name || lat === undefined || lat < 36.6) continue;
    const k = normalizeName(name);
    if (!pointsByName.has(k)) pointsByName.set(k, []);
    pointsByName.get(k).push({ name, lat, lon, osmId: e.id });
  }

  /** 이름 없는 정지선 점: 300m 안에서 가장 가까운 이름 있는 역 점의 이름 */
  const named = [...pointsByName.values()].flat();
  const nearName = (p) => {
    let best = null;
    let bestD = 300;
    for (const q of named) {
      if (Math.abs(q.lat - p.lat) > 0.005 || Math.abs(q.lon - p.lon) > 0.006) continue;
      const d = metersBetween(p, q);
      if (d < bestD) [best, bestD] = [q.name, d];
    }
    return best;
  };
  /** 정지선 점에 name:en이 없으면 1km 안의 같은 이름 역 점(역 건물 등)의 name:en */
  const enByName = (s) => {
    const cands = (pointsByName.get(normalizeName(s.name ?? '')) ?? []).filter((q) => nodeEn.has(q.osmId) && metersBetween(q, s) < 1000);
    return cands.length ? nodeEn.get(cands.sort((a, b) => metersBetween(a, s) - metersBetween(b, s))[0].osmId) : null;
  };
  /** 노선 OSM 계통의 점들(같은 이름 역이 여럿일 때 이 노선에 가까운 것을 고른다) */
  const relPoints = (relId) => {
    const rel = relById.get(relId);
    if (!rel) return [];
    return rel.members.flatMap((m) => (m.type === 'node' ? [{ lat: m.lat, lon: m.lon }] : (m.geometry ?? []).filter((_, i) => i % 5 === 0)));
  };
  const nearLine = (pts, p) => pts.reduce((best, q) => Math.min(best, metersBetween(p, q)), Infinity);

  const stations = [];
  const links = [];
  const lines = [];
  for (const def of SUDOGWON_LINES) {
    const tagoOfLine = tagoStations.filter(([, , route]) => def.tagoRoutes.includes(route));
    /** 역 차례 [{name, lat, lon, osmId}] */
    let stops = [];
    let orderSource = '';
    if (def.osm) {
      for (const [relId, fromName, toName] of def.osm) {
        const rel = relById.get(relId);
        if (!rel) {
          issues.push(`[수도권] ${def.name}: OSM 운행 계통 ${relId}이 없어요.`);
          continue;
        }
        let part = rel.members
          .filter((m) => m.type === 'node' && /^stop/.test(m.role))
          .map((m) => ({ name: nodeName.get(m.ref) ?? nearName({ lat: m.lat, lon: m.lon }), lat: m.lat, lon: m.lon, osmId: m.ref }));
        // 같은 역이 이어서 두 번 나오면(정지선 점 두 개) 하나만
        part = part.filter((s, i) => i === 0 || !s.name || normalizeName(s.name) !== normalizeName(part[i - 1].name ?? ''));
        const at = (n) => part.findIndex((s) => s.name && normalizeName(s.name) === normalizeName(n));
        const a = fromName ? at(fromName) : 0;
        const b = toName ? at(toName) : part.length - 1;
        if (a < 0 || b < 0) {
          issues.push(`[수도권] ${def.name}: OSM ${relId}에서 ${fromName ?? ''}~${toName ?? ''}을 찾지 못했어요.`);
          continue;
        }
        part = a <= b ? part.slice(a, b + 1) : part.slice(b, a + 1).reverse();
        if (stops.length && part.length && normalizeName(stops.at(-1).name ?? '') === normalizeName(part[0].name ?? '')) part = part.slice(1);
        stops.push(...part);
      }
      orderSource = `OSM 운행 계통 ${def.osm.map((o) => o[0]).join('+')}의 역 차례`;
    } else if (def.tago) {
      const list = tagoOfLine.filter(([id]) => !def.tago.prefix || id.startsWith(def.tago.prefix)).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
      const pts = relPoints(def.colorRel);
      for (const [, name] of list) {
        const cands = pointsByName.get(normalizeName(name)) ?? [];
        const best = cands.map((c) => ({ c, d: nearLine(pts, c) })).sort((x, y) => x.d - y.d)[0]?.c;
        if (!best) {
          issues.push(`[수도권] ${def.name} ${name}: OSM 역 점을 찾지 못해 뺐어요.`);
          continue;
        }
        stops.push({ name: best.name, lat: best.lat, lon: best.lon, osmId: best.osmId, tagoName: name });
      }
      orderSource = 'TAGO 역 번호 차례(OSM 운행 계통에 역이 모자람), 역 자리는 OSM 역 점';
    }
    // TAGO에만 있는 끝 역 더하기(경의·중앙선 지평)
    for (const name of def.extendTago ?? []) {
      if (stops.some((s) => s.name && normalizeName(s.name) === normalizeName(name))) continue;
      const last = stops.at(-1);
      const cands = (pointsByName.get(normalizeName(name)) ?? []).sort((x, y) => metersBetween(x, last) - metersBetween(y, last));
      if (cands[0] && metersBetween(cands[0], last) < 10000) stops.push({ ...cands[0] });
      else issues.push(`[수도권] ${def.name}: ${name}을 끝에 잇지 못했어요.`);
    }
    const unnamed = stops.filter((s) => !s.name);
    if (unnamed.length) issues.push(`[수도권] ${def.name}: 이름 없는 역 점 ${unnamed.length}개를 뺐어요.`);
    stops = stops.filter((s) => s.name);
    // 순환선: 첫 역이 끝에 다시 나오면 뺀다(끝 역 → 첫 역 구간을 따로 잇는다)
    if (def.loop && stops.length > 2 && normalizeName(stops[0].name) === normalizeName(stops.at(-1).name)) stops.pop();
    if (stops.length < 2) {
      issues.push(`[수도권] ${def.name}: 역이 ${stops.length}개라 뺐어요.`);
      continue;
    }

    // TAGO 역 맞추기(같은 노선 묶음 안에서 이름)
    const tagoByName = new Map();
    for (const [id, name] of tagoOfLine) {
      // 괄호 밖 이름과 괄호 안 이름(총신대입구(이수) → 이수)으로 모두 찾는다
      const keys = [normalizeName(name), ...[...String(name).matchAll(/\(([^)]+)\)/g)].map((m) => normalizeName(m[1]))];
      for (const k of keys) {
        if (!tagoByName.has(k)) tagoByName.set(k, []);
        tagoByName.get(k).push(id);
      }
    }
    const ids = [];
    const tagoIds = [];
    const missingTago = [];
    stops.forEach((s, i) => {
      const id = `${def.id}.${String(i + 1).padStart(2, '0')}`;
      const renamed = RENAMED[s.name];
      const tago = tagoByName.get(normalizeName(renamed ?? s.tagoName ?? s.name)) ?? [];
      // 같은 이름이 여럿이면(코레일·서울교통공사 구간) 시각표가 있는 것
      const tagoId = tago.find((t) => sched[t]?.length) ?? tago[0] ?? null;
      if (!tagoId) missingTago.push(s.name);
      tagoIds.push(tagoId);
      stations.push({
        id,
        line: def.id,
        // 괄호 속 부역명은 뺀다(강변(동서울터미널) → 강변). 부산 역 이름과 같은 모양
        name: displayName((renamed ?? s.name).replace(/\(.*?\)/g, '').trim()),
        code: tagoId,
        lat: Math.round(s.lat * 1e6) / 1e6,
        lon: Math.round(s.lon * 1e6) / 1e6,
        coordSource: 'OSM 역 점',
        osmId: s.osmId,
        // 영어 이름: OSM 역 점의 name:en(괄호 속은 뺀다). 없으면 null(화면이 로마자로 어림)
        nameEn: (nodeEn.get(s.osmId) ?? enByName(s))?.replace(/ *\(.*?\)/g, '').trim() || null,
      });
      ids.push(id);
    });
    if (missingTago.length) issues.push(`[수도권] ${def.name}: TAGO 역 목록에서 찾지 못한 역 ${missingTago.join(', ')} (시각표 없음)`);

    // 역 사이 시간: 방향(U/D)마다 두 역의 시각을 "앞 역 → 뒤 역"과 "뒤 역 → 앞 역"으로 맞춰 보고,
    // 차이가 고르게 나오는 쪽(열차가 실제로 가는 쪽)의 가운데값을 쓴다. 두 방향 값의 평균을 역 사이 시간으로 한다.
    // (열차 번호가 없어서 종착역으로 방향을 가르면 짧은 갈래·종착역에서 짝을 못 맞춘다)
    const timesOf = (tagoId, dir) =>
      (sched[tagoId] ?? [])
        .filter((r) => r[0] === dir)
        .map((r) => secondsOf(r[2]) ?? secondsOf(r[1]))
        .filter((x) => x !== null)
        .sort((a, b) => a - b);
    const gapsOf = (ta, tb) => {
      const out = [];
      let k = 0;
      for (const x of ta) {
        while (k < tb.length && tb[k] <= x) k++;
        if (k < tb.length && tb[k] - x <= 900) out.push(tb[k] - x);
      }
      return out.sort((a, b) => a - b);
    };
    const spread = (g) => (g.length >= 3 ? g[Math.floor(g.length * 0.75)] - g[Math.floor(g.length * 0.25)] : Infinity);
    const pairs = stops.map((_, i) => [i, def.loop ? (i + 1) % stops.length : i + 1]).filter(([, j]) => j < stops.length);
    const runs = pairs.map(([i, j]) => {
      if (!tagoIds[i] || !tagoIds[j]) return null;
      const picks = [];
      for (const dir of ['U', 'D']) {
        const ta = timesOf(tagoIds[i], dir);
        const tb = timesOf(tagoIds[j], dir);
        const ab = gapsOf(ta, tb);
        const ba = gapsOf(tb, ta);
        const best = spread(ab) <= spread(ba) ? ab : ba;
        if (best.length >= 3 && spread(best) <= 150) picks.push(median(best));
      }
      if (!picks.length) return null;
      const m = Math.round(picks.reduce((a, b) => a + b, 0) / picks.length);
      // 거리와 견줘 시속 15~130km를 벗어나면 시각표 값이 실제와 다르다고 보고 버린다(우리가 정한 기준)
      const kmh = metersBetween(stops[i], stops[j]) / 1000 / (m / 3600);
      return m >= 30 && kmh >= 15 && kmh <= 130 ? m : null;
    });
    pairs.forEach(([i, j], n) => {
      links.push({
        line: def.id,
        from: ids[i],
        to: ids[j],
        distanceM: Math.round(metersBetween(stops[i], stops[j])),
        runS: runs[n],
        distanceSource: 'OSM 역 점 사이 곧은 거리',
        runSource: runs[n] === null ? null : 'TAGO 지하철정보(15098554) 평일 시각표에서 이웃 역 시각 차이의 가운데값(서는 시간 포함)',
      });
      if (runs[n] === null) issues.push(`[수도권] ${def.name} ${stops[i].name}–${stops[j].name}: 시각표로 역 사이 시간을 구하지 못했어요. TODO(확인 필요)`);
    });

    // 시간대별 열차 수: 가운데 역, 앞 방향
    const mid = Math.floor(stops.length / 2);
    // 가운데 역(시각표가 없으면 가장 가까운 시각표 있는 역)
    // 3역 넘는 노선은 양 끝(갈림 역, 다른 열차도 서는 역)을 빼고 센다
    const withSched = tagoIds.map((tid, i) => [i, tid]).filter(([i, tid]) => tid && sched[tid]?.length && (stops.length <= 2 || (i > 0 && i < stops.length - 1))).sort((a, b) => Math.abs(a[0] - mid) - Math.abs(b[0] - mid));
    const midAt = withSched[0]?.[0] ?? mid;
    const midAll = withSched.length ? timesOf(tagoIds[midAt], 'U') : [];
    let service = {};
    if (midAll.length) {
      const hourly = new Array(24).fill(0);
      for (const t of midAll) hourly[Math.floor(t / 3600) % 24] += 1;
      const counts = hourly.slice(6, 23);
      const mean = counts.reduce((s, n) => s + n, 0) / counts.length;
      service = {
        trainsPerHourPeak: Math.max(...counts),
        trainsPerHourTypical: Math.round(mean * 10) / 10,
        headwayMin: mean > 0 ? Math.round((60 / mean) * 10) / 10 : null,
        serviceSource: `TAGO 지하철정보(15098554) 평일 시각표에서 셈(평일 6~22시, ${stops[midAt].name}역, 한 방향)`,
        hourly,
        hourlySource: `TAGO 지하철정보(15098554) 평일 시각표, ${stops[midAt].name}역을 지나는 열차(한 방향)`,
      };
    } else {
      issues.push(`[수도권] ${def.name}: 시간대별 열차 수를 셀 시각표가 없어요. TODO(확인 필요)`);
    }
    const rel = relById.get(def.colorRel);
    const lengthKm = Math.round(links.filter((l) => l.line === def.id).reduce((s, l) => s + l.distanceM, 0) / 100) / 10;
    lines.push({
      id: def.id,
      label: def.mark,
      name: def.name,
      fullName: def.fullName,
      operator: rel?.tags?.operator ?? null,
      status: '운행 중',
      stations: ids,
      ...(def.loop ? { loop: true } : {}),
      lengthKm,
      lengthSource: '역 사이 곧은 거리의 합(OSM 역 점)',
      runSource: 'TAGO 지하철정보(15098554) 평일 시각표',
      dwellS: 0,
      dwellSource: '역 사이 시간에 포함(시각표에서 셈)',
      orderSource,
      osmRelation: def.colorRel,
      osmColour: rel?.tags?.colour ?? null,
      ...(rel?.tags?.colour ? { color: rel.tags.colour, colorSource: 'OSM 운행 계통의 colour 태그' } : {}),
      region: '수도권',
      ...service,
    });
  }
  // 시각표로 못 구한 역 사이 시간: 같은 노선의 평균 빠르기(시각표로 구한 구간이 3개 넘을 때), 아니면 수도권 노선 전체 평균 빠르기로 거리를 나눈 어림값
  const known = links.filter((l) => l.runS);
  const speedOf = (list) => list.reduce((s, l) => s + l.distanceM, 0) / list.reduce((s, l) => s + l.runS, 0);
  const allSpeed = speedOf(known);
  for (const line of lines) {
    const own = known.filter((l) => l.line === line.id);
    const speed = own.length > 3 ? speedOf(own) : allSpeed;
    for (const l of links.filter((x) => x.line === line.id && !x.runS)) {
      l.runS = Math.max(60, Math.round(l.distanceM / speed));
      l.runSource = own.length > 3 ? '어림: 같은 노선에서 시각표로 구한 구간의 평균 빠르기로 거리를 나눔' : '어림: 수도권 노선에서 시각표로 구한 구간의 평균 빠르기로 거리를 나눔';
    }
  }
  return { lines, stations, links };
}

/**
 * 수도권 갈아타기: 다른 노선의 같은 이름 역이 500m 안에 있으면 갈아탈 수 있다고 본다(우리가 정한 규칙, 수도권에는 한데 모은 공식 환승 파일을 쓰지 않았다).
 * @returns {{a: string, b: string, source: string}[]}
 */
export function sudogwonTransferPairs(stations) {
  const list = stations.filter((s) => SUDOGWON_LINE_IDS.has(s.line));
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.line === b.line || normalizeName(a.name) !== normalizeName(b.name)) continue;
      if (metersBetween(a, b) <= 500) pairs.push({ a: a.id, b: b.id, source: '수도권 같은 이름 역(500m 안)' });
    }
  }
  return pairs;
}

/**
 * 서울 교통카드 노선 이름(서울 열린데이터광장) → 우리 수도권 노선 id(앞 것부터 같은 이름 역을 찾는다).
 * 1호선·경부선·경인선·경원선·장항선은 모두 수도권 1호선, 일산선은 3호선, 과천선·안산선은 4호선, 분당선·수인선은 수인·분당선이다.
 */
const CARD_LINES = {
  '1호선': ['S1', 'S1K', 'S1G', 'S1D'],
  경부선: ['S1', 'S1K', 'S1G', 'S1D'],
  경인선: ['S1', 'S1K'],
  경원선: ['S1', 'S1K', 'SGJ'], // 용산~청량리(이촌·서빙고·한남·옥수·응봉·왕십리)는 경의·중앙선이 다닌다
  장항선: ['S1K', 'S1'],
  '2호선': ['S2', 'S2A', 'S2B'],
  '3호선': ['S3'],
  일산선: ['S3'],
  '4호선': ['S4'],
  과천선: ['S4'],
  안산선: ['S4'],
  '5호선': ['S5', 'S5M'],
  '6호선': ['S6'],
  '7호선': ['S7'],
  '8호선': ['S8'],
  '9호선': ['S9'],
  '9호선2~3단계': ['S9'],
  경의선: ['SGJ', 'SGJB'],
  중앙선: ['SGJ', 'SGJB'],
  경춘선: ['SGC', 'SGCB'],
  분당선: ['SSB'],
  수인선: ['SSB'],
  경강선: ['SGG'],
  서해선: ['SSH'],
  '공항철도 1호선': ['SAR'],
  우이신설선: ['SUI'],
  신림선: ['SSL'],
};

/**
 * 수도권 지하철 이용객(서울 열린데이터광장 교통카드 자료, npm run seoul-riders). 대전처럼 요일 묶음별 하루 평균과 시간대 값.
 * 날마다의 승하차(CardSubwayStatsNew)로 요일 묶음별 하루 평균을 내고, 시간대는 그 달 시간대 합계(CardSubwayTime)의 모양으로 나눈다
 * (시간대 자료는 요일을 가르지 않는다. **우리가 정한 어림**). 공휴일은 표시가 없어 평일·토요일에 섞여 있다(부산 자료와 같다).
 * 같은 노선 묶음의 같은 이름 역(환승역은 노선마다 따로 센다)에 붙인다. 이 자료에 없는 노선(신분당선, GTX-A, 인천 1·2호선, 경전철)은 비워 둔다.
 */
export function sudogwonRidership(raw, stations, issues) {
  const files = ['seoul-subway/riders-202610.json'].filter((f) => existsSync(raw(f)));
  if (!files.length) return { stations: {}, period: null };
  const data = JSON.parse(readFileSync(raw(files[0]), 'utf8'));
  const key = (name) => normalizeName(String(name ?? '').replace(/\([^)]*\)/g, '')).replace(/역$/, '');
  const index = new Map();
  for (const s of stations) index.set(`${s.line}|${key(s.name)}`, s);
  const find = (line, name) => {
    for (const id of CARD_LINES[line] ?? []) {
      const s = index.get(`${id}|${key(name)}`);
      if (s) return s;
    }
    return null;
  };
  const WEEKDAY = ['일요일', '평일', '평일', '평일', '평일', '평일', '토요일'];
  const tally = new Map();
  const unknown = new Set();
  for (const [date, line, name, board, alight] of data.daily) {
    const s = find(line, name);
    if (!s) {
      unknown.add(`${line} ${name}`);
      continue;
    }
    const type = WEEKDAY[new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6)))).getUTCDay()];
    const k = `${s.id}|${type}`;
    const t = tally.get(k) ?? { days: new Set(), board: 0, alight: 0 };
    t.days.add(date);
    t.board += board;
    t.alight += alight;
    tally.set(k, t);
  }
  // 시간대 모양(그 달 합계를 1로)
  const shape = new Map();
  for (const [line, name, b, a] of data.hourly) {
    const s = find(line, name);
    if (!s) continue;
    const old = shape.get(s.id) ?? { b: new Array(24).fill(0), a: new Array(24).fill(0) };
    b.forEach((v, h) => (old.b[h] += v));
    a.forEach((v, h) => (old.a[h] += v));
    shape.set(s.id, old);
  }
  const spread = (total, arr) => {
    const sum = arr.reduce((x, v) => x + v, 0);
    return sum > 0 ? arr.map((v) => Math.round((total * v) / sum)) : new Array(24).fill(0);
  };
  const out = {};
  for (const [k, t] of tally) {
    const [id, type] = k.split('|');
    const board = Math.round(t.board / t.days.size);
    const alight = Math.round(t.alight / t.days.size);
    const sh = shape.get(id);
    const hourly = sh ? { board: spread(board, sh.b), alight: spread(alight, sh.a) } : null;
    out[id] ??= {};
    out[id][type] = hourly
      ? { days: t.days.size, board: hourly.board.reduce((s, v) => s + v, 0), alight: hourly.alight.reduce((s, v) => s + v, 0), hourly }
      : { days: t.days.size, board, alight };
  }
  if (unknown.size) issues.push(`[이용객] 수도권 교통카드 자료에서 우리 역을 찾지 못한 것 ${unknown.size}개: ${[...unknown].slice(0, 20).join(', ')}${unknown.size > 20 ? ' …' : ''}`);
  const month = data.month;
  return { stations: out, period: `${month.slice(0, 4)}년 ${Number(month.slice(4))}월` };
}

/** 서울 열린데이터광장 역 목록의 노선 이름 → 우리 수도권 노선 id */
const LIST_LINES = {
  '01호선': ['S1', 'S1K', 'S1G', 'S1D'],
  '02호선': ['S2', 'S2A', 'S2B'],
  '03호선': ['S3'],
  '04호선': ['S4'],
  '05호선': ['S5', 'S5M'],
  '06호선': ['S6'],
  '07호선': ['S7'],
  '08호선': ['S8'],
  '09호선': ['S9'],
  경의선: ['SGJ', 'SGJB'],
  경춘선: ['SGC', 'SGCB'],
  수인분당선: ['SSB'],
  경강선: ['SGG'],
  서해선: ['SSH'],
  신분당선: ['SSBD'],
  공항철도: ['SAR'],
  'GTX-A': ['SGTXA'],
  인천선: ['SI1'],
  인천2호선: ['SI2'],
  우이신설경전철: ['SUI'],
  신림선: ['SSL'],
  의정부경전철: ['SUJ'],
  용인경전철: ['SEV'],
  김포도시철도: ['SGM'],
};

/**
 * 수도권 역에 역명판 번호(number, 예: 제기동 125, 청량리 경의·중앙선 K117)를 붙인다(서울 열린데이터광장 역 목록, npm run seoul-riders).
 * 같은 노선 묶음의 같은 이름 역에 붙인다. 자료가 없으면 그대로 둔다.
 */
export function addSudogwonNumbers(raw, stations, issues) {
  const file = 'seoul-subway/stations.json';
  if (!existsSync(raw(file))) return;
  const data = JSON.parse(readFileSync(raw(file), 'utf8'));
  const key = (name) => normalizeName(String(name ?? '').replace(/\([^)]*\)/g, '')).replace(/역$/, '');
  const byLineName = new Map(stations.map((s) => [`${s.line}|${key(s.name)}`, s]));
  let placed = 0;
  for (const [line, name, number] of data.rows) {
    for (const id of LIST_LINES[line] ?? []) {
      const s = byLineName.get(`${id}|${key(name)}`);
      if (s && number) {
        s.number ??= String(number);
        placed += 1;
      }
    }
  }
  const sd = stations.filter((s) => LIST_LINES_IDS.has(s.line));
  const without = sd.filter((s) => !s.number);
  if (without.length) issues.push(`[역] 수도권 역명판 번호가 없는 역 ${without.length}곳(서울 열린데이터광장 역 목록에 없음): ${without.slice(0, 15).map((s) => `${s.name}(${s.line})`).join(', ')}${without.length > 15 ? ' …' : ''}`);
  return placed;
}
const LIST_LINES_IDS = new Set(Object.values(LIST_LINES).flat());
