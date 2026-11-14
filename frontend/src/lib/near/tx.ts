/**
 * Escrituras on-chain firmadas por la cuenta FastAuth del usuario.
 *
 * La cuenta no tiene clave local: su única access key la controla la MPC. El
 * flujo es:
 *   1. armar la Transaction con nonce + blockhash del RPC,
 *   2. `requestTransactionSignature` abre el popup de Auth0 (scope
 *      `transaction:sign`) y el JWT que vuelve trae la tx en el claim `fatxn`,
 *   3. `getSignatureRequest` devuelve { guardId, verifyPayload, signPayload },
 *   4. el mini-relayer llama `sign` en fast-auth.testnet y devuelve la firma
 *      de la MPC,
 *   5. armamos la SignedTransaction con esa firma y la difundimos al RPC.
 */
import { errorMessage } from './errors.ts';
import { loadAuthModule } from './auth-loader.ts';
import { bytesEqual, bytesToBase64 } from './bytes.ts';
import { AUTH0_SIGNING_AUDIENCE, DEFAULT_GAS, RELAYER_SIGN_TX_URL } from './config.ts';
import { postJson } from './http.ts';
import { jsonRpc } from './rpc.ts';
import { loadSigningSdk, loadTransactionSdk } from './sdk.ts';
import type { AccessKeyView } from 'near-api-js/lib/providers/provider';
import type { Action } from 'near-api-js/lib/transaction';

export type CallOptions = {
	gas?: bigint;
	deposit?: bigint;
};

/**
 * Borra de la caché de Auth0 los tokens de firma (audience `...fast-auth...`).
 *
 * La sesión vive en localStorage, así que un JWT con `fatxn` de una tx anterior
 * puede sobrevivir a la recarga. Si `getSignatureRequest()` lo devolviera, la
 * MPC firmaría bytes viejos y el RPC respondería `InvalidSignature`.
 */
async function clearStaleSigningTokens(): Promise<void> {
	const { getAuth } = await loadAuthModule();
	const { provider } = await getAuth();
	const internals = provider as unknown as {
		options?: { signingAudience?: string };
		client?: {
			cacheManager?: {
				getCacheKeys?: () => Promise<string[] | undefined>;
				remove?: (clientId: string, audience: string, scope: string) => Promise<void>;
			};
		};
	};
	const cacheManager = internals.client?.cacheManager;

	if (!cacheManager?.getCacheKeys || !cacheManager.remove) return;

	const audience = internals.options?.signingAudience ?? AUTH0_SIGNING_AUDIENCE;

	try {
		for (const key of (await cacheManager.getCacheKeys()) ?? []) {
			const parts = key.split('::');
			if (parts.length !== 4) continue;
			const [, clientId, keyAudience, scope] = parts;
			if (keyAudience !== audience) continue;
			// El token que pide el login (sin `transaction:sign`) no lleva
			// `fatxn`: lo usa el mint patrocinado y hay que conservarlo.
			if (!scope.includes('transaction:sign')) continue;
			await cacheManager.remove(clientId, keyAudience, scope);
		}
	} catch (cause) {
		// Si cambia la forma interna del SDK seguimos: la validación posterior
		// de la tx aprobada evita difundir algo incorrecto.
		console.warn('[near] could not clear stale signing tokens', cause);
	}
}

/** Ejecuta un método mutate del contrato firmando con la cuenta FastAuth. */
export async function callMethod(
	accountId: string,
	contractId: string,
	method: string,
	args: Record<string, unknown> = {},
	options: CallOptions = {}
): Promise<{ hash: string | null }> {
	if (!accountId) throw new Error('Your NEAR account is not ready yet');

	let step = 'Preparing the signature';

	try {
		const { functionCall } = await loadTransactionSdk();

		return await executeTransaction(
			accountId,
			contractId,
			[functionCall(method, args, options.gas ?? DEFAULT_GAS, options.deposit ?? 0n)],
			(next) => (step = next)
		);
	} catch (cause) {
		const message = errorMessage(cause);
		console.error('[near] failed at step', step, cause);

		// La sesión caducada ya trae un mensaje accionable; el paso no aporta.
		if (/session expired/i.test(message)) throw new Error(message);

		throw new Error(`${step}: ${message}`);
	}
}

async function executeTransaction(
	accountId: string,
	receiverId: string,
	actions: Action[],
	onStep: (step: string) => void
): Promise<{ hash: string | null }> {
	const { getAuth, getSigner } = await loadAuthModule();
	const { near } = await getAuth();
	const {
		FastAuthSignature,
		createTransaction,
		Signature,
		SignedTransaction,
		Transaction,
		encodeTransaction,
		utils,
		PublicKey,
		KeyType
	} = await loadSigningSdk();

	onStep('Signing in with your MPC key');
	const signer = await getSigner();
	const publicKey = PublicKey.from(String(await signer.getPublicKey('ed25519')));
	const provider = near.connection.provider;

	onStep('Reading your access key');
	const accessKey = await provider.query<AccessKeyView>({
		request_type: 'view_access_key',
		finality: 'final',
		account_id: accountId,
		public_key: publicKey.toString()
	});
	const block = await provider.block({ finality: 'optimistic' });

	onStep('Building the transaction');
	const tx = createTransaction(
		accountId,
		publicKey,
		receiverId,
		BigInt(accessKey.nonce) + 1n,
		actions,
		utils.serialize.base_decode(block.header.hash)
	);

	// 1) popup de Auth0 con la tx (scope transaction:sign)
	onStep('Signing the transaction with Google');
	await clearStaleSigningTokens();
	await signer.requestTransactionSignature({ transaction: tx });

	// 2) el JWT de firma trae la tx y el guard; el relayer pide la firma a la MPC
	onStep('Waiting for the MPC signature');
	const { signatureRequest } = await signer.getSignatureRequest();
	const approvedBytes = Uint8Array.from(signatureRequest.signPayload ?? []);

	if (approvedBytes.length === 0) {
		throw new Error('Google did not approve a transaction. Try again.');
	}

	const json = await postJson<{ signature?: string; hash?: string }>(
		RELAYER_SIGN_TX_URL,
		{
			guard_id: signatureRequest.guardId,
			sign_payload: Array.from(approvedBytes),
			verify_payload: signatureRequest.verifyPayload,
			algorithm: signatureRequest.algorithm ?? 'eddsa'
		},
		(status) => `The relayer could not sign the transaction (${status}).`
	);
	const successValue = json.signature;

	if (!successValue) throw new Error('The relayer did not return the MPC signature');

	// 3) difundimos la tx firmada por la MPC
	onStep('Broadcasting the transaction');
	// No usar `signer.sendTransaction`: hay dos copias de @near-js/transactions y
	// su `instanceof SignedTransaction` falla. Codificamos con la MISMA copia
	// que armó la tx y mandamos los bytes al RPC.
	const signature = new Uint8Array(FastAuthSignature.fromBase64(successValue).recover('ed25519'));
	const approvedTx = Transaction.decode(approvedBytes);
	const localBytes = Uint8Array.from(encodeTransaction(tx));

	if (!bytesEqual(approvedBytes, localBytes)) {
		throw new Error('Google approved a different transaction (stale signing token). Try again.');
	}

	const signedTx = new SignedTransaction({
		transaction: approvedTx,
		signature: new Signature({ keyType: KeyType.ED25519, data: signature })
	});

	return await broadcastTransaction(encodeTransaction(signedTx));
}

type SendTxResult = {
	final_execution_status?: string;
	transaction_outcome?: { id?: string };
	status?: { SuccessValue?: string; Failure?: unknown };
};

/** Envía una tx firmada al RPC y traduce los errores del nodo. */
async function broadcastTransaction(bytes: Uint8Array): Promise<{ hash: string | null }> {
	const result = await jsonRpc<SendTxResult>(
		'send_tx',
		{ signed_tx_base64: bytesToBase64(bytes), wait_until: 'EXECUTED' },
		{ id: 'runworld-nft-send', errorPrefix: 'The RPC rejected the transaction' }
	);
	const status = result.status;

	if (status && 'Failure' in status) {
		throw new Error(`The transaction failed: ${JSON.stringify(status.Failure).slice(0, 300)}`);
	}

	return { hash: result.transaction_outcome?.id ?? null };
}
