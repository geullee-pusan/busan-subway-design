// 사람이 읽고 git에서 비교하기 쉬운 JSON 쓰기.
// 값이 모두 원시값인 배열은 한 줄에, 원시값만 가진 객체의 배열은 객체 하나를 한 줄에 쓴다.

const isPrimitive = (v) => v === null || typeof v !== 'object';
const isFlatObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => isPrimitive(x) || (Array.isArray(x) && x.every(isPrimitive)));

export function stringify(value, indent = 2) {
  const pad = (level) => ' '.repeat(level * indent);
  const fmt = (v, level) => {
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      if (v.every(isPrimitive)) return JSON.stringify(v);
      if (v.every(isFlatObject)) {
        return `[\n${v.map((x) => pad(level + 1) + JSON.stringify(x)).join(',\n')}\n${pad(level)}]`;
      }
      return `[\n${v.map((x) => pad(level + 1) + fmt(x, level + 1)).join(',\n')}\n${pad(level)}]`;
    }
    if (v !== null && typeof v === 'object') {
      const entries = Object.entries(v).filter(([, x]) => x !== undefined);
      if (entries.length === 0) return '{}';
      return `{\n${entries.map(([k, x]) => `${pad(level + 1)}${JSON.stringify(k)}: ${fmt(x, level + 1)}`).join(',\n')}\n${pad(level)}}`;
    }
    return JSON.stringify(v);
  };
  return fmt(value, 0) + '\n';
}
