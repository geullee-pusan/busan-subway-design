// 기차 3D 객실 무늬: 좌석 천, 벽·천장 판 이음새, 바닥 잔점을 캔버스에 그린다(사진을 쓰지 않는다).
// 무늬 종류와 색은 객실 그림(src/ui/train-interior.js INTERIOR)의 pattern, patternColor(s)를 따른다.
// 무늬 자리는 늘 같다(정해진 씨앗으로 섞는다).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const SIZE = 256;

/** 정해진 씨앗의 섞기(0~1). 같은 씨앗이면 늘 같은 차례. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function texture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  draw(canvas.getContext('2d'));
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** 색을 밝게(k > 1) 또는 어둡게(k < 1) */
function tone(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** 천의 결: 가로세로로 짠 실처럼 아주 옅은 줄 */
function weave(g, color, rand) {
  g.fillStyle = color;
  g.fillRect(0, 0, SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 2) {
    g.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    g.fillRect(0, y, SIZE, 1);
  }
  for (let x = 0; x < SIZE; x += 2) {
    g.fillStyle = x % 4 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    g.fillRect(x, 0, 1, SIZE);
  }
  // 보풀 같은 잔점
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
    g.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), 1, 1);
  }
}

/**
 * 좌석 천(색이 있는 그림). 한 칸 그림이 0.3m(TexParts tile)이다.
 * @param {string} color 바탕색
 * @param {object} inside INTERIOR 값(pattern, patternColor, patternColor2, patternColors)
 */
export function cabinFabric(color, inside) {
  return texture((g) => {
    const rand = seeded(7);
    weave(g, color, rand);
    const c1 = inside.patternColor ?? tone(color, 1.2);
    const c2 = inside.patternColor2 ?? c1;
    g.lineCap = 'round';
    switch (inside.pattern) {
      case 'rings': {
        // 동그라미 잔무늬(KTX-산천): 엇갈린 줄로 작은 고리
        g.strokeStyle = c1;
        g.lineWidth = 2.2;
        for (let row = 0; row < 6; row++) {
          for (let col = 0; col < 6; col++) {
            const x = col * 42.7 + (row % 2) * 21.3 + 10;
            const y = row * 42.7 + 12;
            g.beginPath();
            g.arc(x % SIZE, y, 6.5, 0, Math.PI * 2);
            g.stroke();
          }
        }
        break;
      }
      case 'sprinkle':
      case 'confetti': {
        // 잔 막대 무늬(ITX-청춘, 무궁화호) / 여러 색 조각(누리로)
        const colors = inside.pattern === 'confetti' ? inside.patternColors ?? [c1] : [c1];
        g.lineWidth = 3;
        for (let i = 0; i < 70; i++) {
          g.strokeStyle = colors[i % colors.length];
          const x = rand() * SIZE;
          const y = rand() * SIZE;
          const a = rand() * Math.PI;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
          g.stroke();
        }
        break;
      }
      case 'waves': {
        // 물결(ITX-새마을): 두 색 물결 줄
        g.lineWidth = 3;
        for (let row = 0; row < 4; row++) {
          g.strokeStyle = row % 2 ? c2 : c1;
          g.beginPath();
          for (let x = 0; x <= SIZE; x += 4) {
            const y = row * 64 + 32 + Math.sin((x / SIZE) * Math.PI * 4) * 10;
            if (x === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        break;
      }
      case 'line': {
        // 가로 줄 하나(ITX-마음)
        g.fillStyle = c1;
        g.fillRect(0, SIZE * 0.45, SIZE, 7);
        break;
      }
      case 'stripes': {
        // 세로 줄(새마을호)
        g.fillStyle = c1;
        for (let x = 0; x < SIZE; x += 64) g.fillRect(x + 28, 0, 6, SIZE);
        break;
      }
      default:
        break;
    }
  });
}

/** 벽·천장 판(꼭짓점 색에 곱한다): 거의 흰 바탕에 판 이음새 한 줄. 한 칸 그림이 1.25m. */
export function cabinPanel() {
  return texture((g) => {
    const rand = seeded(11);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = 'rgba(0,0,0,0.025)';
      g.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), 2, 2);
    }
    // 이음새: 가는 어두운 줄과 그 옆 밝은 줄(판 가장자리)
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, 0, 2, SIZE);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(2, 0, 3, SIZE);
  });
}

/** 바닥(꼭짓점 색에 곱한다): 카펫·고무 바닥 같은 잔점. 한 칸 그림이 0.6m. */
export function cabinFloor() {
  return texture((g) => {
    const rand = seeded(23);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 6000; i++) {
      const v = rand();
      g.fillStyle = v < 0.6 ? `rgba(0,0,0,${0.04 + rand() * 0.08})` : `rgba(255,255,255,${0.05 + rand() * 0.05})`;
      g.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), 1 + Math.floor(rand() * 2), 1);
    }
  });
}

/** 승강장 바닥(꼭짓점 색에 곱한다): 0.6m 보도블록 넷(2 × 2)과 줄눈, 블록마다 조금 다른 밝기. 한 칸 그림이 1.2m. */
export function platformPaving() {
  return texture((g) => {
    const rand = seeded(31);
    const half = SIZE / 2;
    for (let by = 0; by < 2; by++) {
      for (let bx = 0; bx < 2; bx++) {
        const v = Math.round(236 + rand() * 19);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(bx * half, by * half, half, half);
      }
    }
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.06})`;
      g.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), 1 + Math.floor(rand() * 2), 1);
    }
    // 줄눈
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (const p of [0, half]) {
      g.fillRect(p, 0, 2, SIZE);
      g.fillRect(0, p, SIZE, 2);
    }
  });
}

/** 노란 점자 블록(꼭짓점 색에 곱한다): 점이 도드라진 블록. 한 칸 그림이 0.3m. */
export function tactileDots() {
  return texture((g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SIZE, SIZE);
    const n = 5;
    const step = SIZE / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const cx = x * step + step / 2;
        const cy = y * step + step / 2;
        // 점: 아래쪽 그늘과 위쪽 밝은 테
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.arc(cx + 2, cy + 3, step * 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(cx, cy, step * 0.28, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.beginPath();
        g.arc(cx + 1, cy + 1, step * 0.18, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, 0, 2, SIZE);
    g.fillRect(0, 0, SIZE, 2);
  });
}

/** 승강장 지붕(꼭짓점 색에 곱한다): 금속 지붕판의 골과 이음새. 한 칸 그림이 1.5m. */
export function roofPanels() {
  return texture((g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SIZE, SIZE);
    for (let x = 0; x < SIZE; x += 16) {
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(x, 0, 3, SIZE);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x + 3, 0, 1, SIZE);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, SIZE, 3);
  });
}
