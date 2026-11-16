/**
 * Login con wallet NEAR (SPEC-047).
 *
 * Añade una segunda puerta de entrada al juego, pensada para jugadores que ya
 * tienen cuenta en testnet y para cuando el cliente Auth0 de FastAuth no puede
 * usarse con el dominio de producción.
 *
 * Flujo:
 *   1. `@near-wallet-selector` conecta Meteor Wallet.
 *   2. `signMessage` (NEP-413) firma un mensaje con timestamp.
 *   3. El backend valida firma + access key y devuelve un token de sesión.
 *   4. Ese token (`wbs1.…`) se usa igual que el JWT de Auth0 en stats,
 *      progresión y reclamo de recompensas.
 *
 * Los NFT de misión los mintea el relayer a la cuenta de la wallet: el jugador
 * los ve en su propio wallet sin pagar gas.
 */
import { browser } from '$app/env';
import { Buffer } from 'buffer';
import {
	NEAR_NETWORK_ID,
	NEAR_RPC_URL,
	NFT_CONTRACT_ID,
	WALLET_AUTH_RECIPIENT,
	WALLET_AUTH_URL
} from './config.ts';
import { postJson } from './http.ts';

export type WalletModuleId = 'meteor-wallet';

export type WalletAccount = {
	accountId: string;
	/** Clave con la que se firmó el NEP-413. */
	publicKey: string;
	moduleId: WalletModuleId;
};

type WalletModule = {
	id: string;
	signIn: (params: {
		contractId?: string;
		methodNames?: string[];
	}) => Promise<Array<{ accountId: string }>>;
	signOut: () => Promise<void>;
	getAccounts: () => Promise<Array<{ accountId: string; publicKey?: string }>>;
	signMessage?: (params: {
		message: string;
		recipient: string;
		nonce: Buffer;
		callbackUrl?: string;
	}) => Promise<{ accountId: string; publicKey: string; signature: string } | undefined | void>;
	signAndSendTransaction: (params: {
		signerId?: string;
		receiverId: string;
		actions: Array<{
			type: 'FunctionCall';
			params: { methodName: string; args: object; gas: string; deposit: string };
		}>;
	}) => Promise<{ transaction_outcome?: { id?: string } } & Record<string, unknown>>;
};

type SelectorLike = {
	isSignedIn: () => boolean;
	wallet: (id?: string) => Promise<WalletModule>;
	store: { getState: () => { accounts: Array<{ accountId: string; publicKey?: string }> } };
};

export const WALLET_MODULES: Array<{ id: WalletModuleId; name: string; hint: string }> = [
	{ id: 'meteor-wallet', name: 'Meteor Wallet', hint: 'Extension or web popup · your own keys' }
];

const SESSION_STORAGE_PREFIX = 'nearbox:wallet:session:';

let selectorPromise: Promise<SelectorLike> | null = null;

function requireBrowser(): void {
	if (!browser) throw new Error('Wallets are only available in the browser');
}

async function getSelector(): Promise<SelectorLike> {
	requireBrowser();

	selectorPromise ??= (async () => {
		const [{ setupWalletSelector }, { setupMeteorWallet }] = await Promise.all([
			import('@near-wallet-selector/core'),
			import('@near-wallet-selector/meteor-wallet')
		]);

		return (await setupWalletSelector({
			network: {
				networkId: NEAR_NETWORK_ID,
				nodeUrl: NEAR_RPC_URL,
				helperUrl: `https://helper.${NEAR_NETWORK_ID}.near.org`,
				explorerUrl: `https://explorer.${NEAR_NETWORK_ID}.near.org`,
				indexerUrl: `https://indexer.${NEAR_NETWORK_ID}.near.org`
			},
			modules: [setupMeteorWallet()]
		})) as unknown as SelectorLike;
	})();

	return await selectorPromise;
}

/* ------------------------------------------------------------------ */
/* Persistencia local                                                  */
/* ------------------------------------------------------------------ */

function readStorage(key: string): string {
	try {
		return localStorage.getItem(key) ?? '';
	} catch {
		return '';
	}
}

function writeStorage(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Sin storage la sesión dura lo que dure la pestaña, pero funciona.
	}
}

function removeStorage(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// Nada que limpiar.
	}
}

type StoredSession = { token: string; expiresAt: number };

function sessionKey(accountId: string): string {
	return `${SESSION_STORAGE_PREFIX}${accountId}`;
}

function readSession(accountId: string): StoredSession | null {
	const raw = readStorage(sessionKey(accountId));

	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Partial<StoredSession>;

		if (
			typeof parsed.token !== 'string' ||
			typeof parsed.expiresAt !== 'number' ||
			parsed.expiresAt <= Date.now() + 60_000
		) {
			return null;
		}

		return { token: parsed.token, expiresAt: parsed.expiresAt };
	} catch {
		return null;
	}
}

function storeSession(accountId: string, session: StoredSession): void {
	writeStorage(sessionKey(accountId), JSON.stringify(session));
}

export function forgetWalletSession(accountId: string): void {
	removeStorage(sessionKey(accountId));
}

/** Token de sesión vigente, sin abrir ninguna wallet. */
export function cachedWalletSession(accountId: string): string | null {
	return readSession(accountId)?.token ?? null;
}

/* ------------------------------------------------------------------ */
/* Conexión                                                            */
/* ------------------------------------------------------------------ */

function accountFromState(selector: SelectorLike): WalletAccount | null {
	const account = selector.store.getState().accounts[0];

	if (!account?.accountId) return null;

	return {
		accountId: account.accountId,
		publicKey: account.publicKey ?? '',
		moduleId: 'meteor-wallet'
	};
}

/** Cuenta ya conectada por el wallet selector (sobrevive a recargas). */
export async function restoreWallet(): Promise<WalletAccount | null> {
	requireBrowser();

	try {
		const selector = await getSelector();

		if (!selector.isSignedIn()) return null;

		return accountFromState(selector);
	} catch {
		return null;
	}
}

/** Abre la wallet indicada y devuelve la cuenta conectada. */
export async function connectWallet(moduleId: WalletModuleId): Promise<WalletAccount> {
	requireBrowser();

	const selector = await getSelector();
	const wallet = await selector.wallet(moduleId);

	// Sin `methodNames` Meteor crea una access key de función para el contrato
	// NFT con todos sus métodos y una allowance de gas (0.25 NEAR por defecto).
	// Así el jugador puede mintear, listar y comprar sin reconectar en cada
	// acción; la allowance solo cubre gas de sus propias transacciones.
	await wallet.signIn({ contractId: NFT_CONTRACT_ID || undefined });

	const accounts = await wallet.getAccounts();
	const first = accounts[0];

	if (!first?.accountId) {
		throw new Error('The wallet did not return an account');
	}

	return {
		accountId: first.accountId,
		publicKey: first.publicKey ?? '',
		moduleId
	};
}

export async function disconnectWallet(): Promise<void> {
	requireBrowser();

	try {
		const selector = await getSelector();
		const wallet = await selector.wallet();

		await wallet.signOut();
	} catch {
		// Si la wallet ya no está disponible, limpiamos igual el estado local.
	}
}

/* ------------------------------------------------------------------ */
/* Sesión backend (NEP-413)                                            */
/* ------------------------------------------------------------------ */

function randomNonce(): Buffer {
	const nonce = Buffer.alloc(32);

	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(nonce);
	} else {
		for (let index = 0; index < nonce.length; index += 1) {
			nonce[index] = Math.floor(Math.random() * 256);
		}
	}

	return nonce;
}

export function walletSignInMessage(now = new Date()): string {
	return `NearBox sign-in\n${now.toISOString()}`;
}

/**
 * Firma un mensaje NEP-413 con la wallet y canjea la prueba por un token de
 * sesión. Es la única interacción con la wallet fuera de las transacciones.
 */
export async function createWalletSession(accountId?: string): Promise<string> {
	requireBrowser();

	const selector = await getSelector();
	const wallet = await selector.wallet();

	if (!wallet.signMessage) {
		throw new Error('This wallet does not support message signing (NEP-413)');
	}

	const message = walletSignInMessage();
	const nonce = randomNonce();
	const signed = await wallet.signMessage({
		message,
		recipient: WALLET_AUTH_RECIPIENT,
		nonce,
		callbackUrl: typeof window !== 'undefined' ? window.location.href : undefined
	});

	if (!signed) {
		throw new Error('The wallet did not sign the sign-in message');
	}

	if (accountId && signed.accountId !== accountId) {
		throw new Error('The wallet signed with a different account');
	}

	const response = await postJson<{ token: string; expiresAt: number }>(
		WALLET_AUTH_URL,
		{
			accountId: signed.accountId,
			publicKey: signed.publicKey,
			signature: signed.signature,
			message,
			nonce: nonce.toString('base64'),
			recipient: WALLET_AUTH_RECIPIENT,
			callbackUrl: typeof window !== 'undefined' ? window.location.href : undefined
		},
		(status) => `The NEAR wallet login failed (${status}). Try again.`
	);

	storeSession(signed.accountId, { token: response.token, expiresAt: response.expiresAt });

	return response.token;
}

/* ------------------------------------------------------------------ */
/* Transacciones                                                       */
/* ------------------------------------------------------------------ */

/** `callMethod` en modo wallet: la wallet paga gas y depósito. */
export async function walletCallMethod(
	contractId: string,
	methodName: string,
	args: Record<string, unknown>,
	options: { gas: bigint; deposit: bigint }
): Promise<{ hash: string | null }> {
	requireBrowser();

	const selector = await getSelector();
	const wallet = await selector.wallet();
	const account = accountFromState(selector);

	const outcome = await wallet.signAndSendTransaction({
		signerId: account?.accountId,
		receiverId: contractId,
		actions: [
			{
				type: 'FunctionCall',
				params: {
					methodName,
					args,
					gas: options.gas.toString(),
					deposit: options.deposit.toString()
				}
			}
		]
	});

	return { hash: outcome.transaction_outcome?.id ?? null };
}
