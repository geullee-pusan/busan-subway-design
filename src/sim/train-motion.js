// 하루 운행 그림에서 열차가 어디쯤 있는지 셈한다. 순수 함수만 둔다.
//
// 노선마다 양쪽 끝에서 배차 간격마다 열차가 떠난다. 역 사이는 달리는 시간(runS)만큼 걸리고,
// 중간 역에서는 서는 시간(dwellS)만큼 머문다. 같은 시각을 물으면 늘 같은 자리를 돌려준다.

/** 첫차와 막차가 끝 역을 떠나는 시각(시). 부산 도시철도 시각표의 대략(05:30~23:30)이다. */
export const SERVICE = { firstHour: 5.5, lastHour: 23.5 };

/**
 * 세상(buildWorld/withDesign)에서 노선마다 역 차례와 시간표 모양을 만든다.
 * @param {{lines: object[], links: {line: string, from: string, to: string, runS: number}[]}} world
 * @returns {{line: string, stops: string[], runS: number[], dwellS: number, headwayMin: number}[]}
 */
export function lineRoutes(world) {
  const routes = [];
  for (const line of world.lines) {
    const links = world.links.filter((link) => link.line === line.id);
    if (links.length === 0) continue;
    const next = new Map();
    const degree = new Map();
    const add = (a, b, runS) => {
      if (!next.has(a)) next.set(a, []);
      next.get(a).push({ to: b, runS });
      degree.set(a, (degree.get(a) ?? 0) + 1);
    };
    for (const link of links) {
      add(link.from, link.to, link.runS);
      add(link.to, link.from, link.runS);
    }
    // 끝 역(이웃이 하나)에서 시작한다. 자료에 먼저 나온 쪽을 고른다(늘 같은 차례).
    const ends = links.flatMap((link) => [link.from, link.to]).filter((id) => degree.get(id) === 1);
    let at = ends[0] ?? links[0].from;
    const stops = [at];
    const runS = [];
    const seen = new Set([at]);
    for (;;) {
      const step = (next.get(at) ?? []).find(({ to }) => !seen.has(to));
      if (!step) break;
      runS.push(step.runS);
      stops.push(step.to);
      seen.add(step.to);
      at = step.to;
    }
    if (stops.length < 2) continue;
    routes.push({ line: line.id, stops, runS, dwellS: line.dwellS ?? 0, headwayMin: line.headwayMin });
  }
  return routes;
}

/** 끝 역을 떠나고 elapsed초 뒤 열차가 있는 자리(역 차례, 소수). 도착했으면 null */
function positionAfter(runS, dwellS, elapsed) {
  let t = elapsed;
  for (let i = 0; i < runS.length; i++) {
    if (t < runS[i]) return i + t / runS[i];
    t -= runS[i];
    // 마지막 역에 닿으면 끝이다. 중간 역에서는 서 있는다.
    if (i === runS.length - 1) return null;
    if (t < dwellS) return i + 1;
    t -= dwellS;
  }
  return null;
}

/** 끝 역에서 끝 역까지 걸리는 시간(초) */
export function tripSeconds(route) {
  return route.runS.reduce((sum, s) => sum + s, 0) + route.dwellS * Math.max(0, route.runS.length - 1);
}

/**
 * 어떤 시각에 이 노선을 달리는 열차들의 자리.
 * @param {ReturnType<typeof lineRoutes>[number]} route
 * @param {number} hour 시각(시, 소수). 예: 7.5 = 07:30
 * @returns {{direction: 1|-1, at: number}[]} at은 route.stops 차례로 본 자리(0 = 첫 역, 1.5 = 둘째와 셋째 역 사이 가운데)
 */
export function trainsAt(route, hour, service = SERVICE) {
  const headwayHours = route.headwayMin / 60;
  if (!(headwayHours > 0)) return [];
  const trip = tripSeconds(route);
  const reversed = [...route.runS].reverse();
  const last = route.stops.length - 1;
  const out = [];
  const lastDeparture = Math.min(hour, service.lastHour);
  if (lastDeparture < service.firstHour) return out;
  const kMax = Math.floor((lastDeparture - service.firstHour) / headwayHours + 1e-9);
  const kMin = Math.max(0, Math.ceil((hour - trip / 3600 - service.firstHour) / headwayHours - 1e-9));
  for (let k = kMin; k <= kMax; k++) {
    const elapsed = (hour - (service.firstHour + k * headwayHours)) * 3600;
    if (elapsed < 0) continue;
    const forward = positionAfter(route.runS, route.dwellS, elapsed);
    if (forward !== null) out.push({ direction: 1, at: forward });
    const backward = positionAfter(reversed, route.dwellS, elapsed);
    if (backward !== null) out.push({ direction: -1, at: last - backward });
  }
  return out;
}
