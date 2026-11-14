<script lang="ts">
	import { formatNear, parseNear } from '../../near/format.ts';
	import { nftMarket } from '../../state/nftMarket.svelte.ts';

	interface Props {
		tokenId: string;
		onClose: () => void;
	}

	let { tokenId, onClose }: Props = $props();

	let value = $state('1');
	const quick = ['0.5', '1', '5'];

	const parsed = $derived.by(() => {
		try {
			return parseNear(value);
		} catch {
			return null;
		}
	});

	function submit(): void {
		if (!parsed || nftMarket.busy) return;
		void nftMarket.list(tokenId, parsed).then(onClose);
	}
</script>

<form
	class="mt-2 space-y-2 rounded-lg border border-white/10 bg-slate-950/60 p-2.5"
	onsubmit={(event) => {
		event.preventDefault();
		submit();
	}}
>
	<p class="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
		Price for {tokenId}
	</p>

	<div class="flex gap-1.5">
		<input
			bind:value
			inputmode="decimal"
			aria-label="Sale price in NEAR"
			placeholder="1.0"
			class="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-slate-100 focus:border-orange-400/50 focus:outline-none"
		/>
		{#each quick as amount (amount)}
			<button
				type="button"
				onclick={() => (value = amount)}
				class="min-h-11 rounded-lg border border-white/10 bg-white/5 px-2 text-[10px] font-semibold text-slate-300 transition hover:bg-white/10"
			>
				{amount}
			</button>
		{/each}
	</div>

	<p class="text-[10px] text-slate-500">
		{parsed ? `${parsed.toString()} yoctoNEAR · ${formatNear(parsed)}` : 'Enter a valid amount.'}
	</p>

	<div class="flex gap-1.5">
		<button
			type="submit"
			disabled={!parsed || nftMarket.busy}
			class="min-h-11 flex-1 rounded-lg border border-orange-400/40 bg-orange-500/25 px-2.5 py-2 text-[11px] font-semibold tracking-wide text-orange-50 uppercase transition hover:bg-orange-500/35 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-slate-800/40 disabled:text-slate-500"
		>
			{nftMarket.busy ? 'Listing…' : 'Sell'}
		</button>
		<button
			type="button"
			onclick={onClose}
			class="min-h-11 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] font-semibold tracking-wide text-slate-300 uppercase transition hover:bg-white/10"
		>
			Cancel
		</button>
	</div>
</form>
