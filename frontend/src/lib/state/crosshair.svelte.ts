/**
 * Shared state for the combat reticle.
 *
 * The DOM overlay cannot read the Threlte camera or the monster lists, so
 * `CrosshairTracker` (inside the Canvas) resolves what the reticle is over and
 * publishes it here. The HUD only paints it.
 */
class CrosshairState {
	/** True when the aim-assist capsule under the reticle has a valid target. */
	hasTarget = $state(false);
}

export const crosshair = new CrosshairState();
