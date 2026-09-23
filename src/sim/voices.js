// 주민 목소리 카드(docs/SPEC.md 8장). 순수 함수만 둔다.
// 규칙은 늘 같은 결과를 낸다. 한 번에 세 장까지, 영향받는 사람이 많은 순서로 보여 준다.

/** 칸 번호 → [열, 행] */
function colRow(grid, index) {
  return [index % grid.cols, Math.floor(index / grid.cols)];
}

function populationAt(grid, col, row) {
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return 0;
  return grid.population[row][col];
}

function terrainAt(grid, col, row) {
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
  return grid.terrain[row][col];
}

/**
 * @param {object} p
 * @param {{path: number[], stations: number[]}} p.design
 * @param {object} p.grid data/build/grid.json
 * @param {{col: number, row: number}[]} p.existingStations 이미 있는 역(격자 안)
 * @param {object} p.rules 규칙 값
 * @returns {{id: string, text: string, people: number, why: string, closerThanM?: number}[]}
 */
export function residentVoices({ design, grid, existingStations, rules }) {
  const voices = [];
  const stationCells = new Set(design.stations);
  const existingCells = new Set(existingStations.map((s) => s.row * grid.cols + s.col));
  const dense = rules.voiceDensePeople;

  // 1. 높은 다리(들판 구간)가 사람 많은 칸 옆을 지나요 → 소음이 걱정돼요
  {
    const neighbours = new Set();
    for (const cell of design.path) {
      const [col, row] = colRow(grid, cell);
      if (terrainAt(grid, col, row) !== 'field') continue;
      for (const [dc, dr] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        if (populationAt(grid, col + dc, row + dr) >= dense) neighbours.add((row + dr) * grid.cols + (col + dc));
      }
    }
    let people = 0;
    for (const cell of neighbours) {
      const [col, row] = colRow(grid, cell);
      people += populationAt(grid, col, row);
    }
    if (people > 0) {
      voices.push({
        id: 'noise',
        text: '소음이 걱정돼요.',
        people,
        why: '들판 위로 높은 다리를 놓으면 옆 동네에 소리가 들려요.',
      });
    }
  }

  // 2. 노선은 지나가는데 1km 안에 역이 없어요 → 우리 동네에도 역이 있으면 좋겠어요
  {
    const near = rules.voiceNearCells;
    const allStationCells = [...stationCells, ...existingCells].map((cell) => colRow(grid, cell));
    let people = 0;
    const skipped = [];
    for (const cell of design.path) {
      const [col, row] = colRow(grid, cell);
      for (const [dc, dr] of [
        [0, 0],
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const c = col + dc;
        const r = row + dr;
        const key = r * grid.cols + c;
        if (skipped.includes(key)) continue;
        const value = populationAt(grid, c, r);
        if (value < dense) continue;
        const hasStation = allStationCells.some(([sc, sr]) => Math.abs(sc - c) + Math.abs(sr - r) <= near);
        if (hasStation) continue;
        skipped.push(key);
        people += value;
      }
    }
    if (people > 0) {
      voices.push({
        id: 'no-station',
        text: '우리 동네에도 역이 있으면 좋겠어요.',
        people,
        why: '노선은 지나가는데 걸어갈 만한 곳에 역이 없어요.',
      });
    }
  }

  // 3. 역이 너무 자주 서요 → 역이 너무 자주 서서 느려요
  {
    const order = design.path.map((cell, i) => ({ cell, i })).filter(({ cell }) => stationCells.has(cell));
    const closeStations = new Set();
    for (let i = 0; i + 1 < order.length; i++) {
      const meters = (order[i + 1].i - order[i].i) * grid.cellSizeM;
      if (meters <= rules.voiceTooCloseM) {
        closeStations.add(order[i].cell);
        closeStations.add(order[i + 1].cell);
      }
    }
    let people = 0;
    for (const cell of closeStations) {
      const [col, row] = colRow(grid, cell);
      people += populationAt(grid, col, row);
    }
    if (closeStations.size > 0) {
      voices.push({
        id: 'too-close',
        text: '역이 너무 자주 서서 느려요.',
        people,
        why: '역 사이가 가까우면 열차가 자주 서요.',
        // 거리는 화면에서 "1km" 꼴로 고쳐 쓴다(src/ui/format.js).
        closerThanM: rules.voiceTooCloseM,
      });
    }
  }

  // 4. 갈아타는 역이 생겼어요 → 갈아타기가 편해졌어요
  {
    const transferCells = [...stationCells].filter((cell) => existingCells.has(cell));
    let people = 0;
    for (const cell of transferCells) {
      const [col, row] = colRow(grid, cell);
      for (const [dc, dr] of [
        [0, 0],
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        people += populationAt(grid, col + dc, row + dr);
      }
    }
    if (transferCells.length > 0) {
      voices.push({
        id: 'transfer',
        text: '갈아타기가 편해졌어요.',
        people,
        why: '이미 있던 역에 새 역을 놓아서 갈아탈 수 있어요.',
      });
    }
  }

  // 영향받는 사람이 많은 순서로 세 장까지. 같으면 규칙 순서대로(늘 같은 결과).
  return voices
    .map((voice, index) => ({ voice, index }))
    .sort((a, b) => b.voice.people - a.voice.people || a.index - b.index)
    .slice(0, 3)
    .map(({ voice }) => voice);
}
