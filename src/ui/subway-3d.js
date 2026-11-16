// 지하철 3D 보기: 부산 도시철도 1~4호선과 부산김해경전철. 승강장(아이 눈높이, 안전문), 열차 안, 밖에서(옆·뒤·하늘).
// 칸 치수와 칸 수, 출입문 수는 부산교통공사 전동차 제원(data/facts.json subwayCars)이다. 부산김해경전철은 제원 자료가 없어 어림이다.
// 칠은 부산교통공사 전동차 종이 접기 모형 그림(2011)과 사용자가 보내 준 열차 사진을 보고 특징만 따라 그렸다(로고·글씨는 넣지 않는다).
// 역 사이 길은 두 역 자리를 부드럽게 이은 것이고, 땅속(주소에 "지하")이면 터널, 아니면 고가로 그린다. 터널·고가·역 모양은 우리가 지은 것이다.
import {
  AmbientLight,
  AnimationMixer,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Vector2,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { cellNoise, groundAt } from '../sim/train-3d-path.js';
import { Parts } from './train-3d-cars.js';
import { facadeTexture, Mesher } from './train-3d-station.js';
import { along, lengthOf } from './bus-3d.js';
import { buildHero } from './hero-model.js';
import { stationById } from '../data.js';
import { romanize } from '../sim/romanize.js';
import hanjaFile from '../../data/build/station-hanja.json';

/** 역 한자 이름(자료가 없으면 null). data/build/station-hanja.json, 출처는 data/facts.json stationHanja */
const stationHanja = (id) => hanjaFile.stations?.[id] ?? null;
import heroData from '../content/hero/hero3d.json';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import passengerData from '../content/passengers/passengers.json';

/** 승객 질감 그림 주소(캐릭터 id → 주소) */
const passengerTextures = Object.fromEntries(
  Object.entries(import.meta.glob('../content/passengers/*.webp', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [path.split('/').pop().replace('.webp', ''), url]),
);
import heroTextureUrl from '../content/hero/hero3d.webp';

const SKY = 0xcfe6f5;
const TUNNEL = 0x1c1f22;
const EYE = 1.1;
/** 승강장 안전문까지(선로 가운데에서, 미터) */
const EDGE = 1.75;

/**
 * 노선별 차량. L·W·H(미터)와 칸 수, 한쪽 출입문 수는 부산교통공사 제원(1~4호선).
 * 칠: 바탕(body), 앞판(front), 띠(band, band2), 창 둘레(win).
 */
export const SUBWAY_CARS = {
  1: { L: 17.5, W: 2.75, H: 3.67, cars: 8, doors: 3, body: '#C9CDD2', front: '#B9BEC3', frontTop: '#1F2327', band: '#F07A1A', band2: null, frontBand: '#F07A1A', lower: '#B9BEC3', seat: '#2F5FB8', rubber: false, inside: 'one' },
  // 1호선은 새 차가 두 가지(빨강에 가까운 주황 띠와 주황 띠)라서 편성마다 고른다
  '1b': { L: 17.5, W: 2.75, H: 3.67, cars: 8, doors: 3, body: '#CDD0D4', front: '#D5D8DB', frontTop: '#1F2327', band: '#E8451E', band2: null, frontBand: '#E8451E', lower: '#C2C5C9', seat: '#2F5FB8', rubber: false, inside: 'one' },
  2: { L: 17.5, W: 2.75, H: 3.64, cars: 6, doors: 4, body: '#C5C9CE', front: '#C5C9CE', frontTop: '#2A2E33', band: '#4DB848', band2: '#2E8B3E', frontBand: '#4DB848', lower: '#B8BCC1', seat: '#1F6E73', rubber: false, inside: 'two' },
  3: { L: 17.5, W: 2.75, H: 3.6, cars: 4, doors: 4, body: '#D3CFC6', front: '#D8D5CE', band: '#C8743A', band2: '#F2C230', frontBand: '#C8743A', lower: '#BDB8AE', seat: '#1F3470', rubber: false, inside: 'three' },
  4: { L: 9.14, W: 2.4, H: 3.5, cars: 6, doors: 2, body: '#F2F3F5', front: '#1E2125', band: '#4A7FDB', band2: '#A9C4F0', frontBand: '#3F78D9', lower: '#3A3F45', seat: '#2F5FB8', rubber: true, panel: true, inside: 'four' },
  // 부산김해경전철: 길이·폭·높이와 2칸(Mc-Mc)은 사용자가 붙여 준 제원(data/facts.json subwayCars.BGL, 나무위키로 보임), 한쪽 문 수는 어림
  BGL: { L: 14.0, W: 2.65, H: 3.4, cars: 2, doors: 2, thirdRail: true, body: '#F1F2F2', front: '#1E2125', band: '#E8401C', band2: null, frontBand: '#E8401C', lower: '#6B7076', seat: '#7A3F3A', rubber: false, rim: true, inside: 'bgl' },
  // 동해선(코레일 광역전철): 길이·폭·높이와 4칸(Tc-M'-M'-Tc)은 사용자가 붙여 준 제원(data/facts.json subwayCars.DH), 한쪽 문 수는 어림. 은색 차체, 파란 앞 테두리
  DH: { L: 19.5, W: 3.12, H: 3.75, cars: 4, doors: 4, body: '#C9CDD2', front: '#F2F3F4', band: '#1F4FB5', band2: null, frontBand: '#1F4FB5', lower: '#B9BEC3', seat: '#9A8FA6', rubber: false, rim: true, inside: 'dh' },
  // 대구 1호선: 칠은 사용자가 보내 준 사진(은색 차체, 창 아래 빨간 띠, 앞 유리 둘레 빨강). 길이·폭과 6칸(3M3T)은 사용자가 붙여 준 제원(data/facts.json subwayCars.DG1).
  // 제원의 전고 4,000㎜는 각주가 있어 지붕 위 장치까지로 보고 차체 높이는 3.6m로 둔다(어림). 문 수는 어림(TODO). 역 주소 자료가 없어 땅속으로 그린다(어림)
  DG1: { L: 17.5, W: 2.75, H: 3.6, cars: 6, doors: 4, body: '#C9CDD2', front: '#C9CDD2', frontTop: '#D7262E', band: '#D7262E', band2: '#F2F3F4', frontBand: '#D7262E', lower: '#B9BEC3', seat: '#2257D6', rubber: false, under: true, inside: 'dg1' },
  // 대구 2호선: 칠은 사용자가 보내 준 사진(은색 차체, 창 아래 초록 띠, 앞 전조등 둘레 초록). 길이·폭과 6칸(3M3T)은 사용자가 붙여 준 제원(subwayCars.DG2).
  // 차체 높이(3.6m)와 문 수는 어림(TODO), 땅속으로 그린다(어림)
  DG2: { L: 17.5, W: 2.75, H: 3.6, cars: 6, doors: 4, body: '#C9CDD2', front: '#C9CDD2', frontTop: '#1E2125', band: '#2EAA6B', band2: '#F2F3F4', frontBand: '#2EAA6B', lower: '#B9BEC3', seat: '#5A6FA8', rubber: false, under: true, inside: 'dg2' },
  // 대구 3호선(모노레일): 칠은 사용자가 보내 준 사진(흰 차체, 노란 줄 여러 개, 노란 앞 테두리, 검은 앞 유리). 끝 칸 15.1m·가운데 칸 13.9m, 폭 2.98m, 3칸은 사용자가 붙여 준 제원(subwayCars.DG3). 차체 높이·문 수는 어림(TODO)
  DG3: { L: 15.1, Lmid: 13.9, W: 2.98, H: 3.6, cars: 3, doors: 2, body: '#F2F3F4', front: '#1E2125', band: '#F2C200', band2: '#F2C200', frontBand: '#F2C200', lower: '#9AA0A6', seat: '#9AA0AE', rubber: true, monorail: true, rim: true, stripes: 4, inside: 'dg3' },
  // 대경선(코레일 광역전철): 칠은 사용자가 보내 준 사진(은색 차체, 파란 문, 짙은 남색 지붕선, 파란 앞판). 칸 20.47m·폭 3.12m·지붕 높이 3.75m는 사용자가 붙여 준 제원(subwayCars.DK). 4칸(1M1T 두 묶음)은 사진을 보고 정함, 문 수는 어림(TODO)
  DK: { L: 20.47, W: 3.12, H: 3.75, cars: 4, doors: 4, body: '#B5BBC2', front: '#1F55C8', frontTop: '#1E2125', band: '#1F55C8', band2: null, frontBand: '#1F55C8', lower: '#8C939A', seat: '#EEF0F2', rubber: false, rim: true, doorColor: '#2A5FCC', rimColor: '#1B2A4A', inside: 'dk' },
  // 광주 1호선: 칠은 사용자가 보내 준 사진(은색 차체, 창 아래 청록 띠, 앞 전조등 둘레 청록). 18m×2.75m×3.6m, 4칸(2M2T)은 사용자가 붙여 준 제원(subwayCars.GJ1). 문 수는 어림(TODO), 땅속으로 그린다(어림)
  GJ1: { L: 18, W: 2.75, H: 3.6, cars: 4, doors: 4, body: '#C9CDD2', front: '#C9CDD2', frontTop: '#1E2125', band: '#1BB5A0', band2: '#11695F', frontBand: '#1BB5A0', lower: '#B9BEC3', seat: '#1F5A4A', rubber: false, under: true, inside: 'gj1' },
};

/**
 * 땅속 역 승강장 모양(사용자가 보내 준 승강장 사진을 보고 정함): 1호선은 어두운 천장과 대리석 빛 바닥, 문 앞 점자 블록.
 * 2호선(그리고 나머지)은 밝은 천장, 회색 타일 바닥, 승강장을 따라 이어진 점자 블록, 둥근 타일 기둥.
 */
const STATION_LOOK = {
  1: { ceilStyle: 'slat', wallTile: '#d9d4c9', trackTile: '#d6d36a', wave: '#3B78C8', ceil: '#34383b', floor: '#d8cdb8', pillar: '#e2e0da', round: false, tactileLine: false },
  // 3호선: 밝은 천장, 연회색 타일, 문 앞 점자 블록, 안전문 위 초록 줄, 선로 건너편 짙은 초록 벽
  3: { ceilStyle: 'linear', wallTile: '#ecebe6', trackTile: '#2F6B4A', ceil: '#eceeee', floor: '#d9dbdc', pillar: '#e6e6e2', round: false, tactileLine: false, psdStripe: '#3BAA4A', wall: '#2F6B4A' },
  // 4호선: 밝은 천장, 회색 대리석 바닥, 짙은 회색 안전문 위 틀(파란 노선 줄), 문 앞 점자 블록
  4: { ceilStyle: 'linear', wallTile: '#e6e6e2', trackTile: '#d9dcdf', ceil: '#e6e8ea', floor: '#aeb2b6', pillar: '#e6e6e2', round: false, tactileLine: false, psdHeader: '#2b2f33' },
  // 부산김해경전철(고가역): 천장까지 닿는 높은 유리 안전문, 회색 위 틀, 회색 타일 바닥, 철골 아치 지붕
  BGL: { ceil: '#e6e8ea', floor: '#b7babd', pillar: '#c9ccd0', round: false, tactileLine: false, psdHeader: '#5b6066', psdFull: true, arch: true },
  // 동해선(땅 위 역): 회색 타일 바닥, 둥근 흰 기둥, 밝은 철골 지붕, 회색 안전문 틀에 남색 줄, 돌 의자
  DH: { ceil: '#e6e8ea', floor: '#a8abae', pillar: '#eeeeec', round: true, tactileLine: false, psdHeader: '#b9bdc1', psdStripe: '#1F3F8F', roof: '#d9dcdc', benches: true },
  // 대구 1호선: 흰 안전문 틀에 빨간 줄, 회색 점무늬 타일, 이어진 점자 블록, 둥근 기둥. 대구 2호선: 초록 줄, 반짝이는 연회색 바닥
  DG1: { grout: '#2b2f33', ceilStyle: 'panel', wallTile: '#f2f0ea', trackTile: '#d8d4cc', ceil: '#eceeee', floor: '#c3c5c6', pillar: '#ddd5c8', round: true, tactileLine: true },
  DG2: { grout: '#2b2f33', ceilStyle: 'linear', wallTile: '#f4f2ea', trackTile: '#e4e4e2', ceil: '#eef0f0', floor: '#d3d5d6', pillar: '#eeeeec', round: false, tactileLine: true },
  // 대경선(땅 위 역): 높은 유리 안전문, 회색 틀에 남색 줄, 어두운 철골 지붕, 문 앞 점자 블록
  DK: { ceil: '#e6e8ea', floor: '#b9bcbe', pillar: '#c9ccd0', round: false, tactileLine: false, psdHeader: '#c3c7cb', psdStripe: '#1F3F8F', psdFull: true, roof: '#3a3f45' },
  // 광주 1호선: 청록 안전문 틀, 반짝이는 연회색 바닥, 이어진 점자 블록, 밝은 천장
  GJ1: { ceilStyle: 'panel', wallTile: '#efe9d8', trackTile: '#cfe0e8', ceil: '#eceeee', floor: '#d5d7d8', pillar: '#e6e6e2', round: false, tactileLine: true, psdHeader: '#1F6E73', psdStripe: '#7FC7C0' },
  // 대구 3호선(모노레일 고가역): 흰 아치 지붕, 허리 높이의 낮은 흰 안전문과 노란 문, 밝은 바닥, 이어진 점자 블록
  DG3: { ceil: '#f2f3f3', floor: '#e2e4e5', pillar: '#f2f3f3', round: false, tactileLine: true, psdLow: true, lowDoor: '#F2C200', arch: true, archColor: '#eef0f0' },
  default: { ceilStyle: 'panel', wallTile: '#ece6da', trackTile: '#e8e6e0', ceil: '#e9ebeb', floor: '#c9cbcc', pillar: '#e3d6c4', round: true, tactileLine: true },
};

/** 이 노선을 3D로 보여 줄 수 있는지 */
export const hasSubway3D = (lineId) => Boolean(SUBWAY_CARS[lineId]);

/** 글자판 */
function boardTexture(lines, { bg = '#1F3342', fg = '#ffffff', bar = null, width = 512, height = 128 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  if (bar) {
    g.fillStyle = bar;
    g.fillRect(0, height - 18, width, 18);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = Math.round(((height - (bar ? 18 : 0)) * 0.7) / lines.length);
  g.font = `bold ${size}px sans-serif`;
  lines.forEach((t, i) => g.fillText(t, width / 2, ((height - (bar ? 18 : 0)) * (i + 0.5)) / lines.length + 3, width - 30));
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}


/** 무늬 그림(코드로 그린다): 반복해서 깔 수 있게 */
function tex(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
/** 같은 씨앗이면 같은 수(0~1) */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const shade = (hex, k) => {
  const c = new Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

/**
 * 역 천장 무늬(가로 = 승강장 길이 방향 2.4m, 세로 = 폭 방향 2.4m).
 * slat: 어두운 띠 천장에 긴 등 줄(부산 1호선 사진), panel: 사각 천장판과 사각 등, linear: 흰 판에 긴 등 줄.
 */
function ceilingTexture(style, base) {
  return tex(256, 256, (g, W, H) => {
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    if (style === 'slat') {
      for (let y = 0; y < H; y += 16) {
        g.fillStyle = shade(base, 0.82);
        g.fillRect(0, y, W, 6);
      }
      g.fillStyle = '#fffdf0';
      g.fillRect(0, 118, W, 20);
      g.fillStyle = 'rgba(255,253,240,0.25)';
      g.fillRect(0, 108, W, 40);
    } else {
      // 천장판 줄눈(60cm)
      g.strokeStyle = shade(base, 0.86);
      g.lineWidth = 2;
      for (let p = 0; p <= W; p += 64) {
        g.beginPath();
        g.moveTo(p, 0);
        g.lineTo(p, H);
        g.moveTo(0, p);
        g.lineTo(W, p);
        g.stroke();
      }
      if (style === 'linear') {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 56, W, 14);
        g.fillRect(0, 186, W, 14);
      } else {
        g.fillStyle = '#ffffff';
        g.fillRect(70, 70, 116, 52);
        g.strokeStyle = shade(base, 0.7);
        g.strokeRect(70, 70, 116, 52);
      }
      // 환기구
      g.fillStyle = shade(base, 0.6);
      for (let k = 0; k < 5; k++) g.fillRect(140 + k * 10, 200, 6, 40);
    }
  });
}

/**
 * 역 벽 무늬(가로 12m, 세로 = 벽 높이 1벌). 타일 줄눈, 노선 색 띠, 글씨 없는 밝은 벽 조명판.
 * @param {{tile: string, band: string, ads?: boolean, wave?: string}} p
 */
function wallTexture({ tile, band, ads = true, wave = null, dark = false, grout = null, square = false }) {
  return tex(1024, 512, (g, W, H) => {
    const rnd = seeded(tile.length * 97 + band.length);
    g.fillStyle = tile;
    g.fillRect(0, 0, W, H);
    // 타일(가로 60cm, 세로 30cm): 조금씩 다른 밝기
    const tw = W / (square ? 40 : 20);
    const th = H / (square ? 17 : 17);
    if (grout) {
      g.fillStyle = grout;
      g.fillRect(0, 0, W, H);
    }
    for (let y = 0; y < H; y += th) {
      for (let x = 0; x < W; x += tw) {
        g.fillStyle = shade(tile, 0.94 + rnd() * 0.08);
        g.fillRect(x + 1, y + 1, tw - 2, th - 2);
      }
    }
    // 노선 색 띠(사람 어깨쯤)
    g.fillStyle = band;
    g.fillRect(0, H * 0.52, W, H * 0.035);
    if (wave) {
      // 물결 띠(부산 1호선 건너편 벽 사진)
      g.strokeStyle = wave;
      g.lineWidth = 14;
      g.beginPath();
      for (let x = 0; x <= W; x += 8) g.lineTo(x, H * 0.7 + Math.sin(x / 90) * 18);
      g.stroke();
    }
    if (ads) {
      // 밝은 벽 조명판(글씨와 그림 없음)
      for (const cx of [W * 0.28, W * 0.72]) {
        const w = W * 0.2;
        const h = H * 0.26;
        const x = cx - w / 2;
        const y = H * 0.18;
        g.fillStyle = dark ? '#2b2f33' : '#3a3f45';
        g.fillRect(x - 6, y - 6, w + 12, h + 12);
        const grad = g.createLinearGradient(x, y, x + w, y + h);
        const hue = Math.floor(rnd() * 360);
        grad.addColorStop(0, `hsl(${hue}, 45%, 82%)`);
        grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 50%, 66%)`);
        g.fillStyle = grad;
        g.fillRect(x, y, w, h);
      }
    }
    // 아래 걸레받이
    g.fillStyle = shade(tile, 0.55);
    g.fillRect(0, H - 10, W, 10);
  });
}

/** 바닥 무늬(1.2m 반벌): 타일 줄눈과 돌 점무늬 */
function floorTexture(base) {
  return tex(256, 256, (g, W, H) => {
    const rnd = seeded(base.charCodeAt(1) * 31 + base.charCodeAt(3));
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = shade(base, 0.75 + rnd() * 0.4);
      const r = 0.6 + rnd() * 1.8;
      g.fillRect(rnd() * W, rnd() * H, r, r);
    }
    g.strokeStyle = shade(base, 0.8);
    g.lineWidth = 2;
    g.strokeRect(0, 0, W / 2, H / 2);
    g.strokeRect(W / 2, H / 2, W / 2, H / 2);
    g.strokeRect(W / 2, 0, W / 2, H / 2);
    g.strokeRect(0, H / 2, W / 2, H / 2);
  });
}

/** 땅 위 역 지붕 아래: 철골 보와 지붕판 */
function roofTexture(base) {
  return tex(256, 256, (g, W, H) => {
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(base, 0.86);
    for (let y = 0; y < H; y += 12) g.fillRect(0, y, W, 4);
    g.fillStyle = shade(base, 0.62);
    g.fillRect(0, 0, 18, H);
    g.fillRect(W / 2, 0, 10, H);
  });
}

/**
 * 부산 도시철도 1~4호선 역명판(사용자가 보내 준 역명판 사진을 보고 그림): 가운데 노선 색 테두리의 흰 동그라미에 역 이름,
 * 역 번호(노선 색)와 영어 이름. 양옆 노선 색 띠에 다음 역(왼쪽, 화살표)과 앞 역(오른쪽, 제비꼬리). 한자·일본어는 넣지 않는다.
 * 승강장에서 판을 보면 열차가 가는 쪽이 왼쪽이다.
 */
function busanSignTexture({ name, en, hanja, num, next, nextEn, prev, prevEn, color }) {
  const W = 1024;
  const H = 320;
  return tex(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    const cy = H / 2;
    const band = (x0, x1, arrowLeft) => {
      g.fillStyle = color;
      g.beginPath();
      if (arrowLeft) {
        g.moveTo(x0 + 40, cy - 44);
        g.lineTo(x1, cy - 44);
        g.lineTo(x1, cy + 44);
        g.lineTo(x0 + 40, cy + 44);
        g.lineTo(x0, cy);
      } else {
        g.moveTo(x0, cy - 44);
        g.lineTo(x1, cy - 44);
        g.lineTo(x1 - 34, cy);
        g.lineTo(x1, cy + 44);
        g.lineTo(x0, cy + 44);
      }
      g.closePath();
      g.fill();
    };
    band(20, 400, true);
    band(624, W - 20, false);
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    const side = (ko, roman, cx) => {
      g.textAlign = 'center';
      g.font = 'bold 40px sans-serif';
      g.fillText(ko ?? '', cx, cy - 6, 250);
      g.font = '20px sans-serif';
      g.fillText(roman ?? '', cx, cy + 28, 250);
    };
    if (next) side(next, nextEn, 225);
    if (prev) side(prev, prevEn, 805);
    // 가운데 동그라미
    g.fillStyle = color;
    g.beginPath();
    g.arc(W / 2, cy, 150, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(W / 2, cy, 124, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1d20';
    g.textAlign = 'center';
    g.font = `bold ${name.length > 4 ? 52 : 68}px sans-serif`;
    g.fillText(name.split('').join(name.length <= 3 ? ' ' : ''), W / 2, cy - 30, 230);
    g.font = 'bold 30px sans-serif';
    const numText = num ?? '';
    const enText = en ?? '';
    const numW = g.measureText(numText).width;
    g.font = '28px sans-serif';
    const enW = g.measureText(` ${enText}`).width;
    let x = W / 2 - (numW + enW) / 2;
    g.textAlign = 'left';
    g.font = 'bold 30px sans-serif';
    g.fillStyle = color;
    g.fillText(numText, x, cy + 40);
    x += numW;
    g.font = '28px sans-serif';
    g.fillStyle = '#1b1d20';
    g.fillText(` ${enText}`, x, cy + 40, 230 - numW);
    if (hanja) {
      g.textAlign = 'center';
      g.font = '26px serif';
      g.fillText(hanja, W / 2, cy + 80, 220);
    }
  });
}

/**
 * 대구 1·2호선 역명판(사진): 가로로 긴 흰 판에 앞 역(작게, 회색) → 이번 역(크게) → 다음 역(크게), 아래 노선 색 줄과 번호표.
 * 승강장에서 볼 때 열차가 가는 쪽이 왼쪽이라 다음 역을 왼쪽에 두고 화살표도 왼쪽을 가리킨다.
 */
function daeguSignTexture({ name, en, hanja, num, next, nextEn, nextNum, prev, prevEn, prevNum, color }) {
  return tex(1024, 300, (g, W, H) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#9aa0a6';
    g.lineWidth = 8;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = color;
    g.fillRect(10, H - 70, W - 20, 12);
    const pill = (text, cx) => {
      if (!text) return;
      g.fillStyle = '#2b2f33';
      g.beginPath();
      g.roundRect?.(cx - 42, H - 86, 84, 40, 20);
      if (!g.roundRect) g.rect(cx - 42, H - 86, 84, 40);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 26px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, cx, H - 66);
    };
    const arrow = (cx) => {
      g.fillStyle = '#2b2f33';
      g.beginPath();
      g.moveTo(cx - 40, 120);
      g.lineTo(cx, 80);
      g.lineTo(cx, 104);
      g.lineTo(cx + 40, 104);
      g.lineTo(cx + 40, 136);
      g.lineTo(cx, 136);
      g.lineTo(cx, 160);
      g.closePath();
      g.fill();
    };
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // 다음 역(왼쪽, 크게)
    if (next) {
      g.fillStyle = '#1b1d20';
      g.font = 'bold 54px sans-serif';
      g.fillText(next, 200, 92, 340);
      g.font = '24px sans-serif';
      g.fillText(nextEn ?? '', 200, 140, 340);
      pill(nextNum, 200);
      arrow(420);
    }
    // 이번 역(가운데)
    g.fillStyle = '#1b1d20';
    g.font = 'bold 62px sans-serif';
    g.fillText(name, 600, 84, 300);
    g.font = '26px sans-serif';
    g.fillText(en ?? '', 600, 134, 300);
    if (hanja) {
      g.font = '28px serif';
      g.fillText(hanja, 600, 172, 300);
    }
    pill(num, 600);
    // 앞 역(오른쪽, 작게 회색)
    if (prev) {
      arrow(790);
      g.fillStyle = '#8a8f95';
      g.font = 'bold 36px sans-serif';
      g.fillText(prev, 910, 96, 190);
      g.font = '20px sans-serif';
      g.fillText(prevEn ?? '', 910, 132, 190);
      pill(prevNum, 910);
    }
  });
}

/** 대구 2·3호선 역명판(사진): 밝은 회색 판, 왼쪽 화살표와 다음 역, 가운데 큰 역 이름 옆에 영어·한자, 오른쪽 앞 역(회색), 아래 얇은 노선 색 줄 */
function daegu2SignTexture({ name, en, hanja, num, next, nextEn, nextNum, prev, prevEn, prevNum, color }) {
  return tex(1024, 220, (g, W, H) => {
    g.fillStyle = '#eef0f1';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#a9aeb3';
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = color;
    g.fillRect(6, H - 22, W - 12, 10);
    g.textBaseline = 'middle';
    // 왼쪽 화살표와 다음 역
    g.fillStyle = '#2b2f33';
    g.beginPath();
    g.moveTo(30, 82);
    g.lineTo(62, 56);
    g.lineTo(62, 72);
    g.lineTo(96, 72);
    g.lineTo(96, 92);
    g.lineTo(62, 92);
    g.lineTo(62, 108);
    g.closePath();
    g.fill();
    g.textAlign = 'left';
    if (next) {
      g.font = 'bold 34px sans-serif';
      g.fillText(next, 112, 66, 170);
      g.font = '18px sans-serif';
      g.fillText(nextEn ?? '', 112, 100, 170);
      if (nextNum) g.fillText(String(nextNum), 112, 130);
    }
    g.fillStyle = color;
    g.fillRect(296, 40, 4, 110);
    g.fillStyle = '#1b1d20';
    g.font = 'bold 58px sans-serif';
    g.fillText(name, 320, 78, 300);
    const nameW = Math.min(300, g.measureText(name).width);
    g.font = '28px sans-serif';
    g.fillText(en ?? '', 340 + nameW, 66, 330 - nameW);
    if (hanja) {
      g.font = '28px serif';
      g.fillText(hanja, 340 + nameW, 104, 330 - nameW);
    }
    if (num) {
      g.fillStyle = '#5b6066';
      g.beginPath();
      g.roundRect?.(330, 124, 80, 34, 17);
      if (!g.roundRect) g.rect(330, 124, 80, 34);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 24px sans-serif';
      g.textAlign = 'center';
      g.fillText(String(num), 370, 142);
    }
    if (prev) {
      g.textAlign = 'right';
      g.fillStyle = '#9aa0a6';
      g.font = 'bold 32px sans-serif';
      g.fillText(prev, W - 40, 66, 230);
      g.font = '18px sans-serif';
      g.fillText(prevEn ?? '', W - 40, 100, 230);
      if (prevNum) g.fillText(String(prevNum), W - 40, 130);
    }
  });
}

/** 동해선·대경선(코레일) 역명판(사진): 파란 세운 판에 큰 역 이름과 영어, 아래에 다음·앞 역, 노란 화살표. 역 번호는 자료가 없어 넣지 않는다 */
function korailSignTexture({ name, en, hanja, next, nextEn, prev, prevEn }) {
  return tex(512, 640, (g, W, H) => {
    g.fillStyle = '#5b6066';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1f5fd6';
    g.fillRect(14, 14, W - 28, H - 120);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${name.length > 4 ? 64 : 92}px sans-serif`;
    g.fillText(name.split('').join(name.length <= 3 ? ' ' : ''), W / 2, 130, W - 60);
    g.font = '36px sans-serif';
    g.fillText(en ?? '', W / 2, 205, W - 60);
    if (hanja) {
      g.font = '30px serif';
      g.fillText(hanja, W / 2, 250, W - 60);
    }
    g.font = 'bold 46px sans-serif';
    if (next) g.fillText(next, 130, 380, 220);
    if (prev) g.fillText(prev, W - 130, 380, 220);
    g.font = '20px sans-serif';
    if (next) g.fillText(nextEn ?? '', 130, 425, 220);
    if (prev) g.fillText(prevEn ?? '', W - 130, 425, 220);
    // 노란 화살표(다음 역 쪽)
    g.fillStyle = '#f2c200';
    g.fillRect(70, 470, W - 110, 18);
    g.beginPath();
    g.moveTo(40, 479);
    g.lineTo(90, 450);
    g.lineTo(90, 508);
    g.closePath();
    g.fill();
  });
}

/** 대경선 역명판(사진): 남색 가로 판, 가운데 큰 역 이름과 영어·한자, 양옆 다음·앞 역, 가로지르는 노란 화살표(다음 역 쪽). 로고는 넣지 않는다 */
function korailWideSignTexture({ name, en, hanja, next, nextEn, prev, prevEn }) {
  return tex(1024, 360, (g, W, H) => {
    g.fillStyle = '#5b6066';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b2f86';
    g.fillRect(10, 10, W - 20, H - 20);
    // 노란 화살표 줄: 오른쪽 위에서 왼쪽 아래로, 끝이 왼쪽(다음 역)
    g.fillStyle = '#f2b400';
    g.beginPath();
    g.moveTo(W - 40, 170);
    g.lineTo(110, 250);
    g.lineTo(110, 268);
    g.lineTo(W - 40, 190);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(60, 266);
    g.lineTo(130, 226);
    g.lineTo(120, 290);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${name.length > 4 ? 70 : 96}px sans-serif`;
    g.fillText(name.split('').join(name.length <= 3 ? ' ' : ''), W / 2, 90, 440);
    g.font = '40px sans-serif';
    g.fillText([en, hanja].filter(Boolean).join('  '), W / 2, 165, 460);
    g.font = 'bold 44px sans-serif';
    if (next) g.fillText(next, 160, 90, 250);
    if (prev) g.fillText(prev, W - 160, 200, 250);
    g.font = '24px sans-serif';
    if (next) g.fillText(nextEn ?? '', 160, 135, 250);
    if (prev) g.fillText(prevEn ?? '', W - 160, 240, 250);
  });
}

/** 광주 1호선 역명판(사진): 가로지르는 청록 띠, 가운데 흰 둥근 판(왼쪽 화살표, 주황 동그라미 번호, 역 이름, 영어), 왼쪽 띠에 다음 역, 오른쪽 띠에 앞 역 */
function gwangjuSignTexture({ name, en, hanja, num, next, nextEn, nextNum, prev, prevEn, prevNum, color }) {
  return tex(1024, 240, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const cy = H / 2;
    g.fillStyle = color;
    g.fillRect(10, cy - 50, W - 20, 100);
    // 가운데 둥근 판
    const pill = (x, y, w, h, fill) => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(x + h / 2, y);
      g.lineTo(x + w - h / 2, y);
      g.arc(x + w - h / 2, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
      g.lineTo(x + h / 2, y + h);
      g.arc(x + h / 2, y + h / 2, h / 2, Math.PI / 2, (Math.PI * 3) / 2);
      g.fill();
    };
    pill(300, 20, 424, 200, color);
    pill(314, 34, 396, 172, '#f4f5f5');
    g.fillStyle = '#1b1d20';
    g.font = 'bold 50px sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText('←', 380, cy - 4);
    const circle = (cx, r, fill, text, ink) => {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(cx, cy - 4, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ink;
      g.font = `bold ${Math.round(r * 0.8)}px sans-serif`;
      g.fillText(String(text ?? ''), cx, cy - 4);
    };
    if (num) circle(460, 34, '#E89A2C', num, '#ffffff');
    g.fillStyle = '#1b1d20';
    g.textAlign = 'left';
    g.font = 'bold 46px sans-serif';
    g.fillText(name, 504, cy - 18, 200);
    g.font = '18px sans-serif';
    g.fillText([en, hanja].filter(Boolean).join(' '), 504, cy + 26, 200);
    // 왼쪽 띠: 다음 역
    if (next) {
      if (nextNum) circle(70, 24, '#ffffff', nextNum, '#1b1d20');
      g.fillStyle = '#ffffff';
      g.textAlign = 'left';
      g.font = 'bold 36px sans-serif';
      g.fillText(next, 104, cy - 14, 180);
      g.font = '18px sans-serif';
      g.fillText(nextEn ?? '', 104, cy + 22, 180);
    }
    // 오른쪽 띠: 앞 역(작게)
    if (prev) {
      g.textAlign = 'left';
      if (prevNum) circle(752, 18, '#ffffff', prevNum, '#1b1d20');
      g.fillStyle = '#ffffff';
      g.font = 'bold 26px sans-serif';
      g.fillText(prev, 778, cy - 12, 220);
      g.font = '15px sans-serif';
      g.fillText(prevEn ?? '', 778, cy + 16, 220);
    }
  });
}

/** 부산김해경전철 역명판(사진): 세로로 긴 밝은 판, 위에 동그라미 번호, 세로로 쓴 역 이름, 영어 이름 */
function bglSignTexture({ name, en, hanja, num }) {
  return tex(256, 640, (g, W, H) => {
    g.fillStyle = '#efe9dc';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#b9ae95';
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#8a3b8f';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(W / 2, 70, 36, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#1b1d20';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 40px sans-serif';
    g.fillText(String(num ?? ''), W / 2, 72);
    const chars = name.split('');
    const size = chars.length > 4 ? 56 : 84;
    g.font = `bold ${size}px sans-serif`;
    chars.forEach((ch, i) => g.fillText(ch, W / 2, 170 + i * (size + 14)));
    if (hanja) {
      g.font = '30px serif';
      g.fillText(hanja, W / 2, H - 110, W - 30);
    }
    g.font = 'bold 30px sans-serif';
    g.fillText(en ?? '', W / 2, H - 60, W - 30);
  });
}

/** 전동차 한 칸(+x가 앞, +z가 승강장 쪽). head: 앞이 운전실, tail: 뒤가 운전실 */
function carMesh(spec, material, { head = false, tail = false } = {}) {
  const { L, W, H } = spec;
  const parts = new Parts();
  const GLASS = '#1a232c';
  const x0 = -L / 2;
  const x1 = L / 2;
  const floor = spec.rubber ? 0.95 : 1.1;
  const wb = floor + 0.85; // 창 아래
  const wt = floor + 1.95; // 창 위
  // 몸통
  parts.box(L, H - 0.55, W, 0, 0.55 + (H - 0.55) / 2, 0, spec.body);
  parts.box(L, 0.45, W - 0.3, 0, 0.55 + 0.2, 0, spec.lower); // 아래 치마
  parts.box(L - 0.4, 0.12, W - 0.2, 0, H + 0.05, 0, '#9EA4AA'); // 지붕
  parts.box(2.6, 0.32, 1.6, 0, H + 0.25, 0, '#B9BEC3'); // 냉방기
  // 문 자리(한쪽 doors개, 칸을 고르게 나눈다)
  const doorXs = [];
  for (let i = 0; i < spec.doors; i++) doorXs.push(x0 + (L * (i + 0.5)) / spec.doors);
  for (const side of [-1, 1]) {
    const z = side * (W / 2 + 0.01);
    // 띠
    if (spec.panel) {
      // 4호선: 창 둘레 파란 판, 그 아래 연한 파랑
      parts.box(L - 1.2, wt - wb + 0.3, 0.03, 0, (wb + wt) / 2, z + side * 0.005, spec.band);
      parts.box(L - 1.2, wb - floor + 0.2, 0.03, 0, (floor + wb) / 2 - 0.05, z + side * 0.005, spec.band2);
    } else {
      parts.box(L, 0.22, 0.03, 0, wb - 0.15, z + side * 0.005, spec.band);
      if (spec.band2) parts.box(L, 0.08, 0.03, 0, wb - 0.34, z + side * 0.005, spec.band2);
      if (spec.rim) parts.box(L, spec.rimColor ? 0.35 : 0.1, 0.03, 0, H - (spec.rimColor ? 0.2 : 0.1), z + side * 0.005, spec.rimColor ?? spec.band);
      // 모노레일: 창 아래 노란 줄 여러 개
      for (let k = 1; k < (spec.stripes ?? 0); k++) parts.box(L * 0.7, 0.07, 0.03, -L * 0.1, wb - 0.15 - k * 0.18, z + side * 0.006, spec.band);
    }
    // 창(문 사이)
    for (let i = 0; i <= spec.doors; i++) {
      const a = i === 0 ? x0 + 0.6 : doorXs[i - 1] + 0.75;
      const b = i === spec.doors ? x1 - 0.6 : doorXs[i] - 0.75;
      if (b - a < 0.6) continue;
      parts.box(b - a - 0.2, wt - wb - 0.1, 0.04, (a + b) / 2, (wb + wt) / 2, z + side * 0.01, GLASS);
    }
    // 반대쪽 문은 닫힌 모양
    // 반대쪽 문은 닫힌 모양
    if (side < 0) for (const dx of doorXs) parts.box(1.3, wt - floor + 0.05, 0.04, dx, (floor + wt + 0.05) / 2, z - 0.02, spec.doorColor ?? '#8C9399');
  }
  // 운전실 앞모습
  const cab = (sx) => {
    const fx = sx > 0 ? x1 : x0;
    parts.box(0.08, H - 0.55, W, fx + sx * 0.04, 0.55 + (H - 0.55) / 2, 0, spec.front);
    if (spec.frontTop) parts.box(0.07, 1.5, W, fx + sx * 0.07, floor + 1.5, 0, spec.frontTop); // 앞 유리 둘레
    parts.box(0.06, 1.1, W - 0.5, fx + sx * 0.09, floor + 1.45, 0, GLASS); // 앞 유리
    parts.box(0.06, spec.panel ? 0.5 : 0.42, W, fx + sx * 0.1, floor + 0.65, 0, spec.frontBand); // 앞 띠
    if (spec.rim) for (const s of [-1, 1]) parts.box(0.09, H - 0.7, 0.18, fx + sx * 0.08, 0.55 + (H - 0.7) / 2, s * (W / 2 - 0.09), spec.band); // 빨간 테두리
    if (spec.panel) parts.box(0.09, 0.45, W, fx + sx * 0.08, 0.75, 0, spec.band); // 파란 앞 범퍼
    for (const s of [-1, 1]) parts.box(0.05, 0.16, 0.3, fx + sx * 0.14, floor + 0.62, s * (W / 2 - 0.45), sx > 0 ? '#f6f2d8' : '#c8302a');
    parts.box(0.06, 0.25, 0.9, fx + sx * 0.1, H - 0.35, 0, '#111316'); // 행선 표시
  };
  if (head) cab(1);
  if (tail) cab(-1);
  // 바퀴(쇠바퀴 또는 고무바퀴)
  for (const ax of spec.monorail ? [] : [x0 + L * 0.18, x1 - L * 0.18]) {
    for (const d of spec.rubber ? [0] : [-0.9, 0.9]) {
      for (const s of [-1, 1]) {
        const r = spec.rubber ? 0.48 : 0.42;
        const g = new CylinderGeometry(r, r, spec.rubber ? 0.3 : 0.12, 14);
        g.rotateX(Math.PI / 2);
        g.translate(ax + d, r, s * (spec.rubber ? W / 2 - 0.35 : 0.72));
        parts.add(g, spec.rubber ? '#25272a' : '#4a4f55');
      }
    }
    parts.box(2.6, 0.3, W - 0.4, ax, 0.62, 0, '#30343a'); // 대차
  }
  const group = new Group();
  group.add(new Mesh(parts.geometry(), material));
  // 승강장 쪽 문짝(따로 움직인다): 두 짝 미닫이
  const doors = [];
  const doorMat = new MeshLambertMaterial({ color: spec.doorColor ?? spec.body });
  for (const dx of doorXs) {
    for (const s of [-1, 1]) {
      const m = new Mesh(new BoxGeometry(0.65, wt - floor + 0.05, 0.05), doorMat);
      const base = [dx + s * 0.33, (floor + wt + 0.05) / 2, W / 2 + 0.03];
      m.position.set(...base);
      group.add(m);
      doors.push({ mesh: m, base, s });
    }
  }
  return { group, doors, doorXs, floor, wb, wt, doorMat };
}

/**
 * 열차 안 색과 손잡이 모양. 사용자가 보내 준 차 안 사진(1·2·3호선)을 보고 정했다.
 * 1호선: 흰 점무늬 파란 의자, 주황 세모 손잡이, 하늘색 바닥. 2호선: 점무늬 청록 의자, 파란 둥근 손잡이, 연청록 바닥.
 * 3호선: 점무늬 남색 의자, 민트 세모 손잡이, 청록 바닥, 천장 가운데 안내 화면. 모두 은색 기둥, 흰 벽, 의자 끝 흰 칸막이.
 * 4호선: 흰 새 무늬 파란 의자, 파란 세모 손잡이. 부산김해경전철: 한 자리씩 나뉜 적갈색 의자. 동해선: 연보라빛 회색 의자, 흰 손잡이. 나머지 노선은 노란 기둥과 노란 손잡이(우리가 정한 값).
 */
const INSIDE = {
  one: { pole: '#C9CDD2', strap: '#F0601E', shape: 'triangle', floor: '#9FC1D9', wall: '#F2F3F3', partition: '#F4F5F5', dots: '#E8EEF8' },
  two: { pole: '#C9CDD2', strap: '#3B7DD8', shape: 'ring', floor: '#8FC1BE', wall: '#F0F1EE', partition: '#F4F5F5', dots: '#7FB8B4' },
  three: { pole: '#C9CDD2', strap: '#8FD3C8', shape: 'triangle', floor: '#3E8B80', wall: '#F2F3F3', partition: '#F4F5F5', dots: '#3F57A0', screen: true },
  // 4호선: 흰 새 무늬 파란 의자, 파란 세모 손잡이, 밝은 바닥, 옆 칸과 넓게 이어진 통로
  four: { pole: '#C9CDD2', strap: '#3F78D9', shape: 'triangle', floor: '#C6D3D1', wall: '#F2F3F3', partition: '#F4F5F5', dots: '#F2F4F8', wide: true },
  // 부산김해경전철: 한 자리씩 나뉜 적갈색 의자(네모 무늬), 흰 세모 손잡이, 회색 바닥
  bgl: { pole: '#C9CDD2', strap: '#E6E8EA', shape: 'triangle', floor: '#8F938F', wall: '#F2F3F3', partition: '#F4F5F5', dots: '#C9A79A', buckets: true },
  // 동해선: 연보라빛 회색 점무늬 의자, 흰 손잡이, 회색 바닥, 천장 안내 화면
  dh: { pole: '#C9CDD2', strap: '#F2F2F2', shape: 'triangle', floor: '#B9BCBE', wall: '#F2F3F3', partition: '#F4F5F5', dots: '#C9C2D0', screen: true },
  // 대구 1호선: 파란 민무늬 의자, 검은 둥근 손잡이, 회색 바닥. 대구 2호선: 한 자리씩 나뉜 청회색 의자, 붉은 둥근 손잡이
  dg1: { pole: '#C9CDD2', strap: '#2A2D31', shape: 'ring', floor: '#B4B8BC', wall: '#F2F0EA', partition: '#EFEBE2', dots: null },
  dg2: { pole: '#C9CDD2', strap: '#B03A3A', shape: 'ring', floor: '#C9CCCF', wall: '#F2F3F3', partition: '#EEEEEC', dots: null, buckets: true },
  // 대구 3호선: 한 자리씩 나뉜 회색 의자, 흰 둥근 손잡이, 연회색 바닥, 민트색 칸막이
  dg3: { pole: '#C9CDD2', strap: '#E6E8EA', shape: 'ring', floor: '#CDD1D0', wall: '#F4F5F5', partition: '#BFE5DE', dots: null, buckets: true },
  // 대경선: 흰 긴 의자에 자리마다 파란 등받이 판, 회색 세모 손잡이, 회색 바닥, 천장 안내 화면
  dk: { pole: '#C9CDD2', strap: '#B9BEC3', shape: 'triangle', floor: '#9EA3A8', wall: '#F2F3F3', partition: '#F4F5F5', dots: null, pads: '#3F7FD9', screen: true },
  // 광주 1호선: 한 자리씩 나뉜 짙은 초록 의자(흰 칸막이), 흰 세모 손잡이, 반짝이는 회색 바닥, 천장 안내 화면
  gj1: { pole: '#C9CDD2', strap: '#EDEEEE', shape: 'triangle', floor: '#8A9095', wall: '#F2F1EC', partition: '#F2F1EC', dots: null, buckets: true, screen: true },
  default: { pole: '#f2c230', strap: '#f2c230', shape: 'box', floor: '#7d8186', wall: '#e6e8e6', partition: null, dots: null },
};

/** 열차 안: 긴 의자, 손잡이 기둥, 손잡이, 천장 등, 문 위 안내 화면. 칸 하나 */
function carCabin(spec, car, material) {
  const look = INSIDE[spec.inside] ?? INSIDE.default;
  const seats = [];
  const glassPanes = [];
  const leafSpecs = [];
  const { L, W, H } = spec;
  const { floor, wt, doorXs } = car;
  const parts = new Parts();
  const glow = new Parts();
  const iw = W / 2 - 0.08;
  parts.box(L - 0.3, 0.06, iw * 2, 0, floor - 0.03, 0, look.floor);
  parts.box(L - 0.3, 0.05, iw * 2, 0, H - 0.25, 0, '#eef0f1');
  for (const s of [-1, 1]) {
    glow.box(L - 1, 0.02, 0.22, 0, H - 0.28, s * 0.55, '#fffdf2');
    parts.box(L - 0.3, 0.04, 0.04, 0, H - 0.55, s * 0.55, '#c9ccd0');
    for (let x = -L / 2 + 0.6; x < L / 2 - 0.5; x += 0.45) {
      parts.box(0.02, 0.16, 0.02, x, H - 0.65, s * 0.55, look.shape === 'box' ? '#d9dcdf' : look.strap);
      if (look.shape === 'triangle') {
        // 세모 손잡이: 두 빗변과 밑변
        // 위에서 모이고 아래가 벌어진 세모
        for (const sd of [-1, 1]) {
          const g = new BoxGeometry(0.02, 0.13, 0.02);
          g.rotateX(-sd * 0.4);
          g.translate(x, H - 0.79, s * 0.55 + sd * 0.027);
          parts.add(g, look.strap);
        }
        parts.box(0.025, 0.025, 0.12, x, H - 0.855, s * 0.55, look.strap);
      } else if (look.shape === 'ring') {
        // 둥근 손잡이
        const g = new CylinderGeometry(0.07, 0.07, 0.025, 12, 1, true);
        g.rotateX(Math.PI / 2);
        g.translate(x, H - 0.82, s * 0.55);
        parts.add(g, look.strap);
      } else parts.box(0.03, 0.1, 0.1, x, H - 0.78, s * 0.55, look.strap);
    }
    // 벽: 창 아래, 창 위
    parts.box(L - 0.3, car.wb - floor, 0.05, 0, (floor + car.wb) / 2, s * iw, look.wall);
    parts.box(L - 0.3, H - 0.25 - wt, 0.05, 0, (wt + H - 0.25) / 2, s * iw, look.wall);
    // 창(문 사이): 창 사이 벽 기둥과 창틀. 창 너머(승강장 벽)가 창틀 안에서만 보이게 한다
    for (let i = 0; i <= doorXs.length; i++) {
      const a = i === 0 ? -L / 2 + 0.15 : doorXs[i - 1] + 0.72;
      const b = i === doorXs.length ? L / 2 - 0.15 : doorXs[i] - 0.72;
      if (b - a < 0.3) continue;
      const panes = Math.max(1, Math.round((b - a) / 1.6));
      const pw = (b - a) / panes;
      for (let k = 0; k <= panes; k++) parts.box(k === 0 || k === panes ? 0.22 : 0.14, wt - car.wb, 0.06, a + k * pw, (car.wb + wt) / 2, s * iw, look.wall);
      for (let k = 0; k < panes; k++) {
        const cx = a + (k + 0.5) * pw;
        parts.box(pw - 0.1, 0.05, 0.07, cx, car.wb + 0.04, s * (iw - 0.01), '#8c9399');
        parts.box(pw - 0.1, 0.05, 0.07, cx, wt - 0.04, s * (iw - 0.01), '#8c9399');
        glassPanes.push([pw - 0.16, wt - car.wb - 0.1, cx, (car.wb + wt) / 2, s * (iw + 0.01)]);
      }
    }
    // 긴 의자(문 사이)
    for (let i = 0; i <= doorXs.length; i++) {
      const a = i === 0 ? -L / 2 + 0.5 : doorXs[i - 1] + 0.75;
      const b = i === doorXs.length ? L / 2 - 0.5 : doorXs[i] - 0.75;
      if (b - a < 0.8) continue;
      parts.box(b - a, 0.1, 0.45, (a + b) / 2, floor + 0.45, s * (iw - 0.25), spec.seat);
      // 앉을 자리(사람 한 명 0.48m)
      for (let x = a + 0.3; x < b - 0.2; x += 0.48) seats.push({ x, z: s * (iw - 0.3), face: -s });
      parts.box(b - a, 0.45, 0.08, (a + b) / 2, floor + 0.75, s * (iw - 0.04), spec.seat);
      if (look.dots) {
        // 의자 천의 잔점 무늬
        for (let x = a + 0.15; x < b - 0.1; x += 0.3) {
          parts.box(0.035, 0.008, 0.035, x, floor + 0.505, s * (iw - 0.25), look.dots);
          parts.box(0.035, 0.035, 0.008, x + 0.15, floor + 0.82, s * (iw - 0.081), look.dots);
        }
      }
      // 한 자리씩 나뉜 의자(부산김해경전철): 자리 사이 틈
      if (look.buckets) for (let x = a + 0.5; x < b - 0.2; x += 0.5) parts.box(0.04, 0.5, 0.47, x, floor + 0.72, s * (iw - 0.24), look.wall);
      // 자리마다 파란 등받이 판(대경선)
      if (look.pads) for (let x = a + 0.25; x < b - 0.15; x += 0.48) parts.box(0.38, 0.3, 0.02, x, floor + 0.8, s * (iw - 0.085), look.pads);
      // 의자 끝 흰 칸막이
      if (look.partition) for (const x of [a, b]) parts.box(0.05, 0.75, 0.5, x, floor + 0.7, s * (iw - 0.25), look.partition);
      // 의자 끝 기둥
      for (const x of [a, b]) {
        const g = new CylinderGeometry(0.025, 0.025, H - 0.25 - floor, 8);
        g.translate(x, (floor + H - 0.25) / 2, s * (iw - 0.5));
        parts.add(g, look.pole);
      }
    }
    // 차 안에서 본 문: 문짝 두 장(위쪽 창), 가운데 틈, 문틀, 문 앞 바닥 노란 줄(사진의 차 안 문 모습)
    for (const dx of doorXs) {
      const dh = wt - floor + 0.05;
      const zz = s * (iw - 0.02);
      if (s < 0) {
        parts.box(1.3, dh, 0.04, dx, floor + dh / 2, zz, look.doorColor ?? '#c9cdd2');
        parts.box(0.03, dh, 0.05, dx, floor + dh / 2, zz - s * 0.01, '#3a3f45');
        for (const e of [-0.33, 0.33]) parts.box(0.46, 0.85, 0.05, dx + e, wt - 0.5, zz - s * 0.012, '#4a6070');
      } else {
        // 승강장 쪽 문짝은 역에서 열린다(문짝 두 장, 위쪽 창)
        for (const side of [-1, 1]) leafSpecs.push({ x: dx + side * 0.33, y: floor + dh / 2, z: zz, h: dh, side });
      }
      parts.box(1.44, 0.08, 0.06, dx, floor + dh, zz - s * 0.01, '#8c9399');
      for (const e of [-0.7, 0.7]) parts.box(0.07, dh, 0.06, dx + e, floor + dh / 2, zz - s * 0.01, '#8c9399');
      parts.box(1.3, 0.01, 0.12, dx, floor + 0.006, s * (iw - 0.12), '#e8b92a');
    }
    // 문 위 안내 화면(노선 색 테두리)
    for (const dx of doorXs) {
      glow.box(0.7, 0.18, 0.03, dx, wt + 0.15, s * (iw - 0.03), '#ffb347');
      parts.box(0.8, 0.26, 0.04, dx, wt + 0.15, s * (iw - 0.01), spec.band);
    }
  }
  if (look.screen) {
    parts.box(0.06, 0.45, 1.3, 0, H - 0.55, 0, '#2a2e33');
    glow.box(0.07, 0.36, 0.55, 0.01, H - 0.55, -0.32, '#9fd0e8');
    glow.box(0.07, 0.36, 0.55, 0.01, H - 0.55, 0.32, '#e8f1f4');
  }
  // 칸 끝 벽(통로 문)
  for (const ex of [-L / 2 + 0.12, L / 2 - 0.12]) {
    // 넓은 통로(4호선)는 가운데를 비운다
    if (look.wide) for (const z of [-1, 1]) parts.box(0.06, H - 0.3 - floor, iw - 0.75, ex, (floor + H - 0.3) / 2, z * (iw / 2 + 0.375), '#d9dcdd');
    else parts.box(0.06, H - 0.3 - floor, iw * 2, ex, (floor + H - 0.3) / 2, 0, '#d9dcdd');
    if (!look.wide) parts.box(0.07, 1.8, 0.8, ex, floor + 0.95, 0, '#8C9399');
  }
  const group = new Group();
  group.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), new MeshBasicMaterial({ vertexColors: true })));
  // 움직이는 문짝
  const leafMat = new MeshLambertMaterial({ color: look.doorColor ?? '#c9cdd2' });
  const leafGlass = new MeshLambertMaterial({ color: '#4a6070' });
  const leaves = leafSpecs.map((l) => {
    const m = new Mesh(new BoxGeometry(0.65, l.h, 0.04), leafMat);
    m.position.set(l.x, l.y, l.z);
    const w = new Mesh(new BoxGeometry(0.46, 0.85, 0.02), leafGlass);
    w.position.set(0, wt - 0.5 - l.y, -0.02);
    m.add(w);
    group.add(m);
    return { mesh: m, x: l.x, side: l.side };
  });
  // 옅은 유리(창 너머가 조금 어둡게 보인다)
  const glassMat = new MeshBasicMaterial({ color: 0x2a3a46, transparent: true, opacity: 0.35, depthWrite: false });
  for (const [w, h, x, y, z] of glassPanes) {
    const g = new Mesh(new PlaneGeometry(w, h), glassMat);
    g.position.set(x, y, z);
    g.rotation.y = z > 0 ? Math.PI : 0;
    group.add(g);
  }
  return {
    group,
    eye: new Vector3(-L * 0.3, floor + EYE + 0.25, 0.15),
    look: new Vector3(L / 2, floor + 1.05, 0.0),
    hero: { x: -L * 0.3 + 2.2, y: floor, z: 0.05 },
    seats,
    floor,
    L,
    leaves,
    doorXs,
    iw,
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && o.material !== material) o.material.dispose();
      });
    },
  };
}

/**
 * 지하철 3D 보기를 만든다. 만들 수 없으면 오류를 던진다(부르는 쪽이 그림으로 돌아간다).
 * @param {{grid: object, lineId: string, color: string, stops: Array<{id: string, name: string, x: number, y: number, under: boolean}>,
 *   variant?: number, reduceMotion?: boolean}} p stops: 탈 노선의 역들(가는 차례), x·y는 격자 km
 */
export function createSubway3D({ grid, lineId, color = '#1F3342', stops: stopList, variant = 0, crowd = 0.5, carPeople: carPeopleStart = null, reduceMotion = false }) {
  /** 이 칸(가운데 칸)에 탄 사람 수와 다음 역의 승하차(역 정보, 칸 하나 몫). 없으면 어림 */
  let carPeople = carPeopleStart;
  let flow = null;
  const spec = SUBWAY_CARS[lineId === '1' && variant % 2 ? '1b' : lineId];
  const look = STATION_LOOK[lineId] ?? STATION_LOOK.default;
  if (!spec) throw new Error(`3D 차량이 없는 노선: ${lineId}`);
  // 주소 자료가 없는 노선은 노선 값(spec.under)을 쓴다
  const stops = stopList.map((st) => (spec.under && !st.under ? { ...st, under: true } : st));
  const el = document.createElement('div');
  el.className = 'tr3d';
  const canvas = document.createElement('canvas');
  canvas.className = 'tr3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '지하철 3D 그림');
  el.append(canvas);
  const overlay = document.createElement('div');
  overlay.className = 'tr3d-overlay';
  const displayBox = document.createElement('div');
  displayBox.className = 'tr3d-display';
  overlay.append(displayBox);
  el.append(overlay);

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 250, 1100);
  const camera = new PerspectiveCamera(58, 16 / 10, 0.05, 2500);
  const hemi = new HemisphereLight(0xf4f8ff, 0xb9b3a6, 1.4);
  scene.add(hemi, new AmbientLight(0xffffff, 0.3));
  const sun = new DirectionalLight(0xffffff, 1.7);
  sun.position.set(-0.4, 1, 0.3);
  scene.add(sun);
  const material = new MeshLambertMaterial({ vertexColors: true });
  const glowMat = new MeshBasicMaterial({ vertexColors: true });
  const glassMat = new MeshLambertMaterial({ color: 0x9fc3d6, transparent: true, opacity: 0.35, side: DoubleSide });
  const lowDoorMat = new MeshLambertMaterial({ color: look.lowDoor ?? '#f4f5f5' });
  const facadeMats = new Map();
  const textures = [];

  // 열차: 칸 N개
  const N = spec.cars;
  const GAP = 0.6;
  // 칸마다 길이: 끝 칸 spec.L, 가운데 칸 spec.Lmid(없으면 같은 길이)
  const lens = Array.from({ length: N }, (_, i) => (i === 0 || i === N - 1 ? spec.L : spec.Lmid ?? spec.L));
  const offs = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b + GAP, 0)); // 머리에서 칸 앞까지(미터)
  const trainLen = lens.reduce((a, b) => a + b, 0) + (N - 1) * GAP;
  const cars = [];
  for (let i = 0; i < N; i++) {
    const c = carMesh({ ...spec, L: lens[i] }, material, { head: i === 0, tail: i === N - 1 });
    scene.add(c.group);
    cars.push(c);
  }
  const cabinIndex = Math.floor(N / 2);
  const cabin = carCabin({ ...spec, L: lens[cabinIndex] }, cars[cabinIndex], material);
  cabin.group.visible = false;
  cars[cabinIndex].group.add(cabin.group);

  // 주인공
  const heroImage = new Image();
  const hero = buildHero(heroData, heroImage);
  heroImage.onload = () => hero.root.traverse((o) => o.material?.map && (o.material.map.needsUpdate = true));
  heroImage.src = heroTextureUrl;
  hero.root.scale.setScalar(1.25);
  const mixer = new AnimationMixer(hero.root);
  let heroAction = mixer.clipAction(hero.clips.idle);
  heroAction.play();
  let heroDone = () => {};
  mixer.addEventListener('finished', () => {
    if (cab.state !== 'stand') return;
    const idle = mixer.clipAction(hero.clips.idle);
    idle.reset().play();
    heroAction.crossFadeTo(idle, 0.4, false);
    heroAction = idle;
    heroDone('stand');
  });

  let origin = [stops[0].x, stops[0].y];
  const W = (x, y) => [(x - origin[0]) * 1000, (y - origin[1]) * 1000];
  const groundY = (x, y) => Math.max(0, groundAt(grid, x, y));

  let world = null;
  let ceiling = null;
  let seg = 0;
  let path = null; // 지금 구간 길(격자 km): 앞 역 앞 0.3km ~ 다음 역 뒤 0.25km
  let pathKm = 0;
  let kmA = 0; // 앞 역 자리
  let kmB = 0; // 다음 역 자리
  let samples = []; // 10m마다 {k, x, z, y, ux, uz, under}
  let posKm = 0; // 열차 머리 자리
  let drive = null;
  let mode = 'platform';
  let outsideMode = 'front';
  let doorAmount = 0;
  let doorTarget = 0;
  let psd = []; // 안전문 짝 {mesh, base, s}
  let platformAt = 0; // 승강장 장면의 역(구간 안 km)
  let raf = 0;
  let last = 0;

  /** 역 k 둘레를 부드럽게 이은 길: k-1(없으면 늘임), k, k+1, k+2 */
  function pathFor(k) {
    const P = (i) => [stops[i].x, stops[i].y];
    const a = P(k);
    const b = P(Math.min(stops.length - 1, k + 1));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    const before = k > 0 ? P(k - 1) : [a[0] - (dx / d) * 0.6, a[1] - (dy / d) * 0.6];
    const after = k + 2 < stops.length ? P(k + 2) : [b[0] + (dx / d) * 0.6, b[1] + (dy / d) * 0.6];
    // 카트멀-롬 곡선으로 before~after 사이를 촘촘히(역 사이 부드럽게)
    const ctrl = [before, a, b, after];
    const ext = [[before[0] * 2 - a[0], before[1] * 2 - a[1]], ...ctrl, [after[0] * 2 - b[0], after[1] * 2 - b[1]]];
    const pts = [];
    for (let s = 1; s < ext.length - 2; s++) {
      const [p0, p1, p2, p3] = [ext[s - 1], ext[s], ext[s + 1], ext[s + 2]];
      for (let t = 0; t < 1; t += 0.05) {
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3);
        pts.push([f(0), f(1)]);
      }
    }
    pts.push(after);
    // 앞 역에서 0.3km 앞부터, 다음 역에서 0.25km 뒤까지만 쓴다
    const total = lengthOf(pts);
    const kmOf = (p) => {
      let best = 0;
      let bestD = Infinity;
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const seg2 = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        for (let t = 0; t <= 1; t += 0.1) {
          const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
          const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
          const dd = Math.hypot(x - p[0], y - p[1]);
          if (dd < bestD) {
            bestD = dd;
            best = acc + seg2 * t;
          }
        }
        acc += seg2;
      }
      return best;
    };
    const ka = kmOf(a);
    const kb = kmOf(b);
    const from = Math.max(0, ka - 0.3);
    const to = Math.min(total, Math.max(kb + 0.25, ka + 0.3));
    const out = [];
    for (let k2 = from; k2 <= to + 1e-9; k2 += 0.01) {
      const q = along(pts, k2);
      out.push([q.x, q.y]);
    }
    return { pts: out, kmA: ka - from, kmB: kb - from };
  }

  // 승객: 캐릭터마다 한 번 조립(틀)하고 복제해서 세운다. 틀의 모양과 재료는 함께 쓰므로 세상을 다시 지어도 치우지 않는다
  const riderKinds = [];
  for (const person of passengerData.people ?? []) {
    const image = new Image();
    const kind = buildHero({ ...person, clips: passengerData.clips ?? [] }, image);
    image.onload = () => kind.root.traverse((o) => o.material?.map && (o.material.map.needsUpdate = true));
    image.src = passengerTextures[person.id] ?? '';
    // 키: 어른은 1.6~1.8m(우리가 정한 값), 틀은 키 1
    riderKinds.push(kind);
  }
  const riderShared = new Set();
  for (const k of riderKinds) k.root.traverse((o) => (o.geometry || o.material) && riderShared.add(o.geometry).add(o.material));
  let riders = []; // {obj, mixer, actions, state, target, speed}
  queueMicrotask(() => seatRiders());

  /** 역(구간 안 km kmS)에 열차를 기다리는 승객을 세운다: 문 자리마다 노란 선 뒤에 줄 선다 */
  function spawnRiders(kmS, count) {
    if (!riderKinds.length || !world) return;
    const headKm = kmS + trainLen / 2000;
    const doorKms = [];
    for (let c = 0; c < N; c++) {
      const centerKm = headKm - (offs[c] + lens[c] / 2) / 1000;
      for (const dx of cars[c].doorXs) doorKms.push(centerKm + dx / 1000);
    }
    // 주인공 자리(문 하나)는 비운다
    const heroKm = kmS + trainLen / 2000 - 0.012;
    // 주인공과 가까운 문부터(아이 눈에 보이는 곳에 사람이 있게)
    const free = doorKms.filter((d) => Math.abs(d - heroKm) > 0.004).sort((x, y) => Math.abs(x - heroKm) - Math.abs(y - heroKm)).slice(0, 4);
    for (let i = 0; i < count && free.length; i++) {
      const d = free[i % free.length];
      const row = Math.floor(i / free.length);
      const side = i % 2 ? 1 : -1;
      const q = sampleAt(d + side * 0.0009);
      if (!q) continue;
      const kind = riderKinds[i % riderKinds.length];
      const obj = cloneSkinned(kind.root);
      const tall = 1.62 + cellNoise(i, seg, 7) * 0.2;
      obj.scale.setScalar(tall);
      const off = EDGE + 1.1 + row * 0.7 + cellNoise(i, 2, 5) * 0.3;
      obj.position.set(q.x + q.rx * off, q.y + 1.0, q.z + q.rz * off);
      // 선로 쪽을 보되 조금씩 다르게
      obj.rotation.y = Math.atan2(-q.rx, -q.rz) + (cellNoise(i, 4, 1) - 0.5) * 0.8;
      world.add(obj);
      const mixer = new AnimationMixer(obj);
      const pick = (name) => kind.clips[name] ?? Object.values(kind.clips)[0];
      const idleNames = Object.keys(kind.clips).filter((n) => n.includes('idle') && !n.includes('sit'));
      const idle = mixer.clipAction(pick(idleNames[i % Math.max(1, idleNames.length)] ?? 'idle'));
      idle.time = cellNoise(i, 9, 3) * (idle.getClip().duration || 1);
      idle.play();
      obj.userData.slot = 100 + i;
      riders.push({ obj, mixer, idle, walk: kind.clips.walking ? mixer.clipAction(kind.clips.walking) : null, state: 'wait', doorKm: d, delay: 0.3 + cellNoise(i, 6, 2) * 1.5 });
    }
  }

  /**
   * 열차 안 긴 의자에 앉은 승객(앉기 동작). 자리는 붐빔(crowd)만큼 채운다(우리가 정한 어림).
   * 앉기 동작의 엉덩이 높이는 Mixamo 의자 높이에 맞춰져 있어 의자 높이(바닥 + 0.45m)에 맞춰 내려 앉힌다.
   */
  const seated = [];
  /**
   * 서 있을 자리(복도): 손잡이 줄 아래, 칸을 따라 0.9m마다 양쪽. 주인공 자리 둘레는 비운다.
   * 서 있는 사람은 화면에 많아야 MAX_STAND명까지 그린다(태블릿 성능, 우리가 정한 값).
   */
  const MAX_STAND = 14;
  const standSpots = [];
  for (let x = -cabin.L / 2 + 1.0; x < cabin.L / 2 - 0.8; x += 0.9) {
    for (const z of [-0.42, 0.42]) {
      if (Math.abs(x - cabin.hero.x) < 0.9) continue;
      standSpots.push({ x, z, stand: true });
    }
  }
  const sitNamesOf = () => Object.keys(riderKinds[0]?.clips ?? {}).filter((n) => n.includes('sit') && !n.includes('stand'));
  const idleNameOf = (kind, i) => {
    const names = Object.keys(kind.clips).filter((n) => n.includes('idle') && !n.includes('sit'));
    return names[i % Math.max(1, names.length)] ?? 'idle';
  };
  /** 이 칸에 한 사람을 둔다(앉을 자리 또는 서 있을 자리) */
  function placeRider(place, i, state = 'seated') {
    const kind = riderKinds[(i * 7 + 3 + nextSlot) % riderKinds.length];
    const obj = cloneSkinned(kind.root);
    obj.scale.setScalar(1.62 + cellNoise(i, 3, 3) * 0.18);
    obj.position.set(place.x, cabin.floor - 0.06, place.z);
    obj.rotation.y = place.stand ? (place.z > 0 ? Math.PI : 0) + (cellNoise(i, 5, 5) - 0.5) * 1.2 : place.face > 0 ? 0 : Math.PI;
    obj.userData.slot = nextSlot++;
    cabin.group.add(obj);
    const sd = { obj, mixer: new AnimationMixer(obj), kind, seat: place, state };
    const clip = place.stand ? kind.clips[idleNameOf(kind, i)] : kind.clips[sitNamesOf()[i % Math.max(1, sitNamesOf().length)]];
    if (clip) {
      sd.action = sd.mixer.clipAction(clip);
      sd.action.time = cellNoise(i, 8, 2) * (clip.duration || 1);
      sd.action.play();
    }
    seated.push(sd);
    return sd;
  }
  /** 내리려는 사람(일어섬, 문으로 감, 문 앞, 나감, 내림)은 자리를 비운 것으로 본다 */
  const leaving = (sd) => ['gone', 'out', 'atDoor', 'toDoor', 'standup'].includes(sd.state);
  function freePlaces() {
    const taken = new Set(seated.filter((sd) => !leaving(sd)).map((sd) => sd.seat));
    const seats = cabin.seats.filter((st) => !taken.has(st) && Math.abs(st.x - cabin.hero.x) > 0.6);
    const spots = standSpots.filter((st) => !taken.has(st));
    return { seats, spots, standing: seated.filter((sd) => !leaving(sd) && sd.seat?.stand).length };
  }
  /** 같은 씨앗이면 같은 차례로 섞는다 */
  const shuffle = (list, salt) => list.map((v, i) => [cellNoise(i, salt, 23), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  function seatRiders() {
    if (!riderKinds.length || !sitNamesOf().length) return;
    // 이 칸 사람 수: 역 정보로 받은 값(carPeople), 없으면 붐빔 어림
    const people = carPeople ?? Math.round(cabin.seats.length * Math.min(0.9, 0.25 + crowd * 0.6));
    const { seats, spots } = freePlaces();
    const sit = Math.min(people, seats.length);
    shuffle(seats, 13).slice(0, sit).forEach((st, i) => placeRider(st, i));
    const stand = Math.min(MAX_STAND, people - sit);
    shuffle(spots, 19).slice(0, Math.max(0, stand)).forEach((st, i) => placeRider(st, i + 50, 'standing'));
  }


  /**
   * 주인공 타기: 승강장에서 기다리다 문이 열리면 사람들과 함께 가장 가까운 문으로 걸어가 탄다(그 뒤로는 승강장에서 보이지 않는다).
   * heroBoard: null(기다림) | {t: 남은 기다림(초)} | {walking: true} | {in: true}
   */
  let heroBoard = null;
  function heroBoardStep(h, dt) {
    const wait = [h.x + h.rx * (EDGE + 1.8), h.y + 1.0, h.z + h.rz * (EDGE + 1.8)];
    if (!heroBoard) {
      hero.root.visible = true;
      hero.root.position.set(...wait);
      hero.root.rotation.set(0, Math.atan2(-h.rx, -h.rz), 0);
      if (doorAmount > 0.9 && hero.clips.walk) heroBoard = { t: reduceMotion ? 0 : 1.4 };
      return;
    }
    if (heroBoard.in) {
      hero.root.visible = false;
      return;
    }
    if (heroBoard.t !== undefined) {
      heroBoard.t -= dt;
      if (heroBoard.t > 0) return;
      // 가장 가까운 문
      const headKm = platformAt + trainLen / 2000;
      let best = null;
      for (let c = 0; c < N; c++) {
        const centerKm = headKm - (offs[c] + lens[c] / 2) / 1000;
        for (const dx of cars[c].doorXs) {
          const km = centerKm + dx / 1000;
          if (!best || Math.abs(km - h.k) < Math.abs(best - h.k)) best = km;
        }
      }
      const d = sampleAt(best ?? h.k);
      heroBoard = { walking: true, path: [[d.x + d.rx * (EDGE + 1.0), d.z + d.rz * (EDGE + 1.0)], [d.x + d.rx * (EDGE - 0.8), d.z + d.rz * (EDGE - 0.8)]], leg: 0 };
      const walk = mixer.clipAction(hero.clips.walk);
      walk.reset().setLoop(LoopRepeat, Infinity).play();
      heroAction.crossFadeTo(walk, 0.3, false);
      heroAction = walk;
      return;
    }
    if (heroBoard.walking) {
      const [tx, tz] = heroBoard.path[heroBoard.leg];
      const dx = tx - hero.root.position.x;
      const dz = tz - hero.root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) {
        heroBoard.leg += 1;
        if (heroBoard.leg >= heroBoard.path.length) heroBoard = { in: true };
        return;
      }
      const step = Math.min(dist, 1.1 * dt);
      hero.root.position.x += (dx / dist) * step;
      hero.root.position.z += (dz / dist) * step;
      hero.root.rotation.y = Math.atan2(dx, dz);
    }
  }

  /** 동작 하나 틀기: 서 있기·앉아 있기·걷기는 되풀이, 나머지는 한 번 */
  function playClip(id, { fade = 0.3 } = {}) {
    const clip = hero.clips[id] ?? hero.clips.idle;
    const next = mixer.clipAction(clip);
    next.reset();
    if (id === 'stand' || id === 'sit' || id === 'walk' || clip === hero.clips.idle) next.setLoop(LoopRepeat, Infinity);
    else {
      next.setLoop(LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    next.play();
    if (heroAction !== next) heroAction.crossFadeTo(next, fade, false);
    heroAction = next;
    return next;
  }

  /**
   * 열차 안 주인공 차례: 'stand'(복도 제자리) → 'toSeat'(걸어감) → 'sitdown'(앉는 동작) → 'seated'
   *   → 'standup'(일어서는 동작) → 'toSpot'(제자리로 걸어감) → 'stand'. after: 일어선 뒤 할 동작.
   * 앉는 높이: 의자 위에 엉덩이가 오도록 매 장면 엉덩이 뼈 높이를 재서 몸을 올린다.
   */
  const cab = { state: 'stand', seat: null, after: 'stand', lift: 0 };
  const hipBone = (() => {
    let b = null;
    hero.root.traverse((o) => {
      if (!b && o.isBone && /Hips$/.test(o.name)) b = o;
    });
    return b;
  })();
  const SEAT_HIP = 0.5; // 의자 윗면(0.45m) 위 엉덩이 높이(미터, 어림)
  function cabinRequest(id) {
    if (id === 'sit') {
      if (cab.state !== 'stand') return;
      cab.seat = cabin.seats.find((st) => Math.abs(st.x - cabin.hero.x) < 0.6) ?? cabin.seats[0];
      cab.state = 'toSeat';
      playClip(hero.clips.walk ? 'walk' : 'stand');
      return;
    }
    cab.after = id;
    if (cab.state === 'seated') {
      cab.state = 'standup';
      playClip(hero.clips.standup ? 'standup' : 'stand');
    }
  }
  /** 걸어서 (x, z)로. 다 오면 true */
  function walkTo(x, z, dt) {
    const p = hero.root.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, (reduceMotion ? 99 : 0.9) * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    hero.root.rotation.y = Math.atan2(dx, dz);
    return false;
  }
  /** 제자리에서 target(라디안)으로 돈다: 왼쪽·오른쪽 돌기 발걸음을 하며 몸을 천천히 돌린다. 다 돌면 true */
  function turnTo(target, dt) {
    let d = target - hero.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 0.03) {
      hero.root.rotation.y = target;
      return true;
    }
    const want = d > 0 ? 'turnL' : 'turnR';
    if (hero.clips[want] && heroAction.getClip() !== hero.clips[want]) playClip(want, { fade: 0.15 }).setLoop(LoopRepeat, Infinity);
    hero.root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), (reduceMotion ? 99 : 2.2) * dt);
    return false;
  }
  function cabinStep(dt) {
    if (mode !== 'cabin') return;
    const seatFront = () => [cab.seat.x, cab.seat.z + cab.seat.face * 0.35];
    const faceAisle = () => (cab.seat.face > 0 ? 0 : Math.PI);
    if (cab.state === 'toSeat') {
      const [x, z] = seatFront();
      if (walkTo(x, z, dt)) cab.state = 'turnSeat';
    } else if (cab.state === 'turnSeat') {
      if (turnTo(faceAisle(), dt)) {
        cab.state = 'sitdown';
        const a = playClip(hero.clips.sitdown ? 'sitdown' : 'sit', { fade: 0.2 });
        cab.action = a;
      }
    } else if (cab.state === 'sitdown') {
      // 앉는 동안 의자 쪽으로 조금 물러난다
      const a = cab.action;
      const u = Math.min(1, a.time / (a.getClip().duration || 1));
      hero.root.position.z = cab.seat.z + cab.seat.face * 0.35 * (1 - u);
      if (u >= 0.999 || !hero.clips.sitdown) {
        cab.state = 'seated';
        playClip('sit', { fade: 0.25 });
      }
    } else if (cab.state === 'standup') {
      const a = heroAction;
      const u = Math.min(1, a.time / (a.getClip().duration || 1));
      hero.root.position.z = cab.seat.z + cab.seat.face * 0.35 * u;
      if (u >= 0.999 || !hero.clips.standup) {
        cab.state = 'toSpot';
        playClip(hero.clips.walk ? 'walk' : 'stand', { fade: 0.2 });
      }
    } else if (cab.state === 'toSpot') {
      if (walkTo(cabin.hero.x, cabin.hero.z, dt)) cab.state = 'turnSpot';
    } else if (cab.state === 'turnSpot') {
      if (turnTo(-Math.PI / 2, dt)) {
        cab.state = 'stand';
        playClip(cab.after === 'sit' ? 'stand' : cab.after);
        heroDone(cab.after === 'sit' ? 'stand' : cab.after);
      }
    }
    // 엉덩이를 의자 높이에: 앉는 중·앉아 있는 중·일어서는 중
    let want = 0;
    if (hipBone && (cab.state === 'sitdown' || cab.state === 'seated' || cab.state === 'standup')) {
      hero.root.updateMatrixWorld(true);
      const hipY = hipBone.getWorldPosition(new Vector3()).y;
      const g = cars[cabinIndex].group;
      g.updateMatrixWorld(true);
      const floorY = new Vector3(0, cabin.floor, 0).applyMatrix4(g.matrixWorld).y;
      const sitDepth = cab.state === 'seated' ? 1 : Math.min(1, heroAction.time / (heroAction.getClip().duration || 1));
      const k = cab.state === 'standup' ? 1 - sitDepth : sitDepth;
      want = Math.max(0, floorY + SEAT_HIP - (hipY - cab.lift)) * k;
    }
    cab.lift += (want - cab.lift) * Math.min(1, dt * 12);
    hero.root.position.y = cabin.hero.y + cab.lift;
  }

  /**
   * 열차 안 승객이 역마다 내리고 탄다.
   * 떠날 때(driveTo): 다음 역에서 내릴 사람을 고르고, 그 사람은 달리는 동안 미리 일어나 승강장 쪽 문 앞에 가서 선다.
   * 문이 열리면: 내릴 사람이 문으로 나가고, 조금 뒤 새 사람이 문으로 들어와 빈자리에 가서 앉는다.
   * 승객 차례(state): seated → standup → toDoor → atDoor → out(사라짐) / in → toSeat → turn → sitdown → seated
   */
  let nextSlot = 1000;
  function riderPlay(sd, name, loop) {
    const clip = sd.kind.clips[name];
    if (!clip) return null;
    const a = sd.mixer.clipAction(clip);
    a.reset();
    a.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.play();
    if (sd.action && sd.action !== a) sd.action.crossFadeTo(a, 0.25, false);
    sd.action = a;
    return a;
  }
  const doorSpot = (dx) => ({ x: dx, z: cabin.iw - 0.55 });
  function nearestDoor(x) {
    return cabin.doorXs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  }
  /**
   * 다음 역에서 내릴 사람을 정한다. 내리는 비율은 역 정보(flow.off ÷ flow.before)로, 없으면 4분의 1쯤(우리가 정한 어림).
   * 앉은 사람은 일어나서, 서 있는 사람은 바로 문 앞으로 간다.
   */
  function planAlight() {
    const share = flow && flow.before > 0 ? Math.min(1, flow.off / flow.before) : 0.28;
    const list = seated.filter((sd) => sd.state === 'seated' || sd.state === 'standing');
    const n = Math.round(list.length * share);
    shuffle(list, seg * 7 + 3)
      .slice(0, n)
      .forEach((sd, i) => {
        sd.door = nearestDoor(sd.seat.x);
        sd.wait = 0.4 + cellNoise(i, seg, 5) * 1.6;
        if (sd.state === 'standing') {
          sd.state = 'toDoor';
          riderPlay(sd, 'walking', true);
        } else sd.state = 'standup';
      });
  }
  /** 문이 열렸다: 새로 탈 사람(빈자리 수와 붐빔으로) */
  function planBoard() {
    // 내린 사람은 목록에서 뺀다
    for (let i = seated.length - 1; i >= 0; i--) if (seated[i].state === 'gone') seated.splice(i, 1);
    const { seats: freeSeats, spots: freeSpots, standing } = freePlaces();
    const staying = seated.filter((sd) => !['gone', 'out', 'atDoor', 'toDoor', 'standup'].includes(sd.state)).length;
    // 탈 사람 수: 역 정보가 있으면 (이 칸에 남을 사람 - 남아 있는 사람), 없으면 어림
    const want = flow ? Math.max(0, Math.round(flow.after - staying)) : Math.round(1 + crowd * 3 + cellNoise(seg, 3, 9) * 2);
    const sitNames = sitNamesOf();
    const seatsShuffled = shuffle(freeSeats, seg * 5 + 1);
    const spotsShuffled = shuffle(freeSpots, seg * 5 + 2).slice(0, Math.max(0, MAX_STAND - standing));
    const places = [...seatsShuffled, ...spotsShuffled].slice(0, want);
    for (let i = 0; i < places.length; i++) {
      const seat = places[i];
      const kind = riderKinds[(seg * 3 + i * 5) % riderKinds.length];
      const obj = cloneSkinned(kind.root);
      obj.scale.setScalar(1.62 + cellNoise(i, seg, 3) * 0.18);
      const door = nearestDoor(seat.x);
      obj.position.set(door, cabin.floor - 0.06, cabin.iw + 1.2);
      obj.visible = false;
      obj.userData.slot = nextSlot++;
      cabin.group.add(obj);
      const sd = { obj, mixer: new AnimationMixer(obj), kind, seat, door, state: 'in', wait: 1.6 + i * 0.7, sitName: sitNames[i % Math.max(1, sitNames.length)] };
      seated.push(sd);
    }
  }
  function walkRider(sd, x, z, dt) {
    const p = sd.obj.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.06) return true;
    const step = Math.min(dist, 1.0 * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    sd.obj.rotation.y = Math.atan2(dx, dz);
    return false;
  }
  function updateSeated(dt) {
    for (const sd of seated) {
      sd.mixer.update(reduceMotion ? 0 : dt);
      if (sd.state === 'standup') {
        sd.wait -= dt;
        if (sd.wait > 0) continue;
        if (!sd.up) {
          sd.up = riderPlay(sd, 'sit-to-stand', false) ?? true;
          continue;
        }
        if (sd.up === true || sd.up.time >= sd.up.getClip().duration - 0.02) {
          sd.obj.position.z = sd.seat.z + sd.seat.face * 0.35;
          sd.state = 'toDoor';
          riderPlay(sd, 'walking', true);
        }
      } else if (sd.state === 'toDoor') {
        const t = doorSpot(sd.door + (cellNoise(sd.obj.userData.slot, 1, 2) - 0.5) * 0.5);
        if (walkRider(sd, t.x, t.z, dt)) {
          sd.state = 'atDoor';
          sd.obj.rotation.y = 0; // 문(승강장 쪽)을 본다
          riderPlay(sd, Object.keys(sd.kind.clips).find((n) => n.includes('idle') && !n.includes('sit')) ?? 'idle', true);
        }
      } else if (sd.state === 'atDoor') {
        if (doorAmount > 0.9) {
          sd.state = 'out';
          riderPlay(sd, 'walking', true);
        }
      } else if (sd.state === 'out') {
        if (walkRider(sd, sd.door, cabin.iw + 1.4, dt)) {
          sd.state = 'gone';
          sd.obj.removeFromParent();
          sd.mixer.stopAllAction();
        }
      } else if (sd.state === 'in') {
        if (doorAmount < 0.9) continue;
        sd.wait -= dt;
        if (sd.wait > 0) continue;
        if (!sd.obj.visible) {
          sd.obj.visible = true;
          riderPlay(sd, 'walking', true);
        }
        if (walkRider(sd, sd.door, cabin.iw - 0.6, dt)) sd.state = 'toSeat';
      } else if (sd.state === 'toSeat') {
        if (sd.seat.stand) {
          if (walkRider(sd, sd.seat.x, sd.seat.z, dt)) {
            sd.state = 'standing';
            sd.obj.rotation.y = sd.seat.z > 0 ? Math.PI : 0;
            riderPlay(sd, idleNameOf(sd.kind, sd.obj.userData.slot), true);
          }
        } else if (walkRider(sd, sd.seat.x, sd.seat.z + sd.seat.face * 0.35, dt)) sd.state = 'turn';
      } else if (sd.state === 'turn') {
        const target = sd.seat.face > 0 ? 0 : Math.PI;
        let d = target - sd.obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 0.05) {
          sd.obj.rotation.y = target;
          sd.obj.position.z = sd.seat.z;
          sd.state = 'sitdown';
          sd.down = riderPlay(sd, 'stand-to-sit', false);
        } else sd.obj.rotation.y += Math.sign(d) * Math.min(Math.abs(d), 3 * dt);
      } else if (sd.state === 'sitdown') {
        if (!sd.down || sd.down.time >= sd.down.getClip().duration - 0.02) {
          sd.state = 'seated';
          riderPlay(sd, sd.sitName ?? 'sitting', true);
        }
      }
    }
  }

  /** 문이 열리면 기다리던 승객이 문으로 걸어 들어간다 */
  function updateRiders(dt) {
    updateSeated(dt);
    for (const rd of riders) {
      rd.mixer.update(reduceMotion ? 0 : dt);
      if (rd.state === 'wait' && doorAmount > 0.9 && mode !== 'cabin') {
        rd.delay -= dt;
        if (rd.delay <= 0) {
          rd.state = 'board';
          if (rd.walk) {
            rd.walk.reset().play();
            rd.idle.crossFadeTo(rd.walk, 0.3, false);
          }
        }
      } else if (rd.state === 'board') {
        const q = sampleAt(rd.doorKm);
        if (!q) continue;
        const tx = q.x + q.rx * (EDGE - 0.6);
        const tz = q.z + q.rz * (EDGE - 0.6);
        const dx = tx - rd.obj.position.x;
        const dz = tz - rd.obj.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.15) {
          rd.state = 'in';
          rd.obj.visible = false;
          continue;
        }
        const step = Math.min(dist, 1.2 * dt);
        rd.obj.position.x += (dx / dist) * step;
        rd.obj.position.z += (dz / dist) * step;
        rd.obj.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  function disposeWorld() {
    if (!world) return;
    scene.remove(world);
    for (const rd of riders) rd.mixer.stopAllAction();
    riders = [];
    world.traverse((o) => {
      if (riderShared.has(o.geometry) || riderShared.has(o.material)) return;
      o.geometry?.dispose();
      const m = o.material;
      if (m && m !== material && m !== glowMat && m !== glassMat && m !== lowDoorMat && ![...facadeMats.values()].includes(m) && !Object.values(stMats ?? {}).includes(m)) {
        m.map?.dispose();
        m.dispose();
      }
    });
    world = null;
    ceiling = null;
    psd = [];
  }

  function facadeMat(style) {
    if (!facadeMats.has(style)) facadeMats.set(style, new MeshLambertMaterial({ map: facadeTexture(style), vertexColors: true, side: DoubleSide }));
    return facadeMats.get(style);
  }

  /** 구간 k(역 k → k+1)의 터널·고가·역·땅을 짓는다 */
  function buildWorld(k) {
    disposeWorld();
    seg = k;
    world = new Group();
    const P = pathFor(k);
    path = P.pts;
    pathKm = lengthOf(path);
    kmA = P.kmA;
    kmB = P.kmB;
    origin = [...path[0]];
    const A = stops[k];
    const B = stops[Math.min(stops.length - 1, k + 1)];
    // 10m마다 단면. 땅속 정도(0~1): 두 역이 다르면 가운데에서 300m에 걸쳐 바뀐다
    const mid = (kmA + kmB) / 2;
    samples = [];
    for (let km = 0; km <= pathKm + 1e-9; km += 0.01) {
      const p = along(path, km);
      const q = along(path, Math.min(pathKm, km + 0.01));
      let ux = q.x - p.x;
      let uz = q.y - p.y;
      const n = Math.hypot(ux, uz);
      if (n < 1e-9) {
        ux = p.dx;
        uz = p.dy;
      } else {
        ux /= n;
        uz /= n;
      }
      const t = Math.max(0, Math.min(1, (km - mid + 0.15) / 0.3));
      const under = (A.under ? 1 : 0) * (1 - t) + (B.under ? 1 : 0) * t;
      const [x, z] = W(p.x, p.y);
      samples.push({ k: km, gx: p.x, gy: p.y, x, z, ux, uz, rx: -uz, rz: ux, g: groundY(p.x, p.y), under });
    }
    // 선로 높이: 땅을 부드럽게 따라가며 땅속이면 12m 아래, 땅 위면 9m 위(고가)
    for (let i = 0; i < samples.length; i++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - 15); j <= Math.min(samples.length - 1, i + 15); j++) {
        s += samples[j].g;
        c++;
      }
      const smooth = s / c;
      samples[i].y = smooth + 9 - samples[i].under * 21;
    }
    // 역은 평평하게(역 가운데 높이), 역 사이 기울기는 3.5%까지
    const zone = trainLen / 2000 + 0.03;
    for (const kmS of [kmA, kmB]) {
      const c = samples[Math.max(0, Math.min(samples.length - 1, Math.round(kmS / 0.01)))].y;
      for (const s of samples) if (Math.abs(s.k - kmS) <= zone) s.y = c;
    }
    const MAXD = 0.35;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < samples.length; i++) samples[i].y = Math.max(samples[i - 1].y - MAXD, Math.min(samples[i - 1].y + MAXD, samples[i].y));
      for (let i = samples.length - 2; i >= 0; i--) samples[i].y = Math.max(samples[i + 1].y - MAXD, Math.min(samples[i + 1].y + MAXD, samples[i].y));
    }
    const anyAbove = samples.some((s) => s.under < 0.99);
    const parts = new Parts();
    const glow = new Parts();
    const ceil = new Parts();
    const plate = (s, t, o, w, h, dy, col, into = parts) => {
      const ax = s.x + s.rx * o;
      const az = s.z + s.rz * o;
      const bx = t.x + t.rx * o;
      const bz = t.z + t.rz * o;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) return;
      const g = new BoxGeometry(Math.hypot(len, t.y - s.y) + 0.05, h, w);
      g.rotateZ(Math.atan2(t.y - s.y, len));
      g.rotateY(Math.atan2(-(bz - az), bx - ax));
      g.translate((ax + bx) / 2, (s.y + t.y) / 2 + dy, (az + bz) / 2);
      into.add(g, col);
    };
    const atStation = (km) => Math.abs(km - kmA) < trainLen / 2000 + 0.012 || Math.abs(km - kmB) < trainLen / 2000 + 0.012;
    // 두 선로: 우리 선로(가운데 0), 맞은편 선로(-4.2)
    const OTHER = -4.2;
    for (let i = 1; i < samples.length; i++) {
      const s = samples[i - 1];
      const t = samples[i];
      const st = atStation(t.k);
      const under = (s.under + t.under) / 2;
      // 선로 바닥과 레일(경전철 고무바퀴는 콘크리트 주행로)
      for (const o of [0, OTHER]) {
        if (spec.monorail) {
          // 콘크리트 빔 하나(차가 빔을 감싸고 달린다)
          plate(s, t, o, 0.85, 1.6, -0.3, '#c9c6be');
        } else if (spec.rubber) {
          for (const r of [-0.85, 0.85]) plate(s, t, o + r, 0.5, 0.2, 0.1, '#a7a9a6');
          for (const r of [-1.3, 1.3]) plate(s, t, o + r, 0.08, 0.35, 0.35, '#6b7076');
        } else {
          plate(s, t, o, 2.6, 0.18, 0.05, '#6f6a62');
          for (const r of [-0.72, 0.72]) plate(s, t, o + r, 0.08, 0.14, 0.2, '#9aa0a6');
          if (i % 1 === 0) plate(s, t, o, 2.2, 0.05, 0.14, '#5a554e');
        }
      }
      if (under > 0.5) {
        // 상자 터널: 바닥, 벽, 천장, 벽 등
        const right = st ? 9 : 2.6;
        const left = OTHER - 2.4;
        plate(s, t, (right + left) / 2, right - left, 0.3, -0.2, '#4a4c4f');
        plate(s, t, right, 0.4, 6.5, 3.1, st ? '#d9dcdc' : '#6a6d70');
        plate(s, t, left, 0.4, 6.5, 3.1, st && look.wall ? look.wall : '#6a6d70');
        plate(s, t, (right + left) / 2, right - left + 0.4, 0.3, 6.4, st ? look.ceil : '#55585b', ceil);
        if (i % 3 === 0 && !st) glow.box(0.6, 0.18, 0.1, t.x + t.rx * (right - 0.25), t.y + 3.6, t.z + t.rz * (right - 0.25), '#fff6d8');
        if (st) {
          // 승강장 바닥, 천장 등
          plate(s, t, (EDGE + 0.05 + right) / 2, right - EDGE - 0.05, 1.1, 0.45, look.floor);
          // 승강장을 따라 이어진 노란 점자 블록(2호선 사진)
          if (look.tactileLine) plate(s, t, EDGE + 0.85, 0.4, 0.03, 1.02, '#E8B92A');
          // 승강장 기둥(노선 색 띠)
          if (i % 2 === 0) {
            const g = look.round ? new CylinderGeometry(0.45, 0.45, 5.4, 12) : new BoxGeometry(0.6, 5.4, 0.6);
            g.translate(t.x + t.rx * 6.2, t.y + 3.7, t.z + t.rz * 6.2);
            parts.add(g, look.pillar);
            const b = new BoxGeometry(0.64, 0.25, 0.64);
            b.translate(t.x + t.rx * 6.2, t.y + 2.4, t.z + t.rz * 6.2);
            parts.add(b, color);
          }
        }
      } else {
        // 고가: 바닥판, 낮은 벽, 기둥
        const right = st ? 8 : 2.4;
        const left = OTHER - 2.2;
        // 모노레일은 역에서만 바닥판이 있다(역 밖은 빔과 기둥뿐)
        if (!spec.monorail || st) {
          plate(s, t, (right + left) / 2, right - left, 0.8, -0.45, '#bdbab2');
          plate(s, t, right, 0.3, 1.1, 0.4, '#c9c6be');
          plate(s, t, left, 0.3, 1.1, 0.4, '#c9c6be');
        }
        if (i % 3 === 0) {
          const h = Math.max(1, t.y - t.g);
          const g = new BoxGeometry(1.6, h, 2.2);
          g.translate(t.x + t.rx * (OTHER / 2), t.g + h / 2 - 0.8, t.z + t.rz * (OTHER / 2));
          parts.add(g, '#b3b0a8');
        }
        // 전차선 기둥: 가공선식(1~3호선, 동해선)만. 4호선과 부산김해경전철은 제3궤조
        if (!spec.rubber && !spec.thirdRail && i % 5 === 0) {
          // 전차선 기둥
          const g = new BoxGeometry(0.25, 6, 0.25);
          g.translate(t.x + t.rx * (left + 0.2), t.y + 3, t.z + t.rz * (left + 0.2));
          parts.add(g, '#8c9399');
          plate(samples[i - 1], t, OTHER / 2, 0.05, 0.05, 5.4, '#3a3d40');
        }
        if (st) {
          plate(s, t, (EDGE + 0.05 + right) / 2, right - EDGE - 0.05, 1.1, 0.45, look.floor);
          if (look.arch) {
            // 철골 아치 지붕: 가운데가 높은 세 토막
            plate(s, t, EDGE + 0.8, 2.6, 0.2, 5.0, look.archColor ?? '#a9afb4');
            plate(s, t, (EDGE + right) / 2 + 0.4, 2.8, 0.2, 5.6, look.archColor ?? '#a9afb4');
            plate(s, t, right - 0.6, 2.6, 0.2, 5.0, look.archColor ?? '#a9afb4');
            if (i % 2 === 0) plate(s, t, (EDGE + right) / 2, right - EDGE + 0.6, 0.12, 5.3, '#6d757b');
          } else plate(s, t, (EDGE + right) / 2, right - EDGE + 0.6, 0.25, 4.8, look.roof ?? '#8e979e'); // 승강장 지붕
          if (look.benches && i % 15 === 0) {
            plate(s, t, 5.2, 0.7, 0.12, 1.45, '#b59a6e'); // 의자 판
            plate(s, t, 5.2, 0.5, 0.4, 1.2, '#9aa0a6'); // 의자 다리
          }
          if (i % 3 === 0) {
            const g = look.round ? new CylinderGeometry(0.3, 0.3, 3.8, 12) : new BoxGeometry(0.3, 3.8, 0.3);
            g.translate(t.x + t.rx * (right - 0.6), t.y + 2.9, t.z + t.rz * (right - 0.6));
            parts.add(g, '#6d757b');
          }
        }
      }
    }
    // 역마다: 안전문(유리 벽과 문 짝), 역 이름판
    const glassParts = new Parts();
    for (const [kmS, stop] of [
      [kmA, A],
      [kmB, B],
    ]) {
      // 열차가 서는 자리: 열차 가운데가 역 자리에 온다
      const headKm = kmS + trainLen / 2000;
      const doorKms = [];
      for (let c = 0; c < N; c++) {
        const centerKm = headKm - (offs[c] + lens[c] / 2) / 1000;
        for (const dx of cars[c].doorXs) doorKms.push(centerKm + dx / 1000);
      }
      const startKm = headKm - trainLen / 1000 - 0.004;
      for (let km = startKm; km <= headKm + 0.004; km += 0.002) {
        const s = sampleAt(km);
        const t = sampleAt(km + 0.002);
        if (!s || !t) continue;
        const nearDoor = doorKms.some((d) => Math.abs(km + 0.001 - d) < 0.0009);
        if (look.psdLow) {
          // 허리 높이 안전문(흰 판)
          if (!nearDoor) plate(s, t, EDGE + 0.05, 0.12, 1.3, 1.65, '#f4f5f5');
        } else {
          if (!nearDoor) plate(s, t, EDGE + 0.05, 0.04, look.psdFull ? 2.4 : 2.1, look.psdFull ? 1.7 : 1.55, '#9fc3d6', glassParts);
          // 안전문 위 흰 틀과 노선 색 줄(1호선 승강장 사진)
          plate(s, t, EDGE + 0.05, 0.2, 0.75, 2.98, look.psdHeader ?? '#e9eaea');
          plate(s, t, EDGE + 0.17, 0.02, 0.08, 3.12, look.psdStripe ?? color);
        }
        plate(s, t, EDGE + 0.12, 0.08, 0.08, 0.54, '#d4d6d6'); // 문 아래 틀
      }
      for (const d of doorKms) {
        const s = sampleAt(d);
        if (!s) continue;
        // 문 양옆 청록 기둥, 문 앞 노란 점자 블록
        for (const side of [-1, 1]) {
          const g = new BoxGeometry(0.1, 2.15, 0.16);
          g.rotateY(Math.atan2(-s.uz, s.ux));
          g.translate(s.x + s.rx * (EDGE + 0.05) + s.ux * side * 0.98, s.y + 1.55, s.z + s.rz * (EDGE + 0.05) + s.uz * side * 0.98);
          parts.add(g, '#4F9A93');
        }
        if (!look.tactileLine) {
          const tg = new BoxGeometry(1.6, 0.03, 0.6);
          tg.rotateY(Math.atan2(-s.uz, s.ux));
          tg.translate(s.x + s.rx * (EDGE + 0.55), s.y + 1.01, s.z + s.rz * (EDGE + 0.55));
          parts.add(tg, '#E8B92A');
        }
        for (const side of [-1, 1]) {
          const m = look.psdLow ? new Mesh(new BoxGeometry(0.95, 1.25, 0.08), lowDoorMat) : new Mesh(new BoxGeometry(0.95, 2.05, 0.04), glassMat);
          const base = [s.x + s.rx * (EDGE + 0.05) + s.ux * side * 0.48, s.y + (look.psdLow ? 1.65 : 1.55), s.z + s.rz * (EDGE + 0.05) + s.uz * side * 0.48];
          m.position.set(...base);
          m.rotation.y = Math.atan2(-s.uz, s.ux);
          world.add(m);
          psd.push({ mesh: m, base, ux: s.ux, uz: s.uz, side });
        }
      }
      // 역 이름판(뒤 벽)
      const si = stops.indexOf(stop);
      const info = (st) => (st ? { ko: st.name, en: stationById.get(st.id)?.nameEn ?? romanize(st.name), hanja: stationHanja(st.id), num: stationById.get(st.id)?.code ?? null } : null);
      const here = info(stop);
      const nx = info(stops[si + 1]);
      const pv = info(stops[si - 1]);
      const busan = ['1', '2', '3', '4'].includes(lineId);
      const bgl = lineId === 'BGL';
      const code = stationById.get(stop.id)?.code;
      const daegu = lineId === 'DG1';
      // 대구 3호선 역명판도 대구 2호선과 같은 꼴(사용자가 보내 준 사진)
      const daegu2 = lineId === 'DG2' || lineId === 'DG3';
      const korail = lineId === 'DH';
      const korailWide = lineId === 'DK';
      const gwangju = lineId === 'GJ1';
      const signTex = busan
        ? busanSignTexture({ name: here.ko, en: here.en, hanja: here.hanja, num: code ? String(code).padStart(3, '0') : '', next: nx?.ko, nextEn: nx?.en, prev: pv?.ko, prevEn: pv?.en, color })
        : bgl
          ? bglSignTexture({ name: here.ko, en: here.en, hanja: here.hanja, num: Number(String(stop.id).replace(/\D/g, '')) || '' })
          : daegu2
            ? daegu2SignTexture({ name: here.ko, en: here.en, hanja: here.hanja, num: here.num, next: nx?.ko, nextEn: nx?.en, nextNum: nx?.num, prev: pv?.ko, prevEn: pv?.en, prevNum: pv?.num, color })
          : daegu
            ? daeguSignTexture({ name: here.ko, en: here.en, hanja: here.hanja, num: here.num, next: nx?.ko, nextEn: nx?.en, nextNum: nx?.num, prev: pv?.ko, prevEn: pv?.en, prevNum: pv?.num, color })
            : gwangju
              ? gwangjuSignTexture({ name: here.ko, en: here.en, hanja: here.hanja, num: here.num, next: nx?.ko, nextEn: nx?.en, nextNum: nx?.num, prev: pv?.ko, prevEn: pv?.en, prevNum: pv?.num, color })
            : korailWide
              ? korailWideSignTexture({ name: here.ko, en: here.en, hanja: here.hanja, next: nx?.ko, nextEn: nx?.en, prev: pv?.ko, prevEn: pv?.en })
            : korail
              ? korailSignTexture({ name: here.ko, en: here.en, hanja: here.hanja, next: nx?.ko, nextEn: nx?.en, prev: pv?.ko, prevEn: pv?.en })
              : boardTexture([stop.name], { bg: '#ffffff', fg: '#1F3342', bar: color, width: 512, height: 128 });
      textures.push(signTex);
      const tex = signTex;
      const [pw, ph] = busan ? [7.2, 2.25] : bgl ? [0.9, 2.25] : daegu ? [6.4, 1.9] : daegu2 ? [7, 1.5] : korail ? [1.6, 2.0] : korailWide ? [6, 2.1] : gwangju ? [7.2, 1.7] : [6, 1.5];
      for (const off of [-0.06, -0.03, 0, 0.03, 0.06]) {
        const s = sampleAt(kmS + off);
        if (!s) continue;
        const under = s.under > 0.5;
        const b = new Mesh(new PlaneGeometry(pw, ph), new MeshBasicMaterial({ map: tex, transparent: busan || gwangju }));
        const o = under ? 8.45 : 7.5;
        b.position.set(s.x + s.rx * o, s.y + 3.2, s.z + s.rz * o);
        b.rotation.y = Math.atan2(-s.uz, s.ux) + Math.PI;
        world.add(b);
      }
    }
    // 땅 위가 있으면 땅, 건물, 나무
    if (anyAbove) {
      const offs = [];
      for (let o = -300; o <= 300; o += 20) offs.push(o);
      const pos = [];
      const col = [];
      const idx = [];
      const c = new Color();
      const ground = samples.filter((_, i) => i % 2 === 0);
      ground.forEach((s, i) => {
        for (const o of offs) {
          const wx = s.x + s.rx * o;
          const wz = s.z + s.rz * o;
          const gx = wx / 1000 + origin[0];
          const gy = wz / 1000 + origin[1];
          pos.push(wx, groundY(gx, gy) - 0.1, wz);
          const terrain = grid.terrain[Math.floor(gy)]?.[Math.floor(gx)];
          const people = grid.population[Math.floor(gy)]?.[Math.floor(gx)] ?? 0;
          c.set(terrain === 'sea' ? '#7fa7c9' : terrain === 'river' ? '#8db3cf' : people > 3000 ? '#b3ada3' : people > 300 ? '#a9bb8e' : '#98b874');
          col.push(c.r, c.g, c.b);
        }
        if (i > 0) {
          const n = offs.length;
          for (let j = 1; j < n; j++) {
            const a0 = (i - 1) * n + j - 1;
            idx.push(a0, a0 + 1, a0 + n, a0 + 1, a0 + n + 1, a0 + n);
          }
        }
      });
      const gGeo = new BufferGeometry();
      gGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      gGeo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
      gGeo.setIndex(idx);
      gGeo.computeVertexNormals();
      world.add(new Mesh(gGeo, material));
      const facades = new Map();
      for (let i = 0; i < ground.length; i += 2) {
        const s = ground[i];
        for (const side of [-1, 1]) {
          for (let r = 0; r < 3; r++) {
            const o = side * (22 + r * 45 + cellNoise(i, r, side + 4) * 20);
            const wx = s.x + s.rx * o;
            const wz = s.z + s.rz * o;
            const gx = wx / 1000 + origin[0];
            const gy = wz / 1000 + origin[1];
            const terrain = grid.terrain[Math.floor(gy)]?.[Math.floor(gx)];
            if (terrain === 'sea' || terrain === 'river') continue;
            const people = grid.population[Math.floor(gy)]?.[Math.floor(gx)] ?? 0;
            const n = cellNoise(Math.round(s.k * 100), r * 2 + (side > 0 ? 1 : 0), 23);
            const y = groundY(gx, gy);
            if (people > 1500 && n < Math.min(0.85, people / 10000)) {
              const floors = people > 10000 ? 5 + Math.floor(n * 20) : 2 + Math.floor(n * 6);
              const style = floors >= 10 ? 'band' : n > 0.4 ? 'punched' : 'brick';
              if (!facades.has(style)) facades.set(style, new Mesher());
              const w = 14 + n * 10;
              const d = 12 + n * 8;
              const h = floors * 3.2;
              const tint = new Color(['#ece8de', '#e3ddd2', '#d9dde0', '#efe6d6'][Math.floor(n * 4)]);
              const ring = [
                [wx - w / 2, wz - d / 2],
                [wx + w / 2, wz - d / 2],
                [wx + w / 2, wz + d / 2],
                [wx - w / 2, wz + d / 2],
              ];
              let run = 0;
              const m = facades.get(style);
              for (let q = 0; q < 4; q++) {
                const [ax, az] = ring[q];
                const [bx, bz] = ring[(q + 1) % 4];
                const len = Math.hypot(bx - ax, bz - az);
                m.quad([ax, y, az], [bx, y, bz], [bx, y + h, bz], [ax, y + h, az], tint, [[run / 3, 0], [(run + len) / 3, 0], [(run + len) / 3, h / 4], [run / 3, h / 4]]);
                run += len;
              }
              parts.box(w, 0.3, d, wx, y + h + 0.15, wz, '#8f969c');
            } else if (n < 0.5) {
              const g = new ConeGeometry(2 + n * 2, 5 + n * 4, 7);
              g.translate(wx, y + 3, wz);
              parts.add(g, '#4f8a45');
            }
          }
        }
      }
      for (const [style, m] of facades) world.add(new Mesh(m.geometry(), facadeMat(style)));
    }
    // 역 안 무늬: 땅속 역은 천장·뒤 벽·선로 건너편 벽·바닥, 땅 위 역은 지붕 아래·바닥(곡선을 따라 깐다)
    const m = stationMaterials();
    for (const kmS of [kmA, kmB]) {
      const zone = trainLen / 2000 + 0.012;
      const list = samples.filter((q) => Math.abs(q.k - kmS) <= zone);
      if (list.length < 2) continue;
      const dist = [0];
      for (let q = 1; q < list.length; q++) dist.push(dist[q - 1] + Math.hypot(list[q].x - list[q - 1].x, list[q].z - list[q - 1].z));
      const underHere = list[Math.floor(list.length / 2)].under > 0.5;
      if (underHere) {
        world.add(ribbonH(list, dist, OTHER - 2.2, 8.78, 6.24, m.ceil, 2.4, 2.4));
        world.add(ribbonV(list, dist, 8.78, 1.0, 6.25, m.wall, 12));
        world.add(ribbonV(list, dist, OTHER - 2.18, -0.05, 6.25, m.track, 12));
        world.add(ribbonH(list, dist, EDGE + 0.1, 8.75, 1.006, m.floor, 1.2, 1.2));
      } else {
        if (!look.arch) world.add(ribbonH(list, dist, EDGE, 7.9, 4.66, m.roof, 2.4, 2.4));
        world.add(ribbonH(list, dist, EDGE + 0.1, 7.75, 1.006, m.floor, 1.2, 1.2));
      }
    }
    world.add(new Mesh(parts.geometry(), material), new Mesh(glow.geometry(), glowMat), new Mesh(glassParts.geometry(), glassMat));
    // 탈 역 승강장의 승객(사람 수는 crowd: 0~1, 우리가 정한 어림)
    spawnRiders(kmA, flow ? Math.min(10, Math.max(1, Math.round(flow.on ?? 0))) : Math.round(3 + crowd * 7));
    ceiling = new Mesh(ceil.geometry(), material);
    world.add(ceiling);
    scene.add(world);
    // 땅속 구간이 많으면 하늘 대신 어두운 터널
    const mostlyUnder = samples.filter((s) => s.under > 0.5).length > samples.length / 2;
    scene.background.setHex(mostlyUnder ? TUNNEL : SKY);
    scene.fog.color.setHex(mostlyUnder ? TUNNEL : SKY);
    scene.fog.near = mostlyUnder ? 60 : 250;
    scene.fog.far = mostlyUnder ? 420 : 1100;
  }

  let stMats = null;
  /** 역 안 무늬 재료(노선 모양 look으로) */
  function stationMaterials() {
    if (stMats) return stMats;
    const band = look.psdStripe ?? color;
    const mk = (map, basic = false) => (basic ? new MeshBasicMaterial({ map, side: DoubleSide }) : new MeshLambertMaterial({ map, side: DoubleSide }));
    stMats = {
      ceil: mk(ceilingTexture(look.ceilStyle ?? 'panel', look.ceil ?? '#e9ebeb'), true),
      // 벽 조명판은 두지 않는다(열차 창 너머로 판이 잘려 보여서, 사용자 의견)
      wall: mk(wallTexture({ tile: look.wallTile ?? '#ece6da', band, ads: false, grout: look.grout ?? null, square: Boolean(look.grout) })),
      track: mk(wallTexture({ tile: look.trackTile ?? look.wall ?? '#e8e6e0', band, ads: false, wave: look.wave ?? null, dark: true })),
      floor: mk(floorTexture(look.floor ?? '#c9cbcc')),
      roof: mk(roofTexture(look.roof ?? '#8e979e')),
    };
    return stMats;
  }
  /** 가로로 누운 띠(천장·바닥): 단면마다 o1~o2, 높이 dy. 무늬는 uS×vS미터마다 한 벌 */
  function ribbonH(list, dist, o1, o2, dy, mat, uS, vS) {
    const pos = [];
    const uv = [];
    const idx = [];
    list.forEach((q, i) => {
      for (const o of [o1, o2]) {
        pos.push(q.x + q.rx * o, q.y + dy, q.z + q.rz * o);
        uv.push(dist[i] / uS, o / vS);
      }
      if (i > 0) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new Mesh(g, mat);
  }
  /** 선 벽 띠: 단면마다 o 자리, 높이 y0~y1. 가로 uS미터마다 한 벌, 세로는 한 벌 */
  function ribbonV(list, dist, o, y0, y1, mat, uS) {
    const pos = [];
    const uv = [];
    const idx = [];
    list.forEach((q, i) => {
      const x = q.x + q.rx * o;
      const z = q.z + q.rz * o;
      pos.push(x, q.y + y0, z, x, q.y + y1, z);
      uv.push(dist[i] / uS, 0, dist[i] / uS, 1);
      if (i > 0) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new Mesh(g, mat);
  }

  function sampleAt(km) {
    if (!samples.length) return null;
    const i = Math.max(0, Math.min(samples.length - 1, Math.round(km / 0.01)));
    const a = samples[Math.max(0, Math.min(samples.length - 2, Math.floor(km / 0.01)))];
    const b = samples[Math.min(samples.length - 1, Math.floor(km / 0.01) + 1)];
    if (!a || !b) return samples[i];
    const t = Math.max(0, Math.min(1, km / 0.01 - Math.floor(km / 0.01)));
    return {
      k: km,
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      y: a.y + (b.y - a.y) * t,
      ux: a.ux,
      uz: a.uz,
      rx: a.rx,
      rz: a.rz,
      under: a.under,
      g: a.g,
    };
  }

  function placeTrain() {
    for (let c = 0; c < N; c++) {
      const center = posKm - (offs[c] + lens[c] / 2) / 1000;
      const f = sampleAt(center + lens[c] / 2000 - 0.002);
      const r = sampleAt(center - lens[c] / 2000 + 0.002);
      if (!f || !r) continue;
      const g = cars[c].group;
      g.position.set((f.x + r.x) / 2, (f.y + r.y) / 2 + 0.2, (f.z + r.z) / 2);
      g.rotation.set(0, Math.atan2(-(f.z - r.z), f.x - r.x), Math.atan2(f.y - r.y, Math.hypot(f.x - r.x, f.z - r.z)));
    }
  }

  function resize() {
    const w = el.clientWidth || 640;
    const h = Math.round(Math.min(560, Math.max(260, w * 0.62)));
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      canvas.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  const lookAt = new Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!world || !el.isConnected || el.offsetParent === null) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    resize();
    mixer.update(reduceMotion ? 0 : dt);
    if (drive) {
      if (!drive.start) drive.start = now;
      const u = drive.ms > 0 ? Math.min(1, (now - drive.start) / drive.ms) : 1;
      const e = drive.ease === 'out' ? 1 - (1 - u) * (1 - u) : u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      posKm = drive.from + (drive.to - drive.from) * e;
      if (u >= 1) {
        const done = drive.done;
        drive = null;
        done();
      }
    }
    if (doorAmount !== doorTarget) {
      const s = reduceMotion ? 1 : dt / 1.2;
      doorAmount = doorTarget > doorAmount ? Math.min(doorTarget, doorAmount + s) : Math.max(doorTarget, doorAmount - s);
      for (const c of cars) for (const d of c.doors) d.mesh.position.set(d.base[0] + d.s * 0.62 * doorAmount, d.base[1], d.base[2] + 0.02);
      for (const l of cabin.leaves) l.mesh.position.x = l.x + l.side * 0.62 * doorAmount;
      for (const p of psd) p.mesh.position.set(p.base[0] + p.ux * p.side * 0.9 * doorAmount, p.base[1], p.base[2] + p.uz * p.side * 0.9 * doorAmount);
    }
    placeTrain();
    updateRiders(dt);
    cabinStep(dt);
    const head = cars[0].group;
    const bp = cars[Math.min(N - 1, 1)].group.position;
    const ux = Math.cos(-head.rotation.y);
    const uz = Math.sin(-head.rotation.y);
    const rx = -uz;
    const rz = ux;
    const s = sampleAt(posKm - trainLen / 2000);
    const under = (s?.under ?? 0) > 0.5;
    if (ceiling) ceiling.visible = mode !== 'sky';
    if (mode === 'cabin') {
      const g = cars[cabinIndex].group;
      g.updateMatrixWorld(true);
      camera.position.copy(cabin.eye).applyMatrix4(g.matrixWorld);
      camera.lookAt(lookAt.copy(cabin.look).applyMatrix4(g.matrixWorld));
    } else if (mode === 'platform') {
      const p = sampleAt(platformAt + trainLen / 2000 - 0.006);
      if (p) {
        // 승강장에서 안전문 뒤 2m, 열차가 들어오는 쪽을 본다
        camera.position.set(p.x + p.rx * (EDGE + 2.6), p.y + 0.95 + EYE, p.z + p.rz * (EDGE + 2.6));
        camera.lookAt(p.x - p.ux * 60 + p.rx * EDGE, p.y + 1.9, p.z - p.uz * 60 + p.rz * EDGE);
        const h = sampleAt(platformAt + trainLen / 2000 - 0.012);
        heroBoardStep(h, dt);
      }
    } else if (mode === 'front') {
      // 열차 머리보다 앞, 맞은편 선로 쪽에서 머리 끝을 비스듬히 본다
      const ahead = sampleAt(Math.min(pathKm, posKm + (under ? 0.011 : 0.02))) ?? s;
      const side = under ? -3.2 : -7;
      camera.position.set(ahead.x + ahead.rx * side, ahead.y + (under ? 2.3 : 4.5), ahead.z + ahead.rz * side);
      camera.lookAt(head.position.x - ux * 3, head.position.y + 1.7, head.position.z - uz * 3);
    } else if (mode === 'chase') {
      const back = sampleAt(posKm - trainLen / 1000 - 0.018) ?? s;
      camera.position.set(back.x + back.rx * 1.2, back.y + (under ? 4.3 : 7), back.z + back.rz * 1.2);
      camera.lookAt(head.position.x, head.position.y + 1.5, head.position.z);
    } else if (mode === 'sky') {
      camera.position.set(bp.x - ux * 40 + rx * 45, bp.y + 70, bp.z - uz * 40 + rz * 45);
      camera.lookAt(bp.x + ux * 30, bp.y, bp.z + uz * 30);
    } else {
      // 옆에서: 맞은편 선로 쪽에서(터널 안이면 가까이)
      // 터널 안이면 맞은편 선로 끝에서 비스듬히 앞쪽을, 땅 위면 멀리 옆에서
      const d = under ? -6.0 : -18;
      const fwd = under ? 16 : 2;
      camera.position.set(bp.x + rx * d + ux * fwd, bp.y + (under ? 2.6 : 4), bp.z + rz * d + uz * fwd);
      camera.lookAt(bp.x - ux * (under ? 6 : -2), bp.y + 1.8, bp.z - uz * (under ? 6 : -2));
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // 승객 누르기: 누른 곳에서 광선을 쏘아 맞은 승객의 자리 번호를 알린다(대화는 부르는 쪽이 연다)
  let onRider = null;
  const ray = new Raycaster();
  const ndc = new Vector2();
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!onRider || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [...seated.map((sd) => sd.obj), ...riders.filter((rd) => rd.obj.visible).map((rd) => rd.obj)];
    // 사람 모양은 뼈로 움직여 광선이 빗나가기 쉬워서, 사람마다 키 높이 상자로 맞힌다
    let best = null;
    for (const obj of targets) {
      if (!obj.visible || !obj.parent) continue;
      const box = new Box3().setFromCenterAndSize(new Vector3(0, 0.5, 0).applyMatrix4(obj.matrixWorld), new Vector3(0.6, 1.8, 0.6));
      const hit = ray.ray.intersectBox(box, new Vector3());
      if (hit) {
        const d = hit.distanceTo(camera.position);
        if (!best || d < best.d) best = { d, slot: obj.userData.slot };
      }
    }
    if (best) onRider(best.slot);
  });
  canvas.style.cursor = 'pointer';

  // 보는 곳 단추(밖에서 볼 때)
  const camRow = document.createElement('div');
  camRow.className = 'tr3d-cams';
  camRow.setAttribute('role', 'group');
  camRow.setAttribute('aria-label', '3D에서 보는 곳');
  const camButtons = [
    ['front', '앞에서'],
    ['side', '옆에서'],
    ['chase', '뒤에서'],
    ['sky', '하늘에서'],
  ].map(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'button';
    b.textContent = label;
    b.dataset.mode = id;
    b.addEventListener('click', () => {
      mode = id;
      outsideMode = id;
      mark();
    });
    camRow.append(b);
    return b;
  });
  const mark = () => {
    for (const b of camButtons) {
      b.className = b.dataset.mode === mode ? 'button is-on' : 'button';
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    }
  };
  mark();
  el.append(camRow);

  const run = (spec2) =>
    new Promise((done) => {
      drive = { start: 0, ...spec2, ms: reduceMotion ? 0 : spec2.ms, done };
    });
  /** 역 k에 선 열차 머리 자리(구간 k 안) */
  const stopHead = () => kmA + trainLen / 2000;

  const api = {
    el,
    /** 열차가 역 k에 서 있다 */
    atStation(k) {
      const kk = Math.min(k, stops.length - 2);
      if (seg !== kk || !world) buildWorld(kk);
      platformAt = kmA;
      posKm = k > kk ? kmB + trainLen / 2000 : stopHead();
      for (const c of cars) c.group.visible = true;
    },
    /** 승강장에서 기다린다(열차는 아직 안 보인다) */
    waitAtPlatform(k = 0) {
      heroBoard = null;
      api.atStation(k);
      for (const c of cars) c.group.visible = false;
      posKm = Math.max(trainLen / 1000, 0.05);
      doorAmount = 0;
      doorTarget = 0;
    },
    /** 열차가 들어와 선다 */
    arrive(ms = 6000) {
      for (const c of cars) c.group.visible = true;
      return run({ from: Math.max(0.02, stopHead() - 0.28), to: stopHead(), ms, ease: 'out' });
    },
    /** 역 k까지 달린다(여러 역을 건너뛰면 마지막 구간만 달린다) */
    driveTo(k, ms = 7000) {
      planAlight();
      const from = Math.max(0, Math.min(k - 1, stops.length - 2));
      if (seg !== from || !world) buildWorld(from);
      platformAt = kmA;
      for (const c of cars) c.group.visible = true;
      return run({ from: stopHead(), to: kmB + trainLen / 2000, ms }).then(() => {
        platformAt = kmB;
      });
    },
    setDoors(open) {
      if (open && doorTarget === 0 && posKm > 0) planBoard();
      doorTarget = open ? 1 : 0;
    },
    setDisplay(lines) {
      displayBox.replaceChildren(
        ...lines.map((t) => {
          const d = document.createElement('div');
          d.textContent = t;
          return d;
        }),
      );
    },
    /** 'platform'(승강장, 아이 눈높이), 'cabin'(열차 안), 'outside'(밖에서) */
    setView(view) {
      const wasCabin = mode === 'cabin';
      mode = view === 'outside' ? outsideMode : view;
      const inCabin = mode === 'cabin';
      cabin.group.visible = inCabin;
      cars[cabinIndex].group.children[0].visible = !inCabin;
      for (const d of cars[cabinIndex].doors) d.mesh.visible = !inCabin;
      camRow.style.display = view === 'outside' ? '' : 'none';
      displayBox.hidden = view === 'platform';
      // 이미 열차 안을 보고 있으면 주인공을 그대로 둔다(화면을 다시 그릴 때마다 불려서 제자리로 순간이동하던 것)
      if (inCabin && !wasCabin) {
        hero.root.visible = true;
        cab.state = 'stand';
        cab.lift = 0;
        cars[cabinIndex].group.add(hero.root);
        hero.root.position.set(cabin.hero.x, cabin.hero.y, cabin.hero.z);
        hero.root.rotation.set(0, -Math.PI / 2, 0);
      } else if (mode === 'platform') scene.add(hero.root);
      else if (!inCabin) hero.root.removeFromParent();
      hemi.groundColor.setHex(inCabin || mode === 'platform' ? 0xd9d5cc : 0xb9b3a6);
      camera.fov = inCabin || mode === 'platform' ? 62 : 55;
      camera.updateProjectionMatrix();
      canvas.setAttribute('aria-label', inCabin ? '지하철 안 3D 그림' : mode === 'platform' ? '지하철 승강장 3D 그림' : '지하철을 밖에서 본 3D 그림');
      mark();
    },
    playHero(id) {
      // 열차 안: 앉기와 일어서기는 걸어서 오가는 차례로(cabinMove)
      if (mode === 'cabin' && (id === 'sit' || cab.state !== 'stand')) {
        cabinRequest(id);
        return;
      }
      playClip(id);
    },
    onHero(fn) {
      heroDone = fn;
    },
    /** 칸 수 */
    cars: N,
    /**
     * 다음 역의 승하차(칸 하나 몫): before 서기 전 사람, off 내릴 사람, after 떠날 때 사람.
     * driveTo 전에 부르면 내릴 사람과 탈 사람 수를 이것으로 정한다.
     */
    setFlow(f) {
      flow = f;
    },
    /** 승객을 누르면 fn(자리 번호): 앉은 승객 0~, 승강장 승객 100~ */
    onRider(fn) {
      onRider = fn;
    },
    destroy() {
      cancelAnimationFrame(raf);
      el.remove();
      disposeWorld();
      mixer.stopAllAction();
      hero.dispose();
      for (const sd of seated) sd.mixer.stopAllAction();
      for (const k of riderKinds) k.dispose();
      cabin.dispose();
      for (const c of cars) {
        c.group.traverse((o) => o.geometry?.dispose());
        c.doorMat.dispose();
      }
      material.dispose();
      glowMat.dispose();
      glassMat.dispose();
      lowDoorMat.dispose();
      for (const mm of Object.values(stMats ?? {})) {
        mm.map?.dispose();
        mm.dispose();
      }
      for (const t of textures) t.dispose();
      for (const m of facadeMats.values()) {
        m.map?.dispose();
        m.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
  if (import.meta.env?.DEV) el.devApi = { ...api, world: () => world, scene, camera, riders: () => riders, doors: () => [doorAmount, doorTarget, mode], tick: (t) => frame(t), seated: () => seated.map((sd) => sd.state), cab: () => ({ ...cab, action: undefined, clip: heroAction.getClip().name, t: heroAction.time }) };
  return api;
}
