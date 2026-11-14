import { describe, expect, test } from 'bun:test';
import {
	PROGRESSION_MISSIONS,
	catalogFingerprint,
	isRewardCatalog,
	isRewardOnlyCatalog,
	missionById,
	rewardById
} from '../src/progression/catalog';
import { evaluateProgression, type MissionProgressEntry } from '../src/progression/evaluate';
import { emptyMissions, type StatsMissionsSnapshot } from '../src/stats/schema';

function stats(overrides: Partial<StatsMissionsSnapshot> = {}): StatsMissionsSnapshot {
	return { ...emptyMissions(), ...overrides };
}

function stateOf(
	missions: ReturnType<typeof evaluateProgression>['missions'],
	id: string
) {
	const state = missions.find((entry) => entry.missionId === id);

	if (!state) {
		throw new Error(`missing state for ${id}`);
	}

	return state;
}

function evaluate(overrides: {
	reported?: Partial<StatsMissionsSnapshot>;
	attested?: Partial<StatsMissionsSnapshot>;
	progress?: MissionProgressEntry[];
	owned?: string[];
	claims?: Parameters<typeof evaluateProgression>[0]['claims'];
}) {
	return evaluateProgression({
		reported: stats(overrides.reported),
		attested: stats(overrides.attested),
		progress: overrides.progress ?? [],
		claims: overrides.claims ?? [],
		ownedCatalogIds: overrides.owned ?? [],
		now: 1_700_000_000_000
	});
}

describe('progression catalog', () => {
	test('has 42 missions and 20 unique cosmetic rewards', () => {
		expect(PROGRESSION_MISSIONS).toHaveLength(42);

		const rewards = new Set(
			PROGRESSION_MISSIONS.flatMap((mission) =>
				mission.reward ? [mission.reward.catalogId] : []
			)
		);

		expect(rewards.size).toBe(20);
		expect([...rewards].some((id) => id.startsWith('medal-'))).toBe(false);
		expect([...rewards].some((id) => id.startsWith('trophy-'))).toBe(false);
	});

	test('every mission reward exists exactly once in the catalog', () => {
		const ids = PROGRESSION_MISSIONS.map((mission) => mission.id);
		expect(new Set(ids).size).toBe(ids.length);

		for (const mission of PROGRESSION_MISSIONS) {
			if (mission.reward) {
				expect(missionById(mission.id)).not.toBeNull();
				expect(rewardById(mission.reward.catalogId)).not.toBeNull();
				expect(isRewardCatalog(mission.reward.catalogId)).toBe(true);
			}
		}
	});

	test('reward catalogs stay mintable through the shop', () => {
		expect(isRewardCatalog('shotgun-gold')).toBe(true);
		expect(isRewardOnlyCatalog('shotgun-gold')).toBe(false);
	});

	test('fingerprint is stable', () => {
		// Compartido con `frontend/src/lib/missions/progression.ts`.
		// `catalogParity.test.ts` compara ambos catálogos.
		expect(catalogFingerprint()).toBe('d4669fb7');
	});
});

describe('progression evaluation', () => {
	test('a new player sees T0 available and T1 locked', () => {
		const { missions } = evaluate({});

		expect(stateOf(missions, 'barn-first').status).toBe('available');
		expect(stateOf(missions, 'barn-kills-25').status).toBe('locked');
		expect(stateOf(missions, 'barn-kills-25').lockedReason).toBe(
			'Complete 2 T0 missions'
		);
	});

	test('attested stats complete a T0 mission but reported stats do not', () => {
		const reportedOnly = evaluate({
			reported: { barn: { ...emptyMissions().barn, completed: 1 } }
		});

		expect(stateOf(reportedOnly.missions, 'barn-first').status).toBe('available');

		const attested = evaluate({
			attested: { barn: { ...emptyMissions().barn, completed: 1 } }
		});

		expect(stateOf(attested.missions, 'barn-first').status).toBe('completed');
		expect(attested.newlyCompleted).toContain('barn-first');
	});

	test('two completed T0 missions unlock T1', () => {
		const progress: MissionProgressEntry[] = [
			{
				missionId: 'barn-first',
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			},
			{
				missionId: 'gp-first',
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			}
		];

		const { missions } = evaluate({ progress });

		expect(stateOf(missions, 'barn-kills-25').status).toBe('available');
		expect(stateOf(missions, 'tier-initiate').status).toBe('available');
	});

	test('T2 requires the Heroine cosmetic and three T1 missions', () => {
		const progress: MissionProgressEntry[] = [
			...['barn-first', 'gp-first', 'cats-first'].map((id) => ({
				missionId: id,
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			})),
			...['barn-kills-25', 'crypt-5', 'gp-podium-3'].map((id) => ({
				missionId: id,
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			}))
		];
		const attested = {
			barn: { ...emptyMissions().barn, kills: 25, completed: 1 },
			race: { ...emptyMissions().race, finished: 1 },
			cats: { ...emptyMissions().cats, catsFound: 1 }
		};

		const withoutMedal = evaluate({ progress, attested });
		expect(stateOf(withoutMedal.missions, 'barn-kills-100').lockedReason).toBe(
			'Own Heroine'
		);

		const withMedal = evaluate({
			progress,
			attested,
			owned: ['hero', 'shotgun-gold']
		});
		expect(stateOf(withMedal.missions, 'barn-kills-100').status).toBe('available');
	});

	test('a completed mission stays completed after selling its key NFT', () => {
		const progress: MissionProgressEntry[] = [
			{
				missionId: 'barn-kills-25',
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			}
		];

		const { missions } = evaluate({
			progress,
			attested: { barn: { ...emptyMissions().barn, kills: 30 } }
		});

		expect(stateOf(missions, 'barn-kills-25').status).toBe('completed');
	});

	test('claimed missions report the claim state', () => {
		const progress: MissionProgressEntry[] = [
			{
				missionId: 'barn-first',
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: 2,
				collectedIds: []
			}
		];

		const { missions } = evaluate({
			progress,
			attested: { barn: { ...emptyMissions().barn, completed: 1 } },
			claims: [
				{
					claimId: 'claim-1',
					missionId: 'barn-first',
					catalogId: 'shotgun-gold',
					status: 'minted',
					tokenId: 'shotgun-gold#1',
					serial: 1,
					txHash: 'tx',
					error: null,
					createdAt: 2,
					updatedAt: 2
				}
			]
		});

		expect(stateOf(missions, 'barn-first').status).toBe('claimed');
	});

	test('collect missions only count known objective ids', () => {
		const { missions } = evaluate({
			progress: [
				{
					missionId: 'alba-moonflowers',
					acceptedAt: 1,
					completedAt: null,
					claimedAt: null,
					collectedIds: ['moon-01', 'moon-02', 'not-a-moon']
				}
			]
		});

		const state = stateOf(missions, 'alba-moonflowers');

		expect(state.value).toBe(2);
		expect(state.target).toBe(5);
		expect(state.collectedIds).toEqual(['moon-01', 'moon-02']);
	});

	test('tier-initiate needs four T1 missions and does not count meta missions', () => {
		const t1 = ['barn-kills-25', 'crypt-5', 'gp-podium-3', 'hexfire-wins-5'];
		const progress: MissionProgressEntry[] = [
			...['barn-first', 'gp-first'].map((id) => ({
				missionId: id,
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			})),
			...t1.map((id) => ({
				missionId: id,
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			}))
		];

		const { missions, newlyCompleted } = evaluate({ progress });

		expect(stateOf(missions, 'tier-initiate').value).toBe(4);
		expect(newlyCompleted).toContain('tier-initiate');
	});

	test('tier-legend requires all six T3 minigame missions', () => {
		const t3 = [
			'barn-kills-250',
			'royale-kills-200',
			'gp-wins-10',
			'hexfire-wins-50',
			'parkour-wins-25',
			'crypt-50'
		];
		const base = ['barn-first', 'gp-first'];
		const progress: MissionProgressEntry[] = [...base, ...t3].map((id) => ({
			missionId: id,
			acceptedAt: 1,
			completedAt: 1,
			claimedAt: null,
			collectedIds: []
		}));
		const owned = ['hero', 'crow-warden', 'pumpkin-king'];

		const { missions } = evaluate({ progress, owned });

		expect(stateOf(missions, 'tier-legend').value).toBe(6);
		expect(stateOf(missions, 'tier-legend').target).toBe(6);
	});

	test('tier-legend does not count the explorer T3 mission', () => {
		const progress: MissionProgressEntry[] = [
			...[
				'barn-kills-250',
				'royale-kills-200',
				'gp-wins-10',
				'hexfire-wins-50',
				'parkour-wins-25'
			].map((id) => ({
				missionId: id,
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			})),
			{
				missionId: 'explorer-all',
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			}
		];

		const { missions } = evaluate({ progress });

		expect(stateOf(missions, 'tier-legend').value).toBe(5);
		expect(stateOf(missions, 'tier-legend').status).not.toBe('completed');
	});

	test('royale-kills-200 also requires five wins', () => {
		const progress: MissionProgressEntry[] = [
			...['barn-first', 'gp-first'].map((id) => ({
				missionId: id,
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			})),
			...['barn-kills-25', 'crypt-5', 'gp-podium-3'].map((id) => ({
				missionId: id,
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			})),
			...['barn-kills-100', 'royale-kills-50', 'hexfire-wins-20'].map((id) => ({
				missionId: id,
				acceptedAt: 1,
				completedAt: 1,
				claimedAt: null,
				collectedIds: []
			}))
		];
		const owned = ['hero', 'crow-warden', 'bazooka-gold'];

		const killsOnly = evaluate({
			progress,
			owned,
			attested: {
				royale: {
					...emptyMissions().royale,
					kills: 200,
					wins: 4
				}
			}
		});

		expect(stateOf(killsOnly.missions, 'royale-kills-200').status).toBe('available');

		const withWins = evaluate({
			progress,
			owned,
			attested: {
				royale: {
					...emptyMissions().royale,
					kills: 200,
					wins: 5
				}
			}
		});

		expect(stateOf(withWins.missions, 'royale-kills-200').status).toBe('completed');
	});
});
