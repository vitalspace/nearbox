/**
 * Catálogo mintable del mercado.
 *
 * La metadata base se deriva de la tienda existente (`SKINS`, `SHOP_WEAPONS`,
 * `SHOP_ASSETS`, `SHOP_VEHICLES`). No se pide título/descripción/media al
 * jugador: el contrato guarda esta metadata una vez por `catalog_id`.
 */
import {
	SHOP_ASSETS,
	SHOP_VEHICLES,
	SHOP_WEAPONS,
	type ShopIconKey,
	type ShopItem
} from '../components/ui/shopCatalog.ts';
import { SKINS, type SkinDefinition } from '../cosmetics/skins.ts';
import type { CatalogExtra, CatalogMetadataInput, TokenMetadata } from './config.ts';

export type CatalogKind = 'skins' | 'weapons' | 'assets' | 'vehicles' | 'rewards';

/**
 * Iconos de las medallas/trofeos de SPEC-045. Se resuelven a componentes de
 * Lucide en `nft/rewardUi.ts` para mantener este catálogo libre de Svelte.
 */
export type RewardIconKey =
	| 'award'
	| 'shield'
	| 'storm'
	| 'flag'
	| 'flame'
	| 'mountain'
	| 'skull'
	| 'cat'
	| 'heart'
	| 'map'
	| 'trophy';

export type RewardCatalogItem = {
	id: string;
	name: string;
	description: string;
	detail: string;
	accent: string;
	badge: string;
	hot: boolean;
	model: null;
	icon: RewardIconKey;
	kind: 'rewards';
};

/**
 * Forma normalizada de cualquier ítem vendible, sea una skin local o un
 * artículo de las tabs de armas/assets/vehículos.
 */
export type MintableCatalogItem = {
	id: string;
	name: string;
	description: string;
	detail: string;
	accent: string;
	badge: string;
	hot: boolean;
	model: string | null;
	icon: ShopIconKey;
	kind: Exclude<CatalogKind, 'rewards'>;
};

/** Acento hex por skin para glows y badges (las clases Tailwind no sirven aquí). */
const SKIN_ACCENTS: Readonly<Record<string, string>> = {
	hero: '#34d399',
	'crow-warden': '#f59e0b',
	witch: '#a78bfa',
	demon: '#f43f5e',
	frankenstein: '#84cc16',
	ghost: '#a5f3fc',
	golem: '#a8a29e',
	mummy: '#fde68a',
	'pumpkin-king': '#fb923c',
	skeleton: '#e2e8f0',
	vampire: '#b91c1c'
};

function fromShopItem(item: ShopItem): MintableCatalogItem {
	return {
		id: item.id,
		name: item.name,
		description: item.description,
		detail: item.detail,
		accent: item.accent,
		badge: item.badge,
		hot: item.hot ?? false,
		model: item.model ?? null,
		icon: item.icon,
		kind: item.tab
	};
}

function fromSkin(skin: SkinDefinition): MintableCatalogItem {
	return {
		id: skin.id,
		name: skin.name,
		description: skin.description,
		detail: 'Playable skin · mint its NFT to equip it.',
		accent: SKIN_ACCENTS[skin.id] ?? '#94a3b8',
		badge: 'Skin',
		hot: false,
		model: skin.modelPath,
		icon: 'skin',
		kind: 'skins'
	};
}

export const MINTABLE_ITEMS: readonly MintableCatalogItem[] = [
	...SKINS.map(fromSkin),
	...SHOP_WEAPONS.map(fromShopItem),
	...SHOP_ASSETS.map(fromShopItem),
	...SHOP_VEHICLES.map(fromShopItem)
];

/**
 * SPEC-045: las recompensas son cosméticos que ya existen en la tienda, así
 * que no hay catálogos exclusivos de recompensa. Se conserva el tipo para
 * tokens antiguos con `kind: 'rewards'`.
 */
export const REWARD_ITEMS: readonly RewardCatalogItem[] = [];

/** Arte, metadata y mercado usan todo el catálogo; la tienda solo MINTABLE_ITEMS. */
export const CATALOG_ITEMS: readonly (MintableCatalogItem | RewardCatalogItem)[] = [
	...MINTABLE_ITEMS,
	...REWARD_ITEMS
];

export const REWARD_ONLY_CATALOGS: readonly string[] = REWARD_ITEMS.map((item) => item.id);

const REWARD_ONLY = new Set(REWARD_ONLY_CATALOGS);

export function isRewardCatalog(id: string): boolean {
	return REWARD_ONLY.has(id);
}

export type CatalogCap = { cap: number; perAccountCap: number };

/** Fallback si el contrato no responde. Los valores on-chain mandan. */
export const CATALOG_CAPS: Readonly<Record<string, CatalogCap>> = {
	hero: { cap: 50, perAccountCap: 5 },
	'crow-warden': { cap: 50, perAccountCap: 5 },
	witch: { cap: 50, perAccountCap: 5 },
	demon: { cap: 50, perAccountCap: 5 },
	frankenstein: { cap: 50, perAccountCap: 5 },
	ghost: { cap: 50, perAccountCap: 5 },
	golem: { cap: 50, perAccountCap: 5 },
	mummy: { cap: 50, perAccountCap: 5 },
	'pumpkin-king': { cap: 50, perAccountCap: 5 },
	skeleton: { cap: 50, perAccountCap: 5 },
	vampire: { cap: 50, perAccountCap: 5 },
	'pistol-gold': { cap: 25, perAccountCap: 3 },
	'shotgun-gold': { cap: 25, perAccountCap: 3 },
	'mp5-gold': { cap: 25, perAccountCap: 3 },
	'sniper-gold': { cap: 25, perAccountCap: 3 },
	'bazooka-gold': { cap: 25, perAccountCap: 3 },
	crown: { cap: 50, perAccountCap: 5 },
	'coin-pistol': { cap: 50, perAccountCap: 5 },
	skateboard: { cap: 25, perAccountCap: 3 },
	'magic-broom': { cap: 25, perAccountCap: 3 }
};

export function catalogItemById(id: string): MintableCatalogItem | RewardCatalogItem | null {
	return CATALOG_ITEMS.find((item) => item.id === id) ?? null;
}

/** Solo artículos de la tienda; excluye medallas/trofeos de progresión. */
export function mintableCatalogItemById(id: string): MintableCatalogItem | null {
	const item = catalogItemById(id);
	return item && item.kind !== 'rewards' ? item : null;
}

export function catalogCap(item: { id: string }): CatalogCap {
	return CATALOG_CAPS[item.id] ?? { cap: 0, perAccountCap: 0 };
}

export function catalogExtraFor(item: MintableCatalogItem | RewardCatalogItem): CatalogExtra {
	return {
		catalogId: item.id,
		model: item.model,
		accent: item.accent,
		badge: item.badge,
		hot: item.hot,
		kind: item.kind
	};
}

export function metadataForCatalog(
	item: MintableCatalogItem | RewardCatalogItem
): CatalogMetadataInput {
	return {
		catalog_id: item.id,
		title: item.name,
		description: item.description,
		media: '',
		reference: `runworld://catalog/${item.id}`,
		extra: JSON.stringify(catalogExtraFor(item))
	};
}

/** Todo el `catalog_metadata` del `init`. */
export function catalogMetadata(): CatalogMetadataInput[] {
	return MINTABLE_ITEMS.map(metadataForCatalog);
}

function fallbackCatalog(catalogId: string): CatalogExtra | null {
	const item = catalogItemById(catalogId);
	return item ? catalogExtraFor(item) : null;
}

export function catalogIdFromToken(tokenId: string): string {
	return tokenId.split('#')[0] ?? tokenId;
}

export function tokenSerial(tokenId: string): number | null {
	const [, raw] = tokenId.split('#');
	if (!raw) return null;
	const serial = Number(raw);
	return Number.isFinite(serial) ? serial : null;
}

/** Reconstruye el arte del catálogo desde el `extra` del token. */
export function catalogFromExtra(extra: string | null | undefined): CatalogExtra | null {
	if (!extra) return null;

	try {
		const parsed = JSON.parse(extra) as Partial<CatalogExtra>;
		const catalogId = typeof parsed.catalogId === 'string' ? parsed.catalogId : null;
		if (!catalogId) return null;

		const fallback = fallbackCatalog(catalogId);
		const kind =
			parsed.kind === 'skins' ||
			parsed.kind === 'weapons' ||
			parsed.kind === 'assets' ||
			parsed.kind === 'vehicles' ||
			parsed.kind === 'rewards'
				? parsed.kind
				: (fallback?.kind ?? 'assets');

		return {
			catalogId,
			model: typeof parsed.model === 'string' ? parsed.model : (fallback?.model ?? null),
			accent: typeof parsed.accent === 'string' ? parsed.accent : (fallback?.accent ?? '#94a3b8'),
			badge: typeof parsed.badge === 'string' ? parsed.badge : (fallback?.badge ?? 'NFT'),
			hot: typeof parsed.hot === 'boolean' ? parsed.hot : (fallback?.hot ?? false),
			kind
		};
	} catch {
		return null;
	}
}

export function catalogFromMetadata(meta: TokenMetadata | null | undefined): CatalogExtra | null {
	if (!meta) return null;

	const fromExtra = catalogFromExtra(meta.extra);
	if (fromExtra) return fromExtra;

	const reference = meta.reference ?? '';
	const match = reference.match(/^runworld:\/\/catalog\/(.+)$/);
	if (match) return fallbackCatalog(match[1]);

	return null;
}

export function artForMetadata(meta: TokenMetadata | null | undefined): CatalogExtra | null {
	return catalogFromMetadata(meta);
}

export function catalogItemForMetadata(
	meta: TokenMetadata | null | undefined
): MintableCatalogItem | RewardCatalogItem | null {
	const catalog = catalogFromMetadata(meta);
	return catalog ? catalogItemById(catalog.catalogId) : null;
}
