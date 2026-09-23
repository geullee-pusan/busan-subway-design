// 시승 모드. 내 노선 열차 한 대를 타고 끝 역에서 끝 역까지 간다. 순수 함수만 둔다.
//
// 하루 운행 결과(runDay)에서 구간마다 지나간 사람과 역마다 타고 내린 사람을 가져와
// 고른 시간대의 열차 한 대 몫으로 나눈다.
//   열차 한 대 몫 = 하루 사람 수 × 그 시간대 몫(hourShape) ÷ 한 시간에 오는 열차 수
// 모델은 갈 때와 올 때를 똑같이 센다. 그래서 한 방향은 구간 사람 수의 절반이다.
// 역에서 타고 내린 사람은 열차 안 사람 수가 맞도록 나눈다(탄 사람 − 내린 사람 = 늘어난 사람).

/**
 * @param {object} p
 * @param {{id: string, name: string}[]} p.stops 새 노선 역(선을 따라 차례대로)
 * @param {{from: string, to: string, people: number, runS: number}[]} p.links 새 노선 구간(하루, 두 방향 합)
 * @param {{id: string, board: number, alight: number}[]} p.stations 역마다 하루 탄 사람과 내린 사람
 * @param {number} p.hourShare 고른 시간대가 하루에서 차지하는 몫(0~1)
 * @param {number} p.trainsPerHour 한 시간에 오는 열차 수
 * @param {number} p.capacity 열차 한 대 정원
 * @param {1|-1} [p.direction] 1 = 첫 역에서 끝 역으로(하행), -1 = 끝 역에서 첫 역으로(상행)
 * @returns {{
 *   stops: {id: string, name: string, on: number, off: number, load: number, ratio: number, runS: number|null}[],
 *   capacity: number
 * }}
 *   load: 그 역을 떠날 때 열차 안 사람 수(마지막 역은 0), ratio: load ÷ 정원, runS: 다음 역까지 걸리는 시간(초)
 */
export function rideTrip({ stops, links, stations, hourShare, trainsPerHour, capacity, direction = 1 }) {
  const order = direction === 1 ? stops : [...stops].reverse();
  const perTrain = trainsPerHour > 0 ? hourShare / trainsPerHour : 0;
  const linkOf = (a, b) => links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));
  const stationOf = new Map(stations.map((s) => [s.id, s]));

  // 역을 떠날 때 열차 안 사람(한 방향 = 두 방향 합의 절반)
  const loads = order.map((stop, i) => {
    if (i === order.length - 1) return 0;
    const link = linkOf(stop.id, order[i + 1].id);
    return Math.round(((link?.people ?? 0) / 2) * perTrain);
  });

  const result = order.map((stop, i) => {
    const before = i === 0 ? 0 : loads[i - 1];
    const after = loads[i];
    const net = after - before;
    const station = stationOf.get(stop.id);
    // 이 방향 열차 한 대에서 타고 내리는 사람의 보통 크기(하루 탄+내린 사람을 두 방향, 두 가지로 나눈 것)
    const usual = station ? ((station.board + station.alight) / 4) * perTrain : 0;
    let on;
    let off;
    if (i === 0) {
      on = after;
      off = 0;
    } else if (i === order.length - 1) {
      on = 0;
      off = before;
    } else {
      // 늘어난 만큼은 꼭 타고, 줄어든 만큼은 꼭 내린다. 남는 만큼은 같은 수가 타고 내린다.
      const both = Math.max(0, Math.round(usual - Math.abs(net) / 2));
      on = both + Math.max(net, 0);
      off = both + Math.max(-net, 0);
      // 내리는 사람은 타고 있던 사람보다 많을 수 없다.
      if (off > before) {
        on -= off - before;
        off = before;
      }
    }
    const link = i < order.length - 1 ? linkOf(stop.id, order[i + 1].id) : null;
    return {
      id: stop.id,
      name: stop.name,
      on,
      off,
      load: after,
      ratio: capacity > 0 ? after / capacity : 0,
      runS: link ? link.runS : null,
    };
  });
  return { stops: result, capacity };
}

/**
 * 붐빔을 아이 말로. 앉을 자리는 정원의 약 4분의 1로 본다(차 한 칸 그림: 자리 14, 설 곳 36).
 * @param {number} ratio 열차 안 사람 ÷ 정원
 */
export function crowdWord(ratio) {
  if (ratio <= 0) return '아무도 없어요';
  if (ratio <= 0.28) return '앉을 자리가 있어요';
  if (ratio <= 0.7) return '서서 가는 사람이 있어요';
  if (ratio <= 1) return '붐벼요';
  return '아주 붐벼요';
}

/**
 * 두 역 사이 칸들의 지형으로 창밖 모습을 고른다.
 * 들판은 높은 다리, 강은 다리, 나머지(도시, 언덕, 산, 바다)는 땅속이나 바다 밑이다(src/content/rules.json 공사비 카드와 같다).
 * @param {string[]} terrains 두 역 사이 칸들의 지형(끝 칸 포함)
 * @returns {'땅속'|'바다 밑'|'강 위 다리'|'높은 다리'}
 */
export function windowScene(terrains) {
  const count = (name) => terrains.filter((t) => t === name).length;
  if (count('sea') > 0) return '바다 밑';
  if (count('river') > 0) return '강 위 다리';
  if (terrains.length > 0 && count('field') * 2 > terrains.length) return '높은 다리';
  return '땅속';
}
