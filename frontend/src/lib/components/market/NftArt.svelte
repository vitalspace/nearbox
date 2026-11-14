<script lang="ts">
	import Package from '@lucide/svelte/icons/package';
	import { isSkinId } from '../../cosmetics/skins.ts';
	import { SKIN_ICONS, SKIN_TONES } from '../../cosmetics/skinUi';
	import type { CatalogExtra, TokenMetadata } from '../../nft/config.ts';
	import { catalogItemById } from '../../nft/catalog.ts';
	import { REWARD_ICONS, REWARD_TONES } from '../../nft/rewardUi.ts';
	import { SHOP_ICONS, SHOP_TONES } from '../ui/shopUi';

	interface Props {
		catalog?: CatalogExtra | null;
		metadata?: TokenMetadata | null;
		title: string;
		compact?: boolean;
	}

	let { catalog, metadata, title, compact = false }: Props = $props();

	let failed = $state(false);

	const media = $derived.by(() => {
		const raw = metadata?.media?.trim();
		if (!raw) return null;
		if (raw.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${raw.slice(7)}`;
		return /^https?:\/\//.test(raw) ? raw : null;
	});

	const item = $derived(catalogItemById(catalog?.catalogId ?? ''));
	const skinId = $derived(item && item.kind === 'skins' && isSkinId(item.id) ? item.id : null);
	const Icon = $derived.by(() => {
		if (skinId) return SKIN_ICONS[skinId];
		if (item && item.kind === 'rewards') return REWARD_ICONS[item.icon];
		if (item) return SHOP_ICONS[item.icon];
		return Package;
	});
	const tone = $derived.by(() => {
		if (skinId) return SKIN_TONES[skinId];
		if (item && item.kind === 'rewards') return REWARD_TONES[item.icon];
		if (item) return SHOP_TONES[item.icon];
		return 'from-slate-700/40 to-slate-900/20 text-slate-300';
	});
	const accent = $derived(catalog?.accent ?? item?.accent ?? '#94a3b8');
</script>

<div
	class="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br {tone} {compact
		? 'h-20'
		: 'h-36'}"
	style:box-shadow={`inset 0 0 30px -18px ${accent}`}
>
	{#if media && !failed}
		<img
			src={media}
			alt={title}
			loading="lazy"
			class="h-full w-full object-cover"
			onerror={() => (failed = true)}
		/>
	{:else}
		<Icon size={compact ? 26 : 44} strokeWidth={1.7} aria-hidden="true" />
	{/if}

	{#if catalog}
		<span
			class="absolute top-1.5 left-1.5 rounded-full border border-white/15 bg-slate-950/75 px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase"
			style:color={accent}
		>
			{catalog.badge}
		</span>
	{/if}
</div>
