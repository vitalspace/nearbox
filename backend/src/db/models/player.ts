import { type HydratedDocument, type InferSchemaType, type Model, Schema, model, models } from 'mongoose';

const playerSchema = new Schema(
	{
		playerId: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			maxlength: 64
		},
		alias: {
			type: String,
			trim: true,
			maxlength: 24,
			default: null
		},
		lastSeenAt: {
			type: Date,
			default: Date.now
		}
	},
	{ timestamps: true, versionKey: false, collection: 'players' }
);

export type PlayerRecord = InferSchemaType<typeof playerSchema>;
export type PlayerDocument = HydratedDocument<PlayerRecord>;

export const Player: Model<PlayerRecord> =
	(models.Player as Model<PlayerRecord> | undefined) ?? model<PlayerRecord>('Player', playerSchema);
