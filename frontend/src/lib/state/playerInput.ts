import type { HeroAnimation } from '../services/protocol';

const clampAxis = (value: number): number => Math.min(1, Math.max(-1, value));

/**
 * Unified player input for keyboard and touch controls.
 *
 * `moveX` / `moveZ` use the same convention as `PlayerBehaviour`:
 *   +X → right, -X → left, +Z → down/back, -Z → up/forward.
 * The analog stick already delivers normalized values (-1..1) with a dead zone.
 */
class PlayerInput {
	moveX = 0;
	moveZ = 0;
	run = false;

	private jumpRequested = false;
	private hitRequested = false;
	private previewRequested: { animation: HeroAnimation; durationMs: number } | null = null;
	private sitToggleRequested = false;

	get isStickActive(): boolean {
		return this.moveX !== 0 || this.moveZ !== 0;
	}

	setMove(x: number, z: number): void {
		this.moveX = clampAxis(x);
		this.moveZ = clampAxis(z);
	}

	setRun(active: boolean): void {
		this.run = active;
	}

	requestJump(): void {
		this.jumpRequested = true;
	}

	/** Consumes the jump only once to avoid repeated jumps while held. */
	consumeJump(): boolean {
		const requested = this.jumpRequested;
		this.jumpRequested = false;
		return requested;
	}

	/** The player just took a hit (a roll colliding with their capsule). */
	requestHit(): void {
		this.hitRequested = true;
	}

	consumeHit(): boolean {
		const requested = this.hitRequested;
		this.hitRequested = false;
		return requested;
	}

	/** Requests a timed preview of a clip from the animation panel. */
	requestPreview(animation: HeroAnimation, durationMs: number): void {
		this.previewRequested = { animation, durationMs };
	}

	consumePreview(): { animation: HeroAnimation; durationMs: number } | null {
		const requested = this.previewRequested;
		this.previewRequested = null;
		return requested;
	}

	/** Toggles between sitting and standing. */
	requestSitToggle(): void {
		this.sitToggleRequested = true;
	}

	consumeSitToggle(): boolean {
		const requested = this.sitToggleRequested;
		this.sitToggleRequested = false;
		return requested;
	}

	reset(): void {
		this.moveX = 0;
		this.moveZ = 0;
		this.run = false;
		this.jumpRequested = false;
		this.hitRequested = false;
		this.previewRequested = null;
		this.sitToggleRequested = false;
	}
}

export const playerInput = new PlayerInput();
