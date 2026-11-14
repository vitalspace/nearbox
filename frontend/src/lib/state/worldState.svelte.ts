/**
 * Map physics state.
 *
 * Each map sets its `ready` flag once its colliders exist. The player waits
 * at the spawn without gravity until the active map is ready. When a map is
 * unmounted it is reset so an old state is not reused when remounting it.
 */
class WorldState {
	ready = $state<Record<string, boolean>>({});
	stats = $state<Record<string, { nodes: number; triangles: number; colliders: number }>>({});

	markReady(id: string, stats?: { nodes: number; triangles: number; colliders: number }): void {
		this.ready = { ...this.ready, [id]: true };
		if (stats) this.stats = { ...this.stats, [id]: stats };
	}

	reset(id: string): void {
		this.ready = { ...this.ready, [id]: false };
	}

	isReady(id: string): boolean {
		return this.ready[id] === true;
	}
}

export const worldState = new WorldState();
