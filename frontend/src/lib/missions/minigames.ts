/**
 * Mission metadata for the competitive minigames.
 *
 * The server decides the result; the client only records the local victory so
 * the skin reward can be persisted in `rw:missions:v1` and `rw:profile:v1`,
 * the same way `cats-25` and `crypt-5-skulls` work.
 */
export const MISSION_RACE_5_LAPS = {
	id: 'race-5-laps',
	title: 'Grand Prix',
	description: 'Win the five-lap Grand Prix on TWN_Track.'
} as const;

export const MISSION_BARN_8_WAVES = {
	id: 'barn-8-waves',
	title: 'Barn Siege',
	description: 'Survive all eight waves and hold the farm.'
} as const;

export const MISSION_HEXFIRE_FIRST_WIN = {
	id: 'hexfire-first-win',
	title: 'Hexfire Deathmatch',
	description: 'Win a team deathmatch at the Witch House.'
} as const;

export const MISSION_PARKOUR_SUMMIT = {
	id: 'parkour-summit',
	title: 'Parkour Spire',
	description: 'Be the first to reach the summit of the parkour tower.'
} as const;

export const MISSION_ROYALE_FIRST_WIN = {
	id: 'royale-first-win',
	title: 'Skyfall Royale',
	description: 'Win a battle royale on Islas Ciudad.'
} as const;

export const MINIGAME_MISSIONS = [
	MISSION_RACE_5_LAPS,
	MISSION_BARN_8_WAVES,
	MISSION_HEXFIRE_FIRST_WIN,
	MISSION_PARKOUR_SUMMIT,
	MISSION_ROYALE_FIRST_WIN
] as const;

export type MinigameMission = (typeof MINIGAME_MISSIONS)[number];
export type MinigameMissionId = MinigameMission['id'];

export const MINIGAME_MISSION_BY_ID: ReadonlyMap<string, MinigameMission> = new Map(
	MINIGAME_MISSIONS.map((mission) => [mission.id, mission])
);
