// 앞으로 생길 노선(양산선, 사상–하단선)을 만든다.
// 역 자리는 OpenStreetMap의 공사 중 역 노드에서 가져오고, 순서는 노선을 따라 이은다.
// 역 사이 시간은 노선 종류의 표정속도로 어림한다(자료 없음).
import { readFileSync } from 'node:fs';
import { metersBetween } from './network.mjs';

/** 노선마다 어떤 역을, 어떤 순서로 쓸지 적어 둔다. 이름은 OSM 역 이름이다. */
const FUTURE_LINES = [
  {
    id: 'YS',
    label: '양산',
    name: '양산선',
    fullName: '양산선(양산밸리라인)',
    status: '개통 예정',
    operator: '부산교통공사',
    kind: '경전철',
    factKey: 'YS',
    // 노포는 이미 있는 역이다. 새 역은 OSM 공사 중 역에서 가져온다.
    existingStart: { stationId: '134', name: '노포' },
    osmNames: ['사송', '내송', '양산시청', '양산중앙', '신기', '북정'],
  },
  {
    id: 'SH',
    label: '사하',
    name: '사상–하단선',
    fullName: '사상–하단선',
    status: '공사 중',
    operator: '부산교통공사',
    kind: '경전철',
    factKey: 'SH',
    osmNames: ['사상', '새벽시장', '사상스마트시티', '학장', '엄궁', '동아대', '하단'],
    osmNetwork: '동남권 전철',
  },
];

/**
 * @param {(p: string) => string} raw
 * @param {object[]} stations 이미 있는 역(data/build/stations.json)
 * @param {object} facts data/facts.json
 * @param {object} tables src/content/rules.json의 tables
 * @param {string[]} issues
 */
export function buildFutureLines(raw, stations, facts, tables, issues) {
  const osm = JSON.parse(readFileSync(raw('osm/stations.json'), 'utf8'));
  const nodes = osm.elements.filter((e) => {
    const tags = e.tags ?? {};
    return tags['construction:railway'] === 'station' || (tags.railway === 'construction' && /station/.test(tags.construction ?? ''));
  });

  const lines = [];
  const futureStations = [];
  const links = [];
  const transfers = [];

  for (const def of FUTURE_LINES) {
    const kind = tables.lineKinds[def.kind];
    const fact = facts.planned?.find((p) => p.id === def.factKey);
    const picked = [];

    if (def.existingStart) {
      const start = stations.find((s) => s.id === def.existingStart.stationId);
      if (start) picked.push({ id: `${def.id}-${start.name}`, name: start.name, lat: start.lat, lon: start.lon, transferWith: [start.id] });
    }
    for (const name of def.osmNames) {
      const candidates = nodes.filter((n) => (n.tags.name ?? n.tags['name:ko']) === name);
      const node = def.osmNetwork ? (candidates.find((n) => n.tags.network === def.osmNetwork) ?? candidates[0]) : candidates[0];
      if (!node) {
        issues.push(`[앞으로 생길 노선] ${def.name}의 ${name}역을 OSM에서 찾지 못했어요.`);
        continue;
      }
      const lat = node.lat ?? node.center?.lat;
      const lon = node.lon ?? node.center?.lon;
      // 같은 칸 가까이에 이미 역이 있으면 갈아타는 역으로 묶는다(300m 안).
      const near = stations.filter((s) => metersBetween(s, { lat, lon }) <= 300).map((s) => s.id);
      picked.push({ id: `${def.id}-${name}`, name, lat, lon, transferWith: near, osmId: node.id });
    }

    if (picked.length < 2) {
      issues.push(`[앞으로 생길 노선] ${def.name}의 역을 충분히 찾지 못했어요.`);
      continue;
    }

    // 직선거리 합으로 길이를 재고, 공식 길이가 있으면 그 비율로 늘여 맞춘다.
    const straight = [];
    for (let i = 0; i + 1 < picked.length; i++) straight.push(metersBetween(picked[i], picked[i + 1]));
    const straightSum = straight.reduce((s, v) => s + v, 0);
    const officialKm = fact?.lengthKm ?? null;
    const scale = officialKm ? (officialKm * 1000) / straightSum : 1;

    picked.forEach((station) => {
      futureStations.push({
        id: station.id,
        line: def.id,
        name: station.name,
        lat: station.lat,
        lon: station.lon,
        coordSource: station.osmId ? `OSM node ${station.osmId}(공사 중 역)` : '기존 역 위치',
      });
      if (station.transferWith.length > 0) {
        transfers.push({ id: `T-${station.id}`, name: station.name, stations: [...station.transferWith, station.id], source: '같은 자리(300m 안)' });
      }
    });

    for (let i = 0; i + 1 < picked.length; i++) {
      const distanceM = Math.round(straight[i] * scale);
      links.push({
        line: def.id,
        from: picked[i].id,
        to: picked[i + 1].id,
        distanceM,
        runS: Math.round((distanceM / 1000 / kind.speedKmh) * 3600),
        distanceSource: officialKm ? `OSM 역 사이 직선거리를 공식 길이 ${officialKm}km에 맞춰 늘임` : 'OSM 직선거리',
        runSource: `추정: ${def.kind} 표정속도 ${kind.speedKmh}km/h`,
      });
    }

    lines.push({
      id: def.id,
      label: def.label,
      name: def.name,
      fullName: def.fullName,
      operator: def.operator,
      status: def.status,
      stations: picked.map((s) => s.id),
      lengthKm: officialKm,
      lengthSource: fact ? '공식 발표(data/facts.json)' : null,
      runSource: `추정: ${def.kind} 표정속도`,
      dwellS: 0,
      dwellSource: '역 사이 시간에 포함',
      headwayMin: null,
      capacityPerTrain: kind.capacityPerTrain,
      capacitySource: `${def.kind} 정원(rules.json)`,
      kind: def.kind,
      opening: fact?.opening ?? null,
      color: null,
    });
  }

  return { lines, stations: futureStations, links, transfers };
}
