// WGS84 경위도 ↔ UTM(횡메르카토르) 좌표 변환.
// 공식: J. P. Snyder, Map Projections — A Working Manual (USGS Professional Paper 1395, 1987), 8장.
// 부산은 UTM 52구역의 중앙 경선(동경 129도) 근처라 왜곡이 아주 작다.

const A = 6378137; // WGS84 긴반지름(m)
const F = 1 / 298.257223563; // WGS84 편평률
const K0 = 0.9996; // UTM 축척 계수
const FALSE_EASTING = 500000;
const E2 = F * (2 - F);
const E4 = E2 * E2;
const E6 = E4 * E2;
const EP2 = E2 / (1 - E2);
const DEG = Math.PI / 180;

const M_COEF = 1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256;

/** 적도에서 위도 phi(라디안)까지의 자오선 호 길이(m). */
function meridianArc(phi) {
  return (
    A *
    (M_COEF * phi -
      ((3 * E2) / 8 + (3 * E4) / 32 + (45 * E6) / 1024) * Math.sin(2 * phi) +
      ((15 * E4) / 256 + (45 * E6) / 1024) * Math.sin(4 * phi) -
      ((35 * E6) / 3072) * Math.sin(6 * phi))
  );
}

/** 북반구 UTM 구역 하나의 변환기를 만든다. */
export function makeUtm(zone) {
  const lon0 = (zone * 6 - 183) * DEG;

  /** 경도, 위도(도) → [동쪽 좌표, 북쪽 좌표](m) */
  function forward(lon, lat) {
    const phi = lat * DEG;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    const tan = Math.tan(phi);
    const n = A / Math.sqrt(1 - E2 * sin * sin);
    const t = tan * tan;
    const c = EP2 * cos * cos;
    const a = (lon * DEG - lon0) * cos;
    const x =
      FALSE_EASTING +
      K0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120);
    const y =
      K0 *
      (meridianArc(phi) +
        n *
          tan *
          ((a * a) / 2 +
            ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
            ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));
    return [x, y];
  }

  /** [동쪽 좌표, 북쪽 좌표](m) → [경도, 위도](도) */
  function inverse(x, y) {
    const mu = y / K0 / (A * M_COEF);
    const s = Math.sqrt(1 - E2);
    const e1 = (1 - s) / (1 + s);
    const phi1 =
      mu +
      ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
      ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
      ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
      ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
    const sin1 = Math.sin(phi1);
    const cos1 = Math.cos(phi1);
    const tan1 = Math.tan(phi1);
    const c1 = EP2 * cos1 * cos1;
    const t1 = tan1 * tan1;
    const w = 1 - E2 * sin1 * sin1;
    const n1 = A / Math.sqrt(w);
    const r1 = (A * (1 - E2)) / w ** 1.5;
    const d = (x - FALSE_EASTING) / (n1 * K0);
    const phi =
      phi1 -
      ((n1 * tan1) / r1) *
        ((d * d) / 2 -
          ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
          ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720);
    const lam =
      lon0 +
      (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) /
        cos1;
    return [lam / DEG, phi / DEG];
  }

  return { zone, epsg: 32600 + zone, forward, inverse };
}

/** 부산이 들어가는 UTM 52N (EPSG:32652) */
export const utm52 = makeUtm(52);
