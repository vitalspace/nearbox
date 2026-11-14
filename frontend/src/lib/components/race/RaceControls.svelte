<script lang="ts">
	import { chat } from '../../state/chat.svelte';
	import { raceInput } from '../../state/raceInput';
	import { race } from '../../state/race.svelte';

	const pressed = new Set<string>();

	function isEditable(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;

		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable ||
			target.closest('[contenteditable="true"]') !== null
		);
	}

	function apply(): void {
		if (raceInput.touchActive) {
			return;
		}

		const forward = pressed.has('KeyW') || pressed.has('ArrowUp');
		const back = pressed.has('KeyS') || pressed.has('ArrowDown');
		const left = pressed.has('KeyA') || pressed.has('ArrowLeft');
		const right = pressed.has('KeyD') || pressed.has('ArrowRight');

		raceInput.throttle = (forward ? 1 : 0) - (back ? 1 : 0);
		raceInput.steering = (right ? 1 : 0) - (left ? 1 : 0);
		raceInput.handbrake = pressed.has('Space');
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (!race.inCar || isEditable(event.target) || chat.isOpen) {
			return;
		}

		if (event.code.startsWith('Arrow') || event.code === 'Space') {
			event.preventDefault();
		}

		if (event.repeat) {
			return;
		}

		if (event.code === 'KeyQ') {
			race.useItem();
			return;
		}

		if (event.code === 'KeyR') {
			race.requestReset();
			return;
		}

		if (
			[
				'KeyW',
				'KeyA',
				'KeyS',
				'KeyD',
				'ArrowUp',
				'ArrowDown',
				'ArrowLeft',
				'ArrowRight',
				'Space'
			].includes(event.code)
		) {
			pressed.add(event.code);
			apply();
		}
	}

	function onKeyUp(event: KeyboardEvent): void {
		pressed.delete(event.code);
		apply();
	}

	function onBlur(): void {
		pressed.clear();
		raceInput.reset();
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
			raceInput.reset();
		};
	});

	$effect(() => {
		if (!race.inCar) {
			pressed.clear();
			raceInput.reset();
		}
	});
</script>
