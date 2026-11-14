import { Ray } from '@dimforge/rapier3d-compat';
import type { World } from '@dimforge/rapier3d-compat';

export type NpcGroundSampler = {
	sample(x: number, z: number, fallbackY: number): number;
};

/**
 * Probe window around the last known height.
 *
 * The ray is deliberately short and anchored to the previous sample instead of
 * being cast from high above the map: a long ray can hit a fence, a trunk or
 * another player's capsule and lift the NPC, and once it is high enough the
 * walkable floor falls outside the range so the bogus height would stick
 * forever. Walking routes are almost flat, so a 0.45 m step up and a 1.2 m drop
 * cover every slope while ignoring props the agent walks past.
 */
const ORIGIN_OFFSET = 0.6;
const MAX_STEP_UP = 0.25;
const MAX_STEP_DOWN = 1.2;
const MAX_TOI = ORIGIN_OFFSET + MAX_STEP_DOWN;

/**
 * Samples the walkable surface below an NPC with a Rapier raycast.
 *
 * `solid = false` makes Rapier ignore any collider that contains the ray origin
 * (a wall the NPC is brushing, the player capsule, a trunk). Those used to
 * return a hit at distance zero and teleport the agent 1.5 m into the air.
 * Hits above `fallbackY + MAX_STEP_UP` are rejected as scenery the NPC must not
 * climb, so it keeps walking on the ground instead of floating over it.
 */
export function createNpcGroundSampler(world: World): NpcGroundSampler {
	const ray = new Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

	return {
		sample(x, z, fallbackY): number {
			const originY = fallbackY + ORIGIN_OFFSET;

			ray.origin.x = x;
			ray.origin.y = originY;
			ray.origin.z = z;
			ray.dir.x = 0;
			ray.dir.y = -1;
			ray.dir.z = 0;

			const hit = world.castRay(ray, MAX_TOI, false);

			if (!hit) {
				return fallbackY;
			}

			const height = originY - hit.timeOfImpact;

			if (!Number.isFinite(height)) {
				return fallbackY;
			}

			// A surface higher than a step is scenery (bench, rock, wall top),
			// not the floor the agent is walking on.
			if (height > fallbackY + MAX_STEP_UP) {
				return fallbackY;
			}

			if (height < fallbackY - MAX_STEP_DOWN) {
				return fallbackY;
			}

			return height;
		}
	};
}

/** Soft height correction so small steps do not make the NPC pop. */
export function approachHeight(current: number, target: number, delta: number): number {
	if (!Number.isFinite(current)) {
		return target;
	}

	const factor = 1 - Math.exp(-14 * Math.min(Math.max(delta, 0), 0.1));

	return current + (target - current) * factor;
}
