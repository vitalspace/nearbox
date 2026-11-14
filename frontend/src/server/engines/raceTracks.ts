import type { RaceTrackId } from '../protocol';

/**
 * Track data shared by the authoritative race engine.
 *
 * The engine is the same for the Grand Prix and the Haunted Highway: only the grid,
 * checkpoint layout, item boxes and the off-track test change. Keeping the
 * data here avoids scattering track-specific constants through the race loop.
 */

export type RaceGateConfig = {
	x: number;
	y: number;
	z: number;
	/** Radius used by tracks whose checkpoints are proximity triggers. */
	radius: number;
	/** Direction of travel at the gate (car local forward is +X). */
	yaw: number;
};

export type RaceGridSlot = {
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export type RaceItemConfig = {
	x: number;
	y: number;
	z: number;
};

export type RaceTrackConfig = {
	id: RaceTrackId;
	name: string;
	totalLaps: number;
	maxPlayers: number;
	raceMaxMs: number;
	/** `line` uses the radial TWN gates; `radius` uses proximity checkpoints. */
	gateMode: 'line' | 'radius';
	grid: readonly RaceGridSlot[];
	gates: readonly RaceGateConfig[];
	items: readonly RaceItemConfig[];
	/** Y below which a car is considered to have fallen out of the track. */
	fallY: number;
	isOffTrack: (x: number, y: number, z: number) => boolean;
};

export const GRAND_PRIX_TRACK_ID = 'grand-prix' as const;
export const ROADMAP_TRACK_ID = 'roadmap' as const;

export const TRACK_CENTER = { x: 0.1056, z: 0 } as const;
export const TRACK_CENTER_RADIUS = 93.0;
export const TRACK_SURFACE_Y = 0.02;
export const CHASSIS_SPAWN_Y = 1.1;
export const GATE_INNER_RADIUS = 86.5;
export const GATE_OUTER_RADIUS = 99.5;
export const OFF_TRACK_INNER = 84;
export const OFF_TRACK_OUTER = 102;

export const GRID_YAW = -Math.PI / 2;

function gateAngle(index: number): number {
	return (index * Math.PI) / 4;
}

/** Yaw for a car whose local forward axis is +X to face the rising θ tangent. */
function yawForAngle(angle: number): number {
	return Math.atan2(-Math.cos(angle), -Math.sin(angle));
}

function grandPrixGate(index: number): RaceGateConfig {
	const angle = gateAngle(index);

	return {
		x: TRACK_CENTER.x + TRACK_CENTER_RADIUS * Math.cos(angle),
		y: TRACK_SURFACE_Y,
		z: TRACK_CENTER.z + TRACK_CENTER_RADIUS * Math.sin(angle),
		radius: 8,
		yaw: yawForAngle(angle)
	};
}

const GRAND_PRIX_GRID: readonly RaceGridSlot[] = [
	{ x: 89.5, y: CHASSIS_SPAWN_Y, z: -4.5, yaw: GRID_YAW },
	{ x: 93.5, y: CHASSIS_SPAWN_Y, z: -4.5, yaw: GRID_YAW },
	{ x: 97.5, y: CHASSIS_SPAWN_Y, z: -4.5, yaw: GRID_YAW },
	{ x: 89.5, y: CHASSIS_SPAWN_Y, z: -11.0, yaw: GRID_YAW },
	{ x: 93.5, y: CHASSIS_SPAWN_Y, z: -11.0, yaw: GRID_YAW },
	{ x: 97.5, y: CHASSIS_SPAWN_Y, z: -11.0, yaw: GRID_YAW }
];

const GRAND_PRIX_ITEMS: readonly RaceItemConfig[] = [
	{ x: 84.68, y: 1.2, z: 30.78 },
	{ x: 61.81, y: 1.2, z: 73.54 },
	{ x: 15.73, y: 1.2, z: 88.63 },
	{ x: -32.73, y: 1.2, z: 90.21 },
	{ x: -68.84, y: 1.2, z: 57.85 },
	{ x: -94.44, y: 1.2, z: 16.67 },
	{ x: -84.47, y: 1.2, z: -30.78 },
	{ x: -61.6, y: 1.2, z: -73.54 },
	{ x: -15.52, y: 1.2, z: -88.63 },
	{ x: 32.94, y: 1.2, z: -90.21 },
	{ x: 69.05, y: 1.2, z: -57.85 },
	{ x: 94.65, y: 1.2, z: -16.67 }
];

/**
 * The Haunted Highway is a 1,030 m loop measured from the `HW_Track_Asphalt` mesh.
 * Gate 0 is `HW_StartFinish_Checker`; the other seven sit every eighth of the
 * lap. They are proximity checkpoints because the S-chicane and the jumps make
 * straight gate lines unreliable.
 *
 * The asphalt ribbon is ~16 m wide, so its edge is ~8 m from a checkpoint
 * centre. A radius of 12 covers the whole road plus a small margin and leaves
 * at least 8 m to the next track segment (the closest non-local asphalt is
 * more than 20 m away), so hugging the inside of a corner still counts.
 */
const ROADMAP_GATES: readonly RaceGateConfig[] = [
	{ x: -79.36, y: 0.02, z: 132.29, radius: 12, yaw: -0.019 },
	{ x: 49.39, y: 0.02, z: 129.91, radius: 12, yaw: 0.06 },
	{ x: 129.62, y: 0.02, z: 49.77, radius: 12, yaw: 1.707 },
	{ x: 122.08, y: 0.02, z: -69.8, radius: 12, yaw: 1.853 },
	{ x: 21.97, y: 0.02, z: -131.29, radius: 12, yaw: 2.727 },
	{ x: -101.05, y: 0.02, z: -109.23, radius: 12, yaw: -2.434 },
	{ x: -100.4, y: 0.02, z: -0.07, radius: 12, yaw: -0.441 },
	{ x: -92.48, y: 0.02, z: 72.49, radius: 12, yaw: -2.988 }
];

/** Two rows of three behind the checker, outside gate 0's 12 m trigger. */
const ROADMAP_GRID: readonly RaceGridSlot[] = [
	{ x: -93.94, y: CHASSIS_SPAWN_Y, z: 127.54, yaw: -0.098 },
	{ x: -94.35, y: CHASSIS_SPAWN_Y, z: 131.72, yaw: -0.098 },
	{ x: -94.76, y: CHASSIS_SPAWN_Y, z: 135.9, yaw: -0.098 },
	{ x: -99.65, y: CHASSIS_SPAWN_Y, z: 126.81, yaw: -0.154 },
	{ x: -100.3, y: CHASSIS_SPAWN_Y, z: 130.96, yaw: -0.154 },
	{ x: -100.94, y: CHASSIS_SPAWN_Y, z: 135.11, yaw: -0.154 }
];

const ROADMAP_ITEMS: readonly RaceItemConfig[] = [
	{ x: -36.43, y: 1.2, z: 132.03 },
	{ x: 49.39, y: 1.2, z: 129.91 },
	{ x: 121.98, y: 1.2, z: 91.09 },
	{ x: 110.06, y: 1.2, z: 12.42 },
	{ x: 122.08, y: 1.2, z: -69.8 },
	{ x: 61.12, y: 1.2, z: -118.1 },
	{ x: -20.57, y: 1.2, z: -134.81 },
	{ x: -101.05, y: 1.2, z: -109.23 },
	{ x: -126.68, y: 1.2, z: -32.73 },
	{ x: -60.79, y: 1.2, z: 15.15 },
	{ x: -92.48, y: 1.2, z: 72.49 },
	{ x: -121.44, y: 1.2, z: 120.25 }
];

function grandPrixOffTrack(x: number, y: number, z: number): boolean {
	const radius = Math.hypot(x - TRACK_CENTER.x, z - TRACK_CENTER.z);

	return y < -5 || radius < OFF_TRACK_INNER || radius > OFF_TRACK_OUTER;
}

/**
 * The Haunted Highway is a stunt loop: the only common way out is falling through the
 * hole in the middle or overshooting a jump, so height is the real test. The
 * outer bound catches reports that escape the map entirely.
 */
function roadmapOffTrack(x: number, y: number, z: number): boolean {
	return y < -12 || Math.abs(x) > 180 || Math.abs(z) > 180;
}

export const GRAND_PRIX_TRACK: RaceTrackConfig = {
	id: GRAND_PRIX_TRACK_ID,
	name: 'Grand Prix',
	totalLaps: 5,
	maxPlayers: 6,
	raceMaxMs: 480_000,
	gateMode: 'line',
	grid: GRAND_PRIX_GRID,
	gates: Array.from({ length: 8 }, (_, index) => grandPrixGate(index)),
	items: GRAND_PRIX_ITEMS,
	fallY: -5,
	isOffTrack: grandPrixOffTrack
};

export const ROADMAP_TRACK: RaceTrackConfig = {
	id: ROADMAP_TRACK_ID,
	name: 'Haunted Highway',
	totalLaps: 3,
	maxPlayers: 6,
	raceMaxMs: 420_000,
	gateMode: 'radius',
	grid: ROADMAP_GRID,
	gates: ROADMAP_GATES,
	items: ROADMAP_ITEMS,
	fallY: -12,
	isOffTrack: roadmapOffTrack
};

export function trackForRoomType(roomType: string): RaceTrackConfig {
	return roomType === ROADMAP_TRACK_ID ? ROADMAP_TRACK : GRAND_PRIX_TRACK;
}
