// 새로 놓은 역의 이름을 짓는다. 순수 함수만 둔다(같은 설계면 늘 같은 이름).
//
// 이름 후보:
//  1. 이미 있는 역과 같은 칸이면 그 역 이름(갈아타는 역). 늘 이것을 쓴다.
//  2. 1km 안의 중심지 이름(서면, 명지 …)
//  3. 가까운 행정동 이름("명지1동" → "명지"). 가장 가까운 동네보다 1km 넘게 먼 동네는 빼고, 3km까지만 본다.
//     그래야 하단역 옆 역이 2km 넘게 떨어진 "명지"를 가져가지 않고 "신하단"이 된다.
//     3km 안에 동네가 없으면(바다 위 같은 곳) 가장 가까운 하나.
//
// 나눠 주는 차례: 선을 따라 앞에서부터가 아니라, 이름을 가장 가까이서 가리키는 역부터 준다.
// (중심지 이름 먼저, 그다음 가까운 것 먼저.) 그래야 명지 한가운데 역이 "명지"를 갖고,
// 2km 떨어진 역이 먼저 "명지"를 가져가 가운데 역이 "명지2"가 되는 일이 없다.
// 이미 있는 역이나 다른 새 역과 이름이 겹치면 다음 후보로 넘어간다.
// 후보가 모두 겹치면 번호는 붙이지 않고 "신"을 붙이거나("신하단") 더 먼 동네·구 이름을 쓴다(fallbackNames).

/** 중심지를 이름 후보로 볼 거리(칸 = km) */
const PLACE_NEAR_KM = 1;
/** 행정동을 이름 후보로 볼 거리와 개수. 가장 가까운 동네에서 DONG_BAND_KM까지, 멀어도 DONG_NEAR_KM까지만 본다. */
const DONG_NEAR_KM = 3;
const DONG_BAND_KM = 1;
const DONG_CANDIDATES = 5;

/**
 * 행정동 이름을 역 이름처럼 줄인다.
 * "부산광역시 강서구 명지1동" → "명지", "대연3동" → "대연", "기장읍" → "기장", "우1동" → "우동"(한 글자는 남긴다)
 */
export function shortDongName(fullName) {
  const last = String(fullName).trim().split(/\s+/).at(-1) ?? '';
  const noNumber = last.replace(/제?\d+(?=[동읍면]$)/, '');
  const base = noNumber.replace(/[동읍면]$/, '');
  return base.length >= 2 ? base : noNumber;
}

/**
 * 중심지 이름을 역 이름처럼 줄인다.
 * "남포·자갈치" → "남포", "부산역" → "부산", "센텀시티·벡스코" → "센텀시티"
 */
export function shortPlaceName(name) {
  const first = String(name).split('·')[0].trim();
  return first.endsWith('역') && first.length > 2 ? first.slice(0, -1) : first;
}

/**
 * 역 이름을 사람이 적은 대로 다듬는다. 끝의 "역"은 화면이 붙이므로 뗀다. 빈 이름이면 null.
 * @param {string} text
 */
export function cleanStationName(text) {
  let name = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (name.endsWith('역') && name.length > 1) name = name.slice(0, -1).trim();
  if (!name) return null;
  return name.slice(0, 12);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 한 칸에서 이름 후보를 낸다. 중심지 먼저, 그다음 동네. 각각 가까운 것 먼저.
 * @returns {{name: string, source: '중심지'|'동네', distance: number}[]}
 */
export function nameCandidates(cell, { cols, dongs, places }) {
  const at = { x: (cell % cols) + 0.5, y: Math.floor(cell / cols) + 0.5 };
  const byDistance = (a, b) => a.distance - b.distance || a.name.localeCompare(b.name);

  const nearPlaces = places
    .map((place) => ({ name: shortPlaceName(place.name), source: '중심지', distance: distance(at, place) }))
    .filter((c) => c.distance <= PLACE_NEAR_KM)
    .sort(byDistance);

  const allDongs = dongs
    .map((dong) => ({ name: shortDongName(dong.name), source: '동네', distance: distance(at, dong) }))
    .sort(byDistance);
  const limit = Math.min(DONG_NEAR_KM, (allDongs[0]?.distance ?? 0) + DONG_BAND_KM);
  const nearDongs = allDongs.filter((c) => c.distance <= limit).slice(0, DONG_CANDIDATES);
  // 3km 안에 동네가 없으면(바다 위 같은 곳) 가장 가까운 하나라도 쓴다.
  if (nearDongs.length === 0 && allDongs.length > 0) nearDongs.push(allDongs[0]);

  // 같은 이름은 더 가까운 쪽 하나만
  const seen = new Set();
  return [...nearPlaces, ...nearDongs].filter((c) => c.name && !seen.has(c.name) && seen.add(c.name));
}

/**
 * 설계의 역마다 이름을 정한다. 돌려주는 차례는 선을 따라 첫 역부터다.
 * @param {object} p
 * @param {{path: number[], stations: number[], names?: Record<string, string>}} p.design names는 사람이 고친 이름(칸 번호 → 이름)
 * @param {number} p.cols 격자 가로 칸 수
 * @param {{name: string, cell: number}[]} p.existing 이미 있는 역(격자 안)
 * @param {{name: string, x: number, y: number}[]} p.dongs 행정동 가운데 점
 * @param {{name: string, x: number, y: number}[]} p.places 중심지 자리
 * @param {boolean} [p.auto] false면 "새 역 1, 2 …"로 부른다(고친 이름과 갈아타는 역은 그대로 둔다)
 * @returns {{cell: number, order: number, name: string, source: string}[]}
 */
export function nameStations({ design, cols, existing, dongs, places, auto = true }) {
  const custom = design.names ?? {};
  // 선 위 역은 선을 따라, 떨어진 역(아직 잇지 않은 역)은 그 뒤에 놓은 차례대로
  const onPath = [
    ...design.path.filter((cell) => design.stations.includes(cell)),
    ...design.stations.filter((cell) => !design.path.includes(cell)),
  ];
  const existingByCell = new Map(existing.map((station) => [station.cell, station.name]));
  const result = onPath.map((cell, index) => ({ cell, order: index + 1, name: null, source: null }));

  // 이미 쓰인 이름: 기존 역 전부와, 사람이 고친 이름
  const taken = new Set(existing.map((station) => station.name));

  // 1. 사람이 고친 이름, 갈아타는 역, 차례 이름은 바로 정한다.
  for (const entry of result) {
    const own = cleanStationName(custom[entry.cell]);
    if (own) {
      Object.assign(entry, { name: own, source: '직접' });
      taken.add(own);
    } else if (existingByCell.has(entry.cell)) {
      // 갈아타는 역은 기존 역과 이름이 같아야 헷갈리지 않는다.
      Object.assign(entry, { name: existingByCell.get(entry.cell), source: '갈아타는 역' });
    } else if (!auto) {
      Object.assign(entry, { name: `새 역 ${entry.order}`, source: '차례' });
    }
  }

  // 2. 나머지 역: 모든 (역, 후보) 짝을 가장 가까이서 가리키는 차례로 나눠 준다.
  const open = result.filter((entry) => entry.name === null);
  const candidates = new Map(open.map((entry) => [entry.cell, nameCandidates(entry.cell, { cols, dongs, places })]));
  const pairs = [];
  for (const entry of open) {
    for (const candidate of candidates.get(entry.cell)) pairs.push({ entry, candidate });
  }
  const sourceRank = (c) => (c.source === '중심지' ? 0 : 1);
  pairs.sort(
    (a, b) =>
      sourceRank(a.candidate) - sourceRank(b.candidate) ||
      a.candidate.distance - b.candidate.distance ||
      a.entry.order - b.entry.order ||
      a.candidate.name.localeCompare(b.candidate.name),
  );
  for (const { entry, candidate } of pairs) {
    if (entry.name !== null || taken.has(candidate.name)) continue;
    Object.assign(entry, { name: candidate.name, source: candidate.source });
    taken.add(candidate.name);
  }

  // 3. 후보가 모두 겹친 역: 번호는 붙이지 않고, 가까운 땅 이름을 더 넓게 찾는다(fallbackNames).
  for (const entry of result) {
    if (entry.name !== null) continue;
    for (const option of fallbackNames(entry.cell, candidates.get(entry.cell) ?? [], { cols, dongs })) {
      if (taken.has(option.name)) continue;
      Object.assign(entry, option);
      taken.add(option.name);
      break;
    }
  }

  return result;
}

/** "부산광역시 사하구 하단1동" → "사하", "경상남도 창원시진해구 웅동1동" → "진해" */
function shortDistrictName(fullName) {
  const parts = String(fullName).trim().split(/\s+/);
  const district = parts.slice(1, -1).join('').replace(/^.*시(?=.+[구군]$)/, '');
  const base = district.replace(/[시군구]$/, '');
  return base.length >= 2 ? base : district;
}

/**
 * 가까운 이름이 모두 쓰였을 때 차례로 해 볼 이름. 숫자는 붙이지 않는다.
 *  1. 가까운 후보 앞에 "신"(하단역 옆 → 신하단, 신해운대처럼). 이미 "신"으로 시작하면 건너뛴다(신신평 막기).
 *  2. 더 먼 행정동 이름(가까운 것부터)
 *  3. 그 동네 이름 앞에 "신"
 *  4. 구·군 이름("사하", "강서")과 그 앞에 "신"
 *  5. 두 동네 이름 잇기("하단명지"). 행정동이 둘 이상이면 이름이 모자랄 일이 없다.
 */
function* fallbackNames(cell, near, { cols, dongs }) {
  const at = { x: (cell % cols) + 0.5, y: Math.floor(cell / cols) + 0.5 };
  const withNew = (name) => (name.startsWith('신') ? null : `신${name}`);
  for (const c of near) {
    const name = withNew(c.name);
    if (name) yield { name, source: c.source };
  }
  const byDistance = dongs
    .map((dong) => ({ dong, d: distance(at, dong) }))
    .sort((a, b) => a.d - b.d || a.dong.name.localeCompare(b.dong.name))
    .map(({ dong }) => dong);
  const dongNames = [...new Set(byDistance.map((dong) => shortDongName(dong.name)).filter(Boolean))];
  for (const name of dongNames) yield { name, source: '동네' };
  for (const name of dongNames.map(withNew).filter(Boolean)) yield { name, source: '동네' };
  const districts = [...new Set(byDistance.map((dong) => shortDistrictName(dong.name)).filter(Boolean))];
  for (const name of districts) {
    yield { name, source: '동네' };
    const shin = withNew(name);
    if (shin) yield { name: shin, source: '동네' };
  }
  const first = near[0]?.name ?? dongNames[0] ?? '새';
  for (const other of dongNames) {
    if (other !== first) yield { name: `${first}${other}`, source: '동네' };
  }
}
