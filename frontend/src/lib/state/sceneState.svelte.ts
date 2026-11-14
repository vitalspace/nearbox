import { worldMaps, type WorldMapId } from '../world/registry.generated';
import { lobby } from './lobby.svelte';

/**
 * Active 3D scene.
 *
 * - `map`: outdoor world (`map.glb`).
 * - `crypt`: crypt of `minigame-2` (`game2.glb`).
 * - `roadmap`: stunt track (`roadmap.glb`).
 * - `barnsiege`: Barn Siege arena (`barnsiege.glb`, `minigame-5`).
 * - `parkour`: Halloween Tower race (`Parkour.glb`, `minigame-7`).
 * - Any other registered id can be previewed in development with
 *   `?map=<id>`.
 */
export type SceneId = WorldMapId;

class SceneState {
	private overrideMap = $state<WorldMapId | null>(null);

	get devMap(): WorldMapId | null {
		if (!import.meta.env.DEV || typeof window === 'undefined') return null;
		const requested = new URLSearchParams(window.location.search).get('map');
		return requested && requested in worldMaps ? (requested as WorldMapId) : null;
	}

	get active(): SceneId {
		if (this.devMap) return this.devMap;
		if (lobby.self?.lobbyId === 'minigame-2') return 'crypt';
		if (lobby.self?.lobbyId === 'minigame-4') return 'roadmap';
		if (lobby.self?.lobbyId === 'minigame-5') return 'barnsiege';
		if (lobby.self?.lobbyId === 'minigame-6') return 'barnsiege';
		if (lobby.self?.lobbyId === 'minigame-7') return 'parkour';
		if (lobby.self?.lobbyId === 'minigame-8') return 'islas-ciudad';
		if (this.overrideMap) return this.overrideMap;
		return 'map';
	}

	get inCrypt(): boolean {
		return this.active === 'crypt';
	}

	get inGlobal(): boolean {
		return this.active === 'map';
	}

	/**
	 * Hub overlays (checkpoints, cats, free cars, missions) only belong to the
	 * outdoor map. The Grand Prix shares that map but is a race, so it must not
	 * draw hub UI on top of the track.
	 */
	get inHub(): boolean {
		return this.inGlobal && !this.inRace;
	}

	get inRoadmap(): boolean {
		return this.active === 'roadmap';
	}

	get inBarnsiege(): boolean {
		return this.active === 'barnsiege';
	}

	get inGrandPrix(): boolean {
		return lobby.self?.lobbyId === 'minigame-3';
	}

	get inRoadmapRace(): boolean {
		return lobby.self?.lobbyId === 'minigame-4';
	}

	get inWaves(): boolean {
		return lobby.self?.lobbyId === 'minigame-5';
	}

	get inDeathmatch(): boolean {
		return lobby.self?.lobbyId === 'minigame-6';
	}

	get inParkour(): boolean {
		return lobby.self?.lobbyId === 'minigame-7';
	}

	get inRoyale(): boolean {
		return lobby.self?.lobbyId === 'minigame-8';
	}

	/** `minigame-6` reuses the Barn Siege arena, but with its own HUD and rules. */
	get inDeathmatchScene(): boolean {
		return this.inDeathmatch;
	}

	get inRace(): boolean {
		return this.inGrandPrix || this.inRoadmapRace;
	}

	/**
	 * Minigames with their own 3D scene: first-person camera. Future ones
	 * (minigame 1, 3, …) are added here once they have a scene.
	 */
	get firstPerson(): boolean {
		return this.inCrypt;
	}

	setMap(id: WorldMapId): void {
		this.overrideMap = id;
	}

	resetMap(): void {
		this.overrideMap = null;
	}
}

export const sceneState = new SceneState();
