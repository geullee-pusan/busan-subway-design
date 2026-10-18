// 기차 타기 장면에 쓰는 계산. 순수 함수만 둔다.

/**
 * 두 역 사이를 따라 지나는 풍경 차례. 곧은 선 위의 칸을 500m마다 본다.
 * 산 칸: 고속열차는 터널(고속선은 산을 뚫고 간다), 일반열차는 산 옆을 지난다.
 * @param {{terrain: string[][], population: number[][], cols: number, rows: number}} grid
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {'고속'|'일반'} group
 * @param {Array<[number, number]>} [path] 선로 모양(격자 칸 좌표). 있으면 곧은 선 대신 이 길을 본다.
 * @returns {string[]} 'city' | 'field' | 'mountain' | 'tunnel' | 'river' | 'sea'
 */
export function segmentScenes(grid, a, b, group, path = null) {
  const line = path && path.length >= 2 ? path : [[a.x, a.y], [b.x, b.y]];
  const samples = [];
  for (let k = 1; k < line.length; k++) {
    const [x0, y0] = line[k - 1];
    const [x1, y1] = line[k];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 0; i < n; i++) samples.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  }
  const kindAt = ([x, y]) => {
    const col = Math.floor(x);
    const row = Math.floor(y);
    const terrain = grid.terrain[row]?.[col] ?? 'flat';
    const people = grid.population[row]?.[col] ?? 0;
    if (terrain === 'sea') return 'sea';
    if (terrain === 'river') return 'river';
    if (terrain === 'mountain') return group === '고속' ? 'tunnel' : 'mountain';
    if (people >= 3000) return 'city';
    return 'field';
  };
  // 이웃한 같은 풍경은 하나로 묶고, 아주 짧은 것(한 점)은 앞 풍경에 붙인다(강·바다는 짧아도 남긴다).
  const out = [];
  for (const p of samples) {
    const s = kindAt(p);
    if (out.at(-1)?.scene === s) out.at(-1).n += 1;
    else out.push({ scene: s, n: 1 });
  }
  const merged = [];
  for (const part of out) {
    if (part.n === 1 && merged.length && part.scene !== 'river' && part.scene !== 'sea') merged.at(-1).n += 1;
    else if (merged.at(-1)?.scene === part.scene) merged.at(-1).n += part.n;
    else merged.push({ ...part });
  }
  return merged.map((p) => p.scene);
}

/**
 * 두 기차역 사이 선로 모양(격자 칸 좌표)과 거리표 거리. 같은 노선에 두 역이 있으면 그 사이 토막을 잇는다.
 * @param {{lines: {stations: string[], links: {km: number}[], paths: number[][][]}[]}} rail
 * @returns {{points: Array<[number, number]>, km: number} | null} 같은 노선에 없으면 null
 */
export function railPathBetween(rail, a, b) {
  for (const line of rail.lines) {
    const i = line.stations.indexOf(a);
    const j = line.stations.indexOf(b);
    if (i < 0 || j < 0 || i === j) continue;
    const [lo, hi] = i < j ? [i, j] : [j, i];
    let points = [];
    let km = 0;
    for (let k = lo; k < hi; k++) {
      const piece = line.paths[k].map(([x, y]) => [x / 100, y / 100]);
      points = points.length ? [...points, ...piece.slice(1)] : piece;
      km += line.links[k].km;
    }
    if (i > j) points.reverse();
    return { points, km: Math.round(km * 10) / 10 };
  }
  return null;
}

/**
 * 역 사이 빠르기(어림): 처음 4분의 1은 빨라지고, 가운데는 같은 빠르기, 끝 4분의 1은 느려진다.
 * 평균 빠르기가 (거리 ÷ 시간)이 되도록 가운데 빠르기를 정하고, 열차의 운행 최고속도를 넘지 않게 한다.
 * @param {number} km 역 사이 거리
 * @param {number} minutes 역 사이 시간(앞 역 출발 → 다음 역 도착)
 * @param {number|null} topKmh 운행 최고속도(모르면 null)
 * @returns {(t: number) => number} t(0~1) → km/h
 */
export function speedProfile(km, minutes, topKmh) {
  if (!(minutes > 0) || !(km > 0)) return () => 0;
  const average = km / (minutes / 60);
  // 사다리꼴 모양의 평균 = 가운데 빠르기 × 0.75
  let cruise = average / 0.75;
  if (topKmh) cruise = Math.min(cruise, topKmh);
  return (t) => {
    const s = Math.max(0, Math.min(1, t));
    if (s < 0.25) return cruise * (s / 0.25);
    if (s > 0.75) return cruise * ((1 - s) / 0.25);
    return cruise;
  };
}

/**
 * 승차권의 호차와 자리(우리가 정한 규칙, 열차번호로 늘 같게).
 * 자리는 한 줄에 A~D 네 자리로 적는다. 원조 KTX(돌지 않는 좌석)는 짝수 줄을 역방향 자리로 본다.
 * @param {{no: number}} train
 * @param {number|null} cars 편성 칸 수(모르면 null)
 * @param {boolean} reverseSeats 돌지 않는 좌석인지
 */
export function seatFor(train, cars, reverseSeats = false) {
  const passengerCars = Math.max(1, (cars ?? 6) - (cars && cars >= 10 ? 2 : 0));
  const car = 1 + (train.no * 7) % passengerCars;
  const row = 1 + (train.no * 13) % 14;
  const letter = 'ABCD'[(train.no * 3) % 4];
  return { car, seat: `${row}${letter}`, reverse: reverseSeats && row % 2 === 0 };
}
