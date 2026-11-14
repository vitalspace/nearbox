/**
 * Consulta on-chain de los NFTs de recompensa que posee una cuenta.
 *
 * La posesión es la única puerta de las misiones avanzadas y se re-verifica en
 * cada lectura de progreso y en cada reclamo. Fail-closed: si el RPC no
 * responde se lanza `OwnershipUnavailableError` y el llamador decide (la UI
 * muestra `Locked`, el claim queda pendiente).
 */

const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.testnet.fastnear.com';
const NFT_CONTRACT_ID = process.env.NFT_CONTRACT_ID || '';

export type OwnedToken = {
	tokenId: string;
	catalogId: string;
	serial: number | null;
};

export class OwnershipUnavailableError extends Error {
	readonly status = 503;
	readonly code = 'OWNERSHIP_UNVERIFIED';

	constructor(message = 'Could not verify NFT ownership') {
		super(message);
		this.name = 'OwnershipUnavailableError';
	}
}

type TokenView = {
	token_id?: string;
	owner_id?: string | null;
	base_metadata_id?: string;
	token_metadata?: { extra?: string | null } | null;
};

function catalogIdOf(token: TokenView): string | null {
	if (typeof token.base_metadata_id === 'string' && token.base_metadata_id.length > 0) {
		return token.base_metadata_id;
	}

	// Respaldo por si el contrato devuelve solo `token_id` (`<catalog>#<serial>`).
	if (typeof token.token_id === 'string' && token.token_id.includes('#')) {
		return token.token_id.split('#')[0] ?? null;
	}

	return null;
}

async function viewFunction<T>(method: string, args: Record<string, unknown>): Promise<T> {
	if (!NFT_CONTRACT_ID) {
		throw new OwnershipUnavailableError('NFT_CONTRACT_ID is not configured');
	}

	let response: Response;

	try {
		response = await fetch(RPC_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 'runworld-progression',
				method: 'query',
				params: {
					request_type: 'call_function',
					finality: 'final',
					account_id: NFT_CONTRACT_ID,
					method_name: method,
					args_base64: Buffer.from(JSON.stringify(args)).toString('base64')
				}
			})
		});
	} catch (cause) {
		throw new OwnershipUnavailableError(
			cause instanceof Error ? cause.message : 'Could not reach the NEAR RPC'
		);
	}

	if (!response.ok) {
		throw new OwnershipUnavailableError(`The NEAR RPC responded with HTTP ${response.status}`);
	}

	const payload = (await response.json()) as {
		result?: { result?: number[] };
		error?: { message?: string };
	};

	if (payload.error || !payload.result?.result) {
		throw new OwnershipUnavailableError(
			payload.error?.message ?? 'The NFT contract returned an empty response'
		);
	}

	const text = Buffer.from(payload.result.result).toString('utf8');

	try {
		return JSON.parse(text) as T;
	} catch {
		throw new OwnershipUnavailableError('The NFT contract returned invalid JSON');
	}
}

/** Tokens de recompensa que posee `accountId`, paginados. */
export async function ownedRewardTokens(accountId: string): Promise<OwnedToken[]> {
	const tokens: OwnedToken[] = [];
	const limit = 100;

	for (let from = 0; from < 500; from += limit) {
		const page = await viewFunction<TokenView[]>('mt_tokens_for_owner', {
			account_id: accountId,
			// El contrato espera `Option<U128>`: `null` para la primera página.
			from_index: from === 0 ? null : String(from),
			limit
		});

		for (const token of page) {
			const catalogId = catalogIdOf(token);

			if (!catalogId || typeof token.token_id !== 'string') {
				continue;
			}

			const serial = Number(token.token_id.split('#')[1]);

			tokens.push({
				tokenId: token.token_id,
				catalogId,
				serial: Number.isFinite(serial) ? serial : null
			});
		}

		if (page.length < limit) {
			break;
		}
	}

	return tokens;
}

const OWNERSHIP_TTL_MS = 30_000;

type OwnershipCacheEntry = { at: number; tokens: OwnedToken[] };

const ownershipCache = new Map<string, OwnershipCacheEntry>();

/**
 * Posesión cacheada 30 s por cuenta (§11.7). Los reclamos y `GET /progression`
 * comparten la misma entrada para no duplicar lecturas del RPC.
 */
export async function ownedRewardTokensFor(
	accountId: string,
	options: { force?: boolean; now?: number } = {}
): Promise<OwnedToken[]> {
	const now = options.now ?? Date.now();

	if (!options.force) {
		const cached = ownershipCache.get(accountId);

		if (cached && now - cached.at < OWNERSHIP_TTL_MS) {
			return cached.tokens;
		}
	}

	const tokens = await ownedRewardTokens(accountId);
	ownershipCache.set(accountId, { at: now, tokens });

	return tokens;
}

export function clearOwnershipCache(accountId?: string): void {
	if (accountId) {
		ownershipCache.delete(accountId);
		return;
	}

	ownershipCache.clear();
}

export async function ownedCatalogIdsFor(accountId: string): Promise<string[]> {
	const tokens = await ownedRewardTokensFor(accountId);
	return [...new Set(tokens.map((token) => token.catalogId))];
}
