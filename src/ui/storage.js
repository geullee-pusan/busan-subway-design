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
