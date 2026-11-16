/**
 * Reclamo de recompensas NFT (SPEC-045, fase 5).
 *
 * El servidor es la única autoridad: verifica el JWT, que la cuenta exista y
 * contenga la public key del jugador, que la misión esté completada, que siga
 * poseyendo los NFTs-llave y que el catálogo no haya alcanzado su tope por
 * cuenta. El cliente nunca decide si una misión está lista.
 */
import { randomUUID } from 'node:crypto';
import { RewardClaim, type RewardClaimRecord } from '../db/models/rewardClaim';
import {
	assertOwnedAccount,
	deriveAccountId,
	deriveAutoAccountId,
	rewardMint,
	type RewardMintResult
} from '../server/relayer';
import { verifySessionToken } from '../server/sessionToken';
import { ensureStatsOwnership } from '../stats/service';
import type { TokenVerifier } from '../stats/identity';
import {
	missionById,
	rewardById,
	rewardCapFor,
	type ProgressionMissionState,
	type RewardClaimState
} from './catalog';
import {
	OwnershipUnavailableError,
	ownedRewardTokens,
	type OwnedToken
} from './ownership';
import {
	loadProgression,
	markClaimed,
	toClaimState,
	type LeanClaim
} from './service';

const MINT_LOCK_MS = 60_000;
const MINT_WAIT_MS = 10_000;
const MINT_POLL_MS = 200;
const RETRY_WINDOW_MS = 60_000;

export type RewardClaimInput = {
	/** Identidad de progresión; para cuentas es el propio `accountId`. */
	playerId: string;
	accountId: string;
	/** Obligatoria en FastAuth; en modo wallet la prueba es el token NEP-413. */
	publicKey?: string;
	missionId: string;
	token: string;
	requestId: string;
};

export type RewardClaimResult = {
	claim: RewardClaimState;
	minted: boolean;
	alreadyClaimed: boolean;
	budgetRemainingYocto: string;
};

export type RewardOptions = {
	verifyToken?: TokenVerifier;
	loadOwnedTokens?: (accountId: string) => Promise<OwnedToken[]>;
	mint?: (input: {
		accountId: string;
		catalogId: string;
		requestId: string;
	}) => Promise<RewardMintResult>;
	/** Inyectable en tests; valida que la public key pertenezca a la cuenta. */
	assertOwned?: (accountId: string, publicKey: string) => Promise<void>;
	now?: () => number;
};

export class RewardRequestError extends Error {
	readonly status = 400;
	readonly code = 'INVALID_REWARD_REQUEST';

	constructor(message: string) {
		super(message);
		this.name = 'RewardRequestError';
	}
}

export class RewardAuthError extends Error {
	readonly status = 401;
	readonly code = 'REWARD_UNAUTHORIZED';

	constructor(message = 'Sign in to claim rewards') {
		super(message);
		this.name = 'RewardAuthError';
	}
}

export class RewardForbiddenError extends Error {
	readonly status = 403;
	readonly code: string;

	constructor(message: string, code = 'REWARD_FORBIDDEN') {
		super(message);
		this.name = 'RewardForbiddenError';
		this.code = code;
	}
}

export class RewardConflictError extends Error {
	readonly status = 409;
	readonly code: string;

	constructor(message: string, code = 'REWARD_CONFLICT') {
		super(message);
		this.name = 'RewardConflictError';
		this.code = code;
	}
}

export class RewardCapacityError extends Error {
	readonly status = 503;
	readonly code = 'REWARD_CAPACITY';

	constructor(message = 'Reward capacity reached; your claim is saved') {
		super(message);
		this.name = 'RewardCapacityError';
	}
}

export class RewardRateLimitError extends Error {
	readonly status = 429;
	readonly code = 'REWARD_RATE_LIMITED';

	constructor(message = 'Wait a minute before retrying this claim') {
		super(message);
		this.name = 'RewardRateLimitError';
	}
}

export class RewardPendingError extends Error {
	readonly status = 202;
	readonly code = 'REWARD_PENDING';
	readonly claim: RewardClaimState;

	constructor(claim: RewardClaimState) {
		super('The reward is still minting');
		this.name = 'RewardPendingError';
		this.claim = claim;
	}
}

type ClaimDoc = LeanClaim & {
	_id: unknown;
	attempts?: number;
	mintingUntil?: Date | null;
};

function isDuplicateKey(cause: unknown): boolean {
	const error = cause as { code?: number; codeName?: string };
	return error?.code === 11_000 || error?.codeName === 'DuplicateKey';
}

function timeMs(value: Date | null | undefined): number {
	if (!value) return 0;
	const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
	return Number.isFinite(time) ? time : 0;
}

function authError(cause: unknown): RewardAuthError {
	if (cause instanceof RewardAuthError) return cause;
	const status = (cause as { status?: number }).status;

	if (status === 401) {
		return new RewardAuthError(
			cause instanceof Error ? cause.message : 'Invalid or expired session'
		);
	}

	return new RewardAuthError(
		cause instanceof Error ? cause.message : 'Could not verify the session'
	);
}

async function readClaim(id: unknown): Promise<ClaimDoc | null> {
	return await RewardClaim.findById(id).lean<ClaimDoc>();
}

function claimView(doc: ClaimDoc): RewardClaimState {
	return toClaimState({
		claimId: doc.claimId,
		missionId: doc.missionId,
		catalogId: doc.catalogId,
		status: doc.status,
		tokenId: doc.tokenId,
		serial: doc.serial,
		txHash: doc.txHash,
		error: doc.error,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt
	});
}

function successResult(
	doc: ClaimDoc,
	options: { minted: boolean; alreadyClaimed: boolean; budgetRemainingYocto: string }
): RewardClaimResult {
	return { claim: claimView(doc), ...options };
}

async function waitForActiveClaim(
	id: unknown,
	now: () => number
): Promise<ClaimDoc | null> {
	const deadline = now() + MINT_WAIT_MS;

	while (now() < deadline) {
		const doc = await readClaim(id);

		if (!doc || doc.status !== 'minting') {
			return doc;
		}

		const lockUntil = timeMs(doc.mintingUntil);

		if (lockUntil !== 0 && lockUntil <= now()) {
			return doc;
		}

		await new Promise((resolve) => setTimeout(resolve, MINT_POLL_MS));
	}

	return await readClaim(id);
}

/**
 * Reclama la recompensa de una misión completada.
 *
 * Es idempotente por `(playerId, missionId)` y por `requestId`; dos pestañas
 * simultáneas comparten el mismo documento y solo una llama al relayer.
 */
export async function claimReward(
	input: RewardClaimInput,
	options: RewardOptions = {}
): Promise<RewardClaimResult> {
	const now = options.now ?? Date.now;
	const verifyToken = options.verifyToken ?? verifySessionToken;
	const mint = options.mint ?? rewardMint;
	const loadOwnedTokens = options.loadOwnedTokens ?? ownedRewardTokens;
	const assertOwned = options.assertOwned ?? assertOwnedAccount;

	if (!input.accountId || !input.missionId) {
		throw new RewardRequestError('accountId and missionId are required');
	}

	if (!input.requestId) {
		throw new RewardRequestError('request_id is required');
	}

	let subject: string;
	/** Cuenta demostrada con NEP-413; `null` en sesiones FastAuth. */
	let walletAccountId: string | null = null;

	try {
		const claims = await verifyToken(input.token);

		subject = claims.sub;

		if (!subject) {
			throw new RewardAuthError('The session has no subject');
		}

		walletAccountId = claims.walletAccountId ?? null;
	} catch (cause) {
		throw authError(cause);
	}

	// En modo wallet la prueba de propiedad viaja en el token: el accountId
	// tiene que ser exactamente el que firmó el NEP-413.
	if (walletAccountId && walletAccountId !== input.accountId) {
		throw new RewardForbiddenError(
			'The wallet session does not own this account',
			'REWARD_ACCOUNT_MISMATCH'
		);
	}

	if (!walletAccountId && !input.publicKey) {
		throw new RewardRequestError('publicKey is required for FastAuth sessions');
	}

	const mission = missionById(input.missionId);

	if (!mission) {
		throw new RewardRequestError(`Unknown mission: ${input.missionId}`);
	}

	if (!mission.reward) {
		throw new RewardConflictError(
			`${mission.id} has no NFT reward`,
			'MISSION_WITHOUT_REWARD'
		);
	}

	const catalogId = mission.reward.catalogId;
	const reward = rewardById(catalogId);
	const rewardCap = rewardCapFor(catalogId);

	if (!reward && !rewardCap) {
		throw new RewardConflictError(
			`Unknown reward catalog: ${catalogId}`,
			'REWARD_CATALOG_MISSING'
		);
	}

	const perAccountCap = rewardCap?.perAccountCap ?? 1;

	// En FastAuth la cuenta debe existir y contener la clave del jugador. En
	// modo wallet la propiedad ya la probó la firma NEP-413 del token, así que
	// solo se valida el formato del accountId (el relayer mintea a esa cuenta).
	if (!walletAccountId) {
		const derived = new Set([
			deriveAccountId(input.publicKey!),
			deriveAutoAccountId(input.publicKey!)
		]);

		try {
			await assertOwned(input.accountId, input.publicKey!);
		} catch (cause) {
			const status = (cause as { status?: number }).status;
			const message =
				cause instanceof Error ? cause.message : 'Could not verify the account';

			if (status === 403 && !derived.has(input.accountId)) {
				throw new RewardForbiddenError(
					`${message}. accountId must be derived from publicKey or be an existing account owned by it.`,
					'REWARD_ACCOUNT_MISMATCH'
				);
			}

			throw new RewardForbiddenError(message, 'REWARD_ACCOUNT_MISMATCH');
		}
	}

	await ensureStatsOwnership(input.playerId, subject);

	let tokens: OwnedToken[];

	try {
		tokens = await loadOwnedTokens(input.accountId);
	} catch (cause) {
		if (cause instanceof OwnershipUnavailableError) throw cause;
		throw new OwnershipUnavailableError(
			cause instanceof Error ? cause.message : 'Could not verify NFT ownership'
		);
	}

	const ownedCatalogIds = [...new Set(tokens.map((token) => token.catalogId))];

	const snapshot = await loadProgression(input.playerId, subject, input.accountId, {
		loadOwnedCatalogIds: async () => ownedCatalogIds
	});

	const state = snapshot.missions.find(
		(item) => item.missionId === input.missionId
	) as ProgressionMissionState | undefined;

	if (!state) {
		throw new RewardConflictError(
			`Mission state is unavailable: ${input.missionId}`,
			'MISSION_NOT_COMPLETED'
		);
	}

	if (state.status === 'locked') {
		throw new RewardForbiddenError(
			state.lockedReason ?? 'This mission is still locked',
			'REWARD_GATE_MISSING'
		);
	}

	if (state.status !== 'completed' && state.status !== 'claimed') {
		throw new RewardConflictError(
			'Complete the mission before claiming its reward',
			'MISSION_NOT_COMPLETED'
		);
	}

	const existing = await RewardClaim.findOne({
		playerId: input.playerId,
		missionId: input.missionId
	}).lean<ClaimDoc>();

	if (existing && (existing.status === 'minted' || existing.status === 'already-owned')) {
		await markClaimed(input.playerId, input.missionId);
		return successResult(existing, {
			minted: false,
			alreadyClaimed: true,
			budgetRemainingYocto: '0'
		});
	}

	if (
		existing?.status === 'failed' &&
		now() - timeMs(existing.updatedAt) < RETRY_WINDOW_MS
	) {
		throw new RewardRateLimitError();
	}

	// Tope por cuenta: el cosmético es comerciable; si el jugador ya alcanzó
	// `per_account_cap`, el claim queda `already-owned`.
	const ownedForCatalog = tokens.filter(
		(token) => token.catalogId === catalogId
	);

	if (ownedForCatalog.length >= Math.max(1, perAccountCap)) {
		const token = ownedForCatalog[0] ?? null;
		const updated = await RewardClaim.findOneAndUpdate(
			{ playerId: input.playerId, missionId: input.missionId },
			{
				$set: {
					status: 'already-owned',
					tokenId: token?.tokenId ?? null,
					serial: token?.serial ?? null,
					txHash: null,
					error: null,
					mintingUntil: null,
					requestId: input.requestId
				},
				$setOnInsert: {
					claimId: randomUUID(),
					accountId: input.accountId,
					catalogId: catalogId
				}
			},
			{ upsert: true, returnDocument: 'after', timestamps: true }
		).lean<ClaimDoc>();

		if (!updated) {
			throw new RewardConflictError('Could not persist the reward claim');
		}

		await markClaimed(input.playerId, input.missionId);

		return successResult(updated, {
			minted: false,
			alreadyClaimed: true,
			budgetRemainingYocto: '0'
		});
	}

	// Reserva/inserta el claim antes de tocar el relayer. El índice único
	// `(playerId, missionId)` resuelve la carrera entre dos pestañas.
	let doc: ClaimDoc | null;

	try {
		doc = await RewardClaim.findOneAndUpdate(
			{ playerId: input.playerId, missionId: input.missionId },
			{
				$setOnInsert: {
					claimId: randomUUID(),
					accountId: input.accountId,
					catalogId: catalogId,
					status: 'pending',
					requestId: input.requestId,
					attempts: 0,
					mintingUntil: null
				}
			},
			{ upsert: true, returnDocument: 'after' }
		).lean<ClaimDoc>();
	} catch (cause) {
		if (isDuplicateKey(cause)) {
			throw new RewardConflictError(
				'request_id was already used for another claim',
				'REWARD_REQUEST_REUSED'
			);
		}

		throw cause;
	}

	if (!doc) {
		throw new RewardConflictError('Could not persist the reward claim');
	}

	if (doc.status === 'minting') {
		const waited = await waitForActiveClaim(doc._id, now);

		if (waited && waited.status !== 'minting') {
			if (waited.status === 'minted' || waited.status === 'already-owned') {
				await markClaimed(input.playerId, input.missionId);
				return successResult(waited, {
					minted: false,
					alreadyClaimed: true,
					budgetRemainingYocto: '0'
				});
			}

			doc = waited;
		} else {
			throw new RewardPendingError(claimView(waited ?? doc));
		}
	}

	if (doc.status !== 'pending' && doc.status !== 'failed') {
		// Un estado terminal inesperado se devuelve tal cual si ya no mintea.
		return successResult(doc, {
			minted: false,
			alreadyClaimed: true,
			budgetRemainingYocto: '0'
		});
	}

	const mintStartedAt = now();

	let locked: ClaimDoc | null;

	try {
		locked = await RewardClaim.findOneAndUpdate(
			{
				_id: doc._id,
				$or: [
					{ status: { $in: ['pending', 'failed'] } },
					{ status: 'minting', mintingUntil: null },
					{ status: 'minting', mintingUntil: { $lte: new Date(mintStartedAt) } }
				]
			},
			{
				$set: {
					status: 'minting',
					requestId: input.requestId,
					error: null,
					mintingUntil: new Date(mintStartedAt + MINT_LOCK_MS)
				},
				$inc: { attempts: 1 }
			},
			{ returnDocument: 'after' }
		).lean<ClaimDoc>();
	} catch (cause) {
		if (isDuplicateKey(cause)) {
			throw new RewardConflictError(
				'request_id was already used for another claim',
				'REWARD_REQUEST_REUSED'
			);
		}

		throw cause;
	}

	if (!locked) {
		const waited = await waitForActiveClaim(doc._id, now);

		if (waited && (waited.status === 'minted' || waited.status === 'already-owned')) {
			await markClaimed(input.playerId, input.missionId);
			return successResult(waited, {
				minted: false,
				alreadyClaimed: true,
				budgetRemainingYocto: '0'
			});
		}

		throw new RewardPendingError(claimView(waited ?? doc));
	}

	try {
		const minted = await mint({
			accountId: input.accountId,
			catalogId: catalogId,
			requestId: input.requestId
		});

		const updated = await RewardClaim.findOneAndUpdate(
			{ _id: locked._id },
			{
				$set: {
					status: 'minted',
					tokenId: minted.tokenId,
					serial: minted.serial,
					txHash: minted.txHash,
					error: null,
					mintingUntil: null
				}
			},
			{ returnDocument: 'after' }
		).lean<ClaimDoc>();

		await markClaimed(input.playerId, input.missionId);

		return successResult(updated ?? locked, {
			minted: true,
			alreadyClaimed: false,
			budgetRemainingYocto: minted.budgetRemainingYocto
		});
	} catch (cause) {
		const status = (cause as { status?: number }).status;
		const code = (cause as { code?: string }).code;
		const message =
			cause instanceof Error ? cause.message : 'The reward mint failed';

		if (status === 503 || code === 'REWARD_CAPACITY') {
			await RewardClaim.updateOne(
				{ _id: locked._id },
				{
					$set: {
						status: 'pending',
						error: message.slice(0, 512),
						mintingUntil: null
					}
				}
			);

			throw new RewardCapacityError(message);
		}

		await RewardClaim.updateOne(
			{ _id: locked._id },
			{
				$set: {
					status: 'failed',
					error: message.slice(0, 512),
					mintingUntil: null
				}
			}
		);

		throw status && status >= 400 && status < 500
			? cause
			: new RewardConflictError(
					`The reward mint failed: ${message}`,
					'REWARD_MINT_FAILED'
				);
	}
}

export type { RewardClaimRecord };
