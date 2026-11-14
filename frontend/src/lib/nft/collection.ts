/** Lecturas y escrituras del contrato NFT NEP-245. */
import {
	LIST_DEPOSIT_YOCTO,
	LIST_GAS,
	MARKET_CONTRACT_ID,
	MINT_DEPOSIT_YOCTO,
	MINT_GAS,
	NFT_CONTRACT_ID,
	RELAYER_SPONSOR_MINT_URL,
	RELAYER_STATUS_URL,
	isNftConfigured
} from '../near/config.ts';
import { getJson, HttpError, postJson } from '../near/http.ts';
import { view, viewArray, type Finality } from '../near/rpc.ts';
import { callMethod } from '../near/tx.ts';
import {
	catalogFromMetadata,
	catalogIdFromToken,
	catalogItemById,
	tokenSerial
} from './catalog.ts';
import type {
	CatalogExtra,
	CatalogSupply,
	MintResult,
	MtToken,
	OwnedToken,
	RelayerStatus,
	TokenMetadata
} from './config.ts';

function requireConfig(): void {
	if (!isNftConfigured()) {
		throw new Error('Market is not configured');
	}
}

function decorateToken(token: MtToken): OwnedToken {
	const catalog: CatalogExtra | null = catalogFromMetadata(token.token_metadata);
	const catalogItem = catalogItemById(token.base_metadata_id);
	const title =
		token.token_metadata?.title?.trim() ||
		catalogItem?.name ||
		token.base_metadata_id ||
		token.token_id;

	return {
		...token,
		title,
		serial: tokenSerial(token.token_id),
		catalog
	};
}

export async function getOwnedTokens(
	accountId: string,
	fromIndex = 0,
	limit = 100,
	finality: Finality = 'final'
): Promise<OwnedToken[]> {
	if (!isNftConfigured() || !accountId) return [];

	const tokens = await viewArray<MtToken>(
		NFT_CONTRACT_ID,
		'mt_tokens_for_owner',
		{
			account_id: accountId,
			from_index: fromIndex > 0 ? String(fromIndex) : null,
			limit
		},
		finality
	);

	return tokens.map(decorateToken);
}

export async function getTokenMetadata(
	tokenIds: string[],
	finality: Finality = 'final'
): Promise<TokenMetadata[]> {
	if (!isNftConfigured() || tokenIds.length === 0) return [];

	return await viewArray<TokenMetadata>(
		NFT_CONTRACT_ID,
		'mt_metadata_token_by_token_id',
		{ token_ids: tokenIds },
		finality
	);
}

type CatalogSupplyView = {
	catalog_id: string;
	cap: number;
	minted: number;
	per_account_cap: number;
};

export async function getCatalogSupplies(
	catalogIds: string[],
	accountId: string,
	finality: Finality = 'final'
): Promise<CatalogSupply[]> {
	if (!isNftConfigured() || catalogIds.length === 0) return [];

	const [global, minted] = await Promise.all([
		viewArray<CatalogSupplyView>(
			NFT_CONTRACT_ID,
			'get_catalog_supplies',
			{ catalog_ids: catalogIds },
			finality
		),
		viewArray<number>(
			NFT_CONTRACT_ID,
			'get_account_minted',
			{ account_id: accountId, catalog_ids: catalogIds },
			finality
		)
	]);

	return global.map((supply, index) => {
		const accountMinted = minted[index] ?? 0;
		const globalRemaining = Math.max(0, supply.cap - supply.minted);
		const accountRemaining =
			supply.per_account_cap > 0
				? Math.max(0, supply.per_account_cap - accountMinted)
				: globalRemaining;

		return {
			catalog_id: supply.catalog_id,
			cap: supply.cap,
			minted: supply.minted,
			per_account_cap: supply.per_account_cap,
			account_minted: accountMinted,
			remaining: Math.min(globalRemaining, accountRemaining)
		};
	});
}

export async function balanceOf(
	accountId: string,
	tokenId: string,
	finality: Finality = 'final'
): Promise<bigint> {
	if (!isNftConfigured()) return 0n;

	const value = await view<string>(
		NFT_CONTRACT_ID,
		'mt_balance_of',
		{ account_id: accountId, token_id: tokenId },
		finality
	);
	return BigInt(value);
}

export async function getRelayerStatus(): Promise<RelayerStatus> {
	try {
		return await getJson<RelayerStatus>(RELAYER_STATUS_URL, 'The relayer status is unavailable');
	} catch {
		return {
			sponsoredMintAvailable: false,
			reason: 'error',
			budgetRemainingYocto: '0',
			mintDepositYocto: MINT_DEPOSIT_YOCTO.toString()
		};
	}
}

export async function sponsorMint(
	accountId: string,
	publicKey: string,
	catalogId: string,
	requestId: string
): Promise<MintResult> {
	const { getIdentityToken } = await import('../near/auth.ts');
	const token = await getIdentityToken();

	if (!token) {
		throw new HttpError('No Google session token available', 401);
	}

	const response = await postJson<{
		tokenId: string;
		serial: number;
		sponsored: true;
		budgetRemainingYocto: string;
	}>(
		RELAYER_SPONSOR_MINT_URL,
		{
			accountId,
			publicKey,
			catalogId,
			token,
			request_id: requestId
		},
		(status) => `The free mint failed (${status}).`
	);

	return {
		hash: null,
		tokenId: response.tokenId,
		sponsored: true,
		budgetRemainingYocto: response.budgetRemainingYocto
	};
}

/**
 * Mintea un NFT. Primero intenta el mint patrocinado (sin popup) y, si el
 * backend responde 401/429/503, cae a autopago firmado por la MPC.
 */
export async function mint(accountId: string, catalogId: string): Promise<MintResult> {
	requireConfig();

	const auth = await import('../near/auth.ts');
	const publicKey = await auth.getPublicKey();

	await auth.ensureOnChainAccount(accountId, publicKey);

	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		try {
			return await sponsorMint(accountId, publicKey, catalogId, crypto.randomUUID());
		} catch (cause) {
			const status = cause instanceof HttpError ? cause.status : 0;
			if (status !== 401 && status !== 429 && status !== 503) throw cause;
		}
	}

	const result = await callMethod(
		accountId,
		NFT_CONTRACT_ID,
		'mint',
		{ owner_id: null, catalog_id: catalogId },
		{ gas: MINT_GAS, deposit: MINT_DEPOSIT_YOCTO }
	);

	return { hash: result.hash, tokenId: '', sponsored: false };
}

export async function listForSale(
	accountId: string,
	tokenId: string,
	priceYocto: bigint
): Promise<{ hash: string | null }> {
	requireConfig();

	return await callMethod(
		accountId,
		NFT_CONTRACT_ID,
		'mt_transfer_call',
		{
			receiver_id: MARKET_CONTRACT_ID,
			token_id: tokenId,
			amount: '1',
			approval: null,
			memo: null,
			msg: JSON.stringify({ price: priceYocto.toString() })
		},
		{ gas: LIST_GAS, deposit: LIST_DEPOSIT_YOCTO }
	);
}

export function catalogIdOf(tokenId: string): string {
	return catalogIdFromToken(tokenId);
}
