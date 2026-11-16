/**
 * Login con wallet NEAR (SPEC-047).
 *
 * `POST /auth/wallet` recibe la prueba NEP-413 del cliente y devuelve un token
 * de sesión. No crea cuentas ni mueve fondos: solo convierte una firma válida
 * en una identidad que el resto del backend entiende.
 */
import { Elysia } from 'elysia';
import {
	WalletAuthError,
	signInWithWallet,
	type WalletSignInInput
} from '../server/wallet';
import { WALLET_AUTH_RECIPIENT } from '../server/wallet';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MINUTE = 60_000;

function clientIp(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for');

	if (forwarded) return forwarded.split(',')[0]!.trim();

	return request.headers.get('x-real-ip') ?? 'unknown';
}

function allow(key: string, max: number): boolean {
	const now = Date.now();

	if (buckets.size > 1_000) {
		for (const [seen, bucket] of buckets) {
			if (bucket.resetAt <= now) buckets.delete(seen);
		}
	}

	const current = buckets.get(key);

	if (!current || current.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + MINUTE });
		return true;
	}

	if (current.count >= max) return false;

	current.count += 1;
	return true;
}

function parseBody(body: unknown): WalletSignInInput {
	if (!body || typeof body !== 'object') {
		throw new WalletAuthError('invalid body');
	}

	const input = body as Record<string, unknown>;

	return {
		accountId: String(input.accountId ?? ''),
		publicKey: String(input.publicKey ?? ''),
		signature: String(input.signature ?? ''),
		message: String(input.message ?? ''),
		nonce: String(input.nonce ?? ''),
		recipient: input.recipient == null ? undefined : String(input.recipient),
		callbackUrl: input.callbackUrl == null ? undefined : String(input.callbackUrl)
	};
}

export const authRoutes = new Elysia({ prefix: '/auth' })
	.get('/wallet/config', () => ({
		networkId: process.env.NEAR_NETWORK_ID || 'testnet',
		recipient: WALLET_AUTH_RECIPIENT
	}))
	.post('/wallet', async ({ body, request, set }) => {
		const ip = clientIp(request);

		if (!allow(`wallet:${ip}`, 10)) {
			set.status = 429;
			return { error: 'WALLET_RATE_LIMITED', message: 'Too many sign-in attempts. Wait a minute.' };
		}

		try {
			const session = await signInWithWallet(parseBody(body));
			return session;
		} catch (cause) {
			const status = (cause as { status?: number }).status;
			set.status = status === 403 ? 403 : status === 429 ? 429 : 401;

			return {
				error: (cause as { code?: string }).code ?? 'WALLET_AUTH_FAILED',
				message: cause instanceof Error ? cause.message : 'Could not verify the wallet'
			};
		}
	});
