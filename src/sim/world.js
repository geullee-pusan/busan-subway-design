// 모델이 쓰는 '세상'을 만든다. 순수 함수만 둔다.
// 격자, 역, 노선, 중심지, 시간대 모양을 모델이 쓰기 좋은 모양으로 바꾼다.

/** 규칙 목록(src/content/rules.json)을 {id: 값} 꼴로 바꾼다. */
export function rulesFromCards(cards) {
  return Object.fromEntries(cards.map((rule) => [rule.id, rule.value]));
}

/**
 * @param {object} p
 * @param {object} p.grid data/build/grid.json
 * @param {object[]} p.stations data/build/stations.json의 stations
 * @param {object[]} p.lines data/build/lines.json의 lines
 * @param {object[]} p.links data/build/links.json의 links
 * @param {object[]} p.transfers data/build/transfers.json의 transfers
 * @param {object[]} p.places src/content/places.json의 places
 * @param {object[]} p.dongs data/build/dongs.json의 dongs
 * @param {number[]} p.hourShape 시간대 모양(24개)
 * @param {number} p.defaultHeadwayMin 시각표가 없는 노선의 배차 간격
 * @param {object[]} [p.anchorStations] 중심지 자리를 찾을 때 쓸 역 목록.
 *   옛날 부산에서는 역이 없어도 중심지는 그대로 있어야 해서, 지금의 역 목록을 넣는다.
 */
export function buildWorld({
  grid,
  stations,
  lines,
  links,
  transfers,
  places,
  dongs,
  hourShape,
  defaultHeadwayMin,
  anchorStations = stations,
}) {
  const zones = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const population = grid.population[row][col];
      if (population <= 0) continue;
      const terrain = grid.terrain[row][col];
      zones.push({
        index: zones.length,
        col,
        row,
        x: col + 0.5,
        y: row + 0.5,
        population,
        terrain,
        hilly: terrain === 'hill',
        outer: terrain === 'field',
      });
    }
  }

  const anchorById = new Map(anchorStations.map((s) => [s.id, s]));
  const dongByCode = new Map(dongs.map((d) => [d.code, d]));
  const centers = [];
  for (const place of places) {
    const anchor = place.at.station ? anchorById.get(place.at.station) : dongByCode.get(place.at.dong);
    if (!anchor) continue;
    const terrain = grid.terrain[Math.floor(anchor.y)]?.[Math.floor(anchor.x)];
    centers.push({
      id: place.id,
      name: place.name,
      type: place.type,
      size: place.size,
      x: anchor.x,
      y: anchor.y,
      hilly: terrain === 'hill',
      outer: terrain === 'field',
    });
  }

  const modelLines = lines.map((line) => ({
    id: line.id,
    name: line.name,
    dwellS: line.dwellS ?? 0,
    headwayMin: line.headwayMin ?? defaultHeadwayMin,
    headwayIsGuess: line.headwayMin === null || line.headwayMin === undefined,
    trainsPerHourPeak: line.trainsPerHourPeak ?? null,
    capacityPerTrain: line.capacityPerTrain ?? null,
  }));

  return {
    grid: { cols: grid.cols, rows: grid.rows, cellSizeM: grid.cellSizeM },
    zones,
    stations: stations.map((s) => ({ id: s.id, line: s.line, x: s.x, y: s.y, name: s.name })),
    links: links.map((l) => ({ line: l.line, from: l.from, to: l.to, runS: l.runS, distanceM: l.distanceM })),
    transfers,
    centers,
    lines: modelLines,
    hourShape,
  };
}
