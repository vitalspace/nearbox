import { type HydratedDocument, type InferSchemaType, type Model, Schema, model, models } from 'mongoose';

export const STATS_EVENT_TYPES = [
	'mission-start',
	'mission-complete',
	'mission-fail',
	'cat-capture',
	'kill',
	'death',
	'lap',
	'race-finish',
	'race-win',
	'reset',
	'link'
] as const;

export const STATS_MISSIONS = ['cats', 'crypt', 'barn', 'race'] as const;

export type StatsEventType = (typeof STATS_EVENT_TYPES)[number];
export type StatsMission = (typeof STATS_MISSIONS)[number];

function ttlDays(): number {
	const raw = Number(process.env.STATS_EVENTS_TTL_DAYS ?? 90);

	if (!Number.isFinite(raw) || raw <= 0) {
		return 0;
	}

	return Math.min(Math.floor(raw), 3_650);
}

const statsEventSchema = new Schema(
	{
		playerId: {
			type: String,
			required: true,
			trim: true,
			maxlength: 64,
			index: true
		},
		type: {
			type: String,
			required: true,
			enum: STATS_EVENT_TYPES
		},
		mission: {
			type: String,
			enum: [...STATS_MISSIONS, null],
			default: null
		},
		delta: {
			type: Number,
			default: 1,
			min: 0
		},
		meta: {
			type: Schema.Types.Mixed,
			default: null
		}
	},
	{
		timestamps: { createdAt: true, updatedAt: false },
		versionKey: false,
		collection: 'stats_events'
	}
);

statsEventSchema.index({ playerId: 1, createdAt: -1 });

const days = ttlDays();

if (days > 0) {
	statsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: days * 24 * 60 * 60 });
}

export const STATS_EVENTS_TTL_DAYS = days;

export type StatsEventRecord = InferSchemaType<typeof statsEventSchema>;
export type StatsEventDocument = HydratedDocument<StatsEventRecord>;

export const StatsEvent: Model<StatsEventRecord> =
	(models.StatsEvent as Model<StatsEventRecord> | undefined) ??
	model<StatsEventRecord>('StatsEvent', statsEventSchema);
