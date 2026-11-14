import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { closeMongo, ensureMongo } from '../src/db/mongo';
import { MissionProgress } from '../src/db/models/missionProgress';
import { PlayerStats } from '../src/db/models/playerStats';
import { RewardClaim } from '../src/db/models/rewardClaim';
import { OwnershipUnavailableError } from '../src/progression/ownership';
import {
	RewardAuthError,
	RewardCapacityError,
	RewardConflictError,
	RewardForbiddenError,
	claimReward,
	type RewardClaimInput,
	type RewardOptions
} from '../src/progression/rewards';
import { emptyMissions } from '../src/stats/schema';

const fallback = 'mongodb://127.0.0.1:27017/nearbox_test';
const testUri = process.env.MONGODB_URI_TEST?.trim() || fallback;

if (!/(_test)(\?|$)/.test(testUri)) {
	throw new Error('MONGODB_URI_TEST must point to a database whose name ends with _test');
}

process.env.MONGODB_URI = testUri;

const connected = await ensureMongo();
const suite = connected ? describe : describe.skip;

const ACCOUNT = 't-rewards-test.testnet';
const SUBJECT = 'auth0|rewards-test';
const OTHER_SUBJECT = 'auth0|other';
const PUBLIC_KEY = 'ed25519:11111111111111111111111111111111';

let mintCalls = 0;

function baseInput(overrides: Partial<RewardClaimInput> = {}): RewardClaimInput {
	return {
		playerId: ACCOUNT,
		accountId: ACCOUNT,
		publicKey: PUBLIC_KEY,
		missionId: 'barn-kills-25',
		token: 'valid-token',
		requestId: crypto.randomUUID(),
		...overrides
	};
}

function options(overrides: RewardOptions = {}): RewardOptions {
	return {
		verifyToken: async (token) => {
			if (token !== 'valid-token') {
				throw new Error('Invalid token');
			}

			return { sub: SUBJECT };
		},
		loadOwnedTokens: async () => [],
		assertOwned: async () => {},
		mint: async () => {
			mintCalls += 1;

			return {
				tokenId: 'shotgun-gold#7',
				serial: 7,
				txHash: 'tx-hash',
				budgetRemainingYocto: '100000000000000000000',
				dailyRemaining: 59
			};
		},
		...overrides
	};
}

async function seedCompletedTier0(): Promise<void> {
	await MissionProgress.create({
		playerId: ACCOUNT,
		accountId: ACCOUNT,
		missions: [
			{
				missionId: 'barn-first',
				acceptedAt: new Date(),
				completedAt: new Date(),
				claimedAt: null,
				collectedIds: []
			},
			{
				missionId: 'royale-first',
				acceptedAt: new Date(),
				completedAt: new Date(),
				claimedAt: null,
				collectedIds: []
			}
		]
	});
}

async function seedBarnKills(kills: number): Promise<void> {
	await PlayerStats.updateOne(
		{ playerId: ACCOUNT },
		{
			$set: {
				playerId: ACCOUNT,
				subject: SUBJECT,
				version: 2,
				missions: emptyMissions(),
				attested: {
					...emptyMissions(),
					barn: {
						...emptyMissions().barn,
						kills,
						completed: 1
					}
				}
			}
		},
		{ upsert: true, timestamps: false }
	);
}

async function readyMission(kills = 25): Promise<void> {
	await seedCompletedTier0();
	await seedBarnKills(kills);
}

suite('progression rewards', () => {
	beforeEach(async () => {
		mintCalls = 0;
		await Promise.all([
			MissionProgress.deleteMany({ playerId: ACCOUNT }),
			PlayerStats.deleteMany({ playerId: ACCOUNT }),
			RewardClaim.deleteMany({ playerId: ACCOUNT })
		]);
	});

	afterAll(async () => {
		await Promise.all([
			MissionProgress.deleteMany({ playerId: ACCOUNT }),
			PlayerStats.deleteMany({ playerId: ACCOUNT }),
			RewardClaim.deleteMany({ playerId: ACCOUNT })
		]);
		await closeMongo();
	});

	test('mints the reward for a completed mission', async () => {
		await readyMission();

		const result = await claimReward(baseInput(), options());

		expect(result.minted).toBe(true);
		expect(result.alreadyClaimed).toBe(false);
		expect(result.claim.status).toBe('minted');
		expect(result.claim.tokenId).toBe('shotgun-gold#7');
		expect(result.claim.serial).toBe(7);
		expect(result.claim.txHash).toBe('tx-hash');
		expect(mintCalls).toBe(1);

		const mission = await MissionProgress.findOne({ playerId: ACCOUNT }).lean<any>();
		const barn = mission?.missions?.find((entry: any) => entry.missionId === 'barn-kills-25');
		expect(barn?.claimedAt).toBeTruthy();
	});

	test('is idempotent for the same mission', async () => {
		await readyMission();

		const first = await claimReward(baseInput(), options());
		const second = await claimReward(baseInput(), options());

		expect(first.minted).toBe(true);
		expect(second.minted).toBe(false);
		expect(second.alreadyClaimed).toBe(true);
		expect(second.claim.tokenId).toBe(first.claim.tokenId);
		expect(mintCalls).toBe(1);
		expect(await RewardClaim.countDocuments({ playerId: ACCOUNT })).toBe(1);
	});

	test('two concurrent claims mint once and share the token', async () => {
		await readyMission();

		const mint = async () => {
			mintCalls += 1;
			// Mantiene el claim en `minting` para que la segunda pestaña llegue
			// mientras el primer mint sigue en vuelo.
			await new Promise((resolve) => setTimeout(resolve, 200));

			return {
				tokenId: 'shotgun-gold#9',
				serial: 9,
				txHash: 'tx-concurrent',
				budgetRemainingYocto: '100000000000000000000',
				dailyRemaining: 58
			};
		};

		const results = await Promise.all([
			claimReward(baseInput(), options({ mint })),
			claimReward(baseInput(), options({ mint }))
		]);

		expect(mintCalls).toBe(1);
		expect(results.filter((result) => result.minted)).toHaveLength(1);
		expect(new Set(results.map((result) => result.claim.tokenId)).size).toBe(1);
	});

	test('does not mint a mission that is not completed', async () => {
		await seedCompletedTier0();

		await expect(claimReward(baseInput(), options())).rejects.toBeInstanceOf(
			RewardConflictError
		);
		expect(mintCalls).toBe(0);
	});

	test('rejects a mission whose NFT gate is not owned', async () => {
		await readyMission(100);

		await expect(
			claimReward(
				baseInput({ missionId: 'barn-kills-100' }),
				options()
			)
		).rejects.toBeInstanceOf(RewardForbiddenError);
		expect(mintCalls).toBe(0);
	});

	test('marks the claim already-owned when the per-account cap is reached', async () => {
		await readyMission();

		const result = await claimReward(
			baseInput(),
			options({
				loadOwnedTokens: async () => [
					{ tokenId: 'shotgun-gold#1', catalogId: 'shotgun-gold', serial: 1 },
					{ tokenId: 'shotgun-gold#2', catalogId: 'shotgun-gold', serial: 2 },
					{ tokenId: 'shotgun-gold#3', catalogId: 'shotgun-gold', serial: 3 }
				]
			})
		);

		expect(result.minted).toBe(false);
		expect(result.alreadyClaimed).toBe(true);
		expect(result.claim.status).toBe('already-owned');
		expect(result.claim.tokenId).toBe('shotgun-gold#1');
		expect(mintCalls).toBe(0);
	});

	test('keeps the claim pending when the reward budget is exhausted', async () => {
		await readyMission();

		const capacity = new Error('The reward mint budget is exhausted');
		(capacity as Error & { status?: number; code?: string }).status = 503;
		(capacity as Error & { status?: number; code?: string }).code = 'REWARD_CAPACITY';

		await expect(
			claimReward(
				baseInput(),
				options({
					mint: async () => {
						throw capacity;
					}
				})
			)
		).rejects.toBeInstanceOf(RewardCapacityError);

		const pending = await RewardClaim.findOne({ playerId: ACCOUNT }).lean<any>();
		expect(pending?.status).toBe('pending');
		expect(pending?.error).toContain('budget');

		const retried = await claimReward(baseInput(), options());
		expect(retried.minted).toBe(true);
		expect(retried.claim.status).toBe('minted');
	});

	test('fails closed when ownership cannot be verified', async () => {
		await readyMission();

		await expect(
			claimReward(
				baseInput(),
				options({
					loadOwnedTokens: async () => {
						throw new OwnershipUnavailableError();
					}
				})
			)
		).rejects.toBeInstanceOf(OwnershipUnavailableError);

		expect(await RewardClaim.countDocuments({ playerId: ACCOUNT })).toBe(0);
		expect(mintCalls).toBe(0);
	});

	test('rejects an accountId that is not derived from the public key', async () => {
		await readyMission();

		const forbidden = new Error('Account is not owned by this key');
		(forbidden as Error & { status?: number }).status = 403;

		await expect(
			claimReward(
				baseInput({ accountId: 't-someone-else.testnet' }),
				options({
					assertOwned: async () => {
						throw forbidden;
					}
				})
			)
		).rejects.toBeInstanceOf(RewardForbiddenError);
		expect(mintCalls).toBe(0);
	});

	test('ignores client-supplied counters in the claim body', async () => {
		await seedCompletedTier0();

		await expect(
			claimReward(
				{ ...baseInput(), value: 999999, kills: 999999 } as RewardClaimInput,
				options()
			)
		).rejects.toBeInstanceOf(RewardConflictError);
		expect(mintCalls).toBe(0);
	});

	test('rejects an invalid JWT', async () => {
		await readyMission();

		await expect(
			claimReward(
				baseInput({ token: 'bad-token' }),
				options()
			)
		).rejects.toBeInstanceOf(RewardAuthError);
		expect(mintCalls).toBe(0);
	});

	test('rejects when the session subject does not own the stats', async () => {
		await readyMission();

		await expect(
			claimReward(
				baseInput(),
				options({
					verifyToken: async () => ({ sub: OTHER_SUBJECT })
				})
			)
		).rejects.toBeTruthy();
		expect(mintCalls).toBe(0);
	});
});
