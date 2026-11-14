import { browser } from '$app/env';
import { catalogIdFromToken } from '../nft/catalog.ts';
import { getOwnedTokens } from '../nft/collection.ts';
import type { OwnedToken } from '../nft/config.ts';
import { isNftConfigured } from '../near/config.ts';
import { playerProfile } from './playerProfile.svelte.ts';

/**
 * Inventario NFT del jugador.
 *
 * La cadena sigue siendo la fuente de verdad, pero el mercado solo sondea
 * mientras la tienda está abierta. Este store cachea los `catalog_id` propiedad
 * del jugador en `localStorage` para que el equipado siga funcionando al
 * arrancar el juego y refresca en segundo plano cuando hay sesión.
 */

export type NftOwnershipCache = {
	version: 1;
	accountId: string;
	catalogIds: string[];
};

const STORAGE_KEY = 'rw:nft-owned:v1';

function readCache(): NftOwnershipCache | null {
	if (!browser) return null;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;

		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) return null;

		const record = value as Record<string, unknown>;
		if (record.version !== 1 || typeof record.accountId !== 'string') return null;

		const catalogIds = Array.isArray(record.catalogIds)
			? record.catalogIds.filter((id): id is string => typeof id === 'string')
			: [];

		return { version: 1, accountId: record.accountId, catalogIds };
	} catch {
		return null;
	}
}

function writeCache(accountId: string, catalogIds: readonly string[]): void {
	if (!browser || !accountId) return;

	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				version: 1,
				accountId,
				catalogIds: [...catalogIds]
			} satisfies NftOwnershipCache)
		);
	} catch {
		// Sin almacenamiento disponible: el inventario on-chain sigue funcionando.
	}
}

class NftOwnershipStore {
	accountId = $state('');
	catalogIds = $state<string[]>([]);
	loading = $state(false);

	private refreshedFor = '';

	private readonly refreshedListeners = new Set<(catalogIds: readonly string[]) => void>();

	/** Se llama tras un refresco autoritativo del inventario desde la cadena. */
	onRefreshed(listener: (catalogIds: readonly string[]) => void): () => void {
		this.refreshedListeners.add(listener);

		return () => this.refreshedListeners.delete(listener);
	}

	/** Carga la caché local antes de que Auth0 termine. */
	init(): void {
		const cached = readCache();
		if (cached) {
			this.accountId = cached.accountId;
			this.apply(cached.catalogIds);
		}
	}

	/** Cambia de cuenta sin perder la caché de la cuenta anterior. */
	setAccount(accountId: string): void {
		if (this.accountId === accountId) {
			void this.refresh();
			return;
		}

		this.accountId = accountId;
		this.refreshedFor = '';

		if (!accountId) {
			this.apply([]);
			return;
		}

		const cached = readCache();
		this.apply(cached?.accountId === accountId ? cached.catalogIds : []);
		void this.refresh();
	}

	/** Usado por el mercado tras su refresco: evita duplicar la lectura RPC. */
	setFromTokens(accountId: string, tokens: readonly OwnedToken[]): void {
		if (!accountId) return;

		this.accountId = accountId;
		this.refreshedFor = accountId;
		this.apply(
			tokens.map((token) => token.catalog?.catalogId ?? catalogIdFromToken(token.token_id))
		);

		for (const listener of this.refreshedListeners) {
			listener(this.catalogIds);
		}
	}

	owns(catalogId: string): boolean {
		return this.catalogIds.includes(catalogId);
	}

	count(catalogId: string): number {
		return this.catalogIds.filter((id) => id === catalogId).length;
	}

	async refresh(force = false): Promise<void> {
		const accountId = this.accountId;

		if (!accountId || !isNftConfigured() || this.loading) return;
		if (!force && this.refreshedFor === accountId) return;

		this.loading = true;

		try {
			const tokens = await getOwnedTokens(accountId, 0, 100, 'optimistic');
			if (this.accountId === accountId) {
				this.setFromTokens(accountId, tokens);
			}
		} catch {
			// Sin RPC se conserva la última caché: el equipado no se rompe.
		} finally {
			this.loading = false;
		}
	}

	private apply(catalogIds: readonly string[]): void {
		this.catalogIds = [...new Set(catalogIds)];
		writeCache(this.accountId, this.catalogIds);
		playerProfile.syncNftSkins(this.catalogIds);
	}
}

export const nftOwnership = new NftOwnershipStore();
