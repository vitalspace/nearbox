import { Box3, Group, Mesh, Vector3, type AnimationClip } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { asset } from '../../assets/path';
import type { Mg5WeaponId } from '../../state/wavesConfig';

/**
 * Modelos 3D compartidos de armas y consumibles.
 *
 * Los GLB viven en `static/weapons/` y `static/props/`, ya comprimidos con
 * Draco por `assets:compress`. Se cachean una sola vez y se clonan por jugador
 * o por pickup. Si un modelo tarda o falla, cada componente conserva su
 * primitiva de respaldo.
 */

export type CombatModelId = Mg5WeaponId | 'grenade' | 'ammo' | 'medkit';

/** Rutas relativas a `static/` de las cuatro armas básicas. */
export const WEAPON_MODEL_BY_ID: Record<Mg5WeaponId, string> = {
	pistol: 'weapons/pistol.glb',
	shotgun: 'weapons/shotgun.glb',
	smg: 'weapons/mp5.glb',
	rifle: 'weapons/sniper_rifle.glb'
};

const MODEL_PATH: Record<CombatModelId, string> = {
	...WEAPON_MODEL_BY_ID,
	grenade: 'props/grenade.glb',
	ammo: 'props/ammo_kit.glb',
	medkit: 'props/med_kit.glb'
};

/** Escala en mano para que el cañón quede entre ~0.35 m y ~1 m. */
export const WEAPON_MODEL_SCALE: Record<Mg5WeaponId, number> = {
	pistol: 1.2,
	shotgun: 0.88,
	smg: 0.8,
	rifle: 0.75
};

/**
 * Variantes cosméticas de las armas básicas. Las rutas viven en `static/` y se
 * cargan solo cuando el jugador tiene el NFT equipado.
 */
export const WEAPON_VARIANT_MODEL: Record<string, string> = {
	'pistol-gold': 'weapons/pistol_gold.glb',
	'shotgun-gold': 'weapons/shotgun_gold.glb',
	'mp5-gold': 'weapons/mp5_gold.glb',
	'sniper-gold': 'weapons/sniper_rifle_gold.glb',
	'bazooka-gold': 'weapons/bazooka_gold.glb',
	'coin-pistol': 'weapons/coin_pistol.glb'
};

const PICKUP_SCALE: Record<CombatModelId, number> = {
	pistol: 1.35,
	shotgun: 1.05,
	smg: 1.05,
	rifle: 0.9,
	grenade: 1.45,
	ammo: 1.4,
	medkit: 1.4
};

let loader: GLTFLoader | null = null;
const cache = new Map<CombatModelId, Group>();
const pending = new Map<CombatModelId, Promise<Group | null>>();
const variantCache = new Map<string, Group>();
const variantPending = new Map<string, Promise<Group | null>>();
/** Clips horneados por modelo (`coin-pistol` trae un `Fire`). */
const combatClips = new Map<CombatModelId, AnimationClip[]>();
const variantClips = new Map<string, AnimationClip[]>();

function getLoader(): GLTFLoader {
	if (loader) {
		return loader;
	}

	const draco = new DRACOLoader();
	draco.setDecoderPath(asset('draco/'));

	loader = new GLTFLoader();
	loader.setDRACOLoader(draco);

	return loader;
}

/** Modelo ya cargado, listo para clonar de forma síncrona. */
export function getCachedCombatModel(id: CombatModelId): Group | null {
	return cache.get(id) ?? null;
}

/** Carga (o reutiliza) el GLB y devuelve la escena original cacheada. */
export function loadCombatModel(id: CombatModelId): Promise<Group | null> {
	const cached = cache.get(id);

	if (cached) {
		return Promise.resolve(cached);
	}

	const inFlight = pending.get(id);

	if (inFlight) {
		return inFlight;
	}

	const promise = new Promise<Group | null>((resolve) => {
		getLoader().load(
			asset(MODEL_PATH[id]),
			(gltf) => {
				gltf.scene.updateMatrixWorld(true);
				cache.set(id, gltf.scene);
				combatClips.set(id, gltf.animations);
				pending.delete(id);
				resolve(gltf.scene);
			},
			undefined,
			(error) => {
				console.warn(`[weapons] no se pudo cargar ${MODEL_PATH[id]}`, error);
				pending.delete(id);
				resolve(null);
			}
		);
	});

	pending.set(id, promise);

	return promise;
}

/** Precarga las cuatro armas y los tres consumibles al entrar a una arena. */
export function preloadCombatModels(): void {
	for (const id of Object.keys(MODEL_PATH) as CombatModelId[]) {
		void loadCombatModel(id);
	}
}

function enableShadows(model: Group): void {
	model.traverse((child) => {
		if ((child as Mesh).isMesh) {
			child.castShadow = true;
			child.receiveShadow = false;
		}
	});
}

/** Variante ya cargada, lista para clonar de forma síncrona. */
export function getCachedWeaponVariant(variantId: string): Group | null {
	return variantCache.get(variantId) ?? null;
}

/** Carga (o reutiliza) el GLB de una variante cosmética. */
export function loadWeaponVariant(variantId: string): Promise<Group | null> {
	const cached = variantCache.get(variantId);

	if (cached) {
		return Promise.resolve(cached);
	}

	const path = WEAPON_VARIANT_MODEL[variantId];

	if (!path) {
		return Promise.resolve(null);
	}

	const inFlight = variantPending.get(variantId);

	if (inFlight) {
		return inFlight;
	}

	const promise = new Promise<Group | null>((resolve) => {
		getLoader().load(
			asset(path),
			(gltf) => {
				gltf.scene.updateMatrixWorld(true);
				variantCache.set(variantId, gltf.scene);
				variantClips.set(variantId, gltf.animations);
				variantPending.delete(variantId);
				resolve(gltf.scene);
			},
			undefined,
			(error) => {
				console.warn(`[weapons] no se pudo cargar ${path}`, error);
				variantPending.delete(variantId);
				resolve(null);
			}
		);
	});

	variantPending.set(variantId, promise);

	return promise;
}

/** Clips horneados del modelo (p. ej. `Fire` en el coin-pistol). */
export function getWeaponClips(
	id: Mg5WeaponId,
	variantId: string | null
): readonly AnimationClip[] {
	return variantId ? (variantClips.get(variantId) ?? []) : (combatClips.get(id) ?? []);
}

/** Clon para el arma en mano; escala y sombras ya aplicadas. */
export function cloneHeldWeaponModel(id: Mg5WeaponId, variantId?: string | null): Group | null {
	const source = variantId ? variantCache.get(variantId) : cache.get(id);

	if (!source) {
		return null;
	}

	const model = source.clone(true);
	const scale = WEAPON_MODEL_SCALE[id];
	model.scale.setScalar(scale);
	enableShadows(model);
	model.updateMatrixWorld(true);

	return model;
}

/** Clon centrado para un pickup flotante. */
export function clonePickupModel(id: CombatModelId): Group | null {
	const source = cache.get(id);

	if (!source) {
		return null;
	}

	const model = source.clone(true);
	model.scale.setScalar(PICKUP_SCALE[id]);
	enableShadows(model);
	model.updateMatrixWorld(true);

	const box = new Box3().setFromObject(model);
	const center = new Vector3();
	box.getCenter(center);

	model.position.set(-center.x, -center.y, -center.z);
	model.updateMatrixWorld(true);

	return model;
}
