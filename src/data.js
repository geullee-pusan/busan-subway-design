// data/build/의 게임용 자료를 한곳에서 읽는다. 빌드할 때 파일 안에 함께 들어간다(오프라인).
import placesFile from './content/places.json';
import rulesFile from './content/rules.json';
import missionsFile from './content/missions.json';
import districtsFile from '../data/build/districts.json';
import dongsFile from '../data/build/dongs.json';
import futureFile from '../data/build/future-lines.json';
import standardsFile from '../data/standards.json';
import gridFile from '../data/build/grid.json';
import linesFile from '../data/build/lines.json';
import linksFile from '../data/build/links.json';
import ridershipFile from '../data/build/ridership.json';
import schematicFile from '../data/build/schematic.json';
import serviceFile from '../data/build/service.json';
import stationInfoFile from '../data/build/station-info.json';
import stationsFile from '../data/build/stations.json';
import transfersFile from '../data/build/transfers.json';

export const grid = gridFile;
export const lines = linesFile.lines;
export const planned = linesFile.planned;
export const stations = stationsFile.stations;
export const links = linksFile.links;
export const transfers = transfersFile.transfers;
export const districts = districtsFile;
export const ridership = ridershipFile;
export const stationInfo = stationInfoFile.stations;
export const schematic = schematicFile;
export const service = serviceFile;
export const dongs = dongsFile.dongs;
export const places = placesFile.places;
export const ruleCards = rulesFile.rules;
export const ruleTables = rulesFile.tables;
export const missions = missionsFile.missions;
export const futureLines = futureFile;
export const standards = standardsFile.standards;

/** 역 id → 역 */
export const stationById = new Map(stations.map((s) => [s.id, s]));
/** 노선 id → 노선 */
export const lineById = new Map(lines.map((l) => [l.id, l]));

/** 한 역이 속한 환승 묶음의 다른 역들 */
export function transferSiblings(stationId) {
  const group = transfers.find((t) => t.stations.includes(stationId));
  if (!group) return [];
  return group.stations.filter((id) => id !== stationId).map((id) => stationById.get(id));
}

/** 역의 이용객. 게이트가 합쳐진 역은 같은 환승역의 자료를 쓴다. */
export function ridershipOf(stationId) {
  const own = ridership.stations[stationId];
  if (own) return { data: own, from: null };
  const shared = ridership.missing.find((m) => m.id === stationId);
  if (shared) {
    for (const sibling of transferSiblings(stationId)) {
      const data = ridership.stations[sibling.id];
      if (data) return { data, from: sibling };
    }
  }
  return { data: null, from: null };
}

/** 역의 앞뒤 구간(거리와 시간) */
export function neighborLinks(stationId) {
  return links
    .filter((l) => l.from === stationId || l.to === stationId)
    .map((l) => ({
      other: stationById.get(l.from === stationId ? l.to : l.from),
      distanceM: l.distanceM,
      runS: l.runS,
      estimated: l.runSource?.startsWith('추정') ?? false,
    }));
}
