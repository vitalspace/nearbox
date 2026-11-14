/** JSON POST compartido por login, firma y mint patrocinado. */

export class HttpError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(message: string, status: number, body: unknown = null) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
		this.body = body;
	}
}

export async function postJson<T>(
	url: string,
	body: unknown,
	fallbackError: (status: number) => string | string
): Promise<T> {
	let response: Response;

	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch (cause) {
		throw new HttpError(
			typeof fallbackError === 'function' ? fallbackError(0) : fallbackError,
			0,
			cause
		);
	}

	const json = (await response.json().catch(() => null)) as
		(T & { message?: string }) | null | undefined;

	if (!response.ok) {
		const message =
			json?.message ??
			(typeof fallbackError === 'function' ? fallbackError(response.status) : fallbackError);
		throw new HttpError(message, response.status, json ?? null);
	}

	return (json ?? {}) as T;
}

export async function getJson<T>(url: string, fallbackError: string): Promise<T> {
	const response = await fetch(url, { headers: { accept: 'application/json' } });
	const json = (await response.json().catch(() => null)) as
		(T & { message?: string }) | null | undefined;

	if (!response.ok) {
		throw new HttpError(
			json?.message ?? `${fallbackError} (${response.status})`,
			response.status,
			json
		);
	}

	return (json ?? {}) as T;
}
