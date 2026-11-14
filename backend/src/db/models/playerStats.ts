import { type HydratedDocument, type InferSchemaType, type Model, Schema, model, models } from 'mongoose';

function counter() {
	return {
		type: Number,
		min: 0,
		default: 0,
		validate: {
			validator: Number.isInteger,
			message: 'Counter values must be integers'
		}
	};
}

const catsSchema = new Schema(
	{
		played: counter(),
		completed: counter(),
		catsFound: counter()
	},
	{ _id: false }
);

const cryptSchema = new Schema(
	{
		played: counter(),
		completed: counter(),
		failed: counter(),
		deaths: counter()
	},
	{ _id: false }
);

const barnSchema = new Schema(
	{
		played: counter(),
		completed: counter(),
		failed: counter(),
		deaths: counter(),
		kills: counter(),
		waves: counter(),
		bestWave: counter()
	},
	{ _id: false }
);

const raceSchema = new Schema(
	{
		played: counter(),
		finished: counter(),
		won: counter(),
		laps: counter(),
		deaths: counter(),
		podiums: counter()
	},
	{ _id: false }
);

const royaleSchema = new Schema(
	{
		matches: counter(),
		finished: counter(),
		wins: counter(),
		kills: counter(),
		top3: counter(),
		bestPlacement: counter()
	},
	{ _id: false }
);

const hexfireSchema = new Schema(
	{
		matches: counter(),
		wins: counter(),
		kills: counter(),
		deaths: counter()
	},
	{ _id: false }
);

const parkourSchema = new Schema(
	{
		played: counter(),
		finishes: counter(),
		wins: counter(),
		bestTimeMs: counter()
	},
	{ _id: false }
);

const errandsSchema = new Schema(
	{
		accepted: counter(),
		completed: counter(),
		items: {
			type: Map,
			of: [String],
			default: () => new Map()
		}
	},
	{ _id: false }
);

const missionsSchema = new Schema(
	{
		cats: { type: catsSchema, default: () => ({}) },
		crypt: { type: cryptSchema, default: () => ({}) },
		barn: { type: barnSchema, default: () => ({}) },
		race: { type: raceSchema, default: () => ({}) },
		royale: { type: royaleSchema, default: () => ({}) },
		hexfire: { type: hexfireSchema, default: () => ({}) },
		parkour: { type: parkourSchema, default: () => ({}) },
		errands: { type: errandsSchema, default: () => ({}) }
	},
	{ _id: false }
);

const playerStatsSchema = new Schema(
	{
		playerId: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			maxlength: 64
		},
		/**
		 * Auth0 `sub` that owns this document once the id is an account
		 * (`t-<handle>.testnet`). Legacy UUID ids stay unbound.
		 */
		subject: {
			type: String,
			default: null,
			trim: true,
			maxlength: 128
		},
		/** Public nickname shown on the global Top 3 podium. */
		alias: {
			type: String,
			default: null,
			trim: true,
			maxlength: 24
		},
		/** Equipped skin id; the podium renders the avatar with this model. */
		skin: {
			type: String,
			default: null,
			trim: true,
			maxlength: 32
		},
		version: {
			type: Number,
			default: 2,
			immutable: true
		},
		/** Client-reported counters (`PUT /stats/:playerId`). */
		missions: {
			type: missionsSchema,
			default: () => ({})
		},
		/**
		 * Server-attested counters. Only `progression/attest.ts` writes here.
		 * They survive a player reset so rewards cannot be farmed twice.
		 */
		attested: {
			type: missionsSchema,
			default: () => ({})
		}
	},
	{ timestamps: true, versionKey: false, collection: 'player_stats' }
);

playerStatsSchema.index({ updatedAt: -1 });
playerStatsSchema.index({ subject: 1 }, { sparse: true });

export type PlayerStatsRecord = InferSchemaType<typeof playerStatsSchema>;
export type PlayerStatsDocument = HydratedDocument<PlayerStatsRecord>;

export const PlayerStats: Model<PlayerStatsRecord> =
	(models.PlayerStats as Model<PlayerStatsRecord> | undefined) ??
	model<PlayerStatsRecord>('PlayerStats', playerStatsSchema);
