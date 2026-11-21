// 기차 3D 보기의 차량. 모두 코드로 만든다(모델 파일을 읽지 않는다).
// 실제 차량의 그림이나 모델을 옮기지 않는다. 칸 크기와 편성은 공개된 제원을 따르고,
// 앞모습과 칠은 "어느 높이에 무슨 색 띠가 있는지", "코가 얼마나 길고 낮은지" 같은 특징만 따라 그린다.
//
// 차 한 칸은 칠을 꼭짓점 색으로 구운 그물 하나다(칸마다 그리기 한 번). 같은 모양의 칸은 그물을 함께 쓴다.
// 칸 안 좌표: x는 앞(+), y는 레일 윗면에서 위로(미터), z는 옆.
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, Mesh } from 'three';

export const GLASS = '#18212c';
export const DARK = '#2a2d31';
const UNDER = '#34373b';
const WHEEL = '#4d5054';
const ROOF_BLACK = '#22252b';

/**
 * 반쪽 단면: [옆(차 폭에 대한 비율, 0~0.5), 높이(0~1)]. 아래 가운데에서 오른쪽 옆을 따라 지붕 가운데까지.
 * 옆면은 촘촘히 찍어 띠 경계가 또렷하게 한다.
 */
const HALF = (() => {
  const side = [];
  for (let y = 0.07; y < 0.74; y += 0.022) side.push([0.5, Number(y.toFixed(3))]);
  return [[0, 0], [0.44, 0], [0.5, 0.035], ...side, [0.5, 0.75], [0.488, 0.82], [0.46, 0.88], [0.41, 0.93], [0.33, 0.97], [0.22, 0.993], [0.1, 1], [0, 1]];
})();
/** 한 바퀴 단면(닫힌 고리) */
const RING = [...HALF, ...HALF.slice(1, -1).reverse().map(([z, y]) => [-z, y])];

/**
 * 코 모양: 길이(m), 끝으로 갈수록 지붕이 내려오는 정도와 폭이 좁아지는 정도.
 * top(f), wide(f): f는 코 시작(0)부터 끝(1)까지.
 */
const NOSE = {
  tgv: { length: 7.6, steps: 16, top: (f) => 1 - 0.6 * f ** 1.55, wide: (f) => 1 - 0.5 * f ** 2.4, rise: 0.08, round: 0.9 },
  sancheon: { length: 8.2, steps: 16, top: (f) => 1 - 0.62 * f ** 1.3, wide: (f) => 1 - 0.46 * f ** 2.1, rise: 0.1, round: 1.1 },
  long: { length: 9.5, steps: 16, top: (f) => 1 - 0.64 * f ** 1.25, wide: (f) => 1 - 0.5 * f ** 1.9, rise: 0.08, round: 1.0 },
  short: { length: 4.8, steps: 12, top: (f) => 1 - 0.5 * f ** 1.5, wide: (f) => 1 - 0.38 * f ** 2.2, rise: 0.06, round: 0.8 },
  maum: { length: 4.4, steps: 12, top: (f) => 1 - 0.48 * f ** 1.35, wide: (f) => 1 - 0.34 * f ** 2.1, rise: 0.06, round: 0.8 },
  itx: { length: 2.6, steps: 8, top: (f) => 1 - 0.3 * f ** 1.2, wide: (f) => 1 - 0.2 * f ** 2, rise: 0.03, round: 0.5 },
  // ITX-청춘: ITX 앞모습과 같은 코
  cheongchun: { length: 2.6, steps: 8, top: (f) => 1 - 0.3 * f ** 1.2, wide: (f) => 1 - 0.2 * f ** 2, rise: 0.03, round: 0.5 },
  // 앞이 납작한 차: 끝을 오므리지 않고 모서리만 깎는다(bevel). frontGlass: 앞 유리 [아래, 위 높이 비율, 폭 비율]
  flat: { length: 1.1, steps: 5, top: (f) => 1 - 0.12 * f, wide: (f) => 1 - 0.1 * f ** 2, rise: 0.02, round: 0.25, bevel: true },
  loco: { length: 1.3, steps: 5, top: (f) => 1 - 0.14 * f, wide: (f) => 1 - 0.08 * f ** 2, rise: 0.02, round: 0.3, bevel: true, frontGlass: [0.6, 0.84, 0.78] },
};

/** 색을 어둡게(0~1) */
export const shade = (hex, k) => `#${new Color(hex).multiplyScalar(1 - k).getHexString()}`;

/**
 * 열차 종류마다 칸 크기, 편성, 칠, 창문.
 * KTX 칸 크기(길이·폭·높이)와 편성은 제원을 따른다(data/facts.json trainKinds.KTX.carSizes, composition).
 * 나머지 열차의 칸 크기는 어림이다(그림에만 쓰고 화면에 숫자로 적지 않는다).
 */
function specOf(kind, look) {
  if (kind === 'maum') return maumSpec(look);
  if (kind === 'cheongchun') return cheongchunSpec(look);
  if (kind === 'loco') return mugunghwaSpec(look);
  const L = look;
  // 띠 하나: 높이 a~b에 있으면 참
  const within = (hn, a, b) => hn >= a && hn < b;
  const common = { gap: 0.8, bottom: 1.0, windowHn: [0.52, 0.69], windows: { w: 1.5, pitch: 1.75 }, doors: 'ends', roofBoxes: true, articulated: false };
  switch (kind) {
    case 'tgv':
      return {
        ...common,
        set: 20,
        gap: 0.3,
        bottom: 0.72,
        articulated: true,
        roofBoxes: false,
        doors: 'one',
        sizes: { power: [22.517, 2.814, 4.1], paxPower: [22.854, 2.904, 3.484], pax: [18.7, 2.904, 3.484] },
        windows: { w: 0.62, pitch: 0.95 },
        windowHn: [0.55, 0.69],
        paint(c) {
          if (c.hn > 0.94) return L.roof;
          if (c.hn < 0.1) return L.lower;
          if (c.f >= 0) {
            if (c.f > 0.06 && c.f < 0.5 && c.hn > 0.6) return GLASS;
            if (Math.abs(c.hn - (0.64 - 0.3 * c.f)) < 0.05) return L.stripe;
            if (within(c.hn, 0.27, 0.31)) return L.stripe;
            return L.body;
          }
          if (c.role === 'power') {
            if (within(c.hn, 0.59, 0.69)) return L.stripe;
            if (within(c.hn, 0.27, 0.31)) return L.stripe;
            return L.body;
          }
          if (within(c.hn, 0.5, 0.74)) return L.stripe;
          if (within(c.hn, 0.27, 0.31)) return L.stripe;
          return L.body;
        },
      };
    case 'sancheon':
      return {
        ...common,
        set: 10,
        gap: 0.3,
        bottom: 0.72,
        articulated: true,
        roofBoxes: false,
        doors: 'one',
        sizes: { power: [22.6, 2.814, 3.95], paxPower: [19.5, 2.904, 3.55], pax: [19.5, 2.904, 3.55] },
        windows: { w: 0.66, pitch: 0.98 },
        windowHn: [0.55, 0.7],
        paint(c) {
          // 흰 바탕에 위는 청보라, 지붕과 앞 유리는 검은색(data/facts.json KTX-산천 look)
          if (c.f >= 0) {
            if (c.f > 0.1 && c.f < 0.55 && c.hn > 0.56) return GLASS;
            if (c.hn > 0.9) return ROOF_BLACK;
            if (c.hn > 0.5 - 0.22 * c.f) return L.stripe;
            if (c.hn < 0.08) return L.lower;
            return L.body;
          }
          if (c.hn > 0.9) return ROOF_BLACK;
          if (c.hn > 0.5) return L.stripe;
          if (c.hn < 0.08) return L.lower;
          if (within(c.hn, 0.27, 0.3)) return L.stripe;
          return L.body;
        },
      };
    case 'long':
    case 'short':
      return {
        ...common,
        set: kind === 'long' ? 8 : 6,
        bottom: 0.85,
        roofBoxes: false,
        doors: 'one',
        sizes: { cab: [kind === 'long' ? 25 : 22.5, 3.1, 3.75], mid: [20.5, 3.1, 3.75] },
        windows: { w: 0.95, pitch: 1.12 },
        windowHn: [0.5, 0.7],
        paint(c) {
          if (c.f >= 0 && c.f > 0.08 && c.f < 0.55 && c.hn > 0.56) return GLASS;
          if (c.hn > 0.93) return L.roof;
          if (c.hn < 0.08) return L.lower;
          if (kind === 'long') {
            // 옆면 곡선: 아래쪽 푸른 띠의 윗선이 칸을 따라 물결친다
            const edge = c.f >= 0 ? 0.3 + 0.25 * c.f : 0.24 + 0.07 * Math.sin(c.xn * Math.PI);
            if (c.hn < edge) return L.stripe;
            if (within(c.hn, 0.47, 0.73)) return L.band;
            return L.body;
          }
          if (within(c.hn, 0.47, 0.74)) return L.band;
          if (within(c.hn, 0.41, 0.44)) return L.stripe;
          return L.body;
        },
      };
    case 'itx':
      return {
        ...common,
        set: 6,
        sizes: { cab: [21.5, 3.1, 3.85], mid: [20, 3.1, 3.85] },
        paint(c) {
          if (c.f >= 0 && c.f > 0.04 && c.hn > 0.5 && c.hn < 0.92) return GLASS;
          if (c.hn > 0.92) return L.roof;
          if (c.hn < 0.13) return L.lower;
          if (within(c.hn, 0.5, 0.74)) return L.band;
          return L.body;
        },
      };
    default:
      return {
        ...common,
        set: 8,
        sizes: { cab: [20.5, 3.1, 3.8], mid: [20, 3.1, 3.8] },
        paint(c) {
          if (c.f >= 0 && c.f > 0.2 && c.hn > 0.5 && c.hn < 0.9) return GLASS;
          if (c.hn > 0.92) return L.roof;
          if (c.hn < 0.12) return L.lower;
          if (within(c.hn, 0.5, 0.74)) return L.band;
          if (within(c.hn, 0.3, 0.34)) return L.stripe;
          return L.body;
        },
      };
  }
}

/**
 * 2층 칸(ITX-청춘 4·5호차)의 층 높이(레일 윗면에서, 미터, 그림을 위한 어림). 바깥 창 두 줄과 객실(train-3d-cabin.js)이 함께 쓴다.
 * floor: 바닥, ceil: 천장, win: 창 [아래, 위]. 아이 눈높이(바닥 + 1.1m)가 창 안에 들게 정했다.
 */
export const DECK = {
  lower: { floor: 0.6, ceil: 2.36, win: [1.2, 1.95] },
  upper: { floor: 2.5, ceil: 4.2, win: [3.05, 3.75] },
};

const COMMON = { gap: 0.8, bottom: 1.0, windowHn: [0.52, 0.69], windows: { w: 1.5, pitch: 1.75 }, doors: 'ends', roofBoxes: true, articulated: false, doorColor: null };
const inBand = (hn, a, b) => hn >= a && hn < b;

/** ITX-마음: 빨강과 검정(data/facts.json ITX-마음 look). 위는 빨강, 아래와 창문 둘레는 짙은 회색, 지붕은 검정. */
function maumSpec(look) {
  const red = look.stripe;
  return {
    ...COMMON,
    set: 6,
    bottom: 0.95,
    sizes: { cab: [22, 3.1, 3.85], mid: [20, 3.1, 3.85] },
    windows: { w: 1.25, pitch: 1.5 },
    roofBoxes: false,
    paint(c) {
      if (c.f >= 0) {
        if (c.f > 0.08 && c.f < 0.62 && c.hn > 0.55 && c.hn < 0.93) return GLASS;
        if (c.hn > 0.93) return ROOF_BLACK;
        // 코 끝을 감싸는 짙은 회색, 가장자리에 빨간 테
        if (c.f > 0.7) return c.hn > 0.62 ? red : look.body;
        if (c.hn > 0.42) return red;
        return look.body;
      }
      if (c.hn > 0.93) return ROOF_BLACK;
      if (inBand(c.hn, 0.47, 0.74)) return look.band;
      if (c.hn >= 0.74) return red;
      if (inBand(c.hn, 0.36, 0.4)) return red;
      return look.body;
    },
  };
}

/**
 * ITX-청춘: 사용자 제공 사진(2026-11-21) 네 장으로 어림한 칠. 은회색 몸통, 지붕 쪽 연두 띠, 아래쪽 파랑·흰 줄과 짙은 회색 치마.
 * 앞은 유리 둘레가 검고 옆을 연두 띠가 감싼다. 4·5호차는 2층 칸(사용자가 알려 줌, 4호차 사진)으로 키가 크고 창이 두 줄이다.
 * 칸 크기와 편성은 나무위키 「ITX-청춘」 제원(2026-11-21, 사용자가 붙여 줌): 8량 1편성 TC-M'-M-T-T-M-M'-TC,
 * 길이 TC 20,405mm·나머지 19,500mm, 폭 3,120mm, 높이 1층 차량 3,750mm·2층 차량 4,410mm, 시트피치 980mm.
 */
function cheongchunSpec(look) {
  const GREEN = look.stripe;
  const BLUE = look.accent;
  const WHITE = '#F2F3F1';
  const SKIRT = '#5E6469';
  const FACE = '#23272B';
  return {
    ...COMMON,
    set: 8,
    bottom: 0.95,
    sizes: { cab: [20.405, 3.12, 3.75], mid: [19.5, 3.12, 3.75], deck: [19.5, 3.12, 4.41] },
    seatPitch: 0.98,
    deckCars: [3, 4],
    windows: { w: 1.25, pitch: 1.5 },
    paint(c) {
      if (c.f >= 0) {
        if (c.f > 0.08 && c.f < 0.62 && c.hn > 0.55 && c.hn < 0.9) return GLASS;
        if (c.hn > 0.94) return look.roof;
        if (c.hn > 0.5) return c.f < 0.12 ? GREEN : FACE;
        if (c.hn < 0.1) return SKIRT;
        return '#D5D8DB';
      }
      if (c.hn > 0.95) return look.roof;
      if (inBand(c.hn, 0.84, 0.95)) return GREEN;
      if (inBand(c.hn, 0.2, 0.25)) return BLUE;
      if (inBand(c.hn, 0.16, 0.2)) return WHITE;
      if (c.hn < 0.1) return SKIRT;
      return look.body;
    },
  };
}

/**
 * 무궁화호: 기관차가 객차를 끈다. 칠은 사진에서 본 구성만 따른다(로고, 번호는 넣지 않는다).
 * 기관차는 앞 위가 주황빛 빨강, 가운데 흰색, 아래 파랑. 객차는 크림색 바탕에 붉은 갈색 창문 띠와 파란 문.
 */
function mugunghwaSpec(look) {
  const ORANGE_RED = '#e4553f';
  const CREAM = '#e7e0c6';
  const BROWN_RED = '#8f3d2f';
  const SILVER = '#c3c8cd';
  return {
    ...COMMON,
    set: 20,
    gap: 0.9,
    doors: 'ends',
    doorColor: look.lower,
    sizes: { loco: [19.5, 3.0, 4.0], coach: [23.5, 2.95, 3.9] },
    windows: { w: 1.45, pitch: 1.7 },
    windowHn: [0.5, 0.7],
    paint(c) {
      if (c.role === 'loco') {
        if (c.f >= 0) {
          if (c.hn > 0.95) return SILVER;
          if (c.hn > 0.55) return ORANGE_RED;
          if (c.hn > 0.3) return '#f2f2ee';
          return look.lower;
        }
        if (c.hn > 0.93) return '#8e959c';
        if (c.hn < 0.26) return look.lower;
        // 옆면: 앞쪽은 파란 띠가 위로 올라가고 뒤로 갈수록 은색
        if (c.xn > 0.72 && c.hn > 0.6) return look.lower;
        if (c.xn > 0.82 && c.hn > 0.3) return look.lower;
        return SILVER;
      }
      if (c.hn > 0.93) return '#b9bcbf';
      if (c.hn < 0.06) return '#6f7275';
      if (inBand(c.hn, 0.47, 0.74)) return BROWN_RED;
      return CREAM;
    },
  };
}

/** 꼭짓점 색을 구운 조각들을 모은다 */
export class Parts {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }

  /** three 도형 하나를 한 색으로 넣는다 */
  add(geometry, color) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = flat.attributes.position.array;
    const n = flat.attributes.normal.array;
    const c = new Color(color);
    for (let i = 0; i < p.length; i++) {
      this.pos.push(p[i]);
      this.nor.push(n[i]);
    }
    for (let i = 0; i < p.length / 3; i++) this.col.push(c.r, c.g, c.b);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }

  box(l, h, w, x, y, z, color, rotZ = 0) {
    const g = new BoxGeometry(l, h, w);
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    this.add(g, color);
  }

  /** 두 점(x, y)을 잇는 막대 */
  rod(x1, y1, x2, y2, z, t, color) {
    this.box(Math.hypot(x2 - x1, y2 - y1), t, t, (x1 + x2) / 2, (y1 + y2) / 2, z, color, Math.atan2(y2 - y1, x2 - x1));
  }

  wheel(x, y, z, r, t, color) {
    const g = new CylinderGeometry(r, r, t, 14);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.add(g, color);
  }

  /**
   * 단면을 잇달아 이어 만든 몸통. 면마다 paint로 색을 정한다.
   * @param {Array<{x: number, w: number, y0: number, h: number, f: number}>} stations 뒤에서 앞 차례
   */
  loft(stations, paint, { capBack = true, capFront = true, xn = () => 0 } = {}) {
    const m = RING.length;
    const verts = [];
    for (const st of stations) {
      for (const [z, y] of RING) {
        verts.push(st.x, st.y0 + y * st.h, z * st.w);
      }
    }
    const index = [];
    const quad = []; // 삼각형마다 색을 정할 값(네모 하나의 두 삼각형은 같은 값: 띠가 톱니처럼 되지 않게)
    for (let i = 0; i + 1 < stations.length; i++) {
      for (let j = 0; j < m; j++) {
        const a = i * m + j;
        const b = i * m + ((j + 1) % m);
        const c = a + m;
        const d = b + m;
        index.push(a, c, b, b, c, d);
        const hn = (RING[j][1] + RING[(j + 1) % m][1]) / 2;
        const f0 = stations[i].f;
        const f1 = stations[i + 1].f;
        const f = f0 < 0 || f1 < 0 ? -1 : (f0 + f1) / 2;
        const v = { hn, f, xn: (xn(stations[i].x) + xn(stations[i + 1].x)) / 2 };
        quad.push(v, v);
      }
    }
    // 끝 막기: 고리를 따로 찍어(모서리가 둥글게 번지지 않게) 가운데에서 부채꼴로
    const cap = (st, front) => {
      const base = verts.length / 3;
      for (const [z, y] of RING) {
        verts.push(st.x, st.y0 + y * st.h, z * st.w);
      }
      // 가로 띠로 막는다: 오른쪽 점과 같은 높이의 왼쪽 점을 잇는다(앞면도 높이마다 칠할 수 있게)
      const H = HALF.length;
      const left = (k) => (k === 0 || k === H - 1 ? k : m - k);
      for (let k = 0; k + 1 < H; k++) {
        const a = base + k;
        const b = base + k + 1;
        const a2 = base + left(k);
        const b2 = base + left(k + 1);
        const v = { hn: (HALF[k][1] + HALF[k + 1][1]) / 2, f: st.f, xn: xn(st.x) };
        if (front) {
          index.push(a, b2, b);
          quad.push(v);
          if (a2 !== a) {
            index.push(a, a2, b2);
            quad.push(v);
          }
        } else {
          index.push(a, b, b2);
          quad.push(v);
          if (a2 !== a) {
            index.push(a, b2, a2);
            quad.push(v);
          }
        }
      }
    };
    if (capBack) cap(stations[0], false);
    if (capFront) cap(stations.at(-1), true);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    g.setIndex(index);
    g.computeVertexNormals();
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    const color = new Color();
    for (let t = 0; t < index.length; t += 3) {
      const ids = [index[t], index[t + 1], index[t + 2]];
      color.set(paint(quad[t / 3]));
      for (const id of ids) {
        this.pos.push(pos[id * 3], pos[id * 3 + 1], pos[id * 3 + 2]);
        this.nor.push(nor[id * 3], nor[id * 3 + 1], nor[id * 3 + 2]);
        this.col.push(color.r, color.g, color.b);
      }
    }
    g.dispose();
  }

  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * 편성: 앞에서부터 칸마다 할 일과 크기.
 * @returns {Array<{role: string, length: number, width: number, height: number, nose: (null|'front'|'back'), lead: boolean, tail: boolean, gapAfter: number, bogies: Array<{x: number, axles: number}>, panto: (null|'up'|'down')}>}
 */
export function formation(look, count, name = '') {
  const kind = name === 'ITX-마음' ? 'maum' : name === 'ITX-청춘' ? 'cheongchun' : NOSE[look.nose] ? look.nose : 'flat';
  const spec = specOf(kind, look);
  const n = Math.max(2, Math.min(20, Math.round(count)));
  // 몇 편성을 이어 달리는지(산천 20칸은 10칸 두 편성)
  const sets = [];
  let left = n;
  while (left > 0) {
    const size = left > spec.set && left - spec.set >= 2 ? spec.set : left;
    sets.push(size);
    left -= size;
  }
  const electric = look.power === 'electric';
  const cars = [];
  sets.forEach((size, s) => {
    const roles = [];
    if (kind === 'tgv' || kind === 'sancheon') {
      for (let i = 0; i < size; i++) {
        if (i === 0 || i === size - 1) roles.push('power');
        else if (kind === 'tgv' && (i === 1 || i === size - 2)) roles.push('paxPower');
        else roles.push('pax');
      }
    } else if (kind === 'loco') {
      for (let i = 0; i < size; i++) roles.push(i === 0 && s === 0 ? 'loco' : 'coach');
    } else {
      for (let i = 0; i < size; i++) roles.push(i === 0 || i === size - 1 ? 'cab' : spec.deckCars?.includes(i) ? 'deck' : 'mid');
    }
    roles.forEach((role, i) => {
      const [length, width, height] = spec.sizes[role];
      const first = i === 0;
      const last = i === size - 1;
      let nose = null;
      if (kind === 'loco') nose = role === 'loco' ? 'front' : null;
      else if (first) nose = 'front';
      else if (last) nose = 'back';
      // 대차: 관절 열차의 객차는 칸 사이에 대차 하나를 함께 쓴다(뒤 칸 쪽 이음매에 둔다)
      const bogies = [];
      const ax = role === 'loco' ? 3 : 2;
      const inset = role === 'loco' ? 4.2 : role === 'power' ? 3.4 : 2.6;
      if (spec.articulated && role !== 'power') {
        const prevPower = roles[i - 1] === 'power';
        const nextPower = roles[i + 1] === 'power';
        if (prevPower) bogies.push({ x: length / 2 - inset, axles: 2 });
        if (nextPower) bogies.push({ x: -length / 2 + inset, axles: 2 });
        else bogies.push({ x: -length / 2 - spec.gap / 2, axles: 2 });
      } else {
        // 그물은 코를 늘 +x 쪽에 만든다(뒤를 보는 칸은 나중에 돌린다). 코 밑 대차는 조금 안쪽에.
        bogies.push({ x: length / 2 - inset - (nose ? 1.2 : 0), axles: ax });
        bogies.push({ x: -length / 2 + inset, axles: ax });
      }
      // 팬터그래프: 동력차는 뒤 동력차만 올린다. 전동차는 둘째 칸과 끝에서 둘째 칸.
      let panto = null;
      if (electric) {
        if (role === 'power') panto = last ? 'up' : 'down';
        else if ((role === 'mid' && (i === 1 || i === size - 2)) || (role === 'cab' && size <= 2 && first)) panto = 'up';
        else if (kind === 'loco' && role === 'loco') panto = 'up';
      }
      cars.push({
        role,
        kind,
        length,
        width,
        height,
        nose,
        lead: s === 0 && first,
        tail: s === sets.length - 1 && last,
        gapAfter: last && s === sets.length - 1 ? 0 : last ? 0.9 : spec.gap,
        bogies,
        panto,
        hasGangway: !(last && s === sets.length - 1) && !(last && nose === 'back'),
      });
    });
  });
  return { cars, spec, kind };
}

/** 칸 바닥(차체 아래 끝) 높이: 치마가 있는 고속열차는 낮다 */
export const bodyBottom = (car, spec) => (car.role === 'loco' || car.role === 'coach' ? 1.05 : spec.bottom);

/**
 * 옆면의 창문과 문 자리(칸 안 좌표, 코가 +x). 차 밖 그물과 3D 객실이 함께 쓴다.
 * @returns {{by: number, span: number, winY: number, winH: number, doorW: number, doors: number[], windows: Array<{x: number, w: number}>, passenger: boolean, rear: number, bodyFront: number}}
 */
export function sideLayout(car, spec) {
  const { length: Lc, height: H } = car;
  const by = bodyBottom(car, spec);
  const span = H - by;
  const noseLen = car.nose !== null ? NOSE[car.kind].length : 0;
  const rear = -Lc / 2;
  const bodyFront = Lc / 2 - noseLen;
  const [w0, w1] = spec.windowHn;
  const winY = by + span * ((w0 + w1) / 2);
  const winH = span * (w1 - w0);
  const doorW = 0.95;
  const doors = [];
  const passenger = car.role !== 'power' && car.role !== 'loco';
  const windows = [];
  if (passenger) {
    doors.push(rear + 1.4);
    if (spec.doors !== 'one' && !(car.nose === 'front' && noseLen > 3)) doors.push(bodyFront - 1.4);
    const start = rear + 2.4;
    const end = bodyFront - (car.nose === 'front' ? 1.2 : 2.2);
    const { w, pitch } = spec.windows;
    for (let x = start; x + w <= end; x += pitch) {
      const cx = x + w / 2;
      if (doors.some((d) => Math.abs(d - cx) < doorW / 2 + w / 2 + 0.25)) continue;
      windows.push({ x: cx, w });
    }
  }
  return { by, span, winY, winH, doorW, doors, windows, passenger, rear, bodyFront };
}

/** 한 칸의 그물(같은 모양이면 함께 쓴다) */
function carGeometry(car, spec, look) {
  const parts = new Parts();
  const { length: Lc, width: W, height: H, kind } = car;
  const shape = NOSE[kind];
  const by = car.role === 'loco' || car.role === 'coach' ? 1.05 : spec.bottom;
  const span = H - by;
  const hasNose = car.nose !== null;
  const noseLen = hasNose ? shape.length : 0;
  const rear = -Lc / 2;
  const bodyFront = Lc / 2 - noseLen;
  const paint = (c) => spec.paint({ ...c, role: car.role });
  const xn = (x) => (x - rear) / Lc;

  // 몸통 + 코(코는 늘 +x 쪽에 만들고, 뒤를 보는 칸은 통째로 돌린다)
  const stations = [{ x: rear, w: W, y0: by, h: span, f: -1 }, { x: bodyFront, w: W, y0: by, h: span, f: -1 }];
  if (hasNose) {
    for (let k = 1; k <= shape.steps; k++) {
      const f = k / shape.steps;
      const lift = shape.rise * span * f ** 3;
      stations.push({ x: bodyFront + noseLen * f, w: W * shape.wide(f), y0: by + lift, h: span * shape.top(f) - lift, f });
    }
    // 코끝을 둥글게: 끝 단면을 반지름 round만큼 앞으로 내밀며 줄인다(코 길이 안에서)
    const tip = stations.at(-1);
    const R = shape.round;
    const shift = R; // 둥근 끝이 코 길이를 넘지 않게 전체를 뒤로 민다
    for (const st of stations) if (st.f > 0) st.x -= shift * st.f;
    tip.x = Lc / 2 - R;
    for (let k = 1; k <= 4; k++) {
      const a = (k / 4) * (Math.PI / 2) * 0.92;
      const c = Math.cos(a);
      const hk = shape.bevel ? 0.86 + 0.14 * c : c;
      const wk = shape.bevel ? 0.9 + 0.1 * c : 0.35 + 0.65 * c;
      stations.push({ x: tip.x + R * Math.sin(a), w: tip.w * wk, y0: tip.y0 + (tip.h * (1 - hk)) / 2, h: tip.h * hk, f: 1 });
    }
    if (shape.frontGlass) {
      const end = stations.at(-1);
      const [g0, g1, gw] = shape.frontGlass;
      parts.box(0.05, end.h * (g1 - g0), end.w * gw, end.x + 0.02, end.y0 + end.h * ((g0 + g1) / 2), 0, GLASS);
      // 유리 가운데 기둥
      parts.box(0.07, end.h * (g1 - g0), 0.12, end.x + 0.04, end.y0 + end.h * ((g0 + g1) / 2), 0, DARK);
    }
    // 코 시작 바로 앞도 코로 칠한다(띠가 이어지게)
    stations[1] = { ...stations[1], f: 0 };
  }
  parts.loft(stations, paint, { xn });

  // 창문, 문
  const sideZ = W / 2 + 0.012;
  const { winY, winH, doorW, doors, windows, passenger } = sideLayout(car, spec);
  for (const side of [-1, 1]) {
    // 문간(어두운 구멍). 문짝은 따로 움직이는 그물이다(doorPanel).
    for (const dx of doors) parts.box(doorW - 0.02, span * 0.72, 0.02, dx, by + span * 0.38, side * (sideZ + 0.002), '#15171a');
    if (passenger) {
      if (car.role === 'deck') {
        // 2층 칸: 아래층·위층 창 두 줄
        for (const { win: [a, b] } of [DECK.lower, DECK.upper]) for (const win of windows) parts.box(win.w, b - a, 0.04, win.x, (a + b) / 2, side * sideZ, GLASS);
      } else {
        for (const win of windows) parts.box(win.w, winH, 0.04, win.x, winY, side * sideZ, GLASS);
      }
    } else {
      // 동력차·기관차: 기계실 바람 구멍(옆 창살)
      const grilleY = by + span * 0.43;
      for (let k = 0; k < 3; k++) {
        const gx = rear + 3 + k * 3.6;
        parts.box(2.8, span * 0.22, 0.03, gx, grilleY, side * sideZ, shade(paint({ hn: 0.43, f: -1, xn: 0.3 }), 0.2));
        for (let s = 0; s < 5; s++) parts.box(2.7, 0.04, 0.045, gx, grilleY - span * 0.09 + s * span * 0.045, side * sideZ, DARK);
      }
    }
    // 운전실 옆 창
    if (hasNose) parts.box(1.0, winH * 1.1, 0.04, bodyFront - 0.7, by + span * 0.7, side * sideZ, GLASS);
  }

  // 대차와 바퀴
  for (const b of car.bogies) {
    const r = 0.46;
    const spacing = b.axles === 3 ? 1.9 : 2.6;
    const half = (spacing * (b.axles - 1)) / 2;
    for (const side of [-1, 1]) {
      parts.box(half * 2 + 1.3, 0.34, 0.14, b.x, 0.62, side * 1.02, UNDER);
      for (let a = 0; a < b.axles; a++) parts.wheel(b.x - half + a * spacing, r, side * 0.75, r, 0.13, WHEEL);
      // 축 상자
      for (let a = 0; a < b.axles; a++) parts.box(0.38, 0.32, 0.18, b.x - half + a * spacing, r, side * 1.0, DARK);
    }
    parts.box(1.0, 0.3, W * 0.72, b.x, 0.88, 0, UNDER);
  }
  // 바닥 밑 기기(치마가 없는 칸)
  if (by >= 1.0) {
    const xs = car.bogies.map((b) => b.x).sort((a, b) => a - b);
    const a = (xs[0] ?? rear) + 2.2;
    const b = (xs.at(-1) ?? bodyFront) - 2.2;
    if (b - a > 2) {
      parts.box(b - a, 0.5, W * 0.78, (a + b) / 2, by - 0.27, 0, UNDER);
      for (let x = a + 1; x < b - 1; x += 2.6) parts.box(1.6, 0.42, W * 0.82, x, by - 0.3, 0, DARK);
    }
  }
  // 칸 사이 통로(주름막)
  if (car.hasGangway) {
    const gl = (car.gapAfter || 0.8) + 0.4;
    parts.box(gl, span * 0.8, W * 0.84, rear - gl / 2 + 0.2, by + span * 0.45, 0, DARK);
  }
  // 지붕 위 냉방기(일반 전동차·객차)
  if (spec.roofBoxes && passenger) {
    for (const x of [rear + Lc * 0.25, rear + Lc * 0.72]) parts.box(2.6, 0.32, W * 0.55, x, H + 0.12, 0, shade(look.roof, 0.18));
  }
  // 팬터그래프(한 팔 모양)
  if (car.panto) {
    const px = car.role === 'power' || car.role === 'loco' ? rear + Lc * 0.3 : rear + Lc * 0.5;
    const base = H + 0.05;
    const top = car.panto === 'up' ? 5.3 : base + 0.42;
    const knee = car.panto === 'up' ? 1.0 : 1.9;
    parts.box(2.0, 0.22, 1.4, px, base + 0.11, 0, DARK);
    for (const z of [-0.5, 0.5]) parts.box(0.18, 0.28, 0.18, px, base + 0.25, z * 1.2, '#c9c2a8');
    parts.rod(px - 0.9, base + 0.3, px + knee, (base + top) / 2 + 0.05, 0, 0.1, '#9aa0a6');
    parts.rod(px + knee, (base + top) / 2 + 0.05, px - 0.3, top - 0.06, 0, 0.08, '#9aa0a6');
    parts.box(0.32, 0.1, 1.9, px - 0.3, top - 0.03, 0, '#7d8288');
  }
  // 고속열차 지붕 덮개(동력차 위 낮은 턱)
  if (car.role === 'power') parts.box(Lc * 0.45, 0.16, W * 0.5, rear + Lc * 0.3, H + 0.02, 0, look.roof === ROOF_BLACK ? ROOF_BLACK : shade(look.roof, 0.1));

  return parts.geometry();
}

/** 문짝 하나(문 색 + 창). 문 가운데가 원점이다. */
function doorPanel(car, spec) {
  const { by, span, winY, winH, doorW } = sideLayout(car, spec);
  const parts = new Parts();
  const cy = by + span * 0.38;
  const color = spec.doorColor ?? shade(spec.paint({ hn: 0.4, f: -1, xn: 0.5, role: car.role }), 0.12);
  parts.box(doorW, span * 0.74, 0.03, 0, 0, 0, color);
  parts.box(0.5, winH * 0.8, 0.04, 0, winY - cy, 0.004, GLASS);
  parts.box(0.5, winH * 0.8, 0.04, 0, winY - cy, -0.004, GLASS);
  return { geometry: parts.geometry(), cy };
}

/** 앞 불빛 자리(칸 안 좌표, 코가 +x에 있을 때) */
function lampSpots(car) {
  const shape = NOSE[car.kind];
  const by = car.role === 'loco' || car.role === 'coach' ? 1.05 : 1;
  const span = car.height - by;
  if (car.nose === null) {
    // 코 없는 끝(무궁화 끝 객차 뒤): 납작한 끝에 불빛
    return [-1, 1].map((s) => [-car.length / 2 - 0.02, by + span * 0.35, s * car.width * 0.33]);
  }
  const f = car.kind === 'flat' || car.kind === 'loco' || car.kind === 'itx' || car.kind === 'cheongchun' ? 0.9 : car.kind === 'maum' ? 0.85 : 0.8;
  const x = car.length / 2 - shape.round - (shape.length - shape.round) * (1 - f) + 0.05;
  const lift = shape.rise * span * f ** 3;
  const y = by + lift + (span * shape.top(f) - lift) * 0.42;
  const z = (car.width * shape.wide(f)) / 2 - 0.25;
  return [-1, 1].map((s) => [x, y, s * z]);
}

/**
 * 기차 한 편성을 만든다.
 * @returns {{cars: Array<{group: Group, length: number, gapAfter: number}>, dispose: () => void}}
 */
export function buildTrain(look, count, { material, headMaterial, tailMaterial, name = '' }) {
  const { cars, spec } = formation(look, count, name);
  const cache = new Map();
  const lampGeometry = new BoxGeometry(0.16, 0.28, 0.5);
  const out = cars.map((car) => {
    const key = JSON.stringify([car.role, car.length, car.nose !== null, car.bogies, car.panto, car.hasGangway, car.gapAfter]);
    if (!cache.has(key)) cache.set(key, carGeometry(car, spec, look));
    const group = new Group();
    const inner = new Group();
    const body = new Mesh(cache.get(key), material);
    inner.add(body);
    // 앞 불빛(맨 앞)과 꼬리 불빛(맨 뒤)
    const lightMat = car.lead ? headMaterial : car.tail ? tailMaterial : null;
    if (lightMat) {
      for (const [x, y, z] of lampSpots(car)) {
        const lamp = new Mesh(lampGeometry, lightMat);
        lamp.position.set(x, y, z);
        inner.add(lamp);
      }
    }
    // 문짝: 양옆 문마다. 승강장 쪽 문만 열린다(setDoors).
    const doors = [];
    const layout = sideLayout(car, spec);
    if (layout.doors.length) {
      const dkey = JSON.stringify(['door', car.role, car.length, car.width, car.height]);
      if (!cache.has(dkey)) cache.set(dkey, doorPanel(car, spec));
      const panel = cache.get(dkey);
      for (const side of [-1, 1]) {
        for (const dx of layout.doors) {
          const m = new Mesh(panel.geometry, material);
          const base = [dx, panel.cy, side * (car.width / 2 + 0.03)];
          m.position.set(...base);
          inner.add(m);
          // 뒤를 보는 칸(안쪽을 돌린 칸)은 그물의 옆이 바뀐다: 칸 바깥에서 본 옆(-1 = 가는 쪽 왼편)
          doors.push({ mesh: m, base, side: car.nose === 'back' ? -side : side, slide: dx < 0 ? 1 : -1, width: layout.doorW });
        }
      }
    }
    if (car.nose === 'back') inner.rotation.y = Math.PI;
    group.add(inner);
    return { group, inner, body, car, doors, length: car.length, gapAfter: car.gapAfter };
  });
  return {
    cars: out,
    spec,
    /**
     * 문을 연다(0 닫힘 ~ 1 다 열림). 먼저 조금 밖으로 나온 뒤 옆으로 민다(밀어 여는 문).
     * @param {number} amount
     * @param {number} side 열 쪽(가는 쪽 왼편 = -1, 오른편 = 1)
     */
    setDoors(amount, side = -1) {
      const pop = Math.min(1, amount * 3);
      const slide = Math.max(0, (amount - 0.3) / 0.7);
      for (const c of out) {
        for (const d of c.doors) {
          const open = d.side === side ? 1 : 0;
          const zSign = Math.sign(d.base[2]);
          d.mesh.position.set(d.base[0] + d.slide * d.width * 0.95 * slide * open, d.base[1], d.base[2] + zSign * 0.07 * pop * open);
        }
      }
    },
    dispose() {
      for (const g of cache.values()) (g.geometry ?? g).dispose(); // 문짝은 {geometry, cy}
      lampGeometry.dispose();
    },
  };
}
