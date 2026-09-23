// 내가 그린 노선을 '세상'에 넣는다. 순수 함수만 둔다.
// 새 노선의 역은 설계한 칸에 놓이고, 역 사이 시간은 노선 종류의 표정속도로 잰다.
// 이미 역이 있는 칸에 놓은 역은 갈아타는 역이 된다.

export const NEW_LINE_ID = 'NEW';

/**
 * @param {object} world buildWorld가 만든 세상
 * @param {{path: number[], stations: number[], kind: string, trainsPerHour: number, stationNames?: Record<string, string>}} design
 *   stationNames는 정해 둔 역 이름(칸 번호 → 이름). 없으면 "새 역 n"으로 부른다.
 * @param {{cols: number}} grid
 * @param {object} tables src/content/rules.json의 tables
 */
export function withDesign(world, design, grid, tables) {
  const kind = tables.lineKinds[design.kind] ?? tables.lineKinds['경전철'];
  const onPath = design.path.map((cell, order) => ({ cell, order })).filter(({ cell }) => design.stations.includes(cell));
  if (onPath.length < 2) return world;

  const stations = onPath.map(({ cell, order }) => ({
    id: `${NEW_LINE_ID}-${cell}`,
    line: NEW_LINE_ID,
    name: design.stationNames?.[cell] ?? `새 역 ${order + 1}`,
    cell,
    x: (cell % grid.cols) + 0.5,
    y: Math.floor(cell / grid.cols) + 0.5,
  }));

  const links = [];
  for (let i = 0; i + 1 < onPath.length; i++) {
    const km = onPath[i + 1].order - onPath[i].order;
    links.push({
      line: NEW_LINE_ID,
      from: stations[i].id,
      to: stations[i + 1].id,
      distanceM: km * 1000,
      runS: Math.round((km / kind.speedKmh) * 3600),
    });
  }

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
    id: NEW_LINE_ID,
    name: '새 노선',
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
