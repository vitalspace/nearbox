import { type HydratedDocument, type InferSchemaType, type Model, Schema, model, models } from 'mongoose';

export const ATTEST_SOURCES = ['waves', 'royale', 'race', 'deathmatch', 'parkour', 'crypt'] as const;
export const ATTEST_METRICS = [
	'barn.kills',
	'barn.waves',
	'barn.completed',
	'royale.matches',
	'royale.finished',
	'royale.kills',
	'royale.wins',
	'royale.top3',
	'royale.bestPlacement',
	'race.played',
	'race.finished',
	'race.won',
	'race.podiums',
	'race.laps',
	'hexfire.matches',
	'hexfire.wins',
	'hexfire.kills',
	'parkour.played',
	'parkour.finishes',
	'parkour.wins',
	'crypt.completed'
] as const;

export type AttestSource = (typeof ATTEST_SOURCES)[number];
export type AttestMetric = (typeof ATTEST_METRICS)[number];

function ttlDays(): number {
	const raw = Number(process.env.MISSION_ATTESTATION_TTL_DAYS ?? 180);

	if (!Number.isFinite(raw) || raw <= 0) {
		return 0;
	}

	return Math.min(Math.floor(raw), 3_650);
}

/**
 * Evidencia de un evento de motor ya contabilizado.
 *
 * El índice único `(source, matchId, playerId, metric)` permite reintentos y
 * ticks duplicados sin sumar dos veces: primero se inserta la evidencia y solo
 * si el insert gana se aplica el `$inc` en `player_stats.attested`.
 */
const missionAttestationSchema = new Schema(
	{
		source: { type: String, required: true, enum: ATTEST_SOURCES },
		matchId: { type: String, required: true, trim: true, maxlength: 96 },
		playerId: { type: String, required: true, trim: true, maxlength: 64 },
		metric: { type: String, required: true, enum: ATTEST_METRICS },
		amount: { type: Number, required: true, min: 1, default: 1 },
		createdAt: { type: Date, default: Date.now }
	},
	{ versionKey: false, collection: 'mission_attestations' }
);

missionAttestationSchema.index(
	{ source: 1, matchId: 1, playerId: 1, metric: 1 },
	{ unique: true }
);
missionAttestationSchema.index({ playerId: 1, metric: 1 });

const ttl = ttlDays();

if (ttl > 0) {
	missionAttestationSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttl * 86_400 });
} else {
	missionAttestationSchema.index({ createdAt: 1 });
}

export type MissionAttestationRecord = InferSchemaType<typeof missionAttestationSchema>;
export type MissionAttestationDocument = HydratedDocument<MissionAttestationRecord>;

export const MissionAttestation: Model<MissionAttestationRecord> =
	(models.MissionAttestation as Model<MissionAttestationRecord> | undefined) ??
	model<MissionAttestationRecord>('MissionAttestation', missionAttestationSchema);
