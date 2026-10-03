// 내가 그린 노선을 '세상'에 넣는다. 순수 함수만 둔다.
// 새 노선의 역은 설계한 칸에 놓이고, 역 사이 시간은 노선 종류의 표정속도로 잰다.
// 이미 역이 있는 칸에 놓은 역은 갈아타는 역이 된다.

export const NEW_LINE_ID = 'NEW';

/**
 * @param {object} world buildWorld가 만든 세상
 * @param {{path: number[], stations: number[], kind: string, trainsPerHour: number, stationNames?: Record<string, string>, lineName?: string}} design
 *   stationNames는 정해 둔 역 이름(칸 번호 → 이름). 없으면 "새 역 n"으로 부른다.
 *   busStopPoints(버스 노선): 칸 번호 → 고른 실제 버스 정류장 자리. 있으면 역을 그 자리에 둔다(걷는 거리도 그 자리로 센다).
 *   busStopList(버스 노선): 칸 번호 → 그 칸에 고른 실제 정류장들({index, name, x, y}, 선 방향 차례).
 *     한 칸에 정류장이 여럿이면 차례대로 모두 역으로 둔다(orderStopsInCell로 차례를 정한다).
 * @param {{cols: number}} grid
 * @param {object} tables src/content/rules.json의 tables
 * @param {string} [lineId] 새 노선 번호(NEW, NEW2 …). 새 노선이 여럿이면 노선마다 다르다(src/sim/plan.js).
 */
export function withDesign(world, design, grid, tables, lineId = NEW_LINE_ID) {
  const kind = tables.lineKinds[design.kind] ?? tables.lineKinds['경전철'];
  const onPath = design.path.map((cell, order) => ({ cell, order })).filter(({ cell }) => design.stations.includes(cell));
  if (onPath.length < 2) return world;

  // 기존 역과 같은 칸에 놓은 역은 그 역 자리에 둔다(갈아타는 역). 걷는 거리도 그 자리로 센다.
  const existingAt = new Map();
  for (const station of world.stations) {
    const cell = Math.floor(station.y) * grid.cols + Math.floor(station.x);
    if (!existingAt.has(cell)) existingAt.set(cell, station);
  }
  const stations = [];
  for (const { cell, order } of onPath) {
    const base = {
      id: `${lineId}-${cell}`,
      line: lineId,
      name: design.stationNames?.[cell] ?? `새 역 ${order + 1}`,
      cell,
      order,
      x: design.busStopPoints?.[cell]?.x ?? existingAt.get(cell)?.x ?? (cell % grid.cols) + 0.5,
      y: design.busStopPoints?.[cell]?.y ?? existingAt.get(cell)?.y ?? Math.floor(cell / grid.cols) + 0.5,
    };
    const list = design.busStopList?.[cell] ?? [];
    if (list.length === 0) {
      stations.push(base);
      continue;
    }
    // 실제 정류장: 첫 정류장은 칸 이름(사람이 고친 이름이 먼저), 나머지는 정류장 이름
    list.forEach((stop, k) => {
      stations.push({
        ...base,
        id: k === 0 ? base.id : `${base.id}-${k + 1}`,
        name: k === 0 ? base.name : stop.name,
        x: stop.x,
        y: stop.y,
        stopIndex: stop.index,
      });
    });
  }

  // 역 사이: 칸이 다르면 선을 따라 칸 수(km), 같은 칸 정류장끼리는 곧은 거리(100m보다 짧게는 세지 않는다)
  const links = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const km = a.cell === b.cell ? Math.max(0.1, Math.hypot(a.x - b.x, a.y - b.y)) : b.order - a.order;
    links.push({
      line: lineId,
      from: a.id,
      to: b.id,
      distanceM: Math.round(km * 1000),
      runS: Math.round((km / kind.speedKmh) * 3600),
    });
  }
  for (const station of stations) delete station.order;

  // 같은 칸에 있는 기존 역과 묶어 갈아타는 역으로 만든다.
  const byCell = new Map();
  for (const station of world.stations) {
    const cell = Math.floor(station.y) * grid.cols + Math.floor(station.x);
    if (!byCell.has(cell)) byCell.set(cell, []);
    byCell.get(cell).push(station.id);
  }
  const transfers = [...world.transfers];
  for (const station of stations) {
    const neighbours = byCell.get(station.cell) ?? [];
    if (neighbours.length === 0) continue;
    const group = transfers.find((t) => neighbours.some((id) => t.stations.includes(id)));
    if (group) {
      transfers[transfers.indexOf(group)] = { ...group, stations: [...group.stations, station.id] };
    } else {
      transfers.push({ id: `T-${station.id}`, name: station.name, stations: [...neighbours, station.id], source: '내가 그린 노선' });
    }
  }

  const line = {
    id: lineId,
    name: design.lineName ?? '새 노선',
    dwellS: 0,
    headwayMin: 60 / design.trainsPerHour,
    headwayIsGuess: false,
    trainsPerHourPeak: design.trainsPerHour,
    capacityPerTrain: kind.capacityPerTrain,
  };

  return {
    ...world,
    stations: [...world.stations, ...stations],
    links: [...world.links, ...links],
    transfers,
    lines: [...world.lines, line],
  };
}

/**
 * 한 칸에 고른 정류장들을 선이 지나가는 방향 차례로 늘어놓는다(앞 칸에서 다음 칸 쪽으로).
 * 칸이 선 위에 없거나 선이 한 칸뿐이면 서쪽에서 동쪽, 북쪽에서 남쪽 차례.
 * @param {number[]} path 선이 지나는 칸 차례
 * @param {number} cell 정류장들이 있는 칸
 * @param {{x: number, y: number}[]} stops
 * @param {number} cols 격자 가로 칸 수
 */
export function orderStopsInCell(path, cell, stops, cols) {
  const center = (c) => ({ x: (c % cols) + 0.5, y: Math.floor(c / cols) + 0.5 });
  const at = path.indexOf(cell);
  let direction = { x: 1, y: 0.001 };
  if (at >= 0 && path.length > 1) {
    const before = center(path[Math.max(0, at - 1)]);
    const after = center(path[Math.min(path.length - 1, at + 1)]);
    direction = { x: after.x - before.x, y: after.y - before.y };
  }
  const key = (stop) => stop.x * direction.x + stop.y * direction.y;
  return [...stops].sort((a, b) => key(a) - key(b) || a.x - b.x || a.y - b.y);
}
