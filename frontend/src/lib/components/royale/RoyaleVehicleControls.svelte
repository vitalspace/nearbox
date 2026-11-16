<script lang="ts">
	import { useTask } from '@threlte/core';
	import { carInput } from '../../state/carInput';
	import { chat } from '../../state/chat.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleInput } from '../../state/royaleInput';
	import { royaleVehicles } from '../../state/royaleVehicles.svelte';
	import { sceneState } from '../../state/sceneState.svelte';

	const pressed = new Set<string>();
	let wasDriving = false;

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;

		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable ||
			target.closest('[contenteditable="true"]') !== null
		);
	}

	function clearInput(): void {
		carInput.clearTouch();
		royaleInput.lift = 0;
	}

	function refresh(): void {
		if (!minigame8.isDriving) {
			clearInput();
			return;
		}

		// El stick táctil escribe directamente en `carInput`; no lo pisamos.
		if (carInput.touchActive) return;

		const forward = pressed.has('KeyW') || pressed.has('ArrowUp');
		const back = pressed.has('KeyS') || pressed.has('ArrowDown');
		const left = pressed.has('KeyA') || pressed.has('ArrowLeft');
		const right = pressed.has('KeyD') || pressed.has('ArrowRight');
		const balloon = minigame8.drivingKind === 'balloon';
		const up = pressed.has('Space');
		const down = pressed.has('ShiftLeft') || pressed.has('ShiftRight');

		carInput.throttle = (forward ? 1 : 0) - (back ? 1 : 0);
		carInput.steering = (right ? 1 : 0) - (left ? 1 : 0);
		carInput.brake = !balloon && down;
		carInput.handbrake = !balloon && up;
		royaleInput.lift = balloon ? (up ? 1 : 0) - (down ? 1 : 0) : 0;
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (!sceneState.inRoyale) return;
		if (chat.isOpen || isEditableTarget(event.target)) return;

		if (
			minigame8.isDriving &&
			(event.code === 'KeyR' ||
				event.code === 'Space' ||
				event.code.startsWith('Arrow') ||
				event.code === 'ShiftLeft' ||
				event.code === 'ShiftRight')
		) {
			event.preventDefault();
		}

		// `R` endereza el coche, igual que en el Gran Premio. Solo mientras se
		// conduce un coche: en el globo `R` recarga el arma y a pie también.
		if (event.code === 'KeyR' && minigame8.isDriving && minigame8.drivingKind === 'car') {
			royaleVehicles.flip();
			return;
		}

		// `V` alterna 1ª/3ª persona del globo: la 1ª es la vista de tiro.
		if (event.code === 'KeyV' && minigame8.isDriving && minigame8.drivingKind === 'balloon') {
			event.preventDefault();
			royaleVehicles.toggleBalloonView();
			return;
		}

		// Se registra también fuera del vehículo: si el jugador ya mantiene W
		// al pulsar `E`, el coche arranca en vez de quedarse quieto hasta
		// soltar y volver a pulsar.
		pressed.add(event.code);

		if (minigame8.isDriving) {
			refresh();
		}
	}

	function onKeyUp(event: KeyboardEvent): void {
		if (!sceneState.inRoyale) return;

		pressed.delete(event.code);
		refresh();
	}

	function onBlur(): void {
		pressed.clear();
		clearInput();
	}

	$effect(() => {
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', onBlur);

		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onBlur);
			pressed.clear();
			clearInput();
		};
	});

	useTask(() => {
		royaleVehicles.scan(Date.now());

		const driving = minigame8.isDriving;

		if (!wasDriving && driving) {
			// Aplica las teclas que ya estaban pulsadas al subir al vehículo.
			refresh();
		}

		if (wasDriving && !driving) {
			pressed.clear();
			clearInput();
		}

		wasDriving = driving;
	});
</script>
