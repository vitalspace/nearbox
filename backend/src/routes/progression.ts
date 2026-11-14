import { Elysia } from 'elysia';
import { ensureMongo } from '../db/mongo';
import { verifyAuth0Jwt } from '../server/auth0';
import {
	StatsAuthError,
	StatsForbiddenError,
	StatsRequestError,
	isUuidPlayerId,
	readBearerSubject,
	type TokenVerifier
} from '../stats/identity';
import { ensureStatsOwnership } from '../stats/service';
import {
	PROGRESSION_MISSIONS,
	PROGRESSION_TIERS,
	PROGRESSION_VERSION,
	REWARD_CATALOG,
	TIER_GATES,
	catalogFingerprint
} from '../progression/catalog';
import { OwnershipUnavailableError } from '../progression/ownership';
import {
	errandSyncSchema,
	missionProgressBodySchema,
	progressionPlayerIdSchema
} from '../progression/schema';
import {
	ProgressionConflictError,
	ProgressionRequestError,
	acceptMission,
	abandonMission,
	loadProgression,
	recordCollected,
	syncErrands,
	syncLegacy,
	type ProgressionOptions
} from '../progression/service';

type StatusCarrier = { status?: number | string };

function unavailable(set: StatusCarrier) {
	set.status = 503;
	return {
		error: 'PROGRESSION_UNAVAILABLE',
		message: 'The progression database is not available'
	};
}

function invalid(set: StatusCarrier, message: string, details?: unknown) {
	set.status = 400;
	return { error: 'INVALID_PROGRESSION_PAYLOAD', message, details };
}

function progressionFailure(set: StatusCarrier, cause: unknown) {
	if (cause instanceof StatsAuthError) {
		set.status = 401;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof StatsForbiddenError) {
		set.status = 403;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof OwnershipUnavailableError) {
		set.status = 503;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof ProgressionRequestError) {
		set.status = 400;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof ProgressionConflictError) {
		set.status = 409;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof StatsRequestError) {
		set.status = 400;
		return { error: cause.code, message: cause.message };
	}

	throw cause;
}

/** The playerId is the on-chain account for non-legacy ids. */
function accountIdForPlayer(playerId: string): string | null {
	return isUuidPlayerId(playerId) ? null : playerId;
}

function parsePlayerId(raw: string) {
	return progressionPlayerIdSchema.safeParse(raw);
}

export function createProgressionRoutes(
	verifyToken: TokenVerifier = verifyAuth0Jwt,
	options: ProgressionOptions = {}
) {
	return new Elysia({ prefix: '/progression' })
		// Public catalogs: the HUD can render missions before signing in.
		.get('/catalog', () => ({
			version: PROGRESSION_VERSION,
			fingerprint: catalogFingerprint(),
			tiers: PROGRESSION_TIERS,
			gates: TIER_GATES,
			missions: PROGRESSION_MISSIONS,
			rewards: REWARD_CATALOG
		}))
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

				return await loadProgression(
					playerId.data,
					subject,
					accountIdForPlayer(playerId.data),
					options
				);
			} catch (cause) {
				return progressionFailure(set, cause);
			}
		})
		.get('/:playerId/claims', async ({ params, request, set }) => {
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

				const snapshot = await loadProgression(
					playerId.data,
					subject,
					accountIdForPlayer(playerId.data),
					options
				);

				return { claims: snapshot.claims };
			} catch (cause) {
				return progressionFailure(set, cause);
			}
		})
		.post('/:playerId/sync', async ({ params, body, request, set }) => {
			const playerId = parsePlayerId(params.playerId);

			if (!playerId.success) {
				return invalid(set, 'Invalid player id', playerId.error.issues);
			}

			const payload = errandSyncSchema.safeParse(body);

			if (!payload.success) {
				return invalid(set, 'Invalid errand sync payload', payload.error.issues);
			}

			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			try {
				const subject = await readBearerSubject(request, verifyToken);

				await ensureStatsOwnership(playerId.data, subject);

				await syncErrands(
					playerId.data,
					accountIdForPlayer(playerId.data),
					payload.data.errands
				);

				if (payload.data.legacyCompleted && payload.data.legacyCompleted.length > 0) {
					await syncLegacy(
						playerId.data,
						accountIdForPlayer(playerId.data),
						payload.data.legacyCompleted
					);
				}

				return { ok: true };
			} catch (cause) {
				return progressionFailure(set, cause);
			}
		})
		.post('/:playerId/missions/:missionId/accept', async ({ params, request, set }) => {
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
				await acceptMission(
					playerId.data,
					accountIdForPlayer(playerId.data),
					params.missionId
				);

				return { ok: true };
			} catch (cause) {
				return progressionFailure(set, cause);
			}
		})
		.post('/:playerId/missions/:missionId/abandon', async ({ params, request, set }) => {
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
				await abandonMission(
					playerId.data,
					accountIdForPlayer(playerId.data),
					params.missionId
				);

				return { ok: true };
			} catch (cause) {
				return progressionFailure(set, cause);
			}
		})
		.post('/:playerId/missions/:missionId/progress', async ({ params, body, request, set }) => {
			const playerId = parsePlayerId(params.playerId);

			if (!playerId.success) {
				return invalid(set, 'Invalid player id', playerId.error.issues);
			}

			const payload = missionProgressBodySchema.safeParse(body);

			if (!payload.success) {
				return invalid(set, 'Invalid mission progress payload', payload.error.issues);
			}

			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			try {
				const subject = await readBearerSubject(request, verifyToken);

				await ensureStatsOwnership(playerId.data, subject);
				await recordCollected(
					playerId.data,
					accountIdForPlayer(playerId.data),
					params.missionId,
					payload.data.collectedIds
				);

				return { ok: true };
			} catch (cause) {
				return progressionFailure(set, cause);
			}
		});
}

export const progressionRoutes = createProgressionRoutes();
