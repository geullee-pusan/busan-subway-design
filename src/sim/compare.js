// 모델 결과와 실제 승하차 자료를 견준다(docs/SPEC.md 5.6). 순수 함수만 둔다.

/** 순위를 매긴다. 같은 값은 평균 순위를 준다. */
export function ranks(values) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value || a.index - b.index);
  const result = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) result[order[k].index] = rank;
    i = j + 1;
  }
  return result;
}

/** 스피어만 순위 상관. 두 목록의 순위가 얼마나 비슷한지를 -1에서 1로 나타낸다. */
export function spearman(a, b) {
  if (a.length !== b.length || a.length < 2) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (list) => list.reduce((s, v) => s + v, 0) / list.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let top = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < ra.length; i++) {
    const da = ra[i] - ma;
    const db = rb[i] - mb;
    top += da * db;
    sa += da * da;
    sb += db * db;
  }
  return sa === 0 || sb === 0 ? null : top / Math.sqrt(sa * sb);
}

/**
 * 모델 결과를 실제 자료와 견준다.
 * 게이트를 함께 쓰는 역(수영, 미남)은 실제 자료가 한쪽에 합쳐져 있어서 모델도 합쳐서 본다.
 * @param {{id: string, board: number, alight: number}[]} modelStations
 * @param {Record<string, number>} realByStation 역 id → 실제 하루 승하차 합
 * @param {{id: string, stations: string[]}[]} transfers
 * @param {Record<string, string>} names 역 id → 이름
 */
export function compareToReal(modelStations, realByStation, transfers, names = {}) {
  const modelById = new Map(modelStations.map((s) => [s.id, s.board + s.alight]));
  // 실제 자료가 없는 역의 모델 값은 같은 환승 묶음에서 자료가 있는 역에 더한다.
  const merged = new Map();
  for (const [id, value] of modelById) {
    let target = id;
    if (realByStation[id] === undefined) {
      const group = transfers.find((t) => t.stations.includes(id));
      const sibling = group?.stations.find((other) => realByStation[other] !== undefined);
      if (!sibling) continue;
      target = sibling;
    }
    merged.set(target, (merged.get(target) ?? 0) + value);
  }

  const pairs = [];
  for (const [id, real] of Object.entries(realByStation)) {
    if (!merged.has(id)) continue;
    pairs.push({ id, name: names[id] ?? id, model: merged.get(id), real });
  }
  pairs.sort((a, b) => b.real - a.real || (a.id < b.id ? -1 : 1));

  const modelTotal = pairs.reduce((s, p) => s + p.model, 0);
  const realTotal = pairs.reduce((s, p) => s + p.real, 0);
  const correlation = spearman(
    pairs.map((p) => p.model),
    pairs.map((p) => p.real),
  );

  const byModel = [...pairs].sort((a, b) => b.model - a.model || (a.id < b.id ? -1 : 1));
  const modelTop15 = new Set(byModel.slice(0, 15).map((p) => p.id));
  const realTop10 = pairs.slice(0, 10);
  const matchedTop = realTop10.filter((p) => modelTop15.has(p.id)).length;

  return {
    pairs,
    totals: {
      model: modelTotal,
      real: realTotal,
      diffPercent: realTotal > 0 ? ((modelTotal - realTotal) / realTotal) * 100 : null,
    },
    spearman: correlation,
    topMatch: { realTop10: realTop10.map((p) => p.id), modelTop15: [...modelTop15], matched: matchedTop },
  };
}

/** SPEC 5.6절의 목표를 채웠는지 본다. */
export function meetsTargets(comparison) {
  return {
    total: Math.abs(comparison.totals.diffPercent ?? Infinity) <= 15,
    spearman: (comparison.spearman ?? 0) >= 0.6,
    topMatch: comparison.topMatch.matched >= 6,
  };
}
