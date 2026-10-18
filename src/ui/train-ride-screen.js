// 시승 모드(진짜 기차 타 보기): 기차역과 시각을 고르면 출발 안내 전광판이 나오고,
// 실제 열차 하나를 골라 내릴 역까지 타 본다(코레일 2026-10-14 시각표). 장면은 src/ui/train-journey.js.
import { rail, railStationById, trains as trainData } from '../data.js';
import { trainFare } from '../sim/train-trip.js';
import { stationLabel } from './format.js';
import { loadView, saveView } from './storage.js';
import { lookOf } from './train-art.js';
import { departuresFrom, hhmm, runTrainTrip, trainDestination } from './train-journey.js';

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

  const remember = () => saveView({ trainRide: { station, hour, rider } });

  function choose() {
    cleanup?.();
    cleanup = null;
    body.replaceChildren();
    body.append(element('p', 'guide', '기차역과 시각을 고르면 그 역을 떠나는 기차가 나와요.'));
    // 기차역 고르기
    const select = document.createElement('select');
    select.className = 'text-input';
    select.setAttribute('aria-label', '기차역 고르기');
    for (const s of choices) {
      const option = document.createElement('option');
      option.value = s.id;
      option.textContent = `${s.name}역`;
      if (s.id === station) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => {
      station = select.value;
      remember();
      choose();
    });
    const pickRow = element('div', 'tr-sound-row');
    pickRow.append(element('span', 'tr-fact-label', '타는 역'), select);
    body.append(pickRow);
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

    // 출발 안내: 기차 하나를 고른다
    const list = departuresFrom(station, hour * 60, 10);
    body.append(element('h2', null, `${stationLabel(railStationById.get(station).name)}을 떠나는 기차`));
    if (list.length === 0) {
      body.append(element('p', null, '이 시각 뒤로 떠나는 기차가 없어요.'));
      return;
    }
    const box = element('div', 'tr-departures');
    for (const d of list) {
      const look = lookOf(d.train.kind);
      const item = button('', () => pickStop(d), 'tr-departure');
      const mark = element('span', 'tr-kind-mark');
      mark.style.background = look.accent;
      item.append(
        element('span', 'tr-dep-time', hhmm(d.dep)),
        mark,
        element('span', 'tr-dep-kind', `${d.train.kind ?? '종류 모름'} ${d.train.no}번`),
        element('span', 'tr-dep-to', `${trainDestination(d.train)} 가는 기차`),
      );
      box.append(item);
    }
    body.append(box);
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
