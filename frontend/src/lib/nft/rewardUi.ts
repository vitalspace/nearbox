import Award from '@lucide/svelte/icons/award';
import Cat from '@lucide/svelte/icons/cat';
import CloudLightning from '@lucide/svelte/icons/cloud-lightning';
import Flag from '@lucide/svelte/icons/flag';
import Flame from '@lucide/svelte/icons/flame';
import Heart from '@lucide/svelte/icons/heart';
import Map from '@lucide/svelte/icons/map';
import Mountain from '@lucide/svelte/icons/mountain';
import Shield from '@lucide/svelte/icons/shield';
import Skull from '@lucide/svelte/icons/skull';
import Trophy from '@lucide/svelte/icons/trophy';
import type { RewardIconKey } from './catalog.ts';
import type { ShopIconComponent } from '../components/ui/shopUi';

export const REWARD_ICONS: Record<RewardIconKey, ShopIconComponent> = {
	award: Award,
	shield: Shield,
	storm: CloudLightning,
	flag: Flag,
	flame: Flame,
	mountain: Mountain,
	skull: Skull,
	cat: Cat,
	heart: Heart,
	map: Map,
	trophy: Trophy
};

export const REWARD_TONES: Record<RewardIconKey, string> = {
	award: 'from-lime-400/30 to-emerald-600/10 text-lime-100',
	shield: 'from-orange-400/30 to-amber-700/10 text-orange-100',
	storm: 'from-sky-400/30 to-cyan-700/10 text-sky-100',
	flag: 'from-red-400/30 to-rose-700/10 text-red-100',
	flame: 'from-purple-400/30 to-fuchsia-700/10 text-purple-100',
	mountain: 'from-cyan-400/30 to-sky-700/10 text-cyan-100',
	skull: 'from-slate-400/30 to-slate-700/10 text-slate-100',
	cat: 'from-pink-400/30 to-rose-600/10 text-pink-100',
	heart: 'from-emerald-400/30 to-green-700/10 text-emerald-100',
	map: 'from-amber-400/30 to-yellow-700/10 text-amber-100',
	trophy: 'from-yellow-300/35 to-amber-600/10 text-yellow-100'
};
