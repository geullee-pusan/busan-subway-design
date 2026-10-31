// 시승 모드(진짜 기차 타 보기): 타는 역, 가는 역, 열차 종류, 시각으로 기차를 찾고,
// 실제 열차 하나를 골라 내릴 역까지 타 본다(코레일 2026-10-14 시각표). 장면은 src/ui/train-journey.js.
import { rail, railStationById, trains as trainData } from '../data.js';
import { searchTrains, trainFare } from '../sim/train-trip.js';
import { durationText, roParticle, stationLabel } from './format.js';
import { loadView, saveView } from './storage.js';
import { lookOf } from './train-art.js';
import { hhmm, runTrainTrip, trainDestination } from './train-journey.js';

/** 종류 버튼 차례(빠른 열차부터) */
const KIND_ORDER = ['KTX', 'KTX-산천', 'KTX-청룡', 'KTX-이음', 'ITX-새마을', 'ITX-마음', '새마을호', '누리로', '무궁화호', '종류 모름'];
const wonText = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`;

const HOURS = [
  [6, '새벽 6시'],
  [8, '아침 8시'],
  [13, '낮 1시'],
  [18, '저녁 6시'],
  [21, '밤 9시'],
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick, className = 'button') {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/**
 * @param {HTMLElement} root
 * @param {{onHome: () => void, stationId?: string|null}} p
 * @returns {() => void} 정리
 */
export function renderTrainRide(root, { onHome, stationId = null }) {
  root.replaceChildren();
  const saved = loadView().trainRide ?? {};
  const served = new Set(trainData.trains.flatMap((t) => t.stops.slice(0, -1).map((s) => s[0])));
  const choices = rail.stations.filter((s) => served.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  let station = stationId && served.has(stationId) ? stationId : served.has(saved.station) ? saved.station : (choices.find((s) => s.name === '부산')?.id ?? choices[0]?.id);
  let hour = HOURS.some(([h]) => h === saved.hour) ? saved.hour : 8;
  let rider = saved.rider === 'child' ? 'child' : 'adult';
  let goal = typeof saved.goal === 'string' ? saved.goal : null; // 가는 역(없으면 아무 데나)
  let kind = typeof saved.kind === 'string' ? saved.kind : null; // 열차 종류(없으면 전체)
  let cleanup = null;

  const screen = element('div', 'screen train-ride');
  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', '진짜 기차 타 보기'));
  bar.append(button('처음으로', () => {
    cleanup?.();
    onHome();
  }));
  screen.append(bar);
  const body = element('div', 'journey-body');
  screen.append(body);
  root.append(screen);

  const remember = () => saveView({ trainRide: { station, hour, rider, goal, kind } });
  const nameOf = (id) => railStationById.get(id)?.name ?? '';
  /** 고르는 칸 하나 */
  const selectRow = (label, options, value, onChange) => {
    const select = document.createElement('select');
    select.className = 'text-input';
    select.setAttribute('aria-label', label);
    for (const [v, text] of options) {
      const option = document.createElement('option');
      option.value = v;
      option.textContent = text;
      if (v === value) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    const row = element('div', 'tr-sound-row');
    row.append(element('span', 'tr-fact-label', label), select);
    return row;
  };

  function choose() {
    cleanup?.();
    cleanup = null;
    body.replaceChildren();
    body.append(element('p', 'guide', '타는 역, 가는 역, 열차 종류, 시각을 골라 기차를 찾아요.'));
    // 이 역을 떠나는 열차들(가는 역과 종류 고르기에 쓴다)
    const leaving = trainData.trains
      .map((t) => ({ t, i: t.stops.findIndex((x) => x[0] === station) }))
      .filter(({ t, i }) => i >= 0 && i < t.stops.length - 1);
    const reachable = new Set(leaving.flatMap(({ t, i }) => t.stops.slice(i + 1).map((x) => x[0])));
    if (goal && !reachable.has(goal)) goal = null;
    const kindsHere = KIND_ORDER.filter((k) => leaving.some(({ t }) => (t.kind ?? '종류 모름') === k));
    if (kind && !kindsHere.includes(kind)) kind = null;

    body.append(
      selectRow('타는 역', choices.map((x) => [x.id, `${x.name}역`]), station, (v) => {
        station = v;
        remember();
        choose();
      }),
    );
    const goals = choices.filter((x) => reachable.has(x.id));
    body.append(
      selectRow('가는 역', [['', '아무 데나'], ...goals.map((x) => [x.id, `${x.name}역`])], goal ?? '', (v) => {
        goal = v || null;
        remember();
        choose();
      }),
    );
    // 열차 종류 고르기(이 역을 떠나는 종류만)
    const kindRow = element('div', 'tr-sound-row');
    kindRow.setAttribute('role', 'group');
    kindRow.setAttribute('aria-label', '열차 종류 고르기');
    for (const k of [null, ...kindsHere]) {
      const node = button(k ?? '전체', () => {
        kind = k;
        remember();
        choose();
      }, k === kind ? 'button is-on' : 'button');
      node.setAttribute('aria-pressed', String(k === kind));
      if (k) {
        const mark = element('span', 'tr-kind-mark');
        mark.style.background = lookOf(k).accent;
        node.prepend(mark);
      }
      kindRow.append(node);
    }
    body.append(kindRow);
    // 시각 고르기
    const hourRow = element('div', 'tr-sound-row');
    hourRow.setAttribute('role', 'group');
    hourRow.setAttribute('aria-label', '시각 고르기');
    for (const [h, label] of HOURS) {
      const node = button(label, () => {
        hour = h;
        remember();
        choose();
      }, h === hour ? 'button is-on' : 'button');
      node.setAttribute('aria-pressed', String(h === hour));
      hourRow.append(node);
    }
    body.append(hourRow);
    const riderRow = element('div', 'tr-sound-row');
    for (const [key, label] of [
      ['adult', '어른'],
      ['child', '어린이'],
    ]) {
      const node = button(label, () => {
        rider = key;
        remember();
        choose();
      }, key === rider ? 'button is-on' : 'button');
      node.setAttribute('aria-pressed', String(key === rider));
      riderRow.append(node);
    }
    body.append(riderRow);

    // 찾은 기차("종류 모름"은 종류가 비어 있는 열차)
    const unknown = kind === '종류 모름';
    const found = searchTrains(unknown ? trainData.trains.filter((t) => !t.kind) : trainData.trains, {
      from: station,
      to: goal,
      kind: unknown ? null : kind,
      afterMinute: hour * 60,
      limit: 10,
    });
    const title = goal ? `${stationLabel(nameOf(station))}에서 ${stationLabel(nameOf(goal))}${roParticle(stationLabel(nameOf(goal)))} 가는 기차` : `${stationLabel(nameOf(station))}을 떠나는 기차`;
    body.append(element('h2', null, title));
    if (found.length === 0) {
      body.append(element('p', null, goal ? '이 시각 뒤로는 바로 가는 기차가 없어요.' : '이 시각 뒤로 떠나는 기차가 없어요.'));
      body.append(element('p', 'guide', '다른 시각이나 열차 종류를 골라 봐요.'));
      return;
    }
    const longest = Math.max(...found.map((r) => (r.arr ?? r.dep) - r.dep), 1);
    const box = element('div', 'tr-departures');
    for (const r of found) {
      const look = lookOf(r.train.kind);
      const d = { train: r.train, index: r.from, dep: r.dep };
      const item = button('', () => (r.to === null ? pickStop(d) : ride(d, r.to)), r.to === null ? 'tr-departure' : 'tr-departure tr-found');
      const mark = element('span', 'tr-kind-mark');
      mark.style.background = look.accent;
      const kindText = `${r.train.kind ?? '종류 모름'} ${r.train.no}번`;
      if (r.to === null) {
        item.append(element('span', 'tr-dep-time', hhmm(r.dep)), mark, element('span', 'tr-dep-kind', kindText), element('span', 'tr-dep-to', `${trainDestination(r.train)} 가는 기차`));
      } else {
        const minutes = r.arr - r.dep;
        const fare = trainFare(trainData.fareTable, station, goal, r.train, rider);
        const info = element('span', 'tr-found-info');
        // 걸리는 시간 막대(이 목록에서 가장 오래 걸리는 기차를 가득으로 본다)
        const bar = element('span', 'tr-bar');
        const fill = element('span', 'tr-bar-fill');
        fill.style.width = `${Math.max(8, (minutes / longest) * 100).toFixed(0)}%`;
        fill.style.background = look.accent;
        bar.append(fill);
        // 운임: 동그라미 하나가 5천 원까지
        const coins = fare ? '●'.repeat(Math.max(1, Math.ceil(fare / 5000))) : '';
        const fareNode = element('span', 'tr-found-fare', fare ? `${coins} ${wonText(fare)}` : '운임 모름');
        if (fare) fareNode.setAttribute('aria-label', `${wonText(fare)}. 동그라미 하나가 5천 원까지예요.`);
        const stopText = r.stops === 1 ? '쉬지 않고 바로 가요' : `${r.stops - 1}개 역에 섰다 가요`;
        info.append(element('span', 'tr-dep-kind', kindText), element('span', 'tr-found-line', `${durationText(minutes * 60)} 걸려요. ${stopText}.`), bar, fareNode);
        item.append(element('span', 'tr-dep-time', `${hhmm(r.dep)} → ${hhmm(r.arr)}`), mark, info, element('span', 'tr-dep-to', `${trainDestination(r.train)} 가는 기차`));
      }
      box.append(item);
    }
    body.append(box);
    if (goal) body.append(element('p', 'panel-note', '누르면 바로 타요. 동그라미 하나가 운임 5천 원까지예요.'));
    body.append(element('p', 'panel-note', `${Number(trainData.runDate.slice(4, 6))}월 ${Number(trainData.runDate.slice(6))}일 하루 기록으로 타요.`));
  }

  /** 내릴 역 고르기 */
  function pickStop(d) {
    body.replaceChildren();
    body.append(element('h2', null, `${d.train.kind ?? '기차'} ${d.train.no}번은 이 역들에 서요`));
    body.append(element('p', 'guide', '내릴 역을 골라요. 지도 안에 있는 역만 나와요.'));
    const box = element('div', 'tr-go-row');
    for (let j = d.index + 1; j < d.train.stops.length; j++) {
      const stop = d.train.stops[j];
      const name = railStationById.get(stop[0]).name;
      box.append(button(`${name}역 ${hhmm(stop[1] ?? stop[2])}`, () => ride(d, j), j === d.train.stops.length - 1 ? 'button is-on' : 'button'));
    }
    body.append(box);
    body.append(button('다른 기차 고르기', choose));
  }

  function ride(d, toIndex) {
    body.replaceChildren();
    const area = element('div', 'journey-step');
    body.append(area);
    const fare = trainFare(trainData.fareTable, d.train.stops[d.index][0], d.train.stops[toIndex][0], d.train, rider);
    cleanup = runTrainTrip(area, {
      train: d.train,
      fromIndex: d.index,
      toIndex,
      readyMinute: Math.min(d.dep, hour * 60 + 10 < d.dep ? d.dep - 10 : hour * 60),
      fare,
      rider,
      onDone: () => {
        cleanup = null;
        body.replaceChildren();
        body.append(element('h2', null, `${stationLabel(railStationById.get(d.train.stops[toIndex][0]).name)}에 내렸어요`));
        body.append(button('다른 기차 타기', choose, 'button big ride-go'));
        body.append(button('처음으로', onHome));
      },
    });
  }

  choose();
  return () => cleanup?.();
}
