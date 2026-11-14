/**
 * Helpers de combate puros del battle royale.
 *
 * Reutiliza la geometría de `combat.ts` (segmento vs AABB, distancia lateral a
 * un rayo) pero con las constantes y los oclusores de `royaleConfig.ts`.
 */
import {
	ROYALE_GRENADE_DAMAGE,
	ROYALE_GRENADE_EDGE_DAMAGE,
	ROYALE_GRENADE_RADIUS,
	royaleSegmentBlocked,
	type RoyaleVec3
} from '../../lib/state/royaleConfig';

export { clamp, horizontalDistance, round } from './combat';

/** Dirección rotada alrededor del eje Y (`angle` en radianes). */
export function spreadDirection(
	dir: { x: number; y: number; z: number },
	spread: number,
	angle: number
): { x: number; y: number; z: number } {
	if (spread === 0 || angle === 0) {
		return { ...dir };
	}

	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	return {
		x: dir.x * cos - dir.z * sin,
		y: dir.y,
		z: dir.x * sin + dir.z * cos
	};
}

/** Distancia lateral de un punto a un rayo en XZ; `null` si está detrás. */
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

	return {
		along,
		lateral: Math.abs(toX * dz - toZ * dx) / Math.sqrt(lengthSq)
	};
}

/** Daño de granada con caída lineal del centro al borde. */
export function grenadeDamageAt(distance: number): number {
	if (distance > ROYALE_GRENADE_RADIUS) {
		return 0;
	}

	const falloff = 1 - distance / ROYALE_GRENADE_RADIUS;
	return Math.round(
		ROYALE_GRENADE_EDGE_DAMAGE + (ROYALE_GRENADE_DAMAGE - ROYALE_GRENADE_EDGE_DAMAGE) * falloff
	);
}

/** True si hay LOS libre entre dos puntos (sin muros ni rocas). */
export function hasLineOfSight(from: RoyaleVec3, to: RoyaleVec3): boolean {
	return !royaleSegmentBlocked(from, to);
}

/** Normaliza un vector 3D; devuelve `null` para vectores nulos. */
export function normalize3(
	x: number,
	y: number,
	z: number
): { x: number; y: number; z: number } | null {
	const length = Math.hypot(x, y, z);
	if (length < 1e-6) return null;
	return { x: x / length, y: y / length, z: z / length };
}
