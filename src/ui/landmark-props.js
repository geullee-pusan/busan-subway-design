// 랜드마크마다 다른 특징 그림(SVG). 종류별 장면(landmark-scenes.js) 위에 그곳만의 것을 얹는다.
// 어떤 그림을 얹을지는 이름과 소개 글의 낱말(looksFor)과 손으로 정한 것(src/content/landmark-looks.json)으로 고른다.
// 그림은 그곳의 특징을 단순하게 새로 그린 것이다(실제 사진이 아니다).
import looksFile from '../content/landmark-looks.json';

const SVG_NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}
const add = (g, tag, attrs, text) => g.append(el(tag, attrs, text));
const flower = (g, x, y, r, color) => {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    add(g, 'circle', { cx: x + Math.cos(a) * r, cy: y + Math.sin(a) * r, r: r * 0.8, fill: color });
  }
  add(g, 'circle', { cx: x, cy: y, r: r * 0.6, fill: '#FFD43B' });
};

/**
 * 특징 그림. slot은 그림이 놓이는 자리(같은 자리에는 하나만): sky 하늘, back 뒤쪽 가운데, left 앞 왼쪽, right 앞 오른쪽, ground 앞 땅 전체.
 * draw(g)는 600 × 320 장면 좌표에 그린다.
 */
export const PROPS = {
  lighthouse: {
    slot: 'right',
    draw(g) {
      add(g, 'path', { d: 'M470 300 L490 300 L486 170 L474 170 Z', fill: '#FFFFFF', stroke: '#8A939B', 'stroke-width': 2 });
      for (const y of [190, 230, 270]) add(g, 'rect', { x: 472, y, width: 16, height: 14, fill: '#D9480F' });
      add(g, 'rect', { x: 468, y: 156, width: 24, height: 16, fill: '#FFE066', stroke: '#495057' });
      add(g, 'path', { d: 'M466 156 L480 142 L494 156 Z', fill: '#D9480F' });
      add(g, 'path', { d: 'M440 300 Q480 286 520 300 Z', fill: '#7B6E5E' });
    },
  },
  pagoda: {
    slot: 'left',
    draw(g) {
      add(g, 'rect', { x: 70, y: 280, width: 70, height: 14, fill: '#B6ADA0', stroke: '#7E766B' });
      for (let k = 0; k < 3; k++) {
        const w = 56 - k * 12;
        const y = 262 - k * 30;
        add(g, 'rect', { x: 105 - w / 2 + 6, y: y - 12, width: w - 12, height: 20, fill: '#C9C1B4', stroke: '#7E766B' });
        add(g, 'path', { d: `M${105 - w / 2 - 4} ${y - 12} L${105 + w / 2 + 4} ${y - 12} L${105 + w / 2 - 6} ${y - 20} L${105 - w / 2 + 6} ${y - 20} Z`, fill: '#ADA497', stroke: '#7E766B' });
      }
      add(g, 'rect', { x: 102, y: 168, width: 6, height: 26, fill: '#8A8072' });
    },
  },
  stoneLantern: {
    slot: 'left',
    draw(g) {
      add(g, 'rect', { x: 92, y: 286, width: 36, height: 10, fill: '#B6ADA0', stroke: '#7E766B' });
      add(g, 'rect', { x: 104, y: 230, width: 12, height: 56, fill: '#C9C1B4', stroke: '#7E766B' });
      add(g, 'rect', { x: 94, y: 200, width: 32, height: 30, fill: '#C9C1B4', stroke: '#7E766B' });
      add(g, 'rect', { x: 104, y: 208, width: 12, height: 14, fill: '#FFD43B' });
      add(g, 'path', { d: 'M86 200 L134 200 L118 186 L102 186 Z', fill: '#ADA497', stroke: '#7E766B' });
    },
  },
  bell: {
    slot: 'right',
    draw(g) {
      add(g, 'rect', { x: 440, y: 190, width: 8, height: 100, fill: '#8C2F2F' });
      add(g, 'rect', { x: 532, y: 190, width: 8, height: 100, fill: '#8C2F2F' });
      add(g, 'path', { d: 'M426 192 Q490 160 554 192 L540 200 L440 200 Z', fill: '#3F4A55' });
      add(g, 'path', { d: 'M470 214 Q470 204 490 204 Q510 204 510 214 L514 258 L466 258 Z', fill: '#7A6A3A', stroke: '#5A4D2A' });
      add(g, 'rect', { x: 487, y: 200, width: 6, height: 6, fill: '#5A4D2A' });
    },
  },
  scripture: {
    slot: 'right',
    draw(g) {
      add(g, 'rect', { x: 400, y: 200, width: 180, height: 96, fill: '#C9A26B', stroke: '#7A5230' });
      add(g, 'path', { d: 'M388 202 Q490 172 592 202 Z', fill: '#4A5560' });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) add(g, 'rect', { x: 410 + c * 18, y: 212 + r * 20, width: 14, height: 16, fill: '#5C3D21' });
      add(g, 'text', { x: 490, y: 314, 'font-size': 12, 'font-weight': 800, 'text-anchor': 'middle', fill: '#3B2A1C' }, '대장경 판고');
    },
  },
  buddha: {
    slot: 'left',
    draw(g) {
      add(g, 'ellipse', { cx: 110, cy: 292, rx: 46, ry: 10, fill: '#A79F92' });
      add(g, 'path', { d: 'M70 290 Q74 238 110 232 Q146 238 150 290 Z', fill: '#BDB4A6', stroke: '#7E766B' });
      add(g, 'circle', { cx: 110, cy: 214, r: 18, fill: '#C9C1B4', stroke: '#7E766B' });
      add(g, 'circle', { cx: 110, cy: 194, r: 7, fill: '#C9C1B4', stroke: '#7E766B' });
      add(g, 'path', { d: 'M100 216 q10 6 20 0', stroke: '#7E766B', fill: 'none', 'stroke-width': 2 });
    },
  },
  cablecar: {
    slot: 'sky',
    draw(g) {
      add(g, 'line', { x1: -10, y1: 40, x2: 610, y2: 130, stroke: '#495057', 'stroke-width': 2 });
      add(g, 'line', { x1: -10, y1: 50, x2: 610, y2: 140, stroke: '#495057', 'stroke-width': 2 });
      for (const [x, c] of [[160, '#E03131'], [380, '#1C7ED6']]) {
        const y = 40 + (x + 10) * (90 / 620);
        const cab = el('g', { class: 'lm-car' });
        cab.append(el('line', { x1: x, y1: y, x2: x, y2: y + 18, stroke: '#495057', 'stroke-width': 2 }));
        cab.append(el('rect', { x: x - 16, y: y + 18, width: 32, height: 26, rx: 6, fill: c, stroke: '#343A40' }));
        cab.append(el('rect', { x: x - 11, y: y + 23, width: 22, height: 10, rx: 2, fill: '#D0EBFF' }));
        g.append(cab);
      }
    },
  },
  suspensionBridge: {
    slot: 'back',
    draw(g) {
      add(g, 'rect', { x: 60, y: 186, width: 480, height: 8, fill: '#8A96A3' });
      for (const x of [200, 400]) add(g, 'rect', { x: x - 6, y: 110, width: 12, height: 84, fill: '#E9ECEF', stroke: '#868E96' });
      add(g, 'path', { d: 'M60 170 Q130 116 200 112 Q300 176 400 112 Q470 116 540 170', stroke: '#6E7A86', fill: 'none', 'stroke-width': 3 });
      for (let x = 80; x < 540; x += 20) add(g, 'line', { x1: x, y1: 186, x2: x, y2: 186 - 60 * Math.max(0, 1 - Math.abs(((x - 60) % 200) - 100) / 100) * 0.9 - 10, stroke: '#ADB5BD', 'stroke-width': 1 });
    },
  },
  cableBridge: {
    slot: 'back',
    draw(g) {
      add(g, 'rect', { x: 40, y: 190, width: 520, height: 8, fill: '#8A96A3' });
      add(g, 'path', { d: 'M296 90 L300 82 L304 90 L304 198 L296 198 Z', fill: '#E9ECEF', stroke: '#868E96' });
      for (let k = 1; k <= 7; k++) {
        add(g, 'line', { x1: 300, y1: 96 + k * 4, x2: 300 - k * 34, y2: 190, stroke: '#ADB5BD', 'stroke-width': 1.5 });
        add(g, 'line', { x1: 300, y1: 96 + k * 4, x2: 300 + k * 34, y2: 190, stroke: '#ADB5BD', 'stroke-width': 1.5 });
      }
    },
  },
  windmill: {
    slot: 'right',
    draw(g) {
      add(g, 'path', { d: 'M470 300 L478 200 L502 200 L510 300 Z', fill: '#F1E3D3', stroke: '#8C6E54' });
      add(g, 'path', { d: 'M472 202 L490 176 L508 202 Z', fill: '#8C2F2F' });
      const blades = el('g', { transform: 'translate(490 196)' });
      for (let k = 0; k < 4; k++) blades.append(el('rect', { x: -5, y: -62, width: 10, height: 58, fill: '#FFFFFF', stroke: '#8C6E54', transform: `rotate(${k * 90 + 20})` }));
      g.append(blades);
      add(g, 'rect', { x: 484, y: 260, width: 12, height: 40, fill: '#6E4B33' });
    },
  },
  dinosaur: {
    slot: 'right',
    draw(g) {
      add(g, 'path', { d: 'M420 280 Q430 220 480 214 Q520 210 530 180 Q536 150 556 148 Q572 148 570 160 Q556 160 552 186 Q546 236 520 252 L520 290 L508 290 L506 258 L466 262 L462 290 L450 290 L448 262 Q420 272 380 286 Q408 270 420 280 Z', fill: '#6FA35A', stroke: '#4C7A3D', 'stroke-width': 2 });
      add(g, 'circle', { cx: 562, cy: 154, r: 2, fill: '#1F3342' });
      for (const [x, y] of [[200, 300], [240, 292], [280, 302], [320, 294]]) add(g, 'path', { d: `M${x} ${y} l-6 -8 M${x} ${y} l0 -10 M${x} ${y} l6 -8`, stroke: '#6E5A45', 'stroke-width': 3, 'stroke-linecap': 'round' });
    },
  },
  statue: {
    slot: 'left',
    draw(g) {
      add(g, 'rect', { x: 80, y: 250, width: 60, height: 50, fill: '#B6ADA0', stroke: '#7E766B' });
      add(g, 'rect', { x: 100, y: 196, width: 20, height: 54, fill: '#5C6670' });
      add(g, 'circle', { cx: 110, cy: 186, r: 10, fill: '#5C6670' });
      add(g, 'path', { d: 'M100 182 L110 168 L120 182 Z', fill: '#5C6670' });
      add(g, 'line', { x1: 122, y1: 210, x2: 132, y2: 168, stroke: '#3B434B', 'stroke-width': 4 });
    },
  },
  turtleShip: {
    slot: 'right',
    draw(g) {
      add(g, 'path', { d: 'M410 270 L580 270 L560 296 L430 296 Z', fill: '#7A5230', stroke: '#4A3420' });
      add(g, 'path', { d: 'M420 270 Q495 226 570 270 Z', fill: '#5C6E4A', stroke: '#3E4A31' });
      for (let x = 440; x < 560; x += 16) add(g, 'path', { d: `M${x} ${262 - Math.sin(((x - 420) / 150) * Math.PI) * 20} l4 -8 l4 8`, stroke: '#2B2F33', 'stroke-width': 2, fill: 'none' });
      add(g, 'path', { d: 'M410 270 L396 252 L404 248 L418 262 Z', fill: '#C92A2A' });
    },
  },
  teaRows: {
    slot: 'ground',
    draw(g) {
      add(g, 'path', { d: 'M0 200 Q300 150 600 200 L600 320 L0 320 Z', fill: '#7FB35B' });
      for (let k = 0; k < 9; k++) add(g, 'path', { d: `M0 ${214 + k * 13} Q300 ${168 + k * 17} 600 ${214 + k * 13}`, stroke: '#3F7A2E', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round' });
    },
  },
  reeds: {
    slot: 'ground',
    draw(g) {
      for (let x = 0; x < 600; x += 7) {
        const h = 40 + ((x * 37) % 30);
        add(g, 'line', { x1: x, y1: 320, x2: x + 4, y2: 320 - h, stroke: '#B48A3C', 'stroke-width': 2 });
        add(g, 'ellipse', { cx: x + 5, cy: 318 - h, rx: 3, ry: 8, fill: '#D9B76A' });
      }
    },
  },
  cranes: {
    slot: 'sky',
    draw(g) {
      for (const [x, y] of [[150, 70], [200, 60], [250, 76], [300, 64]]) {
        const bird = el('g', { class: 'lm-bird' });
        bird.append(el('path', { d: `M${x - 18} ${y} q9 -12 18 0 q9 -12 18 0`, stroke: '#2B2F33', fill: 'none', 'stroke-width': 3 }));
        bird.append(el('circle', { cx: x, cy: y + 2, r: 3, fill: '#2B2F33' }));
        g.append(bird);
      }
    },
  },
  bamboo: {
    slot: 'left',
    draw(g) {
      for (let x = 10; x < 210; x += 12) {
        add(g, 'rect', { x, y: 90 + ((x * 13) % 40), width: 6, height: 230, fill: '#4E9A3E' });
        for (let y = 130; y < 320; y += 30) add(g, 'rect', { x: x - 1, y: y + ((x * 7) % 12), width: 8, height: 2, fill: '#2F6B26' });
      }
    },
  },
  treeAvenue: {
    slot: 'ground',
    draw(g) {
      add(g, 'path', { d: 'M260 320 L295 190 L305 190 L340 320 Z', fill: '#D8C9A6' });
      for (let k = 0; k < 6; k++) {
        const s = 1 - k * 0.14;
        for (const side of [-1, 1]) {
          const x = 300 + side * (150 - k * 24);
          add(g, 'path', { d: `M${x} ${300 - k * 20 - 150 * s} L${x - 22 * s} ${300 - k * 20} L${x + 22 * s} ${300 - k * 20} Z`, fill: '#3F7A2E' });
        }
      }
    },
  },
  terraces: {
    slot: 'ground',
    draw(g) {
      for (let k = 0; k < 8; k++) add(g, 'path', { d: `M0 ${170 + k * 20} Q150 ${150 + k * 22} 300 ${166 + k * 20} T600 ${160 + k * 21} L600 ${180 + k * 20} Q450 ${174 + k * 22} 300 ${186 + k * 20} T0 ${190 + k * 20} Z`, fill: k % 2 ? '#8DBF6A' : '#A7CF7E', stroke: '#6E9A50' });
    },
  },
  saltPans: {
    slot: 'ground',
    draw(g) {
      add(g, 'rect', { x: 0, y: 220, width: 600, height: 100, fill: '#C9C4B5' });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) add(g, 'rect', { x: 8 + c * 74, y: 228 + r * 30, width: 66, height: 24, fill: '#BFD9EA', stroke: '#8E8A7E' });
      for (const x of [120, 300, 470]) add(g, 'path', { d: `M${x - 22} 250 L${x} 222 L${x + 22} 250 Z`, fill: '#FFFFFF', stroke: '#C9C4B5' });
    },
  },
  dolmen: {
    slot: 'right',
    draw(g) {
      for (const x of [440, 512]) add(g, 'rect', { x, y: 250, width: 22, height: 44, fill: '#8F8676', stroke: '#625B50' });
      add(g, 'path', { d: 'M420 250 Q480 228 556 246 L552 262 Q480 256 424 262 Z', fill: '#A59B89', stroke: '#625B50' });
    },
  },
  rocket: {
    slot: 'right',
    draw(g) {
      add(g, 'rect', { x: 430, y: 120, width: 14, height: 180, fill: '#9AA3AB' });
      for (let y = 130; y < 300; y += 20) add(g, 'line', { x1: 430, y1: y, x2: 474, y2: y + 10, stroke: '#9AA3AB', 'stroke-width': 2 });
      add(g, 'path', { d: 'M480 290 L480 150 Q490 110 500 150 L500 290 Z', fill: '#FFFFFF', stroke: '#6B7178' });
      add(g, 'path', { d: 'M480 260 L468 292 L480 290 Z M500 260 L512 292 L500 290 Z', fill: '#C92A2A' });
      add(g, 'rect', { x: 482, y: 190, width: 16, height: 8, fill: '#1C5FA8' });
    },
  },
  telescope: {
    slot: 'right',
    draw(g) {
      add(g, 'rect', { x: 440, y: 230, width: 100, height: 66, fill: '#E9ECEF', stroke: '#868E96' });
      add(g, 'path', { d: 'M436 232 Q490 170 544 232 Z', fill: '#DEE2E6', stroke: '#868E96' });
      add(g, 'rect', { x: 484, y: 186, width: 12, height: 40, fill: '#495057', transform: 'rotate(-28 490 206)' });
    },
  },
  ferrisWheel: {
    slot: 'right',
    draw(g) {
      add(g, 'circle', { cx: 490, cy: 170, r: 70, fill: 'none', stroke: '#868E96', 'stroke-width': 4 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        add(g, 'line', { x1: 490, y1: 170, x2: 490 + Math.cos(a) * 70, y2: 170 + Math.sin(a) * 70, stroke: '#ADB5BD', 'stroke-width': 2 });
        add(g, 'rect', { x: 490 + Math.cos(a) * 70 - 8, y: 170 + Math.sin(a) * 70 - 6, width: 16, height: 12, rx: 3, fill: ['#E03131', '#1C7ED6', '#F59F00', '#2F9E44'][k % 4] });
      }
      add(g, 'path', { d: 'M490 170 L466 290 M490 170 L514 290', stroke: '#868E96', 'stroke-width': 5 });
    },
  },
  steamTrain: {
    slot: 'ground',
    draw(g) {
      add(g, 'rect', { x: 0, y: 290, width: 600, height: 6, fill: '#6E5A45' });
      for (let x = 0; x < 600; x += 16) add(g, 'rect', { x, y: 294, width: 10, height: 6, fill: '#8C7660' });
      const train = el('g', { class: 'lm-car' });
      train.append(el('rect', { x: 200, y: 236, width: 110, height: 52, rx: 6, fill: '#2B2F33' }));
      train.append(el('rect', { x: 290, y: 212, width: 34, height: 76, fill: '#2B2F33' }));
      train.append(el('rect', { x: 226, y: 212, width: 16, height: 26, fill: '#2B2F33' }));
      train.append(el('rect', { x: 330, y: 246, width: 90, height: 42, rx: 4, fill: '#8C2F2F' }));
      for (const x of [220, 260, 300, 350, 400]) train.append(el('circle', { cx: x, cy: 290, r: 11, fill: '#495057', stroke: '#1F2326', 'stroke-width': 2 }));
      g.append(train);
      for (const [x, y, r] of [[234, 196, 12], [248, 178, 16], [270, 158, 20]]) add(g, 'circle', { cx: x, cy: y, r, fill: '#E9ECEF', opacity: 0.9 });
    },
  },
  mural: {
    slot: 'back',
    draw(g) {
      add(g, 'rect', { x: 60, y: 160, width: 480, height: 80, fill: '#F8F1E3', stroke: '#B9A88A' });
      const colors = ['#FF8787', '#74C0FC', '#FFD43B', '#8CE99A', '#B197FC'];
      for (let k = 0; k < 10; k++) add(g, 'circle', { cx: 90 + k * 46, cy: 200 + (k % 2 ? 10 : -10), r: 16, fill: colors[k % 5] });
      add(g, 'path', { d: 'M100 230 Q200 170 300 220 T500 210', stroke: '#E8590C', 'stroke-width': 5, fill: 'none' });
    },
  },
  lotus: {
    slot: 'ground',
    draw(g) {
      add(g, 'path', { d: 'M0 240 Q300 220 600 240 L600 320 L0 320 Z', fill: '#5FA3D3' });
      for (let k = 0; k < 16; k++) {
        const x = 20 + ((k * 137) % 560);
        const y = 255 + ((k * 53) % 55);
        add(g, 'ellipse', { cx: x, cy: y, rx: 20, ry: 7, fill: '#3F8E3A' });
        if (k % 2 === 0) add(g, 'path', { d: `M${x - 7} ${y - 4} Q${x} ${y - 22} ${x + 7} ${y - 4} Z`, fill: '#FFFFFF', stroke: '#F3B5C8' });
      }
    },
  },
  camellia: {
    slot: 'left',
    draw(g) {
      add(g, 'circle', { cx: 100, cy: 250, r: 70, fill: '#2F6B35' });
      for (let k = 0; k < 14; k++) flower(g, 50 + ((k * 61) % 110), 200 + ((k * 37) % 90), 5, '#D6336C');
    },
  },
  plum: {
    slot: 'left',
    draw(g) {
      add(g, 'path', { d: 'M110 300 Q100 230 120 200 Q90 170 70 150 M120 200 Q150 170 170 150', stroke: '#5C4033', 'stroke-width': 8, fill: 'none', 'stroke-linecap': 'round' });
      for (let k = 0; k < 16; k++) flower(g, 60 + ((k * 41) % 130), 140 + ((k * 29) % 80), 4, k % 3 ? '#FFFFFF' : '#FFC9DE');
    },
  },
  cherry: {
    slot: 'left',
    draw(g) {
      add(g, 'rect', { x: 104, y: 200, width: 12, height: 100, fill: '#6E4B33' });
      add(g, 'circle', { cx: 110, cy: 180, r: 66, fill: '#FFC9DE' });
      add(g, 'circle', { cx: 86, cy: 160, r: 36, fill: '#FFDEEB' });
    },
  },
  rockPillars: {
    slot: 'right',
    draw(g) {
      for (let k = 0; k < 7; k++) add(g, 'rect', { x: 420 + k * 22, y: 150 + ((k * 23) % 40), width: 20, height: 160, fill: k % 2 ? '#8F877B' : '#A39A8D', stroke: '#6B645A' });
    },
  },
  castleWall: {
    slot: 'ground',
    draw(g) {
      add(g, 'rect', { x: 0, y: 236, width: 600, height: 40, fill: '#B9AE9A' });
      for (let x = 0; x < 600; x += 26) add(g, 'rect', { x, y: 226, width: 16, height: 12, fill: '#B9AE9A', stroke: '#8F8574' });
      for (let y = 240; y < 276; y += 12) for (let x = (y / 12) % 2 ? 0 : 14; x < 600; x += 28) add(g, 'rect', { x, y, width: 26, height: 10, fill: 'none', stroke: '#8F8574' });
    },
  },
  gate: {
    slot: 'back',
    draw(g) {
      add(g, 'rect', { x: 240, y: 150, width: 120, height: 34, fill: '#C9A26B' });
      for (let x = 246; x < 360; x += 18) add(g, 'rect', { x, y: 152, width: 6, height: 32, fill: '#8C2F2F' });
      add(g, 'path', { d: 'M226 152 Q300 120 374 152 L360 156 L240 156 Z', fill: '#3F4A55' });
      add(g, 'path', { d: 'M260 230 L260 184 L340 184 L340 230', fill: '#4A3B31' });
    },
  },
  ship: {
    slot: 'right',
    draw(g) {
      const ship = el('g', { class: 'lm-car' });
      ship.append(el('path', { d: 'M420 250 L580 250 L560 274 L436 274 Z', fill: '#F1F3F5', stroke: '#495057' }));
      ship.append(el('rect', { x: 460, y: 226, width: 70, height: 24, fill: '#FFFFFF', stroke: '#495057' }));
      ship.append(el('rect', { x: 476, y: 208, width: 34, height: 18, fill: '#FFFFFF', stroke: '#495057' }));
      ship.append(el('rect', { x: 420, y: 258, width: 160, height: 5, fill: '#1C5FA8' }));
      g.append(ship);
    },
  },
  islands: {
    slot: 'back',
    draw(g) {
      for (const [x, w, h] of [[120, 90, 40], [230, 60, 28], [420, 120, 46], [530, 70, 30]]) add(g, 'path', { d: `M${x - w / 2} 200 Q${x} ${200 - h * 2} ${x + w / 2} 200 Z`, fill: '#6E8A62' });
    },
  },
  skyline: {
    slot: 'back',
    draw(g) {
      for (let k = 0; k < 9; k++) add(g, 'rect', { x: 30 + k * 62, y: 90 + ((k * 31) % 60), width: 44, height: 110, fill: ['#C9D1D9', '#B7C1CB', '#DCE2E8'][k % 3], stroke: '#8E99A4' });
    },
  },
  penguin: {
    slot: 'right',
    draw(g) {
      for (const [x, s] of [[460, 1], [510, 0.8], [545, 0.65]]) {
        add(g, 'ellipse', { cx: x, cy: 280 - 30 * s, rx: 22 * s, ry: 34 * s, fill: '#2B2F33' });
        add(g, 'ellipse', { cx: x, cy: 286 - 30 * s, rx: 13 * s, ry: 24 * s, fill: '#F8F9FA' });
        add(g, 'circle', { cx: x, cy: 236 - 30 * s + 30 - 20 * s, r: 14 * s, fill: '#2B2F33' });
        add(g, 'path', { d: `M${x} ${244 - 20 * s} l10 ${4 * s} l-10 ${4 * s} Z`, fill: '#F59F00' });
      }
    },
  },
  waterfall: {
    slot: 'left',
    draw(g) {
      add(g, 'path', { d: 'M40 120 L160 120 L170 300 L30 300 Z', fill: '#8D7B68' });
      add(g, 'rect', { x: 84, y: 120, width: 30, height: 180, fill: '#D0EBFF' });
      for (let y = 130; y < 300; y += 14) add(g, 'line', { x1: 90, y1: y, x2: 108, y2: y + 6, stroke: '#FFFFFF', 'stroke-width': 2 });
    },
  },
  pine: {
    slot: 'left',
    draw(g) {
      add(g, 'path', { d: 'M100 300 Q90 240 120 200 Q150 160 130 120', stroke: '#5B4332', 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round' });
      for (const [x, y, r] of [[120, 196, 30], [150, 160, 26], [118, 130, 24], [84, 216, 22]]) add(g, 'ellipse', { cx: x, cy: y, rx: r * 1.4, ry: r * 0.6, fill: '#2C6240' });
    },
  },
  monument: {
    slot: 'back',
    draw(g) {
      add(g, 'rect', { x: 230, y: 210, width: 140, height: 20, fill: '#B6ADA0', stroke: '#7E766B' });
      add(g, 'path', { d: 'M270 210 L294 40 L300 30 L306 40 L330 210 Z', fill: '#DEE2E6', stroke: '#868E96' });
      add(g, 'ellipse', { cx: 300, cy: 120, rx: 22, ry: 34, fill: '#E9ECEF', stroke: '#868E96' });
    },
  },
  tower: {
    slot: 'back',
    draw(g) {
      add(g, 'rect', { x: 290, y: 60, width: 20, height: 150, fill: '#E9ECEF', stroke: '#868E96' });
      add(g, 'ellipse', { cx: 300, cy: 80, rx: 32, ry: 12, fill: '#CED4DA', stroke: '#868E96' });
      add(g, 'line', { x1: 300, y1: 30, x2: 300, y2: 68, stroke: '#868E96', 'stroke-width': 3 });
    },
  },
  umbrellas: {
    slot: 'right',
    draw(g) {
      for (const [x, c] of [[430, '#E03131'], [490, '#1971C2'], [550, '#F59F00']]) {
        add(g, 'line', { x1: x, y1: 300, x2: x, y2: 262, stroke: '#555', 'stroke-width': 3 });
        add(g, 'path', { d: `M${x - 26} 266 Q${x} 240 ${x + 26} 266 Z`, fill: c });
      }
    },
  },
  boatsHarbor: {
    slot: 'right',
    draw(g) {
      for (const [x, c] of [[440, '#1C7ED6'], [500, '#E03131'], [556, '#2F9E44']]) {
        add(g, 'path', { d: `M${x - 24} 286 L${x + 24} 286 L${x + 16} 300 L${x - 16} 300 Z`, fill: c, stroke: '#343A40' });
        add(g, 'line', { x1: x, y1: 286, x2: x, y2: 250, stroke: '#343A40', 'stroke-width': 2 });
        add(g, 'path', { d: `M${x} 252 L${x + 18} 280 L${x} 280 Z`, fill: '#FFFFFF', stroke: '#868E96' });
      }
    },
  },
  graves: {
    slot: 'right',
    draw(g) {
      for (let k = 0; k < 8; k++) add(g, 'rect', { x: 410 + (k % 4) * 44, y: 250 + Math.floor(k / 4) * 26, width: 14, height: 20, fill: '#E9ECEF', stroke: '#868E96' });
      for (let k = 0; k < 6; k++) flower(g, 420 + k * 30, 306, 3, '#FFFFFF');
    },
  },
  hanokRoofs: {
    slot: 'back',
    draw(g) {
      for (const [x, w] of [[150, 120], [300, 150], [460, 120]]) {
        add(g, 'rect', { x: x - w / 2 + 8, y: 186, width: w - 16, height: 34, fill: '#EFE6D2', stroke: '#8C5A2B' });
        add(g, 'path', { d: `M${x - w / 2 - 10} 188 Q${x} 160 ${x + w / 2 + 10} 188 Z`, fill: '#4A5560' });
      }
    },
  },
  tumuli: {
    slot: 'back',
    draw(g) {
      for (const [x, w, h] of [[150, 150, 60], [330, 190, 80], [500, 130, 50]]) add(g, 'path', { d: `M${x - w / 2} 222 Q${x} ${222 - h * 2} ${x + w / 2} 222 Z`, fill: '#7FB069', stroke: '#5E8F4E' });
    },
  },
  vase: {
    slot: 'right',
    draw(g) {
      add(g, 'rect', { x: 440, y: 270, width: 110, height: 30, fill: '#8C6239' });
      add(g, 'path', { d: 'M478 270 Q458 236 476 206 Q470 196 482 192 L508 192 Q520 196 514 206 Q532 236 512 270 Z', fill: '#8FBFA8', stroke: '#4F7F68', 'stroke-width': 2 });
      add(g, 'path', { d: 'M474 236 q20 -14 42 0', stroke: '#4F7F68', fill: 'none', 'stroke-width': 2 });
      add(g, 'circle', { cx: 495, cy: 248, r: 6, fill: 'none', stroke: '#4F7F68', 'stroke-width': 2 });
    },
  },
  crown: {
    slot: 'right',
    draw(g) {
      add(g, 'rect', { x: 430, y: 270, width: 130, height: 30, fill: '#5C3D21' });
      add(g, 'rect', { x: 452, y: 248, width: 86, height: 16, fill: '#E2B13C', stroke: '#9C7417' });
      for (const x of [462, 495, 528]) add(g, 'path', { d: `M${x - 8} 248 L${x - 8} 214 L${x} 222 L${x + 8} 206 L${x + 8} 248 Z`, fill: '#E2B13C', stroke: '#9C7417' });
      for (let k = 0; k < 7; k++) add(g, 'circle', { cx: 458 + k * 12, cy: 268, r: 3.5, fill: '#2F9E44' });
    },
  },
  onggi: {
    slot: 'right',
    draw(g) {
      for (const [x, y, sc] of [[440, 296, 1.1], [490, 300, 1.3], [545, 296, 1], [470, 262, 0.9], [520, 260, 1]]) {
        add(g, 'ellipse', { cx: x, cy: y - 22 * sc, rx: 22 * sc, ry: 26 * sc, fill: '#6B3E26', stroke: '#3E2416' });
        add(g, 'ellipse', { cx: x, cy: y - 46 * sc, rx: 12 * sc, ry: 4 * sc, fill: '#3E2416' });
      }
    },
  },
  swanBoats: {
    slot: 'right',
    draw(g) {
      for (const [x, c] of [[450, '#FFFFFF'], [520, '#FFF3BF']]) {
        add(g, 'path', { d: `M${x - 24} 286 Q${x} 300 ${x + 24} 286 L${x + 20} 274 L${x - 20} 274 Z`, fill: c, stroke: '#868E96' });
        add(g, 'path', { d: `M${x - 18} 276 Q${x - 30} 250 ${x - 16} 244 Q${x - 8} 242 ${x - 10} 252`, stroke: '#868E96', 'stroke-width': 5, fill: 'none' });
        add(g, 'path', { d: `M${x - 12} 252 l6 -2`, stroke: '#F59F00', 'stroke-width': 3 });
      }
    },
  },
  fountain: {
    slot: 'back',
    draw(g) {
      add(g, 'ellipse', { cx: 300, cy: 236, rx: 70, ry: 14, fill: '#74C0FC', stroke: '#868E96' });
      for (const [dx, h] of [[-30, 50], [0, 80], [30, 50]]) add(g, 'path', { d: `M300 236 Q${300 + dx} ${236 - h} ${300 + dx * 2} 236`, stroke: '#D0EBFF', 'stroke-width': 4, fill: 'none' });
    },
  },
  flowerBeds: {
    slot: 'ground',
    draw(g) {
      for (let r = 0; r < 3; r++) for (let k = 0; k < 18; k++) flower(g, 18 + k * 34 + (r % 2) * 16, 268 + r * 18, 5, ['#F783AC', '#FFD43B', '#FF8787', '#B197FC'][(k + r) % 4]);
    },
  },
  cloudSea: {
    slot: 'back',
    draw(g) {
      for (let k = 0; k < 9; k++) add(g, 'ellipse', { cx: 30 + k * 72, cy: 170 + (k % 2) * 10, rx: 60, ry: 18, fill: '#FFFFFF', opacity: 0.92 });
    },
  },
  seaPath: {
    slot: 'ground',
    draw(g) {
      add(g, 'path', { d: 'M0 230 L600 230 L600 320 L0 320 Z', fill: '#4E97C9' });
      add(g, 'path', { d: 'M40 320 Q300 220 560 236 L600 244 Q300 246 120 320 Z', fill: '#D9C79F' });
      for (const [x, y, c] of [[220, 290, '#E8590C'], [300, 270, '#1971C2'], [380, 255, '#2F9E44'], [450, 246, '#AE3EC9']]) {
        add(g, 'circle', { cx: x, cy: y - 20, r: 5, fill: '#F1C6A4' });
        add(g, 'rect', { x: x - 5, y: y - 15, width: 10, height: 12, rx: 3, fill: c });
      }
    },
  },
  pebbles: {
    slot: 'ground',
    draw(g) {
      add(g, 'rect', { x: 0, y: 260, width: 600, height: 60, fill: '#9AA0A6' });
      for (let k = 0; k < 90; k++) add(g, 'ellipse', { cx: (k * 61) % 600, cy: 266 + ((k * 23) % 52), rx: 9 + (k % 5), ry: 6, fill: ['#5F666D', '#7A8188', '#4A5056'][k % 3] });
    },
  },
  lanterns: {
    slot: 'sky',
    draw(g) {
      add(g, 'path', { d: 'M0 60 Q300 110 600 60', stroke: '#495057', 'stroke-width': 2, fill: 'none' });
      for (let k = 0; k < 11; k++) {
        const x = 30 + k * 54;
        const y = 60 + Math.sin((x / 600) * Math.PI) * 48;
        add(g, 'ellipse', { cx: x, cy: y + 12, rx: 10, ry: 13, fill: ['#E03131', '#F59F00', '#1C7ED6'][k % 3] });
      }
    },
  },
  germanHouses: {
    slot: 'back',
    draw(g) {
      for (const [x, y] of [[90, 170], [190, 160], [300, 176], [410, 164], [510, 172]]) {
        add(g, 'rect', { x: x - 34, y, width: 68, height: 46, fill: '#FFFFFF', stroke: '#868E96' });
        add(g, 'path', { d: `M${x - 42} ${y} L${x} ${y - 36} L${x + 42} ${y} Z`, fill: '#C0392B' });
        add(g, 'rect', { x: x - 8, y: y + 14, width: 16, height: 16, fill: '#74C0FC' });
      }
    },
  },
  bigRoof: {
    slot: 'back',
    draw(g) {
      add(g, 'rect', { x: 150, y: 170, width: 300, height: 60, fill: '#DEE2E6', stroke: '#868E96' });
      add(g, 'path', { d: 'M80 150 L520 120 L540 140 L100 168 Z', fill: '#495057' });
      for (let k = 0; k < 12; k++) add(g, 'circle', { cx: 110 + k * 36, cy: 160 - k * 2.6, r: 3, fill: '#FFE066' });
    },
  },
  planet: {
    slot: 'right',
    draw(g) {
      add(g, 'rect', { x: 484, y: 230, width: 12, height: 70, fill: '#868E96' });
      add(g, 'circle', { cx: 490, cy: 200, r: 38, fill: '#E8A04A', stroke: '#B8732A' });
      add(g, 'ellipse', { cx: 490, cy: 200, rx: 66, ry: 14, fill: 'none', stroke: '#C9A26B', 'stroke-width': 5 });
      add(g, 'path', { d: 'M460 186 q30 10 60 0', stroke: '#B8732A', fill: 'none', 'stroke-width': 3 });
    },
  },
  oldTrees: {
    slot: 'right',
    draw(g) {
      for (const [x, sc] of [[450, 1.2], [540, 1]]) {
        add(g, 'path', { d: `M${x - 10 * sc} 300 Q${x - 6 * sc} 240 ${x - 18 * sc} 200 M${x + 10 * sc} 300 Q${x + 6 * sc} 240 ${x + 20 * sc} 204`, stroke: '#5B4332', 'stroke-width': 10 * sc, fill: 'none' });
        for (const [dx, dy, r] of [[-24, -120, 34], [20, -128, 36], [0, -150, 34], [-6, -104, 30]]) add(g, 'circle', { cx: x + dx * sc, cy: 300 + dy * sc, r: r * sc, fill: '#3F7A3E' });
      }
    },
  },
  mountainPeaks: {
    slot: 'back',
    draw(g) {
      add(g, 'path', { d: 'M40 220 L160 90 L230 150 L320 60 L410 140 L480 100 L580 220 Z', fill: '#6E8F6A', opacity: 0.9 });
      add(g, 'path', { d: 'M300 82 L320 60 L340 82 L330 78 L320 88 L310 78 Z', fill: '#FFFFFF' });
    },
  },
  willowPond: {
    slot: 'left',
    draw(g) {
      add(g, 'ellipse', { cx: 120, cy: 290, rx: 120, ry: 24, fill: '#5FA3D3' });
      add(g, 'rect', { x: 104, y: 160, width: 12, height: 130, fill: '#6E4B33' });
      for (let k = 0; k < 14; k++) add(g, 'path', { d: `M110 ${160 + (k % 3) * 6} Q${60 + k * 8} 170 ${50 + k * 10} ${250 + (k % 4) * 8}`, stroke: '#7FB35B', 'stroke-width': 3, fill: 'none' });
    },
  },
  amusement: {
    slot: 'back',
    draw(g) {
      add(g, 'path', { d: 'M60 220 Q140 80 220 190 T400 120 T560 210', stroke: '#E8590C', 'stroke-width': 6, fill: 'none' });
      for (let x = 80; x < 560; x += 40) add(g, 'line', { x1: x, y1: 230, x2: x, y2: 170 - Math.sin(x / 50) * 40, stroke: '#ADB5BD', 'stroke-width': 3 });
    },
  },
};

/** 낱말 → 특징 그림(이름과 소개 글에서 찾는다). 앞의 것이 먼저다. */
const RULES = [
  [/등대/, 'lighthouse'],
  [/케이블카/, 'cablecar'],
  [/대장경/, 'scripture'],
  [/석탑|다층|칠층|구층|오층|삼층|석불|불탑/, 'pagoda'],
  [/석등/, 'stoneLantern'],
  [/불상|부처/, 'buddha'],
  [/종(을|이|은)? |범종|종각/, 'bell'],
  [/현수교|광안대교|이순신대교/, 'suspensionBridge'],
  [/사장교|대교|다리/, 'cableBridge'],
  [/풍차/, 'windmill'],
  [/공룡/, 'dinosaur'],
  [/거북선/, 'turtleShip'],
  [/이순신|동상|장군/, 'statue'],
  [/녹차|차밭|다원/, 'teaRows'],
  [/갈대/, 'reeds'],
  [/두루미|철새|새가|새들/, 'cranes'],
  [/대나무|죽녹원|대숲/, 'bamboo'],
  [/메타세쿼이아|가로수/, 'treeAvenue'],
  [/다랭이|계단식/, 'terraces'],
  [/염전|소금/, 'saltPans'],
  [/고인돌/, 'dolmen'],
  [/우주|발사|로켓|나로호|누리호/, 'rocket'],
  [/천문대|망원경/, 'telescope'],
  [/관람차|놀이공원|패밀리랜드/, 'ferrisWheel'],
  [/기차마을|증기기관차/, 'steamTrain'],
  [/벽화/, 'mural'],
  [/연꽃|백련/, 'lotus'],
  [/동백/, 'camellia'],
  [/매화|매실/, 'plum'],
  [/벚꽃/, 'cherry'],
  [/절리|돌기둥|입석대|서석대/, 'rockPillars'],
  [/읍성|성벽|성곽|산성/, 'castleWall'],
  [/성문|관아|객사/, 'gate'],
  [/여객선|배로|배를|유람선/, 'ship'],
  [/섬들|다도해/, 'islands'],
  [/펭귄/, 'penguin'],
  [/폭포/, 'waterfall'],
  [/소나무|송림/, 'pine'],
  [/추모탑|기념탑|상징탑/, 'monument'],
  [/묘지|묘역/, 'graves'],
  [/한옥/, 'hanokRoofs'],
  [/항구|포구|어선/, 'boatsHarbor'],
  [/해수욕장|모래사장/, 'umbrellas'],
  [/고분|무덤|왕릉/, 'tumuli'],
  [/청자|도자기|토기|그릇/, 'vase'],
  [/금관|왕관/, 'crown'],
  [/옹기|장독/, 'onggi'],
  [/오리배/, 'swanBoats'],
  [/분수/, 'fountain'],
  [/꽃밭|정원박람회|꽃/, 'flowerBeds'],
  [/운해|구름/, 'cloudSea'],
  [/바닷길/, 'seaPath'],
  [/몽돌|자갈/, 'pebbles'],
  [/시장/, 'lanterns'],
  [/독일/, 'germanHouses'],
  [/과학관|별자리/, 'planet'],
  [/노거수|오래된 나무|숲/, 'oldTrees'],
  [/산이에요|봉우리|국립공원|산맥/, 'mountainPeaks'],
  [/저수지|못이에요|연못/, 'willowPond'],
  [/놀이기구|롤러코스터|테마파크/, 'amusement'],
];

/** 분위기: 낱말 → 하늘·계절 */
const MOODS = [
  [/노을|해넘이|낙조/, 'sunset'],
  [/야경|밤바다|불빛/, 'night'],
  [/해돋이|일출|해가 뜨/, 'dawn'],
  [/단풍|가을/, 'autumn'],
  [/벚꽃|매화|봄/, 'spring'],
  [/눈꽃|겨울/, 'winter'],
];

/**
 * 랜드마크의 모습: 얹을 특징 그림(자리마다 하나)과 분위기. 손으로 정한 것(landmark-looks.json)이 먼저다.
 * @param {{id: string, name: string, facts?: {text: string}[]}} lm
 * @returns {{props: string[], mood: string|null}}
 */
export function looksFor(lm) {
  const manual = looksFile.looks?.[lm.id];
  const text = `${lm.name} ${(lm.facts ?? []).map((f) => f.text).join(' ')}`;
  const BRIDGES = new Set(['suspensionBridge', 'cableBridge']);
  const wanted = (manual?.props ?? RULES.filter(([re]) => re.test(text)).map(([, name]) => name)).filter((name) => !(lm.kind === 'bridge' && BRIDGES.has(name)));
  const taken = new Set();
  const props = [];
  for (const name of wanted) {
    const prop = PROPS[name];
    if (!prop || taken.has(prop.slot)) continue;
    taken.add(prop.slot);
    props.push(name);
  }
  const mood = manual?.mood ?? MOODS.find(([re]) => re.test(text))?.[1] ?? null;
  return { props, mood };
}

/** 분위기 덧칠: 하늘 위에 반투명하게 얹는다 */
export function drawMood(g, mood) {
  const tint = { sunset: ['#FF8C42', 0.35], night: ['#1B2445', 0.55], dawn: ['#FFC9A6', 0.3], autumn: ['#E8A04A', 0.18], spring: ['#FFD6E7', 0.2], winter: ['#E7F1FA', 0.35] }[mood];
  if (!tint) return;
  add(g, 'rect', { x: 0, y: 0, width: 600, height: 320, fill: tint[0], opacity: tint[1] });
  if (mood === 'night') for (let i = 0; i < 24; i++) add(g, 'circle', { cx: (i * 97) % 600, cy: (i * 41) % 110 + 8, r: 1.6, fill: '#FFF9DB' });
  if (mood === 'sunset' || mood === 'dawn') add(g, 'circle', { cx: 120, cy: 150, r: 34, fill: '#FF6B3D', opacity: 0.85 });
  if (mood === 'autumn') for (let i = 0; i < 18; i++) add(g, 'path', { d: `M${(i * 83) % 600} ${(i * 47) % 240 + 40} l5 -4 l5 4 l-5 4 Z`, fill: ['#D9480F', '#F59F00', '#C92A2A'][i % 3], class: 'lm-petals' });
  if (mood === 'spring') for (let i = 0; i < 18; i++) add(g, 'circle', { cx: (i * 71) % 600, cy: (i * 43) % 220 + 20, r: 3, fill: '#FFB3D1', class: 'lm-petals' });
  if (mood === 'winter') for (let i = 0; i < 24; i++) add(g, 'circle', { cx: (i * 59) % 600, cy: (i * 37) % 300, r: 2.5, fill: '#FFFFFF' });
}

/** 이름 안내판: 왼쪽 위에 매단 나무판(앞쪽 그림을 가리지 않게) */
export function drawSign(g, name) {
  const w = Math.min(260, 28 + name.length * 17);
  add(g, 'line', { x1: 30, y1: 0, x2: 30, y2: 14, stroke: '#6E4B33', 'stroke-width': 3 });
  add(g, 'line', { x1: 10 + w, y1: 0, x2: 10 + w, y2: 14, stroke: '#6E4B33', 'stroke-width': 3 });
  add(g, 'rect', { x: 12, y: 12, width: w + 16, height: 34, rx: 6, fill: '#F4E4C1', stroke: '#8C6239', 'stroke-width': 3 });
  add(g, 'text', { x: 20 + w / 2, y: 35, 'font-size': 17, 'font-weight': 800, 'text-anchor': 'middle', fill: '#4A3420', 'font-family': 'sans-serif' }, name);
}
