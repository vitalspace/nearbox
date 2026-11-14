<script lang="ts">
	import { useTask } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import { cars } from '../../state/cars.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { playerIntent } from '../../state/playerIntent';
	import { playerRuntime, playerState } from '../../state/playerState';
	import { race } from '../../state/race.svelte';
	import { remotePlayers } from '../../state/remotePlayers.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import { audio } from '../../audio/engine';
	import type { SoundId } from '../../audio/recipes';
	import type { LoopHandle, SurfaceId } from '../../audio/types';
	import { carTelemetry, clearCarTelemetry } from '../../audio/telemetry';
	import {
		AMBIENCE_EVENTS,
		activeAmbienceForScene,
		ambientEventPosition,
		surfaceForAmbienceZone,
		type AmbienceEvent,
		type AmbienceZone
	} from '../../audio/zones';

	/**
	 * Audio ligado a la escena: listener, pasos, motores, monstruos y ambiente.
	 *
	 * Todo se actualiza desde un único `useTask` con acumuladores de tiempo;
	 * no se crean nodos por frame, solo se ajustan handles existentes.
	 */

	const WALK_STRIDE = 1.75;
	const RUN_STRIDE = 2.45;
	const LISTENER_INTERVAL = 1 / 15;
	const SLOW_INTERVAL = 0.1;
	const MAX_MONSTER_LOOPS = 6;
	const MAX_REMOTE_CARS = 2;
	const MAX_REMOTE_FOOTSTEPS = 4;

	type MonsterVoice = {
		handle: LoopHandle;
		gain: number;
	};

	// Pasos.
	let lastX = playerState.x;
	let lastZ = playerState.z;
	let hasLast = false;
	let stepDistance = 0;
	let airTime = 0;
	let wasGrounded = playerState.grounded;
	let listenerAccumulator = 0;
	let slowAccumulator = 0;
	let ambienceAccumulator = 0;
	let ambientEventTimer = 6 + Math.random() * 10;
	let lastScene = sceneState.active;
	let lastZone: AmbienceZone | null = null;
	let zoneHandle: LoopHandle | null = null;

	const monsterLoops = new Map<string, MonsterVoice>();
	const remoteCarLoops = new Map<string, LoopHandle>();
	const remoteFootsteps = new Map<string, { x: number; z: number; distance: number; at: number }>();
	const cryptMummyLoops = new Map<string, LoopHandle>();
	const cryptMummyStates = new Map<string, string>();
	const cryptMummyAlertAt = new Map<string, number>();

	let engineHandle: LoopHandle | null = null;
	let tireHandle: LoopHandle | null = null;

	function nowMs(): number {
		return typeof performance !== 'undefined' ? performance.now() : Date.now();
	}

	function isMovementBlocked(): boolean {
		if (playerRuntime.frozen || playerRuntime.drivingCarId !== null || playerRuntime.racing) {
			return true;
		}

		if (minigame5.isDriving || minigame5.blocksMovement) {
			return true;
		}

		return false;
	}

	function footstepVariant(): 0 | 1 | 2 {
		return Math.floor(Math.random() * 3) as 0 | 1 | 2;
	}

	function playFootstep(surface: SurfaceId, volume: number, sourceId: string): void {
		const id = `footstep_${surface}_${footstepVariant()}` as SoundId;
		audio.play(id, {
			volume,
			rate: 0.95 + Math.random() * 0.1,
			sourceId,
			priority: sourceId === 'player' ? 2 : 1
		});
	}

	function activeZone(): AmbienceZone {
		return activeAmbienceForScene(sceneState.active, playerState.x, playerState.z, {
			inWaves: sceneState.inWaves,
			inRace: sceneState.inRace
		});
	}

	function updateListener(delta: number): void {
		listenerAccumulator += delta;
		audio.setMaxDistance(sceneState.inCrypt ? 22 : 45);

		if (listenerAccumulator < LISTENER_INTERVAL) {
			return;
		}

		listenerAccumulator = 0;
		audio.setListener(playerState.x, playerState.y + 1.5, playerState.z, playerState.cameraYaw);
	}

	function updateFootsteps(delta: number): void {
		const x = playerState.x;
		const z = playerState.z;

		if (!hasLast) {
			lastX = x;
			lastZ = z;
			hasLast = true;
			return;
		}

		const dx = x - lastX;
		const dz = z - lastZ;
		const distance = Math.hypot(dx, dz);
		lastX = x;
		lastZ = z;

		if (distance > 5) {
			// Teletransporte (puerta, spawn, respawn): no pisar el vacío.
			stepDistance = 0;
			airTime = 0;
			wasGrounded = playerState.grounded;
			return;
		}

		if (!playerState.grounded) {
			airTime += delta;
		} else if (airTime > 0.25 && wasGrounded === false) {
			audio.play('land', { volume: 0.9, priority: 2 });
			airTime = 0;
			stepDistance = 0;
		} else {
			airTime = 0;
		}

		if (wasGrounded && !playerState.grounded && !isMovementBlocked()) {
			audio.play('jump', { volume: 0.65, priority: 2 });
		}

		wasGrounded = playerState.grounded;

		if (isMovementBlocked() || !playerState.grounded) {
			return;
		}

		stepDistance += distance;
		const running = playerIntent.run;
		const stride = running ? RUN_STRIDE : WALK_STRIDE;

		if (stepDistance < stride) {
			return;
		}

		stepDistance %= stride;
		const zone = activeZone();
		playFootstep(surfaceForAmbienceZone(zone, x, z), running ? 0.85 : 0.7, 'player');
	}

	function resolveRemoteCarList(): Array<{ id: string; x: number; z: number; speed: number }> {
		const list: Array<{ id: string; x: number; z: number; speed: number }> = [];

		if (sceneState.inRace) {
			// En cuenta atrás o después de la meta los coches están parados:
			// mantener sus loops los dejaría sonando indefinidamente.
			if (race.phase !== 'playing') {
				return list;
			}

			for (const [id, position] of Object.entries(race.positions)) {
				if (id === race.selfId) continue;
				list.push({ id: `race:${id}`, x: position.x, z: position.z, speed: position.speed });
			}

			return list;
		}

		for (const [id, car] of Object.entries(cars.cars)) {
			if (!car || car.driverId === cars.selfId) continue;
			if (car.status === 'destroyed' || car.status === 'respawning') continue;
			// Un coche aparcado no tiene motor en marcha: si se acaba de bajar
			// el jugador, su loop local se apaga y este no debe relevarlo.
			if (!car.driverId) continue;
			list.push({ id: `car:${id}`, x: car.position.x, z: car.position.z, speed: car.speed });
		}

		return list;
	}

	function updateCarAudio(delta: number, slowTick: boolean): void {
		const fresh = nowMs() - carTelemetry.at < 300;
		const driving = fresh && carTelemetry.driving;

		if (!driving) {
			if (engineHandle) {
				engineHandle.setGain(0, 250);
				engineHandle.stop(320);
				engineHandle = null;
			}

			if (tireHandle) {
				tireHandle.setGain(0, 140);
				tireHandle.stop(220);
				tireHandle = null;
			}

			clearCarTelemetry();
			return;
		}

		const ratio = Math.min(1, Math.max(0, carTelemetry.speed / Math.max(1, carTelemetry.maxSpeed)));

		if (!engineHandle) {
			engineHandle = audio.loop('car_engine', { volume: 0, sourceId: 'local-engine' });
		}

		if (engineHandle) {
			engineHandle.setRate(0.65 + ratio * 1.75, 80);
			engineHandle.setGain(
				0.04 + Math.min(1, Math.max(0, carTelemetry.throttle)) * 0.08 + ratio * 0.06,
				80
			);
		}

		const sliding =
			carTelemetry.speed > 6 && (Math.abs(carTelemetry.steering) > 0.55 || carTelemetry.handbrake);

		if (sliding) {
			if (!tireHandle) {
				tireHandle = audio.loop('car_tire', { volume: 0, sourceId: 'local-tire' });
			}

			if (tireHandle) {
				const slip = Math.min(
					1,
					Math.abs(carTelemetry.steering) * 0.7 + (carTelemetry.handbrake ? 0.5 : 0)
				);
				tireHandle.setGain(0.08 + slip * 0.3, 120);
				tireHandle.setRate(0.9 + ratio * 0.3, 120);
			}
		} else if (tireHandle) {
			tireHandle.setGain(0, 120);
			tireHandle.stop(200);
			tireHandle = null;
		}

		if (!slowTick) {
			return;
		}

		// Coches remotos: los dos más cercanos, motor al 30 %.
		const nearby = resolveRemoteCarList()
			.map((car) => ({
				...car,
				distance: Math.hypot(car.x - playerState.x, car.z - playerState.z)
			}))
			.filter((car) => car.distance <= 25)
			.sort((a, b) => a.distance - b.distance)
			.slice(0, MAX_REMOTE_CARS);

		const keep = new Set(nearby.map((car) => car.id));

		for (const [id, handle] of remoteCarLoops) {
			if (!keep.has(id)) {
				handle.setGain(0, 300);
				handle.stop(400);
				remoteCarLoops.delete(id);
			}
		}

		for (const car of nearby) {
			let handle: LoopHandle | null = remoteCarLoops.get(car.id) ?? null;

			if (!handle) {
				handle = audio.loop('car_engine', {
					position: { x: car.x, y: 0, z: car.z },
					volume: 0,
					sourceId: `remote-${car.id}`
				});

				if (!handle) continue;
				remoteCarLoops.set(car.id, handle);
			}

			const attenuation = Math.max(0, 1 - car.distance / 26);
			handle.setPosition({ x: car.x, y: 0, z: car.z }, 180);
			handle.setRate(0.6 + Math.min(1, car.speed / 40) * 1.2, 180);
			handle.setGain(0.3 * attenuation, 180);
		}

		// Pasos remotos del mapa: 4 jugadores a ≤ 18 m.
		if (sceneState.active === 'map') {
			const now = nowMs();
			const next = new Map<string, { x: number; z: number; distance: number; at: number }>();
			const players = Object.entries(remotePlayers.positions)
				.map(([id, position]) => ({
					id,
					x: position.x,
					z: position.z,
					distance: Math.hypot(position.x - playerState.x, position.z - playerState.z)
				}))
				.sort((a, b) => a.distance - b.distance)
				.slice(0, MAX_REMOTE_FOOTSTEPS);

			for (const player of players) {
				if (player.distance > 18) continue;
				const previous = remoteFootsteps.get(player.id);
				let accumulated = previous?.distance ?? 0;

				if (previous) {
					const moved = Math.hypot(player.x - previous.x, player.z - previous.z);

					if (moved > 0.05 && moved < 3 && now - previous.at < 1000) {
						accumulated += moved;
					}
				}

				if (accumulated >= 2.1) {
					accumulated = 0;
					playFootstep(
						surfaceForAmbienceZone(activeZone(), player.x, player.z),
						Math.max(0.15, 0.5 * (1 - player.distance / 20)),
						`remote-${player.id}`
					);
				}

				next.set(player.id, { x: player.x, z: player.z, distance: accumulated, at: now });
			}

			remoteFootsteps.clear();

			for (const [id, value] of next) {
				remoteFootsteps.set(id, value);
			}
		}
	}

	function updateMonsters(slowTick: boolean): void {
		if (!slowTick || !sceneState.inWaves) {
			if (!sceneState.inWaves) {
				for (const voice of monsterLoops.values()) {
					voice.handle.setGain(0, 350);
					voice.handle.stop(450);
				}

				monsterLoops.clear();
			}

			return;
		}

		const nearby = minigame5.monsters
			.filter((monster) => monster.status !== 'dead')
			.map((monster) => ({
				monster,
				distance: Math.hypot(monster.x - playerState.x, monster.z - playerState.z)
			}))
			.filter((entry) => entry.distance <= 28)
			.sort((a, b) => a.distance - b.distance)
			.slice(0, MAX_MONSTER_LOOPS);

		const keep = new Set(nearby.map((entry) => entry.monster.id));

		for (const [id, voice] of monsterLoops) {
			if (!keep.has(id)) {
				voice.handle.setGain(0, 350);
				voice.handle.stop(450);
				monsterLoops.delete(id);
			}
		}

		for (const entry of nearby) {
			const { monster, distance } = entry;
			let voice = monsterLoops.get(monster.id);

			if (!voice) {
				// Histéresis: arranca a ≤ 25 m; si ya sonaba, aguanta hasta 28 m.
				if (distance > 25) continue;
				const handle = audio.loop(`monster_${monster.kind}_idle` as SoundId, {
					position: { x: monster.x, y: monster.y, z: monster.z },
					volume: 0,
					sourceId: `monster-${monster.id}`,
					priority: 1
				});

				if (!handle) continue;
				voice = { handle, gain: 0 };
				monsterLoops.set(monster.id, voice);
			}

			const attenuation = Math.max(0, 1 - distance / 30);
			voice.gain = 0.16 + attenuation * 0.34;
			voice.handle.setPosition({ x: monster.x, y: monster.y, z: monster.z }, 150);
			voice.handle.setGain(voice.gain, 150);
		}
	}

	function stopCryptMummyLoops(fadeMs: number): void {
		for (const handle of cryptMummyLoops.values()) {
			handle.setGain(0, fadeMs);
			handle.stop(fadeMs + 100);
		}

		cryptMummyLoops.clear();
	}

	/**
	 * Gruñidos de las momias de la cripta.
	 *
	 * Solo suenan mientras persiguen (`chase`) y están cerca; el estado viene
	 * del snapshot autoritativo y la posición de la muestra interpolada a 10 Hz.
	 * Al entrar en persecución se dispara un gruñido corto además del loop.
	 */
	function updateCryptMummies(slowTick: boolean): void {
		if (!sceneState.inCrypt || minigame2.phase !== 'playing') {
			if (cryptMummyLoops.size > 0) {
				stopCryptMummyLoops(350);
			}

			cryptMummyStates.clear();
			return;
		}

		if (!slowTick) {
			return;
		}

		const snapshot = minigame2.snapshot;

		if (!snapshot) {
			stopCryptMummyLoops(350);
			cryptMummyStates.clear();
			return;
		}

		const posed = new Map(minigame2.sampleAt().mummies.map((mummy) => [mummy.id, mummy]));
		const keep = new Set<string>();
		const now = nowMs();

		for (const mummy of snapshot.mummies) {
			const pose = posed.get(mummy.id) ?? mummy;
			const previous = cryptMummyStates.get(mummy.id);
			cryptMummyStates.set(mummy.id, mummy.state);

			if (mummy.state !== 'chase') {
				continue;
			}

			const distance = Math.hypot(pose.x - playerState.x, pose.z - playerState.z);

			if (distance > 24) {
				continue;
			}

			keep.add(mummy.id);
			const position = { x: pose.x, y: pose.y, z: pose.z };

			if (previous !== 'chase' && now - (cryptMummyAlertAt.get(mummy.id) ?? 0) >= 4000) {
				cryptMummyAlertAt.set(mummy.id, now);
				audio.play('monster_mummy_attack', {
					position,
					volume: 0.7,
					sourceId: `crypt-mummy-alert-${mummy.id}`,
					priority: 3
				});
			}

			let handle = cryptMummyLoops.get(mummy.id) ?? null;

			if (!handle) {
				handle = audio.loop('monster_mummy_idle', {
					position,
					volume: 0,
					sourceId: `crypt-mummy-${mummy.id}`,
					priority: 2
				});

				if (!handle) {
					continue;
				}

				cryptMummyLoops.set(mummy.id, handle);
			}

			const attenuation = Math.max(0, 1 - distance / 24);
			handle.setPosition(position, 180);
			handle.setRate(0.78 + attenuation * 0.16, 180);
			handle.setGain(0.1 + attenuation * 0.34, 180);
		}

		for (const [id, handle] of cryptMummyLoops) {
			if (keep.has(id)) {
				continue;
			}

			handle.setGain(0, 300);
			handle.stop(400);
			cryptMummyLoops.delete(id);
		}
	}

	function stopZoneLoop(fadeMs: number): void {
		if (!zoneHandle) return;
		const handle = zoneHandle;
		zoneHandle = null;
		handle.setGain(0, fadeMs);
		handle.stop(fadeMs + 100);
	}

	function updateAmbience(delta: number, slowTick: boolean): void {
		const zone = activeZone();

		if (zone !== lastZone) {
			lastZone = zone;
			stopZoneLoop(1500);
			zoneHandle = audio.loop(`ambience_${zone}` as SoundId, {
				volume: 0,
				sourceId: `zone-${zone}`,
				priority: 1
			});

			if (zoneHandle) {
				const handle = zoneHandle;
				setTimeout(() => handle.setGain(targetZoneGain(zone), 1500), 30);
			}

			ambientEventTimer = 4 + Math.random() * 8;
		}

		ambienceAccumulator += delta;

		if (!slowTick || ambienceAccumulator < SLOW_INTERVAL) {
			return;
		}

		ambienceAccumulator = 0;

		if (!zoneHandle) {
			// El PCM del loop puede tardar un par de frames en estar listo.
			zoneHandle = audio.loop(`ambience_${zone}` as SoundId, {
				volume: 0,
				sourceId: `zone-${zone}`,
				priority: 1
			});

			if (zoneHandle) {
				const handle = zoneHandle;
				setTimeout(() => handle.setGain(targetZoneGain(zone), 900), 30);
			}
		} else {
			zoneHandle.setGain(targetZoneGain(zone), 500);
		}

		// Eventos ambientales: 8–25 s, solo en la zona activa.
		const events = AMBIENCE_EVENTS[zone];

		if (events.length === 0) {
			return;
		}

		ambientEventTimer -= SLOW_INTERVAL;

		if (ambientEventTimer > 0) {
			return;
		}

		ambientEventTimer = 8 + Math.random() * 17;
		const event = events[Math.floor(Math.random() * events.length)] as AmbienceEvent;
		const id = `amb_${event}` as SoundId;
		const position = ambientEventPosition(
			playerState.x,
			playerState.y,
			playerState.z,
			Math.random,
			8,
			20
		);

		audio.play(id, { position, volume: 0.65, priority: 0, sourceId: `amb-${event}` });
	}

	function targetZoneGain(zone: AmbienceZone): number {
		let gain = 0.5;

		if (zone === 'waves') {
			const phase = minigame5.phase;
			gain *= phase === 'playing' ? 1.15 : 0.85;
		}

		return gain;
	}

	function stopAllSceneLoops(): void {
		for (const voice of monsterLoops.values()) {
			voice.handle.setGain(0, 250);
			voice.handle.stop(350);
		}

		monsterLoops.clear();

		for (const handle of remoteCarLoops.values()) {
			handle.setGain(0, 250);
			handle.stop(350);
		}

		remoteCarLoops.clear();
		remoteFootsteps.clear();
		stopCryptMummyLoops(250);
		cryptMummyStates.clear();
		stopZoneLoop(250);

		if (engineHandle) {
			engineHandle.setGain(0, 250);
			engineHandle.stop(350);
			engineHandle = null;
		}

		if (tireHandle) {
			tireHandle.setGain(0, 150);
			tireHandle.stop(250);
			tireHandle = null;
		}
	}

	useTask((delta) => {
		audio.sampleMusicSpectrum(delta);

		if (sceneState.active !== lastScene) {
			lastScene = sceneState.active;
			stopAllSceneLoops();
			lastZone = null;
			stepDistance = 0;
			hasLast = false;
		}

		updateListener(delta);
		updateFootsteps(delta);

		slowAccumulator += delta;
		const slowTick = slowAccumulator >= SLOW_INTERVAL;

		if (slowTick) {
			slowAccumulator = 0;
		}

		updateCarAudio(delta, slowTick);
		updateMonsters(slowTick);
		updateCryptMummies(slowTick);
		updateAmbience(delta, slowTick);
	});

	onDestroy(() => {
		stopAllSceneLoops();
	});
</script>
