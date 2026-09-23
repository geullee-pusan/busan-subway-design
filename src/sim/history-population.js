// 옛날 부산의 사는 사람(인구총조사)을 지금 구·군 칸 인구에 반영한다. 순수 함수만 둔다.
//
// 1. 인구총조사(1980, 1985, 1990, 1995, 2000)의 구별 인구를 지금 구·군으로 옮긴다.
//    그때 구가 지금 구 여럿을 품고 있으면(예: 1985년 동래구 = 지금 동래구 + 금정구 + 연제구)
//    지금 구가 모두 따로 나온 첫 해(1995년)의 비율로 나눈다.
// 2. 조사 사이의 해는 앞뒤 조사 해 사이를 곧게 이어 어림한다. 2000년 뒤는 지금 인구(격자)로 잇는다.
// 3. 칸마다 인구 × (그 해 그 구 인구 ÷ 지금 그 구 인구). 부산이 아닌 칸(양산, 김해 등)은 그대로 둔다.
// 그때 부산이 아니던 곳(1995년 전 기장군)은 부산으로 들어온 첫 해의 인구를 쓴다.

/**
 * 인구총조사 값을 지금 구·군 인구로 옮긴다.
 * @param {Record<string, Record<string, number>>} census 조사 해 → {그때 구 이름: 인구}
 * @param {Record<string, Record<string, string[]>>} groups 조사 해 → {그때 구 이름: [지금 구 이름 …]}. 없으면 이름이 같다고 본다.
 * @param {string} shareYear 나눌 때 쓸 비율의 해(지금 구가 모두 따로 나온 조사 해)
 * @returns {Record<string, Record<string, number>>} 조사 해 → {지금 구 이름: 인구}
 */
export function censusByCurrentDistrict(census, groups, shareYear) {
  const share = census[shareYear] ?? {};
  const out = {};
  for (const [year, values] of Object.entries(census)) {
    const map = groups[year] ?? {};
    const current = {};
    for (const [old, people] of Object.entries(values)) {
      const parts = map[old] ?? [old];
      const weights = parts.map((name) => share[name] ?? 0);
      const total = weights.reduce((sum, w) => sum + w, 0);
      parts.forEach((name, index) => {
        const part = total > 0 ? (people * weights[index]) / total : people / parts.length;
        current[name] = (current[name] ?? 0) + part;
      });
    }
    out[year] = current;
  }
  return out;
}

/**
 * 그 해의 지금 구·군별 인구(어림). 조사 해 사이는 곧게 잇는다.
 * @param {number} year
 * @param {{year: number, values: Record<string, number>}[]} anchors 해 차례로(마지막은 지금)
 * @returns {Record<string, number>}
 */
export function districtPopulationAt(year, anchors) {
  const sorted = [...anchors].sort((a, b) => a.year - b.year);
  const names = new Set(sorted.flatMap((a) => Object.keys(a.values)));
  const out = {};
  for (const name of names) {
    // 이 구 값이 있는 해만 쓴다(그때 부산이 아니던 곳은 처음 나온 해의 값으로 앞을 채운다).
    const known = sorted.filter((a) => Number.isFinite(a.values[name]));
    if (known.length === 0) continue;
    if (year <= known[0].year) {
      out[name] = known[0].values[name];
      continue;
    }
    if (year >= known.at(-1).year) {
      out[name] = known.at(-1).values[name];
      continue;
    }
    const after = known.findIndex((a) => a.year >= year);
    const a = known[after - 1];
    const b = known[after];
    const t = (year - a.year) / (b.year - a.year);
    out[name] = a.values[name] + (b.values[name] - a.values[name]) * t;
  }
  return out;
}

/**
 * 격자 칸마다 지금 구·군 이름(부산만). 부산이 아닌 칸은 null.
 * @param {{district: number[][], districts: {id: number, name: string}[]}} grid
 */
function busanDistrictOf(grid) {
  const names = new Map(grid.districts.map((d) => [d.id, d.name.startsWith('부산광역시 ') ? d.name.slice(6) : null]));
  return (row, col) => names.get(grid.district[row]?.[col]) ?? null;
}

/**
 * 그 해의 칸 인구(어림). 부산 칸은 구·군마다 비율을 곱하고, 부산이 아닌 칸은 지금 값 그대로 둔다.
 * @param {{rows: number, cols: number, population: number[][], district: number[][], districts: object[]}} grid
 * @param {number} year
 * @param {{nowYear: number, census: Record<string, Record<string, number>>}} table history-population.json
 * @returns {{population: number[][], factors: Record<string, number>, total: number, nowTotal: number}}
 */
export function populationRowsAt(grid, year, table) {
  const districtOf = busanDistrictOf(grid);
  // 지금 구·군 인구: 격자 칸을 더한다(지금 인구와 같은 자료).
  const now = {};
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const name = districtOf(row, col);
      if (name) now[name] = (now[name] ?? 0) + grid.population[row][col];
    }
  }
  const anchors = [
    ...Object.entries(table.census).map(([y, values]) => ({ year: Number(y), values })),
    { year: table.nowYear, values: now },
  ];
  const then = districtPopulationAt(year, anchors);
  const factors = {};
  for (const [name, people] of Object.entries(now)) factors[name] = people > 0 && then[name] !== undefined ? then[name] / people : 1;
  let total = 0;
  let nowTotal = 0;
  const population = grid.population.map((cells, row) =>
    cells.map((value, col) => {
      const name = districtOf(row, col);
      const next = name ? Math.round(value * (factors[name] ?? 1)) : value;
      if (name) {
        total += next;
        nowTotal += value;
      }
      return next;
    }),
  );
  return { population, factors, total, nowTotal };
}
