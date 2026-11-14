import { verifyAuth0Jwt } from './auth0';
import { assertOwnedAccount } from './relayer';

/**
 * Identidad de la sesión de juego.
 *
 * El `join` del WebSocket puede llevar el JWT de Auth0 y la cuenta on-chain.
 * Solo si el token es válido y la `publicKey` pertenece a la cuenta se vincula
 * el `ws.id` (efímero) con el `accountId` que después recibe los NFTs. Sin
 * vínculo, la sesión sigue siendo anónima y no recibe atestaciones.
 */

export type JoinIdentity = {
	token?: string;
	accountId?: string;
	publicKey?: string;
};

export type BoundSession = {
	sub: string;
	accountId: string;
	expiresAt: number;
};

export type IdentityDeps = {
	verifyToken: (token: string) => Promise<{ sub: string }>;
	/** Comprueba on-chain que la publicKey pertenece a la cuenta. */
	assertOwnership: (accountId: string, publicKey: string) => Promise<void>;
	now?: () => number;
};

const DEFAULT_TTL_MS = 6 * 60 * 60_000;
const ACCOUNT_ID_PATTERN = /^t-[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?\.testnet$/;
const PUBLIC_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,60}$/;

const sessions = new Map<string, BoundSession>();

const defaultDeps: IdentityDeps = {
	verifyToken: verifyAuth0Jwt,
	assertOwnership: assertOwnedAccount
};

function nowMs(deps: IdentityDeps): number {
	return deps.now?.() ?? Date.now();
}

function isValidPayload(
	payload: JoinIdentity
): payload is { token: string; accountId: string; publicKey: string } {
	return (
		typeof payload.token === 'string' &&
		payload.token.length > 0 &&
		typeof payload.accountId === 'string' &&
		ACCOUNT_ID_PATTERN.test(payload.accountId) &&
		typeof payload.publicKey === 'string' &&
		PUBLIC_KEY_PATTERN.test(payload.publicKey)
	);
}

/**
 * Vincula una conexión a una cuenta. Devuelve `null` y deja la sesión anónima
 * si el token falta, es inválido o la key no pertenece a la cuenta.
 */
export async function bindSession(
	wsId: string,
	payload: JoinIdentity,
	deps: Partial<IdentityDeps> = {}
): Promise<BoundSession | null> {
	if (!isValidPayload(payload)) {
		return null;
	}

	const resolved: IdentityDeps = { ...defaultDeps, ...deps };

	try {
		const claims = await resolved.verifyToken(payload.token);

		if (!claims.sub) {
			console.warn(`[identity] ${wsId}: token without subject`);
			return null;
		}

		await resolved.assertOwnership(payload.accountId, payload.publicKey);

		const session: BoundSession = {
			sub: claims.sub,
			accountId: payload.accountId,
			expiresAt: nowMs(resolved) + DEFAULT_TTL_MS
		};

		sessions.set(wsId, session);

		return session;
	} catch (cause) {
		console.warn(
			`[identity] ${wsId}: anonymous session (${cause instanceof Error ? cause.message : 'invalid identity'})`
		);
		sessions.delete(wsId);
		return null;
	}
}

/** `accountId` vinculado a la conexión, o `null` si es anónima. */
export function accountFor(wsId: string): string | null {
	const session = sessions.get(wsId);

	if (!session) {
		return null;
	}

	if (session.expiresAt <= Date.now()) {
		sessions.delete(wsId);
		return null;
	}

	return session.accountId;
}

export function sessionFor(wsId: string): BoundSession | null {
	const accountId = accountFor(wsId);

	if (!accountId) {
		return null;
	}

	return sessions.get(wsId) ?? null;
}

export function clearSession(wsId: string): void {
	sessions.delete(wsId);
}

/** Solo para tests. */
export function clearAllSessions(): void {
	sessions.clear();
}
