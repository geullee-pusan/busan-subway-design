// 저장 칸(localStorage). 읽고 쓸 때는 늘 try/catch로 감싼다(CLAUDE.md).
// 저장된 값이 없어도 화면은 그대로 떠야 한다.

const KEY = 'busan-subway-design';

const DEFAULTS = {
  runsPerDay: null, // 부모가 처음에 정한다. null이면 아직 안 정한 것이다.
  runsUsed: 0,
  runsDate: null, // 'YYYY-MM-DD'. 날짜가 바뀌면 횟수를 다시 센다.
  numberMode: '기본', // '기본' 또는 '진짜 숫자'
};

/** 오늘 날짜(YYYY-MM-DD). 화면에서만 쓴다. */
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const settings = { ...DEFAULTS, ...saved };
    if (settings.runsDate !== today()) {
      settings.runsDate = today();
      settings.runsUsed = 0;
    }
    return settings;
  } catch {
    return { ...DEFAULTS, runsDate: today() };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장이 안 되어도 게임은 그대로 된다.
  }
  return settings;
}

/** 오늘 남은 운행 횟수. 정해 두지 않았으면 null(제한 없음)이다. */
export function runsLeft(settings) {
  if (!settings.runsPerDay) return null;
  return Math.max(0, settings.runsPerDay - settings.runsUsed);
}

/** 운행 한 번을 썼다고 적는다. */
export function useRun(settings) {
  return saveSettings({ ...settings, runsDate: today(), runsUsed: settings.runsUsed + 1 });
}

const DESIGN_KEY = 'busan-subway-design-saves';

/** 저장한 설계 두 개(가, 나)를 읽는다. 없으면 빈 칸이다. */
export function loadDesigns() {
  try {
    const saved = JSON.parse(localStorage.getItem(DESIGN_KEY) ?? '{}');
    return { 가: saved['가'] ?? null, 나: saved['나'] ?? null };
  } catch {
    return { 가: null, 나: null };
  }
}

/** 설계를 '가' 또는 '나' 칸에 저장한다. */
export function saveDesign(slot, payload) {
  const designs = loadDesigns();
  designs[slot] = { ...payload, savedOn: today() };
  try {
    localStorage.setItem(DESIGN_KEY, JSON.stringify(designs));
  } catch {
    // 저장이 안 되어도 화면은 그대로 된다.
  }
  return designs;
}

// --- 우리 집 규칙 (SPEC 9.1) ---

const RULES_KEY = 'busan-subway-design-rules';

/**
 * 저장한 규칙 묶음과 지금 쓰는 묶음 이름.
 * values는 바꾼 값만 담는다({규칙 id: 숫자}).
 */
export function loadRuleSets() {
  try {
    const saved = JSON.parse(localStorage.getItem(RULES_KEY) ?? '{}');
    const sets = Array.isArray(saved.sets) ? saved.sets : [];
    const activeName = sets.some((set) => set.name === saved.activeName) ? saved.activeName : null;
    return { sets, activeName };
  } catch {
    return { sets: [], activeName: null };
  }
}

function writeRuleSets(next) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(next));
  } catch {
    // 저장이 안 되어도 게임은 그대로 된다.
  }
  return next;
}

/** 규칙 묶음을 이름 붙여 저장하고, 그 묶음을 쓰기 시작한다. 같은 이름이면 덮어쓴다. */
export function saveRuleSet(name, values) {
  const { sets } = loadRuleSets();
  const next = sets.filter((set) => set.name !== name);
  next.push({ name, values, savedOn: today() });
  return writeRuleSets({ sets: next, activeName: name });
}

/** 쓸 묶음을 고른다. null이면 기본 규칙으로 돌아간다. */
export function useRuleSet(name) {
  const { sets } = loadRuleSets();
  return writeRuleSets({ sets, activeName: sets.some((set) => set.name === name) ? name : null });
}

export function deleteRuleSet(name) {
  const { sets, activeName } = loadRuleSets();
  const next = sets.filter((set) => set.name !== name);
  return writeRuleSets({ sets: next, activeName: activeName === name ? null : activeName });
}

/** 지금 쓰는 규칙 묶음. 없으면 null. */
export function activeRuleSet() {
  const { sets, activeName } = loadRuleSets();
  return sets.find((set) => set.name === activeName) ?? null;
}

// --- 화면 설정: 범례 펼침, 안내 보이기, 글자 크기 ---
// 설정(KEY)과 따로 둔다. main.js가 들고 있는 설정을 저장할 때 이 값을 덮어쓰지 않게 하려는 것이다.

const VIEW_KEY = 'busan-subway-design-view';

/** 글자 크기 고르기. 자동으로 정한 크기에 이 배율을 곱한다. */
export const TEXT_SCALES = [
  { label: '보통', value: 1 },
  { label: '크게', value: 1.15 },
  { label: '더 크게', value: 1.3 },
];

const VIEW_DEFAULTS = {
  legendOpen: null, // null이면 화면 크기를 보고 정한다
  showGuides: true,
  textScale: 1,
  autoNames: true, // 새 역 이름을 저절로 짓는다(행정동·중심지·기존 역 이름)
  runScope: '내 노선', // 운행 화면의 탄 사람 수와 많이 타는 역: '내 노선' 또는 '부산 전체'
};

export function loadView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    const view = { ...VIEW_DEFAULTS, ...saved };
    if (!TEXT_SCALES.some((scale) => scale.value === view.textScale)) view.textScale = 1;
    if (typeof view.showGuides !== 'boolean') view.showGuides = true;
    if (typeof view.autoNames !== 'boolean') view.autoNames = true;
    if (!['내 노선', '부산 전체'].includes(view.runScope)) view.runScope = '내 노선';
    if (view.legendOpen !== null && typeof view.legendOpen !== 'boolean') view.legendOpen = null;
    return view;
  } catch {
    return { ...VIEW_DEFAULTS };
  }
}

/** 바꾼 것만 넣으면 나머지는 그대로 둔다. */
export function saveView(patch) {
  const next = { ...loadView(), ...patch };
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(next));
  } catch {
    // 저장이 안 되어도 이번에는 그대로 보인다.
  }
  return next;
}

// --- 부모 화면 잠금 (SPEC 9.2) ---
//
// 네 자리 숫자는 아이가 잘못 눌러 들어가지 않게 막는 잠금이다. 보안 장치가 아니다.
// 기기 안에만 있고 아무 데도 보내지 않는다. 잊으면 저장한 것을 모두 지워서 다시 정한다.

const PIN_KEY = 'busan-subway-design-pin';

/** 네 자리 숫자를 정해 두었는가 */
export function hasPin() {
  try {
    return /^\d{4}$/.test(localStorage.getItem(PIN_KEY) ?? '');
  } catch {
    return false;
  }
}

export function savePin(pin) {
  if (!/^\d{4}$/.test(pin)) return false;
  try {
    localStorage.setItem(PIN_KEY, pin);
    return true;
  } catch {
    return false;
  }
}

export function checkPin(pin) {
  try {
    return localStorage.getItem(PIN_KEY) === pin;
  } catch {
    return false;
  }
}

/** 저장한 것을 모두 지운다(설정, 설계, 규칙 묶음, 화면 설정, 잠금). */
export function clearAll() {
  for (const key of [KEY, DESIGN_KEY, RULES_KEY, VIEW_KEY, PIN_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 못 지워도 화면은 그대로 뜬다.
    }
  }
}
