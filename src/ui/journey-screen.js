// 여행 모드(C단계): 고른 길을 구간마다 따라 가 본다.
// 걷기 → 기다리기 → 지하철(시승 화면의 한 구간 타기) → 갈아타기 → 버스·택시 → 걷기 …
// 다음 구간으로는 아이가 단추를 눌러야 간다(저절로 넘어가지 않는다).
// 요금: 버스·지하철은 처음 탈 때 그 요금을 내고, 마지막에 내릴 때 모자란 요금(2구간 등)을 더 낸다.
//       택시는 미터기(부산 중형택시 요금표)가 달리는 만큼 올라가고 내릴 때 낸다.
import { lineById } from '../data.js';
import { taxiFare } from '../sim/trip.js';
import { busRouteText, distanceText, durationText, stationLabel } from './format.js';
import { renderRideSegment } from './ride-screen.js';
import announcementsFile from '../content/announcements.json';
import { fillTemplate } from '../sim/announce.js';
import { createRideSound } from './ride-sound.js';
import { loadView } from './storage.js';
import { BUS_PEOPLE_MAX, busInteriorArt, taxiInteriorArt, walkSceneArt } from './vehicle-art.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 걷기·버스·택시 그림이 움직이는 시간(밀리초) */
const SCENE_MS = 3000;

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

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function wonText(value) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function minutesText(minutes) {
  return durationText(Math.max(1, Math.round(minutes)) * 60);
}

/** 분 → "08:34" */
function clockText(totalMinutes) {
  const m = Math.round(totalMinutes);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 여행 길을 화면 차례(단계)로 바꾼다. 아주 짧은 걷기(10m 밑, 1분 밑)는 뺀다. */
function stepsOf(trip) {
  const steps = [];
  trip.legs.forEach((leg, index) => {
    if (leg.mode === '걷기' && leg.meters < 10 && leg.minutes < 1) return;
    if (leg.minutes <= 0 && leg.mode !== '지하철') return;
    const next = trip.legs[index + 1];
    let kind = leg.mode;
    if (leg.mode === '기다리기') kind = leg.bus ? '버스 기다리기' : leg.taxi ? '택시 기다리기' : '열차 기다리기';
    steps.push({ ...leg, kind, next });
  });
  return steps;
}

/** 구간 띠에 쓰는 짧은 이름 */
function stepLabel(step) {
  if (step.kind === '지하철') return lineById.get(step.line)?.name ?? '지하철';
  if (step.kind === '열차 기다리기' || step.kind === '버스 기다리기' || step.kind === '택시 기다리기') return '기다리기';
  return step.kind;
}

/**
 * @param {HTMLElement} root
 * @param {{trip: object, from: object, to: object, hour: number, rider: 'adult'|'child', world: object,
 *   result: object, hourShape: number[], fares: object, onBack: () => void}} p
 */
export function renderJourney(root, { trip, from, to, hour, rider, world, result, hourShape, fares, onBack }) {
  root.replaceChildren();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const steps = stepsOf(trip);
  const stationOf = new Map(world.stations.map((s) => [s.id, s]));
  const transitSteps = steps.filter((s) => s.kind === '지하철' || s.kind === '버스');
  const firstTransit = transitSteps[0] ?? null;
  const lastTransit = transitSteps.at(-1) ?? null;

  let index = 0;
  let elapsed = 0; // 분
  let walked = 0; // m
  let paid = 0; // 원
  const timers = [];
  let rideCleanup = null;

  const screen = element('div', 'screen journey');
  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', `가 보기: ${from.name} → ${to.name}`));
  bar.append(button('여행하기로', onBack));
  screen.append(bar);
  const body = element('div', 'journey-body');
  screen.append(body);
  root.append(screen);

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function clearScene() {
    for (const id of timers.splice(0)) clearTimeout(id);
    rideCleanup?.();
    rideCleanup = null;
  }

  /** 맨 위: 구간 띠와 시계, 걸은 거리, 낸 돈 */
  function header() {
    const box = element('div', 'journey-head');
    const stripBox = element('ol', 'journey-strip');
    steps.forEach((step, i) => {
      const item = element('li', 'journey-chip', stepLabel(step));
      if (i < index) item.classList.add('is-done');
      if (i === index) item.classList.add('is-now');
      if (step.kind === '지하철') item.style.borderColor = lineById.get(step.line)?.color ?? '#1F3342';
      stripBox.append(item);
    });
    const arrived = index >= steps.length;
    if (arrived) stripBox.lastChild?.classList.add('is-done');
    box.append(stripBox);
    const stats = element('div', 'journey-stats');
    stats.append(
      element('span', 'journey-stat', `시각 ${clockText(hour * 60 + elapsed)}`),
      element('span', 'journey-stat', `걸린 시간 ${elapsed < 0.5 ? '0분' : minutesText(elapsed)}`),
      element('span', 'journey-stat', `걸은 거리 ${distanceText(walked)}`),
      element('span', 'journey-stat', `낸 돈 ${wonText(paid)}`),
    );
    box.append(stats);
    return box;
  }

  function render() {
    clearScene();
    body.replaceChildren(header());
    if (index >= steps.length) {
      renderArrived();
      return;
    }
    const step = steps[index];
    const area = element('div', 'journey-step');
    body.append(area);
    const renderers = {
      걷기: renderWalk,
      '열차 기다리기': renderPlatform,
      지하철: renderSubway,
      갈아타기: renderTransfer,
      '버스 기다리기': renderBusStop,
      버스: renderBus,
      '택시 기다리기': renderTaxiWait,
      택시: renderTaxi,
    };
    (renderers[step.kind] ?? renderWalk)(area, step);
  }

  /** 다음 단계로 간다. */
  function done(step, extra = {}) {
    elapsed += extra.minutes ?? step.minutes;
    if (step.kind === '걷기') walked += step.meters;
    index += 1;
    render();
  }

  /** 교통카드 찍기: 처음 탈 때 그 탈것 요금, 마지막에 내릴 때 모자란 요금 */
  function payNote(area, step, when) {
    if (step.kind !== '지하철' && step.kind !== '버스') return;
    const own = step.kind === '버스' ? fares.bus[rider === 'child' ? 'child' : 'adult'] : fares.subway[rider === 'child' ? 'child' : 'adult'][0];
    if (when === '탈 때' && step === firstTransit) {
      paid += Math.min(own, trip.fare);
      area.append(
        element('p', 'journey-pay', rider === 'child' ? '교통카드를 찍어요. 어린이라 0원이에요.' : `교통카드를 찍어요. ${wonText(Math.min(own, trip.fare))}을 내요.`),
      );
    }
    if (when === '내릴 때' && step === lastTransit && trip.fare > paid) {
      const more = trip.fare - paid;
      paid = trip.fare;
      area.append(element('p', 'journey-pay', `내릴 때 교통카드를 찍어요. 모자란 ${wonText(more)}을 더 내요.`));
      area.append(element('p', 'panel-note', '갈아타면 비싼 쪽 요금까지만 내요. 지하철 10km가 넘으면 더 내요.'));
    }
  }

  /** 그림이 움직이는 동안 막대가 차오른다. 끝나면 다음 단추가 켜진다. */
  function progress(area, label, onTick) {
    const track = element('div', 'journey-progress');
    const fill = element('div', 'journey-progress-fill');
    track.append(fill);
    area.append(element('p', 'panel-note', label), track);
    const steps = reduceMotion ? 1 : 30;
    return new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        n += 1;
        const t = n / steps;
        fill.style.width = `${(t * 100).toFixed(1)}%`;
        onTick?.(t);
        if (n >= steps) resolve();
        else later(tick, SCENE_MS / steps);
      };
      later(tick, reduceMotion ? 0 : SCENE_MS / steps);
    });
  }

  function nextButton(area, label, onClick, ready = Promise.resolve()) {
    const node = button(label, onClick, 'button big ride-go');
    node.disabled = true;
    ready.then(() => {
      node.disabled = false;
    });
    area.append(node);
    return node;
  }

  // ---------- 그림들 ----------
  function sceneSvg(height = 200) {
    return svgEl('svg', { class: 'journey-scene', viewBox: `0 0 800 ${height}`, role: 'img' });
  }

  function walker(svg, color = '#2F6690') {
    const g = svgEl('g', { class: reduceMotion ? '' : 'journey-walker' });
    g.append(svgEl('circle', { cx: 0, cy: 118, r: 11, fill: '#F2C9A0', stroke: '#1F3342', 'stroke-width': 1.5 }));
    g.append(svgEl('rect', { x: -11, y: 130, width: 22, height: 34, rx: 8, fill: color, stroke: '#1F3342', 'stroke-width': 1.5 }));
    g.append(svgEl('rect', { x: -9, y: 162, width: 7, height: 22, rx: 3, fill: '#34495E', class: 'leg-a' }));
    g.append(svgEl('rect', { x: 2, y: 162, width: 7, height: 22, rx: 3, fill: '#34495E', class: 'leg-b' }));
    svg.append(g);
    return g;
  }

  function renderWalk(area, step) {
    const target = step.to ? stationLabel(stationOf.get(step.to)?.name ?? '역') : step.from ? to.name : to.name;
    const start = step.from ? stationLabel(stationOf.get(step.from)?.name ?? '역') : from.name;
    const title = step.stop
      ? `${step.stop} 정류장까지 걸어요`
      : step.to
        ? `${target}까지 걸어요`
        : `${start}에서 ${to.name}까지 걸어요`;
    area.append(element('h2', null, title));
    // 가로수 사이 넓은 보도를 뒷모습으로 걸어간다(src/ui/vehicle-art.js).
    const scene = walkSceneArt({ reduceMotion });
    area.append(scene.svg);
    area.append(element('p', null, `${distanceText(step.meters)}, 약 ${minutesText(step.minutes)} 걸려요.`));
    if (!step.from && from.hilly) area.append(element('p', 'panel-note', '언덕길이라 천천히 걸어요.'));
    const ready = progress(area, '걷는 중이에요.', (t) => scene.setProgress(t));
    nextButton(area, '다 걸었어요', () => done(step), ready);
  }

  function signBox(stationId, lineId) {
    const station = stationOf.get(stationId);
    const line = lineById.get(lineId);
    const sign = element('div', 'station-sign journey-sign');
    const top = element('div', 'sign-top');
    top.style.background = line?.color ?? '#1F3342';
    top.style.color = '#FFFFFF';
    top.append(element('span', 'sign-line-tag', line?.label ?? ''), element('span', 'sign-line', line?.name ?? ''));
    const main = element('div', 'sign-main');
    main.append(element('span', 'sign-name', station?.name ?? ''));
    sign.append(top, main);
    return sign;
  }

  function renderPlatform(area, step) {
    const ride = step.next;
    const boardId = ride?.stations?.[0];
    const line = lineById.get(step.line);
    area.append(element('h2', null, `${line?.name ?? '지하철'} 열차를 기다려요`));
    if (boardId) area.append(signBox(boardId, step.line));
    const led = element('div', 'ride-led');
    const toward = ride?.stations?.at(-1);
    led.append(element('span', 'ride-led-text', toward ? `${stationOf.get(toward)?.name ?? ''} 방면 열차가 곧 들어와요` : '열차가 곧 들어와요'));
    area.append(led);
    area.append(element('p', null, `열차는 ${minutesText(step.minutes * 2)}마다 와요. 평균 ${minutesText(step.minutes)} 기다려요.`));
    const ready = progress(area, '기다리는 중이에요.');
    nextButton(area, '열차에 타요', () => done(step), ready);
  }

  function renderSubway(area, step) {
    const line = lineById.get(step.line);
    const head = element('div', 'journey-ride-head');
    head.append(element('h2', null, `${line?.name ?? '지하철'}을 타요`));
    area.append(head);
    payNote(area, step, '탈 때');
    const holder = element('div', 'journey-ride');
    area.append(holder);
    rideCleanup = renderRideSegment(holder, {
      lineId: step.line,
      fromId: step.stations[0],
      toId: step.stations.at(-1),
      hour: hour + elapsed / 60,
      world,
      result,
      hourShape,
      onArrive: () => {
        const after = element('div');
        payNote(after, step, '내릴 때');
        if (after.childNodes.length > 0) {
          // 내릴 때 요금 안내를 잠깐 보여 주고 다음으로
          rideCleanup?.();
          rideCleanup = null;
          holder.replaceChildren(after);
          nextButton(holder, '다음으로', () => done(step));
        } else {
          done(step);
        }
      },
    });
  }

  function renderTransfer(area, step) {
    if (step.stations) {
      const line = lineById.get(step.line);
      area.append(element('h2', null, `${line?.name ?? '다른 노선'}으로 갈아타요`));
      const svg = sceneSvg(160);
      svg.setAttribute('aria-label', '갈아타는 통로 그림이에요.');
      svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 160, fill: '#EEF1F4' }));
      for (let x = 0; x < 800; x += 50) svg.append(svgEl('line', { x1: x, y1: 120, x2: x + 30, y2: 160, stroke: '#D5DBE1', 'stroke-width': 2 }));
      svg.append(svgEl('rect', { x: 250, y: 20, width: 300, height: 50, rx: 6, fill: line?.color ?? '#1F3342' }));
      svg.append(svgEl('text', { x: 400, y: 54, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700, fill: '#FFFFFF' }, `${line?.label ?? ''}호선 타는 곳 →`));
      area.append(svg);
      area.append(element('p', null, `통로를 걷고 열차를 기다려요. 약 ${minutesText(step.minutes)} 걸려요.`));
    } else {
      area.append(element('h2', null, step.next?.mode === '기다리기' && step.next?.bus ? '역에서 나와 버스 정류장으로 가요' : '버스에서 내려 역으로 가요'));
      area.append(element('p', null, `약 ${minutesText(step.minutes)} 걸어요.`));
    }
    const ready = progress(area, '갈아타는 중이에요.');
    nextButton(area, '다음으로', () => done(step), ready);
  }

  function renderBusStop(area, step) {
    const stopName = step.next?.stops?.[0]?.name ?? null;
    area.append(element('h2', null, step.route ? `${busRouteText(step.route)} 버스를 기다려요` : '버스 정류장에서 기다려요'));
    const svg = sceneSvg(180);
    svg.setAttribute('aria-label', '버스 정류장 그림이에요.');
    svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 180, fill: '#DCEEF7' }));
    svg.append(svgEl('rect', { x: 0, y: 150, width: 800, height: 30, fill: '#9AA5AE' }));
    svg.append(svgEl('rect', { x: 120, y: 60, width: 12, height: 90, fill: '#56636E' }));
    svg.append(svgEl('rect', { x: 90, y: 40, width: 72, height: 30, rx: 6, fill: '#2E8B3E' }));
    svg.append(svgEl('text', { x: 126, y: 61, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#FFFFFF' }, '버스'));
    if (stopName) {
      // 정류장 이름판
      svg.append(svgEl('rect', { x: 400, y: 30, width: 360, height: 44, rx: 6, fill: '#2E8B3E' }));
      svg.append(svgEl('text', { x: 580, y: 60, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: '#FFFFFF' }, stopName));
    }
    if (step.route) {
      svg.append(svgEl('rect', { x: 400, y: 84, width: 120, height: 36, rx: 6, fill: '#1D1F22' }));
      svg.append(svgEl('text', { x: 460, y: 109, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: '#F2A33A' }, busRouteText(step.route)));
    }
    svg.append(svgEl('rect', { x: 180, y: 70, width: 200, height: 10, fill: '#7A8691' }));
    walker(svg).setAttribute('transform', 'translate(240 -34)');
    area.append(svg);
    if (step.route) {
      area.append(element('p', null, `버스를 약 ${minutesText(step.minutes)} 기다려요.`));
      area.append(element('p', 'panel-note', '기다리는 시간은 우리가 정한 값이에요.'));
    } else {
      area.append(element('p', null, `정류장까지 걷고 버스를 기다리는 데 약 ${minutesText(step.minutes)} 걸려요.`));
      area.append(element('p', 'panel-note', '가까운 정류장이 없어서 버스를 어림으로 셈해요.'));
    }
    const ready = progress(area, '버스를 기다리는 중이에요.');
    nextButton(area, '버스에 타요', () => done(step), ready);
  }

  function renderBus(area, step) {
    if (step.stops?.length >= 2) {
      renderRealBus(area, step);
      return;
    }
    area.append(element('h2', null, '버스를 타고 가요'));
    payNote(area, step, '탈 때');
    // 버스 안: 몇 명이 탔는지 자료가 없어서 사람 그림은 몇 개만 그린다.
    const bus = busInteriorArt({ count: 6, color: '#2E8B3E', label: '시내버스', reduceMotion });
    bus.setAttribute('aria-label', '버스 안 그림이에요. 뒤에서 앞을 바라봐요.');
    area.append(bus);
    area.append(element('p', null, `약 ${distanceText(step.meters)}, ${minutesText(step.minutes)} 가요.`));
    const ready = progress(area, '버스가 달리는 중이에요.');
    const bottom = element('div');
    area.append(bottom);
    ready.then(() => payNote(bottom, step, '내릴 때'));
    nextButton(area, '하차벨 누르고 내려요', () => done(step), ready);
  }

  /**
   * 실제 노선 버스: 정류장마다 안내 방송(글자, 켜 두면 목소리)과 버스 안 붐빔을 보여 준다.
   * 붐빔은 하루 승하차 자료로 어림한 것(이 노선에서 가장 붐비는 곳을 가득으로 본다)이다.
   */
  function renderRealBus(area, step) {
    const stops = step.stops;
    const last = stops.length - 1;
    const templates = announcementsFile.bus;
    const voiceOn = loadView().rideVoice === true;
    const sound = createRideSound();
    rideCleanup = () => sound.stopAll();
    let k = 0; // 지금 막 떠난 정류장 차례

    area.append(element('h2', null, `${busRouteText(step.route)} 버스를 타고 가요`));
    payNote(area, step, '탈 때');
    const box = element('div');
    area.append(box);

    /** 지금 방송: 떠난 뒤에는 다음에 설 정류장, 마지막 정류장에 서면 종점 방송 */
    function lines() {
      if (k >= last) {
        const end = templates.terminal.map((line) => fillTemplate(line, { name: stops[last].name }));
        // 이 버스의 종점이 아니면 "모두 내려 주세요"는 빼고 이번 정류장만 말한다.
        return step.endsAtTerminal ? end : [fillTemplate(templates.arrival[0], { name: stops[last].name })];
      }
      const values = { name: stops[k + 1].name, next: stops[k + 2]?.name ?? '' };
      return templates.arrival.filter((line) => values.next || !line.includes('{next}')).map((line) => fillTemplate(line, values));
    }

    function draw() {
      box.replaceChildren();
      const led = element('div', 'ride-led');
      for (const text of lines()) led.append(element('span', 'ride-led-text', text));
      box.append(led);
      // 붐빔: 떠난 정류장 뒤 버스 안(사람 그림 수)
      const load = stops[Math.min(k, last - 1)].load ?? 0;
      const count = Math.max(1, Math.round(load * BUS_PEOPLE_MAX * 0.8));
      const art = busInteriorArt({ count, color: '#2E8B3E', label: busRouteText(step.route), reduceMotion });
      art.setAttribute('aria-label', `버스 안 그림이에요. 사람 그림이 ${count}개 있어요.`);
      box.append(art);
      box.append(element('p', 'panel-note', '붐빔은 하루 승하차 자료로 어림했어요.'));
      // 지나온 정류장: 네모 하나가 정류장 하나
      const row = element('div', 'journey-bus-stops');
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', `정류장 ${last}개 가운데 ${Math.min(k + 1, last)}번째로 가요.`);
      for (let i = 1; i <= last; i++) {
        const cell = element('span', i <= k ? 'journey-bus-stop is-done' : i === k + 1 ? 'journey-bus-stop is-now' : 'journey-bus-stop');
        cell.textContent = i <= k ? '■' : '□';
        row.append(cell);
      }
      box.append(row);
      box.append(
        element('p', null, k < last ? `${stops[last].name}까지 정류장 ${last - k}개 남았어요.` : `${stops[last].name}에 왔어요.`),
      );
      const buttons = element('div', 'journey-buttons');
      if (k < last) {
        buttons.append(button('다음 정류장으로', () => go(k + 1), 'button big'));
        if (k + 1 < last) buttons.append(button('내릴 정류장까지', () => go(last), 'button big'));
      } else {
        const bottom = element('div');
        box.append(bottom);
        payNote(bottom, step, '내릴 때');
        buttons.append(button('하차벨 누르고 내려요', () => done(step), 'button big ride-go'));
      }
      box.append(buttons);
    }

    function go(target) {
      k = target;
      draw();
      sound.wake();
      if (voiceOn) sound.announce({ korean: lines(), english: [], voice: true, music: false });
    }

    draw();
    sound.wake();
    if (voiceOn) sound.announce({ korean: lines(), english: [], voice: true, music: false });
  }

  function renderTaxiWait(area, step) {
    area.append(element('h2', null, '택시를 잡아요'));
    area.append(element('p', null, `택시를 잡는 데 약 ${minutesText(step.minutes)} 걸려요.`));
    area.append(element('p', 'panel-note', '택시를 잡는 시간은 우리가 정한 값이에요.'));
    const ready = progress(area, '택시를 기다리는 중이에요.');
    nextButton(area, '택시에 타요', () => done(step), ready);
  }

  function renderTaxi(area, step) {
    area.append(element('h2', null, '택시를 타고 가요'));
    // 뒷자리에서 본 택시 안. 그림 속 미터기도 함께 올라간다.
    const taxi = taxiInteriorArt({ reduceMotion, meterText: fares.taxi.baseFare.toLocaleString('ko-KR') });
    area.append(taxi.svg);
    // 요금 미터기: 달린 거리만큼 부산 택시 요금표대로 올라간다.
    const meter = element('div', 'taxi-meter');
    meter.setAttribute('role', 'status');
    const fareNode = element('span', 'taxi-meter-fare', wonText(fares.taxi.baseFare));
    const kmNode = element('span', 'taxi-meter-km', '0m');
    meter.append(element('span', 'taxi-meter-label', '요금'), fareNode, kmNode);
    area.append(meter);
    const clockHour = hour + elapsed / 60;
    const ready = progress(area, '택시가 달리는 중이에요.', (t) => {
      const km = (step.meters / 1000) * t;
      const fare = t === 0 ? fares.taxi.baseFare : taxiFare(fares, km, step.minutes * t, clockHour);
      fareNode.textContent = wonText(fare);
      taxi.setMeter(fare.toLocaleString('ko-KR'));
      kmNode.textContent = distanceText(km * 1000);
    });
    area.append(element('p', 'panel-note', '처음 2km는 기본요금이에요. 그다음 132m마다 100원씩 올라가요.'));
    if (fareNode && trip.fare > taxiFare(fares, step.meters / 1000, step.minutes, 13)) {
      area.append(element('p', 'panel-note', '밤에는 요금이 더 붙어요(할증).'));
    }
    nextButton(area, '요금 내고 내려요', () => {
      paid += trip.fare;
      done(step);
    }, ready);
  }

  function renderArrived() {
    const card = element('div', 'journey-done');
    card.append(element('h2', null, `${to.name}에 도착했어요`));
    const list = element('ul', 'panel-list');
    list.append(element('li', null, `${clockText(hour * 60)}에 떠나서 ${clockText(hour * 60 + elapsed)}에 닿았어요.`));
    list.append(element('li', null, `걸린 시간: ${minutesText(elapsed)}`));
    list.append(element('li', null, `걸은 거리: ${distanceText(walked)}`));
    list.append(element('li', null, `낸 돈: ${wonText(paid)}`));
    card.append(list);
    card.append(element('p', 'panel-note', '다른 길로 가면 시간과 요금이 어떻게 다를까요?'));
    const row = element('div', 'tool-row');
    row.append(
      button('다른 길로 가 보기', onBack, 'button big'),
      button('이 길로 다시 가기', () => {
        index = 0;
        elapsed = 0;
        walked = 0;
        paid = 0;
        render();
      }),
    );
    card.append(row);
    body.append(card);
  }

  render();
  return () => clearScene();
}
