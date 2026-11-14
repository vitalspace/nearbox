/**
 * Atestación de eventos autoritativos de los motores (SPEC-045 §4.3).
 *
 * El motor conoce el evento; este módulo lo traduce a un contador de
 * `player_stats.attested`. Solo se acredita a sesiones vinculadas a una cuenta
 * (`identity.bindSession`). Todo es best-effort: un fallo de Mongo o de la
 * evaluación se registra y nunca bloquea la partida.
 */
import { MissionAttestation, type AttestMetric, type AttestSource } from '../db/models/missionAttestation';
import { PlayerStats } from '../db/models/playerStats';
import { accountFor } from '../server/identity';
import { emptyMissions } from '../stats/schema';
import { getOrCreateStats } from '../stats/service';
import { refreshCompleted } from './service';

/** Ruta del contador dentro de `player_stats.attested`. */
const METRIC_PATH: Readonly<Record<AttestMetric, string>> = {
	'barn.kills': 'attested.barn.kills',
	'barn.waves': 'attested.barn.waves',
	'barn.completed': 'attested.barn.completed',
	'royale.matches': 'attested.royale.matches',
	'royale.finished': 'attested.royale.finished',
	'royale.kills': 'attested.royale.kills',
	'royale.wins': 'attested.royale.wins',
	'royale.top3': 'attested.royale.top3',
	'royale.bestPlacement': 'attested.royale.bestPlacement',
	'race.played': 'attested.race.played',
	'race.finished': 'attested.race.finished',
	'race.won': 'attested.race.won',
	'race.podiums': 'attested.race.podiums',
	'race.laps': 'attested.race.laps',
	'hexfire.matches': 'attested.hexfire.matches',
	'hexfire.wins': 'attested.hexfire.wins',
	'hexfire.kills': 'attested.hexfire.kills',
	'parkour.played': 'attested.parkour.played',
	'parkour.finishes': 'attested.parkour.finishes',
	'parkour.wins': 'attested.parkour.wins',
	'crypt.completed': 'attested.crypt.completed'
};

export type AttestEventInput = {
	source: AttestSource;
	/** Identificador estable de la partida/ronda generado por el servidor. */
	matchId: string;
	/** `ws.id` del jugador al que se le acredita el evento. */
	wsId: string;
	metric: AttestMetric;
	/** Cantidad a sumar; 1 por defecto. */
	amount?: number;
	/**
	 * Clave del evento dentro de la partida. El índice único de
	 * `MissionAttestation` es `(source, matchId, playerId, metric)`, así que la
	 * clave se añade al `matchId` para permitir varios eventos del mismo tipo
	 * (kills, vueltas, oleadas) sin contarlos dos veces.
	 */
	eventKey?: string;
};

/** `matchId` nuevo para una partida. `crypto.randomUUID` existe en Bun y Node 19+. */
export function newMatchId(): string {
	return crypto.randomUUID();
}

function isDuplicateKey(cause: unknown): boolean {
	const error = cause as { code?: number; codeName?: string };

	return error?.code === 11_000 || error?.codeName === 'DuplicateKey';
}

function attestationMatchId(matchId: string, eventKey: string | undefined): string {
	const key = eventKey && eventKey.length > 0 ? `${matchId}:${eventKey}` : matchId;

	return key.slice(0, 96);
}

function emptyInsert(playerId: string): Record<string, unknown> {
	return {
		playerId,
		version: 2,
		missions: emptyMissions(),
		attested: emptyMissions()
	};
}

/**
 * Acredita un evento. Devuelve `true` si el contador se incrementó (primera
 * vez que se ve el evento) y `false` si era anónimo, duplicado o falló.
 */
export async function attestEvent(input: AttestEventInput): Promise<boolean> {
	const accountId = accountFor(input.wsId);

	if (!accountId) {
		return false;
	}

	const playerId = accountId;
	const amount = Math.max(1, Math.trunc(input.amount ?? 1));

	try {
		await MissionAttestation.create({
			source: input.source,
			matchId: attestationMatchId(input.matchId, input.eventKey),
			playerId,
			metric: input.metric,
			amount
		});
	} catch (cause) {
		if (isDuplicateKey(cause)) {
			return false;
		}

		console.warn(
			'[progression] could not persist the attestation:',
			cause instanceof Error ? cause.message : cause
		);
		return false;
	}

	try {
		await incrementAttested(playerId, input.metric, amount);
	} catch (cause) {
		console.warn(
			'[progression] could not increment the attested counter:',
			cause instanceof Error ? cause.message : cause
		);
	}

	try {
		await refreshCompleted(playerId, accountId);
	} catch (cause) {
		console.warn(
			'[progression] could not refresh completed missions:',
			cause instanceof Error ? cause.message : cause
		);
	}

	return true;
}

/**
 * Acredita un evento a todos los jugadores de una partida (p. ej. la victoria
 * o la oleada cerrada). Los duplicados por `eventKey` se ignoran.
 */
export async function attestAll(
	wsIds: Iterable<string>,
	event: Omit<AttestEventInput, 'wsId'>
): Promise<void> {
	await Promise.allSettled(
		[...wsIds].map((wsId) => attestEvent({ ...event, wsId }))
	);
}

async function incrementAttested(
	playerId: string,
	metric: AttestMetric,
	amount: number
): Promise<void> {
	const path = METRIC_PATH[metric];

	if (!path) {
		return;
	}

	// `bestPlacement` es un mínimo: 0 significa «sin partida» y 1 es el mejor.
	if (metric === 'royale.bestPlacement') {
		await getOrCreateStats(playerId, null);

		await PlayerStats.updateOne(
			{ playerId },
			[
				{
					$set: {
						[path]: {
							$let: {
								vars: { current: { $ifNull: [`$${path}`, 0] } },
								in: {
									$cond: [
										{
											$or: [
												{ $eq: ['$$current', 0] },
												{ $gt: ['$$current', amount] }
											]
										},
										amount,
										'$$current'
									]
								}
							}
						}
					}
				}
			],
			{ timestamps: false }
		);

		return;
	}

	await PlayerStats.updateOne(
		{ playerId },
		{
			$inc: { [path]: amount },
			$setOnInsert: emptyInsert(playerId)
		},
		{ upsert: true, timestamps: false, setDefaultsOnInsert: false }
	);
}
