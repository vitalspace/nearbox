/** Sondeo corto tras una transacción (optimistic → final). */

export type PollOptions = {
	attempts?: number;
	delayMs?: number;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil<T>(
	fn: () => Promise<T>,
	done: (value: T) => boolean,
	options: PollOptions = {}
): Promise<T> {
	const attempts = options.attempts ?? 20;
	const delayMs = options.delayMs ?? 300;
	let last: T | undefined;

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		last = await fn();

		if (done(last)) return last;

		if (attempt < attempts - 1) await sleep(delayMs);
	}

	return last as T;
}
