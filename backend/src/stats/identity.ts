/**
 * Identidad de las estadísticas.
 *
 * Los ids UUID son el modo legacy de SPEC-042: los genera el cliente y no
 * pueden autenticarse. Los ids de cuenta (`t-<handle>.testnet`) exigen un JWT
 * de Auth0 y quedan vinculados al `sub` del token la primera vez que se usan.
 */

import { AuthError, verifyAuth0Jwt } from '../server/auth0';

export const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidPlayerId(playerId: string): boolean {
	return UUID_PATTERN.test(playerId);
}

/** Falta el token o no es válido (HTTP 401). */
export class StatsAuthError extends Error {
	readonly status = 401;
	readonly code = 'AUTH_REQUIRED';

	constructor(message = 'An Auth0 token is required for account stats') {
		super(message);
		this.name = 'StatsAuthError';
	}
}

/** El documento ya pertenece a otra cuenta (HTTP 403). */
export class StatsForbiddenError extends Error {
	readonly status = 403;
	readonly code = 'STATS_FORBIDDEN';

	constructor(message = 'These stats belong to another account') {
		super(message);
		this.name = 'StatsForbiddenError';
	}
}

/** Petición inválida específica del merge (HTTP 400). */
export class StatsRequestError extends Error {
	readonly status = 400;
	readonly code = 'INVALID_STATS_PAYLOAD';

	constructor(message: string) {
		super(message);
		this.name = 'StatsRequestError';
	}
}

/**
 * Devuelve el `sub` que debe poseer el documento. Los UUID legacy se quedan
 * sin dueño para no romper clientes antiguos que no envían token.
 */
export function ownedSubject(playerId: string, subject: string | null): string | null {
	if (isUuidPlayerId(playerId)) {
		return null;
	}

	if (!subject) {
		throw new StatsAuthError();
	}

	return subject;
}

export type TokenVerifier = (token: string) => Promise<{ sub: string }>;

/** Reads `Authorization: Bearer <jwt>` and verifies it. `null` = no token. */
export async function readBearerSubject(
	request: Request,
	verifyToken: TokenVerifier = verifyAuth0Jwt
): Promise<string | null> {
	const header = request.headers.get('authorization');

	if (!header) {
		return null;
	}

	const match = /^Bearer\s+(.+)$/i.exec(header.trim());

	if (!match) {
		throw new StatsAuthError('The Authorization header must use the Bearer scheme');
	}

	try {
		const claims = await verifyToken(match[1].trim());

		if (!claims.sub) {
			throw new StatsAuthError('The Auth0 token has no subject');
		}

		return claims.sub;
	} catch (cause) {
		if (cause instanceof StatsAuthError) {
			throw cause;
		}

		// AuthError (malformed/expired/bad signature) and JWKS failures are all
		// authentication failures from the client's point of view.
		throw new StatsAuthError(
			cause instanceof AuthError
				? cause.message
				: cause instanceof Error
					? cause.message
					: 'The Auth0 token is invalid'
		);
	}
}
