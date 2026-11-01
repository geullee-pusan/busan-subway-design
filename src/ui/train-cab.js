// 기차 운전석 보기: 맨 앞 창으로 선로가 다가오는 장면, 속도계, 신호(색과 글자를 함께), 다음 역 안내.
// 객실 그림(train-interior.js)과 같은 방법(setScene, setSpeed, setDisplay)으로 움직인다.
// 장면은 그림으로 어림한 것이다(실제 선로 모습이 아니다).
import { lookOf } from './train-art.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

// 원근: 소실점 (400, 150). 깊이 z(m)에 있는 점 (x, y)는 화면에서 (VX + x*F/z, VY + y*F/z)
const VX = 400;
const VY = 150;
const F = 260;
const EYE = 2.6; // 눈높이(m, 선로 위)
const P = (x, y, z) => [VX + (x * F) / z, VY + ((EYE - y) * F) / z];
const NEAR = 1.4;
const FAR = 400;

/** 신호: 색과 글자를 함께 */
const SIGNALS = {
  go: { color: '#2F9E44', text: '진행', lamp: 2 },
  caution: { color: '#F59F00', text: '주의', lamp: 1 },
  stop: { color: '#E03131', text: '정지', lamp: 0 },
};

/**
 * @param {{kind: string, reduceMotion?: boolean, topKmh?: number|null}} p
 * @returns {{svg: SVGSVGElement, setScene: (s: string) => void, setSpeed: (kmh: number) => void, setDisplay: (lines: string[]) => void, setSignal: (s: 'go'|'caution'|'stop') => void, destroy: () => void}}
 */
export function trainCabArt({ kind, reduceMotion = false, topKmh = null }) {
  const look = lookOf(kind);
  const svg = el('svg', { viewBox: '0 0 800 340', class: 'ride-car tr-cab', role: 'img' });
  svg.setAttribute('aria-label', `${kind ?? '기차'} 운전석에서 앞을 보는 그림이에요. 선로가 다가오고 아래에 속도계와 신호가 있어요.`);

  // 바깥 장면(창 안)
  const world = el('g');
  svg.append(world);
  const backdrop = el('g');
  const ground = el('g');
  const moving = el('g');
  world.append(backdrop, ground, moving);

  // 운전실: 창틀, 와이퍼, 계기판
  const cab = el('g');
  cab.append(el('path', { d: 'M0 0 L800 0 L800 40 L700 30 L100 30 L0 40 Z', fill: '#2B2F35' }));
  cab.append(el('path', { d: 'M0 40 L100 30 L80 250 L0 260 Z', fill: '#3A3F47' }));
  cab.append(el('path', { d: 'M800 40 L700 30 L720 250 L800 260 Z', fill: '#3A3F47' }));
  cab.append(el('line', { x1: 250, y1: 245, x2: 330, y2: 120, stroke: '#1B1E22', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  cab.append(el('line', { x1: 560, y1: 245, x2: 640, y2: 120, stroke: '#1B1E22', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  // 계기판
  cab.append(el('path', { d: 'M0 250 L800 250 L800 340 L0 340 Z', fill: '#25292E' }));
  cab.append(el('rect', { x: 0, y: 248, width: 800, height: 6, fill: look.accent }));
  svg.append(cab);

  // 속도계(바늘과 숫자)
  const maxKmh = Math.max(100, Math.ceil(((topKmh ?? 150) + 20) / 50) * 50);
  const gauge = el('g', { transform: 'translate(150 300)' });
  gauge.append(el('circle', { r: 42, fill: '#111417', stroke: '#868E96', 'stroke-width': 3 }));
  for (let v = 0; v <= maxKmh; v += maxKmh / 10) {
    const a = Math.PI * (0.75 + (1.5 * v) / maxKmh);
    gauge.append(el('line', { x1: Math.cos(a) * 34, y1: Math.sin(a) * 34, x2: Math.cos(a) * 40, y2: Math.sin(a) * 40, stroke: '#DEE2E6', 'stroke-width': 2 }));
  }
  const needle = el('line', { x1: 0, y1: 0, x2: 0, y2: -32, stroke: '#FF6B6B', 'stroke-width': 3, 'stroke-linecap': 'round' });
  gauge.append(needle, el('circle', { r: 4, fill: '#DEE2E6' }));
  const speedText = el('text', { x: 0, y: 24, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#FFFFFF' }, '0');
  gauge.append(speedText, el('text', { x: 0, y: 36, 'text-anchor': 'middle', 'font-size': 8, fill: '#ADB5BD' }, 'km/h'));
  svg.append(gauge);

  // 신호(세 등과 글자)
  const signalBox = el('g', { transform: 'translate(640 270)' });
  signalBox.append(el('rect', { x: -10, y: -14, width: 36, height: 66, rx: 6, fill: '#111417', stroke: '#868E96' }));
  const lamps = [0, 1, 2].map((i) => {
    const lamp = el('circle', { cx: 8, cy: 30 - i * 18, r: 7, fill: '#343A40' });
    signalBox.append(lamp);
    return lamp;
  });
  const signalText = el('text', { x: 36, y: 22, 'font-size': 18, 'font-weight': 800, fill: '#FFFFFF' }, '');
  signalBox.append(signalText);
  svg.append(signalBox);

  // 다음 역 안내판
  const board = el('g', { transform: 'translate(260 266)' });
  board.append(el('rect', { x: 0, y: 0, width: 300, height: 60, rx: 6, fill: '#0F1E2E', stroke: '#495057' }));
  const boardText = el('text', { x: 150, y: 26, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#FFFFFF' });
  board.append(boardText);
  svg.append(board);

  let scene = null;
  let speed = 0;
  let travel = 0; // 달린 거리(m). 침목과 전신주 자리를 정한다.
  let last = performance.now();
  let frame = null;

  /** 바탕(하늘, 먼 풍경, 땅)을 장면에 맞게 다시 그린다 */
  function drawBackdrop() {
    backdrop.replaceChildren();
    ground.replaceChildren();
    const dark = scene === 'tunnel';
    backdrop.append(el('rect', { x: 0, y: 0, width: 800, height: VY + 2, fill: dark ? '#0B0D10' : '#A8D8F0' }));
    if (!dark) {
      if (scene === 'mountain') backdrop.append(el('path', { d: `M0 ${VY} L120 70 L230 120 L360 55 L480 115 L620 60 L800 ${VY} Z`, fill: '#5E8F5C' }));
      else if (scene === 'city' || scene === 'station') for (let i = 0; i < 16; i++) backdrop.append(el('rect', { x: i * 52, y: VY - 20 - ((i * 37) % 60), width: 40, height: 22 + ((i * 37) % 60), fill: ['#A7B0BA', '#BBC2C9', '#929BA6'][i % 3] }));
      else backdrop.append(el('path', { d: `M0 ${VY} Q200 ${VY - 40} 400 ${VY - 10} T800 ${VY} Z`, fill: '#9DB7A0' }));
    }
    // 땅: 양옆과 선로 바닥(자갈)
    const sideColor = { sea: '#3F84B8', river: '#4F8DB5', field: '#9CC46A', mountain: '#6E9E5E', city: '#B5B9BE', station: '#C9C4BA', tunnel: '#14171B' }[scene] ?? '#9CC46A';
    ground.append(el('rect', { x: 0, y: VY, width: 800, height: 340 - VY, fill: sideColor }));
    if (scene === 'sea') ground.append(el('rect', { x: 400, y: VY, width: 400, height: 340 - VY, fill: '#9CC46A' }));
    const [blx, bly] = P(-2.2, 0, NEAR);
    const [brx] = P(2.2, 0, NEAR);
    ground.append(el('polygon', { points: `${VX - 2},${VY} ${VX + 2},${VY} ${brx},${bly} ${blx},${bly}`, fill: dark ? '#2B2F35' : '#8D8478' }));
    // 레일 두 줄(표준궤 1.435m)
    for (const x of [-0.72, 0.72]) {
      const [nx, ny] = P(x, 0.15, NEAR);
      ground.append(el('line', { x1: VX, y1: VY, x2: nx, y2: ny, stroke: dark ? '#6C737A' : '#D0D4D8', 'stroke-width': 4 }));
    }
  }

  /** 다가오는 것들: 침목, 전신주, 다리 철골, 터널 불빛, 승강장 */
  function drawMoving() {
    moving.replaceChildren();
    const dark = scene === 'tunnel';
    // 침목: 0.6m마다
    const sleeperGap = 0.6;
    for (let z = NEAR + sleeperGap - (travel % sleeperGap); z < 60; z += sleeperGap) {
      const [x1, y1] = P(-1.2, 0.05, z);
      const [x2] = P(1.2, 0.05, z);
      moving.append(el('line', { x1, y1, x2, y2: y1, stroke: dark ? '#3A3F47' : '#6B5B4B', 'stroke-width': Math.max(1, 30 / z) }));
    }
    // 전신주와 전깃줄(전철화 선로): 50m마다 오른쪽
    if (!dark) {
      const poleGap = 50;
      for (let z = NEAR + poleGap - (travel % poleGap); z < FAR; z += poleGap) {
        const [bx, by] = P(3.4, 0, z);
        const [tx, ty] = P(3.4, 6.5, z);
        const [ax] = P(0, 6.2, z);
        moving.append(el('line', { x1: bx, y1: by, x2: tx, y2: ty, stroke: '#5A636B', 'stroke-width': Math.max(1, 40 / z) }));
        moving.append(el('line', { x1: tx, y1: ty, x2: ax, y2: ty, stroke: '#5A636B', 'stroke-width': Math.max(0.6, 20 / z) }));
      }
      const [wx, wy] = P(0, 6.2, NEAR + 3);
      moving.append(el('line', { x1: VX, y1: VY - 2, x2: wx, y2: wy, stroke: '#3B4148', 'stroke-width': 1.5 }));
    }
    if (scene === 'river') {
      // 다리 철골(트러스): 8m마다 양옆
      for (let z = NEAR + 8 - (travel % 8); z < 120; z += 8) {
        for (const side of [-1, 1]) {
          const [bx, by] = P(side * 3, 0, z);
          const [tx, ty] = P(side * 3, 7, z);
          const [nx, ny] = P(side * 3, 7, z + 8);
          moving.append(el('line', { x1: bx, y1: by, x2: tx, y2: ty, stroke: '#7C8A96', 'stroke-width': Math.max(1, 50 / z) }));
          moving.append(el('line', { x1: bx, y1: by, x2: nx, y2: ny, stroke: '#7C8A96', 'stroke-width': Math.max(1, 30 / z) }));
        }
      }
    }
    if (dark) {
      // 터널 벽 불빛: 20m마다 양옆
      for (let z = NEAR + 20 - (travel % 20); z < 200; z += 20) {
        for (const side of [-1, 1]) {
          const [x, y] = P(side * 2.6, 3, z);
          moving.append(el('rect', { x: x - 60 / z, y: y - 8 / z, width: 120 / z, height: 16 / z, rx: 4 / z, fill: '#F2C76B' }));
        }
      }
      // 터널 끝(작은 밝은 점)과 둥근 벽: 가까운 쪽이 밝고 먼 쪽이 어둡다
      for (let z = NEAR + 10 - (travel % 10); z < 120; z += 10) {
        const [lx, ty] = P(-3, 6, z);
        const [rx, by] = P(3, -0.5, z);
        moving.append(el('rect', { x: lx, y: ty, width: rx - lx, height: by - ty, rx: (rx - lx) * 0.35, fill: 'none', stroke: '#3A3F47', 'stroke-width': Math.max(1, 25 / z) }));
      }
      moving.append(el('circle', { cx: VX, cy: VY - 4, r: 3, fill: '#F8F9FA', opacity: 0.6 }));
    }
    if (scene === 'station') {
      // 승강장: 양옆에 높은 바닥과 지붕
      for (const side of [-1, 1]) {
        const [n1x, n1y] = P(side * 2.0, 1.1, NEAR);
        const [f1x, f1y] = P(side * 2.0, 1.1, 120);
        const [n2x] = P(side * 6, 1.1, NEAR);
        const [f2x] = P(side * 6, 1.1, 120);
        moving.append(el('polygon', { points: `${n1x},${n1y} ${f1x},${f1y} ${f2x},${f1y} ${n2x},${n1y}`, fill: '#C9C4BA', stroke: '#F2C94C', 'stroke-width': 2 }));
        const [r1x, r1y] = P(side * 2.4, 5, NEAR);
        const [r2x, r2y] = P(side * 2.4, 5, 120);
        moving.append(el('line', { x1: r1x, y1: r1y, x2: r2x, y2: r2y, stroke: '#868E96', 'stroke-width': 6 }));
      }
    }
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // 화면에서는 실제보다 빨리 감는다(시속 300km면 1초에 약 80m 지나가 보이게)
    travel += (speed / 3.6) * dt;
    drawMoving();
    frame = requestAnimationFrame(tick);
  }

  const api = {
    svg,
    setScene(next) {
      if (next === scene) return;
      scene = next;
      drawBackdrop();
      drawMoving();
    },
    setSpeed(kmh) {
      speed = reduceMotion ? 0 : kmh;
      const v = Math.max(0, Math.min(maxKmh, kmh));
      const a = 0.75 * 180 + (270 * v) / maxKmh; // 도(0km = 왼쪽 아래)
      needle.setAttribute('transform', `rotate(${a - 270})`);
      speedText.textContent = String(Math.round(kmh));
    },
    setDisplay(lines) {
      boardText.replaceChildren();
      lines.slice(0, 2).forEach((line, k) => boardText.append(el('tspan', { x: 150, dy: k === 0 ? 0 : 22 }, line)));
    },
    setSignal(state) {
      const s = SIGNALS[state] ?? SIGNALS.go;
      lamps.forEach((lamp, i) => lamp.setAttribute('fill', i === s.lamp ? s.color : '#343A40'));
      signalText.textContent = s.text;
      signalText.setAttribute('fill', s.color);
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
    },
  };
  api.setScene('station');
  api.setSpeed(0);
  api.setSignal('stop');
  if (!reduceMotion) frame = requestAnimationFrame(tick);
  return api;
}
