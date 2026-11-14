<script lang="ts">
	import { useTask } from '@threlte/core';
	import { carInput } from '../../state/carInput';
	import { chat } from '../../state/chat.svelte';
	import { playerInput } from '../../state/playerInput';
	import { resetPlayerIntent } from '../../state/playerIntent';
	import { roadmapCar } from '../../state/roadmapCar.svelte';

	const pressed = new Set<string>();

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

	function onKeyDown(event: KeyboardEvent): void {
		if (isEditableTarget(event.target) || chat.isOpen) {
			return;
		}

		pressed.add(event.code);

		if (event.repeat) {
			return;
		}

		if (event.code === 'KeyR') {
			event.preventDefault();
			roadmapCar.requestReset();
			return;
		}

		if (event.code === 'Space' || event.code.startsWith('Arrow')) {
			event.preventDefault();
		}
	}

	function onKeyUp(event: KeyboardEvent): void {
		if (isEditableTarget(event.target)) {
			return;
		}

		pressed.delete(event.code);
	}

	function onBlur(): void {
		pressed.clear();
		carInput.reset();
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
			carInput.reset();
		};
	});

	// The Haunted Highway is car-only: clear walking state so no jump/clip is left
	// pending when the player leaves the track.
	$effect(() => {
		playerInput.reset();
		resetPlayerIntent();

		return () => {
			pressed.clear();
			carInput.reset();
			playerInput.reset();
			resetPlayerIntent();
		};
	});

	useTask(() => {
		if (carInput.touchActive) {
			return;
		}

		const forward = pressed.has('KeyW') || pressed.has('ArrowUp');
		const back = pressed.has('KeyS') || pressed.has('ArrowDown');
		const left = pressed.has('KeyA') || pressed.has('ArrowLeft');
		const right = pressed.has('KeyD') || pressed.has('ArrowRight');

		carInput.throttle = (forward ? 1 : 0) - (back ? 1 : 0);
		carInput.steering = (right ? 1 : 0) - (left ? 1 : 0);
		carInput.brake = false;
		carInput.handbrake = pressed.has('Space');
	});
</script>
