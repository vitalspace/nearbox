import { MissionProgress } from '../db/models/missionProgress';
import { RewardClaim } from '../db/models/rewardClaim';
import { getOrCreateStats } from '../stats/service';
import type { StatsMissionsSnapshot } from '../stats/schema';
import {
	missionById,
	type ProgressionMissionState,
	type RewardClaimState
} from './catalog';
import { evaluateProgression, type MissionProgressEntry } from './evaluate';
import { OwnershipUnavailableError, ownedCatalogIdsFor } from './ownership';

export type ProgressSnapshot = {
	version: 1;
	playerId: string;
	accountId: string | null;
	stats: { reported: StatsMissionsSnapshot; attested: StatsMissionsSnapshot };
	missions: ProgressionMissionState[];
	claims: RewardClaimState[];
	ownedCatalogIds: string[];
	/** El RPC de posesión falló: las misiones con NFT quedan bloqueadas, no minteables. */
	ownershipUnverified?: boolean;
	serverTime: number;
};

export type ProgressionOptions = {
	/** Inyectable en tests; por defecto consulta el contrato NFT. */
	loadOwnedCatalogIds?: (accountId: string) => Promise<string[]>;
};

export class ProgressionRequestError extends Error {
	readonly status = 400;
	readonly code = 'INVALID_PROGRESSION_REQUEST';

	constructor(message: string) {
		super(message);
		this.name = 'ProgressionRequestError';
	}
}

export class ProgressionConflictError extends Error {
	readonly status = 409;
	readonly code = 'PROGRESSION_CONFLICT';

	constructor(message: string) {
		super(message);
		this.name = 'ProgressionConflictError';
	}
}

type LeanProgress = {
	playerId: string;
	accountId?: string | null;
	missions?: Array<{
		missionId: string;
		acceptedAt?: Date | null;
		completedAt?: Date | null;
		claimedAt?: Date | null;
		collectedIds?: string[];
	}>;
};

export type LeanClaim = {
	claimId: string;
	missionId: string;
	catalogId: string;
	status: string;
	tokenId?: string | null;
	serial?: number | null;
	txHash?: string | null;
	error?: string | null;
	createdAt?: Date;
	updatedAt?: Date;
};

function timeMs(value: Date | null | undefined): number | null {
	if (!value) {
		return null;
	}

	const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
	return Number.isFinite(time) ? time : null;
}

export function toEntries(doc: LeanProgress | null): MissionProgressEntry[] {
	return (doc?.missions ?? []).map((entry) => ({
		missionId: entry.missionId,
		acceptedAt: timeMs(entry.acceptedAt),
		completedAt: timeMs(entry.completedAt),
		claimedAt: timeMs(entry.claimedAt),
		collectedIds: [...new Set(entry.collectedIds ?? [])]
	}));
}

export function toClaimState(claim: LeanClaim): RewardClaimState {
	return {
		claimId: claim.claimId,
		missionId: claim.missionId,
		catalogId: claim.catalogId,
		status: claim.status as RewardClaimState['status'],
		tokenId: claim.tokenId ?? null,
		serial: claim.serial ?? null,
		txHash: claim.txHash ?? null,
		error: claim.error ?? null,
		createdAt: timeMs(claim.createdAt) ?? 0,
		updatedAt: timeMs(claim.updatedAt) ?? 0
	};
}

async function loadProgressDoc(playerId: string, accountId: string | null): Promise<LeanProgress> {
	const setOnInsert: Record<string, unknown> = {
		playerId,
		missions: [],
		migratedFromLocalAt: null
	};

	if (!accountId) {
		setOnInsert.accountId = null;
	}

	const update: Record<string, unknown> = { $setOnInsert: setOnInsert };

	if (accountId) {
		update.$set = { accountId };
	}

	const doc = await MissionProgress.findOneAndUpdate({ playerId }, update, {
		upsert: true,
		returnDocument: 'after',
		lean: true,
		timestamps: false
	}).lean<LeanProgress>();

	return doc ?? { playerId, accountId, missions: [] };
}

async function loadClaims(playerId: string): Promise<RewardClaimState[]> {
	const claims = await RewardClaim.find({ playerId }).lean<LeanClaim[]>();
	return claims.map(toClaimState);
}

/** Guarda `completedAt` sin duplicar entradas concurrentes. */
async function persistCompleted(playerId: string, missionId: string, at: number): Promise<void> {
	const date = new Date(at);

	const updated = await MissionProgress.updateOne(
		{ playerId, 'missions.missionId': missionId },
		{ $set: { 'missions.$.completedAt': date } }
	);

	if (updated.matchedCount > 0) {
		return;
	}

	await MissionProgress.updateOne(
		{ playerId, 'missions.missionId': { $ne: missionId } },
		{
			$push: {
				missions: {
					missionId,
					acceptedAt: date,
					completedAt: date,
					claimedAt: null,
					collectedIds: []
				}
			}
		}
	);
}

export async function loadProgression(
	playerId: string,
	subject: string | null,
	accountId: string | null,
	options: ProgressionOptions = {}
): Promise<ProgressSnapshot> {
	const stats = await getOrCreateStats(playerId, subject);
	const progressDoc = await loadProgressDoc(playerId, accountId);
	const claims = await loadClaims(playerId);
	let ownedCatalogIds: string[] = [];
	let ownershipUnverified = false;

	if (accountId !== null) {
		try {
			ownedCatalogIds = await (options.loadOwnedCatalogIds ?? ownedCatalogIdsFor)(accountId);
		} catch (cause) {
			if (!(cause instanceof OwnershipUnavailableError)) {
				throw cause;
			}

			// Fail-closed para el gating: sin lectura on-chain ningún NFT se
			// asume poseído. El snapshot sigue sirviendo y el reclamo responde
			// 503 por su propio camino.
			ownershipUnverified = true;
		}
	}

	const evaluation = evaluateProgression({
		reported: stats.missions,
		attested: stats.attested,
		progress: toEntries(progressDoc),
		claims,
		ownedCatalogIds
	});

	if (evaluation.newlyCompleted.length > 0) {
		const now = Date.now();

		await Promise.all(
			evaluation.newlyCompleted.map((missionId) =>
				persistCompleted(playerId, missionId, now)
			)
		);
	}

	return {
		version: 1,
		playerId,
		accountId,
		stats: { reported: stats.missions, attested: stats.attested },
		missions: evaluation.missions,
		claims,
		ownedCatalogIds,
		ownershipUnverified,
		serverTime: Date.now()
	};
}

/**
 * Recalcula las misiones completadas tras una atestación.
 *
 * Solo persiste `completedAt`; no consulta el RPC de posesión porque las
 * misiones ya completadas se conservan y las que exigen un NFT volverán a
 * evaluarse en el siguiente `GET /progression`. Es deliberadamente barato:
 * los motores la llaman después de cada evento.
 */
export async function refreshCompleted(
	playerId: string,
	accountId: string | null = null
): Promise<string[]> {
	const stats = await getOrCreateStats(playerId, null);
	const progressDoc = await loadProgressDoc(playerId, accountId);

	const evaluation = evaluateProgression({
		reported: stats.missions,
		attested: stats.attested,
		progress: toEntries(progressDoc),
		claims: [],
		ownedCatalogIds: []
	});

	if (evaluation.newlyCompleted.length > 0) {
		const now = Date.now();

		await Promise.all(
			evaluation.newlyCompleted.map((missionId) =>
				persistCompleted(playerId, missionId, now)
			)
		);
	}

	return evaluation.newlyCompleted;
}

function assertMission(missionId: string) {
	const mission = missionById(missionId);

	if (!mission) {
		throw new ProgressionRequestError(`Unknown mission: ${missionId}`);
	}

	return mission;
}

/** Acepta una misión disponible. Es idempotente. */
export async function acceptMission(
	playerId: string,
	accountId: string | null,
	missionId: string
): Promise<void> {
	assertMission(missionId);
	await loadProgressDoc(playerId, accountId);

	const now = new Date();

	const updated = await MissionProgress.updateOne(
		{ playerId, 'missions.missionId': missionId },
		{ $set: { 'missions.$.acceptedAt': now } }
	);

	if (updated.matchedCount > 0) {
		return;
	}

	await MissionProgress.updateOne(
		{ playerId, 'missions.missionId': { $ne: missionId } },
		{
			$push: {
				missions: {
					missionId,
					acceptedAt: now,
					completedAt: null,
					claimedAt: null,
					collectedIds: []
				}
			}
		}
	);
}

/**
 * Abandona una misión activa: borra la aceptación y los objetivos recogidos.
 * Una misión ya completada no se puede abandonar.
 */
export async function abandonMission(
	playerId: string,
	accountId: string | null,
	missionId: string
): Promise<void> {
	assertMission(missionId);
	await loadProgressDoc(playerId, accountId);

	await MissionProgress.updateOne(
		{ playerId, 'missions.missionId': missionId, 'missions.$.completedAt': null },
		{
			$set: {
				'missions.$.acceptedAt': null,
				'missions.$.collectedIds': []
			}
		}
	);
}

/** Une objetivos recogidos; acepta la misión si aún no lo estaba. */
export async function recordCollected(
	playerId: string,
	accountId: string | null,
	missionId: string,
	collectedIds: readonly string[]
): Promise<void> {
	const mission = assertMission(missionId);

	if (mission.objective.type !== 'collect') {
		throw new ProgressionRequestError(`${missionId} is not a collect mission`);
	}

	const allowed = new Set(mission.objective.objectiveIds);
	const ids = [...new Set(collectedIds)].filter((id) => allowed.has(id));

	if (ids.length === 0) {
		return;
	}

	await loadProgressDoc(playerId, accountId);

	const now = new Date();

	const updated = await MissionProgress.updateOne(
		{ playerId, 'missions.missionId': missionId },
		{
			$addToSet: { 'missions.$.collectedIds': { $each: ids } }
		}
	);

	if (updated.matchedCount > 0) {
		// Accept it if it was only synced (no explicit accept).
		await MissionProgress.updateOne(
			{ playerId, 'missions.missionId': missionId, 'missions.$.acceptedAt': null },
			{ $set: { 'missions.$.acceptedAt': now } }
		);
		return;
	}

	await MissionProgress.updateOne(
		{ playerId, 'missions.missionId': { $ne: missionId } },
		{
			$push: {
				missions: {
					missionId,
					acceptedAt: now,
					completedAt: null,
					claimedAt: null,
					collectedIds: ids
				}
			}
		}
	);
}

export type ErrandSyncEntry = {
	missionId: string;
	collectedIds: string[];
};

/** Importa los encargos de SPEC-035 sin duplicar objetivos. */
export async function syncErrands(
	playerId: string,
	accountId: string | null,
	errands: readonly ErrandSyncEntry[]
): Promise<void> {
	for (const errand of errands) {
		const mission = missionById(errand.missionId);

		if (!mission || mission.objective.type !== 'collect') {
			continue;
		}

		await recordCollected(playerId, accountId, errand.missionId, errand.collectedIds);
	}
}

/**
 * Misiones que el cliente puede migrar una sola vez desde `rw:missions:v1`
 * (SPEC-045 §11.10). Son los hitos `T0` y `cats-25`: no dan trofeos de pista
 * ni equipables caros, así que el riesgo de un cliente que mienta es bajo.
 */
const LEGACY_COMPLETABLE: ReadonlySet<string> = new Set([
	'barn-first',
	'royale-first',
	'gp-first',
	'hexfire-first',
	'parkour-first',
	'crypt-first',
	'cats-first',
	'cats-25'
]);

/**
 * Importa una vez el progreso local de `rw:missions:v1` (gatos y victorias de
 * minigui). El servidor valida los IDs contra una lista blanca y marca
 * `migratedFromLocalAt`; una segunda llamada no vuelve a completar nada.
 */
export async function syncLegacy(
	playerId: string,
	accountId: string | null,
	completedMissionIds: readonly string[]
): Promise<void> {
	await loadProgressDoc(playerId, accountId);

	const doc = await MissionProgress.findOne({ playerId })
		.select({ migratedFromLocalAt: 1 })
		.lean<{ migratedFromLocalAt?: Date | null }>();

	if (doc?.migratedFromLocalAt) {
		return;
	}

	const ids = [...new Set(completedMissionIds)].filter((id) =>
		LEGACY_COMPLETABLE.has(id)
	);
	const now = Date.now();

	await Promise.all(ids.map((missionId) => persistCompleted(playerId, missionId, now)));

	await MissionProgress.updateOne(
		{ playerId },
		{ $set: { migratedFromLocalAt: new Date(now) } }
	);
}

/** Marca la misión como reclamada tras un mint correcto o `already-owned`. */
export async function markClaimed(
	playerId: string,
	missionId: string,
	at = Date.now()
): Promise<void> {
	await MissionProgress.updateOne(
		{ playerId, 'missions.missionId': missionId },
		{ $set: { 'missions.$.claimedAt': new Date(at) } }
	);
}

/** EL reclamo persistido de una misión, o `null`. */
export async function claimFor(
	playerId: string,
	missionId: string
): Promise<RewardClaimState | null> {
	const claim = await RewardClaim.findOne({ playerId, missionId }).lean<LeanClaim>();
	return claim ? toClaimState(claim) : null;
}
