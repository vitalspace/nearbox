/**
 * Witch House Deathmatch (minigame-6) — constantes del modo.
 *
 * ⚠️ DEPENDE DEL MAPA. La arena y las armas se reutilizan de `wavesConfig.ts`
 * (`barnsiege.glb`, `SPEC-023`). Si se sustituye el GLB hay que re-medir los
 * spawns y los pickups de este archivo y ejecutar `bun run dm:check`.
 *
 * Este módulo es puro (sin `$state` ni imports de Svelte) para que lo usen
 * tanto el servidor autoritativo (`server/engines/deathmatch.ts`) como el
 * cliente (`minigame6.svelte.ts`, HUD y componentes).
 */

import {
	AMMO_PACK_AMOUNT,
	ARENA_FLOOR_Y,
	ARENA_POLYGON,
	BUILDING_BLOCKS,
	GRENADE_DAMAGE,
	GRENADE_EDGE_DAMAGE,
	GRENADE_FUSE_MS,
	GRENADE_RADIUS,
	GRENADE_VERTICAL_REACH,
	MAX_GRENADES,
	MEDKIT_AMOUNT,
	PLAYER_MAX_HEALTH,
	PLAYER_SPEED_CAP,
	STARTER_AMMO,
	STARTER_GRENADES,
	STARTER_WEAPON,
	WEAPON_BY_ID,
	WEAPON_BY_SLOT,
	WEAPON_SLOT_BY_ID,
	INVENTORY_SLOT_COUNT,
	type Mg5WeaponId
} from './wavesConfig';

export {
	AMMO_PACK_AMOUNT,
	ARENA_FLOOR_Y,
	ARENA_POLYGON,
	BUILDING_BLOCKS,
	GRENADE_DAMAGE,
	GRENADE_EDGE_DAMAGE,
	GRENADE_FUSE_MS,
	GRENADE_RADIUS,
	GRENADE_VERTICAL_REACH,
	MAX_GRENADES,
	MEDKIT_AMOUNT,
	PLAYER_MAX_HEALTH,
	PLAYER_SPEED_CAP,
	STARTER_AMMO,
	STARTER_GRENADES,
	STARTER_WEAPON,
	WEAPON_BY_ID,
	WEAPON_BY_SLOT,
	WEAPON_SLOT_BY_ID,
	INVENTORY_SLOT_COUNT
};
export type { Mg5WeaponId };

/** Armas que pueden aparecer en un evento de daño/kill (incluye granada). */
export type DmWeaponId = Mg5WeaponId | 'grenade';

// ---------------------------------------------------------------------------
// Identidad
// ---------------------------------------------------------------------------

export const DM_LOBBY_ID = 'minigame-6';
export const DM_NAME = 'Witch House Deathmatch';
export const DM_CHECKPOINT_NAME = DM_NAME;
export const DM_CHECKPOINT = { x: -33.01, y: 0.4, z: -22.9 } as const;
export const DM_CHECKPOINT_RADIUS = 2;
export const DM_CHECKPOINT_COLOR = '#a855f7';

// ---------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------

export type DmTeam = 'coven' | 'hunters';

export const DM_TEAMS: readonly DmTeam[] = ['coven', 'hunters'];

export const DM_TEAM_META: Readonly<Record<DmTeam, { name: string; color: string }>> = {
	coven: { name: 'Coven', color: '#a855f7' },
	hunters: { name: 'Hunters', color: '#22d3ee' }
};

export function enemyTeam(team: DmTeam): DmTeam {
	return team === 'coven' ? 'hunters' : 'coven';
}

type DmPoint = { x: number; y: number; z: number };

/** Anclas opuestas de aparición, separadas ≈ 91.3 m. */
export const DM_TEAM_ANCHORS: Readonly<Record<DmTeam, DmPoint>> = {
	coven: { x: -40, y: 0.55, z: -24 },
	hunters: { x: 40, y: 0.55, z: 20 }
};

const SPAWN_DX = [-1.8, 0, 1.8] as const;
/**
 * Filas delante/detrás del ancla. La fila delantera se queda en −0.5 (en vez
 * de −2) para no tocar `BUILDING_BLOCKS[9]` en Coven (maxZ = −26) ni
 * `BUILDING_BLOCKS[18]` en Hunters (maxZ = 18.6). El ancla sigue siendo el
 * centro de la zona; `dm:check` valida que ningún slot entra en un edificio.
 */
const SPAWN_DZ = [-0.5, 2] as const;

function buildSpawns(anchor: DmPoint): readonly DmPoint[] {
	const slots: DmPoint[] = [];

	for (const dz of SPAWN_DZ) {
		for (const dx of SPAWN_DX) {
			slots.push({ x: anchor.x + dx, y: anchor.y, z: anchor.z + dz });
		}
	}

	return slots;
}

/** 6 slots por equipo (rejilla 3 × 2). */
export const DM_TEAM_SPAWNS: Readonly<Record<DmTeam, readonly DmPoint[]>> = {
	coven: buildSpawns(DM_TEAM_ANCHORS.coven),
	hunters: buildSpawns(DM_TEAM_ANCHORS.hunters)
};

// ---------------------------------------------------------------------------
// Reglas y tiempos
// ---------------------------------------------------------------------------

export const DM_MAX_PLAYERS = 12;
export const DM_TEAM_SIZE = 6;
export const DM_MIN_PLAYERS = 2;
export const DM_COUNTDOWN_MS = 30_000;
export const DM_MATCH_MS = 360_000;
export const DM_RESULT_MS = 15_000;
export const DM_RESPAWN_MS = 3_000;
export const DM_SPAWN_PROTECTION_MS = 5_000;
/**
 * Ventana tras reaparecer en la que el servidor ignora los reportes de
 * posición. Evita que los paquetes en vuelo desde el punto de muerte (o el
 * cuerpo aún sin teletransportar) sobrescriban el spawn asignado.
 */
export const DM_SPAWN_POSITION_LOCK_MS = 600;
export const DM_PICKUP_RADIUS = 1.6;
export const DM_SHOT_ORIGIN_TOLERANCE = 2;
export const DM_KILL_CREDIT_MS = 5_000;
export const DM_GRENADE_COOLDOWN_MS = 500;
export const DM_POSITION_INTERVAL_MS = 100;
export const DM_STATE_INTERVAL_MS = 1_000;
export const DM_JOIN_GRACE_MS = 500;

export type DmPhase = 'idle' | 'countdown' | 'playing' | 'results';
export type DmWinner = DmTeam | 'draw';

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------

export type DmPickupKind = 'shotgun' | 'smg' | 'rifle' | 'grenade' | 'ammo' | 'medkit';

export type DmPickupDefinition = {
	id: string;
	kind: DmPickupKind;
	x: number;
	y: number;
	z: number;
	/** Tiempo que tarda en reaparecer tras recogerse. */
	respawnMs: number;
};

/**
 * 13 pickups fijos repartidos por la aldea. Todos a `y = 0.85`, fuera de
 * `BUILDING_BLOCKS` y dentro de `ARENA_POLYGON` (lo valida `dm:check`).
 */
export const DM_PICKUPS: readonly DmPickupDefinition[] = [
	{ id: 'shotgun-fields', kind: 'shotgun', x: -29, y: 0.85, z: 17, respawnMs: 20_000 },
	{ id: 'shotgun-farmhouse', kind: 'shotgun', x: 29, y: 0.85, z: 17, respawnMs: 20_000 },
	{ id: 'smg-silo', kind: 'smg', x: -29, y: 0.85, z: -16, respawnMs: 18_000 },
	{ id: 'smg-pumpkin', kind: 'smg', x: 29, y: 0.85, z: -16, respawnMs: 18_000 },
	{ id: 'rifle-barn', kind: 'rifle', x: -16, y: 0.85, z: -31, respawnMs: 30_000 },
	{ id: 'rifle-gate', kind: 'rifle', x: 0, y: 0.85, z: 32, respawnMs: 30_000 },
	{ id: 'grenades-plaza', kind: 'grenade', x: 0, y: 0.85, z: 0, respawnMs: 15_000 },
	{ id: 'grenades-west', kind: 'grenade', x: -38, y: 0.85, z: -2, respawnMs: 15_000 },
	{ id: 'grenades-east', kind: 'grenade', x: 38, y: 0.85, z: -2, respawnMs: 15_000 },
	{ id: 'ammo-south-west', kind: 'ammo', x: -46, y: 0.85, z: -30, respawnMs: 12_000 },
	{ id: 'ammo-north-east', kind: 'ammo', x: 46, y: 0.85, z: 30, respawnMs: 12_000 },
	{ id: 'medkit-north-west', kind: 'medkit', x: -46, y: 0.85, z: 30, respawnMs: 25_000 },
	{ id: 'medkit-south-east', kind: 'medkit', x: 46, y: 0.85, z: -30, respawnMs: 25_000 }
];

export function isDmPickupKind(value: unknown): value is DmPickupKind {
	return (
		value === 'shotgun' ||
		value === 'smg' ||
		value === 'rifle' ||
		value === 'grenade' ||
		value === 'ammo' ||
		value === 'medkit'
	);
}

/** Arma que entrega un pickup, o `null` si no es un arma. */
export function dmPickupWeapon(kind: DmPickupKind): Mg5WeaponId | null {
	return kind === 'shotgun' || kind === 'smg' || kind === 'rifle' ? kind : null;
}

// ---------------------------------------------------------------------------
// Loadout inicial / respawn
// ---------------------------------------------------------------------------

/** Al morir se pierde el inventario: pistola, 60 de reserva y 1 granada. */
export const DM_STARTER_WEAPON: Mg5WeaponId = STARTER_WEAPON;
export const DM_STARTER_AMMO = STARTER_AMMO;
export const DM_STARTER_GRENADES = STARTER_GRENADES;

/** Munición universal extra al recoger un arma que ya se tiene. */
export const DM_DUPLICATE_WEAPON_AMMO = 30;

export type DmInventoryEntry = {
	weapon: Mg5WeaponId;
	slot: number;
	magAmmo: number;
};

// ---------------------------------------------------------------------------
// Helpers geométricos compartidos (puros)
// ---------------------------------------------------------------------------

export function dmDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

/** Point-in-polygon (ray casting) en XZ sobre la arena de Barn Siege. */
export function dmPointInArena(x: number, z: number): boolean {
	let inside = false;

	for (let i = 0, j = ARENA_POLYGON.length - 1; i < ARENA_POLYGON.length; j = i++) {
		const [xi, zi] = ARENA_POLYGON[i];
		const [xj, zj] = ARENA_POLYGON[j];
		const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;

		if (intersects) {
			inside = !inside;
		}
	}

	return inside;
}

export function dmInsideBlock(x: number, z: number): boolean {
	for (const block of BUILDING_BLOCKS) {
		if (x >= block.minX && x <= block.maxX && z >= block.minZ && z <= block.maxZ) {
			return true;
		}
	}

	return false;
}

/**
 * Recorta un punto al polígono de la arena acercándolo al centroide. El
 * servidor lo usa con las posiciones reportadas y con el punto de caída de
 * las granadas.
 */
export function dmClampToArena(x: number, z: number): { x: number; z: number } {
	if (dmPointInArena(x, z)) {
		return { x, z };
	}

	let cx = 0;
	let cz = 0;

	for (const [px, pz] of ARENA_POLYGON) {
		cx += px;
		cz += pz;
	}

	cx /= ARENA_POLYGON.length;
	cz /= ARENA_POLYGON.length;

	let low = 0;
	let high = 1;

	for (let i = 0; i < 16; i += 1) {
		const mid = (low + high) / 2;
		const mx = cx + (x - cx) * mid;
		const mz = cz + (z - cz) * mid;

		if (dmPointInArena(mx, mz)) {
			low = mid;
		} else {
			high = mid;
		}
	}

	return { x: cx + (x - cx) * low, z: cz + (z - cz) * low };
}

/** Un slot es "seguro" si conserva al menos este % de la distancia máxima. */
const DM_SPAWN_SAFE_RATIO = 0.85;

/**
 * Elige al azar entre los slots del equipo que estén suficientemente lejos
 * del enemigo vivo más cercano. Así el respawn no es predecible (anti
 * spawn-kill) pero nunca cae en un slot pegado a un enemigo. Si no hay
 * enemigos vivos, usa el slot `index`.
 */
export function dmPickSpawnSlot(
	team: DmTeam,
	enemies: readonly { x: number; z: number }[],
	index = 0
): number {
	const slots = DM_TEAM_SPAWNS[team];

	if (enemies.length === 0) {
		return index % slots.length;
	}

	const nearestDistances = slots.map((slot) => {
		let nearest = Number.POSITIVE_INFINITY;

		for (const enemy of enemies) {
			nearest = Math.min(nearest, dmDistance(slot.x, slot.z, enemy.x, enemy.z));
		}

		return nearest;
	});

	const safestDistance = Math.max(...nearestDistances);
	const threshold = safestDistance * DM_SPAWN_SAFE_RATIO;
	const candidates: number[] = [];

	for (let i = 0; i < nearestDistances.length; i += 1) {
		if (nearestDistances[i] >= threshold) {
			candidates.push(i);
		}
	}

	if (candidates.length === 0) {
		return nearestDistances.indexOf(safestDistance);
	}

	return candidates[Math.floor(Math.random() * candidates.length)];
}
