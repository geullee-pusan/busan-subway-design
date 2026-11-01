// 랜드마크에 도착했을 때 보여 주는 장면 그림(SVG). 실제 사진이 아니라 그곳의 특징을 단순하게 그린 것이다.
// kind: beach, bridge, market, tower, cliff, village, park, temple, island, museum, wetland, lake, street, garden, mountain,
//       themepark, viewpoint, fortress, hanok, rockart, stadium,
//       observatory, cherry, tomb, pavilion

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 지도 표시 그림(이모지)과 짧은 종류 이름 */
export const LANDMARK_ICON = {
  beach: ['🏖️', '해수욕장'],
  bridge: ['🌉', '다리'],
  market: ['🐟', '시장'],
  tower: ['🗼', '탑'],
  cliff: ['🌊', '바닷가 절벽'],
  village: ['🏘️', '마을'],
  park: ['🌳', '공원'],
  temple: ['🛕', '절'],
  island: ['🏝️', '섬'],
  museum: ['🏛️', '박물관'],
  wetland: ['🦢', '철새 사는 곳'],
  lake: ['🦆', '호수'],
  street: ['🛍️', '거리'],
  garden: ['🌿', '정원'],
  observatory: ['🔭', '옛 별 보던 곳'],
  cherry: ['🌸', '벚꽃길'],
  tomb: ['👑', '왕의 무덤'],
  pavilion: ['🏯', '누각'],
  mountain: ['⛰️', '산'],
  themepark: ['🎡', '놀이공원'],
  viewpoint: ['🌅', '전망대'],
  fortress: ['🏰', '옛 성'],
  hanok: ['🏡', '한옥 마을'],
  rockart: ['🐋', '바위그림'],
  stadium: ['🏟️', '경기장'],
};

let skyCount = 0;
/** 하늘과 해 */
function sky(g, { night = false } = {}) {
  skyCount += 1;
  const id = `lm-sky-${skyCount}`;
  const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(el('stop', { offset: 0, 'stop-color': night ? '#1F2A4A' : '#9FD3F2' }), el('stop', { offset: 1, 'stop-color': night ? '#4A4F7A' : '#E6F4FB' }));
  const defs = el('defs');
  defs.append(grad);
  g.append(defs);
  g.append(el('rect', { x: 0, y: 0, width: 600, height: 320, fill: `url(#${id})` }));
  if (!night) g.append(el('circle', { cx: 520, cy: 60, r: 26, fill: '#FFE07A' }));
}
const sea = (g, y = 190) => {
  g.append(el('rect', { x: 0, y, width: 600, height: 320 - y, fill: '#3F8FC6' }));
  const waves = el('g', { class: 'lm-waves' });
  for (let x = -40; x < 640; x += 60) waves.append(el('path', { d: `M${x} ${y + 25} q15 -8 30 0 t30 0`, stroke: '#D6EEFA', fill: 'none', 'stroke-width': 3 }));
  for (let x = -10; x < 640; x += 80) waves.append(el('path', { d: `M${x} ${y + 60} q15 -8 30 0 t30 0`, stroke: '#BFE3F6', fill: 'none', 'stroke-width': 3 }));
  g.append(waves);
};
const hills = (g, y = 200, color = '#7FB27A') => g.append(el('path', { d: `M0 ${y} Q120 ${y - 70} 240 ${y - 10} T480 ${y - 20} T600 ${y} L600 320 L0 320 Z`, fill: color }));
const ground = (g, y = 230, color = '#CDE3A5') => g.append(el('rect', { x: 0, y, width: 600, height: 320 - y, fill: color }));
const tree = (g, x, y, s = 1, color = '#4F8A4A') => {
  g.append(el('rect', { x: x - 3 * s, y: y - 6 * s, width: 6 * s, height: 22 * s, fill: '#7A5230' }));
  g.append(el('circle', { cx: x, cy: y - 14 * s, r: 16 * s, fill: color }));
};
const gull = (g, x, y) => g.append(el('path', { d: `M${x - 12} ${y} q6 -8 12 0 q6 -8 12 0`, stroke: '#2B3A4A', fill: 'none', 'stroke-width': 2.5, class: 'lm-bird' }));
const person = (g, x, y, color = '#E8590C') => {
  g.append(el('circle', { cx: x, cy: y - 26, r: 6, fill: '#F1C6A4' }));
  g.append(el('rect', { x: x - 6, y: y - 20, width: 12, height: 14, rx: 4, fill: color }));
  g.append(el('path', { d: `M${x - 3} ${y - 6} L${x - 5} ${y} M${x + 3} ${y - 6} L${x + 5} ${y}`, stroke: '#2F3A45', 'stroke-width': 3, 'stroke-linecap': 'round' }));
};
const roof = (g, x, y, w, color = '#4A5A6A') => {
  g.append(el('path', { d: `M${x - w / 2 - 14} ${y} Q${x} ${y - 30} ${x + w / 2 + 14} ${y} L${x + w / 2} ${y + 6} L${x - w / 2} ${y + 6} Z`, fill: color }));
};

const SCENES = {
  beach(g) {
    sky(g);
    hills(g, 170, '#9CB8A0');
    // 높은 건물들(바닷가 도시)
    for (let i = 0; i < 9; i++) g.append(el('rect', { x: 20 + i * 62, y: 110 + ((i * 37) % 50), width: 40, height: 80, fill: ['#C9D1D9', '#B7C1CB', '#DCE2E8'][i % 3] }));
    sea(g, 175);
    g.append(el('path', { d: 'M0 250 Q300 225 600 250 L600 320 L0 320 Z', fill: '#F2DCA6' }));
    for (const [x, c] of [[120, '#E8590C'], [200, '#1971C2'], [430, '#2F9E44']]) {
      g.append(el('path', { d: `M${x} 270 l0 -40`, stroke: '#555', 'stroke-width': 3 }));
      g.append(el('path', { d: `M${x - 28} 236 Q${x} 210 ${x + 28} 236 Z`, fill: c }));
    }
    person(g, 300, 290);
    gull(g, 380, 70);
    gull(g, 420, 90);
  },
  bridge(g) {
    sky(g, { night: false });
    sea(g, 200);
    // 큰 다리: 탑 두 개와 줄
    g.append(el('rect', { x: 0, y: 170, width: 600, height: 12, fill: '#8A96A3' }));
    for (const x of [170, 430]) g.append(el('rect', { x: x - 8, y: 70, width: 16, height: 130, fill: '#A7B2BD' }));
    g.append(el('path', { d: 'M0 150 Q170 60 170 70 Q300 175 430 70 Q430 60 600 150', stroke: '#6E7A86', fill: 'none', 'stroke-width': 4 }));
    for (let x = 30; x < 600; x += 30) g.append(el('line', { x1: x, y1: 170, x2: x, y2: x < 170 ? 150 - (170 - x) * 0.5 : x > 430 ? 150 - (x - 430) * 0.5 : 75 + Math.abs(300 - x) * 0.7, stroke: '#9AA5B0', 'stroke-width': 1.5 }));
    for (const [x, c] of [[90, '#F03E3E'], [260, '#1971C2'], [500, '#F59F00']]) g.append(el('rect', { x, y: 160, width: 30, height: 10, rx: 3, fill: c, class: 'lm-car' }));
    gull(g, 300, 50);
  },
  market(g) {
    sky(g);
    ground(g, 210, '#D9D2C3');
    for (let i = 0; i < 5; i++) {
      const x = 20 + i * 118;
      g.append(el('rect', { x, y: 130, width: 100, height: 90, fill: '#F8F1E3', stroke: '#B9A88A' }));
      g.append(el('path', { d: `M${x - 6} 130 L${x + 106} 130 L${x + 96} 108 L${x + 4} 108 Z`, fill: ['#E03131', '#1C7ED6', '#F59F00', '#2F9E44', '#AE3EC9'][i] }));
      g.append(el('rect', { x: x + 8, y: 180, width: 84, height: 20, fill: '#9BB8D3' }));
      for (let k = 0; k < 4; k++) g.append(el('ellipse', { cx: x + 20 + k * 20, cy: 186, rx: 8, ry: 4, fill: k % 2 ? '#A5B4C2' : '#E8A07A' }));
    }
    person(g, 200, 290, '#1971C2');
    person(g, 360, 285);
    person(g, 460, 292, '#2F9E44');
  },
  tower(g) {
    sky(g);
    hills(g, 210, '#6FA36A');
    g.append(el('rect', { x: 285, y: 50, width: 30, height: 150, fill: '#E9ECEF', stroke: '#868E96' }));
    g.append(el('ellipse', { cx: 300, cy: 70, rx: 34, ry: 14, fill: '#CED4DA', stroke: '#868E96' }));
    g.append(el('line', { x1: 300, y1: 20, x2: 300, y2: 56, stroke: '#868E96', 'stroke-width': 3 }));
    for (let i = 0; i < 10; i++) g.append(el('rect', { x: i * 62, y: 240 - ((i * 23) % 40), width: 46, height: 90, fill: '#B7C1CB' }));
    tree(g, 210, 210);
    tree(g, 390, 212);
  },
  cliff(g) {
    sky(g);
    sea(g, 200);
    g.append(el('path', { d: 'M0 120 L180 110 L240 160 L260 230 L250 320 L0 320 Z', fill: '#8D7B68' }));
    for (let y = 130; y < 300; y += 22) g.append(el('line', { x1: 10, y1: y, x2: 230, y2: y + 6, stroke: '#6E5E4E', 'stroke-width': 2 }));
    tree(g, 60, 118, 0.9, '#3E7A3E');
    tree(g, 130, 112, 1, '#3E7A3E');
    g.append(el('rect', { x: 470, y: 150, width: 14, height: 50, fill: '#FFFFFF', stroke: '#888' }));
    g.append(el('rect', { x: 466, y: 140, width: 22, height: 12, fill: '#E03131' }));
    gull(g, 360, 80);
  },
  village(g) {
    sky(g);
    hills(g, 150, '#8DB58A');
    const colors = ['#FFD43B', '#74C0FC', '#FF8787', '#8CE99A', '#B197FC', '#FFA94D'];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 9; i++) {
        const x = i * 68 + (row % 2) * 30 - 10;
        const y = 150 + row * 42;
        g.append(el('rect', { x, y, width: 54, height: 34, fill: colors[(i + row) % colors.length], stroke: '#555' }));
        g.append(el('rect', { x: x + 8, y: y + 8, width: 10, height: 10, fill: '#FFFFFF' }));
      }
    }
  },
  park(g) {
    sky(g);
    ground(g, 200, '#B7DD8C');
    g.append(el('path', { d: 'M0 270 Q300 220 600 270', stroke: '#E9DCC0', 'stroke-width': 26, fill: 'none' }));
    for (const [x, y, s] of [[60, 210, 1.3], [160, 200, 1], [420, 205, 1.2], [520, 214, 1.4], [300, 196, 0.9]]) tree(g, x, y, s);
    person(g, 250, 270);
    person(g, 340, 262, '#1971C2');
  },
  temple(g) {
    sky(g);
    hills(g, 190, '#5E8F5C');
    g.append(el('rect', { x: 200, y: 160, width: 200, height: 70, fill: '#C9A26B' }));
    for (let x = 210; x < 400; x += 30) g.append(el('rect', { x, y: 168, width: 18, height: 58, fill: '#8C5A2B' }));
    roof(g, 300, 150, 220, '#3F4A55');
    g.append(el('rect', { x: 0, y: 230, width: 600, height: 90, fill: '#D8CBB0' }));
    for (let i = 0; i < 6; i++) g.append(el('rect', { x: 240 + i * 4, y: 230 + i * 12, width: 120 - i * 8, height: 12, fill: '#BBAE92', stroke: '#9E9277' }));
    tree(g, 90, 210, 1.2, '#3E7A3E');
    tree(g, 510, 212, 1.2, '#3E7A3E');
  },
  island(g) {
    sky(g);
    sea(g, 170);
    for (const [x, w, h] of [[120, 70, 50], [220, 50, 70], [300, 60, 40], [390, 40, 60], [470, 80, 45]]) g.append(el('path', { d: `M${x - w / 2} 200 Q${x} ${200 - h * 2} ${x + w / 2} 200 Z`, fill: '#7E8C6A' }));
    g.append(el('rect', { x: 466, y: 120, width: 8, height: 24, fill: '#FFFFFF' }));
    g.append(el('rect', { x: 0, y: 260, width: 600, height: 12, fill: '#ADB5BD' }));
    g.append(el('rect', { x: 0, y: 252, width: 600, height: 8, fill: 'rgba(200,230,255,0.6)' }));
    person(g, 260, 252);
  },
  museum(g) {
    sky(g);
    ground(g, 230, '#CED4DA');
    g.append(el('rect', { x: 120, y: 120, width: 360, height: 110, fill: '#E9ECEF', stroke: '#868E96' }));
    g.append(el('path', { d: 'M110 120 L300 70 L490 120 Z', fill: '#ADB5BD' }));
    for (let x = 140; x < 470; x += 46) g.append(el('rect', { x, y: 130, width: 18, height: 100, fill: '#DEE2E6', stroke: '#ADB5BD' }));
    g.append(el('rect', { x: 260, y: 170, width: 80, height: 60, fill: '#74C0FC', stroke: '#1C7ED6' }));
    g.append(el('path', { d: 'M275 205 q10 -10 20 0 q10 10 20 0', stroke: '#E8590C', fill: 'none', 'stroke-width': 3 }));
    person(g, 200, 290);
  },
  wetland(g) {
    sky(g);
    ground(g, 200, '#A9C98A');
    g.append(el('path', { d: 'M0 230 Q300 200 600 235 L600 320 L0 320 Z', fill: '#6FA8D0' }));
    for (let x = 10; x < 600; x += 18) g.append(el('path', { d: `M${x} 230 l4 -30 M${x + 6} 230 l-2 -24`, stroke: '#6B8E4E', 'stroke-width': 2 }));
    for (const [x, y] of [[150, 80], [190, 95], [230, 85], [270, 100], [310, 90]]) g.append(el('path', { d: `M${x - 10} ${y} q5 -7 10 0 q5 -7 10 0`, stroke: '#333', fill: 'none', 'stroke-width': 2.5, class: 'lm-bird' }));
    for (const x of [380, 430, 470]) g.append(el('ellipse', { cx: x, cy: 262, rx: 14, ry: 7, fill: '#FFFFFF', stroke: '#888' }));
  },
  lake(g) {
    sky(g);
    hills(g, 170, '#86B37E');
    g.append(el('ellipse', { cx: 300, cy: 250, rx: 300, ry: 70, fill: '#5FA3D3' }));
    for (const x of [200, 260]) g.append(el('path', { d: `M${x} 245 q12 -18 24 0 l-24 0 Z`, fill: '#FFFFFF', stroke: '#888' }));
    g.append(el('path', { d: 'M400 250 q10 -12 20 0 Z', fill: '#FFF', stroke: '#888' }));
    for (let x = 0; x < 600; x += 50) tree(g, x, 190, 0.8);
  },
  street(g) {
    sky(g);
    for (let i = 0; i < 6; i++) {
      const x = i * 100;
      g.append(el('rect', { x, y: 70 + (i % 3) * 20, width: 90, height: 200, fill: ['#DEE2E6', '#E9D8C4', '#D0EBFF'][i % 3], stroke: '#868E96' }));
      g.append(el('rect', { x: x + 10, y: 180, width: 70, height: 40, fill: '#FFF3BF', stroke: '#F08C00' }));
      g.append(el('rect', { x: x + 15, y: 150, width: 60, height: 18, fill: ['#E03131', '#1971C2', '#2F9E44'][i % 3] }));
    }
    g.append(el('rect', { x: 0, y: 270, width: 600, height: 50, fill: '#C9C1B5' }));
    for (const [x, c] of [[120, '#E8590C'], [210, '#1971C2'], [330, '#AE3EC9'], [450, '#2F9E44'], [520, '#F59F00']]) person(g, x, 300, c);
  },
  garden(g) {
    sky(g);
    ground(g, 200, '#BFDDA0');
    g.append(el('path', { d: 'M0 260 Q300 240 600 265 L600 320 L0 320 Z', fill: '#5FA3D3' }));
    for (let x = 20; x < 600; x += 16) g.append(el('rect', { x, y: 120 + ((x * 7) % 30), width: 6, height: 100, fill: '#3E8E41' }));
    for (let x = 30; x < 600; x += 40) g.append(el('circle', { cx: x, cy: 228, r: 6, fill: ['#F783AC', '#FFD43B', '#FFFFFF'][(x / 40) % 3 | 0] }));
    for (const [x, y] of [[420, 90], [460, 80]]) g.append(el('path', { d: `M${x - 10} ${y} q5 -7 10 0 q5 -7 10 0`, stroke: '#FFFFFF', fill: 'none', 'stroke-width': 3, class: 'lm-bird' }));
  },
  observatory(g) {
    sky(g, { night: true });
    for (let i = 0; i < 30; i++) g.append(el('circle', { cx: (i * 97) % 600, cy: (i * 53) % 140 + 10, r: 1.5, fill: '#FFF9DB' }));
    ground(g, 240, '#7FA36A');
    // 둥근 돌탑(아래가 넓고 위가 좁다)
    g.append(el('path', { d: 'M250 240 Q240 150 275 90 L325 90 Q360 150 350 240 Z', fill: '#C8B79A', stroke: '#8A7A60' }));
    for (let y = 100; y < 240; y += 12) g.append(el('line', { x1: 255 - (y - 100) * 0.12, y1: y, x2: 345 + (y - 100) * 0.12, y2: y, stroke: '#A8977A', 'stroke-width': 1.5 }));
    g.append(el('rect', { x: 290, y: 150, width: 20, height: 20, fill: '#3B3B3B' }));
    g.append(el('rect', { x: 270, y: 80, width: 60, height: 12, fill: '#B5A486', stroke: '#8A7A60' }));
  },
  cherry(g) {
    sky(g);
    ground(g, 230, '#CBE3B0');
    g.append(el('rect', { x: 230, y: 230, width: 140, height: 90, fill: '#6FA8D0' }));
    for (const x of [60, 150, 450, 540]) {
      g.append(el('rect', { x: x - 5, y: 150, width: 10, height: 90, fill: '#7A5230' }));
      g.append(el('circle', { cx: x, cy: 140, r: 55, fill: '#FFC9DE' }));
      g.append(el('circle', { cx: x - 20, cy: 125, r: 30, fill: '#FFDEEB' }));
    }
    const petals = el('g', { class: 'lm-petals' });
    for (let i = 0; i < 24; i++) petals.append(el('circle', { cx: (i * 71) % 600, cy: (i * 43) % 220, r: 3, fill: '#FFB3D1' }));
    g.append(petals);
    g.append(el('path', { d: 'M220 240 Q300 205 380 240', stroke: '#C92A2A', 'stroke-width': 8, fill: 'none' }));
  },
  tomb(g) {
    sky(g);
    ground(g, 220, '#B7D68F');
    g.append(el('path', { d: 'M180 235 Q300 120 420 235 Z', fill: '#7FB069' }));
    for (const x of [140, 460]) g.append(el('rect', { x: x - 10, y: 200, width: 20, height: 40, fill: '#BDB2A0', stroke: '#8A7F6E' }));
    g.append(el('rect', { x: 0, y: 235, width: 600, height: 8, fill: '#D6CDB8' }));
    tree(g, 60, 215, 1.2, '#3E7A3E');
    tree(g, 540, 215, 1.2, '#3E7A3E');
  },
  pavilion(g) {
    sky(g);
    g.append(el('path', { d: 'M0 240 Q300 225 600 245 L600 320 L0 320 Z', fill: '#5FA3D3' }));
    g.append(el('path', { d: 'M100 240 L160 150 L460 150 L520 240 Z', fill: '#9C8C6E' }));
    g.append(el('rect', { x: 200, y: 110, width: 200, height: 40, fill: '#C9A26B' }));
    for (let x = 205; x < 400; x += 24) g.append(el('rect', { x, y: 112, width: 8, height: 38, fill: '#8C2F2F' }));
    roof(g, 300, 100, 220, '#3F4A55');
  },
  mountain(g) {
    sky(g);
    g.append(el('path', { d: 'M0 260 L160 110 L250 170 L360 60 L470 150 L600 90 L600 320 L0 320 Z', fill: '#5E8F5C' }));
    g.append(el('path', { d: 'M340 80 L360 60 L380 80 L370 76 L360 84 L350 76 Z', fill: '#FFFFFF' }));
    for (let i = 0; i < 14; i++) tree(g, 20 + i * 42, 280 - (i % 3) * 14, 0.8, '#3E7A3E');
    g.append(el('path', { d: 'M120 300 Q200 250 260 220 T360 120', stroke: '#C9B48A', 'stroke-width': 5, fill: 'none', 'stroke-dasharray': '10 6' }));
    person(g, 240, 236);
  },
  themepark(g) {
    sky(g);
    ground(g, 240, '#CDE3A5');
    // 관람차
    g.append(el('circle', { cx: 150, cy: 140, r: 90, fill: 'none', stroke: '#868E96', 'stroke-width': 4 }));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.append(el('line', { x1: 150, y1: 140, x2: 150 + Math.cos(a) * 90, y2: 140 + Math.sin(a) * 90, stroke: '#ADB5BD', 'stroke-width': 2 }));
      g.append(el('rect', { x: 150 + Math.cos(a) * 90 - 9, y: 140 + Math.sin(a) * 90 - 7, width: 18, height: 14, rx: 3, fill: ['#E03131', '#1C7ED6', '#F59F00', '#2F9E44', '#AE3EC9'][i % 5] }));
    }
    g.append(el('path', { d: 'M150 140 L120 240 M150 140 L180 240', stroke: '#868E96', 'stroke-width': 5 }));
    // 롤러코스터
    g.append(el('path', { d: 'M280 230 Q320 60 380 180 T480 120 T600 200', stroke: '#E8590C', 'stroke-width': 6, fill: 'none' }));
    for (let x = 300; x < 600; x += 40) g.append(el('line', { x1: x, y1: 240, x2: x, y2: 190 - Math.sin(x / 40) * 40, stroke: '#ADB5BD', 'stroke-width': 3 }));
    for (const [x, c] of [[260, '#1971C2'], [420, '#2F9E44']]) person(g, x, 290, c);
  },
  viewpoint(g) {
    sky(g);
    sea(g, 200);
    g.append(el('path', { d: 'M0 200 L120 170 L200 200 Z', fill: '#7E8C6A' }));
    // 전망대 난간과 바라보는 사람
    g.append(el('rect', { x: 0, y: 250, width: 600, height: 70, fill: '#B08968' }));
    for (let x = 10; x < 600; x += 30) g.append(el('rect', { x, y: 225, width: 6, height: 30, fill: '#6F4E37' }));
    g.append(el('rect', { x: 0, y: 222, width: 600, height: 6, fill: '#6F4E37' }));
    person(g, 280, 250);
    person(g, 320, 250, '#1971C2');
    gull(g, 430, 90);
  },
  fortress(g) {
    sky(g);
    hills(g, 190, '#7FB27A');
    // 돌로 쌓은 성벽과 성문
    g.append(el('rect', { x: 0, y: 190, width: 600, height: 80, fill: '#B9AE9A' }));
    for (let y = 196; y < 270; y += 14) for (let x = (y / 14) % 2 ? 0 : 20; x < 600; x += 40) g.append(el('rect', { x, y, width: 38, height: 12, fill: 'none', stroke: '#8F8574' }));
    for (let x = 0; x < 600; x += 30) g.append(el('rect', { x, y: 178, width: 18, height: 14, fill: '#B9AE9A', stroke: '#8F8574' }));
    g.append(el('path', { d: 'M260 270 L260 220 Q300 190 340 220 L340 270 Z', fill: '#4A3B31' }));
    g.append(el('rect', { x: 230, y: 130, width: 140, height: 50, fill: '#C9A26B' }));
    roof(g, 300, 124, 150, '#3F4A55');
    ground(g, 270, '#CDE3A5');
  },
  hanok(g) {
    sky(g);
    hills(g, 180, '#6FA36A');
    ground(g, 240, '#D8CBB0');
    for (const [x, y, s] of [[110, 200, 1], [300, 185, 1.2], [480, 205, 0.9], [200, 240, 0.8], [420, 245, 0.9]]) {
      g.append(el('rect', { x: x - 50 * s, y: y, width: 100 * s, height: 40 * s, fill: '#EFE6D2', stroke: '#8C5A2B' }));
      for (let k = 0; k < 4; k++) g.append(el('rect', { x: x - 44 * s + k * 24 * s, y: y + 8 * s, width: 14 * s, height: 26 * s, fill: '#C9A26B' }));
      roof(g, x, y - 2, 100 * s, k(x));
    }
    function k(x) {
      return x % 2 ? '#5C4A3D' : '#3F4A55';
    }
    g.append(el('path', { d: 'M0 300 Q300 260 600 300', stroke: '#E9DCC0', 'stroke-width': 18, fill: 'none' }));
  },
  stadium(g) {
    sky(g);
    ground(g, 250, '#CDE3A5');
    // 둥근 경기장과 지붕
    g.append(el('ellipse', { cx: 300, cy: 200, rx: 260, ry: 80, fill: '#DEE2E6', stroke: '#868E96', 'stroke-width': 3 }));
    g.append(el('ellipse', { cx: 300, cy: 210, rx: 200, ry: 52, fill: '#69B34C' }));
    g.append(el('ellipse', { cx: 300, cy: 210, rx: 160, ry: 36, fill: 'none', stroke: '#C2410C', 'stroke-width': 10 }));
    g.append(el('path', { d: 'M40 190 Q300 60 560 190', stroke: '#ADB5BD', 'stroke-width': 8, fill: 'none' }));
    for (let x = 80; x < 540; x += 40) g.append(el('line', { x1: x, y1: 190 - Math.sin(((x - 40) / 520) * Math.PI) * 120 * 0.55, x2: x, y2: 170, stroke: '#CED4DA', 'stroke-width': 2 }));
    for (const [x, c] of [[250, '#E03131'], [330, '#1971C2']]) person(g, x, 225, c);
  },
  rockart(g) {
    sky(g);
    g.append(el('rect', { x: 0, y: 250, width: 600, height: 70, fill: '#5FA3D3' }));
    g.append(el('path', { d: 'M60 250 L80 60 L520 70 L540 250 Z', fill: '#8D7B68' }));
    // 바위에 새긴 고래, 사슴, 사람 그림(단순하게)
    const ink = { stroke: '#4A3B2E', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' };
    g.append(el('path', { d: 'M150 120 Q190 100 230 120 Q190 140 150 120 M230 120 l14 -10 M230 120 l14 10', ...ink }));
    g.append(el('path', { d: 'M300 170 Q340 150 380 170 Q340 190 300 170 M380 170 l14 -10 M380 170 l14 10', ...ink }));
    g.append(el('path', { d: 'M420 110 l40 0 M425 110 l-4 22 M455 110 l4 22 M460 110 l8 -14 l6 -6 M468 96 l-4 -10', ...ink }));
    g.append(el('path', { d: 'M260 220 l0 -24 M248 206 l24 0 M260 220 l-8 14 M260 220 l8 14', ...ink }));
    g.append(el('circle', { cx: 260, cy: 186, r: 7, ...ink }));
  },
};

/**
 * 장면 그림 하나.
 * @param {string} kind
 * @param {{reduceMotion?: boolean, label?: string}} p
 * @returns {SVGSVGElement}
 */
export function landmarkScene(kind, { reduceMotion = false, label = '' } = {}) {
  const svg = el('svg', { viewBox: '0 0 600 320', class: `lm-scene${reduceMotion ? '' : ' lm-moving'}`, role: 'img', 'aria-label': label });
  const g = el('g');
  (SCENES[kind] ?? SCENES.park)(g);
  svg.append(g);
  return svg;
}
