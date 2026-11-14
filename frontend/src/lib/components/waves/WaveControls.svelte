<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { get } from 'svelte/store';
	import { Vector3 } from 'three';
	import { chat } from '../../state/chat.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { playerState } from '../../state/playerState';
	import { sceneState } from '../../state/sceneState.svelte';
	import { MONSTER_BY_KIND, WEAPON_BY_ID, ARENA_FLOOR_Y } from '../../state/wavesConfig';
	import { waveEffects } from '../../state/waveEffects.svelte';
	import { waveInput } from '../../state/waveInput';
	import { audio } from '../../audio/engine';
	import { localHeldWeaponMuzzle, playLocalHeldWeaponFire } from '../player/heldWeapon';

	/**
	 * Combat input for Barn Siege.
	 *
	 * - Left click fires immediately (holding keeps automatic weapons going).
	 * - `G` throws a grenade, `R` reloads, `E` enters/exits the arena car.
	 * - Touch buttons in `MobileControls` write `waveInput`, consumed here.
	 */

	const { canvas, camera } = useThrelte();

	/** Eye height used by the server for the hit test. */
	const EYE_HEIGHT = 1.55;
	/**
	 * Lateral distance the crosshair tolerates around a monster's centre.
	 *
	 * Measured on the ground plane (XZ). The old 3D test compared against a
	 * point at chest height, so aiming at the head or the feet of a monster
	 * (the natural thing to do) rejected the aim assist and the fallback ray
	 * missed by the camera's shoulder offset.
	 */
	const AIM_ASSIST_RADIUS = 1.4;

	/** Grenade landing distance limits around the aim point. */
	const GRENADE_MIN_RANGE = 4;
	const GRENADE_MAX_RANGE = 34;
	const GRENADE_DEFAULT_RANGE = 18;

	let fireHeld = false;

	let lastShotAt = 0;
	let lastAutoReloadAt = 0;
	let autoAccumulator = 0;
	let lastEffectSeq = 0;
	let aimTargetId: string | null = null;
	let lastMagAmmo = 0;
	let reloadPending = false;
	let lastBloodAt = 0;

	const weapon = $derived(minigame5.self?.weapon ?? 'pistol');
	const weaponDefinition = $derived(WEAPON_BY_ID.get(weapon));
	const isAuto = $derived(weaponDefinition?.auto ?? false);

	const forward = new Vector3();
	const flatForward = new Vector3();
	const eye = new Vector3();
	const muzzle = new Vector3();
	const aimPoint = new Vector3();
	const direction = new Vector3();
	const offset = new Vector3();

	function canAct(): boolean {
		return (
			sceneState.inWaves &&
			!chat.isOpen &&
			!minigame5.isDowned &&
			!minigame5.isDriving &&
			minigame5.phase === 'playing'
		);
	}

	/**
	 * Direction from the eye to what the crosshair is over.
	 *
	 * The Barn Siege camera is over the right shoulder and looks slightly down
	 * at the avatar, so firing along `camera.getWorldDirection()` sends bullets
	 * 0.9 m to the left of the crosshair and into the ground a few metres
	 * ahead (the server rejects impacts below the arena floor). Aim assist
	 * picks the monster under the crosshair and converges the shot on it;
	 * without a target it fires flat along the view direction.
	 */
	function aimAt(range: number): boolean {
		const activeCamera = get(camera);

		if (!activeCamera) {
			return false;
		}

		activeCamera.getWorldDirection(forward);

		// What decides whether the crosshair is over a monster is its
		// horizontal position: they all stand on the arena floor. Using the
		// camera's full 3D ray rejected targets when the player aimed at the
		// head or the feet instead of the chest.
		flatForward.set(forward.x, 0, forward.z);

		if (flatForward.lengthSq() < 1e-6) {
			flatForward.set(0, 0, 1);
		}

		flatForward.normalize();

		eye.set(playerState.x, playerState.y + EYE_HEIGHT, playerState.z);

		let bestMiss = Infinity;
		let bestAlong = Infinity;
		let found = false;

		aimTargetId = null;

		// Positions carry no kind (only the 1 Hz snapshot does): build the
		// id → kind map once per shot to size each monster's hit capsule.
		const kinds = new Map(minigame5.monsters.map((monster) => [monster.id, monster.kind]));
		// Test the crosshair against what is actually on screen (the render
		// buffer is ~200 ms behind the newest sample); the server locks the
		// reported target, so the lag no longer costs the hit.
		const monsters = minigame5.sampleAt()?.monsters ?? minigame5.latestMonsters();

		for (const monster of monsters) {
			if (monster.status !== 'active') {
				continue;
			}

			const kind = kinds.get(monster.id);
			const definition = kind ? MONSTER_BY_KIND.get(kind) : undefined;
			const centreY = monster.y + (definition?.height ?? 1.9) * 0.55;

			const along =
				(monster.x - activeCamera.position.x) * flatForward.x +
				(monster.z - activeCamera.position.z) * flatForward.z;

			if (along <= 0.2 || along > range) {
				continue;
			}

			const closestX = activeCamera.position.x + flatForward.x * along;
			const closestZ = activeCamera.position.z + flatForward.z * along;
			const miss = Math.hypot(monster.x - closestX, monster.z - closestZ);

			if (miss > AIM_ASSIST_RADIUS) {
				continue;
			}

			// Closest to the crosshair wins; near-ties go to the nearest one.
			const better =
				miss < bestMiss - 0.1 || (Math.abs(miss - bestMiss) <= 0.1 && along < bestAlong);

			if (!better) {
				continue;
			}

			bestMiss = miss;
			bestAlong = along;
			aimPoint.set(monster.x, centreY, monster.z);
			aimTargetId = monster.id;
			found = true;
		}

		if (!found) {
			// Nothing under the crosshair: shoot flat, in the crosshair's
			// horizontal direction. Following the camera ray from the eye
			// pointed it at the floor and the server dropped the impact.
			aimPoint.set(eye.x + flatForward.x * 40, eye.y, eye.z + flatForward.z * 40);
		}

		direction.copy(aimPoint).sub(eye).normalize();

		// The gun sits in the right hand: use the actual barrel tip so the
		// tracer leaves the weapon instead of the character's head. Re-aim
		// from that point so the shot still crosses the crosshair (and stays
		// within the server's 2 m origin check).
		if (!localHeldWeaponMuzzle(muzzle)) {
			// Fallback for rigs without a hand bone or a hidden weapon: keep
			// the old shoulder estimate.
			offset.set(direction.z, 0, -direction.x);

			if (offset.lengthSq() > 1e-6) {
				offset.normalize();
			}

			muzzle.copy(eye).addScaledVector(offset, 0.28).addScaledVector(direction, 0.35);
		}

		direction.copy(aimPoint).sub(muzzle).normalize();

		return true;
	}

	function shoot(): void {
		if (!canAct()) {
			return;
		}

		const definition = weaponDefinition;
		const rate = definition?.rate ?? 6;
		const now = performance.now();

		if (now - lastShotAt < (1000 / rate) * 0.8) {
			return;
		}

		// Empty magazine: the server silently drops the shot but the client
		// used to draw a tracer anyway, so the gun looked like it was firing
		// while nothing took damage. Reload instead of firing blanks.
		if ((minigame5.self?.magAmmo ?? 0) <= 0) {
			audio.play('dry_fire', { priority: 2, sourceId: 'wave-gun' });

			if (now - lastAutoReloadAt > 600) {
				lastAutoReloadAt = now;
				reloadWeapon();
			}

			return;
		}

		if (!aimAt(definition?.range ?? 55)) {
			return;
		}

		lastShotAt = now;
		playLocalHeldWeaponFire();
		audio.play(`shot_${weapon}`, {
			priority: 3,
			sourceId: 'wave-gun',
			volume: 0.85,
			rate: 0.97 + Math.random() * 0.06
		});

		minigame5.sendShoot(
			weapon,
			{ x: muzzle.x, y: muzzle.y, z: muzzle.z },
			{ x: direction.x, y: direction.y, z: direction.z },
			aimTargetId
		);

		waveEffects.shot(
			{ x: muzzle.x, y: muzzle.y, z: muzzle.z },
			{ x: aimPoint.x, y: aimPoint.y, z: aimPoint.z }
		);
	}

	function reloadWeapon(): void {
		if (!minigame5.reload()) {
			audio.play('ui_error', { priority: 1 });
			return;
		}

		reloadPending = true;
		audio.play('reload_start', { priority: 2, sourceId: 'wave-gun' });
	}

	/** Equip the owned weapon in hotbar slot 1–4 (keys or HUD click). */
	function equipWeapon(slot: number): void {
		if (!sceneState.inWaves || chat.isOpen || minigame5.isDowned || minigame5.isDriving) {
			return;
		}

		const entry = minigame5.self?.inventory.find((item) => item.slot === slot);

		if (!entry) {
			audio.play('ui_error', { priority: 1 });
			return;
		}

		if (minigame5.self?.weapon === entry.weapon) {
			return;
		}

		if (minigame5.equip(slot)) {
			audio.play('ui_click', { priority: 1 });
			reloadPending = false;
			autoAccumulator = 0;
		}
	}

	function throwGrenade(): void {
		if (!canAct()) {
			return;
		}

		if ((minigame5.self?.grenades ?? 0) <= 0) {
			return;
		}

		const activeCamera = get(camera);

		if (!activeCamera) {
			return;
		}

		activeCamera.getWorldDirection(forward);

		const flat = new Vector3(forward.x, 0, forward.z);

		if (flat.lengthSq() < 1e-6) {
			flat.set(0, 0, 1);
		}

		flat.normalize();

		const origin = new Vector3(playerState.x, playerState.y + 1.4, playerState.z);
		const target = new Vector3(
			origin.x + flat.x * GRENADE_DEFAULT_RANGE,
			ARENA_FLOOR_Y,
			origin.z + flat.z * GRENADE_DEFAULT_RANGE
		);

		// Where the crosshair meets the arena floor. The camera looks slightly
		// down at the avatar, so the ray/plane intersection is the spot the
		// player is aiming at; a 4.5 m blast radius forgives the shoulder
		// offset. If they look up, keep the default forward throw.
		if (forward.y < -0.05) {
			const toGround = (ARENA_FLOOR_Y - activeCamera.position.y) / forward.y;

			if (toGround > 0 && toGround < 200) {
				target.set(
					activeCamera.position.x + forward.x * toGround,
					ARENA_FLOOR_Y,
					activeCamera.position.z + forward.z * toGround
				);
			}
		}

		// Never drop it on our own feet, and keep it throwable.
		const dx = target.x - origin.x;
		const dz = target.z - origin.z;
		const distance = Math.hypot(dx, dz);

		if (distance < 0.001) {
			target.set(
				origin.x + flat.x * GRENADE_DEFAULT_RANGE,
				ARENA_FLOOR_Y,
				origin.z + flat.z * GRENADE_DEFAULT_RANGE
			);
		} else if (distance < GRENADE_MIN_RANGE) {
			const scale = GRENADE_MIN_RANGE / distance;
			target.x = origin.x + dx * scale;
			target.z = origin.z + dz * scale;
		} else if (distance > GRENADE_MAX_RANGE) {
			const scale = GRENADE_MAX_RANGE / distance;
			target.x = origin.x + dx * scale;
			target.z = origin.z + dz * scale;
		}

		minigame5.throwGrenade(
			{ x: origin.x, y: origin.y, z: origin.z },
			{ x: flat.x, y: 0, z: flat.z },
			{ x: target.x, z: target.z }
		);

		waveEffects.throwAt(target.x, target.z);
		waveInput.grenadeThrownAt = Date.now();
		audio.play('grenade_throw', { priority: 2 });
	}

	function toggleCar(): void {
		if (!sceneState.inWaves || chat.isOpen || minigame5.isDowned) {
			return;
		}

		if (minigame5.isDriving) {
			minigame5.carExit();
		} else {
			minigame5.carEnter();
		}
	}

	// Hit feedback: the server reports every successful pellet/melee hit with
	// its impact point, so the HUD can show a hit marker and a spark.
	function consumeCombatEvents(): void {
		const events = minigame5.events;

		// On mount the store may still hold events from before we entered:
		// start from the newest one instead of replaying old impacts.
		if (lastEffectSeq === 0 && events.length > 0) {
			lastEffectSeq = events[events.length - 1].seq;
			return;
		}

		for (const event of events) {
			if (event.seq <= lastEffectSeq) {
				continue;
			}

			lastEffectSeq = event.seq;

			if (
				event.kind === 'monster-hit' &&
				event.playerId === minigame5.selfId &&
				event.x !== undefined &&
				event.y !== undefined &&
				event.z !== undefined
			) {
				waveEffects.impact(event.x, event.y, event.z);

				// Blood on the monster only for our own bullets: the point is
				// where the server applied the damage. A shotgun blast can
				// report several pellets in the same frame, so throttle it.
				const now = performance.now();

				if (now - lastBloodAt > 55) {
					lastBloodAt = now;
					waveEffects.blood(event.x, event.y, event.z);
				}
			}

			// Remote shots: the server echoes every accepted shot so other
			// players see the tracer and the muzzle flash from the shooter.
			if (
				event.kind === 'shot-fired' &&
				event.playerId !== undefined &&
				event.playerId !== minigame5.selfId &&
				event.x !== undefined &&
				event.y !== undefined &&
				event.z !== undefined &&
				event.dx !== undefined &&
				event.dy !== undefined &&
				event.dz !== undefined
			) {
				const length = Math.min(
					event.weapon ? (WEAPON_BY_ID.get(event.weapon)?.range ?? 55) : 55,
					70
				);

				waveEffects.shot(
					{ x: event.x, y: event.y, z: event.z },
					{
						x: event.x + event.dx * length,
						y: event.y + event.dy * length,
						z: event.z + event.dz * length
					}
				);
			}
		}
	}

	const onKeyDown = (event: KeyboardEvent) => {
		if (!sceneState.inWaves) return;
		if (event.target instanceof HTMLElement) {
			const tag = event.target;
			if (
				tag instanceof HTMLInputElement ||
				tag instanceof HTMLTextAreaElement ||
				tag instanceof HTMLSelectElement ||
				tag.closest('[contenteditable="true"]')
			) {
				return;
			}
		}
		if (chat.isOpen) return;

		switch (event.code) {
			case 'KeyG':
				event.preventDefault();
				throwGrenade();
				return;
			case 'KeyR':
				event.preventDefault();
				reloadWeapon();
				return;
			case 'KeyE':
				event.preventDefault();
				toggleCar();
				return;
			case 'Digit1':
			case 'Numpad1':
				event.preventDefault();
				equipWeapon(1);
				return;
			case 'Digit2':
			case 'Numpad2':
				event.preventDefault();
				equipWeapon(2);
				return;
			case 'Digit3':
			case 'Numpad3':
				event.preventDefault();
				equipWeapon(3);
				return;
			case 'Digit4':
			case 'Numpad4':
				event.preventDefault();
				equipWeapon(4);
				return;
		}
	};

	$effect(() => {
		window.addEventListener('keydown', onKeyDown);

		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	});

	// Ratón sobre el canvas: disparo inmediato; mantener para automáticas.
	$effect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse' || event.button !== 0) return;
			if (!canAct()) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;

			fireHeld = true;
			// Fire on press instead of waiting for a short release: aiming
			// with the mouse often makes the click longer than a tap.
			shoot();
		};

		const onPointerUp = (event: PointerEvent) => {
			if (event.button !== 0) return;
			fireHeld = false;
		};

		const stop = () => {
			fireHeld = false;
		};

		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', stop);
		canvas.addEventListener('pointerleave', stop);

		return () => {
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', stop);
			canvas.removeEventListener('pointerleave', stop);
		};
	});

	// Armas automáticas y botones táctiles.
	useTask((delta) => {
		consumeCombatEvents();

		// El servidor es la autoridad del cargador: al verlo subir, la
		// recarga terminó. Evita duplicar un temporizador local.
		const magAmmo = minigame5.self?.magAmmo ?? 0;

		if (reloadPending && magAmmo > lastMagAmmo) {
			reloadPending = false;
			audio.play('reload_end', { priority: 2, sourceId: 'wave-gun' });
		}

		lastMagAmmo = magAmmo;

		if (waveInput.consumeGrenade()) {
			throwGrenade();
		}

		if (waveInput.consumeReload()) {
			reloadWeapon();
		}

		const equipSlot = waveInput.consumeEquip();

		if (equipSlot !== null) {
			equipWeapon(equipSlot);
		}

		if (waveInput.consumeFire()) {
			shoot();
		}

		if (!canAct()) {
			return;
		}

		const held = fireHeld || waveInput.fireHeld;

		if (held && isAuto) {
			autoAccumulator += delta;
			const interval = 1 / (weaponDefinition?.rate ?? 6);

			while (autoAccumulator >= interval) {
				autoAccumulator -= interval;
				shoot();
			}
		} else {
			autoAccumulator = 0;
		}
	});
</script>
