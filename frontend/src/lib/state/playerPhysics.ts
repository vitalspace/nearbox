import type { Collider } from '@dimforge/rapier3d-compat';

/**
 * Player collider exposed so the camera can exclude it from the collision
 * raycast.
 */
export const playerPhysics: { collider: Collider | null } = {
	collider: null
};
