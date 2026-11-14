/**
 * What an engine needs from the room that hosts it.
 *
 * In the old backend an engine received `{ publish, reportError, ... }` and
 * published to an Elysia topic. A room is already a topic, so the port only
 * exposes its broadcast primitives.
 */
export type RoomPort = {
	broadcast(message: unknown): void;
	sendTo(playerId: string, message: unknown): void;
};

/** Engines take the clock as a parameter for tests; this is the default. */
export function now(): number {
	return Date.now();
}
