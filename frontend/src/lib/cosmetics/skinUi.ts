import Bandage from '@lucide/svelte/icons/bandage';
import Crown from '@lucide/svelte/icons/crown';
import Flame from '@lucide/svelte/icons/flame';
import Ghost from '@lucide/svelte/icons/ghost';
import MoonStar from '@lucide/svelte/icons/moon-star';
import Mountain from '@lucide/svelte/icons/mountain';
import Skull from '@lucide/svelte/icons/skull';
import Sparkles from '@lucide/svelte/icons/sparkles';
import UserRound from '@lucide/svelte/icons/user-round';
import Wheat from '@lucide/svelte/icons/wheat';
import Zap from '@lucide/svelte/icons/zap';
import type { Component } from 'svelte';
import type { SkinId } from './skins';

export type SkinIconComponent = Component<{
	size?: number;
	strokeWidth?: number;
	class?: string;
}>;

export const SKIN_ICONS: Record<SkinId, SkinIconComponent> = {
	hero: UserRound,
	'crow-warden': Wheat,
	witch: Sparkles,
	demon: Flame,
	frankenstein: Zap,
	ghost: Ghost,
	golem: Mountain,
	mummy: Bandage,
	'pumpkin-king': Crown,
	skeleton: Skull,
	vampire: MoonStar
};

export const SKIN_TONES: Record<SkinId, string> = {
	hero: 'from-emerald-500/30 to-sky-500/10 text-emerald-200',
	'crow-warden': 'from-amber-500/30 to-orange-600/10 text-amber-200',
	witch: 'from-violet-500/30 to-fuchsia-500/10 text-violet-200',
	demon: 'from-red-500/30 to-rose-600/10 text-red-200',
	frankenstein: 'from-lime-500/30 to-green-600/10 text-lime-200',
	ghost: 'from-cyan-200/20 to-slate-400/10 text-cyan-100',
	golem: 'from-stone-500/30 to-amber-700/10 text-stone-200',
	mummy: 'from-yellow-200/20 to-amber-600/10 text-yellow-100',
	'pumpkin-king': 'from-orange-500/40 to-amber-500/10 text-orange-200',
	skeleton: 'from-slate-200/20 to-slate-500/10 text-slate-100',
	vampire: 'from-red-700/30 to-purple-700/10 text-red-200'
};
