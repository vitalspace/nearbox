import { type HydratedDocument, type InferSchemaType, type Model, Schema, model, models } from 'mongoose';

export const REWARD_CLAIM_STATUSES = [
	'pending',
	'minting',
	'minted',
	'already-owned',
	'failed'
] as const;

export type RewardClaimStatus = (typeof REWARD_CLAIM_STATUSES)[number];

/**
 * Un reclamo de recompensa por `(playerId, missionId)`.
 *
 * El índice único es la última barrera contra mints dobles: aunque dos
 * pestañas reclamen a la vez, solo una fila gana y el resto lee el mismo token.
 */
const rewardClaimSchema = new Schema(
	{
		claimId: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			maxlength: 64
		},
		playerId: {
			type: String,
			required: true,
			trim: true,
			maxlength: 64
		},
		accountId: {
			type: String,
			required: true,
			trim: true,
			maxlength: 64
		},
		missionId: {
			type: String,
			required: true,
			trim: true,
			maxlength: 64
		},
		catalogId: {
			type: String,
			required: true,
			trim: true,
			maxlength: 64
		},
		status: {
			type: String,
			enum: REWARD_CLAIM_STATUSES,
			default: 'pending',
			required: true
		},
		tokenId: { type: String, default: null, trim: true, maxlength: 128 },
		serial: { type: Number, default: null, min: 0 },
		txHash: { type: String, default: null, trim: true, maxlength: 128 },
		/** `request_id` idempotente enviado por el cliente. */
		requestId: { type: String, default: null, trim: true, maxlength: 128 },
		/** Intentos de mint; limita reintentos automáticos. */
		attempts: { type: Number, default: 0, min: 0 },
		/** Bloqueo del proceso que está minteando; `null` si está libre. */
		mintingUntil: { type: Date, default: null },
		error: { type: String, default: null, trim: true, maxlength: 512 }
	},
	{ timestamps: true, versionKey: false, collection: 'reward_claims' }
);

rewardClaimSchema.index({ playerId: 1, missionId: 1 }, { unique: true });
rewardClaimSchema.index({ requestId: 1 }, { unique: true, sparse: true });
rewardClaimSchema.index({ accountId: 1, status: 1 });

export type RewardClaimRecord = InferSchemaType<typeof rewardClaimSchema>;
export type RewardClaimDocument = HydratedDocument<RewardClaimRecord>;

export const RewardClaim: Model<RewardClaimRecord> =
	(models.RewardClaim as Model<RewardClaimRecord> | undefined) ??
	model<RewardClaimRecord>('RewardClaim', rewardClaimSchema);
