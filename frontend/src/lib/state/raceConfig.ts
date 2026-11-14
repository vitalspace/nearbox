import type { RaceModel, RacePower } from '../services/protocol';

/**
 * Track, grid, gates and race constants. Must match
 * `backend/src/ws/race.ts` and the geometry measured on `map.glb`.
 */

export const TRACK_CENTER = { x: 0.1056, z: 0 } as const;
export const TRACK_INNER_RADIUS = 86.0;
export const TRACK_OUTER_RADIUS = 100.0;
export const TRACK_CENTER_RADIUS = 93.0;
export const TRACK_SURFACE_Y = 0.02;
export const CHASSIS_SPAWN_Y = 1.1;
export const TOTAL_LAPS = 5;
export const RACE_MAX_PLAYERS = 6;
export const COUNTDOWN_MS = 30_000;
export const COUNTDOWN_FULL_MS = 10_000;
export const RESULT_MS = 15_000;
export const FINISH_WINDOW_MS = 15_000;
export const RACE_MAX_MS = 480_000;
export const RESPAWN_MS = 3_000;
export const RESET_COOLDOWN_MS = 2_000;
export const MAX_SPEED = 55;
export const STATE_INTERVAL_MS = 100;
export const GATE_INNER_RADIUS = 86.5;
export const GATE_OUTER_RADIUS = 99.5;
export const ITEM_RESPAWN_MS = 5_000;
export const ITEM_PICKUP_RADIUS = 3.5;
export const MAX_HEALTH = 100;
export const MISSILE_DAMAGE = 30;
export const MISSILE_RANGE = 60;
export const MISSILE_FLIGHT_MS = 1_200;
export const NITRO_MS = 3_000;
export const NITRO_ENGINE_FACTOR = 1.8;
export const REPAIR_HP = 35;
export const AUTO_REPAIR_MS = 5_000;
export const AUTO_REPAIR_RATE = 10;
export const SHIELD_MS = 4_000;
export const MINE_DAMAGE = 30;
export const MINE_RADIUS = 2.6;
export const MINE_ARM_MS = 1_000;
export const MINE_LIFETIME_MS = 20_000;
export const RAY_DAMAGE = 25;
export const RAY_RANGE = 60;
export const GRID_YAW = -Math.PI / 2;

export { RACE_ENTRY, RACE_EXIT } from './playerState';

export type RaceSlot = {
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export const RACE_GRID: readonly RaceSlot[] = [
	{ x: 89.5, y: CHASSIS_SPAWN_Y, z: -4.5, yaw: GRID_YAW },
	{ x: 93.5, y: CHASSIS_SPAWN_Y, z: -4.5, yaw: GRID_YAW },
	{ x: 97.5, y: CHASSIS_SPAWN_Y, z: -4.5, yaw: GRID_YAW },
	{ x: 89.5, y: CHASSIS_SPAWN_Y, z: -11.0, yaw: GRID_YAW },
	{ x: 93.5, y: CHASSIS_SPAWN_Y, z: -11.0, yaw: GRID_YAW },
	{ x: 97.5, y: CHASSIS_SPAWN_Y, z: -11.0, yaw: GRID_YAW }
];

export type RaceGate = {
	index: number;
	angle: number;
	x: number;
	z: number;
	yaw: number;
	/** Half-width of a proximity checkpoint's trigger, in metres. */
	radius?: number;
};

function gateFor(index: number): RaceGate {
	const angle = (index * Math.PI) / 4;

	return {
		index,
		angle,
		x: TRACK_CENTER.x + TRACK_CENTER_RADIUS * Math.cos(angle),
		z: TRACK_CENTER.z + TRACK_CENTER_RADIUS * Math.sin(angle),
		// Car local forward is +X: this yaw points it along the rising θ tangent.
		yaw: Math.atan2(-Math.cos(angle), -Math.sin(angle))
	};
}

export const RACE_GATES: readonly RaceGate[] = Array.from({ length: 8 }, (_, index) =>
	gateFor(index)
);

/**
 * Haunted Highway checkpoints, measured from `HW_Track_Asphalt`. Gate 0 is the
 * `HW_StartFinish_Checker`; the track is a 1,030 m loop with an S-chicane.
 */
export const ROADMAP_RACE_GATES: readonly RaceGate[] = [
	{ index: 0, angle: 0, x: -79.36, z: 132.29, yaw: -0.019, radius: 12 },
	{ index: 1, angle: 0, x: 49.39, z: 129.91, yaw: 0.06, radius: 12 },
	{ index: 2, angle: 0, x: 129.62, z: 49.77, yaw: 1.707, radius: 12 },
	{ index: 3, angle: 0, x: 122.08, z: -69.8, yaw: 1.853, radius: 12 },
	{ index: 4, angle: 0, x: 21.97, z: -131.29, yaw: 2.727, radius: 12 },
	{ index: 5, angle: 0, x: -101.05, z: -109.23, yaw: -2.434, radius: 12 },
	{ index: 6, angle: 0, x: -100.4, z: -0.07, yaw: -0.441, radius: 12 },
	{ index: 7, angle: 0, x: -92.48, z: 72.49, yaw: -2.988, radius: 12 }
];

export type RaceItemDefinition = {
	id: string;
	x: number;
	y: number;
	z: number;
};

export const RACE_ITEMS: readonly RaceItemDefinition[] = [
	{ id: 'item-0', x: 84.68, y: 1.2, z: 30.78 },
	{ id: 'item-1', x: 61.81, y: 1.2, z: 73.54 },
	{ id: 'item-2', x: 15.73, y: 1.2, z: 88.63 },
	{ id: 'item-3', x: -32.73, y: 1.2, z: 90.21 },
	{ id: 'item-4', x: -68.84, y: 1.2, z: 57.85 },
	{ id: 'item-5', x: -94.44, y: 1.2, z: 16.67 },
	{ id: 'item-6', x: -84.47, y: 1.2, z: -30.78 },
	{ id: 'item-7', x: -61.6, y: 1.2, z: -73.54 },
	{ id: 'item-8', x: -15.52, y: 1.2, z: -88.63 },
	{ id: 'item-9', x: 32.94, y: 1.2, z: -90.21 },
	{ id: 'item-10', x: 69.05, y: 1.2, z: -57.85 },
	{ id: 'item-11', x: 94.65, y: 1.2, z: -16.67 }
];

export const RACE_MODELS: readonly RaceModel[] = [
	'coche_calabaza',
	'coche_momia',
	'coche_halloween'
];

export const POWER_NAMES: Record<RacePower, string> = {
	nitro: 'Nitro',
	repair: 'Repair',
	auto: 'Auto-repair',
	missile: 'Missile',
	shield: 'Shield',
	mine: 'Mine',
	ray: 'Ray'
};

export const POWER_COLORS: Record<RacePower, string> = {
	nitro: '#38bdf8',
	repair: '#4ade80',
	auto: '#a3e635',
	missile: '#f97316',
	shield: '#a78bfa',
	mine: '#ef4444',
	ray: '#facc15'
};

/** Collision groups (16-bit membership / 16-bit filter). */
export const GROUP_DEFAULT = 0x0001;
export const GROUP_FREECAR = 0x0002;
export const GROUP_RACECAR = 0x0004;
export const GROUP_RACEGUARD = 0x0008;

export const FREECAR_COLLISION_GROUPS = (GROUP_FREECAR << 16) | GROUP_DEFAULT;
export const RACECAR_COLLISION_GROUPS =
	(GROUP_RACECAR << 16) | (GROUP_DEFAULT | GROUP_RACECAR | GROUP_RACEGUARD);
export const RACEGUARD_COLLISION_GROUPS = (GROUP_RACEGUARD << 16) | GROUP_RACECAR;

export function trackRadius(x: number, z: number): number {
	return Math.hypot(x - TRACK_CENTER.x, z - TRACK_CENTER.z);
}

export function gatePoint(index: number, radius = TRACK_CENTER_RADIUS): { x: number; z: number } {
	const angle = (index * Math.PI) / 4;

	return {
		x: TRACK_CENTER.x + radius * Math.cos(angle),
		z: TRACK_CENTER.z + radius * Math.sin(angle)
	};
}

export function yawForGate(index: number): number {
	return RACE_GATES[index]?.yaw ?? GRID_YAW;
}
