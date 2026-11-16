// 역이 땅속에 있는지: 부산교통공사 역정보 주소(data/build/station-info.json)에 "지하"가 있으면 땅속 역이다.
/** @param {string|null|undefined} address */
export function isUnderground(address) {
  return /지하/.test(address ?? '');
}
