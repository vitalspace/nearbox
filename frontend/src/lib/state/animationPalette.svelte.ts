import type { AnimationAction } from 'three';
import { ANIMATION_LABELS } from '../cosmetics/animationLabels';
import { HERO_ANIMATIONS, type HeroAnimation } from '../services/protocol';
import { isLoopingAnimation } from './playerAnimations.svelte';
import { playerInput } from './playerInput';

export type PaletteClip = {
	/** Clave del contrato (`HR_si`). */
	animation: HeroAnimation;
	/** Nombre real del clip en el GLB de la skin (`GH_si`). */
	clip: string;
	label: string;
	durationMs: number;
	looping: boolean;
};

/**
 * Un one-shot se previsualiza una vez (con un pequeño margen para que se vea
 * la última pose); un bucle se corta entre 2 y 4 segundos.
 */
export function previewDurationMs(durationSeconds: number, looping: boolean): number {
	const base = Math.max(durationSeconds, 0.4) * 1000;

	return looping
		? Math.min(Math.max(base * 2, 2000), 4000)
		: Math.min(Math.max(base + 200, 800), 12000);
}

/**
 * Estado del panel de animaciones: clips que posee la skin equipada, panel
 * abierto, preview activo y estado de sentado.
 */
class AnimationPalette {
	open = $state(false);
	clips = $state<PaletteClip[]>([]);
	previewing = $state<HeroAnimation | null>(null);
	sitting = $state(false);

	/** Firma de la última publicación, para no reasignar en cada frame. */
	private signature = '';

	get active(): HeroAnimation | null {
		return this.previewing ?? (this.sitting ? 'HR_sit' : null);
	}

	/**
	 * Publica el mapa de acciones de la skin actual. Solo se listan las claves
	 * presentes: un Ghost no tiene `sit` y un Scarecrow no tiene `shoot`/`wave`.
	 */
	publish(actions: Partial<Record<HeroAnimation, AnimationAction>> | undefined): void {
		const clips: PaletteClip[] = [];

		if (actions) {
			for (const animation of HERO_ANIMATIONS) {
				const action = actions[animation];

				if (!action) {
					continue;
				}

				const clip = action.getClip();

				clips.push({
					animation,
					clip: clip.name,
					label: ANIMATION_LABELS[animation],
					durationMs: Math.round(clip.duration * 1000),
					looping: isLoopingAnimation(animation)
				});
			}
		}

		const signature = clips
			.map((entry) => `${entry.animation}:${entry.clip}:${entry.durationMs}`)
			.join('|');

		if (signature === this.signature) {
			return;
		}

		this.signature = signature;
		this.clips = clips;

		// La skin cambió y el clip previsualizado ya no existe en el nuevo rig.
		if (this.previewing && !clips.some((entry) => entry.animation === this.previewing)) {
			this.previewing = null;
		}
	}

	toggle(): void {
		this.open = !this.open;
	}

	close(): void {
		this.open = false;
	}

	/**
	 * `sit` es un estado persistente: se conserva el toggle. El resto son
	 * previews temporales que `PlayerBehaviour` devuelve a locomoción.
	 */
	activate(animation: HeroAnimation): void {
		if (!this.clips.some((entry) => entry.animation === animation)) {
			return;
		}

		if (animation === 'HR_sit') {
			playerInput.requestSitToggle();
			return;
		}

		const entry = this.clips.find((item) => item.animation === animation);

		if (!entry) {
			return;
		}

		playerInput.requestPreview(
			animation,
			previewDurationMs(entry.durationMs / 1000, entry.looping)
		);
		this.previewing = animation;
	}

	markPreview(animation: HeroAnimation): void {
		this.previewing = animation;
	}

	endPreview(): void {
		this.previewing = null;
	}

	setSitting(value: boolean): void {
		this.sitting = value;
	}

	clear(): void {
		this.open = false;
		this.clips = [];
		this.previewing = null;
		this.sitting = false;
		this.signature = '';
	}
}

export const animationPalette = new AnimationPalette();
