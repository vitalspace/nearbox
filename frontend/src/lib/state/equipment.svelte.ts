import { browser } from '$app/env';
import { catalogItemById, type MintableCatalogItem } from '../nft/catalog.ts';
import type { Mg5WeaponId } from './wavesConfig.ts';
import { nftOwnership } from './nftOwnership.svelte.ts';

/**
 * Loadout local de NFTs equipables (armas, assets y vehículos).
 *
 * Solo se puede equipar un ítem cuyo NFT esté en `nftOwnership`; si el jugador
 * lo vende, el loadout deja de aplicarlo automáticamente. Las skins se equipan
 * con `playerProfile`/`cosmetics` para no duplicar su estado.
 */

export type EquipSlot = 'weapon' | 'asset' | 'vehicle';

type PersistedLoadout = {
	version: 1;
	accountId: string;
	weapon: string | null;
	asset: string | null;
	vehicle: string | null;
};

const STORAGE_KEY = 'rw:nft-loadout:v1';

/** Variantes cosméticas de arma y el arma base a la que reemplazan. */
export const WEAPON_VARIANT_BASE: Readonly<Record<string, Mg5WeaponId>> = {
	'pistol-gold': 'pistol',
	'shotgun-gold': 'shotgun',
	'mp5-gold': 'smg',
	'sniper-gold': 'rifle',
	'bazooka-gold': 'rifle',
	'coin-pistol': 'pistol'
};

function readLoadout(): PersistedLoadout | null {
	if (!browser) return null;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;

		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) return null;

		const record = value as Record<string, unknown>;
		if (record.version !== 1 || typeof record.accountId !== 'string') return null;

		const pick = (key: 'weapon' | 'asset' | 'vehicle'): string | null =>
			typeof record[key] === 'string' ? (record[key] as string) : null;

		return {
			version: 1,
			accountId: record.accountId,
			weapon: pick('weapon'),
			asset: pick('asset'),
			vehicle: pick('vehicle')
		};
	} catch {
		return null;
	}
}

function writeLoadout(loadout: PersistedLoadout): void {
	if (!browser || !loadout.accountId) return;

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(loadout));
	} catch {
		// Sin almacenamiento disponible: el equipado dura la sesión actual.
	}
}

export function equipSlotFor(item: MintableCatalogItem): EquipSlot | null {
	switch (item.kind) {
		case 'weapons':
			return 'weapon';
		case 'assets':
			return 'asset';
		case 'vehicles':
			return 'vehicle';
		default:
			return null;
	}
}

class EquipmentStore {
	weapon = $state<string | null>(null);
	asset = $state<string | null>(null);
	vehicle = $state<string | null>(null);

	private accountId = '';

	init(): void {
		const cached = readLoadout();
		if (!cached) return;

		this.accountId = cached.accountId;
		this.apply(cached);
	}

	setAccount(accountId: string): void {
		if (this.accountId === accountId) return;

		this.accountId = accountId;
		const cached = readLoadout();

		if (cached?.accountId === accountId) {
			this.apply(cached);
		} else {
			this.weapon = null;
			this.asset = null;
			this.vehicle = null;
		}
	}

	canEquip(item: MintableCatalogItem): boolean {
		return equipSlotFor(item) !== null && nftOwnership.owns(item.id);
	}

	isEquipped(item: MintableCatalogItem): boolean {
		const slot = equipSlotFor(item);
		if (!slot) return false;

		return this.slotValue(slot) === item.id;
	}

	/** Equipa el NFT si se posee. Devuelve si quedó equipado. */
	equip(item: MintableCatalogItem): boolean {
		const slot = equipSlotFor(item);
		if (!slot || !nftOwnership.owns(item.id)) return false;

		if (this.slotValue(slot) === item.id) return true;

		this.setSlot(slot, item.id);
		this.persist();
		return true;
	}

	unequip(slot: EquipSlot): void {
		if (this.slotValue(slot) === null) return;

		this.setSlot(slot, null);
		this.persist();
	}

	/** Variante cosmética de arma que reemplaza a `base` en las arenas. */
	weaponVariantFor(base: Mg5WeaponId): string | null {
		if (this.weapon && WEAPON_VARIANT_BASE[this.weapon] === base) {
			return this.weapon;
		}

		if (this.asset === 'coin-pistol' && WEAPON_VARIANT_BASE['coin-pistol'] === base) {
			return 'coin-pistol';
		}

		return null;
	}

	get hasCrown(): boolean {
		return this.asset === 'crown';
	}

	/** Modelo del vehículo equipado (`props/...glb`), o `null`. */
	get equippedRide(): string | null {
		if (!this.vehicle) return null;

		return catalogItemById(this.vehicle)?.model ?? null;
	}

	private slotValue(slot: EquipSlot): string | null {
		return slot === 'weapon' ? this.weapon : slot === 'asset' ? this.asset : this.vehicle;
	}

	/** Lectura del slot para consumidores externos (poda de inventario). */
	slotValueFor(slot: EquipSlot): string | null {
		return this.slotValue(slot);
	}

	private setSlot(slot: EquipSlot, id: string | null): void {
		if (slot === 'weapon') this.weapon = id;
		else if (slot === 'asset') this.asset = id;
		else this.vehicle = id;
	}

	private apply(loadout: PersistedLoadout): void {
		this.weapon = loadout.weapon;
		this.asset = loadout.asset;
		this.vehicle = loadout.vehicle;
	}

	private persist(): void {
		writeLoadout({
			version: 1,
			accountId: this.accountId,
			weapon: this.weapon,
			asset: this.asset,
			vehicle: this.vehicle
		});
	}
}

export const equipment = new EquipmentStore();

/**
 * Si el jugador deja de poseer un NFT equipado (lo vende o transfiere), se
 * desequipa automáticamente. Solo se ejecuta tras un refresco autoritativo del
 * inventario desde la cadena: un caché vacío al arrancar no desequipa nada.
 */
nftOwnership.onRefreshed((catalogIds) => {
	const owned = new Set(catalogIds);

	for (const slot of ['weapon', 'asset', 'vehicle'] as const) {
		const id = equipment.slotValueFor(slot);

		if (id !== null && !owned.has(id)) {
			equipment.unequip(slot);
		}
	}
});
