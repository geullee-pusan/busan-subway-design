// 기차 3D 객실: 승객이 탄 칸 안을 짓는다. 창문 너머로는 3D 바깥(땅, 터널, 다리, 역)이 그대로 지나간다.
// 색은 객실 그림(src/ui/train-interior.js INTERIOR)과 같다. 칸 안 좌표는 차량과 같다(x 앞, y 레일 윗면에서 위, z 옆).
// 2층 칸(ITX-청춘 4·5호차)은 1층과 2층 두 방을 짓고 계단으로 잇는다. 층을 옮기면 눈(카메라)과 주인공이 계단을 따라 간다.
import { BufferAttribute, CanvasTexture, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace, Shape, BoxGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DARK, DECK, GLASS, Parts, shade, sideLayout } from './train-3d-cars.js';
import { cabinFabric, cabinFloor, cabinPanel } from './train-3d-textures.js';

/** 바닥 높이(레일 윗면에서, 미터) */
export const CABIN_FLOOR = 1.1;
/** 아이 눈높이(바닥에서, 미터) */
const EYE = 1.1;
/** 주인공 키(미터)와 카메라에서 떨어진 거리 */
const HERO_TALL = 1.25;
const HERO_AHEAD = 3.2;
/** 층을 옮길 때 걸리는 시간(초, 우리가 정한 값) */
const CLIMB_SECONDS = 4.5;

/**
 * 무늬를 입히는 조각 묶음: 면마다 가장 크게 향한 축에 맞춰 평면으로 무늬 자리(uv)를 정한다(미터 / tile).
 * 그래서 크기가 다른 상자들도 무늬 크기가 같다.
 */
class TexParts extends Parts {
  constructor(tile) {
    super();
    this.tile = tile;
    this.uv = [];
  }

  add(geometry, color) {
    const from = this.pos.length;
    super.add(geometry, color);
    for (let i = from; i < this.pos.length; i += 3) {
      const x = this.pos[i];
      const y = this.pos[i + 1];
      const z = this.pos[i + 2];
      const ax = Math.abs(this.nor[i]);
      const ay = Math.abs(this.nor[i + 1]);
      const az = Math.abs(this.nor[i + 2]);
      const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
      this.uv.push(u / this.tile, v / this.tile);
    }
  }

  geometry() {
    const g = super.geometry();
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    return g;
  }
}

/**
 * 객실 조각 묶음: base(무늬 없음: 틀, 금속, 어두운 곳), seat·cushion(좌석 천), panel(벽·천장 판), floor(바닥).
 * 천은 무늬 그림이 색을 갖고(꼭짓점 색은 흰색), 판과 바닥은 옅은 이음새·잔점 그림을 꼭짓점 색에 곱한다.
 */
function cabinKit(inside) {
  return {
    base: new Parts(),
    seat: new TexParts(0.3),
    cushion: new TexParts(0.3),
    panel: new TexParts(1.25),
    floor: new TexParts(0.6),
    inside,
  };
}

/** 조각 묶음을 그물로: 무늬 그림과 재질을 만든다. dispose로 함께 지운다. */
function kitMeshes(kit, material) {
  const { inside } = kit;
  const textures = [cabinFabric(inside.seat, inside), cabinFabric(inside.cushion, inside), cabinPanel(), cabinFloor()];
  const mats = textures.map((map) => new MeshLambertMaterial({ vertexColors: true, map }));
  const meshes = [new Mesh(kit.base.geometry(), material)];
  [kit.seat, kit.cushion, kit.panel, kit.floor].forEach((k, i) => {
    if (k.pos.length) meshes.push(new Mesh(k.geometry(), mats[i]));
  });
  return {
    meshes,
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const m of mats) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

/** 둥근 모서리 상자 */
function rounded(l, h, w, r) {
  const rr = Math.min(r, l / 2 - 0.001, h / 2 - 0.001, w / 2 - 0.001);
  return new RoundedBoxGeometry(l, h, w, 1, Math.max(0.001, rr));
}

/** 옆모습(x 앞, y 위)을 z로 밀어 만든 도형. 모서리를 조금 둥글린다. 가운데가 z = 0. 점이 4개 값이면 곡선(조절점, 끝점). */
function extrudeSide(points, depth, bevel) {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.length === 4) shape.quadraticCurveTo(pt[0], pt[1], pt[2], pt[3]);
    else shape.lineTo(pt[0], pt[1]);
  }
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return g;
}

/** 등받이 껍데기 옆모습: 허리가 볼록하고 위가 둥글다(뒤 -x, 앞 +x, 바닥 y = 0, 우리가 정한 모양) */
const BACK_SHELL = [[-0.06, 0], [0.045, 0], [0.085, 0.2, 0.06, 0.38], [0.05, 0.62], [0.05, 0.75, -0.005, 0.76], [-0.06, 0.76, -0.06, 0.66], [-0.06, 0]];
/** 등받이 앞 천(껍데기 앞에 붙는 쿠션) */
const BACK_PAD = [[0.03, 0.05], [0.04, 0.05], [0.1, 0.22, 0.078, 0.38], [0.068, 0.63], [0.05, 0.66], [0.035, 0.63], [0.045, 0.38], [0.03, 0.05]];

/** 창틀: 둥근 모서리 네모 테두리(x 가로, y 세로, z로 두께). 가운데가 원점. */
function windowFrame(w, h, r, band, depth) {
  const rr = (shape, x0, y0, x1, y1, rad) => {
    shape.moveTo(x0 + rad, y0);
    shape.lineTo(x1 - rad, y0);
    shape.quadraticCurveTo(x1, y0, x1, y0 + rad);
    shape.lineTo(x1, y1 - rad);
    shape.quadraticCurveTo(x1, y1, x1 - rad, y1);
    shape.lineTo(x0 + rad, y1);
    shape.quadraticCurveTo(x0, y1, x0, y1 - rad);
    shape.lineTo(x0, y0 + rad);
    shape.quadraticCurveTo(x0, y0, x0 + rad, y0);
  };
  const outer = new Shape();
  rr(outer, -w / 2 - band, -h / 2 - band, w / 2 + band, h / 2 + band, r + band * 0.6);
  const hole = new Shape();
  rr(hole, -w / 2, -h / 2, w / 2, h / 2, r);
  outer.holes.push(hole);
  const g = new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** 행선 안내판(글자를 캔버스에 그린 그림) */
function displayBoard(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const draw = (lines) => {
    const g = canvas.getContext('2d');
    g.fillStyle = '#121418';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = kind === 'led' ? '#ff9a3c' : '#ffffff';
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const rows = lines.slice(0, 2);
    rows.forEach((line, i) => g.fillText(line, 256, rows.length === 1 ? 48 : 26 + i * 44, 490));
    texture.needsUpdate = true;
  };
  draw([]);
  return { texture, draw };
}

/**
 * 판 하나(바닥·천장). hole이 있으면 가운데(복도 쪽) 그 x 구간을 비운다(계단 구멍).
 * @param {Parts} parts
 */
function slab(parts, x0, x1, y, h, halfW, color, hole = null) {
  if (!hole) {
    parts.box(x1 - x0, h, halfW * 2, (x0 + x1) / 2, y, 0, color);
    return;
  }
  const a = Math.max(x0, hole.x0);
  const b = Math.min(x1, hole.x1);
  if (a - x0 > 0.01) parts.box(a - x0, h, halfW * 2, (x0 + a) / 2, y, 0, color);
  if (x1 - b > 0.01) parts.box(x1 - b, h, halfW * 2, (b + x1) / 2, y, 0, color);
  const sideW = halfW - hole.halfW;
  for (const s of [-1, 1]) parts.box(b - a, h, sideW, (a + b) / 2, y, s * (hole.halfW + sideW / 2), color);
}

/**
 * 객실 방 하나: 바닥, 천장, 양옆 벽과 창 구멍, 앞뒤 끝 벽, 좌석(2 + 2, 모두 앞을 본다).
 * @param {Parts} parts
 * @param {object} o
 * @param {number} o.x0 방 뒤 끝, o.x1 방 앞 끝
 * @param {number} o.fy 바닥, o.cy 천장
 * @param {number} o.winBottom 창 아래, o.winTop 창 위
 * @param {Array<{x: number, w: number}>} o.windows 바깥 창 자리
 * @param {object} o.inside 객실 색
 * @param {number} o.halfW 안쪽 벽(가운데에서)
 * @param {'doors'|'plain'|'open'} o.rearEnd 뒤 끝 벽(문 있는 벽, 막힌 벽, 없음) o.frontEnd 앞 끝 벽
 * @param {boolean} o.rack 짐 선반
 * @param {number} o.seatFrom 첫 좌석 줄(x)
 * @param {number} o.pitch 좌석 줄 사이
 * @param {{x0: number, x1: number, halfW: number}|null} o.floorHole 바닥 구멍, o.ceilHole 천장 구멍
 */
function addRoom(kit, o) {
  const parts = kit.base;
  const { x0, x1, fy, cy, winBottom, winTop, inside, halfW: iw } = o;
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  const winMid = (winBottom + winTop) / 2;
  const widen = 0.25;
  const wall = inside.wall;
  const wallLow = shade(wall, 0.06);

  // 바닥: 가운데 복도는 조금 다른 색
  slab(kit.floor, x0, x1, fy - 0.05, 0.1, iw, inside.floor, o.floorHole);
  slab(kit.floor, x0, x1, fy + 0.006, 0.012, 0.31, shade(inside.floor, 0.18), o.floorHole);
  // 천장과 비스듬한 어깨(o.cove: 2층 칸 위층은 지붕 바로 아래라 어깨가 크다)
  const coveW = o.cove?.w ?? 0.42;
  const coveDrop = o.cove?.drop ?? 0.32;
  slab(kit.panel, x0, x1, cy, 0.06, iw - coveW, inside.ceiling, o.ceilHole);
  for (const s of [-1, 1]) {
    const g = new BoxGeometry(len, 0.05, Math.hypot(coveW, coveDrop));
    g.rotateX(s * Math.atan2(coveDrop, coveW));
    g.translate(mid, cy - coveDrop / 2, s * (iw - coveW / 2));
    kit.panel.add(g, shade(inside.ceiling, 0.06));
  }
  // 양옆 벽: 창 아래, 창 위, 창 사이 기둥(창 자리는 비워 둔다: 바깥이 보인다)
  const rackY = cy - 0.55;
  for (const s of [-1, 1]) {
    const z = s * iw;
    kit.panel.box(len, winBottom - fy, 0.06, mid, (fy + winBottom) / 2, z, wallLow);
    if (cy - coveDrop - winTop > 0.005) kit.panel.box(len, cy - coveDrop - winTop, 0.06, mid, (winTop + cy - coveDrop) / 2, z, wall);
    const holes = o.windows
      .map((w) => ({ x: w.x, w: w.w + widen }))
      .filter((w) => w.x - w.w / 2 > x0 && w.x + w.w / 2 < x1)
      .sort((a, b) => a.x - b.x);
    let from = x0;
    for (const h of holes) {
      const to = h.x - h.w / 2;
      if (to - from > 0.01) kit.panel.box(to - from, winTop - winBottom, 0.06, (from + to) / 2, winMid, z, wall);
      // 창턱(안쪽으로 조금 깊게)과 둥근 모서리 창틀(구멍 네 귀를 둥글게 가린다)
      parts.box(h.w + 0.06, 0.05, 0.14, h.x, winBottom + 0.02, z - s * 0.05, shade(wall, 0.15));
      const frame = windowFrame(h.w - 0.02, winTop - winBottom - 0.02, 0.13, 0.05, 0.03);
      frame.translate(h.x, winMid, z - s * 0.035);
      parts.add(frame, shade(wall, 0.1));
      from = h.x + h.w / 2;
    }
    if (x1 - from > 0.01) kit.panel.box(x1 - from, winTop - winBottom, 0.06, (from + x1) / 2, winMid, z, wall);
    if (o.rack) {
      // 짐 선반과 그 아래 불빛 띠
      parts.box(len, 0.05, 0.42, mid, rackY, s * (iw - 0.24), shade(inside.ceiling, 0.12));
      parts.box(len, 0.08, 0.03, mid, rackY + 0.02, s * (iw - 0.45), shade(inside.ceiling, 0.25));
      if (inside.trim) parts.box(len, 0.05, 0.02, mid, rackY - 0.06, s * (iw - 0.02), inside.trim);
    }
  }
  // 앞뒤 끝 벽: 문이 있는 벽(가운데 문) 또는 막힌 벽
  const doorW = 0.9;
  const doorH = Math.min(1.9, cy - fy - 0.15);
  for (const [x, dir, end] of [[x1, 1, o.frontEnd], [x0, -1, o.rearEnd]]) {
    if (end === 'open') continue;
    if (end === 'plain') {
      kit.panel.box(0.08, cy - fy, iw * 2, x, (fy + cy) / 2, 0, wall);
      continue;
    }
    const sideW = iw - doorW / 2;
    for (const s of [-1, 1]) kit.panel.box(0.08, cy - fy, sideW, x, (fy + cy) / 2, s * (doorW / 2 + sideW / 2), wall);
    kit.panel.box(0.08, cy - fy - doorH, doorW, x, fy + doorH + (cy - fy - doorH) / 2, 0, wall);
    const doorColor = inside.door ?? shade(wall, 0.22);
    parts.box(0.05, doorH, doorW - 0.04, x + dir * 0.02, fy + doorH / 2, 0, doorColor);
    parts.box(0.06, 0.7, 0.42, x - dir * 0.005, fy + 1.3, 0, GLASS);
  }
  // 좌석: 2 + 2, 모두 앞(+x)을 본다. 카메라에서는 등받이 뒤가 보인다.
  const seatW = 0.47;
  const aisle = 0.31; // 복도 반쪽
  const shell = inside.shell ?? inside.seatDark;
  for (let x = o.seatFrom; x < x1 - 0.5; x += o.pitch) {
    for (const s of [-1, 1]) {
      for (const k of [0, 1]) {
        const z = s * (aisle + seatW / 2 + k * (seatW + 0.02));
        // 앉는 자리(둥근 방석), 등받이 껍데기(허리가 볼록하고 위가 둥글다, 조금 뒤로 기운다), 등받이 앞 천,
        // 머리받침 덮개, 등받이 뒤 그물 주머니
        const cushion = rounded(0.48, 0.13, seatW - 0.02, 0.045);
        cushion.translate(x, fy + 0.46, z);
        kit.cushion.add(cushion, '#ffffff');
        const back = extrudeSide(BACK_SHELL, seatW - 0.02, 0.018);
        back.rotateZ(0.13);
        back.translate(x - 0.25, fy + 0.5, z);
        parts.add(back, shell);
        const front = extrudeSide(BACK_PAD, seatW - 0.07, 0.014);
        front.rotateZ(0.13);
        front.translate(x - 0.25, fy + 0.5, z);
        kit.seat.add(front, '#ffffff');
        if (inside.cover) {
          // coverFrontOnly: 덮개가 앞쪽(앉는 쪽)에만 있다(뒤에서는 안 보인다)
          const frontOnly = inside.coverFrontOnly;
          const cover = rounded(frontOnly ? 0.02 : 0.15, inside.coverShort ? 0.14 : 0.22, seatW - 0.05, 0.03);
          cover.translate(frontOnly ? 0.09 : 0, 0.66, 0);
          cover.rotateZ(0.13);
          cover.translate(x - 0.25, fy + 0.5, z);
          parts.add(cover, inside.cover);
        }
        if (inside.net || inside.magazine) {
          const net = new BoxGeometry(0.02, 0.26, seatW - 0.14);
          net.translate(-0.08, 0.3, 0);
          net.rotateZ(0.13);
          net.translate(x - 0.25, fy + 0.5, z);
          parts.add(net, inside.netFill ?? inside.pocket ?? DARK);
        }
      }
      // 팔걸이(바깥쪽과 복도 쪽), 다리
      for (const az of [aisle + 0.01, aisle + seatW * 2 + 0.03]) {
        const arm = rounded(0.42, 0.055, 0.06, 0.025);
        arm.translate(x - 0.02, fy + 0.66, s * az);
        parts.add(arm, shade(shell, 0.2));
      }
      parts.box(0.3, 0.4, seatW * 2 - 0.1, x - 0.05, fy + 0.2, s * (aisle + seatW + 0.01), DARK);
    }
  }
  return { len, mid, coveW, doorH };
}

/** 천장 불빛 띠와 행선 안내판(조명을 받지 않는 재질). 방마다 하나씩. */
function addLights(group, rooms, glow, lightGeos, boardMat, boardGeo, iw) {
  for (const r of rooms) {
    const geo = new BoxGeometry(r.len - 0.4, 0.02, 0.22);
    lightGeos.push(geo);
    for (const s of [-1, 1]) {
      const strip = new Mesh(geo, glow);
      strip.position.set(r.mid, r.cy - 0.04, s * (iw - r.coveW - 0.2));
      group.add(strip);
    }
    const sign = new Mesh(boardGeo, boardMat);
    sign.position.set(r.x1 - 0.05, r.signY, 0);
    sign.rotation.y = -Math.PI / 2;
    group.add(sign);
  }
}

/**
 * 한 칸의 객실.
 * @param {object} car formation()의 칸
 * @param {object} spec 열차 종류 차량 값(train-3d-cars.js)
 * @param {object} inside 객실 색(INTERIOR[종류])
 * @param {import('three').Material} material 꼭짓점 색 재질
 * @returns {{group: Group, eye: number[], target: number[], hero: {x: number, y: number, z: number, scale: number}, levels: number, level: number, setLevel: (level: number, instant?: boolean) => boolean, update: (dt: number) => void, setDisplay: (lines: string[]) => void, dispose: () => void}}
 */
export function buildCabin(car, spec, inside, material) {
  if (car.role === 'deck') return buildDeckCabin(car, spec, inside, material);
  const kit = cabinKit(inside);
  const { width: W, height: H } = car;
  const L = sideLayout(car, spec);
  const fy = CABIN_FLOOR;
  const cy = H - 0.2; // 천장
  const iw = W / 2 - 0.12; // 안쪽 벽(가운데에서)
  // 안쪽 창은 바깥 창보다 조금 크게 낸다(객실 보기에서는 바깥 껍데기를 숨긴다). 아이 눈높이에서 창밖이 보이게.
  const winBottom = Math.max(L.winY - L.winH / 2 - 0.3, fy + 0.72);
  const winTop = Math.min(L.winY + L.winH / 2 + 0.15, cy - 0.45);
  // 객실 앞뒤 끝: 문이 있는 쪽은 문 안쪽(통로 칸) 벽까지
  const hasRearDoor = L.doors.some((d) => d < 0);
  const hasFrontDoor = L.doors.some((d) => d > 0);
  const x0 = hasRearDoor ? L.rear + 2.25 : L.rear + 0.6;
  const x1 = hasFrontDoor ? L.bodyFront - 2.25 : L.bodyFront - 0.6;
  const room = addRoom(kit, {
    x0, x1, fy, cy, winBottom, winTop, windows: L.windows, inside, halfW: iw,
    rearEnd: 'doors', frontEnd: 'doors', rack: true,
    seatFrom: x0 + 1.9, // 첫 줄은 카메라(뒤 끝 벽 앞)에서 조금 떨어뜨린다
    pitch: spec.seatPitch ?? (car.kind === 'tgv' ? 0.93 : 1.0),
    floorHole: null, ceilHole: null,
  });
  const group = new Group();
  const built = kitMeshes(kit, material);
  for (const m of built.meshes) group.add(m);
  const glow = new MeshBasicMaterial({ color: inside.glow ?? '#fbfbf6' });
  const board = displayBoard(inside.display);
  const boardMat = new MeshBasicMaterial({ map: board.texture });
  const boardGeo = new PlaneGeometry(1.1, 0.21);
  const lightGeos = [];
  addLights(group, [{ ...room, cy, x1, signY: fy + room.doorH + 0.11 }], glow, lightGeos, boardMat, boardGeo, iw);

  const camX = x0 + 0.7;
  return {
    group,
    // 복도에서 앞을 보되, 바깥쪽 창(가는 쪽에서 왼쪽 = -z, 다른 선로가 없는 쪽)으로 살짝 돌린다
    eye: [camX, fy + EYE, 0.12],
    target: [camX + 12, fy + 1.3, -3.4],
    hero: { x: Math.min(camX + HERO_AHEAD, x1 - 1), y: fy, z: 0, scale: HERO_TALL },
    levels: 1,
    level: 0,
    setLevel: () => false,
    update() {},
    setDisplay: (lines) => board.draw(lines),
    dispose() {
      built.dispose();
      glow.dispose();
      for (const g of lightGeos) g.dispose();
      board.texture.dispose();
      boardMat.dispose();
      boardGeo.dispose();
    },
  };
}

/**
 * 2층 칸 객실: 1층과 2층 두 방, 뒤쪽 복도에 2층으로 오르는 곧은 계단(앞으로 오른다).
 * 층 높이는 바깥 창과 같이 DECK(train-3d-cars.js)를 쓴다.
 */
function buildDeckCabin(car, spec, inside, material) {
  const kit = cabinKit(inside);
  const parts = kit.base;
  const { width: W } = car;
  const L = sideLayout(car, spec);
  const iw = W / 2 - 0.12;
  const lo = DECK.lower;
  const hi = DECK.upper;
  // 칸 뒤쪽 계단실(xa~xb): 계단은 한쪽 벽(+z)에 붙어 앞으로 오르고, 다른 쪽(-z)은 1층 통로다.
  // 통로 위는 2층 바닥이 덮고(머리 위 1.8m), 계단 위만 2층 바닥이 뚫려 있다.
  const xa = L.rear + 0.6;
  const xb = xa + 2.8;
  const x1 = L.bodyFront - 2.25;
  const stairZ0 = 0.38;
  const stairZ1 = iw - 0.02;
  const stairZ = (stairZ0 + stairZ1) / 2;
  const stairW = stairZ1 - stairZ0;
  const stairX0 = xa + 0.05;
  const stairX1 = xb - 0.02;
  const seatFrom = xb + 1.9;
  const rooms = [];
  for (const d of [lo, hi]) {
    const room = addRoom(kit, {
      x0: xb, x1, fy: d.floor, cy: d.ceil, winBottom: d.win[0], winTop: d.win[1], windows: L.windows, inside, halfW: iw,
      rearEnd: 'open', frontEnd: 'plain', rack: false,
      seatFrom, pitch: spec.seatPitch ?? 1.0,
      floorHole: null, ceilHole: null,
      cove: d === hi ? { w: 0.8, drop: 0.5 } : null,
    });
    rooms.push({ ...room, cy: d.ceil, x1, signY: d.ceil - 0.22, floor: d.floor });
  }
  const wall = inside.wall;
  const sLen = xb - xa;
  const sMid = (xa + xb) / 2;
  // 계단실 바닥(1층), 2층 바닥(계단 위는 비운다), 2층 천장, 양옆 벽, 뒤 끝 벽
  parts.box(sLen, 0.1, iw * 2, sMid, lo.floor - 0.05, 0, inside.floor);
  const landW = stairZ0 + iw; // 2층 바닥: -iw ~ stairZ0
  parts.box(sLen, 0.14, landW, sMid, hi.floor - 0.07, (-iw + stairZ0) / 2, inside.floor);
  parts.box(sLen, 0.06, iw * 2, sMid, hi.ceil, 0, inside.ceiling);
  for (const s of [-1, 1]) {
    parts.box(sLen, lo.ceil - lo.floor, 0.06, sMid, (lo.floor + lo.ceil) / 2, s * iw, shade(wall, 0.06));
    parts.box(sLen, hi.ceil - hi.floor + 0.2, 0.06, sMid, (hi.floor - 0.2 + hi.ceil) / 2, s * iw, wall);
  }
  parts.box(0.08, hi.ceil - lo.floor, iw * 2, xa, (lo.floor + hi.ceil) / 2, 0, wall);
  // 계단 단(디딤판과 챌판)
  const rise = hi.floor - lo.floor;
  const steps = 10;
  const tread = (stairX1 - stairX0) / steps;
  const stepColor = shade(inside.floor, 0.1);
  const noseColor = shade(inside.floor, 0.35);
  for (let i = 0; i < steps; i++) {
    const top = lo.floor + (rise * (i + 1)) / steps;
    const x = stairX0 + tread * (i + 0.5);
    parts.box(tread, top - lo.floor, stairW, x, (lo.floor + top) / 2, stairZ, stepColor);
    parts.box(0.04, 0.02, stairW, x + tread / 2 - 0.02, top + 0.01, stairZ, noseColor); // 디딤판 끝 줄
  }
  // 통로와 계단 사이 칸막이(계단 입구 0.9m는 비운다), 2층 바닥 구멍 둘레 난간, 계단 손잡이
  const rail = '#b9bec4';
  const partX0 = stairX0 + 0.9;
  parts.box(stairX1 - partX0, lo.ceil - lo.floor, 0.05, (partX0 + stairX1) / 2, (lo.floor + lo.ceil) / 2, stairZ0 - 0.03, shade(wall, 0.05));
  parts.box(sLen - 0.1, 0.05, 0.06, sMid, hi.floor + 0.9, stairZ0 - 0.03, rail);
  for (const px of [xa + 0.3, sMid - 0.4, xb - 0.9]) parts.box(0.04, 0.9, 0.04, px, hi.floor + 0.45, stairZ0 - 0.03, rail);
  parts.box(0.05, 0.9, stairW, xa + 0.07, hi.floor + 0.45, stairZ, rail);
  const g = new BoxGeometry(Math.hypot(stairX1 - stairX0, rise), 0.04, 0.04);
  g.rotateZ(Math.atan2(rise, stairX1 - stairX0));
  g.translate((stairX0 + stairX1) / 2, lo.floor + rise / 2 + 0.9, stairZ1 - 0.08);
  parts.add(g, rail);

  const group = new Group();
  const built = kitMeshes(kit, material);
  for (const m of built.meshes) group.add(m);
  const glow = new MeshBasicMaterial({ color: inside.glow ?? '#fbfbf6' });
  const board = displayBoard(inside.display);
  const boardMat = new MeshBasicMaterial({ map: board.texture });
  const boardGeo = new PlaneGeometry(1.1, 0.21);
  const lightGeos = [];
  addLights(group, rooms, glow, lightGeos, boardMat, boardGeo, iw);

  // 층마다 눈과 주인공 자리. 눈은 계단실 바로 앞 복도에서 앞을 본다.
  const camX = xb + 0.7;
  const spots = [lo, hi].map((d) => ({
    eye: [camX, d.floor + EYE, 0.12],
    target: [camX + 12, d.floor + 1.3, -3.4],
    hero: { x: Math.min(camX + HERO_AHEAD, x1 - 1), y: d.floor, z: 0 },
  }));
  // 층을 옮기는 길(눈 자리 [x, y, z], 차례대로): 1층 복도 → 통로로 뒤로 → 계단 아래로 비켜서 → 계단 위 → 2층 복도.
  // 내려갈 때는 거꾸로.
  const up = [
    [camX, lo.floor + EYE, 0.12],
    [xb - 0.2, lo.floor + EYE, -0.5],
    [xa + 0.45, lo.floor + EYE, -0.5],
    [xa + 0.35, lo.floor + EYE, stairZ],
    [stairX1 + 0.1, hi.floor + EYE, stairZ],
    [xb + 0.3, hi.floor + EYE, 0.12],
    [camX, hi.floor + EYE, 0.12],
  ];
  const state = {
    group,
    eye: [...spots[0].eye],
    target: [...spots[0].target],
    hero: { ...spots[0].hero, scale: HERO_TALL },
    levels: 2,
    level: 0,
    moving: null,
    /**
     * 다른 층으로 옮긴다. instant이면 바로 옮긴다(움직임 줄이기).
     * @returns {boolean} 옮기기 시작했는지(이미 그 층이거나 옮기는 중이면 false)
     */
    setLevel(level, instant = false) {
      if (level === state.level || state.moving || level < 0 || level > 1) return false;
      const path = level === 1 ? up : [...up].reverse();
      if (instant) {
        place(level);
        return true;
      }
      // 주인공은 먼저 새 층의 자리로 간다(카메라가 계단을 오르는 동안 앞에서 기다린다)
      Object.assign(state.hero, spots[level].hero);
      state.moving = { path, t: 0, to: level };
      return true;
    },
    update(dt) {
      const m = state.moving;
      if (!m) return;
      m.t = Math.min(1, m.t + dt / CLIMB_SECONDS);
      // 길 조각 길이에 따라 고르게 간다
      const seg = m.path.slice(1).map((p, i) => Math.hypot(p[0] - m.path[i][0], p[1] - m.path[i][1], p[2] - m.path[i][2]));
      const total = seg.reduce((a, b) => a + b, 0);
      let d = (0.5 - 0.5 * Math.cos(Math.PI * m.t)) * total;
      let i = 0;
      while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
      const k = seg[i] > 0 ? Math.min(1, d / seg[i]) : 1;
      const x = m.path[i][0] + (m.path[i + 1][0] - m.path[i][0]) * k;
      const y = m.path[i][1] + (m.path[i + 1][1] - m.path[i][1]) * k;
      const z = m.path[i][2] + (m.path[i + 1][2] - m.path[i][2]) * k;
      state.eye[0] = x;
      state.eye[1] = y;
      state.eye[2] = z;
      // 계단에서는 앞(계단 쪽)을 곧게 본다. 끝에 가까우면 창 쪽으로 다시 돌린다.
      const look = Math.max(0, (m.t - 0.75) / 0.25);
      state.target[0] = x + 12;
      state.target[1] = y + 0.2;
      state.target[2] = z + (-3.4 - z) * look;
      if (m.t >= 1) place(m.to);
    },
    setDisplay: (lines) => board.draw(lines),
    dispose() {
      built.dispose();
      glow.dispose();
      for (const g of lightGeos) g.dispose();
      board.texture.dispose();
      boardMat.dispose();
      boardGeo.dispose();
    },
  };
  function place(level) {
    state.level = level;
    state.moving = null;
    state.eye.splice(0, 3, ...spots[level].eye);
    state.target.splice(0, 3, ...spots[level].target);
    Object.assign(state.hero, spots[level].hero);
  }
  return state;
}
