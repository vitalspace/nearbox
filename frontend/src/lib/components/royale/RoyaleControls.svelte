<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { get } from 'svelte/store';
	import { Vector3 } from 'three';
	import { audio } from '../../audio/engine';
	import { chat } from '../../state/chat.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { playerInput } from '../../state/playerInput';
	import { playerState } from '../../state/playerState';
	import {
		ROYALE_WEAPON_BY_ID,
		ROYALE_WEAPON_BY_SLOT,
		type RoyaleWeaponId
	} from '../../state/royaleConfig';
	import { royaleEffects } from '../../state/royaleEffects.svelte';
	import { royaleInput } from '../../state/royaleInput';
	import { sceneState } from '../../state/sceneState.svelte';
	import { localHeldWeaponMuzzle, playLocalHeldWeaponFire } from '../player/heldWeapon';

	/**
	 * Combate de Skyfall Royale.
	 *
	 * Igual que en el deathmatch, el cliente solo envía origen, dirección y el
	 * enemigo bajo la mira; el servidor decide daño, cadencia, munición,
	 * paredes y granadas.
	 */

	const { canvas, camera } = useThrelte();

	const EYE_HEIGHT = 1.55;
	const AIM_ASSIST_RADIUS = 1.3;
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

	const self = $derived(minigame8.self);
	const weapon = $derived(self?.weapon ?? 'pistol');
	const weaponDefinition = $derived(ROYALE_WEAPON_BY_ID.get(weapon));
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
			sceneState.inRoyale &&
			!chat.isOpen &&
			minigame8.phase === 'playing' &&
			self !== null &&
			self.alive &&
			self.mode !== 'riding'
		);
	}

	function aimAt(range: number): boolean {
		const activeCamera = get(camera);

		if (!activeCamera || !self) {
			return false;
		}

		activeCamera.getWorldDirection(forward);

		flatForward.set(forward.x, 0, forward.z);

		if (flatForward.lengthSq() < 1e-6) {
			flatForward.set(0, 0, 1);
		}

		flatForward.normalize();

		eye.set(playerState.x, playerState.y + EYE_HEIGHT, playerState.z);

		const players = minigame8.sampleAt()?.players ?? minigame8.latestPlayers();

		let bestMiss = Infinity;
		let bestAlong = Infinity;
		let found = false;

		aimTargetId = null;

		for (const player of players) {
			if (!player.alive || player.id === minigame8.selfId) {
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

		if (!localHeldWeaponMuzzle(muzzle)) {
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

		if ((self?.magAmmo ?? 0) <= 0) {
			audio.play('dry_fire', { priority: 2, sourceId: 'royale-gun' });

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
			sourceId: 'royale-gun',
			volume: 0.85,
			rate: 0.97 + Math.random() * 0.06
		});

		minigame8.sendShoot(
			weapon,
			{ x: muzzle.x, y: muzzle.y, z: muzzle.z },
			{ x: direction.x, y: direction.y, z: direction.z },
			aimTargetId
		);

		royaleEffects.shot(
			{ x: muzzle.x, y: muzzle.y, z: muzzle.z },
			{ x: aimPoint.x, y: aimPoint.y, z: aimPoint.z }
		);
	}

	function reloadWeapon(): void {
		if (!canAct() || !minigame8.reload()) {
			audio.play('ui_error', { priority: 1 });
			return;
		}

		reloadPending = true;
		audio.play('reload_start', { priority: 2, sourceId: 'royale-gun' });
	}

	function equipWeapon(slot: number): void {
		if (!canAct()) {
			return;
		}

		const wanted: RoyaleWeaponId | undefined = ROYALE_WEAPON_BY_SLOT[slot];

		if (!wanted) {
			audio.play('ui_error', { priority: 1 });
			return;
		}

		if (!self?.inventory.some((item) => item.weapon === wanted)) {
			audio.play('ui_error', { priority: 1 });
			return;
		}

		if (self.weapon === wanted) {
			return;
		}

		if (minigame8.equip(slot)) {
			audio.play('ui_click', { priority: 1 });
			reloadPending = false;
			autoAccumulator = 0;
		}
	}

	function throwGrenade(): void {
		if (!canAct() || (self?.grenades ?? 0) <= 0) {
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
			origin.y,
			origin.z + flat.z * GRENADE_DEFAULT_RANGE
		);

		const dx = target.x - origin.x;
		const dz = target.z - origin.z;
		const distance = Math.hypot(dx, dz);

		if (distance < 0.001) {
			target.set(
				origin.x + flat.x * GRENADE_DEFAULT_RANGE,
				origin.y,
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

		minigame8.throwGrenade(
			{ x: origin.x, y: origin.y, z: origin.z },
			{ x: flat.x, y: 0, z: flat.z },
			{ x: target.x, z: target.z }
		);

		royaleEffects.throwAt(target.x, target.z);
		royaleInput.grenadeThrownAt = Date.now();
		audio.play('grenade_throw', { priority: 2 });
	}

	function jumpAction(): void {
		if (!sceneState.inRoyale || chat.isOpen) return;

		if (minigame8.riding) {
			if (minigame8.canJump) {
				minigame8.sendJump();
			}

			return;
		}

		if (royaleInput.mode === 'skydive') {
			royaleInput.requestDeploy();
			return;
		}

		playerInput.requestJump();
	}

	const onKeyDown = (event: KeyboardEvent) => {
		if (!sceneState.inRoyale) return;

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
			case 'KeyE':
				event.preventDefault();
				jumpAction();
				return;
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
		const magAmmo = self?.magAmmo ?? 0;

		if (reloadPending && magAmmo > lastMagAmmo) {
			reloadPending = false;
			audio.play('reload_end', { priority: 2, sourceId: 'royale-gun' });
		}

		lastMagAmmo = magAmmo;

		if (royaleInput.consumeGrenade()) {
			throwGrenade();
		}

		if (royaleInput.consumeReload()) {
			reloadWeapon();
		}

		const equipSlot = royaleInput.consumeEquip();

		if (equipSlot !== null) {
			equipWeapon(equipSlot);
		}

		if (royaleInput.consumeFire()) {
			shoot();
		}

		if (!canAct()) {
			autoAccumulator = 0;
			return;
		}

		const held = fireHeld || royaleInput.fireHeld;

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
