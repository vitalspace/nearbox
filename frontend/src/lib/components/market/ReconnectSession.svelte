<script lang="ts">
	import { nftMarket } from '../../state/nftMarket.svelte.ts';
</script>

{#if nftMarket.needsLogin}
	<button
		type="button"
		onclick={() => void nftMarket.reconnect()}
		disabled={nftMarket.busy}
		class="mt-1.5 flex min-h-11 w-full items-center justify-center rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-2 text-xs font-semibold tracking-wide text-rose-50 uppercase transition hover:bg-rose-500/30 focus-visible:ring-2 focus-visible:ring-rose-400/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
	>
		{nftMarket.busy ? 'Signing in…' : 'Sign in again'}
	</button>
{/if}
