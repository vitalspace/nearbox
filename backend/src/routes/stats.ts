import { Elysia } from 'elysia';
import { STATS_EVENTS_TTL_DAYS } from '../db/models/statsEvent';
import { ensureMongo, isMongoReady, mongoStateName } from '../db/mongo';
import { verifySessionToken } from '../server/sessionToken';
import {
	StatsAuthError,
	StatsForbiddenError,
	StatsRequestError,
	readBearerSubject,
	type TokenVerifier
} from '../stats/identity';
import {
	statsEventsBodySchema,
	statsMergeSchema,
	statsPlayerIdSchema,
	statsSnapshotSchema
} from '../stats/schema';
import {
	applyEvents,
	applySnapshot,
	ensureStatsOwnership,
	getLeaderboard,
	getOrCreateStats,
	mergeStatsFrom,
	resetStats
} from '../stats/service';

type StatusCarrier = {
	status?: number | string;
};

export type StatsClaims = { sub: string };

/** Inyectable para que los tests no dependan del JWKS real de Auth0. */
export type StatsTokenVerifier = TokenVerifier;

function unavailable(set: StatusCarrier) {
	set.status = 503;
	return {
		error: 'STATS_UNAVAILABLE',
		message: 'The stats database is not available'
	};
}

function invalid(set: StatusCarrier, message: string, details?: unknown) {
	set.status = 400;
	return {
		error: 'INVALID_STATS_PAYLOAD',
		message,
		details
	};
}

function statsFailure(set: StatusCarrier, cause: unknown) {
	if (cause instanceof StatsAuthError) {
		set.status = 401;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof StatsForbiddenError) {
		set.status = 403;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof StatsRequestError) {
		set.status = 400;
		return { error: cause.code, message: cause.message };
	}

	throw cause;
}

function parsePlayerId(raw: string) {
	return statsPlayerIdSchema.safeParse(raw);
}

export function createStatsRoutes(verifyToken: StatsTokenVerifier = verifySessionToken) {
	return new Elysia({ prefix: '/stats' })
		.get('/health', async ({ set }) => {
			const connected = await ensureMongo();

			if (!connected) {
				set.status = 503;
				return {
					ok: false,
					state: mongoStateName(),
					eventsTtlDays: STATS_EVENTS_TTL_DAYS
				};
			}

			return {
				ok: isMongoReady(),
				state: mongoStateName(),
				eventsTtlDays: STATS_EVENTS_TTL_DAYS
			};
		})
		// Public Top 3 used by the podium in the world map. Must stay before
		// `/:playerId`, which would otherwise capture "leaderboard" as an id.
		.get('/leaderboard', async ({ query, set }) => {
			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			const rawLimit = Number(query.limit);
			const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 20)) : 10;

			return { players: await getLeaderboard(limit) };
		})
		.get('/:playerId', async ({ params, request, set }) => {
			const playerId = parsePlayerId(params.playerId);

			if (!playerId.success) {
				return invalid(set, 'Invalid player id', playerId.error.issues);
			}

			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			try {
				const subject = await readBearerSubject(request, verifyToken);

				await ensureStatsOwnership(playerId.data, subject);

				return await getOrCreateStats(playerId.data, subject);
			} catch (cause) {
				return statsFailure(set, cause);
			}
		})
		// Snapshot sync: useful to migrate the client's `localStorage` state.
		// Counters only grow; `reset` is the only way to go back to zero.
		.put('/:playerId', async ({ params, body, request, set }) => {
			const playerId = parsePlayerId(params.playerId);

			if (!playerId.success) {
				return invalid(set, 'Invalid player id', playerId.error.issues);
			}

			const payload = statsSnapshotSchema.safeParse(body);

			if (!payload.success) {
				return invalid(set, 'Invalid stats snapshot', payload.error.issues);
			}

			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			try {
				const subject = await readBearerSubject(request, verifyToken);

				await ensureStatsOwnership(playerId.data, subject);

				return await applySnapshot(playerId.data, payload.data.missions, subject, {
					alias: payload.data.alias,
					skin: payload.data.skin
				});
			} catch (cause) {
				return statsFailure(set, cause);
			}
		})
		.post('/:playerId/events', async ({ params, body, request, set }) => {
			const playerId = parsePlayerId(params.playerId);

			if (!playerId.success) {
				return invalid(set, 'Invalid player id', playerId.error.issues);
			}

			const payload = statsEventsBodySchema.safeParse(body);

			if (!payload.success) {
				return invalid(set, 'Invalid stats events', payload.error.issues);
			}

			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			try {
				const subject = await readBearerSubject(request, verifyToken);

				await ensureStatsOwnership(playerId.data, subject);

				const result = await applyEvents(playerId.data, payload.data.events, subject);

				return {
					ok: true,
					applied: result.applied,
					stats: result.snapshot
				};
			} catch (cause) {
				return statsFailure(set, cause);
			}
		})
		.post('/:playerId/reset', async ({ params, request, set }) => {
			const playerId = parsePlayerId(params.playerId);

			if (!playerId.success) {
				return invalid(set, 'Invalid player id', playerId.error.issues);
			}

			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			try {
				const subject = await readBearerSubject(request, verifyToken);

				await ensureStatsOwnership(playerId.data, subject);

				const snapshot = await resetStats(playerId.data, subject);

				return { ok: true, stats: snapshot };
			} catch (cause) {
				return statsFailure(set, cause);
			}
		})
		// One-way migration: merges a legacy UUID into the authenticated account.
		.post('/:playerId/merge', async ({ params, body, request, set }) => {
			const playerId = parsePlayerId(params.playerId);

			if (!playerId.success) {
				return invalid(set, 'Invalid player id', playerId.error.issues);
			}

			const payload = statsMergeSchema.safeParse(body);

			if (!payload.success) {
				return invalid(set, 'Invalid merge payload', payload.error.issues);
			}

			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			try {
				const subject = await readBearerSubject(request, verifyToken);

				await ensureStatsOwnership(playerId.data, subject);

				const snapshot = await mergeStatsFrom(
					playerId.data,
					payload.data.fromPlayerId,
					subject
				);

				return { ok: true, stats: snapshot };
			} catch (cause) {
				return statsFailure(set, cause);
			}
		});
}

export const statsRoutes = createStatsRoutes();
