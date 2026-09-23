// 옛날 부산. 어떤 해에 있던 노선망을 낸다(docs/SPEC.md 12장 Phase 6). 순수 함수만 둔다.
//
// 역이 나중에 끼어든 곳이 있다(2호선 증산 2015년, 동해선 부산원동 2020년).
// 그때는 앞뒤 역이 바로 이어져 있었으므로, 사이 구간을 더해 하나로 잇는다.

/** 'YYYY-MM-DD' → 1985 같은 연도 숫자. 값이 없으면 null. */
export function yearOf(date) {
  if (typeof date !== 'string' || date.length < 4) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/** 그 해 끝까지 문을 열었는가 */
export function openedBy(year, openedOn) {
  const opened = yearOf(openedOn);
  return opened !== null && opened <= year;
}

/**
 * 그 해의 노선망.
 * @param {number} year
 * @param {object} p lines, stations, links, transfers는 data/build/의 배열, stationInfo는 역 id → {openedOn}
 * @returns {{lines: object[], stations: object[], links: object[], transfers: object[]}}
 */
export function networkAt(year, { lines, stations, links, transfers, stationInfo }) {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const linkBetween = new Map();
  for (const link of links) {
    linkBetween.set(`${link.from}|${link.to}`, link);
    linkBetween.set(`${link.to}|${link.from}`, link);
  }

  const outLines = [];
  const outStations = [];
  const outLinks = [];
  for (const line of lines) {
    const order = (line.stations ?? []).filter((id) => byId.has(id));
    const openIndexes = [];
    for (let i = 0; i < order.length; i++) {
      if (openedBy(year, stationInfo[order[i]]?.openedOn)) openIndexes.push(i);
    }
    if (openIndexes.length === 0) continue;

    // 노선의 역 차례도 그 해에 있던 역만 남긴다(지도를 그릴 때 그대로 쓴다).
    outLines.push({ ...line, stations: openIndexes.map((i) => order[i]) });
    for (const i of openIndexes) outStations.push(byId.get(order[i]));

    for (let k = 1; k < openIndexes.length; k++) {
      const from = openIndexes[k - 1];
      const to = openIndexes[k];
      let distanceM = 0;
      let runS = 0;
      let missing = false;
      for (let i = from; i < to; i++) {
        const link = linkBetween.get(`${order[i]}|${order[i + 1]}`);
        if (!link) {
          missing = true;
          break;
        }
        distanceM += link.distanceM;
        runS += link.runS;
      }
      if (missing) continue;
      outLinks.push({
        line: line.id,
        from: order[from],
        to: order[to],
        distanceM,
        runS,
        // 사이에 아직 생기지 않은 역의 수. 0보다 크면 구간을 더해 이은 것이다.
        skipped: to - from - 1,
      });
    }
  }

  const openIds = new Set(outStations.map((s) => s.id));
  const outTransfers = transfers
    .map((group) => ({ ...group, stations: group.stations.filter((id) => openIds.has(id)) }))
    .filter((group) => group.stations.length >= 2);

  return { lines: outLines, stations: outStations, links: outLinks, transfers: outTransfers };
}

/** 역이 문을 연 해를 작은 것부터 늘어놓는다. */
export function openingYears(stationInfo) {
  const years = new Set();
  for (const info of Object.values(stationInfo)) {
    const year = yearOf(info?.openedOn);
    if (year !== null) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

/** 그 해의 전체 길이(km), 역 수, 노선 수 */
export function sizeAt(year, data) {
  const network = networkAt(year, data);
  const meters = network.links.reduce((sum, link) => sum + link.distanceM, 0);
  return {
    year,
    km: meters / 1000,
    stations: network.stations.length,
    lines: network.lines.length,
  };
}

/** 해마다의 크기. 꺾은선그래프에 쓴다. */
export function sizeByYear(years, data) {
  return years.map((year) => sizeAt(year, data));
}
