<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Wallet from '@lucide/svelte/icons/wallet';
	import { explorerAccountUrl } from '../../near/rpc.ts';
	import { formatNear, shortAccount } from '../../near/format.ts';
	import { authSession } from '../../state/auth.svelte.ts';
	import { nftMarket } from '../../state/nftMarket.svelte.ts';

	const lowBalance = $derived(nftMarket.balanceYocto < 15_000_000_000_000_000_000_000n);
	const lowFunds = $derived(
		nftMarket.relayerReason === 'reserve' || nftMarket.relayerReason === 'error'
	);
</script>

<div
	class="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-2.5 py-2"
>
	<span class="flex size-8 items-center justify-center rounded-lg bg-amber-400/15 text-amber-200">
		<Wallet size={16} aria-hidden="true" />
	</span>

	<div class="min-w-0 flex-1">
		{#if authSession.accountId}
			<p class="truncate text-[11px] font-semibold text-slate-200">
				{shortAccount(authSession.accountId)}
			</p>
			<p class="text-[10px] text-slate-500">
				<span class={lowBalance ? 'text-amber-300' : 'text-emerald-300'}>
					{formatNear(nftMarket.balanceYocto)}
				</span>
				{#if lowBalance}· low balance{/if}
			</p>
		{:else}
			<p class="text-[11px] text-slate-400">Sign in to see your wallet.</p>
		{/if}
	</div>

	{#if authSession.accountId}
		<a
			href={explorerAccountUrl(authSession.accountId)}
			target="_blank"
			rel="noreferrer"
			class="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
			aria-label="Open your account in the explorer"
		>
			<ExternalLink size={15} aria-hidden="true" />
		</a>
	{/if}

	<button
		type="button"
		onclick={() => nftMarket.fund()}
		disabled={nftMarket.busy || !authSession.accountId || lowFunds}
		title={lowFunds ? 'Testnet funds are running low' : 'Receive 0.05 testnet NEAR'}
		class="min-h-11 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-2 text-[10px] font-semibold tracking-wide text-cyan-100 uppercase transition hover:bg-cyan-400/20 focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-slate-800/40 disabled:text-slate-500"
	>
		{lowFunds ? 'Funds running low' : 'Fund testnet wallet'}
	</button>
</div>

{#if lowFunds}
	<p role="status" class="mt-1.5 text-[10px] text-amber-300">
		Testnet funds are running low. Reads and existing listings still work.
	</p>
{/if}
