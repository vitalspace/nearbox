/**
 * Acceso al RPC de NEAR sin cargar `near-api-js` en el bundle inicial.
 *
 * El login solo necesita consultar si la cuenta ya existe. Usamos `fetch`
 * directo para que `Guardian` pueda responder rápido antes de cargar los SDKs.
 */
import { NEAR_RPC_URL } from './config.ts';
import { errorMessage } from './errors.ts';
import { utf8ToBase64 } from './bytes.ts';

export type Finality = 'final' | 'optimistic';

type JsonRpcError = {
	code?: number;
	name?: string;
	message?: string;
	cause?: { name?: string; info?: Record<string, unknown> };
	data?: unknown;
};

type JsonRpcResponse<T> = {
	result?: T;
	error?: JsonRpcError;
};

type CallFunctionResult = {
	result?: number[];
	error?: string;
	logs?: string[];
};

export class NearRpcError extends Error {
	readonly rpcError: JsonRpcError;

	constructor(message: string, rpcError: JsonRpcError = {}) {
		super(message);
		this.name = 'NearRpcError';
		this.rpcError = rpcError;
	}
}

export async function jsonRpc<T>(
	method: string,
	params: Record<string, unknown>,
	options: { id?: string; errorPrefix?: string } | string = {}
): Promise<T> {
	const { id = 'runworld-client', errorPrefix = 'El RPC de NEAR' } =
		typeof options === 'string' ? { id: options } : options;
	let response: Response;

	try {
		response = await fetch(NEAR_RPC_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
		});
	} catch (error) {
		throw new NearRpcError(`${errorPrefix}: no se pudo conectar con ${NEAR_RPC_URL}`, {
			message: errorMessage(error)
		});
	}

	if (!response.ok) {
		throw new NearRpcError(`${errorPrefix}: el RPC respondió HTTP ${response.status}`);
	}

	const payload = (await response.json()) as JsonRpcResponse<T>;

	if (payload.error) {
		const message = payload.error.message ?? payload.error.cause?.name ?? 'Error del RPC de NEAR';
		const detail = payload.error.data
			? ` — ${JSON.stringify(payload.error.data).slice(0, 500)}`
			: '';
		throw new NearRpcError(`${message}${detail}`, payload.error);
	}

	if (payload.result === undefined) {
		throw new NearRpcError('El RPC de NEAR devolvió una respuesta vacía');
	}

	return payload.result;
}

/** Ejecuta un método view y devuelve el JSON decodificado. */
export async function view<T>(
	contractId: string,
	methodName: string,
	args: Record<string, unknown> = {},
	finality: Finality = 'final'
): Promise<T> {
	const result = await jsonRpc<CallFunctionResult>('query', {
		request_type: 'call_function',
		finality,
		account_id: contractId,
		method_name: methodName,
		args_base64: utf8ToBase64(JSON.stringify(args))
	});

	if (result.error) throw new NearRpcError(result.error);

	if (!result.result) throw new NearRpcError('Respuesta view inválida');

	return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T;
}

export type AccountState =
	{ exists: true; balanceYocto: string; storageUsage: number } | { exists: false };

function isUnknownAccount(error: unknown): boolean {
	if (!(error instanceof NearRpcError)) return false;

	if (error.rpcError.cause?.name === 'UNKNOWN_ACCOUNT') return true;

	return /UNKNOWN_ACCOUNT|does not exist while viewing/i.test(error.message);
}

export async function getAccountState(
	accountId: string,
	finality: Finality = 'final'
): Promise<AccountState> {
	try {
		const account = await jsonRpc<{ amount: string; storage_usage: number }>('query', {
			request_type: 'view_account',
			finality,
			account_id: accountId
		});

		return {
			exists: true,
			balanceYocto: account.amount,
			storageUsage: account.storage_usage
		};
	} catch (error) {
		if (isUnknownAccount(error)) return { exists: false };

		throw error;
	}
}

export function explorerAccountUrl(accountId: string): string {
	return `https://testnet.nearblocks.io/address/${accountId}`;
}

export function explorerTxUrl(hash: string): string {
	return `https://testnet.nearblocks.io/txns/${hash}`;
}

/** Igual que `view`, pero exige que la respuesta sea un array. */
export async function viewArray<T>(
	contractId: string,
	methodName: string,
	args: Record<string, unknown> = {},
	finality: Finality = 'final'
): Promise<T[]> {
	const value = await view<T[]>(contractId, methodName, args, finality);

	if (!Array.isArray(value)) {
		throw new NearRpcError(`${methodName} did not return an array`);
	}

	return value;
}

export type AccessKeyInfo = {
	publicKey: string;
	permission: unknown;
};

/**
 * Access keys de una cuenta ya existente. Devuelve `null` si la cuenta no
 * existe. Se usa para no apropiarse de un handle ajeno: la cuenta tiene que
 * contener la publicKey del jugador.
 */
export async function getAccessKeys(
	accountId: string,
	finality: Finality = 'final'
): Promise<AccessKeyInfo[] | null> {
	// Algunos RPC devuelven `keys: []` para cuentas inexistentes en vez de
	// `UNKNOWN_ACCOUNT`; se comprueba la existencia por separado.
	if (!(await getAccountState(accountId, finality)).exists) return null;

	const result = await jsonRpc<{
		keys: Array<{ public_key: string; access_key: { permission: unknown } }>;
	}>('query', {
		request_type: 'view_access_key_list',
		finality,
		account_id: accountId
	});

	return result.keys.map((entry) => ({
		publicKey: entry.public_key,
		permission: entry.access_key.permission
	}));
}
