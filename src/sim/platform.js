// 역 안과 승강장에서 쓰는 방향 정보. 순수 함수만 둔다.

/**
 * 탈 역과 다음 역으로 열차 방향, 끝 역, 앞뒤 역을 찾는다.
 * @param {string[]} routeStops 노선의 역 차례(lineRoutes의 stops)
 * @param {string} boardId 타는 역
 * @param {string} nextId 열차가 다음에 설 역
 * @returns {null | {direction: 1|-1, terminusId: string, nextId: string, prevId: string|null,
 *   sides: {toward: string, next: string}[]}}
 *   sides: 역 안 표지판에 쓰는 양쪽(첫 역 쪽, 끝 역 쪽). 끝 역이면 한쪽만 있다.
 */
export function platformInfo(routeStops, boardId, nextId) {
  const at = routeStops.indexOf(boardId);
  const next = routeStops.indexOf(nextId);
  if (at < 0 || next < 0 || at === next) return null;
  const direction = next > at ? 1 : -1;
  const terminusId = direction === 1 ? routeStops.at(-1) : routeStops[0];
  const prevId = routeStops[at - direction] ?? null;
  const sides = [];
  if (at > 0) sides.push({ toward: routeStops[0], next: routeStops[at - 1] });
  if (at < routeStops.length - 1) sides.push({ toward: routeStops.at(-1), next: routeStops[at + 1] });
  return { direction, terminusId, nextId, prevId, sides };
}

/**
 * 열차진입 안내음 방향. 하행으로 보는 끝 역(downEnds)으로 가면 하행, 아니면 상행.
 * @param {Record<string, string>} downEnds 호선 → 하행 끝 역 이름
 * @returns {'up'|'down'|null} 자료가 없는 노선이면 null
 */
export function chimeSide(downEnds, line, terminusName) {
  const downEnd = downEnds[line];
  if (!downEnd) return null;
  return terminusName === downEnd ? 'down' : 'up';
}
