/**
 * SPEC-047 — login con wallet NEAR.
 *
 * Cubre la parte sensible: serialización NEP-413, verificación de la firma,
 * rechazo de replays y firma/expiración del token de sesión. La consulta a la
 * access key en cadena se inyecta para no depender de testnet.
 */
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { utils } from 'near-api-js';
import {
  issueWalletToken,
  serializeNep413,
  signInWithWallet,
  verifyNep413,
  verifyWalletToken,
  WalletAuthError,
  WALLET_AUTH_RECIPIENT
} from '../src/server/wallet';

process.env.WALLET_SESSION_SECRET = 'test-wallet-session-secret-0123456789';

const ACCOUNT = 'wallet-test.testnet';
const keyPair = utils.KeyPair.fromRandom('ed25519');
const PUBLIC_KEY = keyPair.getPublicKey().toString();

function sign(input: {
	message: string;
	nonce: Buffer;
	recipient?: string;
	signature?: string;
	callbackUrl?: string;
}): {
	accountId: string;
	publicKey: string;
	signature: string;
	message: string;
	nonce: string;
	recipient: string;
	callbackUrl?: string;
} {
	const recipient = input.recipient ?? WALLET_AUTH_RECIPIENT;
	const payload = serializeNep413({
		message: input.message,
		nonce: input.nonce,
		recipient,
		callbackUrl: input.callbackUrl
	});
	const hashed = createHash('sha256').update(payload).digest();
	const signature =
		input.signature ??
		Buffer.from(keyPair.sign(hashed).signature).toString('base64');

	return {
		accountId: ACCOUNT,
		publicKey: PUBLIC_KEY,
		signature,
		message: input.message,
		nonce: input.nonce.toString('base64'),
		recipient,
		callbackUrl: input.callbackUrl
	};
}

function freshMessage(): string {
	return `NearBox sign-in\n${new Date().toISOString()}`;
}

function nonce(): Buffer {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
}

const acceptKey = async () => {};

describe('serializeNep413', () => {
	test('uses the NEP-413 tag and encodes the callback presence flag', () => {
		const withCallback = serializeNep413({
			message: 'hi',
			nonce: Buffer.alloc(32, 7),
			recipient: 'nearbox.lol',
			callbackUrl: 'https://nearbox.lol/'
		});
		const withoutCallback = serializeNep413({
			message: 'hi',
			nonce: Buffer.alloc(32, 7),
			recipient: 'nearbox.lol'
		});

		expect(withCallback.readUInt32LE(0)).toBe(2147484061);
		expect(withoutCallback.readUInt32LE(0)).toBe(2147484061);
		expect(withCallback.length).toBeGreaterThan(withoutCallback.length);
	});
});

describe('verifyNep413', () => {
	test('accepts a valid signature', () => {
		const proof = sign({ message: freshMessage(), nonce: nonce() });

		expect(
			verifyNep413({
				publicKey: proof.publicKey,
				signature: proof.signature,
				message: proof.message,
				nonce: proof.nonce,
				recipient: proof.recipient
			})
		).toBe(true);
	});

	test('accepts secp256k1 signatures (65 bytes)', () => {
		const secpKey = utils.KeyPair.fromRandom('secp256k1');
		const message = freshMessage();
		const nonceBytes = nonce();
		const payload = serializeNep413({
			message,
			nonce: nonceBytes,
			recipient: WALLET_AUTH_RECIPIENT
		});
		const signature = Buffer.from(
			secpKey.sign(createHash('sha256').update(payload).digest()).signature
		);

		expect(signature.length).toBe(65);
		expect(
			verifyNep413({
				publicKey: secpKey.getPublicKey().toString(),
				signature: signature.toString('base64'),
				message,
				nonce: nonceBytes.toString('base64'),
				recipient: WALLET_AUTH_RECIPIENT
			})
		).toBe(true);
	});

	test('rejects a tampered message, recipient or signature', () => {
		const proof = sign({ message: freshMessage(), nonce: nonce() });

		expect(
			verifyNep413({
				publicKey: proof.publicKey,
				signature: proof.signature,
				message: `${proof.message} `,
				nonce: proof.nonce,
				recipient: proof.recipient
			})
		).toBe(false);

		expect(
			verifyNep413({
				publicKey: proof.publicKey,
				signature: proof.signature,
				message: proof.message,
				nonce: proof.nonce,
				recipient: 'evil.example'
			})
		).toBe(false);

		expect(
			verifyNep413({
				publicKey: proof.publicKey,
				signature: Buffer.alloc(64, 1).toString('base64'),
				message: proof.message,
				nonce: proof.nonce,
				recipient: proof.recipient
			})
		).toBe(false);
	});
});

describe('signInWithWallet', () => {
	test('issues a session token bound to the wallet account', async () => {
		const proof = sign({ message: freshMessage(), nonce: nonce() });
		const session = await signInWithWallet(proof, { assertKeyOnChain: acceptKey });

		expect(session.accountId).toBe(ACCOUNT);
		expect(session.publicKey).toBe(PUBLIC_KEY);

		const claims = verifyWalletToken(session.token);

		expect(claims.sub).toBe(`wallet:${ACCOUNT}`);
		expect(claims.accountId).toBe(ACCOUNT);
		expect(claims.expiresAt).toBe(session.expiresAt);
	});

	test('rejects an account that is not a full testnet/near name', async () => {
		const proof = sign({ message: freshMessage(), nonce: nonce() });

		await expect(
			signInWithWallet(
				{ ...proof, accountId: 'not-an-account' },
				{ assertKeyOnChain: acceptKey }
			)
		).rejects.toBeInstanceOf(WalletAuthError);
	});

	test('accepts a Meteor-style signature made without callbackUrl', async () => {
		const proof = sign({ message: freshMessage(), nonce: nonce() });

		// Meteor ignora `callbackUrl` al firmar, pero el cliente lo sigue
		// enviando al backend.
		const session = await signInWithWallet(
			{ ...proof, callbackUrl: 'https://nearbox.lol/' },
			{ assertKeyOnChain: acceptKey }
		);

		expect(session.accountId).toBe(ACCOUNT);
	});

	test('rejects a signature for a different recipient', async () => {
		const proof = sign({
			message: freshMessage(),
			nonce: nonce(),
			recipient: 'evil.example'
		});

		await expect(
			signInWithWallet(proof, { assertKeyOnChain: acceptKey })
		).rejects.toBeInstanceOf(WalletAuthError);
	});

	test('rejects a stale sign-in message', async () => {
		const proof = sign({
			message: 'NearBox sign-in\n2020-01-01T00:00:00.000Z',
			nonce: nonce()
		});

		await expect(
			signInWithWallet(proof, { assertKeyOnChain: acceptKey })
		).rejects.toBeInstanceOf(WalletAuthError);
	});

	test('cannot redeem the same nonce twice, even with another encoding', async () => {
		const sharedNonce = nonce();
		const first = sign({ message: freshMessage(), nonce: sharedNonce });
		const second = sign({
			message: first.message,
			nonce: sharedNonce
		});

		// Misma firma y mismos bytes, pero sin el padding base64: el cache debe
		// reconocerla como el mismo nonce.
		second.nonce = second.nonce.replace(/=+$/, '');

		await signInWithWallet(first, { assertKeyOnChain: acceptKey });

		await expect(
			signInWithWallet(second, { assertKeyOnChain: acceptKey })
		).rejects.toBeInstanceOf(WalletAuthError);
	});

	test('propagates an on-chain key check failure', async () => {
		const proof = sign({ message: freshMessage(), nonce: nonce() });

		await expect(
			signInWithWallet(proof, {
				assertKeyOnChain: async () => {
					throw new WalletAuthError('key not registered');
				}
			})
		).rejects.toBeInstanceOf(WalletAuthError);
	});
});

describe('wallet session token', () => {
	test('rejects tampering and expiry', () => {
		const issued = issueWalletToken({ accountId: ACCOUNT, publicKey: PUBLIC_KEY });
		const [prefix, payload, signature] = issued.token.split('.');
		const tampered = `${prefix}.${payload}.${signature?.slice(0, -1)}A`;

		expect(() => verifyWalletToken(tampered)).toThrow(WalletAuthError);

		const expired = issueWalletToken({
			accountId: ACCOUNT,
			publicKey: PUBLIC_KEY,
			ttlMs: -1_000
		});

		expect(() => verifyWalletToken(expired.token)).toThrow(WalletAuthError);
	});

	test('exposes the configured recipient', () => {
		expect(WALLET_AUTH_RECIPIENT.length).toBeGreaterThan(0);
	});
});
