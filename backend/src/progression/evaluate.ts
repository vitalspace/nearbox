import type { StatsMissionsSnapshot } from '../stats/schema';
import {
	PROGRESSION_MISSIONS,
	PROGRESSION_TIERS,
	TIER_GATES,
	maxTierValue,
	missionById,
	rewardById,
	type MissionObjective,
	type ProgressionMission,
	type ProgressionMissionState,
	type ProgressionTier,
	type RewardClaimState,
	type StatMetric
} from './catalog';

export type MissionProgressEntry = {
	missionId: string;
	acceptedAt: number | null;
	completedAt: number | null;
	claimedAt: number | null;
	collectedIds: string[];
};

export type EvaluateInput = {
	reported: StatsMissionsSnapshot;
	attested: StatsMissionsSnapshot;
	progress: readonly MissionProgressEntry[];
	claims: readonly RewardClaimState[];
	ownedCatalogIds: Iterable<string>;
	now?: number;
};

export type EvaluateResult = {
	missions: ProgressionMissionState[];
	/** Misiones completadas por primera vez; el servicio persiste `completedAt`. */
	newlyCompleted: string[];
};

function metricValue(
	stats: StatsMissionsSnapshot,
	metric: StatMetric,
	completedCount: () => number
): number {
	switch (metric) {
		case 'cats.found':
			return stats.cats.catsFound;
		case 'cats.completed':
			return stats.cats.completed;
		case 'crypt.completed':
			return stats.crypt.completed;
		case 'crypt.deaths':
			return stats.crypt.deaths;
		case 'barn.kills':
			return stats.barn.kills;
		case 'barn.completed':
			return stats.barn.completed;
		case 'barn.waves':
			return stats.barn.waves;
		case 'race.finished':
			return stats.race.finished;
		case 'race.won':
			return stats.race.won;
		case 'race.podiums':
			return stats.race.podiums;
		case 'race.laps':
			return stats.race.laps;
		case 'royale.matches':
			return stats.royale.matches;
		case 'royale.wins':
			return stats.royale.wins;
		case 'royale.kills':
			return stats.royale.kills;
		case 'royale.top3':
			return stats.royale.top3;
		case 'hexfire.matches':
			return stats.hexfire.matches;
		case 'hexfire.wins':
			return stats.hexfire.wins;
		case 'hexfire.kills':
			return stats.hexfire.kills;
		case 'parkour.finishes':
			return stats.parkour.finishes;
		case 'parkour.wins':
			return stats.parkour.wins;
		case 'errands.completed':
			return stats.errands.completed;
		case 'missions.completed':
			return completedCount();
		default:
			return 0;
	}
}

function objectiveValue(
	mission: ProgressionMission,
	reported: StatsMissionsSnapshot,
	attested: StatsMissionsSnapshot,
	collectedIds: readonly string[],
	completed: ReadonlySet<string>,
	completedCount: () => number
): { value: number; target: number; requirementMet: boolean } {
	const objective = mission.objective;

	if (objective.type === 'stat') {
		const stats = mission.serverAttested ? attested : reported;
		const value = metricValue(stats, objective.metric, completedCount);
		const extraMet = (objective.also ?? []).every(
			(requirement) =>
				metricValue(stats, requirement.metric, completedCount) >= requirement.target
		);

		return {
			value,
			target: objective.target,
			requirementMet: value >= objective.target && extraMet
		};
	}

	if (objective.type === 'collect') {
		const collected = new Set(collectedIds);
		const value = objective.objectiveIds.filter((id) => collected.has(id)).length;

		return {
			value,
			target: objective.objectiveIds.length,
			requirementMet: value >= objective.objectiveIds.length
		};
	}

	const value = countMetaMissions(objective, completed);

	return {
		value,
		target: objective.target,
		requirementMet: value >= objective.target
	};
}

/**
 * Cuenta misiones completadas para una misión `meta`. Nunca cuenta otras
 * `meta`: así `tier-initiate` no se autoalimenta ni `tier-legend` suma medallas
 * de tramo.
 */
function countMetaMissions(
	objective: Extract<MissionObjective, { type: 'meta' }>,
	completed: ReadonlySet<string>
): number {
	let count = 0;

	for (const mission of PROGRESSION_MISSIONS) {
		if (mission.objective.type === 'meta') {
			continue;
		}

		if (!completed.has(mission.id)) {
			continue;
		}

		if (objective.track && mission.track !== objective.track) {
			continue;
		}

		if (objective.tracks && !objective.tracks.includes(mission.track)) {
			continue;
		}

		if (objective.tier && mission.tier !== objective.tier) {
			continue;
		}

		if (objective.maxTier && maxTierValue(mission.tier) > maxTierValue(objective.maxTier)) {
			continue;
		}

		count += 1;
	}

	return count;
}

function tierIndex(tier: ProgressionTier): number {
	return PROGRESSION_TIERS.indexOf(tier);
}

function tierLabel(tier: ProgressionTier): string {
	return tier;
}

/** Motivo por el que un tramo entero todavía no está disponible, o `null`. */
function tierLockReason(
	tier: ProgressionTier,
	completed: ReadonlySet<string>,
	owned: ReadonlySet<string>
): string | null {
	const gate = TIER_GATES[tier];
	const index = tierIndex(tier);

	if (gate.catalogId && !owned.has(gate.catalogId)) {
		const label = rewardById(gate.catalogId)?.title ?? gate.catalogId;
		return `Own ${label}`;
	}

	if (gate.missions > 0 && index > 0) {
		const previous = PROGRESSION_TIERS[index - 1];
		const count = PROGRESSION_MISSIONS.filter(
			(mission) => mission.tier === previous && completed.has(mission.id)
		).length;

		if (count < gate.missions) {
			return `Complete ${gate.missions} ${tierLabel(previous)} missions`;
		}
	}

	return null;
}

/** Motivo por el que una misión concreta está bloqueada, o `null` si no lo está. */
function missionLockReason(
	mission: ProgressionMission,
	completed: ReadonlySet<string>,
	owned: ReadonlySet<string>
): string | null {
	const gate = tierLockReason(mission.tier, completed, owned);

	if (gate) {
		return gate;
	}

	for (const requiredId of mission.unlock.missions ?? []) {
		if (!completed.has(requiredId)) {
			const required = missionById(requiredId);
			return required ? `Complete ${required.title}` : `Complete ${requiredId}`;
		}
	}

	for (const requirement of mission.unlock.nft ?? []) {
		if (!owned.has(requirement.catalogId)) {
			const label = rewardById(requirement.catalogId)?.title ?? requirement.catalogId;
			return `Own ${label}`;
		}
	}

	if (mission.unlock.tier) {
		const reason = tierLockReason(mission.unlock.tier, completed, owned);

		if (reason) {
			return reason;
		}
	}

	return null;
}

/**
 * Evalúa todo el catálogo. Las misiones se procesan por tramo ascendente y,
 * dentro de cada tramo, primero las normales y después las `meta`, porque sus
 * objetivos leen misiones ya completadas.
 */
export function evaluateProgression(input: EvaluateInput): EvaluateResult {
	const now = input.now ?? Date.now();
	const owned = new Set(input.ownedCatalogIds);
	const entries = new Map(input.progress.map((entry) => [entry.missionId, entry]));
	const claims = new Map(input.claims.map((claim) => [claim.missionId, claim]));
	const completed = new Set<string>();
	const newlyCompleted: string[] = [];
	const unlocked = new Map<string, boolean>();
	const reasons = new Map<string, string | null>();
	const values = new Map<string, { value: number; target: number }>();

	const completedCount = () => completed.size;

	const byTier = (tier: ProgressionTier) =>
		PROGRESSION_MISSIONS.filter((mission) => mission.tier === tier);

	const evaluate = (mission: ProgressionMission) => {
		const entry = entries.get(mission.id);
		const alreadyCompleted = Boolean(entry?.completedAt);
		const lockReason = missionLockReason(mission, completed, owned);

		unlocked.set(mission.id, lockReason === null);
		reasons.set(mission.id, lockReason);

		const { value, target, requirementMet } = objectiveValue(
			mission,
			input.reported,
			input.attested,
			entry?.collectedIds ?? [],
			completed,
			completedCount
		);

		values.set(mission.id, { value, target });

		// Una misión completada se queda completada aunque el jugador venda el
		// NFT-llave; el reclamo se vuelve a verificar por separado.
		if (alreadyCompleted || (lockReason === null && requirementMet)) {
			completed.add(mission.id);

			if (!alreadyCompleted) {
				newlyCompleted.push(mission.id);
			}
		}
	};

	for (const tier of PROGRESSION_TIERS) {
		const missions = byTier(tier);

		for (const mission of missions) {
			if (mission.objective.type !== 'meta') {
				evaluate(mission);
			}
		}

		for (const mission of missions) {
			if (mission.objective.type === 'meta') {
				evaluate(mission);
			}
		}
	}

	const missions: ProgressionMissionState[] = PROGRESSION_MISSIONS.map((mission) => {
		const entry = entries.get(mission.id);
		const claim = claims.get(mission.id) ?? null;
		const isCompleted = completed.has(mission.id);
		const isClaimed =
			isCompleted &&
			(Boolean(entry?.claimedAt) ||
				claim?.status === 'minted' ||
				claim?.status === 'already-owned');
		const { value, target } = values.get(mission.id) ?? { value: 0, target: 0 };
		const lockReason = reasons.get(mission.id) ?? null;
		const isUnlocked = unlocked.get(mission.id) ?? false;

		let status: ProgressionMissionState['status'];

		if (isClaimed) {
			status = 'claimed';
		} else if (isCompleted) {
			status = 'completed';
		} else if (entry?.acceptedAt) {
			status = 'active';
		} else if (isUnlocked) {
			status = 'available';
		} else {
			status = 'locked';
		}

		return {
			missionId: mission.id,
			status,
			value: Math.min(value, target),
			target,
			collectedIds:
				mission.objective.type === 'collect'
					? mission.objective.objectiveIds.filter((id) =>
							(entry?.collectedIds ?? []).includes(id)
						)
					: [],
			lockedReason: status === 'locked' ? lockReason : null,
			completedAt: isCompleted ? (entry?.completedAt ?? now) : null,
			claimedAt: isClaimed ? (entry?.claimedAt ?? claim?.updatedAt ?? now) : null,
			claim
		};
	});

	return { missions, newlyCompleted };
}
