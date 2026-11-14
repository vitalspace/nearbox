<script lang="ts">
	import { useTask } from '@threlte/core';
	import { balloon } from '../../state/balloon.svelte';
	import { balloonInput } from '../../state/balloonInput';
	import { chat } from '../../state/chat.svelte';
	import { carInput } from '../../state/carInput';
	import { cars } from '../../state/cars.svelte';
	import { checkpoints } from '../../state/checkpoints.svelte';
	import { missions } from '../../state/missions.svelte';
	import { npcs } from '../../state/npcs.svelte';
	import { ride } from '../../state/ride.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import { playerInput } from '../../state/playerInput';
	import { playerIntent, resetPlayerIntent } from '../../state/playerIntent';
	import { playerState } from '../../state/playerState';

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

	function toggleCar(): void {
		// The hub cars only exist on the outdoor map; the arena handles its own.
		if (!sceneState.inGlobal) {
			return;
		}

		if (ride.isRiding) {
			ride.dismount();
			return;
		}

		if (balloon.isOccupant) {
			balloon.requestExit();
			return;
		}

		if (cars.isDriving) {
			cars.requestExit();
			return;
		}

		balloon.updateNearest(playerState.x, playerState.y, playerState.z);

		if (balloon.nearest) {
			balloon.setEntryHint(null);

			if (!balloon.requestEnter()) {
				balloon.setEntryHint('Not connected to the lobby');
			}

			return;
		}

		cars.updateNearest(playerState.x, playerState.z);

		if (!cars.nearestId) {
			// Sin coche ni globo cerca, E monta el vehículo NFT equipado.
			if (ride.mount()) {
				cars.setEntryHint(null);
				return;
			}

			cars.setEntryHint('Move closer to a car and press E again');
			return;
		}

		cars.setEntryHint(null);

		if (!cars.requestEnter(cars.nearestId)) {
			cars.setEntryHint('Not connected to the lobby');
		}
	}

	const onKeyDown = (event: KeyboardEvent) => {
		if (!sceneState.inGlobal) return;
		if (isEditableTarget(event.target) || chat.isOpen) return;

		pressed.add(event.code);

		if (event.repeat) return;

		if (event.code === 'KeyE') {
			// NPCs, cats, checkpoints and other overlays own the E key while
			// on foot. This listener is mounted inside the Canvas, so it runs
			// before the HTML prompts: swallowing the event here would block
			// their handlers. Driving always keeps E for exiting the car.
			if (
				!cars.isDriving &&
				!balloon.isOccupant &&
				!ride.isRiding &&
				(npcs.canInteract ||
					npcs.dialogOpen ||
					checkpoints.active !== null ||
					missions.nearestCatId !== null)
			) {
				return;
			}

			event.preventDefault();
			toggleCar();
			return;
		}

		if (event.code === 'KeyR' && cars.isDriving) {
			event.preventDefault();
			cars.requestFlip();
			return;
		}

		if (event.code === 'KeyF' && balloon.isOccupant) {
			event.preventDefault();
			balloon.fireCannon();
			return;
		}

		if (event.code === 'KeyV' && balloon.isOccupant) {
			// 1ª persona → torreta → 3ª persona.
			event.preventDefault();
			balloon.cycleView();
			return;
		}

		if (event.code === 'KeyQ' && balloon.isOccupant) {
			// Cambia de asiento sin bajarse: piloto ⇄ cañones laterales.
			if (balloon.nextSeat) {
				event.preventDefault();
				balloon.requestSwitchSeat();
			}

			return;
		}

		if (
			(cars.isDriving || balloon.isOccupant || ride.isRiding) &&
			(event.code === 'Space' || event.code.startsWith('Arrow'))
		) {
			event.preventDefault();
		}
	};

	const onKeyUp = (event: KeyboardEvent) => {
		if (isEditableTarget(event.target)) return;
		pressed.delete(event.code);
	};

	const onBlur = () => {
		pressed.clear();
		carInput.reset();
		balloonInput.reset();
	};

	$effect(() => {
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', onBlur);

		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onBlur);
			carInput.reset();
			balloonInput.reset();
		};
	});

	// Entering or exiting clears the player intents so that no
	// jump or clip is left pending from on-foot mode.
	let wasDriving = false;

	$effect(() => {
		const driving = cars.isDriving || balloon.isOccupant || ride.isRiding;

		if (driving === wasDriving) return;

		wasDriving = driving;
		pressed.clear();
		carInput.reset();
		balloonInput.reset();
		playerInput.reset();
		resetPlayerIntent();
	});

	useTask(() => {
		cars.updateNearest(playerState.x, playerState.z);
		balloon.updateNearest(playerState.x, playerState.y, playerState.z);

		if (!cars.isDriving && !balloon.isOccupant && !ride.isRiding) {
			if (carInput.touchActive) {
				carInput.clearTouch();
			} else {
				carInput.reset();
			}

			balloonInput.reset();

			return;
		}

		// Los artilleros no pilotan ni mueven el globo: solo apuntan con la
		// cámara y disparan.
		if (balloon.isGunner) {
			balloonInput.reset();
			carInput.reset();
			return;
		}

		if (balloon.isDriving) {
			// Space asciende y Shift desciende; el resto es igual que el coche.
			// Los botones táctiles tienen prioridad mientras estén pulsados.
			if (!balloonInput.touchActive) {
				balloonInput.lift =
					(pressed.has('Space') ? 1 : 0) -
					(pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? 1 : 0);
			}
		} else {
			balloonInput.reset();
		}

		// The touch stick writes directly to `carInput`.
		if (carInput.touchActive) return;

		const forward = pressed.has('KeyW') || pressed.has('ArrowUp');
		const back = pressed.has('KeyS') || pressed.has('ArrowDown');
		const left = pressed.has('KeyA') || pressed.has('ArrowLeft');
		const right = pressed.has('KeyD') || pressed.has('ArrowRight');

		carInput.throttle = (forward ? 1 : 0) - (back ? 1 : 0);
		carInput.steering = (right ? 1 : 0) - (left ? 1 : 0);
		carInput.brake = false;
		carInput.handbrake = (cars.isDriving || ride.isRiding) && pressed.has('Space');
	});
</script>
