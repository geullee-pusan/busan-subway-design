// 시승 모드 차내 안내 방송 문장. 순수 함수만 둔다.
// 문구 틀은 src/content/announcements.json에 있다(부산교통공사 열차안내방송의 형태).

/** 받침이 있는가. 한글이 아니면 받침 없음으로 본다. */
function finalOf(word) {
  const code = String(word).charCodeAt(String(word).length - 1);
  if (code < 0xac00 || code > 0xd7a3) return 0;
  return (code - 0xac00) % 28;
}

/** "으로" 또는 "로"(받침이 없거나 ㄹ이면 "로") */
export function roOf(word) {
  const final = finalOf(word);
  return final === 0 || final === 8 ? '로' : '으로';
}

/** 방면 이름 잇기: ["연산", "서면"] → "연산이나 서면", ["해운대", "수영"] → "해운대나 수영" */
export function viaText(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  return `${list[0]}${finalOf(list[0]) === 0 ? '나' : '이나'} ${list[1]}`;
}

/** "{name}역입니다"에 쓸 이름. 이름 끝에 "역"이 이미 있으면 뗀다(서면역 → 서면). */
function bareName(name) {
  return name.endsWith('역') && name.length > 1 ? name.slice(0, -1) : name;
}

/** 틀의 {key}를 채운다. */
export function fillTemplate(text, values) {
  return text.replace(/\{(\w+)\}/g, (all, key) => (values[key] ?? all));
}

/**
 * 안내 방송 문장들.
 * @param {object} templates src/content/announcements.json
 * @param {object} p
 * @param {'출발'|'도착'|'종착'} p.type 출발: 첫 역을 떠날 때, 도착: 중간 역, 종착: 마지막 역
 * @param {string} p.name 이 역 이름
 * @param {string} [p.end] 이 열차가 가는 끝 역(출발)
 * @param {string[]} [p.via] 지나는 역 이름(출발, 두 곳까지)
 * @param {{line: string, via: string[]}[]} [p.transfers] 갈아탈 노선과 그 노선의 방면(끝 역)
 * @param {string|null} [p.place] 이 역에서 내리면 가까운 중심지
 * @returns {string[]}
 */
export function announcementLines(templates, { type, name, end = '', via = [], transfers = [], place = null }) {
  const station = bareName(name);
  if (type === '출발') {
    const target = bareName(end);
    const values = { end: target, via: viaText(via.length > 0 ? via.map(bareName) : [target]) };
    return templates.departure.map((line) => fillTemplate(line, values));
  }
  const lines = (type === '종착' ? templates.terminalArrival : templates.arrival).map((line) =>
    fillTemplate(line, { name: station, door: templates.door }),
  );
  for (const transfer of transfers) {
    if (transfer.via.length === 0) continue;
    lines.push(
      fillTemplate(templates.transfer, { via: viaText(transfer.via.map(bareName)), line: transfer.line, ro: roOf(transfer.line) }),
    );
  }
  if (place) lines.push(fillTemplate(templates.landmark, { place, ro: roOf(place) }));
  if (type === '종착') lines.push(...templates.terminalClosing);
  return lines;
}

/**
 * 영어 안내 방송 문장들(우리말 방송 다음에 나온다).
 * @param {object} templates src/content/announcements.json
 * @param {object} p
 * @param {'출발'|'도착'|'종착'} p.type
 * @param {string} p.name 이 역의 영어 이름
 * @param {string} [p.end] 끝 역의 영어 이름(출발)
 * @param {string[]} [p.lineNumbers] 갈아탈 수 있는 노선 번호("1", "2" …)
 * @param {string[]} [p.lineNames] 번호가 없는 노선의 영어 이름(내가 만든 새 노선: "New Line 2")
 * @returns {string[]}
 */
export function englishLines(templates, { type, name, end = '', lineNumbers = [], lineNames = [] }) {
  const en = templates.english;
  if (type === '출발') return en.departure.map((line) => fillTemplate(line, { end }));
  const lines = (type === '종착' ? en.terminalArrival : en.arrival).map((line) => fillTemplate(line, { name, door: en.door }));
  for (const number of lineNumbers) lines.push(fillTemplate(en.transfer, { number }));
  for (const line of lineNames) lines.push(fillTemplate(en.transferNamed, { line }));
  if (type === '종착') lines.push(...en.terminalClosing);
  return lines;
}
