<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { get } from 'svelte/store';
	import { Vector3 } from 'three';
	import { audio } from '../../audio/engine';
	import { chat } from '../../state/chat.svelte';
	import { ARENA_FLOOR_Y, WEAPON_BY_ID } from '../../state/dmConfig';
	import { dmEffects } from '../../state/dmEffects.svelte';
	import { dmInput } from '../../state/dmInput';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { playerState } from '../../state/playerState';
	import { sceneState } from '../../state/sceneState.svelte';
	import { localHeldWeaponMuzzle, playLocalHeldWeaponFire } from '../player/heldWeapon';

	/**
	 * Combat input for the Witch House Deathmatch.
	 *
	 * Same authoritative contract as Barn Siege: the client only sends an
	 * origin, a direction and the enemy under the crosshair; the server decides
	 * damage, friendly fire and ammo. Hitscan weapons do not simulate bullets.
	 */

	const { canvas, camera } = useThrelte();

	const EYE_HEIGHT = 1.55;
	const AIM_ASSIST_RADIUS = 1.4;

	const GRENADE_MIN_RANGE = 4;
	const GRENADE_MAX_RANGE = 34;
	const GRENADE_DEFAULT_RANGE = 18;

	let fireHeld = false;
	let lastShotAt = 0;
	let lastAutoReloadAt = 0;
	let autoAccumulator = 0;
	let aimTargetId: string | null = null;
	let lastMagAmmo = 0;
	let reloadPending = false;

	const weapon = $derived(minigame6.self?.weapon ?? 'pistol');
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
			sceneState.inDeathmatch &&
			!chat.isOpen &&
			minigame6.phase === 'playing' &&
			minigame6.self !== null &&
			minigame6.self.alive
		);
	}

	function aimAt(range: number): boolean {
		const activeCamera = get(camera);

		if (!activeCamera || !minigame6.self) {
			return false;
		}

		activeCamera.getWorldDirection(forward);

		flatForward.set(forward.x, 0, forward.z);

		if (flatForward.lengthSq() < 1e-6) {
			flatForward.set(0, 0, 1);
		}

		flatForward.normalize();

		eye.set(playerState.x, playerState.y + EYE_HEIGHT, playerState.z);

		const selfTeam = minigame6.self.team;
		const teams = new Map(
			(minigame6.snapshot?.players ?? []).map((player) => [player.id, player.team])
		);
		const players = minigame6.sampleAt()?.players ?? minigame6.latestPlayers();

		let bestMiss = Infinity;
		let bestAlong = Infinity;
		let found = false;

		aimTargetId = null;

		for (const player of players) {
			if (!player.alive || player.id === minigame6.selfId) {
				continue;
			}

			if (teams.get(player.id) === selfTeam) {
				continue;
			}

			const along =
				(player.x - activeCamera.position.x) * flatForward.x +
				(player.z - activeCamera.position.z) * flatForward.z;

			if (along <= 0.2 || along > range) {
				continue;
			}

			const closestX = activeCamera.position.x + flatForward.x * along;
			const closestZ = activeCamera.position.z + flatForward.z * along;
			const miss = Math.hypot(player.x - closestX, player.z - closestZ);

			if (miss > AIM_ASSIST_RADIUS) {
				continue;
			}

			const better =
				miss < bestMiss - 0.1 || (Math.abs(miss - bestMiss) <= 0.1 && along < bestAlong);

			if (!better) {
				continue;
			}

			bestMiss = miss;
			bestAlong = along;
			aimPoint.set(player.x, player.y + 1.2, player.z);
			aimTargetId = player.id;
			found = true;
		}

		if (!found) {
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

		if ((minigame6.self?.magAmmo ?? 0) <= 0) {
			audio.play('dry_fire', { priority: 2, sourceId: 'dm-gun' });

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
			sourceId: 'dm-gun',
			volume: 0.85,
			rate: 0.97 + Math.random() * 0.06
		});

		minigame6.sendShoot(
			weapon,
			{ x: muzzle.x, y: muzzle.y, z: muzzle.z },
			{ x: direction.x, y: direction.y, z: direction.z },
			aimTargetId
		);

		dmEffects.shot(
			{ x: muzzle.x, y: muzzle.y, z: muzzle.z },
			{ x: aimPoint.x, y: aimPoint.y, z: aimPoint.z }
		);
	}

	function reloadWeapon(): void {
		if (!minigame6.reload()) {
			audio.play('ui_error', { priority: 1 });
			return;
		}

		reloadPending = true;
		audio.play('reload_start', { priority: 2, sourceId: 'dm-gun' });
	}

	function equipWeapon(slot: number): void {
		if (!sceneState.inDeathmatch || chat.isOpen || !minigame6.self?.alive) {
			return;
		}

		const entry = minigame6.self?.inventory.find((item) => item.slot === slot);

		if (!entry) {
			audio.play('ui_error', { priority: 1 });
			return;
		}

		if (minigame6.self?.weapon === entry.weapon) {
			return;
		}

		if (minigame6.equip(slot)) {
			audio.play('ui_click', { priority: 1 });
			reloadPending = false;
			autoAccumulator = 0;
		}
	}

	function throwGrenade(): void {
		if (!canAct() || (minigame6.self?.grenades ?? 0) <= 0) {
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

		minigame6.throwGrenade(
			{ x: origin.x, y: origin.y, z: origin.z },
			{ x: flat.x, y: 0, z: flat.z },
			{ x: target.x, z: target.z }
		);

		dmEffects.throwAt(target.x, target.z);
		dmInput.grenadeThrownAt = Date.now();
		audio.play('grenade_throw', { priority: 2 });
	}

	const onKeyDown = (event: KeyboardEvent) => {
		if (!sceneState.inDeathmatch) return;

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

	$effect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse' || event.button !== 0) return;
			if (!canAct()) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;

			fireHeld = true;
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

	useTask((delta) => {
		const magAmmo = minigame6.self?.magAmmo ?? 0;

		if (reloadPending && magAmmo > lastMagAmmo) {
			reloadPending = false;
			audio.play('reload_end', { priority: 2, sourceId: 'dm-gun' });
		}

		lastMagAmmo = magAmmo;

		if (dmInput.consumeGrenade()) {
			throwGrenade();
		}

		if (dmInput.consumeReload()) {
			reloadWeapon();
		}

		const equipSlot = dmInput.consumeEquip();

		if (equipSlot !== null) {
			equipWeapon(equipSlot);
		}

		if (dmInput.consumeFire()) {
			shoot();
		}

		if (!canAct()) {
			return;
		}

		const held = fireHeld || dmInput.fireHeld;

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
