/** Traducción de errores del contrato NFT y del market. */

const MESSAGES: Array<[RegExp, string]> = [
	[/Not enough deposit to cover storage/i, 'Not enough NEAR attached to cover the NFT storage.'],
	[/Catalog metadata is missing/i, 'This catalog item has no metadata on-chain yet.'],
	[/Catalog item is not enabled/i, 'This item is not enabled for minting.'],
	[/Mint limit reached for this item/i, 'This item is sold out.'],
	[/Account mint limit reached/i, 'You reached your mint limit for this item.'],
	[/Sale not found/i, 'That listing no longer exists. Refresh the market.'],
	[/Seller cannot buy their own token/i, 'This is your own listing.'],
	[/Not enough NEAR attached/i, 'You need more NEAR to buy this NFT.'],
	[/This token is already listed/i, 'This NFT is already listed for sale.'],
	[/Token contract is not allowed/i, 'This NFT contract is not allowed in the market.'],
	[/Only the seller can cancel this sale/i, 'Only the seller can cancel this listing.'],
	[/Not enough balance for token/i, 'You no longer own that NFT.'],
	[
		/UNKNOWN_ACCOUNT|does not exist while viewing/i,
		'Your NEAR account does not exist yet. Mint once to create it.'
	],
	[/429|too many requests|rate.?limit/i, 'Too many requests. Wait a minute and try again.'],
	[/Testnet funds are running low/i, 'Testnet funds are running low. Try again later.'],
	[/sponsored mint budget/i, 'The free mint budget is exhausted. Pay with your own NEAR instead.'],
	[
		/USER_NOT_LOGGED_IN|session expired|not logged in|invalid or expired/i,
		'Your session expired. Sign in again to continue.'
	],
	[/Failed to fetch|NetworkError|load failed/i, "Couldn't reach the server. Check your connection."]
];

function rawMessage(cause: unknown): string {
	return cause instanceof Error
		? cause.message
		: typeof cause === 'string'
			? cause
			: JSON.stringify(cause);
}

/** La sesión de login se perdió: hay que volver a entrar antes de firmar. */
export function isSessionError(cause: unknown): boolean {
	return /USER_NOT_LOGGED_IN|session expired|not logged in|invalid or expired/i.test(rawMessage(cause));
}

export function describeNftError(cause: unknown): string {
	const raw = rawMessage(cause);

	for (const [pattern, message] of MESSAGES) {
		if (pattern.test(raw)) return message;
	}

	const first = raw.split('\n')[0].split(' at ')[0];
	return first.length > 240 ? `${first.slice(0, 240)}…` : first;
}
