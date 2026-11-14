/**
 * Login invisible con Google (FastAuth) + cuenta NEAR propia.
 *
 *  1. Login con Google (Auth0) → clave MPC derivada de la identidad.
 *  2. accountId `t-nearbox-<10 hex>.testnet`, generado automáticamente a
 *     partir de la public key (misma cuenta de Google → mismo nombre). Las
 *     cuentas antiguas `t-<sha256 12 hex>.testnet` y los handles elegidos a
 *     mano se adoptan sin pedir nada (retrocompatibilidad).
 *  3. Si no existe, se crea vía el mini-relayer con esa public key como única
 *     access key. La cuenta se crea SIN fondear (saldo 0); el funding queda
 *     para un spec posterior.
 *
 * Los SDKs se cargan de forma perezosa desde `sdk.ts`: sus .mjs internos no
 * cargan bien en Node (SSR), así el server nunca los evalúa; solo corren en el
 * browser.
 */
import '#lib/polyfills.ts';
import { browser } from '$app/env';
import {
	ACCOUNT_HASH_HEX_LENGTH,
	AUTH0_CLIENT_ID,
	AUTH0_DOMAIN,
	AUTO_HANDLE_ID_LENGTH,
	AUTO_HANDLE_PREFIX,
	FAST_AUTH_CONTRACT_ID,
	HANDLE_STORAGE_PREFIX,
	MPC_CONTRACT_ID,
	NEAR_NETWORK_ID,
	NEAR_RPC_URL,
	RELAYER_CREATE_ACCOUNT_URL,
	RELAYER_ENSURE_ACCOUNT_URL
} from './config.ts';
import { errorMessage } from './errors.ts';
import { accountIdFromHandle, HANDLE_RULES, isValidHandle, normalizeHandle } from './handle.ts';
import { postJson } from './http.ts';
import { getAccessKeys } from './rpc.ts';
import { loadAuthSdk } from './sdk.ts';

type FastAuthClient = import('@fast-auth-near/browser-sdk').FastAuthClient;
type FastAuthSigner = import('@fast-auth-near/browser-sdk').FastAuthSigner;
type JavascriptProvider = import('@fast-auth-near/javascript-provider').JavascriptProvider;
type Near = import('near-api-js').Near;

export type NearAuthContext = {
	provider: JavascriptProvider;
	client: FastAuthClient;
	near: Near;
};

export type Onboarding = {
	accountId: string;
	publicKey: string;
	/** Handle legible de la cuenta (`t-<handle>.testnet`). */
	handle: string;
	justCreated: boolean;
};

export type AccountResolution =
	{ status: 'ready'; account: Onboarding } | { status: 'needs-handle'; publicKey: string };

let authPromise: Promise<NearAuthContext> | null = null;

/** localStorage puede no estar disponible (modo privado / storage bloqueado). */
function storageWorks(): boolean {
	try {
		const probe = '__fastauth_probe__';
		localStorage.setItem(probe, '1');
		localStorage.removeItem(probe);
		return true;
	} catch {
		return false;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initAuth(): Promise<NearAuthContext> {
	if (!browser) throw new Error('FastAuth solo inicializa en el browser, nunca en SSR');

	const { FastAuthClient, JavascriptProvider, Auth0Client, connect } = await loadAuthSdk();

	const provider = new JavascriptProvider({
		network: NEAR_NETWORK_ID as 'testnet' | 'mainnet',
		clientId: AUTH0_CLIENT_ID
	});

	// El SDK arma su Auth0Client con cache en memoria: la sesión se pierde al
	// recargar. Lo reemplazamos por uno equivalente en localStorage.
	// (`client` es privado en los tipos, pero en runtime es una propiedad más.)
	const canPersist = storageWorks();
	(provider as unknown as { client: unknown }).client = new Auth0Client({
		domain: AUTH0_DOMAIN,
		clientId: AUTH0_CLIENT_ID,
		cacheLocation: canPersist ? 'localstorage' : 'memory',
		useRefreshTokens: canPersist,
		// Nunca usar el iframe oculto de Auth0 para renovar en silencio: Brave
		// (y Safari) bloquean sus cookies de terceros, el iframe responde
		// `login_required` y auth0-spa-js reacciona con un `logout()` silencioso
		// que borra toda la sesión del jugador.
		useRefreshTokensFallback: false
	});

	const near = await connect({
		networkId: NEAR_NETWORK_ID,
		nodeUrl: NEAR_RPC_URL
	});

	const client = new FastAuthClient(provider, near.connection, {
		fastAuthContractId: FAST_AUTH_CONTRACT_ID,
		mpcContractId: MPC_CONTRACT_ID
	});

	return { provider, client, near };
}

export async function getAuth(): Promise<NearAuthContext> {
	authPromise ??= initAuth();
	return await authPromise;
}

/** Login (Google vía Auth0). Popup: vuelve a la misma página. */
export async function login(): Promise<string> {
	const { client } = await getAuth();
	const user = await client.login();
	return user.userId;
}

export async function logout(): Promise<void> {
	if (!authPromise) return;

	try {
		const { client } = await authPromise;
		await client.logout();
	} finally {
		authPromise = null;
	}
}

export async function isLoggedIn(): Promise<boolean> {
	if (!browser) return false;

	try {
		const { provider } = await getAuth();
		return await provider.isLoggedIn();
	} catch {
		return false;
	}
}

/**
 * La sesión de Auth0 desapareció (cache vaciado, logout en otra pestaña o
 * sesión revocada). El SDK lo resume con `USER_NOT_LOGGED_IN`, que no dice nada
 * al jugador: lo traducimos a un error propio para ofrecerle volver a entrar.
 */
export class SessionExpiredError extends Error {
	constructor() {
		super('Your Google session expired. Sign in again to continue.');
		this.name = 'SessionExpiredError';
	}
}

function isMissingSession(cause: unknown): boolean {
	return cause instanceof Error && cause.message.includes('USER_NOT_LOGGED_IN');
}

/** Signer listo (clave MPC derivada del JWT). Lanza si no hubo login. */
export async function getSigner(): Promise<FastAuthSigner> {
	const { client } = await getAuth();

	try {
		return await client.getSigner();
	} catch (cause) {
		if (isMissingSession(cause)) throw new SessionExpiredError();
		throw cause;
	}
}

export async function getPublicKey(): Promise<string> {
	const signer = await getSigner();
	return String(await signer.getPublicKey('ed25519'));
}

/**
 * JWT firmado de Auth0 que identifica al jugador ante el relayer.
 *
 * No sirve pedir el audience de firma (`auth0.jwt.fast-auth.testnet`) en
 * silencio: la Action de FastAuth en Auth0 exige un payload de transacción
 * (`Signing audience requested without transaction payload`), así que solo se
 * obtiene abriendo el popup de firma. Para el mint patrocinado y el sync de
 * estadísticas basta el **ID token**, que ya está en la caché: el backend
 * valida firma, `iss`, `aud` (clientId) y `exp`, y usa el `sub`.
 *
 * No abre popup ni toca la red. Si no hay sesión devuelve `null` y el store
 * cae a autopago.
 */
export async function getIdentityToken(): Promise<string | null> {
	try {
		const { provider } = await getAuth();
		const cacheManager = (
			provider as unknown as {
				client?: {
					cacheManager?: {
						getIdToken?: (key: { clientId: string }) => Promise<{ id_token?: string } | undefined>;
					};
				};
			}
		).client?.cacheManager;

		const entry = await cacheManager?.getIdToken?.({ clientId: AUTH0_CLIENT_ID });

		return entry?.id_token ?? null;
	} catch {
		return null;
	}
}

/* ------------------------------------------------------------------ */
/* Identidad de la cuenta: handle legible (sin funding)                */
/* ------------------------------------------------------------------ */

async function sha256Hex(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest('SHA-256', bytes);

	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Handle de las cuentas antiguas, derivado de la pubkey.
 *
 * Se conserva solo por compatibilidad: si existe una cuenta
 * `t-<12 hex>.testnet` con la key del jugador, se adopta sin pedirle un handle.
 */
export async function deriveLegacyHandle(publicKey: string): Promise<string> {
	const hex = await sha256Hex(publicKey);
	return hex.slice(0, ACCOUNT_HASH_HEX_LENGTH);
}

/**
 * Cuenta determinista que usa el backend para validar el mint patrocinado:
 * `t-<sha256(publicKey).slice(0,12)>.testnet`, hasheando el string completo
 * (`ed25519:...`). Idéntica a `deriveAccountId` de `backend/src/server/relayer.ts`.
 */
export async function deriveAccountId(publicKey: string): Promise<string> {
	const hex = await sha256Hex(publicKey);
	return `t-${hex.slice(0, ACCOUNT_HASH_HEX_LENGTH)}.${NEAR_NETWORK_ID}`;
}

/**
 * Handle automático para cuentas nuevas: `nearbox-<10 hex>`.
 *
 * Deriva el sufijo de la public key MPC en vez de sortearlo, así el mismo
 * jugador (misma cuenta de Google → misma key) obtiene siempre el mismo
 * `t-nearbox-….testnet`. Recupera su cuenta incluso si borra `localStorage` o
 * entra desde otro dispositivo, sin preguntarle un nombre que NEAR no permite
 * cambiar después.
 */
export async function deriveAutoHandle(publicKey: string): Promise<string> {
	const hex = await sha256Hex(publicKey);
	return `${AUTO_HANDLE_PREFIX}${hex.slice(0, AUTO_HANDLE_ID_LENGTH)}`;
}

function handleStorageKey(publicKey: string): string {
	return `${HANDLE_STORAGE_PREFIX}${publicKey}`;
}

/** `localStorage` puede fallar en modo privado: el handle simplemente no persiste. */
function readStoredHandle(publicKey: string): string {
	try {
		return localStorage.getItem(handleStorageKey(publicKey)) ?? '';
	} catch {
		return '';
	}
}

function storeHandle(publicKey: string, handle: string): void {
	try {
		localStorage.setItem(handleStorageKey(publicKey), handle);
	} catch {
		// Sin storage la sesión funciona, pero el handle hay que recordarlo.
	}
}

/** El handle ya existe con otra key: hay que pedirle un nombre al jugador. */
class HandleTakenError extends Error {}

/** La cuenta existe y contiene la key del jugador. */
async function accountOwnedBy(accountId: string, publicKey: string): Promise<boolean> {
	try {
		const keys = await getAccessKeys(accountId, 'final');
		return keys?.some((entry) => entry.publicKey === publicKey) ?? false;
	} catch {
		return false;
	}
}

async function ensureAccountForHandle(
	handle: string,
	publicKey: string,
	onStep?: (step: 'checking' | 'creating') => void
): Promise<Onboarding> {
	const accountId = accountIdFromHandle(handle);

	onStep?.('checking');

	const existingKeys = await getAccessKeys(accountId, 'final');

	if (existingKeys) {
		if (!existingKeys.some((entry) => entry.publicKey === publicKey)) {
			throw new HandleTakenError(
				`The account ${accountId} is already taken by someone else. Choose another name.`
			);
		}

		return { accountId, publicKey, handle, justCreated: false };
	}

	onStep?.('creating');
	await postJson(
		RELAYER_CREATE_ACCOUNT_URL,
		{ accountId, publicKey },
		(status) => `We couldn't create your account (${status}). Try again in a few seconds.`
	);

	// La cuenta tarda 1-2 bloques en verse por RPC: polling corto.
	for (let attempt = 0; attempt < 25; attempt += 1) {
		await sleep(300);

		if (await accountOwnedBy(accountId, publicKey)) {
			return { accountId, publicKey, handle, justCreated: true };
		}
	}

	throw new Error(
		'Your account was created, but the node cannot see it yet. Try again in a few seconds.'
	);
}

/**
 * Cuenta planificada (sin crear todavía). La cuenta on-chain se crea en el
 * primer mint, no en el login: así 10.000 logins no crean 10.000 cuentas.
 */
async function resolveHandleAccount(
	handle: string,
	publicKey: string,
	onStep?: (step: 'checking' | 'creating') => void
): Promise<Onboarding> {
	const accountId = accountIdFromHandle(handle);

	onStep?.('checking');
	const existingKeys = await getAccessKeys(accountId, 'final');

	if (!existingKeys) {
		return { accountId, publicKey, handle, justCreated: false };
	}

	if (!existingKeys.some((entry) => entry.publicKey === publicKey)) {
		throw new HandleTakenError(
			`The account ${accountId} is already taken by someone else. Choose another name.`
		);
	}

	return { accountId, publicKey, handle, justCreated: false };
}

/**
 * Resuelve la cuenta al iniciar sesión **sin crearla**:
 *  1. handle guardado en este navegador para la pubkey;
 *  2. cuenta antigua `t-<12 hex>.testnet` (se adopta y se recuerda);
 *  3. cuenta automática `t-nearbox-<10 hex>.testnet`.
 * Si el nombre ya pertenece a otra key se pide elegir un handle.
 */
export async function resolveAccount(
	onStep?: (step: 'checking' | 'creating') => void
): Promise<AccountResolution> {
	const publicKey = await getPublicKey();
	const stored = readStoredHandle(publicKey);

	if (stored && isValidHandle(stored)) {
		return { status: 'ready', account: await resolveHandleAccount(stored, publicKey, onStep) };
	}

	const legacyHandle = await deriveLegacyHandle(publicKey);
	const legacyAccountId = accountIdFromHandle(legacyHandle);

	if (await accountOwnedBy(legacyAccountId, publicKey)) {
		storeHandle(publicKey, legacyHandle);
		return {
			status: 'ready',
			account: { accountId: legacyAccountId, publicKey, handle: legacyHandle, justCreated: false }
		};
	}

	const autoHandle = await deriveAutoHandle(publicKey);

	try {
		const account = await resolveHandleAccount(autoHandle, publicKey, onStep);
		storeHandle(publicKey, autoHandle);
		return { status: 'ready', account };
	} catch (cause) {
		if (cause instanceof HandleTakenError) {
			return { status: 'needs-handle', publicKey };
		}

		throw cause;
	}
}

/**
 * Garantiza la cuenta on-chain en el primer mint (idempotente). El backend
 * crea la cuenta si falta y la fondea con `NEW_ACCOUNT_FUNDING_NEAR`.
 */
export async function ensureOnChainAccount(
	accountId: string,
	publicKey: string
): Promise<{ accountId: string; created: boolean; funded: boolean }> {
	if (await accountOwnedBy(accountId, publicKey)) {
		return { accountId, created: false, funded: false };
	}

	const result = await postJson<{ accountId: string; created: boolean; funded: boolean }>(
		RELAYER_ENSURE_ACCOUNT_URL,
		{ accountId, publicKey },
		(status) => `We couldn't prepare your NEAR account (${status}). Try again in a few seconds.`
	);

	for (let attempt = 0; attempt < 25; attempt += 1) {
		if (await accountOwnedBy(accountId, publicKey)) return result;
		await sleep(300);
	}

	throw new Error(
		'Your account was created, but the node cannot see it yet. Try again in a few seconds.'
	);
}

/** Crea (o recupera) la cuenta con el handle elegido y lo recuerda. */
export async function createAccountWithHandle(
	rawHandle: string,
	onStep?: (step: 'checking' | 'creating') => void
): Promise<Onboarding> {
	const handle = normalizeHandle(rawHandle);

	if (!isValidHandle(handle)) {
		throw new Error(`That name is invalid. Use ${HANDLE_RULES}`);
	}

	const publicKey = await getPublicKey();
	const account = await ensureAccountForHandle(handle, publicKey, onStep);
	storeHandle(publicKey, handle);

	return account;
}

export function describeAuthError(error: unknown): string {
	return errorMessage(error);
}
