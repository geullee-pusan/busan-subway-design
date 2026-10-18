// 기차 타기 장면 흐름: 대합실(출발 안내 전광판, 열차 소개) → 승차권 → 승강장(열차가 들어온다) → 열차 안(역마다) → 내림.
// 여행 모드(가 보기)와 시승 모드(진짜 기차 타 보기)가 함께 쓴다. 다음 단계로는 아이가 단추를 눌러야 간다.
// 시각은 실제 시각표(코레일 2026-10-14 기록)대로 흐른다. 방송 문구는 우리가 지은 것이다(공식 문구를 찾지 못함).
import { grid, rail, railStationById, trains as trainData } from '../data.js';
import { railPathBetween, seatFor, segmentScenes, speedProfile } from '../sim/train-ride.js';
import { trainGroup } from '../sim/train-trip.js';
import { clockText, distanceText, durationText, stationLabel } from './format.js';
import { createRideSound } from './ride-sound.js';
import { loadView, saveView } from './storage.js';
import { wordWithCard } from './word-card.js';
import { departureBoard, lookOf, soundKindOf, ticketArt, trainPlatformArt } from './train-art.js';
import { trainInteriorArt } from './train-interior.js';

/** 역 사이 그림이 움직이는 시간(밀리초) */
const SEGMENT_MS = 5000;

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

/** 분 → "08:34"(전광판·승차권) */
function hhmm(minutes) {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const wonText = (value) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const nameOf = (id) => railStationById.get(id)?.name ?? id;
const stopDep = (stop) => stop[2] ?? stop[1];
const stopArr = (stop) => stop[1] ?? stop[2];

/** 열차가 가는 곳 이름(운행계획의 마지막 도착역, 없으면 지도 안 마지막 정차역) */
export function trainDestination(train) {
  return train.destination ?? nameOf(train.stops.at(-1)[0]);
}

/**
 * 이 열차 종류 소개(출처가 있는 사실만). 숫자는 그림과 함께 보여 준다.
 * @param {string|null} kind
 */
export function kindCard(kind) {
  const box = element('section', 'tr-kind-card');
  const look = lookOf(kind);
  const title = element('h3', 'tr-kind-title');
  const mark = element('span', 'tr-kind-mark');
  mark.style.background = look.accent;
  title.append(mark, element('span', null, `${kind ?? '종류 모름'} 이야기`));
  box.append(title);
  const info = trainData.kindInfo?.[kind];
  if (!info || Object.keys(info).length === 0) {
    box.append(element('p', 'panel-note', '이 열차 종류의 자세한 내용은 아직 확인하지 못했어요.'));
    return box;
  }
  const sources = new Set();
  const note = (fact) => fact?.source && sources.add(fact.source);
  if (info.speedKmh) {
    // 빠르기 막대: 가장 빠른 KTX-청룡(320km/h)을 끝으로 둔다
    const row = element('div', 'tr-fact');
    row.append(element('span', 'tr-fact-label', '가장 빨리'));
    const bar = element('span', 'tr-bar');
    const fill = element('span', 'tr-bar-fill');
    fill.style.width = `${Math.min(100, (info.speedKmh.value / 320) * 100).toFixed(0)}%`;
    fill.style.background = look.accent;
    bar.append(fill);
    row.append(bar, element('span', 'tr-fact-value', `시속 ${info.speedKmh.value}km`));
    box.append(row);
    note(info.speedKmh);
  }
  if (info.cars) {
    const row = element('div', 'tr-fact');
    const label = element('span', 'tr-fact-label');
    label.append(wordWithCard('편성', '칸 수'));
    row.append(label);
    const cars = element('span', 'tr-cars');
    cars.setAttribute('aria-hidden', 'true');
    cars.textContent = '▭'.repeat(Math.min(20, info.cars.value));
    row.append(cars, element('span', 'tr-fact-value', `${info.cars.value}칸`));
    box.append(row);
    if (info.cars.detail) box.append(element('p', 'tr-fact-detail', info.cars.detail));
    note(info.cars);
  }
  if (info.seats) {
    const row = element('div', 'tr-fact');
    row.append(element('span', 'tr-fact-label', '자리'));
    const seats = element('span', 'tr-cars');
    seats.setAttribute('aria-hidden', 'true');
    seats.textContent = '▪'.repeat(Math.min(40, Math.round(info.seats.value / 25)));
    row.append(seats, element('span', 'tr-fact-value', `${info.seats.value}자리`));
    box.append(row);
    note(info.seats);
  }
  const lines = [];
  if (info.firstRun) lines.push(`${Number(info.firstRun.value.slice(0, 4))}년 ${Number(info.firstRun.value.slice(5, 7))}월에 처음 달렸어요.`);
  if (info.name) lines.push(/요$/.test(info.name.value) ? `${info.name.value}.` : `이름은 "${info.name.value}"이라는 뜻이에요.`);
  if (info.look) lines.push(`${info.look.value}.`);
  for (const line of lines) box.append(element('p', 'tr-fact-line', line));
  if (info.power) {
    // 힘을 내는 방법은 낱말 카드로 잇는다
    const p = element('p', 'tr-fact-line');
    p.append(element('span', null, '힘을 내는 방법: '), wordWithCard(info.power.value), element('span', null, '이에요.'));
    box.append(p);
    if (info.power.detail) box.append(element('p', 'tr-fact-line', info.power.detail));
  }
  const more = [];
  if (info.seatsTurn) more.push(info.seatsTurn.value ? '좌석이 돌아가서 모두 앞을 보고 앉아요.' : '좌석이 돌지 않아서 절반은 뒤를 보고 앉아 가요.');
  if (info.windows) more.push(`${info.windows.value}.`);
  if (info.room) more.push(`${info.room.value}.`);
  if (info.features) more.push(`${info.features.value}.`);
  for (const line of more) box.append(element('p', 'tr-fact-line', line));
  for (const key of ['firstRun', 'name', 'look', 'power', 'seatsTurn', 'windows', 'room', 'features']) note(info[key]);
  box.append(element('p', 'panel-source', `자료: ${[...sources].join(' · ')}`));
  return box;
}

/**
 * 기차 타기.
 * @param {HTMLElement} area 그릴 곳
 * @param {object} p
 * @param {object} p.train trains.json의 열차
 * @param {number} p.fromIndex 타는 정차역 차례
 * @param {number} p.toIndex 내리는 정차역 차례
 * @param {number} p.readyMinute 역에 닿은 시각(분)
 * @param {number|null} p.fare 낼 운임(모르면 null)
 * @param {'adult'|'child'} p.rider
 * @param {(minutes: number) => void} p.onDone 내리면 부른다(역에 닿은 때부터 내릴 때까지 걸린 분)
 * @returns {() => void} 정리(소리 끄기, 시계 멈추기)
 */
export function runTrainTrip(area, { train, fromIndex, toIndex, readyMinute, fare, rider = 'adult', onDone }) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const sound = createRideSound();
  const timers = [];
  let frame = null;
  let soundOn = loadView().rideSound === true;
  let voiceOn = loadView().rideVoice === true;
  const kind = train.kind ?? '종류 모름';
  const look = lookOf(kind);
  const info = trainData.kindInfo?.[kind] ?? {};
  const from = train.stops[fromIndex];
  const to = train.stops[toIndex];
  const fromName = nameOf(from[0]);
  const toName = nameOf(to[0]);
  const seat = seatFor(train, info.cars?.value ?? null, info.seatsTurn?.value === false);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.push(id);
  };
  const cleanup = () => {
    for (const id of timers.splice(0)) clearTimeout(id);
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    sound.stopAll();
  };

  /** 소리·방송 단추 */
  function soundButtons() {
    const row = element('div', 'tr-sound-row');
    const s = button(soundOn ? '소리: 켬' : '소리: 끔', () => {
      soundOn = !soundOn;
      saveView({ rideSound: soundOn });
      s.textContent = soundOn ? '소리: 켬' : '소리: 끔';
      if (!soundOn) sound.stopRumble();
    });
    const v = button(voiceOn ? '방송 읽기: 켬' : '방송 읽기: 끔', () => {
      voiceOn = !voiceOn;
      saveView({ rideVoice: voiceOn });
      v.textContent = voiceOn ? '방송 읽기: 켬' : '방송 읽기: 끔';
    });
    row.append(s, v);
    return row;
  }

  function say(korean, english = []) {
    if (!voiceOn && !soundOn) return Promise.resolve();
    return sound.announce({ korean, english, voice: voiceOn, music: soundOn, melody: null });
  }

  // 1. 대합실: 출발 안내 전광판과 열차 소개
  function concourse() {
    area.replaceChildren();
    area.append(element('h2', null, `${stationLabel(fromName)} 대합실이에요`));
    const departures = trainData.trains
      .flatMap((t) =>
        t.stops
          .map((s, i) => ({ t, i, dep: s[2] }))
          .filter((x) => x.dep !== null && x.t.stops[x.i][0] === from[0] && x.i < x.t.stops.length - 1 && x.dep >= readyMinute - 1),
      )
      .sort((a, b) => a.dep - b.dep || a.t.no - b.t.no);
    const ours = departures.findIndex((d) => d.t === train && d.i === fromIndex);
    const shown = departures.slice(0, Math.max(6, ours + 1)).slice(-6);
    const rows = shown.map((d) => ({
      time: hhmm(d.dep),
      kind: d.t.kind ?? '종류 모름',
      no: d.t.no,
      to: trainDestination(d.t),
      note: d.t === train ? '내 기차' : '',
    }));
    area.append(departureBoard(rows, { title: `출발 안내 · ${fromName}`, highlight: shown.findIndex((d) => d.t === train) }));
    const wait = Math.max(0, stopDep(from) - readyMinute);
    area.append(element('p', null, `${hhmm(stopDep(from))}에 떠나는 ${kind} ${train.no}번을 타요.`));
    area.append(element('p', null, wait > 0 ? `떠나기까지 ${durationText(wait * 60)} 남았어요.` : '곧 떠나요.'));
    const goes = trainDestination(train);
    area.append(element('p', null, `이 기차는 ${goes}까지 가요.`));
    if (goes !== toName) area.append(element('p', null, `우리는 ${toName}에서 내려요.`));
    area.append(kindCard(kind));
    area.append(button('승차권 받기', ticket, 'button big ride-go'));
  }

  // 2. 승차권
  function ticket() {
    area.replaceChildren();
    area.append(element('h2', null, '승차권을 받았어요'));
    const fareText = fare === null || fare === undefined ? '운임 모름' : wonText(fare);
    area.append(
      ticketArt({
        kind,
        no: train.no,
        fromName,
        toName,
        depText: `${hhmm(stopDep(from))} 출발`,
        arrText: `${hhmm(stopArr(to))} 도착`,
        car: seat.car,
        seat: seat.seat,
        fareText,
        reverse: seat.reverse,
      }),
    );
    area.append(element('p', 'panel-note', '호차와 자리 번호는 우리가 정했어요.'));
    if (rider === 'child') area.append(element('p', 'panel-note', '어린이는 어른 운임에서 반을 빼 줘요.'));
    if (fare !== null && fare !== undefined) area.append(element('p', 'panel-source', `운임: ${trainData.fareSource ?? ''}`));
    area.append(button('타는 곳으로 가요', platform, 'button big ride-go'));
  }

  // 3. 승강장: 방송이 나오고 열차가 들어와 선다.
  function platform() {
    area.replaceChildren();
    area.append(element('h2', null, `${hhmm(stopDep(from))} ${kind} ${train.no}번을 기다려요`));
    area.append(soundButtons());
    const art = trainPlatformArt({ kind, stationName: `${fromName}역`, reduceMotion });
    area.append(art.svg);
    const status = element('p', 'tr-status', '열차가 곧 들어와요.');
    area.append(status);
    const board = button('열차에 타요', ride, 'button big ride-go');
    board.disabled = true;
    area.append(board);
    later(async () => {
      sound.wake();
      const words = `곧 ${kind} ${train.no}번 열차가 들어옵니다. 안전선 밖으로 물러서 주세요.`;
      status.textContent = words;
      const spoken = say([words], [`The ${kind} train number ${train.no} is now approaching.`]);
      if (soundOn) sound.startRumble(soundKindOf(kind));
      await art.arrive(reduceMotion ? 0 : 3800);
      sound.stopRumble();
      await spoken;
      art.openDoors();
      status.textContent = `문이 열렸어요. ${seat.car}호차로 타요.`;
      board.disabled = false;
    }, reduceMotion ? 0 : 1200);
  }

  // 4. 열차 안: 역마다 선다.
  let at = fromIndex;
  let interior = null;
  let panel = null;
  function ride() {
    sound.wake();
    area.replaceChildren();
    area.append(element('h2', null, `${kind} ${train.no}번 안이에요`));
    area.append(soundButtons());
    interior = trainInteriorArt({ kind, reduceMotion });
    area.append(interior.svg);
    area.append(element('p', 'tr-seat', `${seat.car}호차 ${seat.seat} 자리에 앉았어요.${seat.reverse ? ' 뒤를 보고 앉아 가요.' : ''}`));
    panel = element('div', 'tr-panel');
    area.append(panel);
    area.append(element('p', 'panel-note', '빠르기는 역 사이 거리와 시간으로 어림한 값이에요. 소리는 만든 소리예요.'));
    stopHere(true);
  }

  /** 정차역 줄: 지난 역 ■, 지금 □, 남은 역 □ */
  function stopsRow() {
    const row = element('ol', 'tr-stops');
    for (let i = fromIndex; i <= toIndex; i++) {
      const item = element('li', i < at ? 'is-done' : i === at ? 'is-now' : '', stationLabel(nameOf(train.stops[i][0])));
      row.append(item);
    }
    return row;
  }

  function stopHere(first = false) {
    const stop = train.stops[at];
    const name = nameOf(stop[0]);
    const last = at >= toIndex;
    interior.setScene('station');
    interior.setSpeed(0);
    interior.setDisplay(last ? [`${name}역`, '내릴 역이에요'] : first ? [`${trainDestination(train)} 가는 ${kind}`, `다음 역: ${nameOf(train.stops[at + 1][0])}`] : [`${name}역`, `다음 역: ${nameOf(train.stops[at + 1][0])}`]);
    panel.replaceChildren(stopsRow());
    const clock = element('p', 'tr-clock', `시각 ${hhmm(first ? stopDep(stop) : stopArr(stop))}`);
    panel.append(clock);
    if (!first) {
      const words = [`이번 역은 ${name}, ${name}역입니다.`];
      if (last) words.push('내리실 때 두고 내리는 물건이 없는지 살펴 주세요.');
      say(words, [`This stop is ${name}.`]);
    }
    if (last) {
      panel.append(element('p', 'tr-status', `${stationLabel(name)}에 닿았어요. 내릴 역이에요.`));
      panel.append(
        button('내려요', () => {
          cleanup();
          onDone(stopArr(stop) - readyMinute);
        }, 'button big ride-go'),
      );
      return;
    }
    if (!first) panel.append(element('p', 'tr-status', `${stationLabel(name)}에 섰어요. ${hhmm(stopDep(stop))}에 떠나요.`));
    const go = element('div', 'tr-go-row');
    go.append(button('다음 역까지', () => move(false), 'button big ride-go'));
    if (toIndex - at > 1) go.append(button('내릴 역까지', () => move(true), 'button'));
    panel.append(go);
  }

  /** 다음 역까지 달린다. toEnd면 내릴 역까지 이어서(역마다 잠깐 선다). */
  function move(toEnd) {
    const a = train.stops[at];
    const b = train.stops[at + 1];
    const A = railStationById.get(a[0]);
    const B = railStationById.get(b[0]);
    const path = railPathBetween(rail, a[0], b[0]);
    const km = path?.km ?? Math.hypot(A.x - B.x, A.y - B.y);
    const minutes = stopArr(b) - stopDep(a);
    const speedAt = speedProfile(km, minutes, info.speedKmh?.value ?? null);
    const scenes = segmentScenes(grid, A, B, trainGroup(kind), path?.points ?? null);
    // 오래 걸리는 구간일수록 조금 더 길게 달린다(5초~20초)
    const segmentMs = Math.min(20000, SEGMENT_MS + minutes * 300);
    const ms = reduceMotion ? 0 : toEnd ? segmentMs * 0.6 : segmentMs;
    panel.replaceChildren(stopsRow());
    const clock = element('p', 'tr-clock');
    const speedRow = element('div', 'tr-speed');
    const speedBar = element('span', 'tr-bar');
    const speedFill = element('span', 'tr-bar-fill');
    speedFill.style.background = look.accent;
    speedBar.append(speedFill);
    const speedText = element('span', 'tr-fact-value');
    speedRow.append(element('span', 'tr-fact-label', '지금 빠르기'), speedBar, speedText);
    panel.append(clock, speedRow, element('p', 'tr-status', `${stationLabel(B.name)}까지 ${distanceText(Math.round(km * 1000))}, ${minutes}분 걸려요.`));
    if (soundOn) sound.startRumble(soundKindOf(kind));
    interior.setDisplay([`다음 역: ${B.name}`, `${hhmm(stopArr(b))} 도착`]);
    const start = performance.now();
    const tick = (now) => {
      const t = ms === 0 ? 1 : Math.min(1, (now - start) / ms);
      const kmh = speedAt(t);
      interior.setSpeed(kmh);
      interior.setScene(scenes[Math.min(scenes.length - 1, Math.floor(t * scenes.length))] ?? 'field');
      speedFill.style.width = `${Math.min(100, (kmh / 320) * 100).toFixed(0)}%`;
      speedText.textContent = `시속 ${Math.round(kmh)}km`;
      clock.textContent = `시각 ${hhmm(stopDep(a) + minutes * t)}`;
      if (t > 0.3 && t < 0.7) interior.setDisplay([`시속 ${Math.round(kmh)}km`, `다음 역: ${B.name}`]);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      frame = null;
      sound.stopRumble();
      at += 1;
      stopHere();
      if (toEnd && at < toIndex) later(() => move(true), reduceMotion ? 0 : 1600);
    };
    frame = requestAnimationFrame(tick);
  }

  concourse();
  return cleanup;
}

/** 여행 길의 기차 조각에 맞는 열차를 찾는다. */
export function trainOfLeg(leg) {
  return trainData.trains.find((t) => t.no === leg.train) ?? null;
}

/** 열차 종류 이름이 고속열차인지(카드 글자에 쓴다) */
export const groupText = (kind) => (trainGroup(kind) === '고속' ? '고속열차' : '일반열차');

/** 역 하나에서 afterMinute 뒤에 떠나는 열차들(시승 모드 전광판) */
export function departuresFrom(stationId, afterMinute, limit = 8) {
  return trainData.trains
    .flatMap((t) => t.stops.map((s, i) => ({ train: t, index: i, dep: s[2] })).filter((x) => x.dep !== null && x.train.stops[x.index][0] === stationId && x.index < x.train.stops.length - 1 && x.dep >= afterMinute))
    .sort((a, b) => a.dep - b.dep || a.train.no - b.train.no)
    .slice(0, limit);
}

export { hhmm };
