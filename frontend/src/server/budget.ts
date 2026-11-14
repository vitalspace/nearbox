/**
 * Broadcast size guard.
 *
 * The realtime WS frame is hard-capped at 16 KiB (`MAX_BROADCAST_BYTES` in the
 * platform SDK). An oversized frame is not chunked: the platform cuts it, and
 * the client never sees the message. The engine snapshots are small enough on
 * paper, but "on paper" is exactly what a silent truncation punishes, so every
 * room checks what it is about to send and logs when it goes over.
 *
 * It only warns: never drops or rewrites a message.
 */

export const MAX_BROADCAST_BYTES = 16 * 1024;

const WARN_INTERVAL_MS = 10_000;

type Logger = {
	warn: (message: string, data?: Record<string, unknown>) => void;
};

export class ByteBudget {
	private readonly lastWarnAt = new Map<string, number>();

	constructor(private readonly log: Logger) {}

	/**
	 * Approximate wire size. Payloads here are ASCII (ids, numbers, fixed keys),
	 * so the UTF-16 length is a good stand-in for the byte count without
	 * allocating an encoder on every 10 Hz frame.
	 */
	check(message: unknown, now = Date.now()): void {
		if (typeof message !== 'object' || message === null) {
			return;
		}

		const type = (message as { type?: unknown }).type;

		if (typeof type !== 'string') {
			return;
		}

		let json: string;

		try {
			json = JSON.stringify(message);
		} catch {
			return;
		}

		const bytes = json.length;

		if (bytes <= MAX_BROADCAST_BYTES) {
			return;
		}

		const last = this.lastWarnAt.get(type) ?? 0;

		if (now - last < WARN_INTERVAL_MS) {
			return;
		}

		this.lastWarnAt.set(type, now);
		this.log.warn('broadcast exceeds the 16 KiB frame cap', {
			messageType: type,
			bytes,
			cap: MAX_BROADCAST_BYTES
		});
	}
}
