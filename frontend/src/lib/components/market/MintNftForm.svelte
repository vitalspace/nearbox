<script lang="ts">
	import { catalogExtraFor, MINTABLE_ITEMS } from '../../nft/catalog.ts';
	import { formatNear } from '../../near/format.ts';
	import { authSession } from '../../state/auth.svelte.ts';
	import { nftMarket } from '../../state/nftMarket.svelte.ts';
	import NftArt from './NftArt.svelte';

	const GROUPS = [
		{ label: 'Skins', kind: 'skins' },
		{ label: 'Weapons', kind: 'weapons' },
		{ label: 'Assets', kind: 'assets' },
		{ label: 'Vehicles', kind: 'vehicles' }
	] as const;

	let selectedId = $state(MINTABLE_ITEMS[0]?.id ?? '');
	let open = $state(false);

	const item = $derived(
		MINTABLE_ITEMS.find((entry) => entry.id === selectedId) ?? MINTABLE_ITEMS[0]
	);
	const stats = $derived(item ? nftMarket.catalogStats[item.id] : undefined);
	const soldOut = $derived(stats ? stats.minted >= stats.cap || stats.remaining <= 0 : false);
	const missingAccount = $derived(!authSession.accountId);
	const disabled = $derived(
		nftMarket.busy ||
			!nftMarket.configured ||
			missingAccount ||
			!item ||
			soldOut ||
			nftMarket.mintMode === 'unavailable'
	);

	const buttonLabel = $derived.by(() => {
		if (nftMarket.mintMode === 'sponsored') return 'Free mint';
		if (nftMarket.mintMode === 'self') return `Mint · ${formatNear(nftMarket.mintDepositYocto, 2)}`;
		return 'Mint';
	});

	const reason = $derived.by(() => {
		if (!nftMarket.configured) return 'Market is not configured.';
		if (missingAccount) return 'Sign in with Google to mint.';
		if (!item) return 'No mintable items.';
		if (!stats) return 'Reading the on-chain supply…';
		if (stats.minted >= stats.cap) return 'Sold out.';
		if (soldOut) return 'You reached your mint limit for this item.';
		if (nftMarket.mintMode === 'unavailable') {
			return 'Testnet mint capacity reached. Fund your wallet to pay with NEAR.';
		}
		return null;
	});

	function submit(): void {
		if (disabled || !item) return;
		void nftMarket.mint(item.id);
	}
</script>

<section class="rounded-xl border border-white/10 bg-slate-950/40 p-3">
	<div class="flex items-center justify-between gap-2">
		<div>
			<h3 class="text-[10px] font-semibold tracking-[0.3em] text-orange-300/80 uppercase">
				Mint an NFT
			</h3>
			<p class="text-[10px] text-slate-500">Metadata comes from the village catalog.</p>
		</div>
		<button
			type="button"
			onclick={() => (open = !open)}
			class="min-h-11 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[10px] font-semibold tracking-wide text-slate-200 uppercase transition hover:bg-white/10"
		>
			{open ? 'Hide' : 'Mint NFT'}
		</button>
	</div>

	{#if open}
		<div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
			<div>
				{#if item}
					<NftArt catalog={catalogExtraFor(item)} metadata={null} title={item.name} />
				{/if}
			</div>

			<div class="space-y-2">
				<label class="block">
					<span class="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Item</span>
					<select
						bind:value={selectedId}
						class="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 focus:border-orange-400/50 focus:outline-none"
					>
						{#each GROUPS as group (group.kind)}
							<optgroup label={group.label}>
								{#each MINTABLE_ITEMS.filter((entry) => entry.kind === group.kind) as entry (entry.id)}
									{@const supply = nftMarket.catalogStats[entry.id]}
									<option value={entry.id}>
										{entry.name} · {supply ? `${supply.minted} / ${supply.cap}` : '…'}
										{supply && supply.minted >= supply.cap ? ' · Sold out' : ''}
									</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</label>

				{#if item && stats}
					<div class="flex flex-wrap gap-1.5 text-[10px]">
						<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300">
							{stats.minted} / {stats.cap} minted
						</span>
						<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300">
							{stats.remaining} left for you
						</span>
						<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300">
							{stats.per_account_cap} per account
						</span>
					</div>
				{/if}

				<p class="text-[10px] leading-snug text-slate-500">{item?.description}</p>

				{#if reason}
					<p class="text-[10px] text-amber-300" role="status">{reason}</p>
				{/if}

				<button
					type="button"
					onclick={submit}
					{disabled}
					class="min-h-11 w-full rounded-lg border border-orange-400/40 bg-orange-500/25 px-3 py-2 text-xs font-semibold tracking-wide text-orange-50 uppercase transition hover:bg-orange-500/35 focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-slate-800/40 disabled:text-slate-500"
				>
					{nftMarket.busy ? 'Minting…' : buttonLabel}
				</button>
			</div>
		</div>
	{/if}
</section>
