import type { RaceCarStateReport, RaceModel } from '../services/protocol';
import { CHASSIS_CENTER_Y } from './carConfig';
import { carInput } from './carInput';
import { playerState } from './playerState';

/**
 * Local-only car used by the Haunted Highway track.
 *
 * The Haunted Highway has no authoritative race room: this store owns the spawn
 * snapshot and re-places the Rapier vehicle when it falls or the player asks
 * for a reset. Input is the shared `carInput` object, so keyboard and touch
 * controls work the same way as in the free cars.
 */

export type RoadmapVehicleSnapshot = {
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number; w: number };
	velocity: { x: number; y: number; z: number };
	speed: number;
	steering: number;
};

/** Default model when the player has not raced yet in this session. */
export const ROADMAP_CAR_MODEL: RaceModel = 'coche_calabaza';

/**
 * Start/finish center measured on `roadmap.glb`
 * (`HW_StartFinish_Checker`). The track runs along +X there, so yaw 0 points
 * the car nose down the straight toward the first jump.
 */
export const ROADMAP_CAR_SPAWN = {
	x: -79.36,
	y: CHASSIS_CENTER_Y + 0.1,
	z: 132.29,
	yaw: 0
} as const;

/** Y at which the car is considered fallen out of the track. */
export const ROADMAP_CAR_FALL_Y = -20;

function yawQuaternion(yaw: number): { x: number; y: number; z: number; w: number } {
	const half = yaw / 2;

	return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

function spawnSnapshot(): RoadmapVehicleSnapshot {
	return {
		position: {
			x: ROADMAP_CAR_SPAWN.x,
			y: ROADMAP_CAR_SPAWN.y,
			z: ROADMAP_CAR_SPAWN.z
		},
		rotation: yawQuaternion(ROADMAP_CAR_SPAWN.yaw),
		velocity: { x: 0, y: 0, z: 0 },
		speed: 0,
		steering: 0
	};
}

class RoadmapCarStore {
	/** Changes force `VehiclePhysics` to place the body again. */
	resetToken = $state(0);
	snapshot = $state<RoadmapVehicleSnapshot>(spawnSnapshot());
	/** Speed from the last physics report, used by the HUD. */
	speed = $state(0);

	/** Called by the vehicle every 100 ms; also detects void falls. */
	report(report: RaceCarStateReport): void {
		this.speed = report.speed;

		if (report.y < ROADMAP_CAR_FALL_Y) {
			this.requestReset();
		}
	}

	/** Returns the car to `HW_StartFinish_Checker` and clears held input. */
	requestReset(): void {
		carInput.reset();
		this.speed = 0;
		this.snapshot = spawnSnapshot();
		this.resetToken += 1;

		// Keep the third-person camera on the car during the snap frame.
		playerState.x = ROADMAP_CAR_SPAWN.x;
		playerState.y = ROADMAP_CAR_SPAWN.y - CHASSIS_CENTER_Y;
		playerState.z = ROADMAP_CAR_SPAWN.z;
		playerState.grounded = true;
	}
}

export const roadmapCar = new RoadmapCarStore();
