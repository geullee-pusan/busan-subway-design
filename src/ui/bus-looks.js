// 버스 칠과 차체: 노선 번호(도시 이름 + 번호)로 그 도시·노선 종류의 칠을 고른다.
// 자료: data/build/bus-looks.json(scripts/build-bus-looks.mjs가 data/facts.json busLooks에서 만든다. 시·군마다 출처).
// 칠과 차체는 그림을 위한 것이다. 회사 이름, 로고, 상징 무늬는 넣지 않는다.
import busLooksFile from '../../data/build/bus-looks.json';

/** 자료가 없을 때 쓰는 칠(우리가 정한 값: 지금 버스 그림의 초록) */
export const DEFAULT_BUS_LOOK = {
  type: '시내버스',
  lower: '#2E8B3E',
  upper: '#F2F3F1',
  roof: '#D9DDDA',
  front: null,
  stripe: null,
  pattern: 'two-tone',
  vehicle: 'step',
  desc: null,
  source: null,
};

/** 노선 이름 → [도시, 번호]. 부산 노선은 도시 이름이 없다. */
export function splitRoute(route) {
  const text = String(route ?? '');
  // 부산 밖 노선은 "대구 503"처럼 도시 이름과 빈칸이 앞에 붙어 있다(data/build/bus.json)
  const m = /^([가-힣]{1,3})\s+(.+)$/.exec(text);
  return m ? [m[1], m[2]] : ['부산', text];
}

/**
 * @param {string} route 노선 이름(예: "1000(급행)", "대구 503")
 * @returns {{type: string, lower: string, upper: string, roof: string, front: (string|null), stripe: (string|null), pattern: string, vehicle: string, desc: (string|null), source: (string|null), city: string, no: string}}
 */
export function busLookOf(route) {
  const [city, no] = splitRoute(route);
  const entry = busLooksFile.cities?.[city];
  let look = null;
  if (entry) {
    for (const t of entry.types ?? []) {
      try {
        if (new RegExp(t.match).test(no.trim())) {
          look = t;
          break;
        }
      } catch {
        // 잘못된 규칙은 건너뛴다
      }
    }
    look = look ?? entry.default ?? null;
  }
  const base = look ?? DEFAULT_BUS_LOOK;
  return {
    ...DEFAULT_BUS_LOOK,
    ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== null && v !== undefined)),
    city,
    no,
  };
}
