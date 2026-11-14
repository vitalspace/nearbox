/** Tipos y constantes del mercado NFT (NEP-245). */

export type TokenMetadata = {
	title?: string | null;
	description?: string | null;
	media?: string | null;
	media_hash?: string | null;
	issued_at?: string | null;
	expires_at?: string | null;
	starts_at?: string | null;
	updated_at?: string | null;
	extra?: string | null;
	reference?: string | null;
	reference_hash?: string | null;
};

export type TokenMetadataInput = {
	title: string;
	description?: string;
	media?: string;
	media_hash?: string;
	extra?: string;
	reference?: string;
	reference_hash?: string;
};

export type MtToken = {
	token_id: string;
	owner_id?: string | null;
	token_metadata?: TokenMetadata | null;
	base_metadata_id: string;
};

export type CatalogExtra = {
	catalogId: string;
	model: string | null;
	accent: string;
	badge: string;
	hot: boolean;
	kind: 'skins' | 'weapons' | 'assets' | 'vehicles' | 'rewards';
};

export type OwnedToken = MtToken & {
	title: string;
	serial: number | null;
	catalog: CatalogExtra | null;
};

export type CatalogSupply = {
	catalog_id: string;
	cap: number;
	minted: number;
	per_account_cap: number;
	account_minted: number;
	remaining: number;
};

export type Sale = {
	seller_id: string;
	token_contract: string;
	token_id: string;
	amount: string;
	price: string;
};

export type Listing = Sale & {
	title: string;
	description?: string | null;
	media?: string | null;
	catalog: CatalogExtra | null;
	serial: number | null;
};

export type MintMode = 'sponsored' | 'self' | 'unavailable';

export type MintResult = {
	hash: string | null;
	tokenId: string;
	sponsored: boolean;
	budgetRemainingYocto?: string;
};

export type RelayerStatus = {
	sponsoredMintAvailable: boolean;
	reason: 'ok' | 'budget' | 'reserve' | 'disabled' | 'error';
	budgetRemainingYocto: string;
	mintDepositYocto: string;
};

export type CatalogMetadataInput = {
	catalog_id: string;
	title: string;
	description: string;
	media: string;
	reference: string;
	extra: string;
};

export type SalesPage = {
	fromIndex?: number;
	limit?: number;
	finality?: 'final' | 'optimistic';
};
