/**
 * Shared, server-side combat helpers for Witch House Deathmatch.
 *
 * Pure functions only (no room state), so the engine stays readable and the
 * same geometry can be checked by the verification scripts.
 */

import {
	BUILDING_BLOCKS,
	dmClampToArena,
	dmPointInArena,
	GRENADE_EDGE_DAMAGE,
	GRENADE_DAMAGE,
	GRENADE_RADIUS
} from '../../lib/state/dmConfig';

export function round(value: number, decimals = 2): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

export const pointInArena = dmPointInArena;
export const clampToArena = dmClampToArena;

/**
 * True if the XZ segment `a → b` crosses a blocking building volume. Used as
 * a cheap line-of-sight test for hitscan and grenade throws: the map has no
 * navmesh or per-triangle raycast on the server, so the measured AABBs of
 * `wavesConfig.BUILDING_BLOCKS` are the authority.
 */
export function segmentBlocked(
	ax: number,
	az: number,
	bx: number,
	bz: number,
	margin = 0.35
): boolean {
	const dx = bx - ax;
	const dz = bz - az;

	for (const block of BUILDING_BLOCKS) {
		const minX = block.minX - margin;
		const maxX = block.maxX + margin;
		const minZ = block.minZ - margin;
		const maxZ = block.maxZ + margin;

		// Liang–Barsky segment vs AABB.
		let t0 = 0;
		let t1 = 1;

		for (const [origin, delta, min, max] of [
			[ax, dx, minX, maxX],
			[az, dz, minZ, maxZ]
		] as const) {
			if (Math.abs(delta) < 1e-6) {
				if (origin < min || origin > max) {
					t0 = 1;
					t1 = 0;
					break;
				}

				continue;
			}

			const inverse = 1 / delta;
			let near = (min - origin) * inverse;
			let far = (max - origin) * inverse;

			if (near > far) {
				[near, far] = [far, near];
			}

			t0 = Math.max(t0, near);
			t1 = Math.min(t1, far);

			if (t0 > t1) {
				break;
			}
		}

		if (t0 <= t1) {
			return true;
		}
	}

	return false;
}

/**
 * Deterministic-ish pellet directions for the shotgun. `spread` is the maximum
 * angle in radians; each pellet gets its own angle around the aim direction.
 */
export function spreadDirection(
	dir: { x: number; y: number; z: number },
	spread: number,
	angle: number
): { x: number; y: number; z: number } {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	return {
		x: dir.x * cos - dir.z * sin,
		y: dir.y,
		z: dir.x * sin + dir.z * cos
	};
}

/** Linear falloff from `GRENADE_DAMAGE` at the center to the edge value. */
export function grenadeDamageAt(distance: number): number {
	if (distance > GRENADE_RADIUS) {
		return 0;
	}

	const falloff = 1 - distance / GRENADE_RADIUS;
	return Math.round(GRENADE_EDGE_DAMAGE + (GRENADE_DAMAGE - GRENADE_EDGE_DAMAGE) * falloff);
}

/**
 * Distance from a point to a ray in XZ, plus the distance along the ray.
 * Returns `null` when the point is behind the origin.
 */
export function rayPointDistance2D(
	ox: number,
	oz: number,
	dx: number,
	dz: number,
	px: number,
	pz: number
): { along: number; lateral: number } | null {
	const lengthSq = dx * dx + dz * dz;

	if (lengthSq < 1e-6) {
		return null;
	}

	const toX = px - ox;
	const toZ = pz - oz;
	const along = (toX * dx + toZ * dz) / lengthSq;

	if (along < 0) {
		return null;
	}

	const lateral = Math.abs(toX * dz - toZ * dx) / Math.sqrt(lengthSq);

	return { along, lateral };
}
