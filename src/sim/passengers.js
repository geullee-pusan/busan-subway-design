// 버스와 지하철 승객 만들기. 순수 함수만 둔다(DOM 없음, Math.random 없음, 같은 입력은 같은 출력).
// 씨앗(seed)은 화면에서 탈 때마다 아무거나 정해 넘긴다. 이름과 대사 재료는 src/content/passengers.json(지어낸 것)이다.
// 외모(머리 모양, 머리색, 옷, 안경, 모자, 가방)는 성별과 상관없이 정한다.

// ---------- 고르기 ----------
/** 씨앗으로 0~1 수를 차례로 내는 작은 난수 생성기(mulberry32). 같은 씨앗이면 늘 같은 차례다. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 정수 여럿을 섞어 씨앗 하나로 만든다. */
function mix(...values) {
  let h = 2166136261;
  for (const value of values) {
    h ^= value >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** 목록에서 하나(무게가 있으면 무게대로) */
function pick(rng, list, weights = null) {
  if (!weights) return list[Math.floor(rng() * list.length)];
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (const [i, w] of weights.entries()) {
    r -= w;
    if (r < 0) return list[i];
  }
  return list.at(-1);
}

const AGE_GROUPS = ['어린이', '청소년', '어른', '어르신'];
const AGE_RANGE = { 어린이: [5, 12], 청소년: [13, 18], 어른: [19, 64], 어르신: [65, 85] };
const SKINS = ['#F2C9A0', '#E8B48A', '#D9A066', '#C68642', '#8D5524'];
const DARK_HAIR = ['#2A2320', '#3A2A20', '#4A3326', '#6B4A2F'];
const GREY_HAIR = ['#8F8F8F', '#B5B1A8', '#E6E2DA'];
const SHIRTS = ['#2F6690', '#D1495B', '#EDAE49', '#3A7D44', '#6D597A', '#00798C', '#9C6644', '#4F5D75', '#E07A5F', '#81B29A', '#F2CC8F', '#3D405B'];
const PANTS = ['#34495E', '#2B2F36', '#5C4B3B', '#3B5B7A', '#6B705C'];
const HATS = ['#D1495B', '#2F6690', '#EDAE49', '#3A7D44', '#2B2F36'];
const BAGS = ['#5D4037', '#2F6690', '#C0392B', '#3A7D44', '#6D597A'];

/**
 * 한 사람을 만든다(씨앗, 자리, 그 자리의 몇 번째 사람). data는 src/content/passengers.json
 * @returns {{id: number, name: string, gender: '여자'|'남자', age: number, ageGroup: string, size: number,
 *   look: {skin: string, hair: string, hairColor: string, shirt: string, pants: string, glasses: boolean,
 *          hat: string|null, bag: '없음'|'배낭'|'어깨가방', bagColor: string}}}
 */
export function makePerson(data, seed, slot, generation = 0) {
  const id = mix(seed, slot, generation);
  const rng = seededRandom(id);
  const ageGroup = pick(rng, AGE_GROUPS, [15, 15, 48, 22]);
  const [low, high] = AGE_RANGE[ageGroup];
  const age = low + Math.floor(rng() * (high - low + 1));
  const gender = rng() < 0.5 ? '여자' : '남자';
  const family = pick(rng, data.familyNames);
  const given = pick(rng, data.givenNames[ageGroup][gender]);
  const hairStyles = ageGroup === '어르신' ? ['짧은', '긴', '묶은', '곱슬', '둥근', '적은'] : ['짧은', '긴', '묶은', '곱슬', '둥근'];
  const greyChance = ageGroup === '어르신' ? 0.75 : age >= 50 ? 0.3 : 0;
  const look = {
    skin: pick(rng, SKINS, [4, 3, 2, 1, 1]),
    hair: pick(rng, hairStyles),
    hairColor: rng() < greyChance ? pick(rng, GREY_HAIR) : pick(rng, DARK_HAIR, [5, 3, 2, 1]),
    shirt: pick(rng, SHIRTS),
    pants: pick(rng, PANTS),
    glasses: rng() < { 어린이: 0.1, 청소년: 0.2, 어른: 0.3, 어르신: 0.5 }[ageGroup],
    hat: rng() < 0.15 ? pick(rng, HATS) : null,
    bag: pick(rng, ['없음', '배낭', '어깨가방'], ageGroup === '어린이' || ageGroup === '청소년' ? [1, 4, 1] : [3, 1, 2]),
    bagColor: pick(rng, BAGS),
  };
  const size = { 어린이: 0.78, 청소년: 0.93, 어른: 1, 어르신: 0.97 }[ageGroup];
  return { id, name: `${family}${given}`, gender, age, ageGroup, size, look };
}

/**
 * 한 번 타는 동안의 승객들. 자리마다 사람이 있고, 역에서 내리고 타면 그 자리 사람이 바뀐다.
 * (자리마다 몇 번째 사람인지 기억하는 작은 상태를 가진다. 같은 씨앗과 같은 차례의 arrive면 늘 같은 사람이다.)
 * @param {number} seed 탈 때 아무거나 정한 수
 */
export function createCrowd(data, seed) {
  const generation = [];
  const cache = new Map();
  return {
    seed,
    /** 자리 slot의 지금 사람 */
    personAt(slot) {
      const g = generation[slot] ?? 0;
      const key = `${slot}|${g}`;
      if (!cache.has(key)) cache.set(key, makePerson(data, seed, slot, g));
      return cache.get(key);
    },
    /**
     * 역에 섰다: 내린 사람 비율만큼 자리 사람이 바뀌고, 빈 자리에는 새 사람이 탄다.
     * @param {number} stopKey 역(정류장) 번호(같은 역이면 같은 사람이 내린다)
     * @param {number} before 서기 전 사람 그림 수
     * @param {number} after 선 뒤 사람 그림 수
     * @param {number} offShare 서기 전 사람 가운데 내린 비율(0~1)
     */
    arrive(stopKey, before, after, offShare) {
      const rng = seededRandom(mix(seed, stopKey, 7));
      const top = Math.max(before, after);
      for (let slot = 0; slot < top; slot++) {
        const leaves = slot < before && (slot >= after || rng() < offShare);
        const boards = slot >= before && slot < after;
        if (leaves || boards) generation[slot] = (generation[slot] ?? 0) + 1;
      }
    },
  };
}

// ---------- 말 ----------
/**
 * 대화창에서 할 말(두세 문장). 같은 사람, 같은 상황이면 늘 같은 말이다.
 * @param {ReturnType<typeof makePerson>} person
 * @param {{vehicle: '버스'|'열차', destination: string|null, terminal: boolean, crowdRatio: number, hour: number, newLine: boolean}} ctx
 */
export function talkLines(data, person, ctx) {
  const rng = seededRandom(mix(person.id, Math.round(ctx.hour * 10), ctx.destination?.length ?? 0, 11));
  const { reasons, lines } = data;
  const out = [];
  if (rng() < 0.4 && lines[person.ageGroup]) out.push(pick(rng, lines[person.ageGroup]));
  if (ctx.terminal) {
    out.push(pick(rng, lines.종점));
  } else if (ctx.destination) {
    out.push(`${ctx.destination}에서 내려요.`);
    out.push(pick(rng, reasons[person.ageGroup]));
  }
  // 상황 한 마디: 붐빔, 시간, 탈것, 새 노선 가운데 하나
  const pool = [];
  if (ctx.crowdRatio >= 0.8) pool.push(...lines.붐빔);
  if (ctx.crowdRatio <= 0.3) pool.push(...lines.한산);
  const hour = ((ctx.hour % 24) + 24) % 24;
  pool.push(...lines[hour < 10 ? '아침' : hour < 17 ? '낮' : hour < 21 ? '저녁' : '밤']);
  pool.push(...lines[ctx.vehicle === '버스' ? '버스' : '열차']);
  if (ctx.newLine) pool.push(...lines.새노선, ...lines.새노선);
  out.push(pick(rng, pool));
  return out;
}

/** "김서연 · 9살 · 여자 어린이" */
export function personLabel(person) {
  return `${person.name} · ${person.age}살 · ${person.gender} ${person.ageGroup}`;
}
