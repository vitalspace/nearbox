<script lang="ts">
	import type { CatalogExtra, TokenMetadata } from '../../nft/config.ts';
	import NftArt from './NftArt.svelte';

	interface Props {
		title: string;
		serial?: number | null;
		catalog?: CatalogExtra | null;
		metadata?: TokenMetadata | null;
		subtitle?: string;
		priceLabel?: string;
		chip?: string;
		chipClass?: string;
		actionLabel?: string;
		actionTitle?: string;
		actionDisabled?: boolean;
		onAction?: () => void;
		secondaryLabel?: string;
		secondaryDisabled?: boolean;
		onSecondary?: () => void;
	}

	let {
		title,
		serial,
		catalog,
		metadata,
		subtitle,
		priceLabel,
		chip,
		chipClass = 'border-white/10 bg-slate-950/70 text-slate-300',
		actionLabel,
		actionTitle,
		actionDisabled = false,
		onAction,
		secondaryLabel,
		secondaryDisabled = false,
		onSecondary
	}: Props = $props();
</script>

<article class="flex h-full flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/45 p-2.5">
	<NftArt {catalog} {metadata} {title} />

	<div class="min-w-0">
		<div class="flex items-start justify-between gap-2">
			<p class="min-w-0 truncate text-sm font-bold text-slate-100">
				{title}{#if serial !== null && serial !== undefined}<span class="text-slate-400">
						#{serial}</span
					>{/if}
			</p>
			{#if chip}
				<span
					class="shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {chipClass}"
				>
					{chip}
				</span>
			{/if}
		</div>

		{#if subtitle}
			<p class="truncate text-[10px] text-slate-500">{subtitle}</p>
		{/if}

		{#if priceLabel}
			<p class="mt-1 text-xs font-semibold text-amber-200">{priceLabel}</p>
		{/if}
	</div>

	<div class="mt-auto flex flex-wrap gap-1.5">
		{#if actionLabel && onAction}
			<button
				type="button"
				onclick={onAction}
				disabled={actionDisabled}
				title={actionTitle}
				class="min-h-11 flex-1 rounded-lg border border-orange-400/40 bg-orange-500/20 px-2.5 py-2 text-[11px] font-semibold tracking-wide text-orange-50 uppercase transition hover:bg-orange-500/30 focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-slate-800/40 disabled:text-slate-500"
			>
				{actionLabel}
			</button>
		{/if}

		{#if secondaryLabel && onSecondary}
			<button
				type="button"
				onclick={onSecondary}
				disabled={secondaryDisabled}
				class="min-h-11 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] font-semibold tracking-wide text-slate-200 uppercase transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-500"
			>
				{secondaryLabel}
			</button>
		{/if}
	</div>
</article>
