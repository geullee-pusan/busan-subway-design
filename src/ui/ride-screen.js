// 시승 화면. 내 노선 열차 한 대를 타고 끝 역에서 끝 역까지 가 본다.
// 하행(첫 역 → 끝 역)과 상행(끝 역 → 첫 역), 타는 시간대를 고른다.
// 역마다 역명판과 안내 방송이 나오고, 열차 안 그림에 타고 있는 사람 수만큼 사람이 보인다.
// 다음 역으로는 아이가 단추를 눌러야 간다(저절로 넘어가지 않는다).
import { futureLines, grid, lineById, ruleTables, stationById } from '../data.js';
import { terrainAt } from '../sim/design.js';
import { NEW_LINE_ID } from '../sim/design-world.js';
import announcementsFile from '../content/announcements.json';
import { announcementLines, englishLines } from '../sim/announce.js';
import { romanize } from '../sim/romanize.js';
import { crowdWord, rideTrip, windowScene } from '../sim/ride.js';
import { lineRoutes } from '../sim/train-motion.js';
import { countText, durationText, roParticle, stationLabel } from './format.js';
import { DESIGN_COLOR, labelInk } from './map.js';
import {
  browserName,
  createRideSound,
  isAndroid,
  openInChrome,
  openVoiceInstall,
  setVoiceMode,
  speechSupported,
  surelyNoVoice,
  testVoice,
  voicesReady,
} from './ride-sound.js';
import { loadView, saveView } from './storage.js';
import { wordWithCard } from './word-card.js';

/** 고를 수 있는 시간대 */
const TIMES = [
  { hour: 8, label: '아침 8시' },
  { hour: 13, label: '낮 1시' },
  { hour: 18, label: '저녁 6시' },
  { hour: 22, label: '밤 10시' },
];
/** 역 사이를 달리는 그림 시간(밀리초). 동작 줄이기를 켜면 바로 도착한다. */
const MOVE_MS = 2600;
/** 차 한 칸 그림: 앉는 자리 14, 서는 자리 36 = 정원. 넘치면 12자리를 더 쓴다. */
const SEATS = 14;
const STANDS = 36;
const EXTRA = 12;
const SPOTS = SEATS + STANDS;
const SHIRTS = ['#2F6690', '#D1495B', '#EDAE49', '#3A7D44', '#6D597A', '#00798C', '#9C6644', '#4F5D75'];
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 달릴 때 창밖 모습을 알려 주는 말 */
const SCENE_TEXT = {
  땅속: '지금은 땅속을 달려요.',
  '바다 밑': '지금은 바다 밑을 달려요.',
  '강 위 다리': '지금은 강 위 다리를 건너요.',
  '높은 다리': '지금은 높은 다리 위를 달려요.',
};

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

/** 받침이 있으면 "을", 없으면 "를" */
function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '를' : '을';
  return '을';
}

/** 초 → "08:04" */
function clockText(seconds) {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * @param {HTMLElement} root
 * @param {{design: object, world: object, result: object, hourShape: number[], dayType: string,
 *   onBack: () => void, onHome: () => void}} p
 *   world와 result는 새 노선을 넣고 하루를 돌린 것(runWithDesign)
 */
export function renderRide(root, { design, world, result, hourShape, dayType = '평일', onBack, onHome }) {
  root.replaceChildren();
  const color = design.color ?? DESIGN_COLOR;
  const ink = labelInk(color);
  const lineName = design.lineName ?? '새 노선';
  const kind = ruleTables.lineKinds[design.kind] ?? ruleTables.lineKinds['경전철'];
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // 새 노선 역과 구간
  const stops = world.stations.filter((s) => s.line === NEW_LINE_ID).map((s) => ({ id: s.id, name: s.name, cell: s.cell }));
  const cellOf = new Map(stops.map((s) => [s.id, s.cell]));
  const peopleOf = new Map(
    result.links.filter((l) => l.line === NEW_LINE_ID).map((l) => [`${l.from}|${l.to}`, l.people]),
  );
  const links = world.links
    .filter((l) => l.line === NEW_LINE_ID)
    .map((l) => ({ from: l.from, to: l.to, runS: l.runS, people: peopleOf.get(`${l.from}|${l.to}`) ?? 0 }));
  const lineNameOf = new Map(world.lines.map((l) => [l.id, l.name]));
  const stationOf = new Map(world.stations.map((s) => [s.id, s]));

  /** 노선마다 양쪽 끝 역 이름(갈아타기 방송의 방면) */
  const endsOf = new Map(
    lineRoutes(world).map((route) => [route.line, [route.stops[0], route.stops.at(-1)].map((id) => stationOf.get(id)?.name)]),
  );

  /** 이 역에서 갈아탈 수 있는 노선: {line: 노선 이름, via: 그 노선의 끝 역(이 역은 뺀다)} */
  function transferLines(id) {
    const group = world.transfers.find((t) => t.stations.includes(id));
    if (!group) return [];
    const here = stationOf.get(id)?.name;
    const found = new Map();
    for (const other of group.stations) {
      if (other === id) continue;
      const lineId = stationOf.get(other)?.line;
      const line = lineNameOf.get(lineId);
      if (!line || found.has(line)) continue;
      found.set(line, (endsOf.get(lineId) ?? []).filter((name) => name && name !== here));
    }
    return [...found].map(([line, via]) => ({ line, via }));
  }

  /** 이 역에서 내리면 가까운 중심지(1km 안, 역 이름과 같은 곳은 뺀다) */
  function nearPlace(id) {
    const station = stationOf.get(id);
    if (!station) return null;
    const name = station.name.replace(/역$/, '');
    let best = null;
    for (const center of world.centers) {
      if (name.includes(center.name) || center.name.includes(name)) continue;
      const km = Math.hypot(center.x - station.x, center.y - station.y);
      if (km <= 1 && (!best || km < best.km || (km === best.km && center.name < best.name))) best = { name: center.name, km };
    }
    return best?.name ?? null;
  }

  /** 두 역 사이 창밖 모습(선이 지나는 칸의 지형) */
  function sceneBetween(a, b) {
    const i = design.path.indexOf(cellOf.get(a));
    const j = design.path.indexOf(cellOf.get(b));
    if (i < 0 || j < 0) return '땅속';
    const cells = design.path.slice(Math.min(i, j), Math.max(i, j) + 1);
    return windowScene(cells.map((cell) => terrainAt(grid, cell)));
  }

  // 고른 것과 지금 자리
  let direction = 1;
  let timeIndex = 0;
  let trip = null;
  let at = 0;
  let phase = '고르기'; // '고르기' | '역' | '달리기'
  let timer = null;
  let voiceOn = loadView().rideVoice === true;
  let soundOn = loadView().rideSound === true;
  // 이 기기에서 목소리가 나온 방법(목소리 들어 보기에서 찾는다)
  setVoiceMode(loadView().rideVoiceMode);
  let ledTimer = null;
  const sound = createRideSound();
  const futureLineById = new Map(futureLines.lines.map((l) => [l.id, l]));

  /** 영어 이름: 이미 있는 역과 같은 칸이면 그 역의 공식 영어 이름, 아니면 로마자 표기 */
  function englishName(id) {
    const group = world.transfers.find((t) => t.stations.includes(id));
    for (const other of group?.stations ?? []) {
      const en = stationById.get(other)?.nameEn;
      if (en) return en.replace(/'+/g, "'");
    }
    return romanize(stationOf.get(id)?.name ?? '');
  }

  /** 갈아탈 노선의 표(번호 글자, 색). 역명판에 동그라미로 붙인다. */
  function transferMarks(id) {
    const group = world.transfers.find((t) => t.stations.includes(id));
    const seen = new Set();
    const marks = [];
    for (const other of group?.stations ?? []) {
      const lineId = stationOf.get(other)?.line;
      if (!lineId || lineId === NEW_LINE_ID || seen.has(lineId)) continue;
      seen.add(lineId);
      const line = lineById.get(lineId) ?? futureLineById.get(lineId);
      marks.push({ label: line?.label ?? lineNameOf.get(lineId) ?? '', name: line?.name ?? '', color: line?.color ?? '#1F3342' });
    }
    return marks;
  }

  const screen = element('div', 'screen ride');
  screen.style.setProperty('--design-color', color);
  screen.style.setProperty('--design-ink', ink);
  const bar = element('header', 'top-bar');
  bar.append(element('h1', 'top-title', `시승: ${lineName}`));
  bar.append(button('설계로', onBack), button('처음으로', onHome));
  screen.append(bar);
  const body = element('div', 'ride-body');
  screen.append(body);
  root.append(screen);

  // ---------- 노선 띠 ----------
  function strip() {
    const order = direction === 1 ? stops : [...stops].reverse();
    const box = element('div', 'ride-strip');
    box.style.setProperty('--count', String(order.length));
    const rail = element('div', 'ride-rail');
    box.append(rail);
    for (const [index, stop] of order.entries()) {
      const item = element('div', 'ride-stop');
      if (phase !== '고르기') {
        if (index < at) item.classList.add('is-past');
        if (index === at && phase === '역') item.classList.add('is-here');
      }
      const number = stops.indexOf(stop) + 1;
      item.append(element('span', 'ride-dot', String(number)), element('span', 'ride-stop-name', stop.name));
      box.append(item);
    }
    if (phase !== '고르기') {
      const train = element('div', 'ride-train', '열차');
      train.setAttribute('aria-hidden', 'true');
      const place = (index) => `${((index + 0.5) / order.length) * 100}%`;
      train.style.left = place(phase === '달리기' ? at - 1 : at);
      box.append(train);
      if (phase === '달리기') {
        train.style.transitionDuration = `${reduceMotion ? 0 : MOVE_MS}ms`;
        requestAnimationFrame(() => requestAnimationFrame(() => (train.style.left = place(at))));
      }
    }
    return box;
  }

  // ---------- 고르기 ----------
  function renderSetup() {
    body.replaceChildren();
    const card = element('div', 'ride-setup');
    const first = stationLabel(stops[0].name);
    const last = stationLabel(stops.at(-1).name);
    card.append(element('h2', null, `${lineName}${objectParticle(lineName)} 타 봐요`));
    card.append(strip());

    const dirTitle = element('h3');
    dirTitle.append(element('span', null, '어느 쪽으로 갈까요? '), wordWithCard('하행'), element('span', null, ' '), wordWithCard('상행'));
    card.append(dirTitle);
    const dirRow = element('div', 'tool-row');
    for (const [value, label] of [
      [1, `하행: ${first} → ${last}`],
      [-1, `상행: ${last} → ${first}`],
    ]) {
      const node = button(label, () => {
        direction = value;
        renderSetup();
      });
      node.classList.toggle('is-on', direction === value);
      node.setAttribute('aria-pressed', String(direction === value));
      dirRow.append(node);
    }
    card.append(dirRow);

    card.append(element('h3', null, '언제 탈까요?'));
    const busiest = Math.max(...TIMES.map((t) => hourShape[t.hour] ?? 0), 1e-9);
    const timeRow = element('div', 'ride-times');
    for (const [index, time] of TIMES.entries()) {
      const node = button('', () => {
        timeIndex = index;
        renderSetup();
      }, 'button ride-time');
      node.append(element('span', null, time.label));
      // 막대: 이 시간에 사람이 얼마나 많이 타는지(가장 많은 시간 = 가득)
      const gauge = element('span', 'ride-time-bar');
      const fill = element('span', 'ride-time-fill');
      fill.style.width = `${(((hourShape[time.hour] ?? 0) / busiest) * 100).toFixed(0)}%`;
      gauge.append(fill);
      node.append(gauge);
      node.classList.toggle('is-on', timeIndex === index);
      node.setAttribute('aria-pressed', String(timeIndex === index));
      timeRow.append(node);
    }
    card.append(timeRow);
    card.append(element('p', 'panel-note guide', '막대가 길수록 그 시간에 타는 사람이 많아요.'));
    card.append(element('p', 'panel-note', `${dayType} 자료로 타요.`));

    // 소리: 방송 목소리(기기 안 목소리), 배경음과 효과음(열차 진입 안내음, 방송 안내음, 달리는 소리)
    card.append(element('h3', null, '소리'));
    const soundRow = element('div', 'tool-row');
    const voiceButton = button(voiceOn ? '방송 목소리: 켬' : '방송 목소리: 끔', () => {
      voiceOn = !voiceOn;
      saveView({ rideVoice: voiceOn });
      renderSetup();
    });
    voiceButton.classList.toggle('is-on', voiceOn);
    voiceButton.setAttribute('aria-pressed', String(voiceOn));
    // 글 읽기 기능이 없는 브라우저에서는 켜도 소용없다. 단추를 막고 아래에 크롬 안내를 늘 보여 준다.
    if (!speechSupported()) {
      voiceButton.textContent = '방송 목소리: 못 써요';
      voiceButton.disabled = true;
      voiceButton.classList.remove('is-on');
    }
    const musicButton = button(soundOn ? '배경음·효과음: 켬' : '배경음·효과음: 끔', () => {
      soundOn = !soundOn;
      saveView({ rideSound: soundOn });
      renderSetup();
    });
    musicButton.classList.toggle('is-on', soundOn);
    musicButton.setAttribute('aria-pressed', String(soundOn));
    soundRow.append(voiceButton, musicButton);
    card.append(soundRow);
    // 우리말 목소리가 없으면 받는 곳을 연다. 목록은 조금 늦게 올라오므로 기다렸다가 본다.
    if (!speechSupported()) {
      // 브라우저에 글 읽기 기능이 없다(삼성 인터넷, 카카오톡 안 브라우저 등). Chrome에서 열면 된다.
      const voiceBox = element('div', 'voice-get');
      const where = browserName();
      voiceBox.append(element('p', 'panel-note', where ? `${where}에서는 방송을 소리로 읽지 못해요.` : '이 브라우저는 방송을 소리로 읽지 못해요.'));
      voiceBox.append(element('p', 'panel-note', '크롬(Chrome)에서 열면 목소리가 나와요.'));
      if (isAndroid()) {
        voiceBox.append(button('크롬으로 열기', openInChrome, 'button big'));
        voiceBox.append(element('p', 'panel-note guide', '홈 화면에 놓을 때도 크롬에서 놓아요.'));
      }
      card.append(voiceBox);
    } else if (voiceOn) {
      const voiceBox = element('div', 'voice-get');
      card.append(voiceBox);
      voicesReady().then(() => {
        if (!voiceBox.isConnected) return;
        const missing = surelyNoVoice('ko');
        if (!missing) {
          // 목록으로는 알 수 없을 때가 많다(안드로이드). 직접 들어 보게 한다.
          const row = element('div', 'tool-row');
          const status = element('p', 'panel-note');
          status.setAttribute('role', 'status');
          const report = element('details', 'voice-report');
          report.hidden = true;
          const test = button('목소리 들어 보기', () => {
            test.disabled = true;
            status.textContent = '들어 보는 중이에요.';
            testVoice().then((result) => {
              test.disabled = false;
              if (result.ok) {
                saveView({ rideVoiceMode: result.mode });
                status.textContent = '목소리가 나왔어요. 방송도 이렇게 읽어요.';
              } else {
                status.textContent = '목소리를 내지 못했어요. 아래 점검 결과를 어른에게 보여 줘요.';
              }
              report.replaceChildren(element('summary', null, '목소리 점검 결과'), element('pre', 'license-text', result.log.join('\n')));
              report.hidden = false;
            });
          });
          row.append(test);
          voiceBox.append(row, status, report);
          voiceBox.append(element('p', 'panel-note guide', '소리가 안 나면 기기 소리 크기를 먼저 살펴봐요.'));
        } else {
          voiceBox.append(element('p', 'panel-note', '방송을 읽어 줄 우리말 목소리를 찾지 못했어요.'));
        }
        if (isAndroid()) {
          voiceBox.append(button('우리말 목소리 받기', openVoiceInstall, missing ? 'button big' : 'button'));
          voiceBox.append(element('p', 'panel-note guide', '어른과 함께 "한국어"를 골라 받아요. 받은 뒤 이 화면으로 돌아오면 돼요.'));
        } else if (missing) {
          voiceBox.append(element('p', 'panel-note guide', '어른과 함께 기기 설정의 "음성" 메뉴에서 한국어 목소리를 받아요.'));
        }
      });
    }
    if (soundOn) card.append(element('p', 'panel-note', '열차가 들어올 때 부산 지하철 진짜 안내음이 나와요.'));

    card.append(button('타기', startTrip, 'button big ride-go'));
    body.append(card);
  }

  function startTrip() {
    trip = rideTrip({
      stops,
      links,
      stations: result.stations,
      hourShare: hourShape[TIMES[timeIndex].hour] ?? 0,
      trainsPerHour: design.trainsPerHour,
      capacity: kind.capacityPerTrain,
      direction,
    });
    at = 0;
    phase = '역';
    sound.wake();
    renderRide();
    const ride = trip;
    const entering = soundOn ? sound.trainEntering(direction) : Promise.resolve();
    entering.then(() => {
      if (trip === ride && phase === '역' && at === 0) announceNow();
    });
  }

  /** 지금 방송을 소리로 낸다(켜 둔 것만). */
  function announceNow() {
    if (!voiceOn && !soundOn) return;
    const { korean, english } = announcement();
    sound.announce({ korean, english, voice: voiceOn, music: soundOn });
  }

  /** 떠난 시각부터 지금 역까지 걸린 시간(초) */
  function elapsedTo(index) {
    return trip.stops.slice(0, index).reduce((sum, s) => sum + (s.runS ?? 0), 0);
  }

  // ---------- 방송 ----------
  // 실제 부산 도시철도 차내 방송의 모양을 따른다(src/content/announcements.json).
  //  첫 역에서 떠나기 전: 출발 방송. 달리는 동안과 역에 선 뒤: 그 역의 "이번 역은" 방송(종착역은 종착 방송).
  function announcement() {
    const stop = trip.stops[at];
    if (phase === '역' && at === 0) {
      const middle = trip.stops.slice(1, -1);
      // 방면: 지나는 역 가운데 갈아타는 역을 먼저, 두 곳까지
      const via = [...middle.filter((s) => transferLines(s.id).length > 0), ...middle.filter((s) => transferLines(s.id).length === 0)]
        .slice(0, 2)
        .sort((a, b) => trip.stops.indexOf(a) - trip.stops.indexOf(b))
        .map((s) => s.name);
      const end = trip.stops.at(-1);
      return {
        korean: announcementLines(announcementsFile, { type: '출발', name: stop.name, end: end.name, via }),
        english: englishLines(announcementsFile, { type: '출발', name: englishName(stop.id), end: englishName(end.id) }),
      };
    }
    const type = at === trip.stops.length - 1 ? '종착' : '도착';
    const lineNumbers = transferMarks(stop.id)
      .map((mark) => mark.label)
      .filter((label) => /^\d+$/.test(label));
    return {
      korean: announcementLines(announcementsFile, {
        type,
        name: stop.name,
        transfers: transferLines(stop.id),
        place: nearPlace(stop.id),
      }),
      english: englishLines(announcementsFile, { type, name: englishName(stop.id), lineNumbers }),
    };
  }

  // ---------- 역명판 ----------
  // 우리나라 도시철도 승강장 역명판의 흔한 짜임: 흰 판, 노선 색 띠, 역 번호 동그라미, 큰 한글 이름과 영어 이름,
  // 갈아탈 노선 표, 아래 띠에 앞 역과 다음 역(화살표는 가는 쪽). 글꼴은 프리텐다드 굵은체(자유 이용 허락 OFL).
  function stationSign() {
    const stop = trip.stops[at];
    const prev = trip.stops[at - 1];
    const next = trip.stops[at + 1];
    const sign = element('div', 'station-sign');
    sign.setAttribute('role', 'img');
    sign.setAttribute(
      'aria-label',
      `역명판: ${stationLabel(stop.name)}${next ? `, 다음 역 ${stationLabel(next.name)}` : ', 마지막 역'}`,
    );
    const top = element('div', 'sign-top');
    top.style.background = color;
    const tag = element('span', 'sign-line-tag', '새');
    tag.style.color = color;
    top.append(tag, element('span', 'sign-line', lineName));
    top.style.color = ink === color ? '#FFFFFF' : '#1F3342';

    const main = element('div', 'sign-main');
    const number = element('span', 'sign-number', String(stops.findIndex((s) => s.id === stop.id) + 1).padStart(2, '0'));
    number.style.borderColor = color;
    const names = element('div', 'sign-names');
    names.append(element('span', 'sign-name', stop.name));
    const en = element('span', 'sign-name-en', englishName(stop.id));
    en.lang = 'en';
    names.append(en);
    main.append(number, names);
    const marks = transferMarks(stop.id);
    if (marks.length > 0) {
      const row = element('div', 'sign-transfer');
      row.append(element('span', 'sign-transfer-label', '환승'));
      for (const mark of marks) {
        const b = element('span', 'sign-mark', mark.label);
        b.style.background = mark.color;
        // 밝은 노선 색(2호선 연두 등)에는 진한 글자를 쓴다.
        b.style.color = labelInk(mark.color) === mark.color ? '#FFFFFF' : '#1F3342';
        b.title = mark.name;
        row.append(b);
      }
      main.append(row);
    }

    const sides = element('div', 'sign-sides');
    sides.style.background = color;
    sides.style.color = ink === color ? '#FFFFFF' : '#1F3342';
    const side = (item, arrowFirst) => {
      const box = element('span', arrowFirst ? 'sign-prev' : 'sign-next');
      if (!item) return box;
      const text = element('span', 'sign-side-names');
      text.append(element('span', 'sign-side-name', item.name));
      const sub = element('span', 'sign-side-en', englishName(item.id));
      sub.lang = 'en';
      text.append(sub);
      const arrow = element('span', 'sign-arrow', arrowFirst ? '◀' : '▶');
      box.append(...(arrowFirst ? [arrow, text] : [text, arrow]));
      return box;
    };
    sides.append(side(prev, true));
    if (next) sides.append(side(next, false));
    else sides.append(element('span', 'sign-next sign-end', '종착 Terminal'));
    sign.append(top, main, sides);
    return sign;
  }

  // ---------- 열차 안 ----------
  function interior(load, scene, stationName) {
    const svg = svgEl('svg', { class: 'ride-car', viewBox: '0 0 800 340', role: 'img' });
    const count = load <= 0 ? 0 : Math.max(1, Math.min(SPOTS + EXTRA, Math.round((load / kind.capacityPerTrain) * SPOTS)));
    const perIcon = Math.max(1, Math.round(kind.capacityPerTrain / SPOTS));
    svg.setAttribute('aria-label', `열차 안 그림이에요. 사람 그림이 ${count}개 있어요. 그림 하나는 약 ${perIcon}명이에요.`);

    // 벽과 천장
    svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 340, fill: '#EEF1F4' }));
    svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 34, fill: '#D5DBE1' }));
    for (let x = 60; x < 800; x += 140) svg.append(svgEl('rect', { x, y: 10, width: 90, height: 10, rx: 5, fill: '#FFFFFF' }));
    // 노선 색 띠
    svg.append(svgEl('rect', { x: 0, y: 34, width: 800, height: 8, fill: color }));

    // 창문
    const clip = svgEl('clipPath', { id: 'ride-windows' });
    const windows = [
      [130, 60],
      [470, 60],
    ];
    for (const [x, y] of windows) clip.append(svgEl('rect', { x, y, width: 200, height: 100, rx: 10 }));
    const defs = svgEl('defs');
    defs.append(clip);
    svg.append(defs);
    const view = svgEl('g', { 'clip-path': 'url(#ride-windows)' });
    view.append(windowView(scene, stationName));
    svg.append(view);
    for (const [x, y] of windows) {
      svg.append(svgEl('rect', { x, y, width: 200, height: 100, rx: 10, fill: 'none', stroke: '#8A96A3', 'stroke-width': 4 }));
    }

    // 문
    for (const x of [20, 360, 700]) {
      svg.append(svgEl('rect', { x, y: 50, width: 80, height: 240, fill: '#C9D1D9', stroke: '#8A96A3', 'stroke-width': 3 }));
      svg.append(svgEl('line', { x1: x + 40, y1: 50, x2: x + 40, y2: 290, stroke: '#8A96A3', 'stroke-width': 3 }));
      svg.append(svgEl('rect', { x: x + 10, y: 80, width: 22, height: 70, rx: 4, fill: '#FFFFFF', 'fill-opacity': 0.6 }));
      svg.append(svgEl('rect', { x: x + 48, y: 80, width: 22, height: 70, rx: 4, fill: '#FFFFFF', 'fill-opacity': 0.6 }));
    }
    // 손잡이
    for (let x = 130; x < 700; x += 38) {
      if (x > 340 && x < 450) continue;
      svg.append(svgEl('line', { x1: x, y1: 42, x2: x, y2: 58, stroke: '#8A96A3', 'stroke-width': 2 }));
      svg.append(svgEl('circle', { cx: x, cy: 64, r: 6, fill: 'none', stroke: '#8A96A3', 'stroke-width': 3 }));
    }
    // 긴 의자 두 개(자리 7개씩)
    const seats = [];
    for (const start of [112, 452]) {
      svg.append(svgEl('rect', { x: start, y: 228, width: 238, height: 22, rx: 6, fill: '#5C6F87' }));
      svg.append(svgEl('rect', { x: start, y: 178, width: 238, height: 52, rx: 8, fill: '#71849C' }));
      for (let i = 0; i < 7; i++) seats.push(start + 17 + i * 34);
    }
    // 바닥
    svg.append(svgEl('rect', { x: 0, y: 290, width: 800, height: 50, fill: '#B8A58A' }));

    // 사람: 앉는 자리부터, 그다음 서는 자리. 자리 차례는 흩어 놓아 고르게 찬다(늘 같은 차례).
    const seatOrder = [3, 10, 0, 6, 7, 13, 1, 11, 5, 8, 2, 12, 4, 9];
    const standSpots = [];
    for (let i = 0; i < 18; i++) standSpots.push({ x: 50 + i * 40, y: 0, scale: 1 });
    for (let i = 0; i < 18; i++) standSpots.push({ x: 70 + i * 40, y: 14, scale: 1.08 });
    for (let i = 0; i < EXTRA; i++) standSpots.push({ x: 80 + i * 58, y: 26, scale: 1.14 });
    const standOrder = standSpots.map((_, i) => i).sort((a, b) => ((a * 7) % 37) - ((b * 7) % 37) || a - b);
    const people = svgEl('g');
    for (let n = 0; n < count; n++) {
      const shirt = SHIRTS[(n * 5) % SHIRTS.length];
      if (n < SEATS) {
        people.append(person(seats[seatOrder[n]], 150, shirt, 1, true));
      } else {
        const spot = standSpots[standOrder[n - SEATS]];
        // 발이 바닥(y 290)에 닿게 세운다. 앞줄일수록 조금 크고 아래에 있다.
        if (spot) people.append(person(spot.x, 286 + spot.y * 0.5 - 116 * spot.scale, shirt, spot.scale, false));
      }
    }
    svg.append(people);
    return { svg, count, perIcon };
  }

  function person(x, y, shirt, scale, seated) {
    const g = svgEl('g', { transform: `translate(${x} ${y}) scale(${scale})` });
    g.append(svgEl('circle', { cx: 0, cy: 0, r: 11, fill: '#F2C9A0', stroke: '#1F3342', 'stroke-width': 1.5 }));
    if (seated) {
      g.append(svgEl('rect', { x: -13, y: 12, width: 26, height: 40, rx: 9, fill: shirt, stroke: '#1F3342', 'stroke-width': 1.5 }));
      g.append(svgEl('rect', { x: -11, y: 50, width: 22, height: 14, rx: 4, fill: '#34495E' }));
      g.append(svgEl('rect', { x: -10, y: 62, width: 8, height: 26, rx: 3, fill: '#34495E' }));
      g.append(svgEl('rect', { x: 2, y: 62, width: 8, height: 26, rx: 3, fill: '#34495E' }));
    } else {
      // 손을 들어 손잡이를 잡는다.
      g.append(svgEl('line', { x1: 8, y1: 16, x2: 14, y2: -36, stroke: shirt, 'stroke-width': 6, 'stroke-linecap': 'round' }));
      g.append(svgEl('rect', { x: -13, y: 12, width: 26, height: 56, rx: 9, fill: shirt, stroke: '#1F3342', 'stroke-width': 1.5 }));
      g.append(svgEl('rect', { x: -11, y: 66, width: 9, height: 50, rx: 3, fill: '#34495E' }));
      g.append(svgEl('rect', { x: 2, y: 66, width: 9, height: 50, rx: 3, fill: '#34495E' }));
    }
    return g;
  }

  /** 창밖: 역이면 승강장, 달리면 지형에 따라 땅속·바다 밑·다리 */
  function windowView(scene, stationName) {
    const g = svgEl('g');
    if (stationName) {
      g.append(svgEl('rect', { x: 0, y: 40, width: 800, height: 140, fill: '#F4F1E8' }));
      g.append(svgEl('rect', { x: 0, y: 140, width: 800, height: 30, fill: '#D8D2C2' }));
      for (const x of [160, 500]) {
        g.append(svgEl('rect', { x, y: 82, width: 140, height: 40, rx: 4, fill: '#FFFFFF', stroke: color, 'stroke-width': 4 }));
        g.append(svgEl('text', { x: x + 70, y: 110, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: '#1F3342' }, stationName));
      }
      return g;
    }
    const moving = svgEl('g', { class: reduceMotion ? '' : 'ride-scene-move' });
    if (scene === '땅속' || scene === '바다 밑') {
      g.append(svgEl('rect', { x: 0, y: 40, width: 800, height: 140, fill: scene === '바다 밑' ? '#1C3446' : '#26313A' }));
      for (let x = 0; x < 1600; x += 80) moving.append(svgEl('rect', { x, y: 96, width: 36, height: 6, rx: 3, fill: '#F3D36B' }));
    } else {
      g.append(svgEl('rect', { x: 0, y: 40, width: 800, height: 140, fill: '#BFE3F5' }));
      g.append(svgEl('rect', { x: 0, y: 128, width: 800, height: 60, fill: scene === '강 위 다리' ? '#6FA8CF' : '#9CC58A' }));
      for (let x = 0; x < 1600; x += 100) moving.append(svgEl('rect', { x, y: 60, width: 8, height: 120, fill: '#7D8A96' }));
    }
    g.append(moving);
    return g;
  }

  // ---------- 타는 중 ----------
  function renderRide() {
    body.replaceChildren();
    const stop = trip.stops[at];
    const isLast = at === trip.stops.length - 1;
    const moving = phase === '달리기';
    const startSeconds = TIMES[timeIndex].hour * 3600;

    body.append(strip());
    const layout = element('div', 'ride-layout');
    const left = element('div', 'ride-main');
    const right = element('div', 'ride-side');
    layout.append(left, right);
    body.append(layout);

    // 열차 안 전광판
    const led = element('div', 'ride-led');
    const ledText = element('span', 'ride-led-text');
    const ledLines = moving
      ? [`다음 역은 ${stop.name}`, `Next stop ${englishName(stop.id)}`]
      : [`이번 역은 ${stop.name}`, `This stop ${englishName(stop.id)}`];
    let ledIndex = 0;
    ledText.textContent = ledLines[0];
    clearTimeout(ledTimer);
    // 3초마다 우리말과 영어를 바꿔 보여 준다(화면이 바뀌면 멈춘다).
    const turn = () => {
      ledTimer = setTimeout(() => {
        ledIndex = (ledIndex + 1) % ledLines.length;
        ledText.textContent = ledLines[ledIndex];
        turn();
      }, 3000);
    };
    if (!reduceMotion) turn();
    led.append(ledText);
    // 달리는 동안은 앞 역을 떠난 시각, 역에서는 도착한 시각
    led.append(element('span', 'ride-clock', clockText(startSeconds + elapsedTo(moving ? at - 1 : at))));
    left.append(led);

    // 창밖과 열차 안 사람. 역에서는 사람들이 타고 내린 뒤 모습이다.
    const inside = moving ? trip.stops[at - 1].load : isLast ? 0 : stop.load;
    const scene = moving ? sceneBetween(trip.stops[at - 1].id, stop.id) : null;
    const car = interior(inside, scene, moving ? null : stop.name);
    left.append(car.svg);
    if (moving) left.append(element('p', 'panel-note', SCENE_TEXT[scene]));
    if (!moving) left.append(stationSign());

    // 방송
    const { korean, english } = announcement();
    const board = element('div', 'ride-announce');
    board.setAttribute('role', 'status');
    board.append(element('span', 'ride-announce-label', '안내 방송'));
    for (const line of korean) board.append(element('p', null, line));
    for (const line of english) {
      const p = element('p', 'ride-announce-en', line);
      p.lang = 'en';
      board.append(p);
    }
    right.append(board);

    // 열차 안 사람 수
    right.append(element('h3', null, '열차 안 사람'));
    const count = element('p', 'ride-count', inside > 0 ? countText(inside) : '아무도 없어요');
    right.append(count);
    const ratio = inside / kind.capacityPerTrain;
    const icons = element('div', 'crowd-icons');
    icons.setAttribute('role', 'img');
    const filled = Math.min(15, Math.round(ratio * 10));
    icons.setAttribute('aria-label', `붐빔 아이콘 ${filled}개. 10개면 정원만큼 탔어요.`);
    for (let i = 0; i < Math.max(10, filled); i++) {
      icons.append(element('span', i < filled ? (i < 10 ? 'crowd-icon' : 'crowd-icon over') : 'crowd-icon empty', i < filled ? '●' : '○'));
    }
    right.append(icons);
    const note = element('p', 'panel-note');
    note.append(element('span', null, `${crowdWord(ratio)}. 아이콘 10개가 `), wordWithCard('정원'), element('span', null, '이에요.'));
    right.append(note);
    right.append(element('p', 'panel-note guide', `열차 안 그림에서 사람 하나는 약 ${car.perIcon}명이에요.`));

    // 타고 내린 사람(역에서만)
    if (!moving) {
      right.append(element('h3', null, '이 역에서'));
      const most = Math.max(1, stop.on, stop.off);
      right.append(barRow('내린 사람', stop.off, most, countText(stop.off)));
      right.append(barRow('탄 사람', stop.on, most, countText(stop.on)));
    }

    // 다음 역까지
    const controls = element('div', 'ride-controls');
    if (moving) {
      const wait = button('달리는 중…', () => {}, 'button big');
      wait.disabled = true;
      controls.append(wait);
    } else if (!isLast) {
      const next = trip.stops[at + 1];
      const longest = Math.max(...trip.stops.map((s) => s.runS ?? 0), 1);
      right.append(element('h3', null, '다음 역까지'));
      right.append(barRow(stationLabel(next.name), stop.runS, longest, durationText(stop.runS)));
      const target = stationLabel(next.name);
      controls.append(button(`${target}${roParticle(target)} 출발`, depart, 'button big ride-go'));
    } else {
      right.append(element('p', null, `${clockText(startSeconds)}에 떠나서 ${durationText(elapsedTo(at))} 걸렸어요.`));
      controls.append(
        button('반대 방향으로 타기', () => {
          direction = -direction;
          startTrip();
        }, 'button big'),
        button('시간 바꿔 다시 타기', () => {
          clearTimeout(ledTimer);
          phase = '고르기';
          renderSetup();
        }),
        button('설계로 돌아가기', onBack),
      );
    }
    right.append(controls);
  }

  function barRow(label, value, max, text) {
    const row = element('div', 'info-bar-row');
    const track = element('div', 'run-bar');
    const fill = element('div', 'run-bar-fill');
    fill.style.width = `${max > 0 ? Math.min(100, (value / max) * 100).toFixed(1) : 0}%`;
    fill.style.background = 'var(--design-ink)';
    track.append(fill);
    row.append(element('span', 'info-bar-name', label), track, element('span', 'info-bar-value', text));
    return row;
  }

  function depart() {
    if (phase !== '역' || at >= trip.stops.length - 1) return;
    at += 1;
    phase = '달리기';
    sound.wake();
    if (soundOn) sound.startRumble();
    renderRide();
    announceNow();
    // 방송 목소리를 켜면 방송이 끝날 만큼 조금 더 달린다.
    const ms = reduceMotion ? 0 : voiceOn ? MOVE_MS * 2 : MOVE_MS;
    timer = setTimeout(() => {
      timer = null;
      sound.stopRumble();
      phase = '역';
      renderRide();
    }, ms);
  }

  const onVoices = () => {
    if (phase === '고르기' && stops.length >= 2) renderSetup();
  };
  try {
    window.speechSynthesis?.addEventListener?.('voiceschanged', onVoices);
  } catch {
    // 목소리를 쓰지 못하는 기기
  }

  if (stops.length < 2) {
    body.append(element('p', null, '역이 두 개 넘게 있어야 탈 수 있어요.'));
  } else {
    renderSetup();
  }

  return () => {
    if (timer) clearTimeout(timer);
    clearTimeout(ledTimer);
    sound.stopAll();
    try {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', onVoices);
    } catch {
      // 목소리를 쓰지 못하는 기기
    }
  };
}
