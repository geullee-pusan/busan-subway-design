// npm run gangwon-bis: 강원 시·군 버스정보 누리집의 정류장 목록(이름, 좌표)을 받아 data/raw/gangwon-bis/<이름>.json에 둔다.
// 국토교통부_버스노선별 경유정류장(15142031, npm run molit-bus)에는 좌표가 없어서, scripts/lib/molit-bus.mjs가 이 목록으로 자리를 찾는다.
// - BIS 형식(삼척·정선·양양·인제·고성·평창·강릉): /search/station?keyword=% 한 번. 정류장 번호(stationId2)가 15142031의 sttn_id와 같다.
// - pti 형식(화천·속초·동해·영월): typicalstop getsrch 한 번(artpp를 크게). 번호 체계가 달라 이름으로 맞춘다.
// 누리집마다 한 번만 부르고, 부른 뒤 쉰다(삼척시 누리집 robots.txt Crawl-delay 30초). 인증키는 쓰지 않는다.
//   npm run gangwon-bis -- --force   이미 받은 곳도 다시 받는다
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { GANGWON_BIS_SITES } from './lib/molit-bus.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(ROOT, 'data/raw/gangwon-bis');
mkdirSync(outDir, { recursive: true });
const lockPath = resolve(ROOT, 'data/raw-lock.json');
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

function urlOf(site) {
  if (site.kind === 'bis') return `${site.base}/search/station?keyword=%25&locale=0&searchBy=stationNm&sigungu=sigungu&umdong=umdong`;
  const ymd = today.replaceAll('-', '');
  return `${site.base}/index.php?mt=data&cm=road&oxid=1&cmd=typicalstop&subcmd=getsrch&cpage=1&artpp=5000&navinum=5&orf=0&ort=0&str=%25&sdate=${ymd}`;
}

/** 받은 글 → [id, 이름, 경도, 위도, 주소] 줄 */
function rowsOf(site, buf) {
  if (site.kind === 'bis') {
    const json = JSON.parse(buf.toString('utf8'));
    return (json.list ?? []).map((s) => [String(s.stationId2), String(s.stationNm ?? '').trim(), Number(s.coordnatesx), Number(s.coordnatesy), null]);
  }
  const text = new TextDecoder('euc-kr').decode(buf);
  const m = /<data><!\[CDATA\[(.*)\]\]><\/data>/s.exec(text);
  if (!m) throw new Error(`알 수 없는 응답: ${text.slice(0, 120)}`);
  const json = JSON.parse(m[1]);
  if (Number(json.tpage) > 1) throw new Error(`쪽이 ${json.tpage}개예요. artpp를 늘려요.`);
  // MAP_X가 위도, MAP_Y가 경도다(화천 주파리 MAP_X 38.29, MAP_Y 127.66).
  return Object.values(json.data ?? {}).map((s) => [String(s.ID_NUM), String(s.SNAME ?? '').trim(), Number(s.MAP_Y), Number(s.MAP_X), s.ADDR ?? null]);
}

/**
 * pti 형식의 정류장 검색에는 대표 정류장만 있다(화천은 화천 정류장 164곳). 그래서 routePages가 있는 곳은
 * 노선 목록을 받고 노선마다 자세히 보기 쪽의 지도 표시(ds,stop,번호,위도,경도,이름)에서 정류장을 더 모은다.
 */
async function routeStops(site) {
  const ymd = today.replaceAll('-', '');
  const page = async (query) => {
    const res = await fetch(`${site.base}/index.php?mt=page&mp=${site.routePages}&mm=road&oxid=1&cmd=table&tid=1&sdate=${ymd}&${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new TextDecoder('euc-kr').decode(Buffer.from(await res.arrayBuffer()));
  };
  const list = await page('subcmd=list&artpp=1000&cpage=1');
  const ids = [...new Set([...list.matchAll(/actionView\('table','view','(\d+)'/g)].map((m) => m[1]))];
  const stops = new Map();
  const routes = [];
  for (const [i, id] of ids.entries()) {
    await sleep(site.delay * 1000);
    let html = null;
    for (let attempt = 1; attempt <= 3 && html === null; attempt++) {
      try {
        html = await page(`subcmd=view&id=${id}&artpp=10&navinum=5&cpage=1`);
      } catch (error) {
        console.log(`  ${site.name} 노선 ${id}: ${error.message}. 다시 해요.`);
        await sleep(attempt * 5000);
      }
    }
    if (html === null) throw new Error(`노선 ${id}를 받지 못했어요`);
    for (const m of html.matchAll(/ds,(?:first|stop|last|end),(\d+),([0-9.]+),([0-9.]+),([^|"']+)/g)) {
      if (!stops.has(m[1])) stops.set(m[1], [`ds${m[1]}`, m[4].trim(), Number(m[3]), Number(m[2]), null]);
    }
    if (site.saveRoutes) {
      // 노선 번호(span.num), 다니는 요일, "일 4회 운행 - 07:00 11:00 …"(기점을 떠나는 시각), 정류장 차례(map1, map2 …의 oxMapMark)
      const no = /<span class="num">([^<]*)<\/span>/.exec(html)?.[1]?.trim() ?? '';
      const days = /<span class="days">([^<]*)<\/span>/.exec(html)?.[1]?.trim() ?? '';
      const runs = /운행\s*-\s*([0-9:\s]+)</.exec(html)?.[1]?.match(/\d{1,2}:\d{2}/g) ?? [];
      const seq = [...html.matchAll(/id="map(\d+)"[^>]*oxMapMark="ds,[a-z]+,(\d+),([0-9.]+),([0-9.]+),([^"]*)"/g)]
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .map((m) => [`ds${m[2]}`, m[5].trim(), Number(m[4]), Number(m[3])]);
      routes.push({ id, no, days, runs, stops: seq });
    }
    if ((i + 1) % 20 === 0) console.log(`  ${site.name}: 노선 ${i + 1}/${ids.length}`);
  }
  return { routes: ids.length, rows: [...stops.values()], routeList: routes };
}

const FIELDS = ['id', 'name', 'lon', 'lat', 'addr'];
for (const site of GANGWON_BIS_SITES) {
  const file = resolve(outDir, `${site.id}.json`);
  if (existsSync(file) && !process.argv.includes('--force')) {
    console.log(`${site.name}: 이미 받았어요.`);
    continue;
  }
  const url = urlOf(site);
  let rows = null;
  for (let attempt = 1; attempt <= 3 && !rows; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rows = rowsOf(site, Buffer.from(await res.arrayBuffer()));
    } catch (error) {
      console.log(`  ${site.name}: ${error.message}. 쉬었다가 다시 해요.`);
      await sleep(site.delay * 1000);
    }
  }
  if (!rows?.length) {
    console.log(`${site.name}: 받지 못했어요.`);
    continue;
  }
  let routeNote = '';
  if (site.routePages) {
    await sleep(site.delay * 1000);
    const extra = await routeStops(site);
    rows.push(...extra.rows);
    routeNote = ` 노선 ${extra.routes}개의 자세히 보기 쪽에서 정류장 ${extra.rows.length}곳을 더함(id가 ds로 시작).`;
    console.log(`  ${site.name}: 노선 ${extra.routes}개에서 정류장 ${extra.rows.length}곳`);
    if (site.saveRoutes) {
      const routeText = JSON.stringify({
        source: `${site.title} 노선정보 자세히 보기`,
        site: site.base,
        fetched: today,
        fields: { stops: ['id', 'name', 'lon', 'lat'], runs: '기점을 떠나는 시각' },
        routes: extra.routeList,
      });
      writeFileSync(resolve(outDir, `${site.id}-routes.json`), routeText);
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      lock[`gangwon-bis-${site.id}-routes`] = {
        file: `data/raw/gangwon-bis/${site.id}-routes.json`,
        url: `${site.base}/index.php?mp=${site.routePages}`,
        bytes: Buffer.byteLength(routeText),
        sha256: createHash('sha256').update(routeText).digest('hex'),
        fetched: today,
        note: `노선 목록과 노선마다 자세히 보기 쪽(${extra.routes}개)에서 번호, 요일, 출발 시각, 정류장 차례를 골라 다시 적은 파일(npm run gangwon-bis).`,
      };
      writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
    }
  }
  const bad = rows.filter((r) => !(r[2] > 124 && r[2] < 132 && r[3] > 33 && r[3] < 39.5)).length;
  rows = rows.filter((r) => r[2] > 124 && r[2] < 132 && r[3] > 33 && r[3] < 39.5);
  const data = { source: `${site.title} 정류장 검색`, site: site.base, kind: site.kind, fetched: today, fields: FIELDS, rows };
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock[`gangwon-bis-${site.id}`] = {
    file: `data/raw/gangwon-bis/${site.id}.json`,
    url,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    fetched: today,
    note: `누리집 화면이 부르는 정류장 검색 응답을 필드만 골라 다시 적은 파일(npm run gangwon-bis).${routeNote}`,
  };
  writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
  console.log(`${site.name}: 정류장 ${rows.length}곳${bad ? `(좌표가 이상한 ${bad}곳 뺌)` : ''}`);
  await sleep(site.delay * 1000);
}
