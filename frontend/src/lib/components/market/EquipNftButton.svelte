<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Lock from '@lucide/svelte/icons/lock';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type { MintableCatalogItem } from '../../nft/catalog.ts';
	import { canEquipCatalogItem, equipCatalogItem, isCatalogItemEquipped } from '../../nft/equip.ts';
	import { nftOwnership } from '../../state/nftOwnership.svelte.ts';

	interface Props {
		item: MintableCatalogItem;
		compact?: boolean;
	}

	let { item, compact = false }: Props = $props();

	const owned = $derived(nftOwnership.owns(item.id));
	const available = $derived(canEquipCatalogItem(item));
	const equipped = $derived(isCatalogItemEquipped(item));
	const enabled = $derived(available && !equipped);
	const noun = $derived(
		item.kind === 'vehicles' ? 'ride' : item.kind === 'weapons' ? 'weapon' : 'item'
	);

	function equip(): void {
		if (!enabled) return;
		equipCatalogItem(item);
	}
</script>

<button
	type="button"
	onclick={equip}
	disabled={!enabled}
	title={equipped
		? `${item.name} is equipped`
		: owned
			? `Equip ${item.name}`
			: `Mint or buy the ${item.name} NFT to equip this ${noun}`}
	class="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-semibold tracking-wide uppercase transition {equipped
		? 'cursor-default border-amber-300/40 bg-amber-400/10 text-amber-200'
		: enabled
			? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25 focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:outline-none'
			: 'cursor-not-allowed border-white/5 bg-slate-800/40 text-slate-500'}"
	style:border-color={enabled ? `${item.accent}66` : undefined}
>
	{#if equipped}
		<Check size={14} strokeWidth={2.5} aria-hidden="true" />
		Equipped
	{:else if enabled}
		<Sparkles size={14} strokeWidth={2.5} aria-hidden="true" />
		Equip {compact ? '' : item.name}
	{:else}
		<Lock size={13} strokeWidth={2.5} aria-hidden="true" />
		NFT required
	{/if}
</button>

{#if !owned}
	<p class="mt-1.5 text-[10px] leading-snug text-slate-500">
		Mint or buy this NFT to equip it at any time.
	</p>
{/if}
