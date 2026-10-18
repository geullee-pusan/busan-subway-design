// 아주 작은 XLSX 읽기(새 의존성 없이). 시트마다 줄 배열을 돌려준다. 글자와 숫자 칸만 읽는다(서식, 수식 결과 형식은 무시).
import { inflateRawSync } from 'node:zlib';

function unzip(buffer) {
  const files = {};
  let end = buffer.length - 22;
  while (buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(at + 10);
    const packed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    at += 46 + nameLength + extraLength + commentLength;
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const body = buffer.subarray(start, start + packed);
    files[name] = (method === 0 ? body : inflateRawSync(body)).toString('utf8');
  }
  return files;
}

const unescape = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** "B12" → 열 번호(0부터) */
function columnOf(ref) {
  const letters = /^[A-Z]+/.exec(ref)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * @param {Buffer} buffer XLSX 파일
 * @returns {{name: string, rows: string[][]}[]}
 */
export function readXlsx(buffer) {
  const files = unzip(buffer);
  const shared = [];
  const sst = files['xl/sharedStrings.xml'];
  if (sst) {
    for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(unescape((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
    }
  }
  const workbook = files['xl/workbook.xml'] ?? '';
  const rels = files['xl/_rels/workbook.xml.rels'] ?? '';
  const sheets = [];
  for (const m of workbook.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)) {
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]*)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]*)"[^>]*Id="${m[2]}"`).exec(rels)?.[1];
    const path = target ? `xl/${target.replace(/^\/?xl\//, '')}` : null;
    const xml = path ? files[path] : null;
    if (!xml) continue;
    const rows = [];
    for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
      const cells = [];
      for (const c of row.match(/<c [^>]*?(\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = /r="([A-Z]+\d+)"/.exec(c)?.[1];
        const type = /t="([^"]*)"/.exec(c)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
        const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c)?.[1];
        let value = '';
        if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr' && inline !== undefined) value = unescape(inline);
        else if (v !== undefined) value = unescape(v);
        if (ref) cells[columnOf(ref)] = value;
      }
      rows.push(Array.from(cells, (x) => x ?? ''));
    }
    sheets.push({ name: unescape(m[1]), rows });
  }
  return sheets;
}
