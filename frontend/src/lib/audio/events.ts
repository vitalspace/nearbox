import type {
	CarEvent,
	Mg2Event,
	Mg5Event,
	Mg5MonsterSnapshot,
	Mg6Event,
	Mg6Team,
	Mg7Event,
	Mg8Event,
	PaperRollState,
	RaceEvent
} from '../services/protocol';
import type { CatCaptureEvent } from '../state/missions.svelte';
import type { Mg5MonsterKind, Mg5WeaponId } from '../state/wavesConfig';
import type { SoundId } from './recipes';
import type { Point3, SoundPriority } from './types';

/**
 * Traducción de eventos de dominio a recetas y cursores anti-repetición.
 *
 * Los eventos no reproducen sonido aquí: devuelven una lista de `AudioCue` que
 * el bootstrap ejecuta. Así el mapeo es fácil de revisar y de silenciar.
 */

export type AudioCue = {
	id: SoundId;
	position?: Point3;
	volume?: number;
	rate?: number;
	sourceId?: string;
	priority?: SoundPriority;
};

export type EventCursors = {
	/** `minigame5.eventSeq` es monotónico y sobrevive a `reset()`. */
	lastMg5Seq: number;
	/** `minigame6.eventSeq` también es monotónico. */
	lastMg6Seq: number;
	/** `minigame7.eventSeq` también es monotónico. */
	lastMg7Seq: number;
	/** `minigame8.eventSeq` también es monotónico. */
	lastMg8Seq: number;
	/** Cantidad de eventos de `minigame2` ya consumidos. */
	lastMg2Count: number;
	lastRaceSeq: number;
	lastCarSeq: number;
	lastCatCaptureSeq: number;
	lastPaperThrowSeq: number;
};

export const eventCursors: EventCursors = {
	lastMg5Seq: 0,
	lastMg6Seq: 0,
	lastMg7Seq: 0,
	lastMg8Seq: 0,
	lastMg2Count: 0,
	lastRaceSeq: 0,
	lastCarSeq: 0,
	lastCatCaptureSeq: 0,
	lastPaperThrowSeq: 0
};

/** Evita repetir el historial al montar el bootstrap por primera vez. */
export function syncCursors(input: {
	mg5Seq?: number;
	mg6Seq?: number;
	mg7Seq?: number;
	mg8Seq?: number;
	mg2Count?: number;
	raceSeq?: number;
	carSeq?: number;
	catCaptureSeq?: number;
	paperThrowSeq?: number;
}): void {
	if (input.mg5Seq !== undefined)
		eventCursors.lastMg5Seq = Math.max(eventCursors.lastMg5Seq, input.mg5Seq);
	if (input.mg6Seq !== undefined)
		eventCursors.lastMg6Seq = Math.max(eventCursors.lastMg6Seq, input.mg6Seq);
	if (input.mg7Seq !== undefined)
		eventCursors.lastMg7Seq = Math.max(eventCursors.lastMg7Seq, input.mg7Seq);
	if (input.mg8Seq !== undefined)
		eventCursors.lastMg8Seq = Math.max(eventCursors.lastMg8Seq, input.mg8Seq);
	if (input.mg2Count !== undefined) eventCursors.lastMg2Count = input.mg2Count;
	if (input.raceSeq !== undefined)
		eventCursors.lastRaceSeq = Math.max(eventCursors.lastRaceSeq, input.raceSeq);
	if (input.carSeq !== undefined)
		eventCursors.lastCarSeq = Math.max(eventCursors.lastCarSeq, input.carSeq);
	if (input.catCaptureSeq !== undefined)
		eventCursors.lastCatCaptureSeq = Math.max(eventCursors.lastCatCaptureSeq, input.catCaptureSeq);
	if (input.paperThrowSeq !== undefined)
		eventCursors.lastPaperThrowSeq = Math.max(eventCursors.lastPaperThrowSeq, input.paperThrowSeq);
}

/** La cripta reinicia su array; los demás cursores son de sesión. */
export function resetMg2Cursor(): void {
	eventCursors.lastMg2Count = 0;
}

function positionOf(event: { x?: number; y?: number; z?: number }): Point3 | undefined {
	if (event.x === undefined || event.y === undefined || event.z === undefined) {
		return undefined;
	}

	return { x: event.x, y: event.y, z: event.z };
}

function monsterPosition(
	event: Mg5Event,
	monsters: readonly Mg5MonsterSnapshot[]
): Point3 | undefined {
	const direct = positionOf(event);

	if (direct) {
		return direct;
	}

	if (!event.monsterId) {
		return undefined;
	}

	const monster = monsters.find((entry) => entry.id === event.monsterId);

	return monster ? { x: monster.x, y: monster.y, z: monster.z } : undefined;
}

function monsterHitSound(kind: Mg5MonsterKind): SoundId {
	if (kind === 'skeleton') {
		return 'hit_bone';
	}

	if (kind === 'golem' || kind === 'frankenstein') {
		return 'hit_stone';
	}

	if (kind === 'scarecrow' || kind === 'pumpkin-king') {
		return 'hit_wood';
	}

	return 'hit_flesh';
}

function monsterCue(
	kind: Mg5MonsterKind | undefined,
	mode: 'attack' | 'hurt' | 'death',
	position: Point3 | undefined,
	monsterId: string | undefined
): AudioCue[] {
	if (!kind) {
		return [];
	}

	return [
		{
			id: `monster_${kind}_${mode}`,
			position,
			sourceId: monsterId,
			volume: mode === 'attack' ? 0.9 : 1,
			priority: mode === 'attack' || mode === 'death' ? 3 : 2
		}
	];
}

function dropSound(kind: string | undefined): SoundId {
	if (kind === 'ammo' || kind === 'shells') {
		return 'pickup_ammo';
	}

	if (kind === 'grenade' || kind === 'grenades') {
		return 'pickup_grenade';
	}

	if (kind === 'medkit' || kind === 'health') {
		return 'pickup_health';
	}

	return 'pickup_weapon';
}

function shotSound(weapon: Mg5WeaponId): SoundId {
	if (weapon === 'shotgun') return 'shot_shotgun';
	if (weapon === 'smg') return 'shot_smg';
	if (weapon === 'rifle') return 'shot_rifle';

	return 'shot_pistol';
}

/**
 * Consume solo los eventos nuevos de Barn Siege.
 * `lastMg5Seq` no se reinicia: el `seq` del store es monotónico.
 */
export function consumeMg5(
	events: readonly (Mg5Event & { seq: number })[],
	monsters: readonly Mg5MonsterSnapshot[],
	selfId: string | null
): AudioCue[] {
	const cues: AudioCue[] = [];

	for (const event of events) {
		if (event.seq <= eventCursors.lastMg5Seq) {
			continue;
		}

		eventCursors.lastMg5Seq = event.seq;
		const position = monsterPosition(event, monsters);
		const local = selfId !== null && event.playerId === selfId;

		switch (event.kind) {
			case 'monster-attack':
				cues.push(...monsterCue(event.monsterKind, 'attack', position, event.monsterId));
				break;

			case 'monster-hit':
				if (event.monsterKind) {
					cues.push({
						id: monsterHitSound(event.monsterKind),
						position,
						sourceId: event.monsterId,
						priority: 2
					});
					cues.push(...monsterCue(event.monsterKind, 'hurt', position, event.monsterId));
				}
				break;

			case 'monster-died':
				cues.push(...monsterCue(event.monsterKind, 'death', position, event.monsterId));
				break;

			case 'acid-thrown':
				cues.push({ id: 'acid_throw', position, priority: 2 });
				break;

			case 'acid-impact':
				cues.push({ id: 'acid_impact', position, priority: 3 });
				cues.push({ id: 'acid_sizzle', position, priority: 1 });
				break;

			case 'rock-thrown':
				cues.push({ id: 'grenade_throw', position, priority: 2 });
				break;

			case 'rock-impact':
				cues.push({ id: 'hit_stone', position, priority: 3 });
				cues.push({ id: 'explosion', position, priority: 2, volume: 0.55 });
				break;

			case 'grenade-exploded':
				cues.push({ id: 'explosion', position, priority: 3 });
				break;

			case 'player-hurt':
				if (local) {
					const heavy = (event.amount ?? 0) >= 30;
					cues.push({
						id: heavy ? 'player_hurt_heavy' : 'player_hurt_light',
						priority: 3
					});
				}
				break;

			case 'player-downed':
				if (local) {
					cues.push({ id: 'player_downed', priority: 3 });
				}
				break;

			case 'player-revived':
				if (local) {
					cues.push({ id: 'player_revive', priority: 2 });
				}
				break;

			case 'drop-picked':
				if (local) {
					cues.push({ id: dropSound(event.dropKind), priority: 2 });
				}
				break;

			case 'car-destroyed':
				cues.push({ id: 'car_explosion', position, priority: 3 });
				break;

			case 'wave-started':
				cues.push({ id: 'wave_start', priority: 3 });
				break;

			case 'wave-cleared':
				cues.push({ id: 'wave_clear', priority: 3 });
				break;

			case 'victory':
				cues.push({ id: 'mission_win', priority: 3 });
				break;

			case 'defeat':
				cues.push({ id: 'mission_lose', priority: 3 });
				break;

			default:
				break;
		}
	}

	return cues;
}

/**
 * Consume solo los eventos nuevos de Witch House Deathmatch.
 * Los disparos y granadas locales ya se reproducen al accionar los controles,
 * así que aquí solo se sonorizan los remotos, impactos y confirmaciones.
 */
export function consumeMg6(
	events: readonly (Mg6Event & { seq: number })[],
	selfId: string | null,
	selfTeam: Mg6Team | null
): AudioCue[] {
	const cues: AudioCue[] = [];

	for (const event of events) {
		if (event.seq <= eventCursors.lastMg6Seq) {
			continue;
		}

		eventCursors.lastMg6Seq = event.seq;

		const position = positionOf(event);
		const local = selfId !== null && event.playerId === selfId;
		const victimLocal = selfId !== null && event.otherId === selfId;

		switch (event.kind) {
			case 'shot-fired':
				if (!local && event.weapon && event.weapon !== 'grenade') {
					cues.push({
						id: shotSound(event.weapon),
						position,
						sourceId: event.playerId,
						volume: 0.8,
						priority: 2
					});
				}
				break;

			case 'player-hurt':
				if (local) {
					const heavy = (event.amount ?? 0) >= 30;
					cues.push({
						id: heavy ? 'player_hurt_heavy' : 'player_hurt_light',
						priority: 3
					});
				} else if (victimLocal) {
					cues.push({ id: 'hit_flesh', priority: 2, volume: 0.65 });
				}
				break;

			case 'grenade-thrown':
				if (!local) {
					cues.push({
						id: 'grenade_throw',
						position,
						sourceId: event.playerId,
						volume: 0.55,
						priority: 2
					});
				}
				break;

			case 'grenade-exploded':
				cues.push({ id: 'explosion', position, priority: 3 });
				break;

			case 'pickup-taken':
				if (local) {
					cues.push({ id: dropSound(event.pickupKind), priority: 2 });
				}
				break;

			case 'player-respawned':
				if (local) {
					cues.push({ id: 'player_revive', priority: 2 });
				}
				break;

			case 'player-died':
				if (local) {
					cues.push({ id: 'player_downed', priority: 3 });
				}
				break;

			case 'kill':
				if (local) {
					cues.push({ id: 'ui_confirm', priority: 2, volume: 0.7 });
				}
				break;

			case 'match-ended':
				if (event.winner === 'draw') {
					cues.push({ id: 'ui_confirm', priority: 3 });
				} else {
					cues.push({
						id: event.winner === selfTeam ? 'mission_win' : 'mission_lose',
						priority: 3
					});
				}
				break;

			default:
				break;
		}
	}

	return cues;
}

/**
 * Consume solo los eventos nuevos de Parkour: checkpoints, caídas, respawns,
 * meta y ataques de los guardianes. No hay daño, así que no hay sonidos de
 * herida ni de muerte.
 */
export function consumeMg7(
	events: readonly (Mg7Event & { seq: number })[],
	selfId: string | null
): AudioCue[] {
	const cues: AudioCue[] = [];

	for (const event of events) {
		if (event.seq <= eventCursors.lastMg7Seq) {
			continue;
		}

		eventCursors.lastMg7Seq = event.seq;

		const local = selfId !== null && event.playerId === selfId;
		const position = positionOf(event);

		switch (event.kind) {
			case 'checkpoint':
				if (local) {
					cues.push({ id: 'checkpoint', priority: 2 });
				}
				break;

			case 'fall':
				if (local) {
					cues.push({ id: 'parkour_fall', priority: 3 });
				}
				break;

			case 'respawn':
				if (local) {
					cues.push({ id: 'parkour_respawn', priority: 3 });
				}
				break;

			case 'finish':
				if (local) {
					cues.push({ id: 'parkour_finish', priority: 3 });
				}
				break;

			case 'match-start':
				cues.push({ id: 'countdown_go', priority: 3 });
				break;

			case 'countdown-shortened':
				cues.push({ id: 'ui_confirm', priority: 2 });
				break;

			case 'warden-attack': {
				const attack = event.attack;

				if (!attack) {
					break;
				}

				const origin = {
					x: attack.origin.x,
					y: attack.origin.y,
					z: attack.origin.z
				};

				if (attack.kind === 'rock') {
					cues.push({
						id: 'grenade_throw',
						position: origin,
						sourceId: attack.id,
						volume: 0.7,
						priority: 2
					});
				} else if (attack.kind === 'acid') {
					cues.push({
						id: 'acid_throw',
						position: origin,
						sourceId: attack.id,
						priority: 2
					});
				} else if (attack.kind === 'fire') {
					cues.push({
						id: 'acid_throw',
						position: origin,
						sourceId: attack.id,
						rate: 0.72,
						priority: 2
					});
				}
				break;
			}

			case 'shove':
				if (local) {
					cues.push({ id: 'land', volume: 0.45, priority: 2 });
				}
				break;

			case 'match-end':
				if (event.winnerId === null) {
					// Nadie terminó el recorrido: empate, sin jingle de derrota.
					cues.push({ id: 'ui_confirm', priority: 3 });
				} else {
					cues.push({
						id: event.winnerId === selfId ? 'mission_win' : 'mission_lose',
						priority: 3
					});
				}
				break;

			default:
				break;
		}
	}

	return cues;
}

/**
 * Consume solo los eventos nuevos de Skyfall Royale. El cliente no simula la
 * partida: los disparos, granadas, pickups y muertes llegan del servidor, y
 * los sonidos locales se distinguen por `playerId`.
 */
export function consumeMg8(
	events: readonly (Mg8Event & { seq: number })[],
	selfId: string | null
): AudioCue[] {
	const cues: AudioCue[] = [];

	for (const event of events) {
		if (event.seq <= eventCursors.lastMg8Seq) {
			continue;
		}

		eventCursors.lastMg8Seq = event.seq;

		const position = positionOf(event);
		const local = selfId !== null && event.playerId === selfId;
		const attackerLocal = selfId !== null && event.otherId === selfId;

		switch (event.kind) {
			case 'shot-fired':
				if (!local && event.weapon) {
					cues.push({
						id: shotSound(event.weapon),
						position,
						sourceId: event.playerId,
						volume: 0.8,
						priority: 2
					});
				}
				break;

			case 'player-hurt':
				if (local) {
					const heavy = (event.amount ?? 0) >= 30;
					cues.push({
						id: heavy ? 'player_hurt_heavy' : 'player_hurt_light',
						priority: 3
					});
				} else if (attackerLocal) {
					cues.push({ id: 'hit_flesh', priority: 2, volume: 0.65 });
				}
				break;

			case 'grenade-thrown':
				if (!local) {
					cues.push({
						id: 'grenade_throw',
						position,
						sourceId: event.playerId,
						volume: 0.55,
						priority: 2
					});
				}
				break;

			case 'grenade-exploded':
				cues.push({ id: 'explosion', position, priority: 3 });
				break;

			case 'loot-taken':
				if (local) {
					cues.push({ id: dropSound(event.lootKind), priority: 2 });
				}
				break;

			case 'player-jumped':
				if (local) {
					cues.push({ id: 'jump', volume: 0.7, priority: 2 });
				}
				break;

			case 'player-landed':
				if (local) {
					cues.push({ id: 'land', volume: 0.85, priority: 2 });
				}
				break;

			case 'player-died':
				if (local) {
					cues.push({ id: 'player_downed', priority: 3 });
				}
				break;

			case 'kill':
				if (local) {
					cues.push({ id: 'ui_confirm', priority: 2, volume: 0.7 });
				}
				break;

			case 'storm-phase':
				cues.push({ id: 'amb_thunder', volume: 0.7, priority: 2 });
				break;

			case 'storm-damage':
				if (local) {
					cues.push({ id: 'player_hurt_light', volume: 0.4, priority: 1 });
				}
				break;

			case 'match-ended':
				if (event.winner === null) {
					cues.push({ id: 'ui_confirm', priority: 3 });
				} else {
					cues.push({
						id: event.winner === selfId ? 'mission_win' : 'mission_lose',
						priority: 3
					});
				}
				break;

			default:
				break;
		}
	}

	return cues;
}

/**
 * `minigame2.events` es un array que se vacía al cambiar de escena o al
 * reiniciar la ronda; el cursor se ajusta si encoge.
 */
export function consumeMg2(events: readonly Mg2Event[], selfId: string | null): AudioCue[] {
	if (events.length === 0) {
		eventCursors.lastMg2Count = 0;
		return [];
	}

	if (events.length < eventCursors.lastMg2Count) {
		eventCursors.lastMg2Count = 0;
	}

	const cues: AudioCue[] = [];

	for (let index = eventCursors.lastMg2Count; index < events.length; index += 1) {
		const event = events[index];
		const local = selfId !== null && event.playerId === selfId;

		switch (event.kind) {
			case 'skull-picked':
				if (local) cues.push({ id: 'pickup_weapon', priority: 2 });
				break;
			case 'skull-dropped':
				cues.push({ id: 'hit_bone', priority: 1 });
				break;
			case 'skull-deposited':
				if (local) cues.push({ id: 'ui_confirm', priority: 2 });
				break;
			case 'round-start':
				cues.push({ id: 'wave_start', priority: 3 });
				break;
			case 'round-won':
				cues.push({ id: 'mission_win', priority: 3 });
				break;
			case 'round-lost':
				cues.push({ id: 'mission_lose', priority: 3 });
				break;
			case 'player-died':
				if (local) cues.push({ id: 'player_downed', priority: 3 });
				break;
			default:
				break;
		}
	}

	eventCursors.lastMg2Count = events.length;
	return cues;
}

function racePosition(event: RaceEvent): Point3 | undefined {
	return positionOf(event.to ?? {}) ?? positionOf(event.from ?? {});
}

/** Consume un único `race.lastEvent` por `eventSeq`. */
export function consumeRace(
	event: RaceEvent | null,
	seq: number,
	selfId: string | null
): AudioCue[] {
	if (!event || seq <= eventCursors.lastRaceSeq) {
		return [];
	}

	eventCursors.lastRaceSeq = seq;
	const position = racePosition(event);

	switch (event.kind) {
		case 'missile-fired':
			return [{ id: 'missile_fire', position, priority: 2 }];
		case 'missile-hit':
			return [{ id: 'missile_hit', position, priority: 3 }];
		case 'mine-placed':
			return [{ id: 'mine_drop', position, priority: 2 }];
		case 'mine-hit':
			return [{ id: 'mine_explode', position, priority: 3 }];
		case 'ray-fired':
			return [{ id: 'ray_fire', position, priority: 2 }];
		case 'item-picked':
			return [{ id: 'item_pick', priority: 2 }];
		case 'item-used':
			return [{ id: 'item_use', priority: 2 }];
		case 'gate-passed':
			return [{ id: 'gate_pass', priority: 2 }];
		case 'lap-completed':
			return [{ id: 'lap', priority: 2 }];
		case 'player-destroyed':
			return [{ id: 'race_destroyed', position, priority: 3 }];
		case 'player-respawned':
			return [{ id: 'race_respawn', priority: 2 }];
		case 'race-start':
			return [{ id: 'wave_start', priority: 3 }];
		case 'race-ended':
			// `playerId` es el ganador: solo hay victoria si ganamos nosotros.
			return [{ id: event.playerId === selfId ? 'mission_win' : 'mission_lose', priority: 3 }];
		default:
			return [];
	}
}

/** Consume un único `cars.lastEvent` por `eventSeq`, limitado al jugador local. */
export function consumeCar(
	event: CarEvent | null,
	seq: number,
	selfId: string | null,
	driving: boolean
): AudioCue[] {
	if (!event || seq <= eventCursors.lastCarSeq) {
		return [];
	}

	eventCursors.lastCarSeq = seq;

	const local = event.playerId === undefined || selfId === null || event.playerId === selfId;

	// `driving` se mantiene en la firma para el llamador, pero el store ya
	// actualizó su estado cuando llega el evento; el sonido debe sonar igual.
	void driving;

	if (!local) {
		return [];
	}

	switch (event.kind) {
		case 'entered':
			return driving ? [] : [{ id: 'car_enter', priority: 2 }];

		case 'exited':
			return driving ? [{ id: 'car_exit', priority: 2 }] : [];
		case 'damaged': {
			const amount = event.amount ?? 0;
			return [{ id: amount >= 18 ? 'car_impact_heavy' : 'car_impact_light', priority: 2 }];
		}
		case 'destroyed':
			return [{ id: 'car_explosion', priority: 3 }];
		case 'respawned':
			return [{ id: 'car_enter', priority: 2 }];
		default:
			return [];
	}
}

/** Un rollo de papel lanzado: whoosh corto en la mano del jugador. */
export function consumePaperThrow(roll: PaperRollState | null, seq: number): AudioCue[] {
	if (!roll || seq <= eventCursors.lastPaperThrowSeq) {
		return [];
	}

	eventCursors.lastPaperThrowSeq = seq;

	return [
		{
			id: 'paper_throw',
			position: { x: roll.x, y: roll.y, z: roll.z },
			volume: 0.8,
			sourceId: 'paper-roll',
			priority: 2
		}
	];
}

/** Un gatito capturado: maullido inmediato y ronroneo debajo. */
export function consumeCatCapture(event: CatCaptureEvent | null, seq: number): AudioCue[] {
	if (!event || seq <= eventCursors.lastCatCaptureSeq) {
		return [];
	}

	eventCursors.lastCatCaptureSeq = seq;
	const position = { ...event.position };

	const cues: AudioCue[] = [
		{
			id: 'cat_meow',
			position,
			volume: 0.95,
			sourceId: `cat-${event.catId}`,
			priority: 3
		},
		{
			id: 'cat_purr',
			position,
			volume: 0.6,
			sourceId: `cat-purr-${event.catId}`,
			priority: 2
		}
	];

	if (event.completed) {
		cues.push({ id: 'mission_win', priority: 3 });
	}

	return cues;
}
