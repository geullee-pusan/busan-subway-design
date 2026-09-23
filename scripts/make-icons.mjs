// 홈 화면 아이콘을 만든다(npm run icons). 새 라이브러리 없이 픽셀을 직접 칠한다.
// 그림: 진한 남색 바탕에 흰 노선 하나와 역 세 개. 게임 지도와 같은 모양이다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public');

const INK = [0x1f, 0x33, 0x42];
const WHITE = [0xff, 0xff, 0xff];

/** 0~1 자리에 그린 그림. 아이콘 크기에 맞춰 늘린다. */
const LINE = [
  [0.22, 0.72],
  [0.4, 0.5],
  [0.6, 0.5],
  [0.78, 0.28],
];
const STATIONS = [LINE[0], [0.5, 0.5], LINE[3]];
const LINE_WIDTH = 0.085;
const STATION_R = 0.075;

/** 점에서 선분까지의 거리 */
function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 네 귀퉁이가 둥근 네모 안쪽이면 음수. */
function roundedRectDistance(px, py, radius) {
  const qx = Math.abs(px - 0.5) - (0.5 - radius);
  const qy = Math.abs(py - 0.5) - (0.5 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** 거리로 덮인 정도를 구한다(가장자리를 부드럽게). */
function coverage(distance, softness) {
  return Math.max(0, Math.min(1, 0.5 - distance / softness));
}

function blend(target, at, color, alpha) {
  if (alpha <= 0) return;
  for (let i = 0; i < 3; i++) {
    target[at + i] = Math.round(target[at + i] * (1 - alpha) + color[i] * alpha);
  }
  target[at + 3] = Math.round(target[at + 3] * (1 - alpha) + 255 * alpha);
}

/**
 * @param {number} size 한 변의 픽셀 수
 * @param {{rounded?: number, scale?: number}} options
 *   rounded: 바탕 네모의 둥근 정도(0이면 꽉 찬 네모). scale: 그림을 가운데로 얼마나 줄일지.
 */
function drawIcon(size, { rounded = 0.22, scale = 1 } = {}) {
  const rgba = new Uint8Array(size * size * 4);
  const softness = 1.5 / size; // 픽셀 하나 반만큼 부드럽게
  const place = ([x, y]) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale];
  const line = LINE.map(place);
  const stations = STATIONS.map(place);
  const lineWidth = LINE_WIDTH * scale;
  const stationR = STATION_R * scale;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const at = (py * size + px) * 4;
      const x = (px + 0.5) / size;
      const y = (py + 0.5) / size;

      // 바탕
      const background = rounded > 0 ? coverage(roundedRectDistance(x, y, rounded), softness) : 1;
      blend(rgba, at, INK, background);
      if (background <= 0) continue;

      // 노선
      let nearest = Infinity;
      for (let i = 0; i + 1 < line.length; i++) {
        nearest = Math.min(nearest, distanceToSegment(x, y, line[i], line[i + 1]));
      }
      blend(rgba, at, WHITE, coverage(nearest - lineWidth / 2, softness) * background);

      // 역
      for (const [cx, cy] of stations) {
        blend(rgba, at, WHITE, coverage(Math.hypot(x - cx, y - cy) - stationR, softness) * background);
      }
    }
  }
  return rgba;
}

const ICONS = [
  // 홈 화면과 설치 화면에서 쓰는 아이콘
  { file: 'icon-192.png', size: 192, options: { rounded: 0.22 } },
  { file: 'icon-512.png', size: 512, options: { rounded: 0.22 } },
  // 안드로이드가 제 모양대로 잘라 쓰는 아이콘. 가운데 80% 안에만 그린다.
  { file: 'icon-maskable-512.png', size: 512, options: { rounded: 0, scale: 0.68 } },
  // 아이패드·아이폰은 제가 알아서 귀퉁이를 둥글린다.
  { file: 'apple-touch-icon.png', size: 180, options: { rounded: 0 } },
];

mkdirSync(OUT, { recursive: true });
for (const icon of ICONS) {
  const png = encodePng(icon.size, icon.size, drawIcon(icon.size, icon.options));
  writeFileSync(resolve(OUT, icon.file), png);
  console.log(`${icon.file}: ${icon.size}×${icon.size}, ${(png.length / 1024).toFixed(1)}KB`);
}
