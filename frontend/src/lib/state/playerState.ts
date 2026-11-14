import type { CarId } from '../services/protocol';

export type SpawnPoint = {
	x: number;
	y: number;
	z: number;
};

/** Outdoor world spawn. */
export const PLAYER_SPAWN: SpawnPoint = {
	x: 0,
	y: 0.4,
	z: 12
};

/** Crypt entrance: center of the nave, in front of the tomb (`minigame-2`). */
export const CRYPT_SPAWN: SpawnPoint = {
	x: 36.7,
	y: -7.98,
	z: 45.0
};

/** Crypt exit: centered in front of `CCC_Mausoleum`'s door. */
export const MAUSOLEUM_EXIT: SpawnPoint = {
	x: 21.48,
	y: 0.4,
	z: 35.5
};

/** Grand Prix exit: next to `TWN_Gantry` (`minigame-3`). */
export const RACE_EXIT: SpawnPoint = {
	x: 83.0,
	y: 0.05,
	z: -3.0
};

/** Fallback grid slot used while the race snapshot has not arrived. */
export const RACE_ENTRY: SpawnPoint = {
	x: 93.5,
	y: 1.1,
	z: -4.5
};

/** Fallback Haunted Highway grid slot used while its race snapshot has not arrived. */
export const ROADMAP_RACE_ENTRY: SpawnPoint = {
	x: -94.35,
	y: 1.1,
	z: 131.72
};

/** Barn Siege entrance/exit: in front of the south barn door (`minigame-5`). */
export const WAVES_EXIT: SpawnPoint = {
	x: -41.6,
	y: 0.4,
	z: 32.6
};

/** Rejilla de aparición delante del granero (debe coincidir con wavesConfig). */
export const WAVES_ENTRY: SpawnPoint = {
	x: -41.6,
	y: 0.4,
	z: 32.6
};

/** Witch House Deathmatch entrance/exit: in front of the area 1 witch house (`minigame-6`). */
export const DM_ENTRY: SpawnPoint = {
	x: -33.01,
	y: 0.4,
	z: -22.9
};

export const DM_EXIT: SpawnPoint = { ...DM_ENTRY };

/** Parkour entrance/exit: area 2, in front of Dracula Castle's entrance stairs (`minigame-7`). */
export const PARKOUR_ENTRY: SpawnPoint = {
	x: 33.0,
	y: 0.4,
	z: -23.9
};

export const PARKOUR_EXIT: SpawnPoint = { ...PARKOUR_ENTRY };

/** Skyfall Royale entrance/exit: open plaza east of the village centre (`minigame-8`). */
export const ROYALE_ENTRY: SpawnPoint = {
	x: 60.0,
	y: 0.4,
	z: 60.0
};

export const ROYALE_EXIT: SpawnPoint = { ...ROYALE_ENTRY };

/**
 * Non-reactive player state that the physics reads on every tick.
 *
 * `spawn` changes when entering or leaving the crypt; `frozen` is enabled by
 * the match during the countdown, death and result.
 */
export const playerRuntime: {
	spawn: SpawnPoint;
	frozen: boolean;
	/** Car driven by the local player, or `null` if on foot. */
	drivingCarId: CarId | null;
	/** True while the local player is piloting in the Grand Prix. */
	racing: boolean;
	/** True while the local player is in the Barn Siege (`minigame-5`). */
	inWaves: boolean;
	/** True while the local player is in the Witch House Deathmatch (`minigame-6`). */
	inDeathmatch: boolean;
	/** True while the local player is on the parkour tower (`minigame-7`). */
	inParkour: boolean;
	/** True while the local player is in the Skyfall Royale (`minigame-8`). */
	inRoyale: boolean;
} = {
	spawn: { ...PLAYER_SPAWN },
	frozen: false,
	drivingCarId: null,
	racing: false,
	inWaves: false,
	inDeathmatch: false,
	inParkour: false,
	inRoyale: false
};

export function setPlayerSpawn(spawn: SpawnPoint): void {
	playerRuntime.spawn = { ...spawn };
}

export type PlayerState = {
	x: number;
	y: number;
	z: number;
	/** Orbit yaw of the third-person camera; used to translate input. */
	cameraYaw: number;
	/** Orbit pitch of the third-person camera (positive looks down). */
	cameraPhi: number;
	/**
	 * Yaw the avatar model is facing, in world space. It follows the movement
	 * direction (WASD), not the camera, and is what remote players must see.
	 */
	facingYaw: number;
	grounded: boolean;
};

/**
 * Player position in the world.
 *
 * `y` is the height of the feet (support surface), not the center of the
 * capsule. The Rapier collider and the sprite add their own offset.
 */
export const playerState: PlayerState = {
	x: PLAYER_SPAWN.x,
	y: PLAYER_SPAWN.y,
	z: PLAYER_SPAWN.z,
	cameraYaw: 0,
	cameraPhi: 0.3,
	facingYaw: 0,
	grounded: true
};
