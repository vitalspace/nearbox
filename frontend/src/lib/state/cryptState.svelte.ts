/**
 * Crypt scene state (`game2.glb`).
 *
 * `ready` is set to true by the `AutoColliders` of `A4C_Hall` once the
 * trimeshes exist. Until then the player waits at the crypt spawn without
 * gravity so they do not fall into the void.
 */
class CryptState {
	ready = $state(false);

	/** Nodes with a collider from the whitelist (`crypt-colliders.json`). */
	nodes = $state(16);

	/** Collider triangles declared by `crypt:check`. */
	triangles = $state(21_820);

	reset(): void {
		this.ready = false;
	}
}

export const cryptState = new CryptState();
