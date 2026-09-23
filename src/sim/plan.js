// 새 노선 여러 개(설계 묶음). 순수 함수만 둔다.
//
// 설계 묶음은 이렇게 생겼다.
//   { lines: [설계, 설계, …] }  설계 하나는 src/sim/design.js의 모양에 id(NEW, NEW2 …)를 더한 것이다.
// 노선은 차례대로 세상에 넣는다. 뒤 노선의 역이 앞 노선의 역과 같은 칸이면 갈아타는 역이 된다
// (withDesign이 같은 칸의 역을 묶는다).
import { checkDesign, designCost } from './design.js';
import { NEW_LINE_ID, withDesign } from './design-world.js';

/** 한 번에 만들 수 있는 새 노선 수 */
export const MAX_LINES = 5;

/** 새 노선 번호: NEW, NEW2, NEW3 … */
export function lineIdAt(index) {
  return index === 0 ? NEW_LINE_ID : `${NEW_LINE_ID}${index + 1}`;
}

/** 새 노선 번호인가(NEW, NEW2 …) */
export function isNewLineId(id) {
  return new RegExp(`^${NEW_LINE_ID}\\d*$`).test(String(id));
}

/** 새 노선 역 번호인가(NEW-123, NEW2-456 …) */
export function isNewStationId(id) {
  return new RegExp(`^${NEW_LINE_ID}\\d*-\\d+$`).test(String(id));
}

/** 새 노선 역 번호 → {line, cell}. 새 역이 아니면 null */
export function splitNewStationId(id) {
  const match = new RegExp(`^(${NEW_LINE_ID}\\d*)-(\\d+)$`).exec(String(id));
  return match ? { line: match[1], cell: Number(match[2]) } : null;
}

/** 무엇이든 그린 노선(선이나 역이 하나라도 있는 것) */
export function usedLines(plan) {
  return plan.lines.filter((line) => line.path.length > 0 || line.stations.length > 0);
}

/** 설계 하나(옛 모양)도 설계 묶음으로 바꾼다. */
export function asPlan(designOrPlan) {
  if (Array.isArray(designOrPlan?.lines)) return designOrPlan;
  return { lines: [{ ...designOrPlan, id: designOrPlan.id ?? NEW_LINE_ID }] };
}

/** 설계 묶음을 세상에 넣는다(노선마다 차례로). */
export function withPlan(world, plan, grid, tables) {
  let next = world;
  for (const line of asPlan(plan).lines) next = withDesign(next, line, grid, tables, line.id);
  return next;
}

/**
 * 공사비 합계. 뒤 노선의 역이 앞 노선이나 기존 역과 같은 칸이면 갈아타는 역 값이다.
 * @returns {{lines: ReturnType<typeof designCost>[], total: number, lengthKm: number, stations: number}}
 */
export function planCost(plan, grid, rules, tables, existingStationCells = new Set()) {
  const taken = new Set(existingStationCells);
  const lines = [];
  for (const line of asPlan(plan).lines) {
    lines.push(designCost(line, grid, rules, tables, taken));
    for (const cell of line.stations) taken.add(cell);
  }
  return {
    lines,
    total: lines.reduce((sum, cost) => sum + cost.total, 0),
    lengthKm: lines.reduce((sum, cost) => sum + cost.lengthKm, 0),
    stations: lines.reduce((sum, cost) => sum + cost.stations.length, 0),
  };
}

/**
 * 설계 묶음이 쓸 만한지 본다. 그린 노선마다 checkDesign을 보고, 노선이 둘 넘으면 앞에 노선 이름을 붙인다.
 * 아무것도 그리지 않은 노선은 없는 것으로 본다.
 */
export function checkPlan(plan) {
  const lines = usedLines(asPlan(plan));
  if (lines.length === 0) return checkDesign({ path: [], stations: [] });
  const problems = [];
  for (const line of lines) {
    const check = checkDesign(line);
    const prefix = lines.length > 1 ? `${line.lineName ?? '새 노선'}: ` : '';
    for (const problem of check.problems) problems.push(prefix + problem);
  }
  return { ok: problems.length === 0, problems };
}
