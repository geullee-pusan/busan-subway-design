// 노선도(단순화한 지도) 좌표를 만든다.
//
// 실제 지도와 견줘 볼 수 있게, 환승역과 종점은 실제 자리에 그대로 두고(기준점),
// 기준점 사이의 역들은 두 기준점을 잇는 곧은 선 위에 같은 간격으로 놓는다.
// 그래서 노선이 곧게 펴지고 역 간격이 고르게 보인다. 환승역은 두 노선에서 같은 자리다.

/**
 * @param {object[]} lines 노선(stations: 역 id 순서)
 * @param {object[]} stations 역(x, y는 격자 칸 단위)
 * @returns {{positions: Record<string, {x: number, y: number}>, anchors: string[]}}
 */
export function buildSchematic(lines, stations) {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const anchors = new Set();
  for (const line of lines) {
    anchors.add(line.stations[0]);
    anchors.add(line.stations.at(-1));
    for (const id of line.stations) if (byId.get(id).transfer) anchors.add(id);
  }

  const positions = {};
  const round = (v) => Math.round(v * 1000) / 1000;
  for (const id of anchors) {
    const s = byId.get(id);
    positions[id] = { x: round(s.x), y: round(s.y) };
  }

  for (const line of lines) {
    const ids = line.stations;
    const anchorIndexes = ids.map((id, i) => (anchors.has(id) ? i : -1)).filter((i) => i !== -1);
    for (let k = 0; k + 1 < anchorIndexes.length; k++) {
      const from = anchorIndexes[k];
      const to = anchorIndexes[k + 1];
      const a = positions[ids[from]];
      const b = positions[ids[to]];
      const steps = to - from;
      for (let i = 1; i < steps; i++) {
        positions[ids[from + i]] = {
          x: round(a.x + ((b.x - a.x) * i) / steps),
          y: round(a.y + ((b.y - a.y) * i) / steps),
        };
      }
    }
  }
  return { positions, anchors: [...anchors].sort() };
}
