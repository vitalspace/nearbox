import { HERO_ANIMATIONS, type HeroAnimation } from '../services/protocol';
import type { PaletteClip } from '../state/animationPalette.svelte';
import { ANIMATION_LABELS } from './animationLabels';

/**
 * Gestos sociales que ocupan los primeros números de `/anim <n>`.
 *
 * Se mantienen delante para que `/anim 1` sea «yes» y `/anim 2` sea «no»,
 * como en el ejemplo pedido; el resto de clips sigue el orden del contrato.
 */
const SOCIAL_ORDER: readonly HeroAnimation[] = [
	'HR_si',
	'HR_no',
	'HR_hablar',
	'HR_dormir',
	'HR_gracias',
	'HR_paquete',
	'HR_dance'
];

/** Orden estable usado por `/anim <número>`. */
export const ANIMATION_COMMAND_ORDER: readonly HeroAnimation[] = [
	...SOCIAL_ORDER,
	...HERO_ANIMATIONS.filter((animation) => !SOCIAL_ORDER.includes(animation))
];

/**
 * Alias cortos y en español. Las etiquetas (`Yes`, `Talk`, …), las claves
 * (`HR_si`) y los nombres reales (`GH_si`) se resuelven solos; esto añade
 * atajos que no coinciden con ninguno de los tres.
 */
const ANIMATION_ALIASES: Record<string, HeroAnimation> = {
	y: 'HR_si',
	yes: 'HR_si',
	si: 'HR_si',
	n: 'HR_no',
	no: 'HR_no',
	talk: 'HR_hablar',
	hablar: 'HR_hablar',
	sleep: 'HR_dormir',
	dormir: 'HR_dormir',
	thanks: 'HR_gracias',
	thank: 'HR_gracias',
	gracias: 'HR_gracias',
	package: 'HR_paquete',
	paquete: 'HR_paquete',
	dance: 'HR_dance',
	bailar: 'HR_dance',
	baile: 'HR_dance',
	wave: 'HR_wave',
	saludar: 'HR_wave',
	attack: 'HR_attack',
	atacar: 'HR_attack',
	shoot: 'HR_shoot',
	disparar: 'HR_shoot',
	pickup: 'HR_pickup',
	recoger: 'HR_pickup',
	hit: 'HR_hit',
	golpe: 'HR_hit',
	golpear: 'HR_hit',
	death: 'HR_death',
	fall: 'HR_death',
	muerte: 'HR_death',
	morir: 'HR_death',
	injured: 'HR_injured',
	herido: 'HR_injured',
	heal: 'HR_heal',
	curar: 'HR_heal',
	carry: 'HR_carry',
	cargar: 'HR_carry',
	throw: 'HR_throw',
	lanzar: 'HR_throw',
	idle: 'HR_idle',
	quieto: 'HR_idle',
	walk: 'HR_walk',
	caminar: 'HR_walk',
	run: 'HR_run',
	correr: 'HR_run',
	jump: 'HR_jump',
	saltar: 'HR_jump',
	sit: 'HR_sit',
	sentarse: 'HR_sit',
	aim: 'HR_aim',
	apuntar: 'HR_aim',
	walkaim: 'HR_walk_aim',
	runaim: 'HR_run_aim',
	crouchaim: 'HR_crouch_aim'
};

/** Normaliza etiquetas, claves y nombres reales para compararlos. */
export function normalizeAnimationQuery(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]/g, '');
}

type Candidate = {
	animation: HeroAnimation;
	label: string;
	/** Nombre real del clip en el GLB; ausente si solo conocemos el contrato. */
	clip?: string;
};

function suffix(value: string): string {
	const index = value.lastIndexOf('_');

	return index >= 0 ? value.slice(index + 1) : value;
}

function scoreCandidate(candidate: Candidate, query: string): number {
	const alias = ANIMATION_ALIASES[query];

	if (alias === candidate.animation) return 100;
	if (normalizeAnimationQuery(candidate.animation) === query) return 95;
	if (candidate.clip && normalizeAnimationQuery(candidate.clip) === query) return 90;
	if (normalizeAnimationQuery(candidate.label) === query) return 85;
	if (normalizeAnimationQuery(suffix(candidate.animation)) === query) return 75;
	if (candidate.clip && normalizeAnimationQuery(suffix(candidate.clip)) === query) return 70;

	return 0;
}

function bestCandidate<T extends Candidate>(
	candidates: readonly T[],
	query: string
): T | undefined {
	let best: T | undefined;
	let bestScore = 0;

	for (const candidate of candidates) {
		const score = scoreCandidate(candidate, query);

		// `>` (no `>=`) conserva el primer candidato en caso de empate, que es
		// el que aparece antes en el orden del contrato.
		if (score > bestScore) {
			best = candidate;
			bestScore = score;
		}
	}

	return best;
}

/** Clips disponibles ordenados como los numera `/anim <n>`. */
export function animationCommandClips(clips: readonly PaletteClip[]): PaletteClip[] {
	const byAnimation = new Map(clips.map((entry) => [entry.animation, entry]));

	return ANIMATION_COMMAND_ORDER.map((animation) => byAnimation.get(animation)).filter(
		(entry): entry is PaletteClip => entry !== undefined
	);
}

export type AnimationCommandResult =
	| { kind: 'clip'; clip: PaletteClip }
	| { kind: 'list' }
	| { kind: 'empty' }
	| { kind: 'unavailable'; animation: HeroAnimation; label: string }
	| { kind: 'unknown'; query: string };

/**
 * Resuelve la parte que sigue a `/anim`.
 *
 * Acepta nombres (`yes`, `talk`, `hablar`, `HR_si`, `GH_si`…), números
 * (`/anim 1`) y las variantes `list`/`lista`/`help`/`ayuda`/`?`.
 */
export function parseAnimationCommand(
	clips: readonly PaletteClip[],
	rawQuery: string
): AnimationCommandResult {
	if (clips.length === 0) {
		return { kind: 'empty' };
	}

	const query = rawQuery.trim();
	const normalized = normalizeAnimationQuery(query);

	if (
		query === '?' ||
		normalized === 'list' ||
		normalized === 'lista' ||
		normalized === 'help' ||
		normalized === 'ayuda'
	) {
		return { kind: 'list' };
	}

	if (/^\d+$/.test(query)) {
		const list = animationCommandClips(clips);
		const index = Number(query) - 1;
		const clip = list[index];

		return clip ? { kind: 'clip', clip } : { kind: 'unknown', query };
	}

	if (normalized.length === 0) {
		return { kind: 'list' };
	}

	const available = bestCandidate(clips, normalized);

	if (available) {
		return { kind: 'clip', clip: available };
	}

	// El clip existe en el contrato pero la skin equipada no lo tiene.
	const known = bestCandidate(
		HERO_ANIMATIONS.map((animation) => ({
			animation,
			label: ANIMATION_LABELS[animation]
		})),
		normalized
	);

	if (known) {
		return { kind: 'unavailable', animation: known.animation, label: known.label };
	}

	return { kind: 'unknown', query };
}

/**
 * Líneas de ayuda para `/anim` y `/anim list`. Se parten en mensajes cortos
 * para que el chat no muestre un bloque enorme.
 */
export function animationCommandHelp(clips: readonly PaletteClip[]): string[] {
	const list = animationCommandClips(clips);

	if (list.length === 0) {
		return ['No animations available.'];
	}

	const entries = list.map((entry, index) => `${index + 1}. ${entry.label}`);
	const lines = ['Animations: /anim <name|number>'];

	for (let index = 0; index < entries.length; index += 8) {
		lines.push(entries.slice(index, index + 8).join(' · '));
	}

	return lines;
}
