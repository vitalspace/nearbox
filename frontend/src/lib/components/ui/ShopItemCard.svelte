<script lang="ts">
	import type { ShopItem } from './shopCatalog';
	import { SHOP_ICONS, SHOP_TONES, type ShopStatus } from './shopUi';

	interface Props {
		item: ShopItem;
		selected: boolean;
		status?: ShopStatus;
		onSelect: () => void;
	}

	let { item, selected, status, onSelect }: Props = $props();

	const Icon = $derived(SHOP_ICONS[item.icon]);
</script>

<button
	type="button"
	onclick={onSelect}
	aria-pressed={selected}
	title={item.detail}
	class="flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition {selected
		? 'bg-white/5'
		: 'border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-white/5'}"
	style:border-color={selected ? `${item.accent}99` : undefined}
	style:background-color={selected ? `${item.accent}1a` : undefined}
	style:box-shadow={selected ? `0 0 18px -10px ${item.accent}` : undefined}
>
	<span
		class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br {SHOP_TONES[
			item.icon
		]}"
		aria-hidden="true"
	>
		<Icon size={17} strokeWidth={2} />
	</span>

	<span class="min-w-0 flex-1">
		<span class="flex items-start justify-between gap-2">
			<span class="min-w-0 truncate text-sm font-bold text-slate-100">{item.name}</span>
			<span class="flex shrink-0 items-center gap-1">
				{#if item.hot}
					<span
						class="rounded-full border border-rose-300/40 bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase"
					>
						HOT
					</span>
				{/if}
				<span
					class="rounded-full border border-white/10 bg-slate-950/50 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-slate-400 uppercase"
				>
					{item.badge}
				</span>
			</span>
		</span>

		{#if status}
			<span class="mt-1 flex flex-wrap items-center gap-1">
				<span
					class="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {status.className}"
				>
					{status.label}
				</span>
			</span>
		{/if}

		<span class="mt-1 block truncate text-[10px] text-slate-500">{item.detail}</span>
	</span>
</button>
