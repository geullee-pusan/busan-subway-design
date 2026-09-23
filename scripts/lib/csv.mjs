// CSV 읽기. 공공데이터포털 파일은 EUC-KR(CP949), UTF-8, UTF-16(엑셀 "유니코드 텍스트")이 섞여 있다.
import { readFileSync } from 'node:fs';

/**
 * 바이트를 글자로 바꾼다. BOM이 있으면 BOM대로(UTF-8, UTF-16),
 * 없으면 UTF-8로 읽어 보고, 안 되면 EUC-KR로 읽는다.
 */
export function decodeText(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(buf.subarray(3)), encoding: 'utf-8 (BOM)' };
  }
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'utf-16le (BOM)' };
  }
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'utf-16be (BOM)' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('euc-kr').decode(buf), encoding: 'euc-kr' };
  }
}

/** 첫 줄에 탭이 쉼표보다 많으면 탭으로 나눈 파일로 본다. */
export function detectDelimiter(text) {
  const end = text.indexOf('\n');
  const first = end === -1 ? text : text.slice(0, end);
  const tabs = first.split('\t').length;
  const commas = first.split(',').length;
  return tabs > commas ? '\t' : ',';
}

/** CSV 글자를 행 배열로 나눈다. 따옴표 안의 구분자, 줄바꿈, 겹따옴표("")를 지킨다. */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/**
 * 칸 값을 숫자로 바꾼다. "1,005"처럼 쉼표가 든 숫자가 있어서 쉼표와 공백을 먼저 지운다.
 * 빈 칸은 0으로 본다. 숫자가 아니면 NaN을 돌려준다.
 */
export function toNumber(text) {
  const clean = String(text ?? '').replace(/[,\s]/g, '');
  return clean === '' ? 0 : Number(clean);
}

/** 파일을 읽어 첫 행을 머리글로 삼은 객체 배열로 돌려준다. 값의 앞뒤 공백은 지운다. */
export function readCsv(path, { delimiter } = {}) {
  const { text, encoding } = decodeText(readFileSync(path));
  const rows = parseCsv(text, delimiter);
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { header, records, encoding };
}
