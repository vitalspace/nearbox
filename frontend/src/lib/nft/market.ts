/** Lecturas y escrituras del marketplace de escrow. */
import { MARKET_CALL_GAS, MARKET_CONTRACT_ID, isNftConfigured } from '../near/config.ts';
import { view, viewArray, type Finality } from '../near/rpc.ts';
import { callMethod } from '../near/tx.ts';
import { catalogFromMetadata, catalogItemById, tokenSerial } from './catalog.ts';
import type { Listing, Sale, TokenMetadata } from './config.ts';

function requireConfig(): void {
	if (!isNftConfigured()) throw new Error('Market is not configured');
}

export async function getSales(
	fromIndex = 0,
	limit = 50,
	finality: Finality = 'final'
): Promise<Sale[]> {
	if (!isNftConfigured()) return [];

	return await viewArray<Sale>(
		MARKET_CONTRACT_ID,
		'get_sales',
		{ from_index: fromIndex, limit },
		finality
	);
}

export async function getSale(
	tokenContract: string,
	tokenId: string,
	finality: Finality = 'final'
): Promise<Sale | null> {
	if (!isNftConfigured()) return null;

	return await view<Sale | null>(
		MARKET_CONTRACT_ID,
		'get_sale',
		{ token_contract: tokenContract, token_id: tokenId },
		finality
	);
}

export async function getSalesBySeller(
	sellerId: string,
	fromIndex = 0,
	limit = 50,
	finality: Finality = 'final'
): Promise<Sale[]> {
	if (!isNftConfigured()) return [];

	return await viewArray<Sale>(
		MARKET_CONTRACT_ID,
		'get_sales_by_seller',
		{ seller_id: sellerId, from_index: fromIndex, limit },
		finality
	);
}

export async function getSalesByContract(
	tokenContract: string,
	fromIndex = 0,
	limit = 50,
	finality: Finality = 'final'
): Promise<Sale[]> {
	if (!isNftConfigured()) return [];

	return await viewArray<Sale>(
		MARKET_CONTRACT_ID,
		'get_sales_by_contract',
		{ token_contract: tokenContract, from_index: fromIndex, limit },
		finality
	);
}

export function saleKey(sale: Sale): string {
	return `${sale.token_contract}|${sale.token_id}`;
}

async function decorate(sales: Sale[], finality: Finality): Promise<Listing[]> {
	if (sales.length === 0) return [];

	const byContract = new Map<string, string[]>();

	for (const sale of sales) {
		const ids = byContract.get(sale.token_contract) ?? [];
		ids.push(sale.token_id);
		byContract.set(sale.token_contract, ids);
	}

	const metadata = new Map<string, TokenMetadata>();

	await Promise.all(
		[...byContract.entries()].map(async ([contractId, tokenIds]) => {
			try {
				const values = await viewArray<TokenMetadata>(
					contractId,
					'mt_metadata_token_by_token_id',
					{ token_ids: tokenIds },
					finality
				);

				tokenIds.forEach((tokenId, index) => {
					const value = values[index];
					if (value) metadata.set(`${contractId}|${tokenId}`, value);
				});
			} catch {
				// Un fallo de metadata no debe ocultar la venta.
			}
		})
	);

	return sales.map((sale) => {
		const meta = metadata.get(`${sale.token_contract}|${sale.token_id}`) ?? null;
		const catalog = catalogFromMetadata(meta);
		const item =
			catalogItemById(catalog?.catalogId ?? '') ??
			catalogItemById(sale.token_id.split('#')[0] ?? '');
		const serial = tokenSerial(sale.token_id);

		return {
			...sale,
			title: meta?.title?.trim() || item?.name || `Token ${sale.token_id}`,
			description: meta?.description ?? null,
			media: meta?.media ?? null,
			catalog,
			serial
		};
	});
}

export async function getListings(
	fromIndex = 0,
	limit = 50,
	finality: Finality = 'final'
): Promise<Listing[]> {
	return await decorate(await getSales(fromIndex, limit, finality), finality);
}

export async function getListingsBySeller(
	sellerId: string,
	fromIndex = 0,
	limit = 50,
	finality: Finality = 'final'
): Promise<Listing[]> {
	return await decorate(await getSalesBySeller(sellerId, fromIndex, limit, finality), finality);
}

export async function buy(accountId: string, sale: Sale): Promise<{ hash: string | null }> {
	requireConfig();

	return await callMethod(
		accountId,
		MARKET_CONTRACT_ID,
		'buy',
		{ token_contract: sale.token_contract, token_id: sale.token_id },
		{ gas: MARKET_CALL_GAS, deposit: BigInt(sale.price) }
	);
}

export async function cancel(accountId: string, sale: Sale): Promise<{ hash: string | null }> {
	requireConfig();

	return await callMethod(
		accountId,
		MARKET_CONTRACT_ID,
		'cancel',
		{ token_contract: sale.token_contract, token_id: sale.token_id },
		{ gas: MARKET_CALL_GAS }
	);
}
