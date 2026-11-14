<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { get } from 'svelte/store';
	import { Vector3 } from 'three';
	import { chat } from '../../state/chat.svelte';
	import { crosshair } from '../../state/crosshair.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { sceneState } from '../../state/sceneState.svelte';

	/**
	 * Keeps the DOM reticle in sync with the target the shot would lock onto.
	 *
	 * This mirrors the XZ aim-assist test from `WaveControls` /
	 * `DeathmatchControls`: what matters is the horizontal position of the
	 * enemy under the screen centre, not its chest height. Duplicating only
	 * the geometry (a cylinder) here keeps the visual feedback independent of
	 * firing.
	 */
	const { camera } = useThrelte();

	const AIM_ASSIST_RADIUS = 1.4;
	const MAX_RANGE = 60;

	const forward = new Vector3();
	const flatForward = new Vector3();

	let lastTarget = false;

	function trackWaves(cameraPosition: Vector3): boolean {
		const monsters = minigame5.sampleAt()?.monsters ?? minigame5.latestMonsters();

		return monsters.some((monster) => {
			if (monster.status !== 'active') return false;

			const along =
				(monster.x - cameraPosition.x) * flatForward.x +
				(monster.z - cameraPosition.z) * flatForward.z;

			if (along <= 0.2 || along > MAX_RANGE) return false;

			const miss = Math.hypot(
				monster.x - (cameraPosition.x + flatForward.x * along),
				monster.z - (cameraPosition.z + flatForward.z * along)
			);

			return miss <= AIM_ASSIST_RADIUS;
		});
	}

	function trackDeathmatch(cameraPosition: Vector3): boolean {
		const self = minigame6.self;
		if (!self) return false;

		const teams = new Map(
			(minigame6.snapshot?.players ?? []).map((player) => [player.id, player.team])
		);
		const players = minigame6.sampleAt()?.players ?? minigame6.latestPlayers();

		return players.some((player) => {
			if (!player.alive || player.id === minigame6.selfId) return false;
			if (teams.get(player.id) === self.team) return false;

			const along =
				(player.x - cameraPosition.x) * flatForward.x +
				(player.z - cameraPosition.z) * flatForward.z;

			if (along <= 0.2 || along > MAX_RANGE) return false;

			const miss = Math.hypot(
				player.x - (cameraPosition.x + flatForward.x * along),
				player.z - (cameraPosition.z + flatForward.z * along)
			);

			return miss <= AIM_ASSIST_RADIUS;
		});
	}

	function trackRoyale(cameraPosition: Vector3): boolean {
		const players = minigame8.sampleAt()?.players ?? minigame8.latestPlayers();

		return players.some((player) => {
			if (!player.alive || player.id === minigame8.selfId) return false;

			const along =
				(player.x - cameraPosition.x) * flatForward.x +
				(player.z - cameraPosition.z) * flatForward.z;

			if (along <= 0.2 || along > MAX_RANGE) return false;

			const miss = Math.hypot(
				player.x - (cameraPosition.x + flatForward.x * along),
				player.z - (cameraPosition.z + flatForward.z * along)
			);

			return miss <= AIM_ASSIST_RADIUS;
		});
	}

	useTask(() => {
		const activeCamera = get(camera);
		const wavesActive =
			sceneState.inWaves &&
			minigame5.phase === 'playing' &&
			!minigame5.isDowned &&
			!minigame5.isDriving &&
			!chat.isOpen;
		const deathmatchActive =
			sceneState.inDeathmatch && minigame6.phase === 'playing' && minigame6.isAlive && !chat.isOpen;
		const royaleActive =
			sceneState.inRoyale &&
			minigame8.phase === 'playing' &&
			minigame8.isAlive &&
			!minigame8.riding &&
			!chat.isOpen;

		let found = false;

		if (activeCamera && (wavesActive || deathmatchActive || royaleActive)) {
			activeCamera.getWorldDirection(forward);
			flatForward.set(forward.x, 0, forward.z);

			if (flatForward.lengthSq() > 1e-6) {
				flatForward.normalize();

				if (wavesActive) {
					found = trackWaves(activeCamera.position);
				} else if (deathmatchActive) {
					found = trackDeathmatch(activeCamera.position);
				} else {
					found = trackRoyale(activeCamera.position);
				}
			}
		}

		// Writing `$state` every frame would redraw the HUD constantly; only
		// publish transitions. The reticle itself is static apart from colour.
		if (found !== lastTarget) {
			lastTarget = found;
			crosshair.hasTarget = found;
		}
	});
</script>
