<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { formatNear, shortAccount } from '../../near/format.ts';
	import { explorerAccountUrl } from '../../near/rpc.ts';
	import { MARKET_CONTRACT_ID } from '../../near/config.ts';
	import { mintableCatalogItemById, type MintableCatalogItem } from '../../nft/catalog.ts';
	import { equipCatalogItem, isCatalogItemEquipped } from '../../nft/equip.ts';
	import { authSession } from '../../state/auth.svelte.ts';
	import { nftMarket } from '../../state/nftMarket.svelte.ts';
	import ListForSaleForm from './ListForSaleForm.svelte';
	import MarketBalance from './MarketBalance.svelte';
	import MarketTabs from './MarketTabs.svelte';
	import MintNftForm from './MintNftForm.svelte';
	import NftCard from './NftCard.svelte';
	import ReconnectSession from './ReconnectSession.svelte';

	let sellingId = $state<string | null>(null);

	const accountId = $derived(authSession.accountId);

	function cancelListing(sale: (typeof nftMarket.listings)[number]): void {
		if (!window.confirm(`Cancel the listing for ${sale.token_id}?`)) return;
		void nftMarket.cancel(sale);
	}

	function tokenItem(token: (typeof nftMarket.owned)[number]): MintableCatalogItem | null {
		return mintableCatalogItemById(token.catalog?.catalogId ?? token.base_metadata_id);
	}

	function equipLabel(item: MintableCatalogItem): string {
		if (isCatalogItemEquipped(item)) return 'Equipped';
		return item.kind === 'skins' ? 'Equip skin' : 'Equip';
	}
</script>

<div class="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="min-w-0">
			<h3 class="text-sm font-bold text-orange-50">Village Market</h3>
			<p class="truncate text-[10px] text-slate-500">
				NEP-245 escrow · {shortAccount(MARKET_CONTRACT_ID)}
			</p>
		</div>

		<div class="flex items-center gap-1.5">
			<button
				type="button"
				onclick={() => nftMarket.refresh()}
				disabled={nftMarket.loading || nftMarket.busy}
				class="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
				aria-label="Refresh the market"
			>
				<RefreshCw size={15} class={nftMarket.loading ? 'animate-spin' : ''} aria-hidden="true" />
			</button>

			{#if MARKET_CONTRACT_ID}
				<a
					href={explorerAccountUrl(MARKET_CONTRACT_ID)}
					target="_blank"
					rel="noreferrer"
					class="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
					aria-label="Open the market contract in the explorer"
				>
					<ExternalLink size={15} aria-hidden="true" />
				</a>
			{/if}
		</div>
	</div>

	<MarketBalance />

	<MarketTabs active={nftMarket.tab} onSelect={(tab) => nftMarket.setTab(tab)} />

	{#if !nftMarket.configured}
		<p
			class="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"
		>
			Market is not configured
		</p>
	{/if}

	{#if nftMarket.error}
		<p
			role="alert"
			class="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
		>
			{nftMarket.error}
		</p>
		<ReconnectSession />
	{/if}

	{#if nftMarket.notice}
		<p
			role="status"
			aria-live="polite"
			class="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200"
		>
			{nftMarket.notice}
		</p>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto pr-0.5">
		{#if nftMarket.tab === 'browse'}
			<div role="tabpanel" id="market-panel-browse" aria-labelledby="market-tab-browse">
				{#if nftMarket.loading && nftMarket.sales.length === 0}
					<p class="py-6 text-center text-xs text-slate-500">Loading listings…</p>
				{:else if nftMarket.sales.length === 0}
					<p class="py-6 text-center text-xs text-slate-500">
						No NFTs are listed yet. Mint one and be the first seller.
					</p>
				{:else}
					<ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each nftMarket.sales as sale (sale.token_contract + sale.token_id)}
							{@const mine = sale.seller_id === accountId}
							<li>
								<NftCard
									title={sale.title}
									serial={sale.serial}
									catalog={sale.catalog}
									metadata={{ title: sale.title, description: sale.description, media: sale.media }}
									subtitle={`Seller ${shortAccount(sale.seller_id)}`}
									priceLabel={formatNear(sale.price)}
									chip={mine ? 'Your listing' : 'For sale'}
									chipClass={mine
										? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
										: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'}
									actionLabel={mine ? undefined : 'Buy'}
									onAction={mine ? undefined : () => nftMarket.buy(sale)}
									actionDisabled={nftMarket.busy || !accountId}
								/>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else if nftMarket.tab === 'owned'}
			<div
				role="tabpanel"
				id="market-panel-owned"
				aria-labelledby="market-tab-owned"
				class="space-y-2"
			>
				<MintNftForm />

				{#if nftMarket.owned.length === 0}
					<p class="py-4 text-center text-xs text-slate-500">
						You do not own any NFTs yet. Mint one above.
					</p>
				{:else}
					<ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each nftMarket.owned as token (token.token_id)}
							{@const item = tokenItem(token)}
							{@const equipped = item ? isCatalogItemEquipped(item) : false}
							<li>
								<NftCard
									title={token.title}
									serial={token.serial}
									catalog={token.catalog}
									metadata={token.token_metadata}
									subtitle={token.token_id}
									chip={equipped ? 'Equipped' : 'Owned'}
									chipClass={equipped
										? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
										: undefined}
									actionLabel={sellingId === token.token_id ? 'Close' : 'Sell'}
									onAction={() =>
										(sellingId = sellingId === token.token_id ? null : token.token_id)}
									actionDisabled={nftMarket.busy}
									secondaryLabel={item ? equipLabel(item) : undefined}
									secondaryDisabled={!item || equipped || nftMarket.busy}
									onSecondary={item ? () => equipCatalogItem(item) : undefined}
								/>
								{#if sellingId === token.token_id}
									<ListForSaleForm tokenId={token.token_id} onClose={() => (sellingId = null)} />
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			<div role="tabpanel" id="market-panel-listings" aria-labelledby="market-tab-listings">
				{#if nftMarket.listings.length === 0}
					<p class="py-6 text-center text-xs text-slate-500">
						You have no active listings. Sell an NFT from My NFTs.
					</p>
				{:else}
					<ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each nftMarket.listings as sale (sale.token_contract + sale.token_id)}
							<li>
								<NftCard
									title={sale.title}
									serial={sale.serial}
									catalog={sale.catalog}
									metadata={{ title: sale.title, description: sale.description, media: sale.media }}
									subtitle={`Escrowed · ${formatNear(sale.price)}`}
									priceLabel={formatNear(sale.price)}
									chip="Escrowed"
									chipClass="border-amber-300/40 bg-amber-400/15 text-amber-200"
									actionLabel="Cancel"
									onAction={() => cancelListing(sale)}
									actionDisabled={nftMarket.busy}
								/>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>
</div>
