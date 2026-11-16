<script lang="ts">
	import Bomb from '@lucide/svelte/icons/bomb';
	import Car from '@lucide/svelte/icons/car';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronsDown from '@lucide/svelte/icons/chevrons-down';
	import ChevronsUp from '@lucide/svelte/icons/chevrons-up';
	import CircleStop from '@lucide/svelte/icons/circle-stop';
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import Eye from '@lucide/svelte/icons/eye';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Package from '@lucide/svelte/icons/package';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Scroll from '@lucide/svelte/icons/scroll';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Zap from '@lucide/svelte/icons/zap';
	import { onMount } from 'svelte';
	import { carInput } from '../../state/carInput';
	import { balloon } from '../../state/balloon.svelte';
	import { balloonInput } from '../../state/balloonInput';
	import { cars } from '../../state/cars.svelte';
	import { chat } from '../../state/chat.svelte';
	import { dmHud } from '../../state/dmHud.svelte';
	import { dmInput } from '../../state/dmInput';
	import { lobby } from '../../state/lobby.svelte';
	import { paperRolls } from '../../state/paperRolls.svelte';
	import { playerInput } from '../../state/playerInput';
	import { playerState } from '../../state/playerState';
	import { raceInput } from '../../state/raceInput';
	import { race } from '../../state/race.svelte';
	import { ride } from '../../state/ride.svelte';
	import { roadmapCar } from '../../state/roadmapCar.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleInput } from '../../state/royaleInput';
	import { royaleVehicles } from '../../state/royaleVehicles.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import { waveInput } from '../../state/waveInput';

	const DEAD_ZONE = 0.16;
	const KNOB_HALF_SIZE = 28;

	// Barn Siege (`minigame-5`): show arena-specific buttons.
	const inWavesCar = $derived(sceneState.inWaves && minigame5.isDriving);

	let visible = $state(false);
	let running = $state(false);
	let jumpPulse = $state(false);
	let rollPulse = $state(false);
	let stickPointerId = $state<number | null>(null);
	let knobX = $state(0);
	let knobY = $state(0);
	let stickBase = $state<HTMLDivElement>();
	let jumpTimer: ReturnType<typeof setTimeout> | undefined;
	let rollTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		const coarsePointer = window.matchMedia('(any-pointer: coarse), (pointer: coarse)');
		const forceTouch = new URLSearchParams(window.location.search).get('touch') === '1';

		const updateVisibility = () => {
			visible = forceTouch || navigator.maxTouchPoints > 0 || coarsePointer.matches;
		};

		const onWindowBlur = () => {
			resetStick();
			stopRun();
			playerInput.reset();
			raceInput.reset();
			balloonInput.reset();
			dmInput.fireHeld = false;
		};

		const onVisibilityChange = () => {
			if (document.hidden) {
				onWindowBlur();
			}
		};

		updateVisibility();
		coarsePointer.addEventListener('change', updateVisibility);
		window.addEventListener('blur', onWindowBlur);
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			coarsePointer.removeEventListener('change', updateVisibility);
			window.removeEventListener('blur', onWindowBlur);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			clearTimeout(jumpTimer);
			clearTimeout(rollTimer);
			playerInput.reset();
		};
	});

	// Marks the document so other HUDs (e.g. the checkpoint prompt) know
	// there are visible touch controls and don't overlap them.
	$effect(() => {
		document.documentElement.classList.toggle('touch-controls-active', visible);

		return () => document.documentElement.classList.remove('touch-controls-active');
	});

	// When you start driving, the walking stick disappears: its pointer is released
	// so it isn't captured and doesn't send player input.
	$effect(() => {
		if (
			cars.isDriving ||
			balloon.isOccupant ||
			ride.isRiding ||
			race.inCar ||
			sceneState.inRoadmap
		) {
			resetStick();
		}
	});

	// Opening the chat hides the controls to make room for the keyboard and
	// releases stick/run so no movement is left over.
	$effect(() => {
		if (chat.isOpen) {
			resetStick();
			stopRun();
		}
	});

	function updateStick(event: PointerEvent): void {
		if (!stickBase) {
			return;
		}

		const rect = stickBase.getBoundingClientRect();
		const radius = rect.width / 2;
		const maxTravel = Math.max(1, radius - KNOB_HALF_SIZE);
		const centerX = rect.left + radius;
		const centerY = rect.top + radius;

		let dx = event.clientX - centerX;
		let dy = event.clientY - centerY;
		const distance = Math.hypot(dx, dy);

		if (distance > maxTravel) {
			dx = (dx / distance) * maxTravel;
			dy = (dy / distance) * maxTravel;
		}

		knobX = dx;
		knobY = dy;

		const nx = dx / maxTravel;
		const ny = dy / maxTravel;
		const magnitude = Math.hypot(nx, ny);

		if (magnitude < DEAD_ZONE) {
			playerInput.setMove(0, 0);

			if (
				cars.isDriving ||
				balloon.isOccupant ||
				ride.isRiding ||
				sceneState.inRoadmap ||
				inWavesCar ||
				minigame8.isDriving
			) {
				carInput.setTouch(0, 0);
			}

			return;
		}

		// Rescales the dead zone so the stick is smooth from the first usable pixel.
		const strength = Math.min(1, (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE));

		if (
			cars.isDriving ||
			balloon.isOccupant ||
			ride.isRiding ||
			sceneState.inRoadmap ||
			inWavesCar ||
			minigame8.isDriving
		) {
			// Stick up = accelerate; left/right = steer.
			carInput.setTouch(-(ny / magnitude) * strength, (nx / magnitude) * strength);
			playerInput.setMove(0, 0);
			return;
		}

		playerInput.setMove((nx / magnitude) * strength, (ny / magnitude) * strength);
	}

	function startStick(event: PointerEvent): void {
		if (stickPointerId !== null) {
			return;
		}

		event.preventDefault();
		stickPointerId = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		updateStick(event);
	}

	function moveStick(event: PointerEvent): void {
		if (event.pointerId !== stickPointerId) {
			return;
		}

		event.preventDefault();
		updateStick(event);
	}

	function resetStick(): void {
		stickPointerId = null;
		knobX = 0;
		knobY = 0;
		playerInput.setMove(0, 0);
		carInput.clearTouch();
		balloonInput.clearTouch();
	}

	function finishStick(event: PointerEvent): void {
		if (event.pointerId !== stickPointerId) {
			return;
		}

		const target = event.currentTarget as HTMLElement;

		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}

		resetStick();
	}

	function startRun(event: PointerEvent): void {
		event.preventDefault();

		if (cars.isDriving || balloon.isOccupant || ride.isRiding || sceneState.inRoadmap || inWavesCar)
			return;

		running = true;
		playerInput.setRun(true);
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function stopRun(event?: PointerEvent): void {
		if (event) {
			const target = event.currentTarget as HTMLElement;

			if (target.hasPointerCapture(event.pointerId)) {
				target.releasePointerCapture(event.pointerId);
			}
		}

		running = false;
		playerInput.setRun(false);
	}

	function requestJump(event?: Event): void {
		event?.preventDefault();

		if (cars.isDriving || balloon.isOccupant || ride.isRiding || sceneState.inRoadmap || inWavesCar)
			return;

		playerInput.requestJump();
		jumpPulse = true;
		clearTimeout(jumpTimer);
		jumpTimer = setTimeout(() => {
			jumpPulse = false;
		}, 140);
	}

	function toggleCar(event?: Event): void {
		event?.preventDefault();

		if (sceneState.inWaves) {
			if (minigame5.isDriving) {
				minigame5.carExit();
			} else {
				minigame5.carEnter();
			}
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
			balloon.requestEnter();
			return;
		}

		if (cars.nearestId) {
			cars.requestEnter(cars.nearestId);
			return;
		}

		ride.mount();
	}

	/** Driving buttons: they stay pressed until you lift your finger. */
	function pressTouch(event: PointerEvent, apply: () => void): void {
		event.preventDefault();

		try {
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		} catch {
			// Pointer already released: the button still works with pointerup/cancel.
		}

		apply();
	}

	function releaseTouch(event: PointerEvent, clear: () => void): void {
		const target = event.currentTarget as HTMLElement;

		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}

		clear();
	}

	function throwPaperRoll(event?: Event): void {
		event?.preventDefault();

		if (
			cars.isDriving ||
			balloon.isOccupant ||
			ride.isRiding ||
			sceneState.inWaves ||
			sceneState.inDeathmatch
		)
			return;

		if (!paperRolls.throwRoll()) {
			return;
		}

		rollPulse = true;
		clearTimeout(rollTimer);
		rollTimer = setTimeout(() => {
			rollPulse = false;
		}, 160);
	}

	function fireCannon(event?: Event): void {
		event?.preventDefault();

		if (!balloon.isOccupant) return;

		balloon.fireCannon();
	}

	function royaleJump(event?: Event): void {
		event?.preventDefault();

		if (!minigame8.canJump) return;

		minigame8.sendJump();
	}

	function royaleDeploy(event?: Event): void {
		event?.preventDefault();
		royaleInput.requestDeploy();
	}

	function royaleSlot(event: Event, slot: number): void {
		event.preventDefault();

		if (!minigame8.isAlive) return;

		royaleInput.requestEquip(slot);
	}
</script>

{#if visible}
	<div
		class="mobile-controls pointer-events-none absolute inset-0 z-40 select-none"
		role="group"
		aria-label="Touch controls"
		oncontextmenu={(event) => event.preventDefault()}
	>
		{#if race.inCar}
			<!-- Race steering (left) -->
			<div
				class="pointer-events-auto absolute flex items-end gap-3"
				style="left: max(1rem, env(safe-area-inset-left)); bottom: max(1rem, env(safe-area-inset-bottom));"
				role="group"
				aria-label="Race steering"
			>
				<button
					type="button"
					aria-label="Turn left"
					class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/20 bg-slate-950/55 text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
					onpointerdown={(event) => pressTouch(event, () => raceInput.setTouchSteering(-1))}
					onpointerup={(event) => releaseTouch(event, () => raceInput.setTouchSteering(0))}
					onpointercancel={(event) => releaseTouch(event, () => raceInput.setTouchSteering(0))}
					onlostpointercapture={() => raceInput.setTouchSteering(0)}
				>
					<ChevronLeft size={30} strokeWidth={2.4} aria-hidden="true" />
					<span class="text-[10px] font-semibold tracking-wide uppercase">Left</span>
				</button>

				<button
					type="button"
					aria-label="Turn right"
					class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/20 bg-slate-950/55 text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
					onpointerdown={(event) => pressTouch(event, () => raceInput.setTouchSteering(1))}
					onpointerup={(event) => releaseTouch(event, () => raceInput.setTouchSteering(0))}
					onpointercancel={(event) => releaseTouch(event, () => raceInput.setTouchSteering(0))}
					onlostpointercapture={() => raceInput.setTouchSteering(0)}
				>
					<ChevronRight size={30} strokeWidth={2.4} aria-hidden="true" />
					<span class="text-[10px] font-semibold tracking-wide uppercase">Right</span>
				</button>
			</div>

			<!-- Race pedals and actions (right) -->
			<div
				class="pointer-events-auto absolute flex items-end gap-3"
				style="right: max(1rem, env(safe-area-inset-right)); bottom: max(1rem, env(safe-area-inset-bottom));"
				role="group"
				aria-label="Race controls"
			>
				<div class="flex flex-col gap-2">
					<button
						type="button"
						aria-label="Accelerate"
						class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-emerald-200/60 bg-emerald-400/85 text-[10px] font-semibold tracking-wide text-emerald-950 uppercase shadow-lg shadow-emerald-500/30 backdrop-blur-md transition duration-75 active:scale-95"
						onpointerdown={(event) => pressTouch(event, () => raceInput.setTouchThrottle(1))}
						onpointerup={(event) => releaseTouch(event, () => raceInput.setTouchThrottle(0))}
						onpointercancel={(event) => releaseTouch(event, () => raceInput.setTouchThrottle(0))}
						onlostpointercapture={() => raceInput.setTouchThrottle(0)}
					>
						<ChevronsUp size={26} strokeWidth={2.4} aria-hidden="true" />
						<span>Accelerate</span>
					</button>

					<div class="flex gap-2">
						<button
							type="button"
							aria-label="Brake"
							class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-amber-200/60 bg-amber-400/85 text-[10px] font-semibold tracking-wide text-amber-950 uppercase shadow-lg shadow-amber-500/30 backdrop-blur-md transition duration-75 active:scale-95"
							onpointerdown={(event) => pressTouch(event, () => raceInput.setTouchBrake(true))}
							onpointerup={(event) => releaseTouch(event, () => raceInput.setTouchBrake(false))}
							onpointercancel={(event) => releaseTouch(event, () => raceInput.setTouchBrake(false))}
							onlostpointercapture={() => raceInput.setTouchBrake(false)}
						>
							<CircleStop size={22} strokeWidth={2.4} aria-hidden="true" />
							<span>Brake</span>
						</button>

						<button
							type="button"
							aria-label="Reverse"
							class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[10px] font-semibold tracking-wide text-slate-100 uppercase shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
							onpointerdown={(event) => pressTouch(event, () => raceInput.setTouchThrottle(-1))}
							onpointerup={(event) => releaseTouch(event, () => raceInput.setTouchThrottle(0))}
							onpointercancel={(event) => releaseTouch(event, () => raceInput.setTouchThrottle(0))}
							onlostpointercapture={() => raceInput.setTouchThrottle(0)}
						>
							<ChevronsDown size={22} strokeWidth={2.4} aria-hidden="true" />
							<span>Reverse</span>
						</button>
					</div>
				</div>

				<div class="flex flex-col gap-2">
					<button
						type="button"
						aria-label="Use item"
						class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-sky-200/60 bg-sky-400/85 text-[9px] font-semibold tracking-wide text-sky-950 uppercase shadow-lg shadow-sky-500/30 backdrop-blur-md transition duration-75 active:scale-95"
						onpointerdown={(event) => {
							event.preventDefault();
							race.useItem();
						}}
					>
						<Package size={18} strokeWidth={2.4} aria-hidden="true" />
						<span>Item</span>
					</button>

					<button
						type="button"
						aria-label="Reset the car"
						class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
						onpointerdown={(event) => {
							event.preventDefault();
							race.requestReset();
						}}
					>
						<RotateCcw size={18} strokeWidth={2.4} aria-hidden="true" />
						<span>Reset</span>
					</button>

					<button
						type="button"
						aria-label="Leave the Grand Prix"
						class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-400/85 text-[9px] font-semibold tracking-wide text-rose-950 uppercase shadow-lg shadow-rose-500/30 backdrop-blur-md transition duration-75 active:scale-95"
						onpointerdown={(event) => {
							event.preventDefault();
							lobby.leaveLobby();
						}}
					>
						<LogOut size={18} strokeWidth={2.4} aria-hidden="true" />
						<span>Exit</span>
					</button>
				</div>
			</div>
		{:else if cars.isDriving || balloon.isOccupant || ride.isRiding || sceneState.inRoadmap || inWavesCar}
			<!-- Car steering (left) -->
			<div
				class="pointer-events-auto absolute flex items-end gap-3"
				style="left: max(1rem, env(safe-area-inset-left)); bottom: max(1rem, env(safe-area-inset-bottom));"
				role="group"
				aria-label="Car steering"
			>
				<button
					type="button"
					aria-label="Turn left"
					class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/20 bg-slate-950/55 text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
					onpointerdown={(event) => pressTouch(event, () => carInput.setTouchSteering(-1))}
					onpointerup={(event) => releaseTouch(event, () => carInput.setTouchSteering(0))}
					onpointercancel={(event) => releaseTouch(event, () => carInput.setTouchSteering(0))}
					onlostpointercapture={() => carInput.setTouchSteering(0)}
				>
					<ChevronLeft size={30} strokeWidth={2.4} aria-hidden="true" />
					<span class="text-[10px] font-semibold tracking-wide uppercase">Left</span>
				</button>

				<button
					type="button"
					aria-label="Turn right"
					class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/20 bg-slate-950/55 text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
					onpointerdown={(event) => pressTouch(event, () => carInput.setTouchSteering(1))}
					onpointerup={(event) => releaseTouch(event, () => carInput.setTouchSteering(0))}
					onpointercancel={(event) => releaseTouch(event, () => carInput.setTouchSteering(0))}
					onlostpointercapture={() => carInput.setTouchSteering(0)}
				>
					<ChevronRight size={30} strokeWidth={2.4} aria-hidden="true" />
					<span class="text-[10px] font-semibold tracking-wide uppercase">Right</span>
				</button>
			</div>

			<!-- Pedals and exit (right) -->
			<div
				class="pointer-events-auto absolute flex items-end gap-3"
				style="right: max(1rem, env(safe-area-inset-right)); bottom: max(1rem, env(safe-area-inset-bottom));"
				role="group"
				aria-label="Car pedals"
			>
				<div class="flex flex-col gap-2">
					<button
						type="button"
						aria-label="Accelerate"
						class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-emerald-200/60 bg-emerald-400/85 text-[10px] font-semibold tracking-wide text-emerald-950 uppercase shadow-lg shadow-emerald-500/30 backdrop-blur-md transition duration-75 active:scale-95"
						onpointerdown={(event) => pressTouch(event, () => carInput.setTouchThrottle(1))}
						onpointerup={(event) => releaseTouch(event, () => carInput.setTouchThrottle(0))}
						onpointercancel={(event) => releaseTouch(event, () => carInput.setTouchThrottle(0))}
						onlostpointercapture={() => carInput.setTouchThrottle(0)}
					>
						<ChevronsUp size={26} strokeWidth={2.4} aria-hidden="true" />
						<span>Accelerate</span>
					</button>

					<div class="flex gap-2">
						<button
							type="button"
							aria-label="Brake"
							class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-amber-200/60 bg-amber-400/85 text-[10px] font-semibold tracking-wide text-amber-950 uppercase shadow-lg shadow-amber-500/30 backdrop-blur-md transition duration-75 active:scale-95"
							onpointerdown={(event) => pressTouch(event, () => carInput.setTouchBrake(true))}
							onpointerup={(event) => releaseTouch(event, () => carInput.setTouchBrake(false))}
							onpointercancel={(event) => releaseTouch(event, () => carInput.setTouchBrake(false))}
							onlostpointercapture={() => carInput.setTouchBrake(false)}
						>
							<CircleStop size={22} strokeWidth={2.4} aria-hidden="true" />
							<span>Brake</span>
						</button>

						<button
							type="button"
							aria-label="Reverse"
							class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[10px] font-semibold tracking-wide text-slate-100 uppercase shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
							onpointerdown={(event) => pressTouch(event, () => carInput.setTouchThrottle(-1))}
							onpointerup={(event) => releaseTouch(event, () => carInput.setTouchThrottle(0))}
							onpointercancel={(event) => releaseTouch(event, () => carInput.setTouchThrottle(0))}
							onlostpointercapture={() => carInput.setTouchThrottle(0)}
						>
							<ChevronsDown size={22} strokeWidth={2.4} aria-hidden="true" />
							<span>Reverse</span>
						</button>
					</div>
				</div>

				<div class="flex flex-col items-center gap-2">
					{#if balloon.isDriving}
						<div class="flex gap-2">
							<button
								type="button"
								aria-label="Ascend"
								class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-sky-200/60 bg-sky-400/85 text-[9px] font-semibold tracking-wide text-sky-950 uppercase shadow-lg backdrop-blur-md transition duration-75 active:scale-95"
								onpointerdown={(event) => pressTouch(event, () => balloonInput.setTouchLift(1))}
								onpointerup={(event) => releaseTouch(event, () => balloonInput.clearTouch())}
								onpointercancel={(event) => releaseTouch(event, () => balloonInput.clearTouch())}
								onlostpointercapture={() => balloonInput.clearTouch()}
							>
								<ChevronsUp size={18} strokeWidth={2.4} aria-hidden="true" />
								<span>Up</span>
							</button>

							<button
								type="button"
								aria-label="Descend"
								class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
								onpointerdown={(event) => pressTouch(event, () => balloonInput.setTouchLift(-1))}
								onpointerup={(event) => releaseTouch(event, () => balloonInput.clearTouch())}
								onpointercancel={(event) => releaseTouch(event, () => balloonInput.clearTouch())}
								onlostpointercapture={() => balloonInput.clearTouch()}
							>
								<ChevronsDown size={18} strokeWidth={2.4} aria-hidden="true" />
								<span>Down</span>
							</button>
						</div>
					{/if}

					{#if balloon.isOccupant}
						<button
							type="button"
							aria-label="Switch balloon camera view"
							class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
							onpointerdown={(event) => {
								event.preventDefault();
								balloon.cycleView();
							}}
						>
							<Eye size={18} strokeWidth={2.4} aria-hidden="true" />
							<span>View</span>
						</button>

						{#if balloon.nextSeat}
							<button
								type="button"
								aria-label="Switch balloon seat"
								class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
								onpointerdown={(event) => {
									event.preventDefault();
									balloon.requestSwitchSeat();
								}}
							>
								<ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
								<span>Seat</span>
							</button>
						{/if}

						<button
							type="button"
							aria-label="Fire the paper cannon"
							class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-amber-200/60 bg-amber-400/85 text-[9px] font-semibold tracking-wide text-amber-950 uppercase shadow-lg shadow-amber-500/30 backdrop-blur-md transition duration-75 active:scale-95"
							onpointerdown={fireCannon}
						>
							<Crosshair size={18} strokeWidth={2.4} aria-hidden="true" />
							<span>Fire</span>
						</button>
					{/if}

					{#if cars.isDriving && !sceneState.inRoadmap}
						<button
							type="button"
							aria-label="Flip the car"
							class="touch-control flex h-14 w-14 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
							onpointerdown={(event) => {
								event.preventDefault();
								cars.requestFlip();
							}}
						>
							<RotateCcw size={18} strokeWidth={2.4} aria-hidden="true" />
							<span>Flip</span>
						</button>
					{/if}

					<button
						type="button"
						aria-label={sceneState.inRoadmap ? 'Reset the car' : 'Exit the car'}
						class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-400/85 text-[10px] font-semibold tracking-wide text-rose-950 uppercase shadow-lg shadow-rose-500/30 backdrop-blur-md transition duration-75 active:scale-95"
						onpointerdown={(event) => {
							event.preventDefault();

							if (sceneState.inRoadmap) {
								roadmapCar.requestReset();
								return;
							}

							toggleCar();
						}}
					>
						<Car size={20} strokeWidth={2.4} aria-hidden="true" />
						<span>{sceneState.inRoadmap ? 'Reset' : 'Exit'}</span>
					</button>
				</div>
			</div>
		{:else}
			<!-- Analog stick (left) -->
			<div
				bind:this={stickBase}
				class="touch-control pointer-events-auto absolute h-32 w-32 touch-none rounded-full border border-white/15 bg-slate-950/40 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
				style="left: max(1rem, env(safe-area-inset-left)); bottom: max(1rem, env(safe-area-inset-bottom));"
				role="presentation"
				onpointerdown={startStick}
				onpointermove={moveStick}
				onpointerup={finishStick}
				onpointercancel={finishStick}
				onlostpointercapture={resetStick}
			>
				<div class="pointer-events-none absolute inset-2 rounded-full border border-white/10"></div>
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<span class="h-px w-20 bg-white/10"></span>
					<span class="absolute h-20 w-px bg-white/10"></span>
				</div>

				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div
						class="h-14 w-14 rounded-full border border-emerald-200/50 bg-emerald-400/85 shadow-lg shadow-emerald-500/40 transition-transform duration-75 ease-out will-change-transform"
						style:transform={`translate3d(${knobX}px, ${knobY}px, 0)`}
					></div>
				</div>
			</div>

			<!-- Actions (right) -->
			<div
				class="pointer-events-auto absolute flex items-end gap-2"
				style="right: max(1rem, env(safe-area-inset-right)); bottom: max(1rem, env(safe-area-inset-bottom));"
			>
				{#if sceneState.inRoyale}
					{#if minigame8.phase === 'playing' && minigame8.isAlive && royaleInput.mode === 'riding'}
						<button
							type="button"
							aria-label="Jump from the zeppelin"
							disabled={!minigame8.canJump}
							class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-sky-200/60 bg-sky-400/85 text-[10px] font-semibold tracking-wide text-sky-950 uppercase shadow-lg shadow-sky-500/30 backdrop-blur-md transition duration-75 active:scale-95 disabled:opacity-45"
							onpointerdown={royaleJump}
						>
							<ChevronsUp size={26} strokeWidth={2.4} aria-hidden="true" />
							<span>Jump</span>
						</button>
					{:else if minigame8.phase === 'playing' && minigame8.isAlive && (royaleInput.mode === 'skydive' || royaleInput.mode === 'glide')}
						<button
							type="button"
							aria-label="Open the glider"
							class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-emerald-200/60 bg-emerald-400/85 text-[10px] font-semibold tracking-wide text-emerald-950 uppercase shadow-lg shadow-emerald-500/30 backdrop-blur-md transition duration-75 active:scale-95"
							onpointerdown={royaleDeploy}
						>
							<Eye size={26} strokeWidth={2.4} aria-hidden="true" />
							<span>Glider</span>
						</button>
					{:else if minigame8.phase === 'playing' && minigame8.isAlive && minigame8.isDriving}
						<div class="flex flex-col items-end gap-2">
							{#if minigame8.drivingKind === 'balloon'}
								<div class="flex gap-2">
									<button
										type="button"
										aria-label="Ascend the balloon"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-sky-200/60 bg-sky-400/85 text-[10px] font-semibold tracking-wide text-sky-950 uppercase shadow-lg shadow-sky-500/30 backdrop-blur-md transition duration-75 active:scale-95"
										onpointerdown={(event) => {
											event.preventDefault();
											royaleInput.lift = 1;
										}}
										onpointerup={() => {
											royaleInput.lift = 0;
										}}
										onpointercancel={() => {
											royaleInput.lift = 0;
										}}
										onlostpointercapture={() => {
											royaleInput.lift = 0;
										}}
									>
										<ChevronsUp size={22} strokeWidth={2.4} aria-hidden="true" />
										<span>Rise</span>
									</button>
									<button
										type="button"
										aria-label="Descend the balloon"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[10px] font-semibold tracking-wide text-slate-100 uppercase shadow-lg backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
										onpointerdown={(event) => {
											event.preventDefault();
											royaleInput.lift = -1;
										}}
										onpointerup={() => {
											royaleInput.lift = 0;
										}}
										onpointercancel={() => {
											royaleInput.lift = 0;
										}}
										onlostpointercapture={() => {
											royaleInput.lift = 0;
										}}
									>
										<ChevronsDown size={22} strokeWidth={2.4} aria-hidden="true" />
										<span>Down</span>
									</button>
									<button
										type="button"
										aria-label="Switch balloon camera view"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[10px] font-semibold tracking-wide text-slate-100 uppercase shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
										onpointerdown={(event) => {
											event.preventDefault();
											royaleVehicles.toggleBalloonView();
										}}
									>
										<Eye size={22} strokeWidth={2.4} aria-hidden="true" />
										<span>View</span>
									</button>
								</div>
							{/if}

							<div class="flex items-end gap-2">
								<button
									type="button"
									aria-label="Fire"
									class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-500/85 text-[10px] font-semibold tracking-wide text-rose-50 uppercase shadow-lg shadow-rose-500/40 backdrop-blur-md transition duration-75 active:scale-95 active:bg-rose-400"
									onpointerdown={(event) => {
										event.preventDefault();
										try {
											(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
										} catch {
											// Pointer already released: up/cancel still clear the flag.
										}
										royaleInput.fireHeld = true;
										royaleInput.requestFire();
									}}
									onpointerup={() => {
										royaleInput.fireHeld = false;
									}}
									onpointercancel={() => {
										royaleInput.fireHeld = false;
									}}
									onlostpointercapture={() => {
										royaleInput.fireHeld = false;
									}}
								>
									<Crosshair size={26} strokeWidth={2.4} aria-hidden="true" />
									<span>Fire</span>
								</button>

								<div class="flex flex-col gap-2">
									<button
										type="button"
										aria-label="Throw grenade"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-lime-200/60 bg-lime-500/85 text-[9px] font-semibold tracking-wide text-lime-950 uppercase shadow-lg shadow-lime-500/30 backdrop-blur-md transition duration-75 active:scale-95"
										onpointerdown={(event) => {
											event.preventDefault();
											royaleInput.requestGrenade();
										}}
									>
										<Bomb size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Grenade</span>
									</button>

									<!-- En el globo o el coche no hay teclado: sin este botón
									no se puede recargar mientras se pilota. -->
									<button
										type="button"
										aria-label="Reload"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
										onpointerdown={(event) => {
											event.preventDefault();
											royaleInput.requestReload();
										}}
									>
										<RotateCcw size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Reload</span>
									</button>
								</div>
							</div>

							<button
								type="button"
								aria-label="Exit the vehicle"
								class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-400/85 text-[10px] font-semibold tracking-wide text-rose-950 uppercase shadow-lg shadow-rose-500/30 backdrop-blur-md transition duration-75 active:scale-95"
								onpointerdown={(event) => {
									event.preventDefault();
									royaleVehicles.exit();
								}}
							>
								<Car size={26} strokeWidth={2.4} aria-hidden="true" />
								<span>Exit</span>
							</button>
						</div>
					{:else if minigame8.phase === 'playing' && minigame8.isAlive}
						<div class="flex flex-col items-end gap-2">
							{#if royaleVehicles.nearby}
								<button
									type="button"
									aria-label={royaleVehicles.nearby.kind === 'balloon'
										? 'Pilot the nearby balloon'
										: 'Drive the nearby car'}
									class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 self-end rounded-full border border-emerald-200/60 bg-emerald-400/85 text-[10px] font-semibold tracking-wide text-emerald-950 uppercase shadow-lg shadow-emerald-500/30 backdrop-blur-md transition duration-75 active:scale-95"
									onpointerdown={(event) => {
										event.preventDefault();
										royaleVehicles.enter();
									}}
								>
									<Car size={20} strokeWidth={2.4} aria-hidden="true" />
									<span>{royaleVehicles.nearby.kind === 'balloon' ? 'Fly' : 'Drive'}</span>
								</button>
							{/if}

							<div class="grid grid-cols-2 gap-1.5">
								{#each [1, 2, 3, 4] as slot (slot)}
									<button
										type="button"
										aria-label={`Equip slot ${slot}`}
										class="touch-control flex h-12 w-12 touch-none items-center justify-center rounded-xl border border-white/15 bg-slate-950/55 text-sm font-black text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
										onpointerdown={(event) => royaleSlot(event, slot)}
									>
										{slot}
									</button>
								{/each}
							</div>

							<div class="flex items-end gap-2">
								<button
									type="button"
									aria-label="Fire"
									class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-500/85 text-[10px] font-semibold tracking-wide text-rose-50 uppercase shadow-lg shadow-rose-500/40 backdrop-blur-md transition duration-75 active:scale-95 active:bg-rose-400"
									onpointerdown={(event) => {
										event.preventDefault();
										try {
											(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
										} catch {
											// Pointer already released: up/cancel still clear the flag.
										}
										royaleInput.fireHeld = true;
										royaleInput.requestFire();
									}}
									onpointerup={() => {
										royaleInput.fireHeld = false;
									}}
									onpointercancel={() => {
										royaleInput.fireHeld = false;
									}}
									onlostpointercapture={() => {
										royaleInput.fireHeld = false;
									}}
								>
									<Crosshair size={26} strokeWidth={2.4} aria-hidden="true" />
									<span>Fire</span>
								</button>

								<div class="flex flex-col gap-2">
									<button
										type="button"
										aria-label="Throw grenade"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-lime-200/60 bg-lime-500/85 text-[9px] font-semibold tracking-wide text-lime-950 uppercase shadow-lg shadow-lime-500/30 backdrop-blur-md transition duration-75 active:scale-95"
										onpointerdown={(event) => {
											event.preventDefault();
											royaleInput.requestGrenade();
										}}
									>
										<Bomb size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Grenade</span>
									</button>

									<button
										type="button"
										aria-label="Reload"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
										onpointerdown={(event) => {
											event.preventDefault();
											royaleInput.requestReload();
										}}
									>
										<RotateCcw size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Reload</span>
									</button>
								</div>
							</div>
						</div>
					{/if}

					<button
						type="button"
						aria-label="Leave Skyfall Royale"
						class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-400/85 text-[10px] font-semibold tracking-wide text-rose-950 uppercase shadow-lg shadow-rose-500/30 backdrop-blur-md transition duration-75 active:scale-95"
						onpointerdown={(event) => {
							event.preventDefault();
							lobby.leaveLobby();
						}}
					>
						<LogOut size={20} strokeWidth={2.4} aria-hidden="true" />
						<span>Exit</span>
					</button>
				{:else}
					{#if !sceneState.inDeathmatch && (cars.isDriving || balloon.isOccupant || ride.isRiding || balloon.nearest || cars.nearestAvailable || ride.canRide || (sceneState.inWaves && !minigame5.snapshot?.car.destroyed))}
						<button
							type="button"
							aria-label={cars.isDriving || balloon.isOccupant || ride.isRiding
								? 'Exit the vehicle'
								: balloon.nearest
									? 'Pilot the nearby balloon'
									: cars.nearestAvailable
										? 'Drive the nearby car'
										: 'Ride the equipped NFT vehicle'}
							class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border text-[10px] font-semibold tracking-wide text-slate-100 uppercase backdrop-blur-md transition duration-75 active:scale-95 {cars.isDriving ||
							balloon.isOccupant ||
							ride.isRiding
								? 'border-rose-200/60 bg-rose-400/85 text-rose-950 shadow-lg shadow-rose-500/30'
								: 'border-emerald-200/60 bg-emerald-400/85 text-emerald-950 shadow-lg shadow-emerald-500/30'}"
							onpointerdown={toggleCar}
						>
							<Car size={20} strokeWidth={2.4} aria-hidden="true" />
							<span
								>{cars.isDriving || balloon.isOccupant || ride.isRiding
									? 'Exit'
									: balloon.nearest
										? 'Fly'
										: cars.nearestAvailable
											? 'Drive'
											: 'Ride'}</span
							>
						</button>
					{/if}

					{#if !cars.isDriving && !balloon.isOccupant && !ride.isRiding}
						<div class="flex flex-col gap-2">
							{#if sceneState.inWaves}
								<button
									type="button"
									aria-label="Fire"
									class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-500/85 text-[10px] font-semibold tracking-wide text-rose-50 uppercase shadow-lg shadow-rose-500/40 backdrop-blur-md transition duration-75 active:scale-95 active:bg-rose-400"
									onpointerdown={(event) => {
										event.preventDefault();
										try {
											(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
										} catch {
											// El puntero ya se soltó; igualmente funciona con up/cancel.
										}
										waveInput.fireHeld = true;
										waveInput.requestFire();
									}}
									onpointerup={() => {
										waveInput.fireHeld = false;
									}}
									onpointercancel={() => {
										waveInput.fireHeld = false;
									}}
									onlostpointercapture={() => {
										waveInput.fireHeld = false;
									}}
								>
									<Crosshair size={26} strokeWidth={2.4} aria-hidden="true" />
									<span>Fire</span>
								</button>

								<div class="flex gap-2">
									<button
										type="button"
										aria-label="Throw grenade"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-lime-200/60 bg-lime-500/85 text-[9px] font-semibold tracking-wide text-lime-950 uppercase shadow-lg shadow-lime-500/30 backdrop-blur-md transition duration-75 active:scale-95"
										onpointerdown={(event) => {
											event.preventDefault();
											waveInput.requestGrenade();
										}}
									>
										<Bomb size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Grenade</span>
									</button>

									<button
										type="button"
										aria-label="Reload"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
										onpointerdown={(event) => {
											event.preventDefault();
											waveInput.requestReload();
										}}
									>
										<RotateCcw size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Reload</span>
									</button>
								</div>
							{:else if sceneState.inDeathmatch}
								<button
									type="button"
									aria-label="Fire"
									class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-rose-200/60 bg-rose-500/85 text-[10px] font-semibold tracking-wide text-rose-50 uppercase shadow-lg shadow-rose-500/40 backdrop-blur-md transition duration-75 active:scale-95 active:bg-rose-400"
									onpointerdown={(event) => {
										event.preventDefault();
										try {
											(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
										} catch {
											// The pointer was already released; up/cancel still fire.
										}
										dmInput.fireHeld = true;
										dmInput.requestFire();
									}}
									onpointerup={() => {
										dmInput.fireHeld = false;
									}}
									onpointercancel={() => {
										dmInput.fireHeld = false;
									}}
									onlostpointercapture={() => {
										dmInput.fireHeld = false;
									}}
								>
									<Crosshair size={26} strokeWidth={2.4} aria-hidden="true" />
									<span>Fire</span>
								</button>

								<div class="flex gap-2">
									<button
										type="button"
										aria-label="Throw grenade"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-lime-200/60 bg-lime-500/85 text-[9px] font-semibold tracking-wide text-lime-950 uppercase shadow-lg shadow-lime-500/30 backdrop-blur-md transition duration-75 active:scale-95"
										onpointerdown={(event) => {
											event.preventDefault();
											dmInput.requestGrenade();
										}}
									>
										<Bomb size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Grenade</span>
									</button>

									<button
										type="button"
										aria-label="Reload"
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border border-white/15 bg-slate-950/55 text-[9px] font-semibold tracking-wide text-slate-100 uppercase backdrop-blur-md transition duration-75 active:scale-95 active:bg-white/20"
										onpointerdown={(event) => {
											event.preventDefault();
											dmInput.requestReload();
										}}
									>
										<RotateCcw size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Reload</span>
									</button>

									<button
										type="button"
										aria-label={dmHud.top5Visible ? 'Hide the top 5' : 'Show the top 5'}
										aria-pressed={dmHud.top5Visible}
										class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border text-[9px] font-semibold tracking-wide uppercase backdrop-blur-md transition duration-75 active:scale-95 {dmHud.top5Visible
											? 'border-amber-200/60 bg-amber-400/85 text-amber-950 shadow-lg shadow-amber-500/30'
											: 'border-white/15 bg-slate-950/55 text-slate-100 active:bg-white/20'}"
										onpointerdown={(event) => {
											event.preventDefault();
											dmHud.toggleTop5();
										}}
									>
										<Trophy size={20} strokeWidth={2.4} aria-hidden="true" />
										<span>Top 5</span>
									</button>
								</div>
							{:else}
								<button
									type="button"
									aria-label="Throw a paper roll"
									class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border text-[10px] font-semibold tracking-wide text-slate-100 uppercase backdrop-blur-md transition duration-75 active:scale-95 {rollPulse
										? 'border-orange-200/70 bg-orange-400/85 text-orange-950 shadow-lg shadow-orange-500/40'
										: 'border-white/15 bg-slate-950/40 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'}"
									onpointerdown={throwPaperRoll}
								>
									<Scroll size={20} strokeWidth={2.4} aria-hidden="true" />
									<span>Roll</span>
								</button>
							{/if}

							<button
								type="button"
								aria-label="Hold to sprint"
								aria-pressed={running}
								class="touch-control flex h-16 w-16 touch-none flex-col items-center justify-center gap-0.5 rounded-full border text-[10px] font-semibold tracking-wide text-slate-100 uppercase backdrop-blur-md transition duration-75 active:scale-95 {running
									? 'border-amber-200/60 bg-amber-400/80 text-amber-950 shadow-lg shadow-amber-500/30'
									: 'border-white/15 bg-slate-950/40 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'}"
								onpointerdown={startRun}
								onpointerup={stopRun}
								onpointercancel={stopRun}
								onlostpointercapture={stopRun}
							>
								<Zap size={20} strokeWidth={2.4} aria-hidden="true" />
								<span>Sprint</span>
							</button>
						</div>

						<button
							type="button"
							aria-label="Jump"
							class="touch-control flex h-20 w-20 touch-none flex-col items-center justify-center gap-0.5 rounded-full border text-[10px] font-semibold tracking-wide text-slate-100 uppercase backdrop-blur-md transition duration-75 active:scale-95 {jumpPulse
								? 'border-emerald-200/70 bg-emerald-400/85 text-emerald-950 shadow-lg shadow-emerald-500/40'
								: 'border-white/15 bg-slate-950/40 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'}"
							onpointerdown={requestJump}
						>
							<ChevronsUp size={26} strokeWidth={2.4} aria-hidden="true" />
							<span>Jump</span>
						</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.touch-control {
		-webkit-tap-highlight-color: transparent;
		-webkit-touch-callout: none;
		user-select: none;
		-webkit-user-select: none;
	}

	/* While typing, the controls disappear so they don't cover the virtual
	   keyboard or compete with the chat panel. */
	:global(html.touch-controls-active.chat-open) .mobile-controls {
		display: none;
	}
</style>
