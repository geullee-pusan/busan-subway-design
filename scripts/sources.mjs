// 원본 자료 목록. npm run fetch가 이 목록대로 data/raw/에 내려받는다.
// 사람이 읽는 설명(제목, 이용 조건, 표기 문구)은 data/SOURCES.md에 있다.
// sha256이 있는 항목은 받은 뒤 해시가 같은지 확인한다.

const DATA_GO_KR = 'https://www.data.go.kr/cmm/cmm/fileDownload.do';

/** 공공데이터포털 파일데이터 주소. atchFileId는 판마다 바뀌므로 받은 판으로 고정한다. */
function dataGoKr(atchFileId) {
  return `${DATA_GO_KR}?atchFileId=${atchFileId}&fileDetailSn=1&insertDataPrcus=N`;
}

const ADMDONG_COMMIT = '7360288277dfd12d74e54b959c59bdd66f852e3a';
const ADMDONG_BASE = `https://raw.githubusercontent.com/vuski/admdongkor/${ADMDONG_COMMIT}`;
const SKADI_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi';

// Overpass에 보낼 범위(남, 서, 북, 동). 격자 범위(부산·울산·김해·창원·양산)보다 넉넉하게 잡는다.
export const OSM_BBOX = '34.85,127.80,36.65,129.70';

export const SOURCES = [
  // 부산교통공사 (공공데이터포털)
  { key: 'station-info', file: 'data/raw/datagokr/15043686.csv', url: dataGoKr('FILE_000000002438468'), size: 28266 },
  { key: 'station-detail', file: 'data/raw/datagokr/15050408.csv', url: dataGoKr('FILE_000000002540193'), size: 32270 },
  { key: 'link-time', file: 'data/raw/datagokr/3033564.csv', url: dataGoKr('FILE_000000003113886'), size: 3515 },
  { key: 'timetable', file: 'data/raw/datagokr/15082980.csv', url: dataGoKr('FILE_000000003680384'), size: 3595188 },
  { key: 'speed', file: 'data/raw/datagokr/15142581.csv', url: dataGoKr('FILE_000000003113888'), size: 118 },
  { key: 'ridership-hourly-2025', file: 'data/raw/datagokr/3057229_2025.csv', url: dataGoKr('FILE_000000003585709'), size: 10200261 },
  { key: 'ridership-annual-2025', file: 'data/raw/datagokr/3033569.csv', url: dataGoKr('FILE_000000003630293'), size: 7397 },

  // 국가철도공단 역 위치 (공공데이터포털)
  { key: 'krna-line1', file: 'data/raw/datagokr/15041165.csv', url: dataGoKr('FILE_000000002646360'), size: 2004 },
  { key: 'krna-line2', file: 'data/raw/datagokr/15041166.csv', url: dataGoKr('FILE_000000002646355'), size: 2245 },
  { key: 'krna-line3', file: 'data/raw/datagokr/15041167.csv', url: dataGoKr('FILE_000000002646350'), size: 891 },
  { key: 'krna-line4', file: 'data/raw/datagokr/15041168.csv', url: dataGoKr('FILE_000000002646344'), size: 729 },

  // 한국철도공사 동해선, 김해시 경전철 (공공데이터포털)
  { key: 'donghae-stations', file: 'data/raw/datagokr/15137827.csv', url: dataGoKr('FILE_000000003029206'), size: 2053 },
  { key: 'bgl-ridership', file: 'data/raw/datagokr/15105181.csv', url: dataGoKr('FILE_000000003599678'), size: 3095702 },

  // 공식 노선 색을 뽑는 노선도 이미지 (공공데이터포털, 큰 파일이라 git에 넣지 않는다)
  { key: 'route-map', file: 'data/raw/datagokr/15054957.zip', url: dataGoKr('FILE_000000003511950'), size: 15372503 },

  // 부산 시내버스 노선별 정류장 차례와 승하차(공공데이터포털 15123610, "_20230731" 판, 1회성, 이용허락범위 제한 없음)
  { key: 'bus-route-stops', file: 'data/raw/datagokr/15123610.csv', url: dataGoKr('FILE_000000002818223'), size: 4000930 },
  // 부산 버스 정류소 자리(공공데이터포털 15084251, SHP "_20260912" 판, 이용허락범위 제한 없음)
  // 부산도시철도 역사 안내방송(공공데이터포털 3033578, 이용허락범위 제한 없음). 190MB라 git에 넣지 않는다.
  { key: 'station-broadcast', file: 'data/raw/datagokr/3033578.zip', url: dataGoKr('FILE_000000003514100'), size: 190493128 },
  // 울산·창원·김해 버스 정류소 자리(공공데이터포털, 이용허락범위는 받을 때 확인). 지도 범위를 넓히면서 더했다.
  { key: 'bus-stops-ulsan', file: 'data/raw/datagokr/15052671.csv', url: dataGoKr('FILE_000000003644754') },
  { key: 'bus-stops-changwon', file: 'data/raw/datagokr/15037805.csv', url: dataGoKr('FILE_000000003634298') },
  { key: 'bus-stops-gimhae', file: 'data/raw/datagokr/15105200.csv', url: dataGoKr('FILE_000000003661635') },
  // 김해 정류소 현황(15105200)에는 좌표가 없다. 좌표는 버스정보 안내 단말기 설치 현황(단말기가 있는 정류장만)에서 가져온다.
  { key: 'bus-bit-gimhae', file: 'data/raw/datagokr/15104697.csv', url: dataGoKr('FILE_000000003534016') },
  { key: 'bus-route-use-2025', file: 'data/raw/datagokr/15095329.csv', url: dataGoKr('FILE_000000003617805'), size: 20763 },
  { key: 'bus-stops', file: 'data/raw/datagokr/15084251.zip', url: dataGoKr('FILE_000000002797912'), size: 454474 },

  // 대구 도시철도(대구교통공사, 지도 범위 넓히기 3단계 다음의 대구권 전철)
  { key: 'daegu-link', file: 'data/raw/datagokr/15002510.csv', url: dataGoKr('FILE_000000003093558'), size: 1701 },
  { key: 'daegu-section-1', file: 'data/raw/datagokr/15061836.csv', url: dataGoKr('FILE_000000003584013'), size: 4140 },
  { key: 'daegu-section-2', file: 'data/raw/datagokr/15061835.csv', url: dataGoKr('FILE_000000003584015'), size: 3987 },
  { key: 'daegu-section-3', file: 'data/raw/datagokr/15061797.csv', url: dataGoKr('FILE_000000003584016'), size: 4124 },
  { key: 'daegu-exits-1', file: 'data/raw/datagokr/15133918.csv', url: dataGoKr('FILE_000000003003022'), size: 4856 },
  { key: 'daegu-exits-2', file: 'data/raw/datagokr/15133920.csv', url: dataGoKr('FILE_000000003046570'), size: 5502 },
  { key: 'daegu-exits-3', file: 'data/raw/datagokr/15133922.csv', url: dataGoKr('FILE_000000003003032'), size: 2417 },
  { key: 'daegu-timetable-1-down', file: 'data/raw/datagokr/15138731.csv', url: dataGoKr('FILE_000000003042539'), size: 249244 },
  { key: 'daegu-timetable-2-up', file: 'data/raw/datagokr/3033376.csv', url: dataGoKr('FILE_000000003056832'), size: 213492 },
  { key: 'daegu-timetable-2-down', file: 'data/raw/datagokr/15138732.csv', url: dataGoKr('FILE_000000003042590'), size: 213148 },
  { key: 'daegu-timetable-3-up', file: 'data/raw/datagokr/15065532.csv', url: dataGoKr('FILE_000000003042729'), size: 237914 },
  { key: 'daegu-timetable-3-down', file: 'data/raw/datagokr/15138734.csv', url: dataGoKr('FILE_000000003042741'), size: 237914 },
  { key: 'daegu-ridership', file: 'data/raw/datagokr/15002503.csv', url: dataGoKr('FILE_000000007686014'), size: 4479159 },
  { key: 'daegu-transfers', file: 'data/raw/datagokr/15041092.csv', url: dataGoKr('FILE_000000003522955'), size: 2004 },
  // 대구 열차 안 소리(232MB, git에 넣지 않음)
  { key: 'daegu-broadcast', file: 'data/raw/datagokr/15063230.zip', url: dataGoKr('FILE_000000003626166'), size: 232504247 },

  // 시승 모드 역명판 글꼴: 프리텐다드 굵은체 한글 2,350자 묶음 (npm pretendard 1.3.9, SIL OFL 1.1)
  { key: 'pretendard-bold', file: 'data/raw/fonts/Pretendard-Bold.subset.woff2', url: 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2-subset/Pretendard-Bold.subset.woff2', size: 270784 },
  { key: 'pretendard-license', file: 'data/raw/fonts/Pretendard-LICENSE.txt', url: 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/LICENSE.txt', size: 4419 },

  // 행정안전부 주민등록 인구 (공공데이터포털)
  { key: 'population', file: 'data/raw/datagokr/15097972.csv', url: dataGoKr('FILE_000000007644704'), size: 2568139 },

  // 행정동 경계 (GitHub vuski/admdongkor, 커밋 고정)
  { key: 'admdong', file: 'data/raw/admdongkor/HangJeongDong_ver20260701.geojson', url: `${ADMDONG_BASE}/ver20260701/HangJeongDong_ver20260701.geojson`, size: 34648875 },
  { key: 'admdong-license', file: 'data/raw/admdongkor/LICENSE-DATA', url: `${ADMDONG_BASE}/LICENSE-DATA` },

  // 고도 (Tilezen Terrain Tiles, skadi 형식 SRTM 1초)
  { key: 'dem-N34E128', file: 'data/raw/dem/N34E128.hgt.gz', url: `${SKADI_BASE}/N34/N34E128.hgt.gz`, size: 2191975 },
  { key: 'dem-N34E129', file: 'data/raw/dem/N34E129.hgt.gz', url: `${SKADI_BASE}/N34/N34E129.hgt.gz`, size: 1973798 },
  { key: 'dem-N35E128', file: 'data/raw/dem/N35E128.hgt.gz', url: `${SKADI_BASE}/N35/N35E128.hgt.gz`, size: 12836160 },
  { key: 'dem-N35E129', file: 'data/raw/dem/N35E129.hgt.gz', url: `${SKADI_BASE}/N35/N35E129.hgt.gz`, size: 6095710 },
  // 지도 범위 넓히기 3(대구·구미·경산·칠곡): 북쪽과 서쪽 타일
  { key: 'dem-N35E127', file: 'data/raw/dem/N35E127.hgt.gz', url: `${SKADI_BASE}/N35/N35E127.hgt.gz`, size: 14668974 },
  { key: 'dem-N36E127', file: 'data/raw/dem/N36E127.hgt.gz', url: `${SKADI_BASE}/N36/N36E127.hgt.gz`, size: 13093831 },
  { key: 'dem-N36E128', file: 'data/raw/dem/N36E128.hgt.gz', url: `${SKADI_BASE}/N36/N36E128.hgt.gz`, size: 13521169 },
  { key: 'dem-N36E129', file: 'data/raw/dem/N36E129.hgt.gz', url: `${SKADI_BASE}/N36/N36E129.hgt.gz`, size: 8473868 },

  // OpenStreetMap (Overpass API). 받을 때마다 내용이 바뀔 수 있어 git에 넣어 둔다.
  {
    key: 'osm-water',
    file: 'data/raw/osm/water.json',
    overpass: `[out:json][timeout:180][bbox:${OSM_BBOX}];
(
  way["natural"="water"];
  relation["natural"="water"];
  way["waterway"="riverbank"];
  relation["waterway"="riverbank"];
);
out geom;`,
  },
  {
    key: 'osm-routes',
    file: 'data/raw/osm/routes.json',
    overpass: `[out:json][timeout:180][bbox:${OSM_BBOX}];
(
  relation["type"="route"]["route"~"^(subway|monorail|light_rail)$"];
  relation["type"="route"]["route"="train"]["service"="commuter"];
  relation["type"="route_master"]["route_master"~"^(subway|monorail|light_rail|train)$"];
);
out geom;`,
  },
  {
    key: 'osm-stations',
    file: 'data/raw/osm/stations.json',
    overpass: `[out:json][timeout:180][bbox:${OSM_BBOX}];
(
  nwr["railway"~"^(station|halt|stop)$"];
  nwr["public_transport"~"^(station|stop_position)$"]["train"="yes"];
  nwr["public_transport"~"^(station|stop_position)$"]["subway"="yes"];
  nwr["public_transport"~"^(station|stop_position)$"]["light_rail"="yes"];
  nwr["public_transport"~"^(station|stop_position)$"]["monorail"="yes"];
  relation["public_transport"="stop_area"];
  nwr["railway"="construction"]["construction"~"station"];
  nwr["construction:railway"~"station"];
  nwr["railway"="proposed"]["proposed"~"station"];
  nwr["proposed:railway"~"station"];
);
out center;`,
  },
];
