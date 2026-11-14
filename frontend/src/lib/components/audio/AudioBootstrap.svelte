<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { gameAssets } from '../../loaders/gameAssets.svelte';
	import { cars } from '../../state/cars.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { minigame7 } from '../../state/minigame7.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { missions } from '../../state/missions.svelte';
	import { paperRolls } from '../../state/paperRolls.svelte';
	import { playerState } from '../../state/playerState';
	import { race } from '../../state/race.svelte';
	import { royaleInSafeZone } from '../../state/royaleConfig';
	import { sceneState } from '../../state/sceneState.svelte';
	import { audio } from '../../audio/engine';
	import {
		consumeCar,
		consumeCatCapture,
		consumeMg2,
		consumeMg5,
		consumeMg6,
		consumeMg7,
		consumeMg8,
		consumePaperThrow,
		consumeRace,
		resetMg2Cursor,
		syncCursors,
		type AudioCue
	} from '../../audio/events';
	import type { SoundId } from '../../audio/recipes';
	import { audioSettings } from '../../audio/settings.svelte';
	import { drainCarImpacts } from '../../audio/telemetry';
	import type { LoopHandle } from '../../audio/types';

	/**
	 * Puente entre el juego y el motor de audio.
	 *
	 * Vive fuera del `Canvas` para capturar el primer gesto antes de que el
	 * mundo esté listo. No crea el `AudioContext` hasta ese gesto; la generación
	 * de PCM sí puede empezar durante la pantalla de carga.
	 */

	const PREWARM: readonly SoundId[] = [
		// Los jingles duran > 0,8 s, así que `play()` no puede renderizarlos en
		// el acto. Van primero para que estén listos antes del primer final de
		// partida; si no, el único aviso de victoria/derrota se perdería.
		'mission_win',
		'mission_lose',
		'footstep_grass_0',
		'footstep_grass_1',
		'footstep_grass_2',
		'footstep_dirt_0',
		'footstep_dirt_1',
		'footstep_dirt_2',
		'footstep_stone_0',
		'footstep_stone_1',
		'footstep_stone_2',
		'footstep_wood_0',
		'footstep_wood_1',
		'footstep_wood_2',
		'jump',
		'land',
		'player_hurt_light',
		'player_hurt_heavy',
		'shot_pistol',
		'shot_shotgun',
		'shot_smg',
		'shot_rifle',
		'dry_fire',
		'reload_start',
		'reload_end',
		'hit_flesh',
		'hit_bone',
		'car_engine',
		'car_tire',
		'cat_meow',
		'cat_purr',
		'paper_throw',
		'countdown_tick',
		'countdown_go',
		'music_halloween',
		'ambience_centro',
		'ui_click',
		'ui_confirm'
	];

	let unlocked = $state(false);
	let unlocking = false;
	let musicHandle: LoopHandle | null = null;
	let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
	let impactTimer: ReturnType<typeof setInterval> | null = null;
	let countdownTimer: ReturnType<typeof setInterval> | null = null;
	let royaleStormTimer: ReturnType<typeof setInterval> | null = null;
	let royaleStormHandle: LoopHandle | null = null;
	let royaleWarnPhase = -1;
	let mounted = false;
	let lastScene = sceneState.active;

	type CountdownSource = 'race' | 'crypt' | 'waves' | 'deathmatch' | 'parkour' | 'royale';
	let countdownSource: CountdownSource | null = null;
	let countdownSecond = -1;
	let countdownWentLive = false;

	function activeCountdown(): { source: CountdownSource; endsAt: number } | null {
		if (sceneState.inRace && race.phase === 'countdown' && race.snapshot?.endsAt) {
			return { source: 'race', endsAt: race.snapshot.endsAt };
		}

		if (sceneState.inCrypt && minigame2.phase === 'countdown' && minigame2.snapshot?.endsAt) {
			return { source: 'crypt', endsAt: minigame2.snapshot.endsAt };
		}

		if (sceneState.inWaves && minigame5.phase === 'countdown' && minigame5.snapshot?.endsAt) {
			return { source: 'waves', endsAt: minigame5.snapshot.endsAt };
		}

		if (
			sceneState.inDeathmatch &&
			minigame6.phase === 'countdown' &&
			minigame6.snapshot?.countdownEndsAt
		) {
			return { source: 'deathmatch', endsAt: minigame6.snapshot.countdownEndsAt };
		}

		if (sceneState.inParkour && minigame7.phase === 'countdown' && minigame7.snapshot?.endsAt) {
			return { source: 'parkour', endsAt: minigame7.snapshot.endsAt };
		}

		if (
			sceneState.inRoyale &&
			minigame8.phase === 'countdown' &&
			minigame8.snapshot?.countdownEndsAt
		) {
			return { source: 'royale', endsAt: minigame8.snapshot.countdownEndsAt };
		}

		return null;
	}

	function countdownLive(source: CountdownSource): boolean {
		if (source === 'race') {
			return sceneState.inRace && (race.phase === 'playing' || race.phase === 'results');
		}

		if (source === 'crypt') {
			return (
				sceneState.inCrypt &&
				(minigame2.phase === 'playing' || minigame2.phase === 'won' || minigame2.phase === 'lost')
			);
		}

		if (source === 'deathmatch') {
			return (
				sceneState.inDeathmatch && (minigame6.phase === 'playing' || minigame6.phase === 'results')
			);
		}

		if (source === 'parkour') {
			return (
				sceneState.inParkour && (minigame7.phase === 'playing' || minigame7.phase === 'results')
			);
		}

		if (source === 'royale') {
			return (
				sceneState.inRoyale && (minigame8.phase === 'playing' || minigame8.phase === 'results')
			);
		}

		return (
			sceneState.inWaves &&
			(minigame5.phase === 'playing' ||
				minigame5.phase === 'intermission' ||
				minigame5.phase === 'won' ||
				minigame5.phase === 'lost')
		);
	}

	function countdownNow(source: CountdownSource): number {
		if (source === 'race') return race.serverNow();
		if (source === 'crypt') return minigame2.serverNow();
		if (source === 'deathmatch') return minigame6.serverNow();
		if (source === 'parkour') return minigame7.serverNow();
		if (source === 'royale') return minigame8.serverNow();

		return minigame5.serverNow();
	}

	/**
	 * La música tarda en renderizarse (8 s de PCM), así que `audio.loop`
	 * puede fallar al principio. El ticker la reintenta hasta que el buffer
	 * está listo y la deja sonando entre escenas.
	 */
	function ensureMusic(): void {
		if (!unlocked || musicHandle) {
			return;
		}

		const handle = audio.loop('music_halloween', {
			volume: 0,
			sourceId: 'music',
			priority: 1
		});

		if (!handle) {
			return;
		}

		musicHandle = handle;
		handle.setGain(0, 10);
		setTimeout(() => {
			if (musicHandle === handle) {
				handle.setGain(0.8, 1400);
			}
		}, 60);
	}

	function tickCountdown(): void {
		if (!unlocked) {
			return;
		}

		ensureMusic();

		const active = activeCountdown();

		if (active) {
			if (countdownSource !== active.source) {
				countdownSource = active.source;
				countdownSecond = -1;
				countdownWentLive = false;
			}

			const remaining = Math.max(
				0,
				Math.ceil((active.endsAt - countdownNow(active.source)) / 1000)
			);

			if (remaining !== countdownSecond) {
				countdownSecond = remaining;

				if (remaining >= 1 && remaining <= 3) {
					audio.play('countdown_tick', { volume: 0.85, priority: 3, sourceId: 'countdown' });
				} else if (remaining === 0 && !countdownWentLive) {
					countdownWentLive = true;
					audio.play('countdown_go', { volume: 0.95, priority: 3, sourceId: 'countdown' });
				}
			}

			return;
		}

		if (!countdownSource) {
			return;
		}

		if (!countdownWentLive && countdownLive(countdownSource)) {
			countdownWentLive = true;
			audio.play('countdown_go', { volume: 0.95, priority: 3, sourceId: 'countdown' });
		}

		countdownSource = null;
		countdownSecond = -1;
		countdownWentLive = false;
	}

	/**
	 * Bucle de tormenta y aviso de cierre.
	 *
	 * La tormenta no tiene receta propia: el loop usa la ambience de tormenta
	 * existente y se apaga al volver a la zona segura. El trueno suena una vez
	 * por fase cuando faltan ≤ 10 s para el siguiente cierre.
	 */
	function tickRoyaleStorm(): void {
		if (!unlocked) {
			return;
		}

		const active =
			sceneState.inRoyale &&
			minigame8.phase === 'playing' &&
			minigame8.isAlive &&
			minigame8.snapshot !== null;
		const storm = minigame8.snapshot?.storm ?? null;
		const now = minigame8.serverNow();
		const outside =
			active && storm !== null && storm.dps > 0
				? !royaleInSafeZone(storm, playerState.x, playerState.z)
				: false;

		if (outside) {
			if (!royaleStormHandle) {
				royaleStormHandle = audio.loop('ambience_waves', {
					volume: 0,
					sourceId: 'royale-storm',
					priority: 2
				});
			}

			royaleStormHandle?.setGain(0.32, 400);
		} else if (royaleStormHandle) {
			royaleStormHandle.setGain(0, 300);
			royaleStormHandle.stop(400);
			royaleStormHandle = null;
		}

		if (
			active &&
			storm !== null &&
			storm.state === 'wait' &&
			storm.endsAt > now &&
			storm.endsAt - now <= 10_000 &&
			royaleWarnPhase !== storm.phase
		) {
			royaleWarnPhase = storm.phase;
			audio.play('amb_thunder', { volume: 0.75, priority: 2 });
		}

		if (!active) {
			royaleWarnPhase = -1;
		}
	}

	function unlock(): void {
		if (unlocked || unlocking) {
			return;
		}

		unlocking = true;

		void audio.unlock().then((ready) => {
			unlocking = false;

			if (!mounted) {
				return;
			}

			if (!ready) {
				// El primer gesto no siempre basta (contexto aún reanudándose o
				// política de autoplay): volvemos a escuchar en vez de quedarnos
				// sin audio para el resto de la sesión.
				addUnlockListeners();
				return;
			}

			unlocked = true;
			ensureMusic();
			removeUnlockListeners();
			syncCursors({
				mg5Seq: minigame5.events.at(-1)?.seq,
				mg6Seq: minigame6.events.at(-1)?.seq,
				mg7Seq: minigame7.events.at(-1)?.seq,
				mg8Seq: minigame8.events.at(-1)?.seq,
				mg2Count: minigame2.events.length,
				raceSeq: race.eventSeq,
				carSeq: cars.eventSeq,
				catCaptureSeq: missions.captureSeq,
				paperThrowSeq: paperRolls.throwSeq
			});

			if (gameAssets.status === 'ready') {
				audio.prewarm(PREWARM);
				prewarmCurrentZone();
			}
		});
	}

	function prewarmCurrentZone(): void {
		const scene = sceneState.active;

		if (scene === 'crypt') {
			audio.prewarm([
				'ambience_crypt',
				'amb_drip',
				'amb_creak',
				'monster_mummy_idle',
				'monster_mummy_attack'
			]);
		} else if (scene === 'roadmap' || sceneState.inRace) {
			audio.prewarm(['ambience_race']);
		} else if (sceneState.inWaves || sceneState.inDeathmatch) {
			audio.prewarm(['ambience_waves', 'amb_creak', 'amb_thunder']);
		} else if (sceneState.inRoyale) {
			audio.prewarm(['ambience_waves', 'amb_thunder']);
		} else {
			audio.prewarm(['ambience_bosque', 'ambience_castillo', 'ambience_calabazar']);
		}
	}

	function playCues(cues: readonly AudioCue[]): void {
		for (const cue of cues) {
			audio.play(cue.id, {
				position: cue.position,
				volume: cue.volume,
				rate: cue.rate,
				sourceId: cue.sourceId,
				priority: cue.priority
			});
		}
	}

	function onVisibilityChange(): void {
		if (typeof document === 'undefined') {
			return;
		}

		if (document.hidden) {
			if (hiddenTimer !== null) {
				clearTimeout(hiddenTimer);
			}

			hiddenTimer = setTimeout(() => {
				hiddenTimer = null;
				audio.suspend();
			}, 250);
			return;
		}

		if (hiddenTimer !== null) {
			clearTimeout(hiddenTimer);
			hiddenTimer = null;
		}

		if (unlocked) {
			audio.resume();
		}
	}

	function addUnlockListeners(): void {
		// Evita duplicados si un intento anterior falló y hay que reintentar.
		removeUnlockListeners();
		window.addEventListener('pointerdown', unlock, { once: true, passive: true });
		window.addEventListener('keydown', unlock, { once: true, passive: true });
		window.addEventListener('touchstart', unlock, { once: true, passive: true });
	}

	function removeUnlockListeners(): void {
		window.removeEventListener('pointerdown', unlock);
		window.removeEventListener('keydown', unlock);
		window.removeEventListener('touchstart', unlock);
	}

	onMount(() => {
		mounted = true;
		audioSettings.init();
		addUnlockListeners();
		document.addEventListener('visibilitychange', onVisibilityChange);

		// Los impactos de coche llegan por frame; se drenan a 20 Hz para no
		// crear un `$effect` por cada llamada de física.
		impactTimer = setInterval(() => {
			if (!unlocked) {
				drainCarImpacts();
				return;
			}

			for (const impact of drainCarImpacts()) {
				const id: SoundId =
					impact.cause === 'rollover'
						? 'car_rollover'
						: impact.impactSpeed >= 8
							? 'car_impact_heavy'
							: 'car_impact_light';

				audio.play(id, { priority: 3, sourceId: 'local-car' });
			}
		}, 50);

		// Cuenta atrás común a carrera, cripta y Barn Siege. A 10 Hz alcanza
		// para no saltarse el 3-2-1 aunque el servidor recorte `endsAt`.
		countdownTimer = setInterval(tickCountdown, 100);
		// El bucle de tormenta no depende de frames: 2 Hz basta para entrar y
		// salir del círculo sin gastar trabajo en el hilo de audio.
		royaleStormTimer = setInterval(tickRoyaleStorm, 500);

		return () => {
			mounted = false;
			removeUnlockListeners();
			document.removeEventListener('visibilitychange', onVisibilityChange);
			audioSettings.dispose();

			if (musicHandle) {
				musicHandle.stop(0);
				musicHandle = null;
			}

			if (hiddenTimer !== null) {
				clearTimeout(hiddenTimer);
				hiddenTimer = null;
			}

			if (impactTimer !== null) {
				clearInterval(impactTimer);
				impactTimer = null;
			}

			if (countdownTimer !== null) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}

			if (royaleStormTimer !== null) {
				clearInterval(royaleStormTimer);
				royaleStormTimer = null;
			}

			if (royaleStormHandle) {
				royaleStormHandle.setGain(0, 120);
				royaleStormHandle.stop(200);
				royaleStormHandle = null;
			}

			audio.dispose();
		};
	});

	// La precarga arranca en cuanto los GLB están listos, sin esperar al gesto.
	$effect(() => {
		if (gameAssets.status !== 'ready') {
			return;
		}

		audio.prewarm(PREWARM);
		prewarmCurrentZone();
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumeMg5(minigame5.events, minigame5.monsters, minigame5.selfId));
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumeMg6(minigame6.events, minigame6.selfId, minigame6.team));
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumeMg7(minigame7.events, minigame7.selfId));
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumeMg8(minigame8.events, minigame8.selfId));
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumeMg2(minigame2.events, minigame2.selfId));
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumeRace(race.lastEvent, race.eventSeq, race.selfId));
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumeCar(cars.lastEvent, cars.eventSeq, cars.selfId, cars.isDriving));
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumeCatCapture(missions.lastCapture, missions.captureSeq));
	});

	$effect(() => {
		if (!mounted || !unlocked) {
			return;
		}

		playCues(consumePaperThrow(paperRolls.lastThrow, paperRolls.throwSeq));
	});

	// Al cambiar de escena se descartan los one-shots pendientes; `SceneAudio`
	// se encarga de los loops.
	$effect(() => {
		const scene = sceneState.active;

		if (scene === lastScene) {
			return;
		}

		lastScene = scene;
		resetMg2Cursor();
		// La música sobrevive al cambio de escena; el resto de loops se apaga.
		audio.stopAll(140, 'music');

		if (royaleStormHandle) {
			royaleStormHandle.setGain(0, 250);
			royaleStormHandle.stop(350);
			royaleStormHandle = null;
		}
		royaleWarnPhase = -1;

		if (unlocked) {
			prewarmCurrentZone();
		}
	});
</script>
