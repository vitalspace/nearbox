<script lang="ts">
	import { useTask } from '@threlte/core';
	import { carInput } from '../../state/carInput';
	import { chat } from '../../state/chat.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { playerInput } from '../../state/playerInput';
	import { resetPlayerIntent } from '../../state/playerIntent';
	import { sceneState } from '../../state/sceneState.svelte';

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
		if (!sceneState.inWaves) return;
		if (isEditableTarget(event.target) || chat.isOpen) return;

		// Solo cuando conducimos el coche de la arena.
		if (!minigame5.isDriving) return;

		pressed.add(event.code);

		if (event.repeat) return;

		if (event.code === 'Space' || event.code.startsWith('Arrow')) {
			event.preventDefault();
		}
	}

	function onKeyUp(event: KeyboardEvent): void {
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

			if (minigame5.isDriving) {
				carInput.reset();
			}
		};
	});

	// Al entrar/salir del coche, limpia la entrada de conducción.
	$effect(() => {
		if (!minigame5.isDriving) {
			pressed.clear();
			carInput.reset();
		} else {
			playerInput.reset();
			resetPlayerIntent();
		}
	});

	useTask(() => {
		if (!minigame5.isDriving || carInput.touchActive) {
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
