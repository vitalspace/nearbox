<script lang="ts">
	import type {
		Collider as RapierCollider,
		RigidBody as RapierRigidBody
	} from '@dimforge/rapier3d-compat';
	import { QueryFilterFlags } from '@dimforge/rapier3d-compat';
	import { Collider, RigidBody, usePhysicsTask, useRapier } from '@threlte/rapier';
	import { onDestroy } from 'svelte';
	import { Vector3 } from 'three';
	import { worldState } from '../../state/worldState.svelte';
	import { sceneState, type SceneId } from '../../state/sceneState.svelte';
	import { worldMaps } from '../../world/registry.generated';
	import { cars } from '../../state/cars.svelte';
	import { balloon } from '../../state/balloon.svelte';
	import { carInput } from '../../state/carInput';
	import { clubMusic } from '../../state/clubMusic.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { minigame7 } from '../../state/minigame7.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleInput } from '../../state/royaleInput';
	import {
		ROYALE_GLIDE_FALL,
		ROYALE_GLIDE_SPEED,
		ROYALE_SKYDIVE_DEPLOY_MS,
		ROYALE_SKYDIVE_DEPLOY_Y,
		ROYALE_SKYDIVE_GRAVITY,
		ROYALE_SKYDIVE_MAX_FALL,
		ROYALE_SKYDIVE_SPEED,
		ROYALE_WATER_RESCUE_Y,
		royaleJumpPosition,
		type RoyaleMode
	} from '../../state/royaleConfig';
	import {
		PARKOUR_JUMP_SPEED,
		PARKOUR_KNOCKBACK_DAMPING,
		PARKOUR_MAX_PUSH_HORIZONTAL,
		PARKOUR_MAX_PUSH_VERTICAL,
		PARKOUR_RESPAWN_LIFT,
		parkourCheckpointAt
	} from '../../state/parkourConfig';
	import { race } from '../../state/race.svelte';
	import { ride } from '../../state/ride.svelte';
	import { playerInput } from '../../state/playerInput';
	import { playerIntent } from '../../state/playerIntent';
	import { playerPhysics } from '../../state/playerPhysics';
	import { reportPlayerGrounded } from '../../audio/telemetry';
	import {
		CRYPT_SPAWN,
		MAUSOLEUM_EXIT,
		PARKOUR_EXIT,
		PLAYER_SPAWN,
		WAVES_EXIT,
		playerRuntime,
		playerState,
		setPlayerSpawn
	} from '../../state/playerState';
	import {
		GOLEM_ROCK_KNOCKBACK_DAMPING,
		GOLEM_ROCK_KNOCKBACK_LIFT,
		GOLEM_ROCK_KNOCKBACK_SPEED
	} from '../../state/wavesConfig';

	// 2.1 m capsule (0.45 radius + 0.6 half height above and below).
	const CAPSULE_HALF_HEIGHT = 0.6;
	const CAPSULE_RADIUS = 0.45;
	// Distance from the body center to the feet.
	const BODY_CENTER_Y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

	const WALK_SPEED = 4;
	const RUN_SPEED = 8;
	const JUMP_SPEED = 6;
	const GRAVITY = 18;
	const MAX_FALL_SPEED = 30;
	const RESPAWN_Y = -20;

	/** Mueve `value` hacia `target` como máximo `maxDelta`. */
	function approach(value: number, target: number, maxDelta: number): number {
		const delta = target - value;

		if (Math.abs(delta) <= maxDelta) return target;

		return value + Math.sign(delta) * maxDelta;
	}

	let body = $state<RapierRigidBody>();
	let collider = $state<RapierCollider>();

	const { world } = useRapier();

	let controller: ReturnType<typeof world.createCharacterController> | undefined;
	let verticalVelocity = 0;
	/** Impulso horizontal del golpe de roca del Golem (se amortigua solo). */
	let knockbackX = 0;
	let knockbackZ = 0;
	let lastKnockbackSeq = 0;
	let lastParkourKnockbackSeq = 0;

	const desiredMovement = new Vector3();
	const computedMovement = new Vector3();

	/** Whether the active map's physics is ready. */
	const ready = $derived(worldState.isReady(sceneState.active));

	/** Entry spawn of each scene. */
	function spawnFor(scene: SceneId) {
		if (scene === 'crypt') return CRYPT_SPAWN;
		if (scene === 'map') return MAUSOLEUM_EXIT;
		const entry = (worldMaps as Record<string, { spawn?: typeof PLAYER_SPAWN }>)[scene];
		return entry?.spawn ?? PLAYER_SPAWN;
	}

	function respawn(): void {
		verticalVelocity = 0;
		knockbackX = 0;
		knockbackZ = 0;

		const spawn = playerRuntime.spawn;
		const position = {
			x: spawn.x,
			y: spawn.y + BODY_CENTER_Y,
			z: spawn.z
		};
		body?.setTranslation(position, true);
		body?.setNextKinematicTranslation(position);

		playerState.x = spawn.x;
		playerState.y = spawn.y;
		playerState.z = spawn.z;
		playerState.grounded = true;
	}

	/** Places the body (and the state) at an exact position. Useful in tests. */
	function teleport(x: number, feetY: number, z: number): void {
		verticalVelocity = 0;
		knockbackX = 0;
		knockbackZ = 0;

		const position = { x, y: feetY + BODY_CENTER_Y, z };
		body?.setTranslation(position, true);
		body?.setNextKinematicTranslation(position);

		playerState.x = x;
		playerState.y = feetY;
		playerState.z = z;
		playerState.grounded = true;
	}

	$effect(() => {
		if (!body) return;
		const spawn = playerRuntime.spawn;
		body.setTranslation({ x: spawn.x, y: spawn.y + BODY_CENTER_Y, z: spawn.z }, true);
	});

	// When the scene changes the player is moved to the entry point and the
	// respawn point is adjusted for the rest of the stay.
	let lastScene: SceneId | null = null;

	$effect(() => {
		const active = sceneState.active;

		if (!body || active === lastScene) return;

		const previous = lastScene;
		lastScene = active;

		// On the global boot the body is already at PLAYER_SPAWN. For a dev
		// map or when changing scene, its declared spawn is used.
		if (previous === null && active === 'map') return;

		// Reset the map that is being left, not the new one: when the GLB is
		// already cached the new component can mark itself ready during mount,
		// and resetting it afterwards would leave the car/player waiting forever.
		if (previous) {
			worldState.reset(previous);
		}

		// Returning from the Haunted Highway track lands the player back at the
		// outdoor spawn instead of the crypt exit. Leaving either Barn Siege or
		// the deathmatch returns to its own checkpoint on the global map.
		const leavingBarnsiege = previous === 'barnsiege' && active === 'map';
		const barnsiegeExit = minigame6.exitRequest ?? minigame5.exitRequest ?? WAVES_EXIT;
		const leavingParkour = previous === 'parkour' && active === 'map';
		const parkourExit = minigame7.exitRequest ?? PARKOUR_EXIT;
		const spawn =
			previous === 'roadmap' && active === 'map'
				? PLAYER_SPAWN
				: leavingBarnsiege
					? barnsiegeExit
					: leavingParkour
						? parkourExit
						: spawnFor(active);
		setPlayerSpawn(spawn);
		teleport(spawn.x, spawn.y, spawn.z);
	});

	// The server decides the spawn slot; the first waves snapshot teleports
	// the body there (and enables mg5-position reporting via `WaveSession`).
	let wavesEntrySynced = false;

	$effect(() => {
		if (!sceneState.inWaves) {
			wavesEntrySynced = false;
			return;
		}

		const self = minigame5.self;

		if (!body || wavesEntrySynced || !self) return;

		wavesEntrySynced = true;
		teleport(self.x, self.y, self.z);
		setPlayerSpawn({ x: self.x, y: self.y, z: self.z });
	});

	// Witch House Deathmatch: same authority rule. The first snapshot places
	// the body on the server-assigned team slot; later respawns are teleported
	// by the `player-respawned` event.
	let royaleEntrySynced = false;
	let royaleAerialStartedAt = 0;

	function setRoyaleMode(mode: RoyaleMode): void {
		royaleInput.mode = mode;
	}

	/** Asiento derivado del orden estable del snapshot (mismo que el servidor). */
	function royaleSeat(): number {
		const players = minigame8.snapshot?.players ?? [];
		const index = players.findIndex((player) => player.id === minigame8.selfId);
		return index >= 0 ? index % 12 : 0;
	}

	let deathmatchEntrySynced = false;

	$effect(() => {
		if (!sceneState.inDeathmatch) {
			deathmatchEntrySynced = false;
			return;
		}

		const self = minigame6.self;

		if (!body || deathmatchEntrySynced || !self) return;

		deathmatchEntrySynced = true;
		teleport(self.x, self.y, self.z);
		setPlayerSpawn({ x: self.x, y: self.y, z: self.z });
	});

	// Rebalanceo en `idle`/`countdown`: el servidor puede mover al jugador
	// local al otro equipo y a su zona de aparición. Seguimos ese cambio para
	// que el cuerpo no se quede en el spawn del equipo anterior.
	let deathmatchTeam: 'coven' | 'hunters' | null = null;

	$effect(() => {
		if (!sceneState.inDeathmatch) {
			deathmatchTeam = null;
			return;
		}

		const self = minigame6.self;

		if (!self) return;

		if (deathmatchTeam === null) {
			deathmatchTeam = self.team;
			return;
		}

		if (self.team === deathmatchTeam) return;

		deathmatchTeam = self.team;

		if (!body || !deathmatchEntrySynced) return;

		teleport(self.x, self.y, self.z);
		setPlayerSpawn({ x: self.x, y: self.y, z: self.z });
	});

	$effect(() => {
		const request = minigame6.respawnRequest;

		if (!request || !body) return;

		minigame6.consumeRespawn();
		teleport(request.x, request.y, request.z);
	});

	// Skyfall Royale: the first snapshot places the body on the server seat or
	// on the zeppelin, and enables `mg8-position` reporting.
	let royaleEntryWasSynced = false;
	/** `boardingStartedAt` de la partida en curso; sirve para detectar una nueva. */
	let royaleBoardingStartedAt = 0;
	/** Último `lastJumpAt` del store ya aplicado; 0 = sin salto en esta partida. */
	let royaleSeenJumpAt = 0;

	$effect(() => {
		if (!sceneState.inRoyale) {
			royaleEntrySynced = false;
			royaleEntryWasSynced = false;
			royaleBoardingStartedAt = 0;
			royaleSeenJumpAt = 0;
			royaleInput.reset();
			return;
		}

		const self = minigame8.self;

		if (!body || royaleEntrySynced || !self) return;

		royaleEntrySynced = true;
		royaleEntryWasSynced = true;
		setRoyaleMode(self.mode);
		royaleInput.vy = 0;
		teleport(self.x, self.y, self.z);
		setPlayerSpawn({ x: self.x, y: self.y, z: self.z });
	});

	// Efecto separado para no reiniciar el modo si `royaleInput.reset()` se
	// dispara al desmontar la partida.
	$effect(() => {
		if (!royaleEntryWasSynced) return;

		return () => {
			royaleEntryWasSynced = false;
		};
	});

	// Corrección anti-cheat: el servidor manda la última posición válida.
	$effect(() => {
		if (!sceneState.inRoyale) return;

		const correct = minigame8.consumeCorrect();

		if (!correct || !body) return;

		setRoyaleMode(correct.mode);
		royaleInput.vy = 0;
		teleport(correct.x, correct.y, correct.z);
	});

	// Salida de coche/globo: el servidor ya calculó el punto caminable (o el
	// planeo si se salta en vuelo). Sin esto el cuerpo reaparecía donde entró.
	$effect(() => {
		if (!sceneState.inRoyale) return;

		const request = minigame8.consumeVehicleExit();

		if (!request || !body) return;

		setRoyaleMode(request.mode);
		royaleInput.vy = 0;
		playerState.grounded = request.mode === 'ground';
		teleport(request.x, request.y, request.z);
	});

	// El servidor ya nos devolvió a `global`: volver al checkpoint del pueblo.
	$effect(() => {
		const request = minigame8.exitRequest;

		if (!request || !body) return;

		teleport(request.x, request.y, request.z);
		setPlayerSpawn(request);
		royaleInput.reset();
		minigame8.exitRequest = null;
	});

	// Parkour: the first snapshot places the body on the server-assigned
	// start slot; the checkpoint changes the emergency respawn point.
	let parkourEntrySynced = false;

	$effect(() => {
		if (!sceneState.inParkour) {
			parkourEntrySynced = false;
			return;
		}

		const self = minigame7.self;

		if (!body || parkourEntrySynced || !self) return;

		parkourEntrySynced = true;
		teleport(self.x, self.y, self.z);
		playerState.facingYaw = self.yaw;
		setPlayerSpawn({ x: self.x, y: self.y, z: self.z });
	});

	$effect(() => {
		if (!sceneState.inParkour) return;

		const point = parkourCheckpointAt(minigame7.checkpoint);

		if (!point) return;

		// START keeps its own surface (0.15); CP1–CP12 respawn slightly above
		// the plaza, same as the authoritative respawn.
		const lift = minigame7.checkpoint === 0 ? 0 : PARKOUR_RESPAWN_LIFT;
		setPlayerSpawn({ x: point.x, y: point.y + lift, z: point.z });
	});

	$effect(() => {
		const request = minigame7.respawnRequest;

		if (!request || !body) return;

		minigame7.consumeRespawn();
		teleport(request.x, request.y, request.z);
		setPlayerSpawn(request);
	});

	// Parkour wardens only shove: the server sends the velocity, this client
	// applies it and reports the resulting movement as normal.
	$effect(() => {
		const hit = minigame7.knockback;

		if (!hit || hit.seq === lastParkourKnockbackSeq) return;

		lastParkourKnockbackSeq = hit.seq;

		// Serial shoves (Golem rock, fire pulses, ghost swipe) add up but the
		// accumulated impulse never exceeds the limit of the spec.
		const nextX = knockbackX + hit.dx;
		const nextZ = knockbackZ + hit.dz;
		const horizontal = Math.hypot(nextX, nextZ);
		const scale =
			horizontal > PARKOUR_MAX_PUSH_HORIZONTAL ? PARKOUR_MAX_PUSH_HORIZONTAL / horizontal : 1;

		knockbackX = nextX * scale;
		knockbackZ = nextZ * scale;
		verticalVelocity = Math.min(PARKOUR_MAX_PUSH_VERTICAL, Math.max(verticalVelocity, 0) + hit.dy);
		playerState.grounded = false;
	});

	// Roca de lava del Golem: el servidor decide el golpe y este cliente
	// aplica el impulso real al controlador. El vuelo es local; la posición
	// resultante se reporta a 10 Hz como cualquier otro movimiento.
	$effect(() => {
		const hit = minigame5.knockback;

		if (!hit || hit.seq === lastKnockbackSeq) return;

		lastKnockbackSeq = hit.seq;

		const length = Math.hypot(hit.dx, hit.dz) || 1;
		knockbackX = (hit.dx / length) * GOLEM_ROCK_KNOCKBACK_SPEED;
		knockbackZ = (hit.dz / length) * GOLEM_ROCK_KNOCKBACK_SPEED;
		verticalVelocity = Math.max(verticalVelocity, GOLEM_ROCK_KNOCKBACK_LIFT);
		playerState.grounded = false;
	});

	// The server decides whether the entry is the nave center (first player)
	// or the stair landing (round already started). The first snapshot sets
	// that position and enables `mg2-position` reporting.
	let cryptEntrySynced = false;

	$effect(() => {
		if (!sceneState.inCrypt) {
			cryptEntrySynced = false;
			minigame2.positionReady = false;
			return;
		}

		const self = minigame2.self;

		if (!body || cryptEntrySynced || !self) return;

		cryptEntrySynced = true;
		teleport(self.x, self.y, self.z);
		minigame2.positionReady = true;
	});

	$effect(() => {
		if (collider) {
			playerPhysics.collider = collider;
		}

		return () => {
			if (playerPhysics.collider === collider) {
				playerPhysics.collider = null;
			}
		};
	});

	$effect(() => {
		// Without a snapshot movement is not allowed yet: this prevents walking
		// through the crypt before the room's authoritative state arrives. While
		// driving, the player's physics is frozen as well.
		playerRuntime.frozen =
			clubMusic.panelOpen ||
			cars.isDriving ||
			balloon.isOccupant ||
			race.inCar ||
			sceneState.inRoadmap ||
			(sceneState.inWaves &&
				(minigame5.snapshot === null || minigame5.blocksMovement || minigame5.isDriving)) ||
			(sceneState.inDeathmatch && (minigame6.snapshot === null || minigame6.blocksMovement)) ||
			(sceneState.inParkour && (minigame7.snapshot === null || minigame7.blocksMovement)) ||
			(sceneState.inRoyale &&
				(minigame8.snapshot === null || minigame8.blocksMovement || minigame8.isDriving)) ||
			(sceneState.inCrypt && (minigame2.snapshot === null || minigame2.blocksMovement));

		return () => {
			playerRuntime.frozen = false;
		};
	});

	$effect(() => {
		playerRuntime.drivingCarId = cars.selfDrivingId;
		playerRuntime.racing = race.inCar;
		playerRuntime.inWaves = sceneState.inWaves;
		playerRuntime.inDeathmatch = sceneState.inDeathmatch;
		playerRuntime.inParkour = sceneState.inParkour;
		playerRuntime.inRoyale = sceneState.inRoyale;

		return () => {
			playerRuntime.drivingCarId = null;
			playerRuntime.racing = false;
			playerRuntime.inWaves = false;
			playerRuntime.inDeathmatch = false;
			playerRuntime.inParkour = false;
			playerRuntime.inRoyale = false;
		};
	});

	// Las monturas NFT solo se conducen en el hub. Al entrar a un minijuego,
	// carrera o coche se vuelve a pie para no mezclar controladores. Si el
	// jugador cambia o pierde el NFT equipado, también se baja.
	$effect(() => {
		if (ride.isRiding && (!sceneState.inHub || ride.activeId !== ride.equippedId)) {
			ride.dismount();
		}
	});

	// Eject or exit: the store computes a safe point beside the car and
	// the player body is moved there before control is handed back.
	$effect(() => {
		const request = cars.ejectRequest;

		if (!request || !body) return;

		teleport(request.x, request.y, request.z);
		cars.consumeEject();
	});

	// Landing the balloon: same contract as the cars.
	$effect(() => {
		const request = balloon.ejectRequest;

		if (!request || !body) return;

		teleport(request.x, request.y, request.z);
		balloon.consumeEject();
	});

	// Entering the Grand Prix: place the hidden body on the grid so the camera
	// has a sane target until the first authoritative snapshot arrives.
	$effect(() => {
		const request = race.entryRequest;

		if (!request || !body) return;

		teleport(request.x, request.y, request.z);
		race.consumeEntry();
	});

	// Leaving the Grand Prix: the server moved the player to `global`; put the
	// avatar beside the gantry and keep that as the new respawn point.
	$effect(() => {
		const request = minigame5.exitRequest;

		if (!request || !body) return;

		teleport(request.x, request.y, request.z);
		setPlayerSpawn(request);
		minigame5.exitRequest = null;
	});

	$effect(() => {
		const request = minigame6.exitRequest;

		if (!request || !body) return;

		teleport(request.x, request.y, request.z);
		setPlayerSpawn(request);
		minigame6.exitRequest = null;
	});

	$effect(() => {
		const request = minigame7.exitRequest;

		if (!request || !body) return;

		teleport(request.x, request.y, request.z);
		setPlayerSpawn(request);
		minigame7.exitRequest = null;
	});

	$effect(() => {
		const request = race.exitRequest;

		if (!request || !body) return;

		teleport(request.x, request.y, request.z);
		setPlayerSpawn(request);
		race.consumeExit();
	});

	$effect(() => {
		if (!ready || !body || !collider || controller) return;

		const created = world.createCharacterController(0.02);
		created.setUp({ x: 0, y: 1, z: 0 });
		created.enableAutostep(0.5, 0.3, false);
		created.enableSnapToGround(0.5);
		created.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
		created.setMinSlopeSlideAngle((30 * Math.PI) / 180);
		created.setApplyImpulsesToDynamicBodies(true);

		controller = created;
		respawn();
	});

	onDestroy(() => {
		if (controller) {
			world.removeCharacterController(controller);
			controller = undefined;
		}
	});

	// Al salir o ser expulsado del coche de la arena, el servidor deja al
	// jugador 2 m al lado del vehículo. Sin esto el cuerpo local se queda
	// dentro del chasis y las físicas lo empujan o lo atrapan.
	let wasDrivingWaves = false;

	$effect(() => {
		const driving = minigame5.isDriving;
		const car = minigame5.snapshot?.car;

		if (wasDrivingWaves && !driving && sceneState.inWaves && body && car) {
			teleport(car.x + 2.0, car.y - 1.0, car.z);
		}

		wasDrivingWaves = driving;
	});

	/**
	 * Movimiento autoritativo-ligero de Skyfall Royale.
	 *
	 * El zepelín y el salto inicial los decide el servidor; a partir del
	 * `player-jumped` la caída/planeo se simulan en el cliente y se reportan a
	 * 10 Hz. Devuelve `true` cuando ya manejó el frame.
	 */
	function stepRoyale(dt: number): boolean {
		const snapshot = minigame8.snapshot;
		const self = minigame8.self;

		if (!snapshot || !self || snapshot.phase !== 'playing' || !self.alive) {
			return false;
		}

		// Conduciendo: la pose la manda el vehículo local (`VehiclePhysics` o
		// `RoyaleBalloon`) y el cuerpo de a pie queda desactivado. Antes esta
		// rama copiaba la pose replicada (200 ms de retardo) y movía la cápsula
		// dentro del chasis: el coche recibía un empuje constante y la cámara
		// iba por detrás del vehículo.
		if (minigame8.isDriving) {
			royaleInput.mode = 'ground';
			royaleInput.vy = 0;
			// `Space` sigue llegando desde `PlayerBehaviour`: se descarta para
			// que no quede un salto encolado y se ejecute al bajar del coche.
			playerInput.consumeJump();
			return true;
		}

		// Partida nueva (o reconexión en otra): el salto anterior no cuenta.
		// Sin esto, el segundo viaje en el mismo cliente entraba en `skydive`
		// en el primer frame y el servidor seguía viendo al jugador montado.
		const boardingStartedAt = snapshot.boardingStartedAt ?? 0;

		if (boardingStartedAt !== royaleBoardingStartedAt) {
			royaleBoardingStartedAt = boardingStartedAt;
			royaleSeenJumpAt = 0;
		}

		// Salto confirmado por el servidor: empezar la caída en la posición
		// autoritativa del asiento en ese instante. `lastJumpAt = 0` significa
		// "sin salto": un valor heredado de otra partida nunca debe expulsar.
		if (minigame8.lastJumpAt !== royaleSeenJumpAt) {
			royaleSeenJumpAt = minigame8.lastJumpAt;

			if (minigame8.lastJumpAt > 0 && royaleInput.mode === 'riding' && boardingStartedAt > 0) {
				const point = royaleJumpPosition(boardingStartedAt, minigame8.serverNow(), royaleSeat());
				teleport(point.x, point.y, point.z);
				playerState.grounded = false;
				royaleAerialStartedAt = minigame8.serverNow();
				royaleInput.vy = 0;
				setRoyaleMode('skydive');
			}
		}

		// Reenganche tras reconectar: si el servidor ya nos ve en el aire,
		// copiar su posición una sola vez.
		if (royaleInput.mode === 'riding' && (self.mode === 'skydive' || self.mode === 'glide')) {
			teleport(self.x, self.y, self.z);
			playerState.grounded = false;
			royaleAerialStartedAt = minigame8.serverNow();
			royaleInput.vy = 0;
			setRoyaleMode(self.mode);
		}

		// Pasajero del zepelín: la posición la manda el path del servidor.
		if (royaleInput.mode === 'riding' && self.mode === 'riding') {
			if (!snapshot.boardingStartedAt) return false;

			const point = royaleJumpPosition(
				snapshot.boardingStartedAt,
				minigame8.serverNow(),
				royaleSeat()
			);
			const target = { x: point.x, y: point.y + BODY_CENTER_Y, z: point.z };

			body?.setNextKinematicTranslation(target);
			playerState.x = point.x;
			playerState.y = point.y;
			playerState.z = point.z;
			playerState.grounded = false;
			royaleInput.vy = 0;

			if (playerInput.consumeJump() && minigame8.canJump) {
				minigame8.sendJump();
			}

			return true;
		}

		if (royaleInput.mode === 'ground') {
			return false;
		}

		// Caída libre / planeo.
		const wantsJump = playerInput.consumeJump();
		const wantsDeploy = royaleInput.consumeDeploy();

		if (
			royaleInput.mode === 'skydive' &&
			(wantsJump ||
				wantsDeploy ||
				minigame8.serverNow() - royaleAerialStartedAt >= ROYALE_SKYDIVE_DEPLOY_MS ||
				playerState.y <= ROYALE_SKYDIVE_DEPLOY_Y)
		) {
			setRoyaleMode('glide');
		}

		const stickActive = playerInput.isStickActive;
		const dx = stickActive ? playerInput.moveX : playerIntent.x;
		const dz = stickActive ? playerInput.moveZ : playerIntent.z;
		const length = Math.hypot(dx, dz);
		const speed = royaleInput.mode === 'skydive' ? ROYALE_SKYDIVE_SPEED : ROYALE_GLIDE_SPEED;

		let horizontalX = 0;
		let horizontalZ = 0;

		if (length > 0.001) {
			const sin = Math.sin(playerState.cameraYaw);
			const cos = Math.cos(playerState.cameraYaw);
			horizontalX = ((dx * cos + dz * sin) / length) * speed;
			horizontalZ = ((-dx * sin + dz * cos) / length) * speed;
		}

		const vertical =
			royaleInput.mode === 'skydive'
				? Math.max(royaleInput.vy - ROYALE_SKYDIVE_GRAVITY * dt, -ROYALE_SKYDIVE_MAX_FALL)
				: -ROYALE_GLIDE_FALL;

		royaleInput.vy = vertical;

		desiredMovement.set(horizontalX * dt, vertical * dt, horizontalZ * dt);
		controller?.computeColliderMovement(
			collider!,
			desiredMovement,
			QueryFilterFlags.EXCLUDE_SENSORS
		);
		controller?.computedMovement(computedMovement);

		const translation = body?.translation() ?? {
			x: playerState.x,
			y: playerState.y + BODY_CENTER_Y,
			z: playerState.z
		};
		const nextX = translation.x + computedMovement.x;
		const nextY = translation.y + computedMovement.y;
		const nextZ = translation.z + computedMovement.z;
		const landed = controller?.computedGrounded() ?? false;

		body?.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ });

		playerState.x = nextX;
		playerState.y = nextY - BODY_CENTER_Y;
		playerState.z = nextZ;

		if (landed && vertical <= 0) {
			playerState.grounded = true;
			royaleInput.vy = 0;
			setRoyaleMode('ground');
		} else {
			playerState.grounded = false;
		}

		// El agua no mata: el servidor devuelve al jugador a la orilla. Se frena
		// la caída justo bajo el nivel de rescate para no hundir la cámara
		// mientras llega la corrección (antes se esperaba hasta `KILL_Y`).
		if (playerState.y < ROYALE_WATER_RESCUE_Y - 1) {
			playerState.y = ROYALE_WATER_RESCUE_Y - 1;
		}

		return true;
	}

	/**
	 * Conducción de monturas NFT. Reutiliza el character controller del
	 * jugador: el avatar (y su cápsula) siguen siendo el cuerpo que colisiona,
	 * pero la velocidad y el rumbo los manda el vehículo en vez de WASD a pie.
	 */
	function stepRide(dt: number): void {
		const tuning = ride.tuning;

		if (!tuning || !body || !collider || !controller || !ready) return;

		const translation = body.translation();
		let speed = ride.speed;

		// Acelerador / marcha atrás. Al soltar, la velocidad cae por arrastre.
		if (Math.abs(carInput.throttle) > 0.001) {
			const target =
				carInput.throttle > 0
					? tuning.maxSpeed * carInput.throttle
					: tuning.reverseSpeed * carInput.throttle;
			const rate = carInput.throttle > 0 ? tuning.acceleration : tuning.braking;

			speed = approach(speed, target, rate * dt);
		} else {
			speed = approach(speed, 0, tuning.drag * dt);
		}

		if (carInput.brake) {
			speed = approach(speed, 0, tuning.braking * dt);
		}

		if (carInput.handbrake) {
			speed = approach(speed, 0, tuning.braking * 1.6 * dt);
		}

		// Solo se gira con algo de velocidad, y en el sentido de la marcha:
		// al retroceder, A/D invierten la respuesta para que el vehículo no
		// parezca girar sobre sí mismo.
		const speedFactor = Math.min(1, Math.abs(speed) / 2.5);
		const reverse = speed < -0.05 ? -1 : 1;

		ride.yaw += carInput.steering * tuning.turnRate * speedFactor * reverse * dt;

		if (playerState.grounded && verticalVelocity < 0) {
			verticalVelocity = 0;
		}

		verticalVelocity = Math.max(verticalVelocity - GRAVITY * dt, -MAX_FALL_SPEED);

		const forwardX = Math.sin(ride.yaw);
		const forwardZ = Math.cos(ride.yaw);

		desiredMovement.set(forwardX * speed * dt, verticalVelocity * dt, forwardZ * speed * dt);
		controller.computeColliderMovement(collider, desiredMovement, QueryFilterFlags.EXCLUDE_SENSORS);
		controller.computedMovement(computedMovement);

		const nextX = translation.x + computedMovement.x;
		const nextY = translation.y + computedMovement.y;
		const nextZ = translation.z + computedMovement.z;

		if (nextY < RESPAWN_Y) {
			ride.dismount();
			respawn();
			return;
		}

		body.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ });

		const grounded = controller.computedGrounded();

		if (grounded && verticalVelocity <= 0) {
			playerState.grounded = true;
			verticalVelocity = 0;
		} else if (!grounded) {
			playerState.grounded = false;
		}

		playerState.x = nextX;
		playerState.y = nextY - BODY_CENTER_Y + tuning.footLift;
		playerState.z = nextZ;
		playerState.facingYaw = ride.yaw;
		ride.speed = speed;

		// El salto a pie no debe quedar pendiente al bajarse.
		playerInput.consumeJump();

		reportPlayerGrounded(playerState.grounded, dt, verticalVelocity);
	}

	function stepPlayer(delta: number): void {
		if (!body || !collider || !controller || !ready) return;

		const dt = Math.min(delta, 0.05);
		const knockbackActive = Math.hypot(knockbackX, knockbackZ) > 0.05;

		// Montura NFT: controles de vehículo, sin salto ni locomoción a pie.
		if (ride.isRiding) {
			stepRide(dt);
			return;
		}

		// Skyfall Royale: zepelín, caída libre y planeo tienen su propia
		// simulación; el suelo vuelve al controlador normal.
		if (sceneState.inRoyale && stepRoyale(dt)) {
			return;
		}

		// Frozen: no displacement, jump or gravity is applied. The body
		// stays where it is (countdown, death or result). A rock hit is the
		// exception: the caído/aturdido body still flies until it lands.
		if (playerRuntime.frozen && !knockbackActive) {
			playerInput.consumeJump();
			body.setNextKinematicTranslation(body.translation());
			return;
		}

		const translation = body.translation();

		const wantsJump = playerInput.consumeJump() && !playerRuntime.frozen;
		if (wantsJump && playerState.grounded) {
			verticalVelocity = sceneState.inParkour ? PARKOUR_JUMP_SPEED : JUMP_SPEED;
			playerState.grounded = false;
		}

		if (playerState.grounded && verticalVelocity < 0) {
			verticalVelocity = 0;
		}

		verticalVelocity = Math.max(verticalVelocity - GRAVITY * dt, -MAX_FALL_SPEED);

		const stickActive = playerInput.isStickActive;
		const dx = stickActive ? playerInput.moveX : playerIntent.x;
		const dz = stickActive ? playerInput.moveZ : playerIntent.z;
		const length = Math.hypot(dx, dz);

		let horizontalX = 0;
		let horizontalZ = 0;

		if (length > 0.001) {
			const speed = (playerIntent.run ? RUN_SPEED : WALK_SPEED) * Math.min(1, length);
			const sin = Math.sin(playerState.cameraYaw);
			const cos = Math.cos(playerState.cameraYaw);
			horizontalX = ((dx * cos + dz * sin) / length) * speed;
			horizontalZ = ((-dx * sin + dz * cos) / length) * speed;
		}

		// El empuje de la roca se suma al movimiento y se amortigua con el
		// tiempo: sale despedido y aterriza sin control durante ~0.7 s.
		horizontalX += knockbackX;
		horizontalZ += knockbackZ;

		desiredMovement.set(horizontalX * dt, verticalVelocity * dt, horizontalZ * dt);
		// Checkpoints are sensors: the character must be able to pass through them.
		controller.computeColliderMovement(collider, desiredMovement, QueryFilterFlags.EXCLUDE_SENSORS);
		controller.computedMovement(computedMovement);

		const nextX = translation.x + computedMovement.x;
		const nextY = translation.y + computedMovement.y;
		const nextZ = translation.z + computedMovement.z;

		if (knockbackActive) {
			const damping = sceneState.inParkour
				? PARKOUR_KNOCKBACK_DAMPING
				: GOLEM_ROCK_KNOCKBACK_DAMPING;
			const decay = Math.exp(-damping * dt);
			knockbackX *= decay;
			knockbackZ *= decay;

			if (Math.hypot(knockbackX, knockbackZ) < 0.05) {
				knockbackX = 0;
				knockbackZ = 0;
			}
		}

		if (nextY < RESPAWN_Y) {
			respawn();
			return;
		}

		body.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ });

		const grounded = controller.computedGrounded();
		if (grounded && verticalVelocity <= 0) {
			playerState.grounded = true;
			verticalVelocity = 0;
		} else if (!grounded) {
			playerState.grounded = false;
		}

		playerState.x = nextX;
		playerState.y = nextY - BODY_CENTER_Y;
		playerState.z = nextZ;

		// Solo alimenta el audio; no altera el movimiento ni la física.
		reportPlayerGrounded(playerState.grounded, dt, verticalVelocity);
	}

	if (
		typeof window !== 'undefined' &&
		(import.meta.env.DEV || new URLSearchParams(window.location.search).has('physics'))
	) {
		// Debug helpers: they advance the simulation without relying on the
		// render (useful in automated tests with software rendering).
		const debugWorld = {
			player: playerState,
			maps: worldState,
			intent: playerIntent,
			input: playerInput,
			world,
			get body() {
				return body;
			},
			get collider() {
				return collider;
			},
			teleport,
			step(steps = 1, dt = 1 / 60) {
				for (let index = 0; index < steps; index += 1) {
					stepPlayer(dt);
					world.step();
				}
			}
		};

		(window as unknown as { __world?: typeof debugWorld }).__world = debugWorld;
	}

	usePhysicsTask((delta) => {
		stepPlayer(delta);
	});
</script>

<RigidBody
	type="kinematicPosition"
	lockRotations
	enabled={!cars.isDriving &&
		!balloon.isOccupant &&
		!race.inCar &&
		!sceneState.inRoadmap &&
		!minigame5.isDriving &&
		!minigame8.isDriving}
	bind:rigidBody={body}
>
	<Collider
		shape="capsule"
		args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]}
		friction={0}
		restitution={0}
		bind:collider
	/>
</RigidBody>
