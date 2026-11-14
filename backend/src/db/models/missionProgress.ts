import { type HydratedDocument, type InferSchemaType, type Model, Schema, model, models } from 'mongoose';

/**
 * Estado de las misiones de progresión por jugador.
 *
 * El documento es pequeño y permanente: una fila por misión aceptada o
 * completada. `collect` guarda los objetivos recogidos; las misiones `stat`
 * no escriben aquí (leen `player_stats.attested`).
 */
const missionEntrySchema = new Schema(
	{
		missionId: {
			type: String,
			required: true,
			trim: true,
			maxlength: 64
		},
		acceptedAt: { type: Date, default: null },
		completedAt: { type: Date, default: null },
		claimedAt: { type: Date, default: null },
		/** Objective ids recogidos por misiones `collect`. */
		collectedIds: {
			type: [String],
			default: []
		}
	},
	{ _id: false }
);

const missionProgressSchema = new Schema(
	{
		playerId: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			maxlength: 64
		},
		/** Cuenta on-chain vinculada, si el jugador ya se autenticó. */
		accountId: {
			type: String,
			default: null,
			trim: true,
			maxlength: 64
		},
		missions: {
			type: [missionEntrySchema],
			default: []
		},
		/** Marca la importación única de `rw:npc-missions:v1`. */
		migratedFromLocalAt: { type: Date, default: null }
	},
	{ timestamps: true, versionKey: false, collection: 'mission_progress' }
);

export type MissionProgressRecord = InferSchemaType<typeof missionProgressSchema>;
export type MissionProgressDocument = HydratedDocument<MissionProgressRecord>;

export const MissionProgress: Model<MissionProgressRecord> =
	(models.MissionProgress as Model<MissionProgressRecord> | undefined) ??
	model<MissionProgressRecord>('MissionProgress', missionProgressSchema);
