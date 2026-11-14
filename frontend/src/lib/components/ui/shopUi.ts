import BroomSparkles from '@lucide/svelte/icons/broom-sparkles';
import Coins from '@lucide/svelte/icons/coins';
import Crown from '@lucide/svelte/icons/crown';
import Crosshair from '@lucide/svelte/icons/crosshair';
import GripHorizontal from '@lucide/svelte/icons/grip-horizontal';
import Package from '@lucide/svelte/icons/package';
import Sparkles from '@lucide/svelte/icons/sparkles';
import Store from '@lucide/svelte/icons/store';
import Swords from '@lucide/svelte/icons/swords';
import type { Component } from 'svelte';
import type { ShopIconKey, ShopPanelTabId } from './shopCatalog';

export type ShopIconComponent = Component<{
	size?: number;
	strokeWidth?: number;
	class?: string;
}>;

export type ShopStatus = {
	label: string;
	className: string;
	done: boolean;
};

export const SHOP_TAB_ICONS: Record<ShopPanelTabId, ShopIconComponent> = {
	skins: Sparkles,
	weapons: Swords,
	assets: Package,
	vehicles: GripHorizontal,
	market: Store
};

export const SHOP_ICONS: Record<ShopIconKey, ShopIconComponent> = {
	skin: Sparkles,
	weapon: Crosshair,
	crown: Crown,
	coin: Coins,
	skate: GripHorizontal,
	broom: BroomSparkles
};

export const SHOP_TONES: Record<ShopIconKey, string> = {
	skin: 'from-emerald-400/30 to-cyan-500/10 text-emerald-100',
	weapon: 'from-yellow-400/35 to-amber-600/10 text-yellow-100',
	crown: 'from-yellow-300/35 to-amber-500/10 text-yellow-100',
	coin: 'from-amber-400/35 to-yellow-600/10 text-amber-100',
	skate: 'from-cyan-400/30 to-sky-600/10 text-cyan-200',
	broom: 'from-purple-500/30 to-fuchsia-600/10 text-fuchsia-200'
};
