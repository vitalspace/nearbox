<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import {
		Group,
		Quaternion,
		Vector3,
		type AnimationAction,
		type AnimationMixer,
		type Event,
		type Object3D
	} from 'three';
	import { chat } from '../../state/chat.svelte';
	import { clubMusic } from '../../state/clubMusic.svelte';
	import { equipment } from '../../state/equipment.svelte';
	import { cars } from '../../state/cars.svelte';
	import { balloon, cannonForSeat } from '../../state/balloon.svelte';
	import { cannonSeatDeckPosition, cannonSeatFacing } from '../../state/balloonCannons';
	import { hubKiosks } from '../../state/hubKiosks.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { paperRolls } from '../../state/paperRolls.svelte';
	import {
		isLoopingAnimation,
		playRigClip,
		playerAnimations
	} from '../../state/playerAnimations.svelte';
	import { animationPalette } from '../../state/animationPalette.svelte';
	import { playerInput } from '../../state/playerInput';
	import { playerIntent, resetPlayerIntent } from '../../state/playerIntent';
	import { playerState } from '../../state/playerState';
	import { race } from '../../state/race.svelte';
	import { ride } from '../../state/ride.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { minigame7 } from '../../state/minigame7.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleInput } from '../../state/royaleInput';
	import { npcs } from '../../state/npcs.svelte';
	import { dmInput } from '../../state/dmInput';
	import { sceneState } from '../../state/sceneState.svelte';
	import { waveInput } from '../../state/waveInput';
	import type { HeroAnimation } from '../../services/protocol';
	import {
		buildHeldWeapon,
		playLocalHeldWeaponFire,
		trackLocalHeldWeapon,
		updateHeldWeaponAnimation
	} from './heldWeapon';

	interface Props {
		ref: Group;
		actions: Partial<Record<HeroAnimation, AnimationAction>> | undefined;
		mixer: AnimationMixer | undefined;
	}

	let { ref, actions, mixer }: Props = $props();

	const { canvas } = useThrelte();

	// One-shot rig actions (`Hero.glb`) and their key. The remaining clips
	// (idle/walk/run/jump/sit) are chosen by the movement logic.
	const KEY_ACTIONS: Record<string, HeroAnimation> = {
		KeyF: 'HR_attack',
		KeyG: 'HR_shoot',
		KeyT: 'HR_wave',
		KeyE: 'HR_pickup',
		KeyV: 'HR_hit',
		KeyB: 'HR_death'
	};

	const POSITION_INTERVAL_MS = 100;

	let current = '';
	let oneShot: HeroAnimation | null = null;
	let sitting = false;
	/** Preview local del panel de animaciones; vuelve solo a locomoción. */
	let preview: { name: HeroAnimation; remainingMs: number } | null = null;
	/** Detecta el borde muerto → vivo para no repetir `HR_death`. */
	let wasDeathmatchDead = false;
	let wasRoyaleDead = false;
	let facing = 0;
	let lastPositionAt = 0;
	let lastSeenHurtAt = 0;
	let lastSeenHealAt = 0;
	let lastSeenGrenadeAt = 0;
	let previousActions: Props['actions'];

	const pressed = new Set<string>();

	const isEditableTarget = (target: EventTarget | null): boolean => {
		if (!(target instanceof HTMLElement)) return false;

		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable ||
			target.closest('[contenteditable="true"]') !== null
		);
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (
			isEditableTarget(e.target) ||
			clubMusic.panelOpen ||
			hubKiosks.panelOpen ||
			cars.isDriving ||
			balloon.isOccupant ||
			ride.isRiding ||
			race.inCar ||
			minigame5.isDriving
		)
			return;
		if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
		pressed.add(e.code);

		if (e.repeat) return;

		if (e.code === 'Space') {
			playerInput.requestJump();
		}

		if (e.code === 'KeyC') {
			sitting = !sitting;
			oneShot = null;
			endPreview();
			animationPalette.setSitting(sitting);
		}

		const actionKey = KEY_ACTIONS[e.code];

		// An NPC prompt, dialogue or the club jukebox owns the E key: do not
		// fire `HR_pickup` (or any other action) while one of them is active.
		if (
			npcs.dialogOpen ||
			(e.code === 'KeyE' && (npcs.canInteract || clubMusic.nearby || hubKiosks.nearbyId !== null))
		) {
			return;
		}

		if (
			actionKey &&
			actions?.[actionKey] &&
			!sceneState.inWaves &&
			!sceneState.inDeathmatch &&
			!sceneState.inParkour &&
			!sceneState.inRoyale
		) {
			oneShot = actionKey;
		}
	};
	const onKeyUp = (e: KeyboardEvent) => {
		// Siempre se libera la tecla, incluso si se soltó mientras se conducía.
		// Si no, una tecla pulsada antes de montar quedaría "pegada" y el
		// avatar seguiría andando al desmontar.
		pressed.delete(e.code);
	};
	const onBlur = () => {
		pressed.clear();
		playerInput.reset();
		resetPlayerIntent();
		oneShot = null;
		// The frame loop may be paused while the window is unfocused, so
		// restore the remote avatar explicitly instead of waiting for the
		// next locomotion frame.
		endPreview(true);
	};

	$effect(() => {
		if (chat.isOpen) {
			pressed.clear();
			playerInput.reset();
			resetPlayerIntent();
			oneShot = null;
			endPreview(true);
		}
	});

	// The jukebox panel is a modal: release every key so the avatar does not
	// keep walking while the player types a SoundCloud link.
	$effect(() => {
		if (clubMusic.panelOpen) {
			pressed.clear();
			playerInput.reset();
			resetPlayerIntent();
			oneShot = null;
			endPreview(true);
		}
	});

	// The shop and tourism panels are modal too: release every key so the
	// avatar does not keep walking while the player browses.
	$effect(() => {
		if (hubKiosks.panelOpen) {
			pressed.clear();
			playerInput.reset();
			resetPlayerIntent();
			oneShot = null;
			endPreview(true);
		}
	});

	// Broadcast equipped NFT accessories so remote avatars can see them.
	$effect(() => {
		const crown = equipment.asset === 'crown';
		const vehicle = equipment.vehicle ?? null;
		const weaponVariant =
			equipment.weapon ?? (equipment.asset === 'coin-pistol' ? 'coin-pistol' : null);

		void lobby.sendNftEquip(crown, vehicle, weaponVariant);
	});

	$effect(() => {
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', onBlur);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onBlur);
			playerInput.reset();
			resetPlayerIntent();
		};
	});

	// Left click throws the roll. It must be a short tap without dragging so
	// it does not fire while the camera is being rotated.
	$effect(() => {
		let pressed = false;
		let downX = 0;
		let downY = 0;
		let downAt = 0;

		const onPointerDown = (event: PointerEvent) => {
			if (
				clubMusic.panelOpen ||
				hubKiosks.panelOpen ||
				cars.isDriving ||
				ride.isRiding ||
				race.inCar ||
				sceneState.inWaves ||
				sceneState.inDeathmatch ||
				sceneState.inParkour ||
				sceneState.inRoyale
			)
				return;
			if (event.pointerType !== 'mouse' || event.button !== 0) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;

			pressed = true;
			downX = event.clientX;
			downY = event.clientY;
			downAt = performance.now();
		};

		const onPointerUp = (event: PointerEvent) => {
			if (!pressed || event.button !== 0) return;

			pressed = false;

			if (performance.now() - downAt > 350) return;
			if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;

			// A bordo del globo el clic dispara el cañón del asiento; a pie
			// sigue lanzando el rollo desde la mano.
			if (balloon.isOccupant) {
				balloon.fireCannon();
				return;
			}

			// Con el coin-pistol equipado, el arma dispara su animación `Fire`
			// y el rollo de papel sale como "bala".
			if (equipment.asset === 'coin-pistol') {
				playLocalHeldWeaponFire();
			}

			paperRolls.throwRoll();
		};

		const onPointerCancel = () => {
			pressed = false;
		};

		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerCancel);

		return () => {
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', onPointerCancel);
		};
	});

	/** Plays a clip with a crossfade and broadcasts it over the WebSocket. */
	const play = (name: HeroAnimation, loop?: boolean) => {
		if (!playRigClip(actions, current, name, loop)) return;

		current = name;
		playerAnimations.broadcast(name);
	};

	/** Cancels the local animation preview and clears the panel highlight. */
	const endPreview = (restoreRemote = false) => {
		const wasPreviewing = preview !== null;

		preview = null;
		animationPalette.endPreview();

		// Some cancellations happen outside the animation frame loop (blur,
		// chat, entering a car). There is no locomotion `play()` afterwards in
		// those paths, so the remote avatar would stay stuck on the preview
		// clip. Fall back to idle; the next locomotion frame will correct it.
		if (wasPreviewing && restoreRemote) {
			playerAnimations.broadcast('HR_idle');
		}
	};

	/**
	 * Reproduces a panel preview and tells the other players once, so they see
	 * the gesture too. The preview timer keeps running locally and the normal
	 * locomotion clip is broadcast again when it ends.
	 *
	 * This runs every frame while the preview is active, so it must not reset
	 * an action that is already the current one: doing that froze every clip on
	 * its first frame. A repeated click forces a replay by clearing `current`
	 * when the preview request is consumed.
	 */
	const playPreview = (name: HeroAnimation) => {
		if (!actions?.[name] || current === name) return;

		const looping = isLoopingAnimation(name);

		if (playRigClip(actions, current, name, looping)) {
			current = name;
		}
	};

	/**
	 * One-shot reactions driven by events (shoot, throw, hurt, heal).
	 *
	 * `play()` ignores a clip when it is already `current`, so a reaction that
	 * finished while the player kept firing stayed clamped on its last pose and
	 * `oneShot` never cleared again. Restart the action when a new event
	 * arrives and the previous run already ended.
	 */
	const triggerOneShot = (name: HeroAnimation) => {
		oneShot = name;

		const action = actions?.[name];

		if (current === name && action && !action.isRunning()) {
			action.reset().play();
		}

		// Sustained fire repeats the same clip: without re-broadcasting, remote
		// avatars never learn that the gesture restarted and freeze on its last
		// pose.
		playerAnimations.broadcast(name);
	};

	// When the rig changes (another skin) the current clip is discarded so the
	// new model starts in idle instead of inheriting a pose from the previous one.
	$effect(() => {
		const next = actions;

		if (next === previousActions) {
			return;
		}

		previousActions = next;
		current = '';
		oneShot = null;
		sitting = false;
		endPreview(true);
		animationPalette.setSitting(false);
	});

	// When a one-shot clip finishes it returns to the movement cycle. It is
	// compared by action identity so it also works with the `SF_*` names.
	$effect(() => {
		if (!mixer) return;

		const onFinished = (event: Event) => {
			const finished = (event as unknown as { action?: AnimationAction }).action;

			if (!finished || !oneShot) {
				return;
			}

			const expected = actions?.[oneShot];

			if (expected && expected === finished) {
				oneShot = null;
			}
		};

		mixer.addEventListener('finished', onFinished);
		return () => mixer.removeEventListener('finished', onFinished);
	});

	// Parkour starts frozen on the grid, all racers looking towards −Z. Adopt
	// the authoritative slot yaw until the player moves for the first time.
	$effect(() => {
		if (!sceneState.inParkour || minigame7.phase !== 'countdown') return;

		const self = minigame7.self;

		if (!self || facing === self.yaw) return;

		facing = self.yaw;
		ref.rotation.y = facing;
		playerState.facingYaw = facing;
	});

	// Physics lives in PlayerCollider. Here input is only translated into
	// intent, the model is oriented and the animation for the real state is chosen.
	useTask((delta) => {
		// Skyfall Royale: sentado en el zepelín no se camina ni se salta; el
		// cuerpo sigue la posición autoritativa del asiento.
		if (sceneState.inRoyale && minigame8.riding) {
			playerIntent.x = 0;
			playerIntent.z = 0;
			playerIntent.run = false;
			playerIntent.crouch = false;
			oneShot = null;
			endPreview(true);
			playerInput.consumePreview();

			facing = playerState.facingYaw;
			ref.position.set(playerState.x, playerState.y, playerState.z);
			ref.rotation.y = facing;
			play('HR_idle');

			return;
		}

		// Montura NFT: el vehículo manda. El avatar se coloca en la pose de
		// conducción (idle en el skateboard, sentado en la escoba) y la
		// posición la publica `PlayerCollider` cada frame.
		if (ride.isRiding) {
			playerIntent.x = 0;
			playerIntent.z = 0;
			playerIntent.run = false;
			playerIntent.crouch = false;
			oneShot = null;
			endPreview(true);
			playerInput.consumePreview();

			facing = playerState.facingYaw;
			ref.position.set(playerState.x, playerState.y, playerState.z);
			ref.rotation.y = facing;
			const animation = ride.tuning?.animation ?? 'HR_idle';
			play(actions?.[animation] ? animation : 'HR_idle');

			// El clip `HR_sit` incluye la transición de pie → sentado → de pie;
			// en bucle haría que el jinete se levantara una y otra vez. Se deja
			// clavado en el punto medio, que es la pose sentada estable.
			if (animation === 'HR_sit') {
				const sitAction = actions?.HR_sit;

				if (sitAction) {
					sitAction.time = sitAction.getClip().duration * 0.5;
					sitAction.paused = true;
				}
			}

			const now = Date.now();

			if (
				lobby.currentLobbyId === 'global' &&
				sceneState.inGlobal &&
				now - lastPositionAt >= POSITION_INTERVAL_MS
			) {
				lastPositionAt = now;
				lobby.sendPlayerPosition(playerState.x, playerState.y, playerState.z, facing);
			}

			return;
		}

		// While driving (hub car, race car or the arena car), the vehicle
		// rules: no movement, jump or animations are processed and
		// `player-position` is not reported. `playerState` is kept up to date
		// by the vehicle physics for the camera.
		if (cars.isDriving || balloon.isOccupant || race.inCar || minigame5.isDriving) {
			playerIntent.x = 0;
			playerIntent.z = 0;
			playerIntent.run = false;
			playerIntent.crouch = false;
			oneShot = null;
			endPreview(true);
			playerInput.consumePreview();

			const seat = balloon.isOccupant ? balloon.selfSeat : null;

			if (seat) {
				// El globo es abierto: el avatar se ve de pie sobre la cubierta
				// mientras el asiento sigue siendo el ancla de cámara/collider.
				const cannon = cannonForSeat(seat);
				const feet = cannonSeatDeckPosition(balloon.position, balloon.yaw, cannon);

				facing = cannonSeatFacing(balloon.yaw, cannon);
				ref.position.set(feet.x, feet.y, feet.z);
				ref.rotation.y = facing;
				playerState.facingYaw = facing;
				play('HR_idle');
			} else {
				ref.position.set(playerState.x, playerState.y, playerState.z);
			}

			return;
		}

		const inWaves = sceneState.inWaves;
		const inDeathmatch = sceneState.inDeathmatch;
		const inRoyale = sceneState.inRoyale;
		const royaleAerial =
			inRoyale && (royaleInput.mode === 'skydive' || royaleInput.mode === 'glide');
		// En el lobby, el coin-pistol se lleva en pose de apuntar para que el
		// arma quede a la altura de la mira y no colgando junto a la pierna.
		const holdsCoinPistol = sceneState.inHub && equipment.asset === 'coin-pistol';
		const inCombat = inWaves || inDeathmatch || (inRoyale && !royaleAerial) || holdsCoinPistol;
		const wavesFrozen = inWaves && minigame5.blocksMovement;
		const wavesDowned = inWaves && minigame5.isDowned;
		const deathmatchFrozen = inDeathmatch && minigame6.blocksMovement;
		const deathmatchDead = inDeathmatch && minigame6.snapshot !== null && !minigame6.isAlive;
		const royaleFrozen = inRoyale && minigame8.blocksMovement;
		const royaleDead = inRoyale && minigame8.snapshot !== null && !minigame8.isAlive;
		const parkourFrozen = sceneState.inParkour && minigame7.blocksMovement;
		const combatBlock = wavesFrozen || deathmatchFrozen || royaleFrozen || parkourFrozen ? 0 : 1;

		// El snapshot de respawn puede llegar uno o dos frames después del
		// evento que teletransporta al jugador. Si en ese hueco el clip de
		// muerte ya había terminado, el bloque de locomoción cambiaba a
		// `HR_aim` y el estado "muerto" volvía a disparar `HR_death`: por eso
		// se veía la animación de muerte otra vez justo al reaparecer.
		// Mantener el clip de muerte mientras `deathmatchDead` sea true y
		// limpiarlo en el borde a vivo evita tanto el replay como quedarse
		// clavado en la pose.
		if (deathmatchDead !== wasDeathmatchDead) {
			if (!deathmatchDead && oneShot === 'HR_death') {
				oneShot = null;
			}

			wasDeathmatchDead = deathmatchDead;
		}

		if (royaleDead !== wasRoyaleDead) {
			if (!royaleDead && oneShot === 'HR_death') {
				oneShot = null;
			}

			wasRoyaleDead = royaleDead;
		}

		const right = pressed.has('KeyD') || pressed.has('ArrowRight');
		const left = pressed.has('KeyA') || pressed.has('ArrowLeft');
		const down = pressed.has('KeyS') || pressed.has('ArrowDown');
		const up = pressed.has('KeyW') || pressed.has('ArrowUp');
		const running = pressed.has('ShiftLeft') || pressed.has('ShiftRight') || playerInput.run;
		const crouching = pressed.has('ControlLeft') || pressed.has('ControlRight');

		const keyboardDx = (right ? 1 : 0) - (left ? 1 : 0);
		const keyboardDz = (down ? 1 : 0) - (up ? 1 : 0);
		const dx = (playerInput.isStickActive ? playerInput.moveX : keyboardDx) * combatBlock;
		const dz = (playerInput.isStickActive ? playerInput.moveZ : keyboardDz) * combatBlock;
		const moving = Math.hypot(dx, dz) > 0.001;

		playerIntent.x = dx;
		playerIntent.z = dz;
		playerIntent.run = running;
		playerIntent.crouch = crouching;

		// First person: the body follows the mouse look exactly, so remote
		// players see the avatar turning with the view. The camera looks along
		// `(-sin θ, -cos θ)` and the model faces its local +Z, so the body yaw
		// is θ + π.
		//
		// Third person: the 3D model faces its local +Z and is rotated toward
		// the movement direction in camera space, with exponential smoothing;
		// A/D move and turn the player as before.
		if (sceneState.firstPerson) {
			facing = (playerState.cameraYaw + Math.PI) % (Math.PI * 2);
		} else if (moving) {
			const yaw = playerState.cameraYaw;
			const worldX = dx * Math.cos(yaw) + dz * Math.sin(yaw);
			const worldZ = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
			const target = Math.atan2(worldX, worldZ);
			const diff = Math.atan2(Math.sin(target - facing), Math.cos(target - facing));
			facing += diff * (1 - Math.exp(-12 * delta));
		}

		ref.rotation.y = facing;
		playerState.facingYaw = facing;
		ref.position.set(playerState.x, playerState.y, playerState.z);

		// Animation panel preview: play the requested clip locally, emit it once
		// so remote avatars see it, and return to locomotion when the timer
		// expires or the player starts moving.
		const previewRequest = playerInput.consumePreview();
		/** Clip to announce to the remotes once the preview is confirmed. */
		let previewStarted: HeroAnimation | null = null;

		if (previewRequest) {
			if (!actions?.[previewRequest.animation]) {
				// The skin changed between the click and this frame: the clip
				// no longer exists, so drop the request instead of announcing
				// a gesture that the local avatar cannot play.
				animationPalette.endPreview();
			} else {
				oneShot = null;
				sitting = false;
				animationPalette.setSitting(false);

				// Clicking the same clip again restarts it instead of ignoring
				// the request because it is already the current action.
				if (current === previewRequest.animation) {
					current = '';
				}

				preview = {
					name: previewRequest.animation,
					remainingMs: previewRequest.durationMs
				};
				previewStarted = previewRequest.animation;
				animationPalette.markPreview(previewRequest.animation);
			}
		}

		if (preview) {
			// Use the same clamped delta as the mixer: on a slow machine the
			// preview lasts longer in wall-clock time but the clip always plays
			// to the end instead of being cut at its first frame.
			preview.remainingMs -= delta * 1000;

			if (moving || !playerState.grounded || preview.remainingMs <= 0) {
				endPreview();
			}
		}

		// The model is also drawn in FP: the camera sits inside the head
		// (back faces are discarded) and looking down shows body,
		// arms and animations such as the pickup one.

		// In the outdoor map the own position travels at 10 Hz; in the crypt it
		// goes through `mg2-position`.
		const now = Date.now();
		if (
			lobby.currentLobbyId === 'global' &&
			sceneState.inGlobal &&
			now - lastPositionAt >= POSITION_INTERVAL_MS
		) {
			lastPositionAt = now;
			lobby.sendPlayerPosition(playerState.x, playerState.y, playerState.z, facing);
		}

		// Barn Siege: hit / heal / grenade reactions. Shooting does NOT play a
		// full-body one-shot: `HR_shoot` is an unarmed swing that looks like
		// `HR_attack` and pulls the avatar out of the aim stance. The gunplay
		// stays on the aim locomotion clips and the muzzle/tracer lives in
		// `WaveTracers`; only reload/throw/hurt/heal interrupt the stance.
		if (inWaves) {
			if (minigame5.lastHurtAt !== lastSeenHurtAt) {
				lastSeenHurtAt = minigame5.lastHurtAt;
				triggerOneShot('HR_injured');
			} else if (minigame5.lastHealAt !== lastSeenHealAt) {
				lastSeenHealAt = minigame5.lastHealAt;
				triggerOneShot('HR_heal');
			} else if (waveInput.grenadeThrownAt !== lastSeenGrenadeAt) {
				lastSeenGrenadeAt = waveInput.grenadeThrownAt;
				triggerOneShot('HR_throw');
			}
		} else if (inDeathmatch) {
			if (minigame6.lastHurtAt !== lastSeenHurtAt) {
				lastSeenHurtAt = minigame6.lastHurtAt;
				triggerOneShot('HR_injured');
			} else if (minigame6.lastHealAt !== lastSeenHealAt) {
				lastSeenHealAt = minigame6.lastHealAt;
				triggerOneShot('HR_heal');
			} else if (dmInput.grenadeThrownAt !== lastSeenGrenadeAt) {
				lastSeenGrenadeAt = dmInput.grenadeThrownAt;
				triggerOneShot('HR_throw');
			}
		} else if (inRoyale) {
			if (minigame8.lastHurtAt !== lastSeenHurtAt) {
				lastSeenHurtAt = minigame8.lastHurtAt;
				triggerOneShot('HR_injured');
			} else if (royaleInput.grenadeThrownAt !== lastSeenGrenadeAt) {
				lastSeenGrenadeAt = royaleInput.grenadeThrownAt;
				triggerOneShot('HR_throw');
			}
		}

		// Sit toggle (panel button, touch button or `C` key).
		if (playerInput.consumeSitToggle()) {
			sitting = !sitting;
			oneShot = null;
			endPreview();
			animationPalette.setSitting(sitting);
		}

		// A remote roll has hit the capsule: trigger the hit reaction.
		if (playerInput.consumeHit()) {
			const hit = actions?.['HR_hit'];

			if (current === 'HR_hit' && hit) {
				// The clip was stuck on its last pose: replay it so it
				// emits 'finished' again and does not stay trapped in `oneShot`.
				hit.reset().play();
			} else {
				oneShot = 'HR_hit';
			}
		}

		// If the active rig lacks that clip (e.g. `HR_shoot`/`HR_wave` on the
		// scarecrow), the gesture is discarded and normal locomotion continues.
		if (wavesDowned && oneShot !== 'HR_death' && current !== 'HR_death') {
			oneShot = 'HR_death';
		}

		// Mientras el servidor diga que está muerto, el clip de muerte manda
		// aunque haya terminado: así la locomoción no lo reemplaza y no se
		// vuelve a disparar cuando llega el snapshot de respawn.
		if (deathmatchDead || royaleDead) {
			oneShot = 'HR_death';
		}

		if (oneShot && !actions?.[oneShot]) {
			oneShot = null;
		}

		if (oneShot) {
			endPreview();
			play(oneShot);
		} else if (preview) {
			// Share the gesture with the other players only after it survived
			// the same-frame cancellation (moving/jump/timer) and no gameplay
			// one-shot took priority. One message per preview; looping clips
			// do not need one every frame.
			if (previewStarted) {
				playerAnimations.broadcast(previewStarted);
			}

			playPreview(preview.name);
		} else if (sitting) {
			play('HR_sit');
		} else if (!playerState.grounded) {
			play('HR_jump');
		} else if (inCombat && moving) {
			if (crouching) {
				play('HR_crouch_aim', true);
			} else {
				play(running ? 'HR_run_aim' : 'HR_walk_aim', true);
			}
		} else if (inCombat) {
			play(crouching ? 'HR_crouch_aim' : 'HR_aim', true);
		} else if (moving) {
			play(running ? 'HR_run' : 'HR_walk');
		} else {
			play('HR_idle');
		}
	});

	// Arma visible en la mano derecha durante el Asedio al Granero. Se coloca
	// hueso a hueso cada frame, pero cuelga del modelo para que el cañón
	// apunte siempre al frente y el tamaño no dependa del escalado de la skin.
	let weaponRoot: Group | null = null;
	/** Arma base + variante cosmética; cambia también al equipar un NFT. */
	let weaponKey: string | null = null;

	const handWorld = new Vector3();
	const fingerWorld = new Vector3();
	const handQuaternion = new Quaternion();

	/**
	 * `GLTFLoader` sanea los nombres de nodo: `hand.R` llega como `handR`.
	 * Se aceptan ambos (y cualquier `hand*R`) para que funcione con todos los rigs.
	 */
	const findHand = (root: Object3D): Object3D | undefined => {
		const direct = root.getObjectByName('handR') ?? root.getObjectByName('hand.R');

		if (direct) {
			return direct;
		}

		let found: Object3D | undefined;

		root.traverse((child) => {
			if (!found && /^hand.*r$/i.test(child.name)) {
				found = child;
			}
		});

		return found;
	};

	useTask((delta) => {
		// El coin-pistol trae un clip `Fire` horneado: avanzar su mixer cada
		// frame para que el disparo se vea también en la mano.
		updateHeldWeaponAnimation(weaponRoot, delta);

		// Solo en una partida activa: si el lobby tarda en reflejar la salida
		// (fase `results`/`idle`) el arma no debe quedarse pegada a la mano.
		const wanted = sceneState.inRoyale
			? minigame8.phase === 'playing' && minigame8.self?.alive && minigame8.self.mode !== 'riding'
				? (minigame8.self.weapon ?? null)
				: null
			: sceneState.inDeathmatch
				? minigame6.self?.alive
					? (minigame6.self?.weapon ?? null)
					: null
				: sceneState.inWaves && !minigame5.isDowned && !minigame5.isDriving
					? (minigame5.self?.weapon ?? null)
					: sceneState.inHub &&
						  equipment.asset === 'coin-pistol' &&
						  !sitting &&
						  !cars.isDriving &&
						  !ride.isRiding &&
						  !race.inCar &&
						  !balloon.isOccupant
						? 'pistol'
						: null;

		if (!wanted) {
			if (weaponRoot) {
				weaponRoot.visible = false;
			}

			return;
		}

		const hand = findHand(ref);

		if (!hand) {
			if (weaponRoot) {
				weaponRoot.visible = false;
			}

			return;
		}

		if (!weaponRoot) {
			weaponRoot = new Group();
			weaponRoot.name = 'HeldWeapon';
			ref.add(weaponRoot);
			// The combat controls read the barrel tip from this group so shots
			// leave the gun instead of the character's head.
			trackLocalHeldWeapon(weaponRoot);
		}

		weaponRoot.visible = true;

		const variant = equipment.weaponVariantFor(wanted);
		const nextKey = `${wanted}:${variant ?? ''}`;

		if (weaponKey !== nextKey) {
			weaponKey = nextKey;
			weaponRoot.clear();
			weaponRoot.add(buildHeldWeapon(wanted, variant));
		}

		// Mano -> modelo: la empuñadura va en la palma (un poco hacia los
		// dedos) y el cañón mira al frente del personaje (+Z local).
		hand.updateWorldMatrix(true, false);
		hand.getWorldPosition(handWorld);
		hand.getWorldQuaternion(handQuaternion);
		fingerWorld.set(0, 1, 0).applyQuaternion(handQuaternion).multiplyScalar(0.1).add(handWorld);

		ref.updateWorldMatrix(true, false);
		ref.worldToLocal(handWorld);
		ref.worldToLocal(fingerWorld);

		weaponRoot.position
			.copy(handWorld)
			.addScaledVector(fingerWorld.sub(handWorld).normalize(), 0.07);
		// Ligeramente hacia dentro y hacia arriba para que se lea desde la cámara.
		weaponRoot.rotation.set(-0.04, -0.12, 0);
	});

	// Leaving the arena destroys this component: stop exposing a dead group to
	// the shot controls.
	$effect(() => {
		return () => {
			trackLocalHeldWeapon(null);
		};
	});
</script>
