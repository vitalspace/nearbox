import { Elysia } from 'elysia';
import { z } from 'zod';
import { ensureMongo } from '../db/mongo';
import { OwnershipUnavailableError } from '../progression/ownership';
import {
	RewardAuthError,
	RewardCapacityError,
	RewardConflictError,
	RewardForbiddenError,
	RewardPendingError,
	RewardRateLimitError,
	RewardRequestError,
	claimReward,
	type RewardOptions
} from '../progression/rewards';
import { rewardMintStatus } from '../server/relayer';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const dailyBuckets = new Map<string, Bucket>();

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function clientIp(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for');

	if (forwarded) {
		return forwarded.split(',')[0]!.trim();
	}

	return request.headers.get('x-real-ip') ?? 'unknown';
}

function allow(
	store: Map<string, Bucket>,
	key: string,
	max: number,
	windowMs: number
): boolean {
	const now = Date.now();
	const current = store.get(key);

	if (!current || current.resetAt <= now) {
		store.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}

	if (current.count >= max) return false;

	current.count += 1;
	return true;
}

function cleanup(now: number): void {
	if (buckets.size < 500 && dailyBuckets.size < 500) return;

	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}

	for (const [key, bucket] of dailyBuckets) {
		if (bucket.resetAt <= now) dailyBuckets.delete(key);
	}
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const claimBodySchema = z.object({
	accountId: z.string().trim().min(1).max(64),
	publicKey: z.string().trim().min(1).max(80),
	missionId: z.string().trim().min(1).max(64),
	token: z.string().min(1),
	request_id: z.string().regex(UUID_PATTERN)
});

function invalid(set: { status?: number | string }, message: string, details?: unknown) {
	set.status = 400;
	return { error: 'INVALID_REWARD_PAYLOAD', message, details };
}

function unavailable(set: { status?: number | string }) {
	set.status = 503;
	return {
		error: 'PROGRESSION_UNAVAILABLE',
		message: 'The progression database is not available'
	};
}

function failure(set: { status?: number | string }, cause: unknown) {
	if (cause instanceof RewardPendingError) {
		set.status = 202;
		return {
			error: cause.code,
			message: cause.message,
			claim: cause.claim,
			minted: false,
			alreadyClaimed: false
		};
	}

	if (cause instanceof RewardAuthError) {
		set.status = 401;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof RewardForbiddenError) {
		set.status = 403;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof RewardConflictError) {
		set.status = 409;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof RewardRateLimitError) {
		set.status = 429;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof RewardCapacityError) {
		set.status = 503;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof OwnershipUnavailableError) {
		set.status = 503;
		return { error: cause.code, message: cause.message };
	}

	if (cause instanceof RewardRequestError) {
		set.status = 400;
		return { error: cause.code, message: cause.message };
	}

	const status = (cause as { status?: number }).status;
	const code = (cause as { code?: string }).code;

	if (status === 400 || status === 401 || status === 403 || status === 404) {
		set.status = status;
		return {
			error: code ?? 'REWARD_REQUEST_FAILED',
			message: cause instanceof Error ? cause.message : 'The reward request failed'
		};
	}

	console.error(
		'[rewards] claim failed:',
		cause instanceof Error ? cause.message : cause
	);
	set.status = 502;
	return {
		error: code ?? 'REWARD_MINT_FAILED',
		message: cause instanceof Error ? cause.message : 'The reward mint failed'
	};
}

export function createRewardsRoutes(options: RewardOptions = {}) {
	return new Elysia({ prefix: '/rewards' })
		.get('/status', async ({ set }) => {
			try {
				return await rewardMintStatus();
			} catch (cause) {
				set.status = 502;
				return {
					rewardMintAvailable: false,
					reason: 'error',
					budgetRemainingYocto: '0',
					dailyRemaining: 0,
					dailyLimit: 0,
					estimateYocto: '0',
					message: cause instanceof Error ? cause.message : String(cause)
				};
			}
		})
		.post('/claim', async ({ body, request, set }) => {
			const ip = clientIp(request);
			const now = Date.now();
			cleanup(now);

			const payload = claimBodySchema.safeParse(body);

			if (!payload.success) {
				return invalid(set, 'Invalid reward claim payload', payload.error.issues);
			}

			const input = payload.data;

			if (!allow(buckets, `claim:${ip}`, 10, MINUTE)) {
				set.status = 429;
				return { error: 'REWARD_RATE_LIMITED', message: 'Too many claim requests. Wait a minute.' };
			}

			if (!allow(buckets, `claim-account:${input.accountId}`, 5, MINUTE)) {
				set.status = 429;
				return {
					error: 'REWARD_RATE_LIMITED',
					message: 'Too many claims for this account. Wait a minute.'
				};
			}

			if (!allow(dailyBuckets, `claim:${input.accountId}`, 50, DAY)) {
				set.status = 429;
				return {
					error: 'REWARD_RATE_LIMITED',
					message: 'This account reached the daily reward claim limit (50).'
				};
			}

			if (!(await ensureMongo())) {
				return unavailable(set);
			}

			try {
				return await claimReward(
					{
						playerId: input.accountId,
						accountId: input.accountId,
						publicKey: input.publicKey,
						missionId: input.missionId,
						token: input.token,
						requestId: input.request_id
					},
					options
				);
			} catch (cause) {
				return failure(set, cause);
			}
		});
}

export const rewardsRoutes = createRewardsRoutes();
