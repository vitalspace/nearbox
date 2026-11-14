/** Store reactivo del mercado NFT dentro de la tienda. */
import {
	MINT_DEPOSIT_YOCTO,
	MIN_MINT_BALANCE_YOCTO,
	RELAYER_FUND_URL,
	isNftConfigured
} from '../near/config.ts';
import { postJson } from '../near/http.ts';
import { getAccountState } from '../near/rpc.ts';
import { formatNear } from '../near/format.ts';
import { MINTABLE_ITEMS } from '../nft/catalog.ts';
import {
	getCatalogSupplies,
	getOwnedTokens,
	getRelayerStatus,
	listForSale,
	mint as mintNft
} from '../nft/collection.ts';
import { describeNftError, isSessionError } from '../nft/errors.ts';
import {
	buy as buyNft,
	cancel as cancelNft,
	getListings,
	getListingsBySeller
} from '../nft/market.ts';
import type { CatalogSupply, Listing, MintMode, OwnedToken, Sale } from '../nft/config.ts';
import { authSession } from './auth.svelte.ts';
import { nftOwnership } from './nftOwnership.svelte.ts';

export type MarketTab = 'browse' | 'owned' | 'listings';

const POLL_MS = 20_000;

class NftMarketStore {
	active = $state(false);
	tab = $state<MarketTab>('browse');
	sales = $state<Listing[]>([]);
	owned = $state<OwnedToken[]>([]);
	listings = $state<Listing[]>([]);
	catalogStats = $state<Record<string, CatalogSupply>>({});
	balanceYocto = $state(0n);
	capacityReached = $state(false);
	mintMode = $state<MintMode>('unavailable');
	sponsoredMintAvailable = $state(false);
	budgetRemainingYocto = $state(0n);
	mintDepositYocto = $state(MINT_DEPOSIT_YOCTO);
	loading = $state(false);
	busy = $state(false);
	error = $state<string | null>(null);
	notice = $state<string | null>(null);
	/** La sesión de Google ya no existe en este navegador: hay que reentrar. */
	needsLogin = $state(false);
	relayerReason = $state<'ok' | 'budget' | 'reserve' | 'disabled' | 'error'>('disabled');

	private timer: number | null = null;

	get configured(): boolean {
		return isNftConfigured();
	}

	get accountId(): string {
		return authSession.accountId;
	}

	get canMint(): boolean {
		return this.mintMode !== 'unavailable';
	}

	setActive(active: boolean): void {
		if (this.active === active) return;

		this.active = active;

		if (active) {
			void this.refresh();
			this.startPolling();
		} else {
			this.stopPolling();
			this.error = null;
			this.notice = null;
		}
	}

	setTab(tab: MarketTab): void {
		this.tab = tab;
		if (this.active) void this.refresh();
	}

	private startPolling(): void {
		this.stopPolling();
		if (typeof window === 'undefined') return;

		this.timer = window.setInterval(() => {
			if (this.active && !this.busy) void this.refresh();
		}, POLL_MS);
	}

	private stopPolling(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private recomputeMintMode(): void {
		if (this.sponsoredMintAvailable) {
			this.mintMode = 'sponsored';
			this.capacityReached = false;
			return;
		}

		if (this.balanceYocto >= MIN_MINT_BALANCE_YOCTO) {
			this.mintMode = 'self';
			this.capacityReached = false;
			return;
		}

		this.mintMode = 'unavailable';
		this.capacityReached = true;
	}

	async refreshStatus(): Promise<void> {
		const status = await getRelayerStatus();
		this.sponsoredMintAvailable = status.sponsoredMintAvailable;
		this.relayerReason = status.reason;
		this.budgetRemainingYocto = BigInt(status.budgetRemainingYocto || '0');
		this.mintDepositYocto = BigInt(status.mintDepositYocto || MINT_DEPOSIT_YOCTO.toString());
		this.recomputeMintMode();
	}

	async refresh(): Promise<void> {
		if (!isNftConfigured()) {
			this.error = 'Market is not configured';
			return;
		}

		this.loading = true;
		const accountId = authSession.accountId;
		const catalogIds = MINTABLE_ITEMS.map((item) => item.id);

		const [account, owned, supplies, sales, listings, status] = await Promise.allSettled([
			accountId
				? getAccountState(accountId, 'optimistic')
				: Promise.resolve({ exists: false } as const),
			accountId ? getOwnedTokens(accountId, 0, 100, 'optimistic') : Promise.resolve([]),
			accountId ? getCatalogSupplies(catalogIds, accountId, 'optimistic') : Promise.resolve([]),
			getListings(0, 50, 'optimistic'),
			accountId ? getListingsBySeller(accountId, 0, 50, 'optimistic') : Promise.resolve([]),
			getRelayerStatus()
		]);

		if (account.status === 'fulfilled' && account.value.exists) {
			this.balanceYocto = BigInt(account.value.balanceYocto);
		} else {
			this.balanceYocto = 0n;
		}

		if (owned.status === 'fulfilled') {
			this.owned = owned.value;

			if (accountId) {
				nftOwnership.setFromTokens(accountId, owned.value);
			}
		}

		if (sales.status === 'fulfilled') this.sales = sales.value;
		if (listings.status === 'fulfilled') this.listings = listings.value;

		if (supplies.status === 'fulfilled') {
			this.catalogStats = Object.fromEntries(
				supplies.value.map((supply) => [supply.catalog_id, supply])
			);
		}

		if (status.status === 'fulfilled') {
			this.sponsoredMintAvailable = status.value.sponsoredMintAvailable;
			this.relayerReason = status.value.reason;
			this.budgetRemainingYocto = BigInt(status.value.budgetRemainingYocto || '0');
			this.mintDepositYocto = BigInt(
				status.value.mintDepositYocto || MINT_DEPOSIT_YOCTO.toString()
			);
		}

		this.recomputeMintMode();
		this.loading = false;
	}

	private begin(): boolean {
		if (this.busy) return false;
		this.busy = true;
		this.error = null;
		this.notice = null;
		this.needsLogin = false;
		return true;
	}

	private finish(): void {
		this.busy = false;
	}

	/** Reabre el popup de Google y revalida la cuenta antes de reintentar. */
	async reconnect(): Promise<void> {
		if (this.busy) return;

		this.busy = true;
		this.error = null;
		this.notice = null;
		this.needsLogin = false;

		try {
			await authSession.login();
			this.notice = 'Signed in again. You can keep minting.';
			await this.refresh();
		} catch (cause) {
			this.error = describeNftError(cause);
			this.needsLogin = isSessionError(cause);
		} finally {
			this.busy = false;
		}
	}

	async mint(catalogId: string): Promise<void> {
		if (!this.begin()) return;

		const item = MINTABLE_ITEMS.find((entry) => entry.id === catalogId);
		const accountId = authSession.accountId;

		try {
			if (!accountId) throw new Error('Sign in with Google before minting.');

			const result = await mintNft(accountId, catalogId);
			const serial = result.tokenId.includes('#') ? result.tokenId.split('#').pop() : null;
			this.notice = result.sponsored
				? `Free mint complete: ${item?.name ?? catalogId}${serial ? ` #${serial}` : ''}.`
				: `Minted ${item?.name ?? catalogId} with your NEAR balance.`;
			await this.refresh();
		} catch (cause) {
			this.error = describeNftError(cause);
			this.needsLogin = isSessionError(cause);
			await this.refreshStatus().catch(() => undefined);
		} finally {
			this.finish();
		}
	}

	async list(tokenId: string, priceYocto: bigint): Promise<void> {
		if (!this.begin()) return;

		try {
			if (!authSession.accountId) throw new Error('Sign in with Google before selling.');
			await listForSale(authSession.accountId, tokenId, priceYocto);
			this.notice = `Listed ${tokenId} for ${formatNear(priceYocto)}.`;
			await this.refresh();
		} catch (cause) {
			this.error = describeNftError(cause);
			this.needsLogin = isSessionError(cause);
		} finally {
			this.finish();
		}
	}

	async buy(sale: Sale): Promise<void> {
		if (!this.begin()) return;

		try {
			if (!authSession.accountId) throw new Error('Sign in with Google before buying.');
			await buyNft(authSession.accountId, sale);
			this.notice = `Bought ${sale.token_id} for ${formatNear(sale.price)}.`;
			await this.refresh();
		} catch (cause) {
			this.error = describeNftError(cause);
			this.needsLogin = isSessionError(cause);
		} finally {
			this.finish();
		}
	}

	async cancel(sale: Sale): Promise<void> {
		if (!this.begin()) return;

		try {
			if (!authSession.accountId) throw new Error('Sign in with Google before cancelling.');
			await cancelNft(authSession.accountId, sale);
			this.notice = `Cancelled the listing for ${sale.token_id}.`;
			await this.refresh();
		} catch (cause) {
			this.error = describeNftError(cause);
			this.needsLogin = isSessionError(cause);
		} finally {
			this.finish();
		}
	}

	async fund(): Promise<void> {
		if (!this.begin()) return;

		try {
			const accountId = authSession.accountId;
			const publicKey = authSession.publicKey;
			if (!accountId || !publicKey) throw new Error('Sign in with Google first.');

			const result = await postJson<{
				hash: string | null;
				amountYocto: string;
				alreadyFunded: boolean;
			}>(RELAYER_FUND_URL, { accountId, publicKey }, (status) => `The faucet failed (${status}).`);

			this.notice = result.alreadyFunded
				? 'This wallet already has enough testnet NEAR.'
				: `Received ${formatNear(result.amountYocto)} from the testnet faucet.`;
			await this.refresh();
		} catch (cause) {
			this.error = describeNftError(cause);
			this.needsLogin = isSessionError(cause);
		} finally {
			this.finish();
		}
	}
}

export const nftMarket = new NftMarketStore();
