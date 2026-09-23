// 역을 눌렀을 때 보여줄 정보: 영문 이름, 주소, 이름의 유래, 개통일.
//  - 영문·주소·유래: 부산교통공사 도시철도 역정보(15050408, 2021년). 1~4호선만 있다.
//  - 개통일: data/facts.json의 구간별 개통일에서 역마다 찾는다.
import { readCsv } from '../lib/csv.mjs';
import { normalizeName } from './network.mjs';

/**
 * 구간별 개통일에서 역의 개통일을 찾는다.
 * openings: [{date, from, to}] (from~to는 그날 함께 연 구간의 양 끝 역 이름)
 */
export function openingOf(line, stationName, openings) {
  const order = line.stations;
  const index = order.indexOf(stationName);
  if (index === -1) return null;
  let best = null;
  let bestSpan = Infinity;
  for (const section of openings) {
    const a = order.indexOf(section.from);
    const b = order.indexOf(section.to);
    if (a === -1 || b === -1) continue;
    if (index < Math.min(a, b) || index > Math.max(a, b)) continue;
    // 구간이 겹치면 좁은 구간이 이긴다(나중에 따로 연 역).
    const span = Math.abs(b - a);
    if (span < bestSpan) {
      best = section;
      bestSpan = span;
    }
  }
  return best;
}

/**
 * @param {(p: string) => string} raw
 * @param {object[]} stations data/build/stations.json의 역들
 * @param {object[]} lines 노선
 * @param {object} facts data/facts.json
 * @param {string[]} issues
 */
export function buildStationInfo(raw, stations, lines, facts, issues) {
  const detail = readCsv(raw('datagokr/15050408.csv')).records;
  const byCode = new Map(detail.map((r) => [r['역코드'], r]));
  const info = {};

  for (const station of stations) {
    const row = byCode.get(station.id);
    const line = lines.find((l) => l.id === station.line);
    const names = line.stations.map((id) => stations.find((s) => s.id === id).name);
    const sections = facts.openings?.[station.line] ?? [];
    const section = openingOf({ stations: names }, station.name, sections);
    if (sections.length > 0 && !section) {
      issues.push(`[역 정보] ${line.name} ${station.name}의 개통일을 찾지 못했어요.`);
    }
    info[station.id] = {
      name: station.name,
      line: station.line,
      nameEn: station.nameEn ?? null,
      address: row?.['역주소'] ?? null,
      origin: row?.['역명및 지명유래'] || null,
      openedOn: section?.date ?? null,
      openedWith: section ? `${section.from}~${section.to}` : null,
    };
  }
  return info;
}
