// 기차(코레일 열차) 그림: 종류마다 겉모습과 실내가 다르다.
// 사진(위키미디어 공용, data/SOURCES.md)을 보고 새로 그렸다. 사진은 게임에 넣지 않는다.
// 색과 모양은 그림을 위한 것이고, 사실로 화면에 적는 것은 data/facts.json에 출처가 있는 것만이다.

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 종류마다 겉모습.
 * nose: 앞모습 모양, body: 차체, roof: 지붕, band: 창문 띠, stripe: 옆 줄, lower: 아래쪽, accent: 꾸밈 색,
 * windows: 'small'(작은 창) | 'each'(좌석마다 창) | 'band'(이어진 창 띠), power: 'electric' | 'diesel',
 * carsShown: 그림에 그리는 칸 수
 */
export const TRAIN_LOOK = {
  KTX: { nose: 'tgv', body: '#F3F4F1', roof: '#D3D8DC', band: '#2D3742', stripe: '#2F5DB3', lower: '#8D969D', accent: '#2F5DB3', windows: 'small', power: 'electric', carsShown: 4 },
  'KTX-산천': { nose: 'sancheon', body: '#F1F0EA', roof: '#545AA6', band: '#2A2F45', stripe: '#545AA6', lower: '#B9B8B0', accent: '#545AA6', windows: 'small', power: 'electric', carsShown: 4 },
  'KTX-청룡': { nose: 'long', body: '#B9C7D4', roof: '#9FAFBE', band: '#2E3E52', stripe: '#3E5A7C', lower: '#8C9AA8', accent: '#3E5A7C', windows: 'each', power: 'electric', carsShown: 4 },
  'KTX-이음': { nose: 'short', body: '#C9D3DC', roof: '#AFBBC6', band: '#2E3B4B', stripe: '#C9A75A', lower: '#9BA7B3', accent: '#2E3B4B', windows: 'each', power: 'electric', carsShown: 4 },
  'ITX-새마을': { nose: 'itx', body: '#C8323A', roof: '#3A3F45', band: '#2E3237', stripe: '#C8323A', lower: '#9CA1A5', accent: '#C8323A', windows: 'band', power: 'electric', carsShown: 4 },
  'ITX-마음': { nose: 'itx', body: '#4B5249', roof: '#3E443C', band: '#262A25', stripe: '#D2232A', lower: '#4B5249', accent: '#D2232A', windows: 'band', power: 'electric', carsShown: 4 },
  누리로: { nose: 'flat', body: '#F5F6F7', roof: '#D9DDE1', band: '#2C66C7', stripe: '#2C66C7', lower: '#DADDE0', accent: '#2C66C7', windows: 'band', power: 'electric', carsShown: 4 },
  무궁화호: { nose: 'loco', body: '#F2F2EE', roof: '#9BA2A8', band: '#2F3640', stripe: '#C8312E', lower: '#2E57A8', accent: '#C8312E', windows: 'small', power: 'diesel', carsShown: 4 },
  새마을호: { nose: 'itx', body: '#C8323A', roof: '#3A3F45', band: '#2E3237', stripe: '#C8323A', lower: '#9CA1A5', accent: '#C8323A', windows: 'band', power: 'electric', carsShown: 4 },
  '종류 모름': { nose: 'flat', body: '#D7DADD', roof: '#B5BABF', band: '#3B4048', stripe: '#6B737C', lower: '#A8AEB4', accent: '#6B737C', windows: 'band', power: 'electric', carsShown: 4 },
};

export const lookOf = (kind) => TRAIN_LOOK[kind] ?? TRAIN_LOOK['종류 모름'];

/** 달리는 소리 갈래: 'highspeed' | 'emu' | 'diesel' */
export function soundKindOf(kind) {
  if (lookOf(kind).power === 'diesel' || kind === '무궁화호') return 'diesel';
  if (/^KTX/.test(kind ?? '')) return 'highspeed';
  return 'emu';
}

const CAR_W = 210;
const CAR_H = 58;

/** 앞쪽(오른쪽을 보는) 차: 앞모습 모양마다 다르다. x는 차 왼쪽 끝, y는 차체 위쪽 */
function frontCar(g, look, x, y, label) {
  const h = CAR_H;
  const w = CAR_W;
  const floor = y + h;
  // 앞코 길이와 모양
  const noseLen = { tgv: 70, sancheon: 95, long: 120, short: 60, itx: 55, flat: 26, loco: 0 }[look.nose] ?? 40;
  const body = x + w - noseLen;
  if (look.nose === 'loco') {
    // 디젤 기관차(무궁화호): 네모난 차체, 빨강·하양·파랑 칸 무늬
    g.append(svgEl('rect', { x, y: y - 6, width: w, height: h + 6, rx: 4, fill: '#F4F4F0', stroke: '#2B2F35', 'stroke-width': 1.5 }));
    g.append(svgEl('rect', { x: x + w - 46, y: y - 14, width: 46, height: 30, rx: 3, fill: '#C8312E', stroke: '#2B2F35', 'stroke-width': 1.5 }));
    g.append(svgEl('rect', { x: x + w - 40, y: y - 8, width: 34, height: 14, rx: 2, fill: '#2B3138' }));
    g.append(svgEl('rect', { x, y: y + 30, width: w, height: 12, fill: '#2E57A8' }));
    g.append(svgEl('rect', { x, y: y + 24, width: w, height: 5, fill: '#C8312E' }));
    for (let k = 0; k < 6; k++) g.append(svgEl('rect', { x: x + 20 + k * 22, y: y + 4, width: 14, height: 16, fill: '#C9CCCF', stroke: '#7D8389', 'stroke-width': 1 }));
    g.append(svgEl('text', { x: x + 70, y: y + 39, 'font-size': 10, 'font-weight': 800, fill: '#FFFFFF' }, 'KORAIL'));
    // 배기 연기 자리(지붕 위 굴뚝)
    g.append(svgEl('rect', { x: x + 60, y: y - 12, width: 10, height: 7, fill: '#555B61' }));
    return;
  }
  // 차체(앞코 쪽은 둥글게 줄어든다)
  const nosePath = {
    tgv: `M${body} ${y} Q${x + w - 10} ${y + 6} ${x + w} ${floor - 16} L${x + w} ${floor - 4} Q${x + w - 6} ${floor} ${body} ${floor}`,
    sancheon: `M${body - 20} ${y} Q${x + w - 25} ${y + 2} ${x + w - 4} ${floor - 20} Q${x + w + 4} ${floor - 8} ${x + w - 10} ${floor - 2} L${body} ${floor}`,
    long: `M${body - 30} ${y} C${body + 40} ${y + 2} ${x + w - 10} ${y + 30} ${x + w} ${floor - 10} Q${x + w} ${floor} ${x + w - 18} ${floor} L${body} ${floor}`,
    short: `M${body} ${y} Q${x + w - 6} ${y + 4} ${x + w} ${floor - 20} L${x + w} ${floor - 6} Q${x + w - 4} ${floor} ${body} ${floor}`,
    itx: `M${body} ${y} Q${x + w - 14} ${y + 2} ${x + w - 2} ${y + 30} L${x + w} ${floor - 4} Q${x + w - 4} ${floor} ${body} ${floor}`,
    flat: `M${body} ${y} Q${x + w} ${y} ${x + w} ${y + 16} L${x + w} ${floor - 6} Q${x + w} ${floor} ${body} ${floor}`,
  }[look.nose];
  g.append(svgEl('rect', { x, y, width: body - x + 2, height: h, fill: look.body }));
  g.append(svgEl('path', { d: `${nosePath} Z`, fill: look.body, stroke: '#2B2F35', 'stroke-width': 1.5 }));
  g.append(svgEl('rect', { x, y, width: body - x + 2, height: h, fill: 'none', stroke: '#2B2F35', 'stroke-width': 1.5 }));
  // 종류마다 앞쪽 꾸밈
  if (look.nose === 'tgv') {
    // 앞코를 감싸는 파란 띠와 띠 안의 두 전조등
    g.append(svgEl('path', { d: `M${body - 40} ${y + 26} L${x + w - 4} ${y + 30} L${x + w} ${y + 40} L${body - 40} ${y + 40} Z`, fill: look.accent }));
    g.append(svgEl('circle', { cx: x + w - 16, cy: y + 35, r: 3, fill: '#F7F3C8' }));
  } else if (look.nose === 'sancheon') {
    // 청보라 윗부분이 앞코로 쓸려 내려간다(산천어 모양)
    g.append(svgEl('path', { d: `M${body - 60} ${y} Q${x + w - 40} ${y} ${x + w - 14} ${y + 24} L${body - 70} ${y + 18} Z`, fill: look.accent }));
  } else if (look.nose === 'itx' && look.accent === '#D2232A') {
    // ITX-마음: 빨간 앞코
    g.append(svgEl('path', { d: `M${body + 6} ${y + 26} Q${x + w - 2} ${y + 30} ${x + w} ${floor - 4} L${body} ${floor} Z`, fill: '#D2232A' }));
  } else if (look.nose === 'flat') {
    // 누리로: 파란 띠가 앞면까지 이어진다
    g.append(svgEl('path', { d: `M${body - 70} ${y + 14} L${body} ${y + 14} Q${x + w - 4} ${y + 18} ${x + w} ${y + 40} L${body - 70} ${y + 40} Z`, fill: look.accent, opacity: 0.95 }));
  }
  // 앞 유리(검은 창)
  const glass = {
    tgv: `M${body + 4} ${y + 6} Q${x + w - 22} ${y + 10} ${x + w - 14} ${y + 22} L${body + 4} ${y + 22} Z`,
    sancheon: `M${body - 14} ${y + 4} Q${x + w - 34} ${y + 6} ${x + w - 20} ${y + 20} L${body - 10} ${y + 18} Z`,
    long: `M${body - 10} ${y + 6} Q${x + w - 40} ${y + 12} ${x + w - 26} ${y + 24} L${body - 6} ${y + 22} Z`,
    short: `M${body + 2} ${y + 6} Q${x + w - 14} ${y + 10} ${x + w - 8} ${y + 26} L${body + 2} ${y + 26} Z`,
    itx: `M${body + 2} ${y + 6} Q${x + w - 16} ${y + 8} ${x + w - 6} ${y + 26} L${body + 2} ${y + 26} Z`,
    flat: `M${body - 6} ${y + 6} L${x + w - 4} ${y + 8} L${x + w - 2} ${y + 30} L${body - 6} ${y + 30} Z`,
  }[look.nose];
  g.append(svgEl('path', { d: glass, fill: '#1C2128' }));
  g.append(svgEl('circle', { cx: x + w - 8, cy: floor - 12, r: 2.6, fill: '#FFF6C8', stroke: '#2B2F35', 'stroke-width': 0.8 }));
  // 고속열차 맨 앞 차(동력차·운전실)는 창이 적다
  windowsOf(g, look, x + 12, y, body - x - 30, look.nose === 'tgv' ? 2 : 4);
  stripesOf(g, look, x, y, body - x);
  if (label) g.append(svgEl('text', { x: x + 16, y: floor - 6, 'font-size': 10, 'font-weight': 800, fill: look.body === '#4B5249' || look.body === '#C8323A' ? '#FFFFFF' : '#2B2F35' }, label));
}

/** 창: 작은 창 여러 개 / 좌석마다 창 / 이어진 창 띠 */
function windowsOf(g, look, x, y, width, count = 7) {
  const top = y + 10;
  if (look.windows === 'band') {
    g.append(svgEl('rect', { x, y: top, width, height: 18, rx: 3, fill: look.band }));
    for (let k = 1; k < count; k++) g.append(svgEl('line', { x1: x + (width * k) / count, y1: top, x2: x + (width * k) / count, y2: top + 18, stroke: '#5E6670', 'stroke-width': 1 }));
    return;
  }
  const n = look.windows === 'each' ? Math.max(count, 9) : count;
  const gap = width / n;
  for (let k = 0; k < n; k++) {
    const w = look.windows === 'each' ? gap * 0.62 : gap * 0.7;
    g.append(svgEl('rect', { x: x + k * gap + (gap - w) / 2, y: top, width: w, height: look.windows === 'each' ? 15 : 13, rx: 3, fill: look.band }));
  }
}

/** 옆 줄무늬 */
function stripesOf(g, look, x, y, width) {
  if (look.nose === 'tgv') {
    g.append(svgEl('rect', { x, y: y + CAR_H - 16, width, height: 5, fill: look.stripe }));
    g.append(svgEl('rect', { x, y: y + CAR_H - 10, width, height: 10, fill: look.lower }));
  } else if (look.nose === 'sancheon') {
    g.append(svgEl('rect', { x, y: y + CAR_H - 9, width, height: 9, fill: look.lower }));
  } else if (look.nose === 'short') {
    g.append(svgEl('rect', { x, y: y + 7, width, height: 2, fill: look.stripe }));
  } else if (look.nose === 'itx' && look.accent === '#D2232A') {
    g.append(svgEl('rect', { x, y: y + CAR_H - 14, width, height: 3, fill: look.stripe }));
  } else if (look.nose === 'itx') {
    g.append(svgEl('rect', { x, y: y + CAR_H - 16, width, height: 16, fill: look.lower }));
  } else if (look.nose === 'loco') {
    g.append(svgEl('rect', { x, y: y + 4, width, height: 4, fill: look.stripe }));
    g.append(svgEl('rect', { x, y: y + CAR_H - 14, width, height: 6, fill: look.lower }));
  } else if (look.nose === 'flat') {
    g.append(svgEl('rect', { x, y: y + 14, width, height: 4, fill: look.stripe }));
  }
}

/** 가운데 객차 하나 */
function middleCar(g, look, x, y, door = 'right') {
  const isCoach = look.nose === 'loco';
  g.append(svgEl('rect', { x, y, width: CAR_W - 6, height: CAR_H, rx: 6, fill: look.body, stroke: '#2B2F35', 'stroke-width': 1.5 }));
  if (look.nose === 'sancheon') {
    // 산천: 문 쪽의 청보라 판
    g.append(svgEl('rect', { x: x + (door === 'right' ? CAR_W - 44 : 6), y, width: 32, height: CAR_H, fill: look.accent, opacity: 0.85 }));
  }
  if (look.nose === 'itx' && look.accent !== '#D2232A') g.append(svgEl('rect', { x, y: y + CAR_H - 16, width: CAR_W - 6, height: 16, fill: look.lower }));
  windowsOf(g, look, x + 14, y, CAR_W - 60, isCoach ? 8 : 9);
  stripesOf(g, look, x, y, CAR_W - 6);
  if (isCoach) {
    // 무궁화호 객차: 위쪽 빨간 띠, 아래쪽 파란 띠
    g.append(svgEl('rect', { x, y: y + 2, width: CAR_W - 6, height: 5, fill: look.stripe }));
  }
  // 문
  const dx = door === 'right' ? x + CAR_W - 40 : x + 8;
  g.append(svgEl('rect', { x: dx, y: y + 6, width: 22, height: CAR_H - 10, rx: 2, fill: 'none', stroke: '#2B2F35', 'stroke-width': 1.2, class: 'tr-door' }));
}

/** 바퀴와 대차 */
function wheels(g, x, width, floor) {
  for (const cx of [x + 30, x + width - 30]) {
    g.append(svgEl('rect', { x: cx - 22, y: floor + 1, width: 44, height: 7, fill: '#3A3F45' }));
    for (const off of [-12, 12]) g.append(svgEl('circle', { cx: cx + off, cy: floor + 9, r: 6.5, fill: '#2B2F35', stroke: '#8D939A', 'stroke-width': 1.5 }));
  }
}

/** 팬터그래프(전기를 받는 장치) */
function pantograph(g, x, y) {
  g.append(svgEl('path', { d: `M${x} ${y} L${x + 16} ${y - 16} L${x + 32} ${y}`, fill: 'none', stroke: '#3A3F45', 'stroke-width': 2 }));
  g.append(svgEl('line', { x1: x + 4, y1: y - 18, x2: x + 28, y2: y - 18, stroke: '#3A3F45', 'stroke-width': 2.5 }));
}

/**
 * 열차 옆모습(오른쪽을 보고 달린다). 앞 차 하나와 뒤 객차 몇 칸.
 * @returns {SVGGElement} 너비는 carsShown × 210쯤
 */
export function trainSide(kind, { y = 120, label = null } = {}) {
  const look = lookOf(kind);
  const g = svgEl('g', { class: 'tr-train' });
  const cars = look.carsShown;
  // 뒤 칸부터 왼쪽에, 앞 차가 맨 오른쪽
  for (let i = 0; i < cars - 1; i++) {
    const x = i * CAR_W;
    middleCar(g, look, x, y, i % 2 ? 'left' : 'right');
    wheels(g, x, CAR_W - 6, y + CAR_H);
    if (look.power === 'electric' && i === 1) pantograph(g, x + 90, y);
  }
  const fx = (cars - 1) * CAR_W;
  frontCar(g, look, fx, y, label);
  wheels(g, fx, CAR_W, y + CAR_H);
  if (look.power === 'electric' && look.nose === 'tgv') pantograph(g, fx + 40, y);
  // 지붕 선
  g.append(svgEl('rect', { x: 0, y: y - 3, width: fx + (look.nose === 'loco' ? CAR_W : CAR_W - 40), height: 3, fill: look.roof, opacity: 0.9 }));
  return g;
}

/**
 * 기차 승강장(옆에서 본 모습): 열차가 왼쪽에서 들어와 선다. 문이 열리면 탈 수 있다.
 * @returns {{svg: SVGSVGElement, arrive: (ms: number) => Promise<void>, openDoors: () => void}}
 */
export function trainPlatformArt({ kind, stationName, reduceMotion = false }) {
  const svg = svgEl('svg', { class: 'journey-scene tr-platform', viewBox: '0 0 800 300', role: 'img' });
  svg.setAttribute('aria-label', `${kind ?? '기차'} 열차가 들어오는 승강장 그림이에요.`);
  // 하늘, 지붕(캐노피), 기둥
  svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 300, fill: '#DCE7EF' }));
  svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 40, fill: '#7E8A93' }));
  svg.append(svgEl('rect', { x: 0, y: 40, width: 800, height: 6, fill: '#5C666E' }));
  for (let x = 60; x < 800; x += 180) svg.append(svgEl('rect', { x, y: 46, width: 8, height: 170, fill: '#8A949B' }));
  // 역 이름판
  const sign = svgEl('g');
  sign.append(svgEl('rect', { x: 300, y: 56, width: 200, height: 34, rx: 4, fill: '#1F3342' }));
  sign.append(svgEl('text', { x: 400, y: 80, 'font-size': 18, 'font-weight': 800, fill: '#FFFFFF', 'text-anchor': 'middle' }, stationName ?? ''));
  svg.append(sign);
  // 선로와 자갈
  svg.append(svgEl('rect', { x: 0, y: 200, width: 800, height: 28, fill: '#8C857B' }));
  svg.append(svgEl('rect', { x: 0, y: 206, width: 800, height: 3, fill: '#5A5A5A' }));
  svg.append(svgEl('rect', { x: 0, y: 218, width: 800, height: 3, fill: '#5A5A5A' }));
  // 열차(처음에는 화면 왼쪽 밖)
  const holder = svgEl('g', { class: 'tr-moving' });
  const train = trainSide(kind, { y: 134, label: kind });
  holder.append(train);
  svg.append(holder);
  // 승강장 바닥과 노란 안전선(열차 앞)
  svg.append(svgEl('rect', { x: 0, y: 228, width: 800, height: 72, fill: '#C9C4BA' }));
  svg.append(svgEl('rect', { x: 0, y: 232, width: 800, height: 8, fill: '#F2C230' }));
  for (let x = 0; x < 800; x += 16) svg.append(svgEl('circle', { cx: x + 8, cy: 236, r: 1.4, fill: '#B48E12' }));
  // 기다리는 사람들
  for (const [x, shirt] of [
    [180, '#5C7FA3'],
    [215, '#C27C55'],
    [520, '#6B8E5A'],
    [560, '#8A6BA8'],
  ]) {
    svg.append(svgEl('circle', { cx: x, cy: 252, r: 8, fill: '#F2C9A0', stroke: '#1F3342', 'stroke-width': 1 }));
    svg.append(svgEl('rect', { x: x - 9, y: 260, width: 18, height: 30, rx: 6, fill: shirt, stroke: '#1F3342', 'stroke-width': 1 }));
  }
  const width = lookOf(kind).carsShown * CAR_W;
  const stopX = 800 - width + 40; // 앞코가 화면 오른쪽 가까이에 선다
  holder.setAttribute('transform', `translate(${-width - 40} 0)`);
  let doorsOpen = false;
  return {
    svg,
    arrive(ms) {
      return new Promise((resolve) => {
        if (reduceMotion || ms <= 0) {
          holder.setAttribute('transform', `translate(${stopX} 0)`);
          resolve();
          return;
        }
        const start = performance.now();
        const from = -width - 40;
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms);
          const ease = 1 - (1 - t) ** 3; // 들어오며 천천히 선다
          holder.setAttribute('transform', `translate(${(from + (stopX - from) * ease).toFixed(1)} 0)`);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    openDoors() {
      if (doorsOpen) return;
      doorsOpen = true;
      for (const door of train.querySelectorAll('.tr-door')) {
        door.setAttribute('fill', '#2B2F35');
        door.setAttribute('opacity', '0.75');
      }
    },
  };
}

/** 출발 안내 전광판(대합실). rows: [{time, kind, no, to, note}] */
export function departureBoard(rows, { title = '출발 안내', highlight = null } = {}) {
  const svg = svgEl('svg', { class: 'tr-board', viewBox: `0 0 800 ${60 + rows.length * 34}`, role: 'img' });
  svg.setAttribute('aria-label', `${title} 전광판이에요. 기차 ${rows.length}개가 적혀 있어요.`);
  svg.append(svgEl('rect', { x: 0, y: 0, width: 800, height: 60 + rows.length * 34, rx: 8, fill: '#111417' }));
  svg.append(svgEl('text', { x: 20, y: 34, 'font-size': 20, 'font-weight': 800, fill: '#F6C744' }, title));
  const cols = [
    [20, '시각'],
    [120, '열차'],
    [330, '번호'],
    [430, '가는 곳'],
    [640, '안내'],
  ];
  for (const [x, label] of cols) svg.append(svgEl('text', { x, y: 52, 'font-size': 13, fill: '#9AA4AD' }, label));
  rows.forEach((row, i) => {
    const y = 84 + i * 34;
    if (highlight !== null && i === highlight) svg.append(svgEl('rect', { x: 8, y: y - 22, width: 784, height: 30, rx: 4, fill: '#2C3A4A' }));
    const look = lookOf(row.kind);
    svg.append(svgEl('text', { x: 20, y, 'font-size': 18, 'font-weight': 700, fill: '#7DF29B', 'font-family': 'monospace' }, row.time));
    svg.append(svgEl('rect', { x: 120, y: y - 16, width: 8, height: 20, fill: look.accent }));
    svg.append(svgEl('text', { x: 134, y, 'font-size': 17, 'font-weight': 700, fill: '#FFFFFF' }, row.kind ?? '종류 모름'));
    svg.append(svgEl('text', { x: 330, y, 'font-size': 17, fill: '#FFFFFF', 'font-family': 'monospace' }, String(row.no)));
    svg.append(svgEl('text', { x: 430, y, 'font-size': 17, fill: '#FFFFFF' }, row.to ?? ''));
    if (row.note) svg.append(svgEl('text', { x: 640, y, 'font-size': 15, fill: '#F6C744' }, row.note));
  });
  return svg;
}

/** 승차권 그림 */
export function ticketArt({ kind, no, fromName, toName, depText, arrText, car, seat, fareText, reverse = false }) {
  const svg = svgEl('svg', { class: 'tr-ticket', viewBox: '0 0 560 220', role: 'img' });
  svg.setAttribute('aria-label', `${kind} ${no}번 열차 승차권이에요. ${fromName}에서 ${toName}까지, ${car}호차 ${seat}번 자리예요.`);
  const look = lookOf(kind);
  svg.append(svgEl('rect', { x: 2, y: 2, width: 556, height: 216, rx: 14, fill: '#FFFFFF', stroke: '#1F3342', 'stroke-width': 2 }));
  svg.append(svgEl('rect', { x: 2, y: 2, width: 556, height: 44, rx: 14, fill: look.accent }));
  svg.append(svgEl('rect', { x: 2, y: 30, width: 556, height: 16, fill: look.accent }));
  svg.append(svgEl('text', { x: 24, y: 32, 'font-size': 20, 'font-weight': 800, fill: '#FFFFFF' }, `승차권 · ${kind} ${no}`));
  svg.append(svgEl('text', { x: 24, y: 96, 'font-size': 30, 'font-weight': 800, fill: '#1F3342' }, fromName));
  svg.append(svgEl('text', { x: 280, y: 96, 'font-size': 26, fill: '#1F3342', 'text-anchor': 'middle' }, '→'));
  svg.append(svgEl('text', { x: 536, y: 96, 'font-size': 30, 'font-weight': 800, fill: '#1F3342', 'text-anchor': 'end' }, toName));
  svg.append(svgEl('text', { x: 24, y: 126, 'font-size': 18, fill: '#1F3342' }, depText));
  svg.append(svgEl('text', { x: 536, y: 126, 'font-size': 18, fill: '#1F3342', 'text-anchor': 'end' }, arrText));
  svg.append(svgEl('line', { x1: 20, y1: 146, x2: 540, y2: 146, stroke: '#C9CDD2', 'stroke-dasharray': '6 5' }));
  svg.append(svgEl('text', { x: 24, y: 184, 'font-size': 26, 'font-weight': 800, fill: '#1F3342' }, `${car}호차 ${seat}`));
  if (reverse) svg.append(svgEl('text', { x: 24, y: 206, 'font-size': 14, fill: '#8A5A00' }, '역방향 자리(뒤로 보고 앉아 가요)'));
  svg.append(svgEl('text', { x: 536, y: 184, 'font-size': 24, 'font-weight': 700, fill: '#1F3342', 'text-anchor': 'end' }, fareText));
  return svg;
}
