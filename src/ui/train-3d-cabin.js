// 기차 3D 객실: 승객이 탄 칸 안을 짓는다. 창문 너머로는 3D 바깥(땅, 터널, 다리, 역)이 그대로 지나간다.
// 색은 객실 그림(src/ui/train-interior.js INTERIOR)과 같다. 칸 안 좌표는 차량과 같다(x 앞, y 레일 윗면에서 위, z 옆).
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, BoxGeometry } from 'three';
import { DARK, GLASS, Parts, shade, sideLayout } from './train-3d-cars.js';

/** 바닥 높이(레일 윗면에서, 미터) */
export const CABIN_FLOOR = 1.1;
/** 아이 눈높이(바닥에서, 미터) */
const EYE = 1.1;
/** 주인공 키(미터)와 카메라에서 떨어진 거리 */
const HERO_TALL = 1.25;
const HERO_AHEAD = 3.2;

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
 * 한 칸의 객실.
 * @param {object} car formation()의 칸
 * @param {object} spec 열차 종류 차량 값(train-3d-cars.js)
 * @param {object} inside 객실 색(INTERIOR[종류])
 * @param {import('three').Material} material 꼭짓점 색 재질
 * @returns {{group: Group, eye: number[], target: number[], hero: {x: number, y: number, z: number, scale: number}, setDisplay: (lines: string[]) => void, dispose: () => void}}
 */
export function buildCabin(car, spec, inside, material) {
  const parts = new Parts();
  const { length: Lc, width: W, height: H } = car;
  const L = sideLayout(car, spec);
  const fy = CABIN_FLOOR;
  const cy = H - 0.2; // 천장
  const iw = W / 2 - 0.12; // 안쪽 벽(가운데에서)
  // 안쪽 창은 바깥 창보다 조금 크게 낸다(객실 보기에서는 바깥 껍데기를 숨긴다). 아이 눈높이에서 창밖이 보이게.
  const winBottom = Math.max(L.winY - L.winH / 2 - 0.3, fy + 0.72);
  const winTop = Math.min(L.winY + L.winH / 2 + 0.15, cy - 0.45);
  const winMid = (winBottom + winTop) / 2;
  const widen = 0.25;
  // 객실 앞뒤 끝: 문이 있는 쪽은 문 안쪽(통로 칸) 벽까지
  const hasRearDoor = L.doors.some((d) => d < 0);
  const hasFrontDoor = L.doors.some((d) => d > 0);
  const x0 = hasRearDoor ? L.rear + 2.25 : L.rear + 0.6;
  const x1 = hasFrontDoor ? L.bodyFront - 2.25 : L.bodyFront - 0.6;
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  const wall = inside.wall;
  const wallLow = shade(wall, 0.06);

  // 바닥: 가운데 복도는 조금 다른 색
  parts.box(len, 0.1, iw * 2, mid, fy - 0.05, 0, inside.floor);
  parts.box(len, 0.012, 0.62, mid, fy + 0.006, 0, shade(inside.floor, 0.18));
  // 천장과 비스듬한 어깨
  const coveW = 0.42;
  parts.box(len, 0.06, (iw - coveW) * 2, mid, cy, 0, inside.ceiling);
  for (const s of [-1, 1]) {
    const g = new BoxGeometry(len, 0.05, Math.hypot(coveW, 0.32));
    g.rotateX(s * Math.atan2(0.32, coveW));
    g.translate(mid, cy - 0.16, s * (iw - coveW / 2));
    parts.add(g, shade(inside.ceiling, 0.06));
  }
  // 양옆 벽: 창 아래, 창 위, 창 사이 기둥(창 자리는 비워 둔다: 바깥이 보인다)
  const rackY = cy - 0.55;
  for (const s of [-1, 1]) {
    const z = s * iw;
    parts.box(len, winBottom - fy, 0.06, mid, (fy + winBottom) / 2, z, wallLow);
    parts.box(len, cy - 0.32 - winTop, 0.06, mid, (winTop + cy - 0.32) / 2, z, wall);
    const holes = L.windows
      .map((w) => ({ x: w.x, w: w.w + widen }))
      .filter((w) => w.x - w.w / 2 > x0 && w.x + w.w / 2 < x1)
      .sort((a, b) => a.x - b.x);
    let from = x0;
    for (const h of holes) {
      const to = h.x - h.w / 2;
      if (to - from > 0.01) parts.box(to - from, winTop - winBottom, 0.06, (from + to) / 2, winMid, z, wall);
      // 창틀(안쪽으로 조금 깊게)
      parts.box(h.w + 0.06, 0.05, 0.14, h.x, winBottom + 0.02, z - s * 0.05, shade(wall, 0.15));
      from = h.x + h.w / 2;
    }
    if (x1 - from > 0.01) parts.box(x1 - from, winTop - winBottom, 0.06, (from + x1) / 2, winMid, z, wall);
    // 짐 선반과 그 아래 불빛 띠
    parts.box(len, 0.05, 0.42, mid, rackY, s * (iw - 0.24), shade(inside.ceiling, 0.12));
    parts.box(len, 0.08, 0.03, mid, rackY + 0.02, s * (iw - 0.45), shade(inside.ceiling, 0.25));
    if (inside.trim) parts.box(len, 0.05, 0.02, mid, rackY - 0.06, s * (iw - 0.02), inside.trim);
  }
  // 앞뒤 끝 벽과 가운데 문
  const doorW = 0.9;
  const doorH = 1.9;
  for (const [x, dir] of [[x1, 1], [x0, -1]]) {
    const sideW = iw - doorW / 2;
    for (const s of [-1, 1]) parts.box(0.08, cy - fy, sideW, x, (fy + cy) / 2, s * (doorW / 2 + sideW / 2), wall);
    parts.box(0.08, cy - fy - doorH, doorW, x, fy + doorH + (cy - fy - doorH) / 2, 0, wall);
    const doorColor = inside.door ?? shade(wall, 0.22);
    parts.box(0.05, doorH, doorW - 0.04, x + dir * 0.02, fy + doorH / 2, 0, doorColor);
    parts.box(0.06, 0.7, 0.42, x - dir * 0.005, fy + 1.3, 0, GLASS);
  }
  // 좌석: 2 + 2, 모두 앞(+x)을 본다. 카메라에서는 등받이 뒤가 보인다.
  const pitch = car.kind === 'tgv' ? 0.93 : 1.0;
  const seatW = 0.47;
  const aisle = 0.31; // 복도 반쪽
  const shell = inside.shell ?? inside.seatDark;
  // 첫 줄은 카메라(뒤 끝 벽 앞)에서 조금 떨어뜨린다
  for (let x = x0 + 1.9; x < x1 - 0.5; x += pitch) {
    for (const s of [-1, 1]) {
      for (const k of [0, 1]) {
        const z = s * (aisle + seatW / 2 + k * (seatW + 0.02));
        // 앉는 자리, 등받이(조금 뒤로 기운다), 머리받침 덮개, 등받이 뒤 그물 주머니
        parts.box(0.48, 0.13, seatW - 0.02, x, fy + 0.46, z, inside.cushion);
        const back = new BoxGeometry(0.13, 0.74, seatW - 0.02);
        back.translate(0, 0.37, 0);
        back.rotateZ(0.13);
        back.translate(x - 0.25, fy + 0.5, z);
        parts.add(back, shell);
        const front = new BoxGeometry(0.02, 0.64, seatW - 0.06);
        front.translate(0.08, 0.35, 0);
        front.rotateZ(0.13);
        front.translate(x - 0.25, fy + 0.5, z);
        parts.add(front, inside.seat);
        if (inside.cover) {
          // coverFrontOnly: 덮개가 앞쪽(앉는 쪽)에만 있다(뒤에서는 안 보인다)
          const front = inside.coverFrontOnly;
          const cover = new BoxGeometry(front ? 0.02 : 0.17, inside.coverShort ? 0.14 : 0.22, seatW - 0.05);
          cover.translate(front ? 0.09 : 0, 0.66, 0);
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
      for (const az of [aisle + 0.01, aisle + seatW * 2 + 0.03]) parts.box(0.42, 0.05, 0.05, x - 0.02, fy + 0.66, s * az, shade(shell, 0.2));
      parts.box(0.3, 0.4, seatW * 2 - 0.1, x - 0.05, fy + 0.2, s * (aisle + seatW + 0.01), DARK);
    }
  }
  const group = new Group();
  const mesh = new Mesh(parts.geometry(), material);
  group.add(mesh);
  // 천장 불빛(빛나는 띠)과 행선 안내판은 조명을 받지 않는 재질
  const glow = new MeshBasicMaterial({ color: inside.glow ?? '#fbfbf6' });
  const lightGeo = new BoxGeometry(len - 0.4, 0.02, 0.22);
  for (const s of [-1, 1]) {
    const strip = new Mesh(lightGeo, glow);
    strip.position.set(mid, cy - 0.04, s * (iw - coveW - 0.2));
    group.add(strip);
  }
  const board = displayBoard(inside.display);
  const boardMat = new MeshBasicMaterial({ map: board.texture });
  const boardGeo = new PlaneGeometry(1.1, 0.21);
  const sign = new Mesh(boardGeo, boardMat);
  sign.position.set(x1 - 0.05, fy + doorH + 0.11, 0);
  sign.rotation.y = -Math.PI / 2;
  group.add(sign);

  const camX = x0 + 0.7;
  return {
    group,
    // 복도에서 앞을 보되, 바깥쪽 창(가는 쪽에서 왼쪽 = -z, 다른 선로가 없는 쪽)으로 살짝 돌린다
    eye: [camX, fy + EYE, 0.12],
    target: [camX + 12, fy + 1.3, -3.4],
    hero: { x: Math.min(camX + HERO_AHEAD, x1 - 1), y: fy, z: 0, scale: HERO_TALL },
    setDisplay: (lines) => board.draw(lines),
    dispose() {
      mesh.geometry.dispose();
      glow.dispose();
      lightGeo.dispose();
      board.texture.dispose();
      boardMat.dispose();
      boardGeo.dispose();
    },
  };
}
