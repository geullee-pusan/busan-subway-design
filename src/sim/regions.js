// 지역별 노선 가르기. 순수 함수만 둔다.

/**
 * 부산 하루 운행 계산에서 수도권 도시철도(lines.json region '수도권')를 뺀다.
 * 역이 많아 하루 돌리기가 느려지고, 부산 사람들의 이동에는 쓰이지 않는다. 걸어서 여행하기는 모든 노선을 쓴다(src/model.js travelWorld).
 * @param {{lines: object[], stations: object[], links: object[], transfers: object[]}} network
 * @returns {{lines: object[], stations: object[], links: object[], transfers: object[]}}
 */
export function withoutSudogwon({ lines, stations, links, transfers }) {
  const far = new Set(lines.filter((l) => l.region === '수도권').map((l) => l.id));
  if (!far.size) return { lines, stations, links, transfers };
  const keepStations = stations.filter((s) => !far.has(s.line));
  const ids = new Set(keepStations.map((s) => s.id));
  return {
    lines: lines.filter((l) => !far.has(l.id)),
    stations: keepStations,
    links: links.filter((k) => !far.has(k.line)),
    transfers: transfers
      .map((g) => ({ ...g, stations: g.stations.filter((id) => ids.has(id)) }))
      .filter((g) => g.stations.length >= 2),
  };
}
