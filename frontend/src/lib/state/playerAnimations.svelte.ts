import type { AnimationAction } from 'three';
import { LoopOnce, LoopRepeat } from 'three';
import type { HeroAnimation } from '../services/protocol';

/**
 * Clips del rig que se reproducen en bucle; el resto son instantáneos.
 *
 * Los clips de puntería (`HR_aim`, `HR_walk_aim`, `HR_run_aim`,
 * `HR_crouch_aim`) son locomoción: si no están aquí, los avatares remotos los
 * reproducen una sola vez y se quedan congelados en la última pose.
 */
const LOOPING: ReadonlySet<HeroAnimation> = new Set([
	'HR_idle',
	'HR_walk',
	'HR_run',
	'HR_sit',
	'HR_aim',
	'HR_walk_aim',
	'HR_run_aim',
	'HR_crouch_aim',
	'HR_hablar'
]);

const FADE = 0.12;

/** `true` si el clip se reproduce en bucle (locomoción) y no es un one-shot. */
export function isLoopingAnimation(name: string): boolean {
	return LOOPING.has(name as HeroAnimation);
}

/**
 * Reproduce `name` sobre `actions` con fundido respecto a `current`.
 *
 * `loop` fuerza el modo del clip; si se omite, los clips de la lista
 * `LOOPING` (los del rig del jugador) van en bucle y el resto queda clavado
 * en su última pose. Devuelve `true` si algo cambió. Sirve para el jugador
 * propio y para los avatares remotos.
 */
export function playRigClip(
	actions: Partial<Record<string, AnimationAction>> | undefined,
	current: string,
	name: string,
	loop?: boolean
): boolean {
	const action = actions?.[name];

	if (!action || name === current) {
		return false;
	}

	const previous = current ? actions?.[current] : undefined;
	const looping = loop ?? LOOPING.has(name as HeroAnimation);

	action.enabled = true;
	action.setEffectiveWeight(1);
	action.setLoop(looping ? LoopRepeat : LoopOnce, looping ? Infinity : 1);
	if (!looping) action.clampWhenFinished = true;
	action.reset().fadeIn(FADE).play();
	previous?.fadeOut(FADE);

	return true;
}

/**
 * Reinicia un one-shot que ya terminó y quedó clavado en su última pose.
 *
 * `playRigClip` descarta el clip cuando ya es el actual, así que los avatares
 * remotos (que no reciben eventos de `finished`) se quedaban congelados al
 * repetirse el mismo gesto. Solo reinicia si la acción ya no corre, para no
 * devolver el disparo al primer frame en cada mensaje.
 */
export function replayRigClip(
	actions: Partial<Record<string, AnimationAction>> | undefined,
	name: string
): boolean {
	const action = actions?.[name];

	if (!action || action.isRunning()) {
		return false;
	}

	action.enabled = true;
	action.setEffectiveWeight(1);
	action.reset().play();

	return true;
}

/**
 * Animaciones del rig del jugador (`Hero.glb`).
 *
 * La propia se emite por el WebSocket en cuanto cambia el clip; la de cada
 * jugador remoto llega desde el servidor y se guarda aquí para que sus
 * avatares la reproduzcan.
 */
class PlayerAnimations {
	/** Clip activo de cada jugador remoto, indexado por id de presencia. */
	remote = $state<Record<string, HeroAnimation>>({});

	/**
	 * Contador de mensajes por jugador. Permite distinguir «este jugador volvió
	 * a emitir el mismo clip» de «otro jugador emitió el suyo»: sin esto, cada
	 * mensaje reiniciaría los one-shots de todos los avatares.
	 */
	private revisions = $state<Record<string, number>>({});

	private sender: ((animation: HeroAnimation) => boolean) | null = null;

	setSender(sender: (animation: HeroAnimation) => boolean): void {
		this.sender = sender;
	}

	/** Emite la animación propia al servidor (sin conexión no hace nada). */
	broadcast(animation: HeroAnimation): void {
		this.sender?.(animation);
	}

	apply(playerId: string, animation: HeroAnimation): void {
		this.remote = { ...this.remote, [playerId]: animation };
		this.revisions = { ...this.revisions, [playerId]: (this.revisions[playerId] ?? 0) + 1 };
	}

	get(playerId: string): HeroAnimation | undefined {
		return this.remote[playerId];
	}

	/** Número de mensajes de animación recibidos de ese jugador. */
	revision(playerId: string): number {
		return this.revisions[playerId] ?? 0;
	}

	/** Descarta el estado de jugadores que ya no están conectados. */
	prune(activeIds: Iterable<string>): void {
		const active = new Set(activeIds);
		const next: Record<string, HeroAnimation> = {};
		const nextRevisions: Record<string, number> = {};

		for (const [id, animation] of Object.entries(this.remote)) {
			if (active.has(id)) {
				next[id] = animation;
			}
		}

		for (const [id, revision] of Object.entries(this.revisions)) {
			if (active.has(id)) {
				nextRevisions[id] = revision;
			}
		}

		this.remote = next;
		this.revisions = nextRevisions;
	}

	reset(): void {
		this.remote = {};
		this.revisions = {};
	}
}

export const playerAnimations = new PlayerAnimations();
