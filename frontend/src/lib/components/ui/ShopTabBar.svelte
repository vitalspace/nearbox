<script lang="ts">
	import { tick } from 'svelte';
	import type { ShopPanelTab, ShopPanelTabId } from './shopCatalog';
	import { SHOP_TAB_ICONS } from './shopUi';

	interface Props {
		tabs: readonly ShopPanelTab[];
		active: ShopPanelTabId;
		onSelect: (id: ShopPanelTabId) => void;
	}

	let { tabs, active, onSelect }: Props = $props();

	function focusTab(id: ShopPanelTabId): void {
		void tick().then(() => {
			document.getElementById(`shop-tab-${id}`)?.focus();
		});
	}

	function select(id: ShopPanelTabId): void {
		onSelect(id);
		focusTab(id);
	}

	function onKeyDown(event: KeyboardEvent, index: number): void {
		let next = index;

		switch (event.key) {
			case 'ArrowRight':
				next = (index + 1) % tabs.length;
				break;
			case 'ArrowLeft':
				next = (index - 1 + tabs.length) % tabs.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = tabs.length - 1;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				select(tabs[index].id);
				return;
			default:
				return;
		}

		event.preventDefault();
		select(tabs[next].id);
	}
</script>

<div class="shrink-0 border-b border-white/10 bg-slate-950/35 px-3 py-2 sm:px-4">
	<div
		role="tablist"
		aria-label="Shop categories"
		class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
	>
		{#each tabs as tab, index (tab.id)}
			{@const Icon = SHOP_TAB_ICONS[tab.id]}
			{@const isActive = active === tab.id}
			<button
				type="button"
				role="tab"
				id={`shop-tab-${tab.id}`}
				aria-controls={`shop-panel-${tab.id}`}
				aria-selected={isActive}
				tabindex={isActive ? 0 : -1}
				title={tab.hint}
				onclick={() => select(tab.id)}
				onkeydown={(event) => onKeyDown(event, index)}
				class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold tracking-wide uppercase transition focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:outline-none {isActive
					? 'text-white'
					: 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'}"
				style:border-color={isActive ? `${tab.accent}80` : undefined}
				style:background-color={isActive ? `${tab.accent}24` : undefined}
				style:box-shadow={isActive ? `0 0 20px -10px ${tab.accent}` : undefined}
			>
				<span
					class="flex shrink-0 items-center"
					style:color={isActive ? tab.accent : undefined}
					aria-hidden="true"
				>
					<Icon size={15} strokeWidth={2} />
				</span>
				<span>{tab.label}</span>
			</button>
		{/each}
	</div>
</div>
