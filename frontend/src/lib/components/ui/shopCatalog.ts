import type { SkinId } from '../../cosmetics/skins';

export type ShopItemTabId = 'skins' | 'weapons' | 'assets' | 'vehicles';
/** Alias histórico: el catálogo local usa el mismo conjunto de pestañas. */
export type ShopTabId = ShopItemTabId;
export type ShopPanelTabId = ShopItemTabId | 'market';

export type ShopTab = {
	id: ShopTabId;
	label: string;
	kicker: string;
	hint: string;
	accent: string;
};

export type ShopPanelTab = Omit<ShopTab, 'id'> & { id: ShopPanelTabId };

export type ShopIconKey = 'skin' | 'weapon' | 'crown' | 'coin' | 'skate' | 'broom';

type ShopItemBase = {
	id: string;
	name: string;
	description: string;
	/** Where to find it or what it does. */
	detail: string;
	accent: string;
	icon: ShopIconKey;
	badge: string;
	/** Shows the HOT pill on the card and the detail pane. */
	hot?: boolean;
	/** Optional GLB under `static/` for the 3D shop preview. */
	model?: string;
	/** Village guide entry this item can point to, if any. */
	guideId: string | null;
};

export type ShopWeaponItem = ShopItemBase & { tab: 'weapons' };
export type ShopAssetItem = ShopItemBase & { tab: 'assets' };
export type ShopVehicleItem = ShopItemBase & { tab: 'vehicles' };
export type ShopItem = ShopWeaponItem | ShopAssetItem | ShopVehicleItem;

export type ShopPreviewRef =
	| { kind: 'skin'; skin: SkinId }
	| { kind: 'model'; url: string; accent: string }
	| { kind: 'poster'; icon: ShopIconKey; accent: string };

export const SHOP_TABS: readonly ShopTab[] = [
	{
		id: 'skins',
		label: 'Skins',
		kicker: 'Wardrobe',
		hint: 'Try on every look you have unlocked.',
		accent: '#fb923c'
	},
	{
		id: 'weapons',
		label: 'Weapons',
		kicker: 'Gold arsenal',
		hint: 'Limited gold variants of the four arena weapons.',
		accent: '#fbbf24'
	},
	{
		id: 'assets',
		label: 'Assets',
		kicker: 'Hot cosmetics',
		hint: 'Two hot cosmetics: the crown and the coin pistol.',
		accent: '#a78bfa'
	},
	{
		id: 'vehicles',
		label: 'Vehicles',
		kicker: 'Hot rides',
		hint: 'Two hot rides: the skateboard and the magic broom.',
		accent: '#f43f5e'
	}
];

/**
 * Quinta pestaña del panel: el mercado NEP-245. No es un `ShopTabId` porque
 * las cuatro primeras pestañas son catálogo local y ésta vive on-chain.
 */
export const MARKET_TAB: ShopPanelTab = {
	id: 'market',
	label: 'Market',
	kicker: 'Village Market',
	hint: 'Mint, buy and sell NEP-245 collectibles.',
	accent: '#34d399'
};

export const SHOP_WEAPONS: readonly ShopWeaponItem[] = [
	{
		id: 'pistol-gold',
		tab: 'weapons',
		name: 'Golden Pistol',
		description:
			'A gold-plated sidearm that catches every barn light. Small, loud and impossible to miss.',
		detail: 'Gold variant · pistol showcase.',
		accent: '#fbbf24',
		icon: 'weapon',
		badge: 'Gold',
		hot: true,
		model: 'weapons/pistol_gold.glb',
		guideId: null
	},
	{
		id: 'shotgun-gold',
		tab: 'weapons',
		name: 'Golden Shotgun',
		description:
			'The close-range classic, polished until the barrel glows. Built for dramatic entrances.',
		detail: 'Gold variant · shotgun showcase.',
		accent: '#facc15',
		icon: 'weapon',
		badge: 'Gold',
		hot: true,
		model: 'weapons/shotgun_gold.glb',
		guideId: null
	},
	{
		id: 'mp5-gold',
		tab: 'weapons',
		name: 'Golden SMG',
		description:
			'A compact gold SMG with a chrome magazine. Fast, shiny and very hard to put down.',
		detail: 'Gold variant · SMG showcase.',
		accent: '#f59e0b',
		icon: 'weapon',
		badge: 'Gold',
		hot: true,
		model: 'weapons/mp5_gold.glb',
		guideId: null
	},
	{
		id: 'sniper-gold',
		tab: 'weapons',
		name: 'Golden Sniper',
		description:
			'A long-range rifle wrapped in gold leaf. One shot is all it needs to make a statement.',
		detail: 'Gold variant · rifle showcase.',
		accent: '#fcd34d',
		icon: 'weapon',
		badge: 'Gold',
		hot: true,
		model: 'weapons/sniper_rifle_gold.glb',
		guideId: null
	},
	{
		id: 'bazooka-gold',
		tab: 'weapons',
		name: 'Golden Bazooka',
		description:
			'The loudest item in the village, finished in polished gold. Subtlety was never the plan.',
		detail: 'Gold variant · bazooka showcase.',
		accent: '#fbbf24',
		icon: 'weapon',
		badge: 'Gold',
		hot: true,
		model: 'weapons/bazooka_gold.glb',
		guideId: null
	}
];

export const SHOP_ASSETS: readonly ShopAssetItem[] = [
	{
		id: 'crown',
		tab: 'assets',
		name: 'Crown',
		description:
			'A jewel-encrusted crown for the ruler of the plaza. Wear it and let the village bow.',
		detail: 'Gold headpiece · props/crown.glb.',
		accent: '#fbbf24',
		icon: 'crown',
		badge: 'Cosmetic',
		hot: true,
		model: 'props/crown.glb',
		guideId: null
	},
	{
		id: 'coin-pistol',
		tab: 'assets',
		name: 'Coin Pistol',
		description:
			'A sidearm that fires shiny coins instead of bullets. Flashy, impractical and very collectible.',
		detail: 'Weapon skin · weapons/coin_pistol.glb.',
		accent: '#f59e0b',
		icon: 'coin',
		badge: 'Weapon skin',
		hot: true,
		model: 'weapons/coin_pistol.glb',
		guideId: null
	}
];

export const SHOP_VEHICLES: readonly ShopVehicleItem[] = [
	{
		id: 'skateboard',
		tab: 'vehicles',
		name: 'Skateboard',
		description:
			'A graffiti-covered deck with glowing wheels. Perfect for cruising the plaza in style.',
		detail: 'Street ride · props/skateboard.glb.',
		accent: '#22d3ee',
		icon: 'skate',
		badge: 'Hot ride',
		hot: true,
		model: 'props/skateboard.glb',
		guideId: null
	},
	{
		id: 'magic-broom',
		tab: 'vehicles',
		name: 'Magic Broom',
		description:
			'A witch broom that hovers just above the ground. Faster than walking and much more magical.',
		detail: 'Flying ride · props/magic_broom.glb.',
		accent: '#a855f7',
		icon: 'broom',
		badge: 'Hot ride',
		hot: true,
		model: 'props/magic_broom.glb',
		guideId: null
	}
];
