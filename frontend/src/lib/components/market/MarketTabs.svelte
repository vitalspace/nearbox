<script lang="ts">
	import type { MarketTab } from '../../state/nftMarket.svelte.ts';

	interface Props {
		active: MarketTab;
		onSelect: (tab: MarketTab) => void;
	}

	let { active, onSelect }: Props = $props();

	const tabs: Array<{ id: MarketTab; label: string }> = [
		{ id: 'browse', label: 'Browse' },
		{ id: 'owned', label: 'My NFTs' },
		{ id: 'listings', label: 'My listings' }
	];

	function select(tab: MarketTab): void {
		onSelect(tab);
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
			default:
				return;
		}

		event.preventDefault();
		onSelect(tabs[next].id);
		document.getElementById(`market-tab-${tabs[next].id}`)?.focus();
	}
</script>

<div role="tablist" aria-label="Market sections" class="flex gap-1.5 overflow-x-auto pb-0.5">
	{#each tabs as tab, index (tab.id)}
		{@const isActive = active === tab.id}
		<button
			type="button"
			role="tab"
			id={`market-tab-${tab.id}`}
			aria-controls={`market-panel-${tab.id}`}
			aria-selected={isActive}
			tabindex={isActive ? 0 : -1}
			onclick={() => select(tab.id)}
			onkeydown={(event) => onKeyDown(event, index)}
			class="min-h-11 shrink-0 rounded-lg border px-3 py-2 text-[11px] font-semibold tracking-wide uppercase transition focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:outline-none {isActive
				? 'border-orange-400/60 bg-orange-500/20 text-orange-100'
				: 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'}"
		>
			{tab.label}
		</button>
	{/each}
</div>
