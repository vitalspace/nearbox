/**
 * Map physics loading state.
 *
 * `ready` is set to true by the ground `AutoColliders` (`Circle`) once the
 * trimeshes exist. Until then the player waits at the spawn without
 * gravity so they do not fall into the void.
 */
class MapState {
	ready = $state(false);

	reset(): void {
		this.ready = false;
	}
}

export const mapState = new MapState();
