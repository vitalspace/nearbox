import type { SceneId } from '../state/sceneState.svelte';
import type { SurfaceId } from './types';

/**
 * Aproximación barata de superficies y zonas de ambiente.
 *
 * No hay raycasts ni consultas al mapa: son círculos sobre el plano XZ, igual
 * que otras tablas dependientes del mapa (`wavesConfig.ts`). Si el mapa cambia,
 * basta con mover estos centros y radios.
 */

export type AmbienceZone =
	'centro' | 'bosque' | 'castillo' | 'calabazar' | 'cementerio' | 'crypt' | 'race' | 'waves';

export type AmbienceEvent = 'owl' | 'crickets' | 'creak' | 'drip' | 'thunder';

type CircleZone = {
	id: Exclude<AmbienceZone, 'centro' | 'crypt' | 'race' | 'waves'> | 'centro';
	x: number;
	z: number;
	radius: number;
};

/** Centros de las cinco zonas exteriores (el resto son escenas explícitas). */
export const AMBIENCE_CIRCLES: readonly CircleZone[] = [
	{ id: 'centro', x: 0, z: 0, radius: 24 },
	{ id: 'bosque', x: -33, z: -33, radius: 30 },
	{ id: 'castillo', x: 33, z: -33, radius: 30 },
	{ id: 'calabazar', x: -33, z: 33, radius: 30 },
	{ id: 'cementerio', x: 33, z: 33, radius: 30 }
];

export const AMBIENCE_EVENTS: Record<AmbienceZone, readonly AmbienceEvent[]> = {
	centro: ['crickets', 'owl'],
	bosque: ['owl', 'creak'],
	castillo: ['thunder', 'drip'],
	calabazar: ['creak', 'crickets'],
	cementerio: ['owl', 'creak'],
	crypt: ['drip', 'creak'],
	race: [],
	waves: ['creak', 'thunder']
};

/** Punto del mapa usado para decidir la zona exterior. */
export type PlanarPoint = {
	x: number;
	z: number;
};

export type AmbienceContext = {
	scene: SceneId;
	x: number;
	z: number;
};

function distanceXZ(a: PlanarPoint, b: PlanarPoint): number {
	return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Zona exterior más cercana; `null` si el jugador está fuera de todas. */
export function nearestOutdoorZone(x: number, z: number): AmbienceZone | null {
	let nearest: CircleZone | null = null;
	let nearestDistance = Infinity;

	for (const zone of AMBIENCE_CIRCLES) {
		const distance = distanceXZ({ x, z }, { x: zone.x, z: zone.z });

		if (distance <= zone.radius && distance < nearestDistance) {
			nearest = zone;
			nearestDistance = distance;
		}
	}

	return nearest?.id ?? null;
}

/**
 * Zona activa con prioridad: escena explícita (`crypt`, `race`, `waves`) >
 * zona exterior más cercana > `centro`.
 */
export function activeAmbience(context: AmbienceContext): AmbienceZone {
	if (context.scene === 'crypt') {
		return 'crypt';
	}

	if (context.scene === 'roadmap') {
		return 'race';
	}

	if (context.scene === 'map') {
		return nearestOutdoorZone(context.x, context.z) ?? 'centro';
	}

	return 'centro';
}

/** Variante que también contempla las escenas de minijuego sin mapa propio. */
export function activeAmbienceForScene(
	scene: SceneId,
	x: number,
	z: number,
	flags: { inWaves: boolean; inRace: boolean }
): AmbienceZone {
	if (flags.inWaves) {
		return 'waves';
	}

	if (flags.inRace) {
		return 'race';
	}

	return activeAmbience({ scene, x, z });
}

/**
 * Superficie de paso aproximada.
 *
 * - cripta y asfalto → piedra
 * - calabazar → tierra dentro del claro, hierba fuera
 * - centro → piedra en el núcleo, tierra en el anillo
 * - castillo / cementerio → piedra
 * - resto → hierba
 */
export function surfaceAt(scene: SceneId, x: number, z: number): SurfaceId {
	if (scene === 'crypt' || scene === 'roadmap') {
		return 'stone';
	}

	if (scene !== 'map') {
		return 'stone';
	}

	const centro = Math.hypot(x, z);

	if (centro <= 10) {
		return 'stone';
	}

	if (centro <= 22) {
		return 'dirt';
	}

	const calabazar = Math.hypot(x + 33, z - 33);

	if (calabazar <= 28) {
		return 'dirt';
	}

	const castillo = Math.hypot(x - 33, z + 33);

	if (castillo <= 20) {
		return 'stone';
	}

	const cementerio = Math.hypot(x - 33, z - 33);

	if (cementerio <= 24) {
		return 'stone';
	}

	return 'grass';
}

/** Igual que `surfaceAt`, pero contempla la arena de Barn Siege. */
export function surfaceForAmbienceZone(zone: AmbienceZone, x: number, z: number): SurfaceId {
	if (zone === 'waves') {
		return Math.hypot(x + 31.43, z - 31.43) <= 18 ? 'dirt' : 'grass';
	}

	if (zone === 'crypt' || zone === 'race') {
		return 'stone';
	}

	return surfaceAt('map', x, z);
}

/** Distancia usada por la atenuación de ambiente y eventos. */
export function planarDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

/**
 * Punto aleatorio alrededor del jugador para eventos ambientales.
 * Devuelve una posición con altura cercana a la del jugador.
 */
export function ambientEventPosition(
	x: number,
	y: number,
	z: number,
	random: () => number,
	radiusMin = 8,
	radiusMax = 20
): { x: number; y: number; z: number } {
	const angle = random() * Math.PI * 2;
	const radius = radiusMin + random() * (radiusMax - radiusMin);

	return {
		x: x + Math.cos(angle) * radius,
		y: y + 0.5 + random() * 1.5,
		z: z + Math.sin(angle) * radius
	};
}
