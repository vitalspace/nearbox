<script lang="ts">
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { formatNear } from '../../near/format.ts';
	import type { MintableCatalogItem } from '../../nft/catalog.ts';
	import { authSession } from '../../state/auth.svelte.ts';
	import { nftMarket } from '../../state/nftMarket.svelte.ts';
	import ReconnectSession from './ReconnectSession.svelte';

	interface Props {
		item: MintableCatalogItem;
	}

	let { item }: Props = $props();

	const stats = $derived(nftMarket.catalogStats[item.id]);
	const soldOut = $derived(stats ? stats.minted >= stats.cap || stats.remaining <= 0 : false);
	const missingAccount = $derived(!authSession.accountId);
	const disabled = $derived(
		nftMarket.busy ||
			!nftMarket.configured ||
			missingAccount ||
			!stats ||
			soldOut ||
			nftMarket.mintMode === 'unavailable'
	);

	const buttonLabel = $derived.by(() => {
		if (nftMarket.busy) return 'Minting…';
		if (stats && stats.minted >= stats.cap) return 'Sold out';
		if (nftMarket.mintMode === 'sponsored') return 'Free mint';
		if (nftMarket.mintMode === 'self') {
			return `Mint · ${formatNear(nftMarket.mintDepositYocto, 2)}`;
		}
		return 'Mint NFT';
	});

	const reason = $derived.by(() => {
		if (!nftMarket.configured) return 'Market is not configured.';
		if (missingAccount) return 'Sign in to mint this item.';
		if (!stats) return 'Reading the on-chain supply…';
		if (stats.minted >= stats.cap) return 'Sold out.';
		if (stats.remaining <= 0) return 'You reached your mint limit for this item.';
		if (nftMarket.mintMode === 'unavailable') {
			return 'Mint capacity reached. Fund your wallet to pay with NEAR.';
		}
		return null;
	});

	function submit(): void {
		if (disabled || !stats) return;
		void nftMarket.mint(item.id);
	}
</script>

<div class="rounded-xl border border-white/10 bg-slate-950/40 p-3">
	<div class="flex items-center justify-between gap-2">
		<p class="text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase">Collectible</p>
		{#if stats}
			<span class="text-[10px] font-medium text-slate-400">
				{stats.minted} / {stats.cap} minted
			</span>
		{:else}
			<span class="text-[10px] font-medium text-slate-500">Reading supply…</span>
		{/if}
	</div>

	<p class="mt-1 text-[10px] leading-snug text-slate-500">
		Mint this item as a NEP-245 NFT on testnet. Nothing in the shop is free: you must own the NFT to
		equip it.
	</p>

	{#if stats && !soldOut}
		<p class="mt-1 text-[10px] text-slate-500">
			{stats.remaining} left for you this season · {stats.per_account_cap} per account
		</p>
	{/if}

	<button
		type="button"
		onclick={submit}
		{disabled}
		class="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-semibold tracking-wide uppercase transition {soldOut
			? 'cursor-not-allowed border-white/5 bg-slate-800/40 text-slate-500'
			: 'border-orange-400/40 bg-orange-500/25 text-orange-50 hover:bg-orange-500/35 focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-slate-800/40 disabled:text-slate-500'}"
		style:border-color={!disabled && !soldOut ? `${item.accent}66` : undefined}
	>
		<Sparkles size={14} strokeWidth={2.5} aria-hidden="true" />
		{buttonLabel}
	</button>

	{#if reason}
		<p class="mt-1.5 text-[10px] leading-snug text-amber-300" role="status">{reason}</p>
	{/if}

	{#if nftMarket.error}
		<p class="mt-1.5 text-[10px] leading-snug text-rose-300" role="alert">{nftMarket.error}</p>
	{/if}

	<ReconnectSession />

	{#if nftMarket.notice}
		<p class="mt-1.5 text-[10px] leading-snug text-emerald-300" role="status">
			{nftMarket.notice}
		</p>
	{/if}
</div>
