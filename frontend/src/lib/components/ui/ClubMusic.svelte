<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type Hls from 'hls.js';
	import {
		ExternalLink,
		Music2,
		Pause,
		Play,
		Plus,
		SkipBack,
		SkipForward,
		Trash2,
		Volume2,
		X
	} from '@lucide/svelte';
	import { audio, type MediaSpatialHandle } from '../../audio/engine';
	import { chat } from '../../state/chat.svelte';
	import { clubMusic } from '../../state/clubMusic.svelte';
	import { npcs } from '../../state/npcs.svelte';
	import { ride } from '../../state/ride.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import type { ClubTrack } from '../../services/protocol';

	type ScWidget = {
		bind: (event: string, listener: () => void) => void;
		load: (url: string, options?: Record<string, unknown>) => void;
		play: () => void;
		pause: () => void;
		seekTo: (milliseconds: number) => void;
		getDuration: (callback: (milliseconds: number) => void) => void;
		getPosition: (callback: (milliseconds: number) => void) => void;
		isPaused: (callback: (paused: boolean) => void) => void;
		setVolume: (volume: number) => void;
	};

	type ScApi = {
		Widget: (iframe: HTMLIFrameElement) => ScWidget;
		Events?: Record<'READY' | 'PLAY' | 'PAUSE' | 'FINISH' | 'ERROR' | 'PLAY_PROGRESS', string>;
	};

	type ClubSourceResponse = {
		ok?: boolean;
		kind?: 'progressive' | 'hls';
		src?: string;
		title?: string;
		author?: string;
		artworkUrl?: string | null;
		durationMs?: number | null;
		error?: string;
	};

	const SC_SCRIPT = 'https://w.soundcloud.com/player/api.js';

	/** Altavoces del escenario (DJ booth en `Map.svelte`). */
	const STAGE_POSITION = { x: 0, y: 2.2, z: -17.8 };

	let apiPromise: Promise<ScApi | null> | null = null;

	function loadSoundCloudApi(): Promise<ScApi | null> {
		if (typeof window === 'undefined') {
			return Promise.resolve(null);
		}

		const existing = (window as unknown as { SC?: ScApi }).SC;

		if (existing) {
			return Promise.resolve(existing);
		}

		if (apiPromise) {
			return apiPromise;
		}

		apiPromise = new Promise((resolve) => {
			const script = document.createElement('script');
			script.src = SC_SCRIPT;
			script.async = true;
			script.onload = () => resolve((window as unknown as { SC?: ScApi }).SC ?? null);
			script.onerror = () => resolve(null);
			document.head.appendChild(script);
		});

		return apiPromise;
	}

	function embedUrl(url: string): string {
		const params = new URLSearchParams({
			url,
			color: '#ff2fd6',
			auto_play: 'false',
			hide_related: 'true',
			show_comments: 'false',
			show_user: 'true',
			show_reposts: 'false',
			show_teaser: 'false',
			visual: 'false'
		});

		return `https://w.soundcloud.com/player/?${params.toString()}`;
	}

	/**
	 * El backend decide cómo entregar la pista: `/club/stream` para MP3
	 * progresivo o `/club/hls` para HLS. El audio nunca se guarda; va directo
	 * al reproductor del cliente.
	 */
	function backendOrigin(): string {
		const configured = import.meta.env.VITE_WS_URL as string | undefined;

		if (!configured) {
			return '';
		}

		try {
			const parsed = new URL(configured);
			parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
			return parsed.origin;
		} catch {
			return '';
		}
	}

	function sourceUrlFor(url: string): string {
		return `${backendOrigin()}/club/source?url=${encodeURIComponent(url)}`;
	}

	/** El backend devuelve rutas relativas; si el WS vive en otro origen, las
	 *  prefijamos para que hls.js resuelva también los segmentos ahí. */
	function absoluteSource(path: string): string {
		if (/^https?:\/\//i.test(path)) {
			return path;
		}

		const origin = backendOrigin();
		return origin ? `${origin}${path}` : path;
	}

	function formatTime(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds < 0) {
			return '0:00';
		}

		const total = Math.floor(seconds);
		const minutes = Math.floor(total / 60);
		const rest = total % 60;
		return `${minutes}:${String(rest).padStart(2, '0')}`;
	}

	let urlInput = $state('');
	let submittedUrl = $state<string | null>(null);
	let submittedVersion = 0;

	/** Reproductor directo (camino principal). */
	let audioEl = $state.raw<HTMLAudioElement | null>(null);
	let audioTrackId: string | null = null;
	let audioReady = $state(false);
	let audioDuration = $state(0);
	let streamFailed = $state(false);

	/** Fuente resuelta por el backend: MP3 progresivo o playlist HLS. */
	let sourceKind = $state<'progressive' | 'hls' | null>(null);
	let sourceSrc = $state<string | null>(null);
	let sourceLoading = $state(false);
	let hls: Hls | null = null;
	let sourceGeneration = 0;
	/** Enlace del `<audio>` con el motor: master + atenuación por distancia. */
	let mediaHandle: MediaSpatialHandle | null = null;

	/** Reproductor de SoundCloud (solo si el stream directo falla). */
	let iframeEl = $state.raw<HTMLIFrameElement | null>(null);
	let widget = $state.raw<ScWidget | null>(null);
	let widgetTrackId: string | null = null;
	let widgetReady = $state(false);

	let needsGesture = $state(false);
	let showPlayer = $state(false);
	let pendingPlay = false;
	let localError = $state<string | null>(null);
	let finishReported = '';
	let clockTick = $state(0);
	let elapsed = 0;

	const current = $derived(clubMusic.current);
	const currentTrackId = $derived(clubMusic.currentId);
	const position = $derived.by(() => {
		void clockTick;

		const el = audioEl;

		if (
			el &&
			!streamFailed &&
			audioTrackId === clubMusic.currentId &&
			Number.isFinite(el.currentTime) &&
			el.currentTime > 0
		) {
			return el.currentTime;
		}

		return clubMusic.livePosition;
	});
	const duration = $derived(
		(clubMusic.currentDuration ?? (audioDuration > 0 ? audioDuration * 1000 : 0)) / 1000
	);
	const progress = $derived(duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0);
	const error = $derived(clubMusic.error ?? localError);
	const canAdd = $derived(urlInput.trim().length > 0);

	// Duck the procedural music bus while a shared SoundCloud track plays in
	// the hub, so the two songs do not stack.
	$effect(() => {
		const audible = streamFailed ? widgetReady : audioReady;
		const duck =
			sceneState.inHub && clubMusic.playing && clubMusic.hasTracks && audible && !needsGesture
				? 0.08
				: 1;
		audio.setMusicDuck(duck);

		return () => audio.setMusicDuck(1);
	});

	function destroyHls(): void {
		if (hls) {
			hls.destroy();
			hls = null;
		}
	}

	/**
	 * Pregunta al backend cómo reproducir la pista y prepara el `<audio>`.
	 * MP3 progresivo usa `src`; HLS usa `hls.js` (Chrome/Brave) o HLS nativo
	 * (Safari). Si nada funciona, se cae al iframe oficial.
	 */
	async function loadSource(trackId: string, url: string): Promise<void> {
		const generation = ++sourceGeneration;

		destroyHls();
		sourceKind = null;
		sourceSrc = null;
		sourceLoading = true;
		audioReady = false;
		audioDuration = 0;
		streamFailed = false;

		// El `<audio>` se bindea al montar; esperar un tick evita que el primer
		// HLS se quede sin elemento y acabe en el iframe.
		await tick();

		if (generation !== sourceGeneration || clubMusic.currentId !== trackId) {
			return;
		}

		const el = audioEl;

		if (el) {
			el.removeAttribute('src');
			el.load();
		}

		let meta: ClubSourceResponse | null = null;

		try {
			const response = await fetch(sourceUrlFor(url));

			if (response.ok) {
				meta = (await response.json()) as ClubSourceResponse;
			}
		} catch {
			meta = null;
		}

		if (generation !== sourceGeneration || clubMusic.currentId !== trackId) {
			return;
		}

		if (!meta?.ok || !meta.src || !meta.kind) {
			sourceLoading = false;
			streamFailed = true;
			showPlayer = true;
			needsGesture = false;
			localError = null;
			return;
		}

		sourceKind = meta.kind;

		if (typeof meta.durationMs === 'number' && meta.durationMs > 0) {
			clubMusic.reportDuration(trackId, meta.durationMs);
		}

		if (meta.kind === 'progressive' || !el) {
			sourceSrc = absoluteSource(meta.src);
			sourceLoading = false;
			return;
		}

		// Safari/iOS reproducen HLS de forma nativa.
		if (el.canPlayType('application/vnd.apple.mpegurl')) {
			sourceSrc = absoluteSource(meta.src);
			sourceLoading = false;
			return;
		}

		try {
			const { default: HlsPlayer } = await import('hls.js');

			if (generation !== sourceGeneration || clubMusic.currentId !== trackId) {
				return;
			}

			if (!HlsPlayer.isSupported()) {
				sourceLoading = false;
				streamFailed = true;
				showPlayer = true;
				return;
			}

			const instance = new HlsPlayer({ enableWorker: true });

			hls = instance;
			instance.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
				if (generation !== sourceGeneration) {
					return;
				}

				audioReady = true;
				syncAudio(true);
			});
			instance.on(HlsPlayer.Events.ERROR, (_event, data) => {
				if (generation !== sourceGeneration) {
					return;
				}

				if (data.fatal) {
					handleAudioError();
				}
			});
			instance.loadSource(absoluteSource(meta.src));
			instance.attachMedia(el);
			sourceLoading = false;
		} catch {
			if (generation !== sourceGeneration) {
				return;
			}

			sourceLoading = false;
			streamFailed = true;
			showPlayer = true;
		}
	}

	/** Mantiene el `<audio>` alineado con el estado autoritativo del servidor. */
	function syncAudio(seek: boolean): void {
		const el = audioEl;

		if (!el || streamFailed || !clubMusic.currentId) {
			return;
		}

		const shouldPlay = clubMusic.playing && sceneState.inHub;
		const target = clubMusic.livePosition;

		if (seek && audioReady && Number.isFinite(target)) {
			// Nunca buscar más allá del final: el navegador saltaría a
			// `duration` y dispararía un `ended` que avanzaría la cola.
			const limit =
				Number.isFinite(el.duration) && el.duration > 0
					? Math.max(0, el.duration - 0.5)
					: Number.POSITIVE_INFINITY;
			const clamped = Math.max(0, Math.min(target, limit));
			const drift = Math.abs(el.currentTime - clamped);

			if (drift > 1.4) {
				el.currentTime = clamped;
			}
		}

		if (shouldPlay) {
			if (el.paused) {
				void el.play().then(
					() => {
						needsGesture = false;
					},
					() => {
						needsGesture = true;
					}
				);
			}
		} else if (!el.paused) {
			el.pause();
		}
	}

	function applyWidgetState(seek: boolean): void {
		const instance = widget;

		if (
			!streamFailed ||
			!instance ||
			!widgetReady ||
			!clubMusic.currentId ||
			widgetTrackId !== clubMusic.currentId
		) {
			return;
		}

		if (!sceneState.inHub) {
			instance.isPaused((paused) => {
				if (!paused) {
					instance.pause();
				}
			});
			return;
		}

		const target = clubMusic.livePosition;

		instance.getPosition((milliseconds) => {
			const drift = Math.abs(milliseconds / 1000 - target);

			if (seek && drift > 1.4) {
				instance.seekTo(target * 1000);
			}
		});

		if (clubMusic.playing) {
			instance.isPaused((paused) => {
				if (paused) {
					instance.play();
					window.setTimeout(() => {
						instance.isPaused((stillPaused) => {
							needsGesture = stillPaused;
						});
					}, 700);
				} else {
					needsGesture = false;
				}
			});
		} else {
			instance.isPaused((paused) => {
				if (!paused) {
					instance.pause();
				}
			});
		}
	}

	/** Ruta con gesto del usuario: desbloquea el audio del navegador. */
	function forcePlay(): void {
		if (streamFailed) {
			const instance = widget;

			if (!instance || !widgetReady) {
				pendingPlay = true;
				return;
			}

			pendingPlay = false;
			instance.play();
			needsGesture = false;
			return;
		}

		const el = audioEl;

		if (!el) {
			return;
		}

		const target = clubMusic.livePosition;

		if (audioReady && Number.isFinite(target)) {
			const limit =
				Number.isFinite(el.duration) && el.duration > 0
					? Math.max(0, el.duration - 0.5)
					: Number.POSITIVE_INFINITY;
			const clamped = Math.max(0, Math.min(target, limit));

			if (Math.abs(el.currentTime - clamped) > 1.4) {
				el.currentTime = clamped;
			}
		}

		void el.play().then(
			() => {
				needsGesture = false;
			},
			() => {
				needsGesture = true;
			}
		);
	}

	function handleLoadedMetadata(): void {
		const el = audioEl;
		const trackId = clubMusic.currentId;

		if (!el || !trackId) {
			return;
		}

		audioReady = true;
		needsGesture = false;
		el.volume = mediaHandle ? 1 : 0.9;

		if (Number.isFinite(el.duration) && el.duration > 0) {
			audioDuration = el.duration;
			clubMusic.reportDuration(trackId, Math.round(el.duration * 1000));
		}

		syncAudio(true);
	}

	function handleEnded(): void {
		const el = audioEl;
		const trackId = clubMusic.currentId;

		if (!el || !trackId) {
			return;
		}

		// Un `ended` espurio (fuente abortada, seek al final, HLS recargado) no
		// debe saltar la canción que están escuchando todos los clientes.
		if (!el.ended || audioTrackId !== trackId) {
			return;
		}

		const duration = Number.isFinite(el.duration) ? el.duration : 0;

		if (duration > 0 && el.currentTime < duration - 0.75) {
			return;
		}

		const key = `${trackId}:${clubMusic.version}`;

		if (finishReported === key) {
			return;
		}

		finishReported = key;
		clubMusic.ended(trackId, clubMusic.version);
	}

	function handleAudioError(): void {
		if (!clubMusic.currentId || streamFailed) {
			return;
		}

		// Sin stream directo (o sin red): el iframe de SoundCloud queda como
		// respaldo para esa pista.
		destroyHls();
		sourceSrc = null;
		streamFailed = true;
		showPlayer = true;
		needsGesture = false;
		localError = null;
	}

	// Cada cambio de pista reinicia ambos reproductores y resuelve la fuente.
	$effect(() => {
		const trackId = clubMusic.currentId;
		const track = untrack(() => clubMusic.current);

		audioTrackId = trackId;
		audioReady = false;
		audioDuration = 0;
		streamFailed = false;
		needsGesture = false;
		pendingPlay = false;
		finishReported = '';
		localError = null;
		showPlayer = false;

		if (trackId && track) {
			void loadSource(trackId, track.url);
		} else {
			sourceGeneration += 1;
			destroyHls();
			sourceKind = null;
			sourceSrc = null;
			sourceLoading = false;
		}
	});

	$effect(() => {
		void clubMusic.version;
		void clubMusic.playing;
		void clubMusic.currentId;
		void audioReady;
		void streamFailed;
		void sceneState.inHub;

		if (streamFailed) {
			applyWidgetState(true);
		} else {
			syncAudio(true);
		}
	});

	$effect(() => {
		const trackId = currentTrackId;
		const iframe = iframeEl;
		void streamFailed;

		if (!trackId || !iframe || !streamFailed) {
			widget = null;
			widgetTrackId = null;
			widgetReady = false;
			return;
		}

		let cancelled = false;

		widget = null;
		widgetTrackId = trackId;
		widgetReady = false;
		pendingPlay = false;

		void loadSoundCloudApi().then((api) => {
			if (cancelled) {
				return;
			}

			if (!api || !iframeEl) {
				localError = 'The SoundCloud player could not load. Open the track on SoundCloud instead.';
				return;
			}

			const events = api.Events;

			if (!events || typeof api.Widget !== 'function') {
				localError = 'The SoundCloud player could not load. Open the track on SoundCloud instead.';
				return;
			}

			const instance = api.Widget(iframe);
			widget = instance;

			instance.bind(events.READY, () => {
				if (cancelled) {
					return;
				}

				widgetReady = true;
				instance.setVolume(100);
				instance.getDuration((milliseconds) => {
					if (milliseconds > 0) {
						clubMusic.reportDuration(trackId, milliseconds);
					}
				});

				if (pendingPlay) {
					pendingPlay = false;
					instance.play();
				}

				applyWidgetState(true);
			});

			instance.bind(events.PLAY, () => {
				if (cancelled) {
					return;
				}

				needsGesture = false;
			});

			instance.bind(events.FINISH, () => {
				if (cancelled || clubMusic.currentId !== trackId) {
					return;
				}

				const key = `${trackId}:${clubMusic.version}`;

				if (finishReported === key) {
					return;
				}

				finishReported = key;
				clubMusic.ended(trackId, clubMusic.version);
			});

			instance.bind(events.ERROR, () => {
				if (cancelled) {
					return;
				}

				localError = 'SoundCloud could not play that track. Try another link.';
			});
		});

		return () => {
			cancelled = true;
		};
	});

	function openPanel(): void {
		clubMusic.openPanel();
		showPlayer = streamFailed;
		localError = null;
	}

	function closePanel(): void {
		clubMusic.closePanel();
	}

	function isEditableTarget(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLElement &&
			target.closest('input, textarea, select, [contenteditable="true"]') !== null
		);
	}

	function addTrack(event: SubmitEvent): void {
		event.preventDefault();

		if (!canAdd) {
			return;
		}

		if (clubMusic.add(urlInput.trim())) {
			submittedUrl = urlInput.trim();
			submittedVersion = clubMusic.version;
			urlInput = '';
			localError = null;
		}
	}

	// If the server rejects the link, put it back so the player can fix it.
	$effect(() => {
		const error = clubMusic.error;
		const version = clubMusic.version;

		if (!submittedUrl) {
			return;
		}

		if (error) {
			urlInput = submittedUrl;
			submittedUrl = null;
			return;
		}

		if (version !== submittedVersion) {
			submittedUrl = null;
		}
	});

	function togglePlayback(): void {
		if (!clubMusic.hasTracks) {
			return;
		}

		if (clubMusic.playing) {
			clubMusic.pause();
			audioEl?.pause();
			widget?.pause();
			return;
		}

		forcePlay();
		clubMusic.play();
	}

	function selectTrack(track: ClubTrack): void {
		if (track.id === clubMusic.currentId) {
			if (!clubMusic.playing) {
				togglePlayback();
			}

			return;
		}

		clubMusic.select(track.id);
	}

	$effect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}

			if (event.code === 'Escape' && clubMusic.panelOpen) {
				event.preventDefault();
				closePanel();
				return;
			}

			if (
				event.code !== 'KeyE' ||
				event.repeat ||
				!clubMusic.nearby ||
				clubMusic.panelOpen ||
				!sceneState.inHub ||
				ride.isRiding ||
				chat.isOpen ||
				npcs.dialogOpen ||
				isEditableTarget(event.target)
			) {
				return;
			}

			event.preventDefault();
			openPanel();
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});

	// Autoplay: cualquier clic/tecla del jugador (aunque el panel esté cerrado)
	// desbloquea el `<audio>` compartido. Sin esto, cada socket tendría que
	// abrir el panel y pulsar "Tap to enable audio".
	$effect(() => {
		const onGesture = (event: Event) => {
			if (isEditableTarget(event.target) || !sceneState.inHub || streamFailed) {
				return;
			}

			if (!clubMusic.playing || !clubMusic.currentId) {
				return;
			}

			void audio.unlock();
			forcePlay();
		};

		window.addEventListener('pointerdown', onGesture, { capture: true });
		window.addEventListener('keydown', onGesture, { capture: true });

		return () => {
			window.removeEventListener('pointerdown', onGesture, { capture: true });
			window.removeEventListener('keydown', onGesture, { capture: true });
		};
	});

	onMount(() => {
		const el = audioEl;

		if (el) {
			// Una sola vez por elemento: el master y la atenuación 3D se
			// actualizan luego con `setPosition`/`setListener`.
			mediaHandle = audio.attachMedia(el, 0.9);

			if (mediaHandle) {
				mediaHandle.setPosition(STAGE_POSITION);
				el.volume = 1;
			}
		}

		const interval = window.setInterval(() => {
			clockTick += 1;
			elapsed += 0.25;

			// Periodic drift correction: keeps every client on the same beat
			// without seeking on every snapshot. Runs even with the panel
			// closed because the shared track keeps playing.
			if (elapsed >= 2) {
				elapsed = 0;

				if (streamFailed) {
					applyWidgetState(true);
				} else {
					syncAudio(true);
				}
			}
		}, 250);

		return () => {
			window.clearInterval(interval);
			sourceGeneration += 1;
			destroyHls();
			mediaHandle?.dispose();
			mediaHandle = null;
		};
	});
</script>

<!-- Reproductor principal: stream directo del backend. Se mantiene montado
     aunque el panel esté cerrado para que la pista compartida siga sonando. -->
<audio
	bind:this={audioEl}
	src={streamFailed ? undefined : (sourceSrc ?? undefined)}
	preload="auto"
	crossorigin="anonymous"
	class="hidden"
	onloadedmetadata={handleLoadedMetadata}
	onended={handleEnded}
	onerror={handleAudioError}
	onplay={() => (needsGesture = false)}
></audio>

{#if clubMusic.nearby && !clubMusic.panelOpen && !ride.isRiding && sceneState.inHub}
	<div
		class="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2 select-none"
		aria-live="polite"
	>
		<div
			class="flex items-center gap-3 rounded-xl border border-fuchsia-400/40 bg-[#0b0814]/85 px-5 py-3 text-slate-100 shadow-[0_0_28px_rgba(255,47,214,0.25)] backdrop-blur-md"
		>
			<Music2 class="size-5 text-fuchsia-300" />
			<div class="leading-tight">
				<p class="text-sm font-semibold tracking-wide text-fuchsia-200">CLUB JUKEBOX</p>
				<p class="text-xs text-slate-400">
					{#if current}
						{clubMusic.playing
							? needsGesture
								? 'Open the jukebox to enable audio'
								: 'Now playing'
							: 'Paused'} · {current.title}
					{:else}
						Paste a SoundCloud link and play it for everyone
					{/if}
				</p>
			</div>
			<kbd
				class="ml-2 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs font-bold text-white"
			>
				E
			</kbd>
		</div>
	</div>
{/if}

{#if clubMusic.panelOpen || current}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 {clubMusic.panelOpen
			? 'opacity-100'
			: 'pointer-events-none opacity-0'}"
		inert={!clubMusic.panelOpen}
		aria-hidden={!clubMusic.panelOpen}
	>
		<button
			type="button"
			class="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm"
			aria-label="Close jukebox"
			onclick={closePanel}
		></button>

		<section
			class="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-fuchsia-400/30 bg-[#0b0814]/95 text-slate-100 shadow-[0_0_60px_rgba(255,47,214,0.22)]"
			aria-label="Club jukebox"
		>
			<header
				class="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-fuchsia-500/15 via-transparent to-cyan-500/10 px-5 py-4"
			>
				<div class="flex items-center gap-3">
					<div
						class="flex size-10 items-center justify-center rounded-full border border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-300"
					>
						<Music2 class="size-5" />
					</div>
					<div>
						<h2 class="text-lg font-bold tracking-wide text-fuchsia-100">CLUB JUKEBOX</h2>
						<p class="text-xs text-slate-400">SoundCloud · shared with everyone in the club</p>
					</div>
				</div>
				<button
					type="button"
					class="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
					onclick={closePanel}
					aria-label="Close"
				>
					<X class="size-5" />
				</button>
			</header>

			<div class="grid min-h-0 flex-1 gap-0 md:grid-cols-[1.15fr_1fr]">
				<div
					class="flex min-h-0 flex-col gap-4 overflow-y-auto border-b border-white/10 p-5 md:border-r md:border-b-0"
				>
					<form class="flex gap-2" onsubmit={addTrack}>
						<label class="sr-only" for="club-track-url">SoundCloud track link</label>
						<input
							id="club-track-url"
							bind:value={urlInput}
							type="url"
							inputmode="url"
							autocomplete="off"
							spellcheck="false"
							placeholder="https://soundcloud.com/artist/track"
							class="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-slate-100 transition outline-none placeholder:text-slate-500 focus:border-fuchsia-400/70 focus:ring-2 focus:ring-fuchsia-500/20"
						/>
						<button
							type="submit"
							disabled={!canAdd}
							class="flex items-center gap-1.5 rounded-lg bg-fuchsia-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
						>
							<Plus class="size-4" />
							Add
						</button>
					</form>

					{#if error}
						<p
							class="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
						>
							{error}
						</p>
					{/if}

					<div class="rounded-xl border border-white/10 bg-white/5 p-4">
						{#if current}
							<div class="flex items-center gap-3">
								<div
									class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/20"
								>
									{#if current.artworkUrl}
										<img
											src={current.artworkUrl}
											alt=""
											class="size-full object-cover"
											loading="lazy"
										/>
									{:else}
										<Music2 class="size-6 text-fuchsia-200" />
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-white">{current.title}</p>
									<p class="truncate text-xs text-slate-400">
										{current.author} · added by {current.addedBy}
										{#if sourceKind}
											· <span class="uppercase">{sourceKind}</span>
										{/if}
									</p>
								</div>
								<a
									href={current.url}
									target="_blank"
									rel="noreferrer"
									class="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
									aria-label="Open on SoundCloud"
								>
									<ExternalLink class="size-4" />
								</a>
							</div>

							<div class="mt-4">
								<div class="h-1.5 overflow-hidden rounded-full bg-white/10">
									<div
										class="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-cyan-300 transition-[width] duration-200"
										style:width={`${Math.round(progress * 100)}%`}
									></div>
								</div>
								<div class="mt-1 flex justify-between text-[11px] text-slate-400 tabular-nums">
									<span>{sourceLoading ? 'Loading audio…' : formatTime(position)}</span>
									<span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
								</div>
							</div>

							<div class="mt-3 flex items-center justify-center gap-2">
								<button
									type="button"
									class="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/15"
									onclick={() => clubMusic.skip(-1)}
									aria-label="Previous track"
								>
									<SkipBack class="size-5" />
								</button>
								<button
									type="button"
									class="flex size-11 items-center justify-center rounded-full bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30 transition hover:bg-fuchsia-400"
									onclick={togglePlayback}
									aria-label={clubMusic.playing ? 'Pause' : 'Play'}
								>
									{#if clubMusic.playing}
										<Pause class="size-5" />
									{:else}
										<Play class="size-5" />
									{/if}
								</button>
								<button
									type="button"
									class="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/15"
									onclick={() => clubMusic.skip(1)}
									aria-label="Next track"
								>
									<SkipForward class="size-5" />
								</button>
							</div>

							{#if clubMusic.playing && needsGesture}
								<button
									type="button"
									class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
									onclick={forcePlay}
								>
									<Volume2 class="size-4" />
									Tap to enable audio
								</button>
							{/if}

							{#if streamFailed}
								<!-- Respaldo: si SoundCloud no ofrece un stream progresivo,
								     se usa su reproductor embebido para esa pista. -->
								<p class="mt-3 text-[11px] text-amber-200/80">
									Direct stream unavailable for this track — using the SoundCloud player.
								</p>
								<div
									class="mt-2 overflow-hidden rounded-xl border transition-all duration-200 {showPlayer
										? 'h-[166px] border-white/10 bg-black/30'
										: 'h-0 border-transparent'}"
								>
									{#key current.id}
										<iframe
											bind:this={iframeEl}
											title="SoundCloud player"
											src={embedUrl(current.url)}
											allow="autoplay"
											class="h-[166px] w-full border-0"
										></iframe>
									{/key}
								</div>

								<button
									type="button"
									class="mt-2 flex w-full items-center justify-center gap-1.5 text-[11px] font-medium text-slate-400 transition hover:text-cyan-200"
									onclick={() => (showPlayer = !showPlayer)}
								>
									<Volume2 class="size-3.5" />
									{showPlayer ? 'Hide SoundCloud player' : 'Show SoundCloud player'}
								</button>
							{/if}
						{:else}
							<div class="flex flex-col items-center gap-2 py-6 text-center">
								<Music2 class="size-8 text-slate-500" />
								<p class="text-sm font-medium text-slate-300">The queue is empty</p>
								<p class="max-w-xs text-xs text-slate-500">
									Paste a public SoundCloud track link above. Everyone in the club will hear it.
								</p>
							</div>
						{/if}
					</div>

					<p class="mt-auto text-[11px] leading-relaxed text-slate-500">
						The server keeps the queue in sync for every player. If audio does not start
						automatically, tap the play button.
					</p>
				</div>

				<div class="flex min-h-0 flex-col p-5">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="text-xs font-bold tracking-[0.18em] text-slate-400">QUEUE</h3>
						<span class="text-xs text-slate-500">{clubMusic.tracks.length} tracks</span>
					</div>

					{#if clubMusic.tracks.length === 0}
						<div
							class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10"
						>
							<p class="px-6 text-center text-xs text-slate-500">
								No tracks yet. Add the first one and start the party.
							</p>
						</div>
					{:else}
						<ul class="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
							{#each clubMusic.tracks as track, index (track.id)}
								{@const active = track.id === clubMusic.currentId}
								<li>
									<div
										class="group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition {active
											? 'border-fuchsia-400/40 bg-fuchsia-500/10'
											: 'border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.07]'}"
									>
										<button
											type="button"
											class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
											onclick={() => selectTrack(track)}
										>
											<span
												class="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums {active
													? 'text-fuchsia-300'
													: 'text-slate-500'}"
											>
												{#if active && clubMusic.playing}
													<span class="inline-flex items-end gap-[2px]">
														<span class="juke-bar h-2.5"></span>
														<span class="juke-bar h-3.5 [animation-delay:120ms]"></span>
														<span class="juke-bar h-2 [animation-delay:240ms]"></span>
													</span>
												{:else}
													{index + 1}
												{/if}
											</span>
											<span class="min-w-0 flex-1">
												<span
													class="block truncate text-sm {active
														? 'font-semibold text-white'
														: 'text-slate-200'}"
												>
													{track.title}
												</span>
												<span class="block truncate text-[11px] text-slate-500">
													{track.author} · {track.addedBy}
												</span>
											</span>
										</button>
										<button
											type="button"
											class="rounded-md p-1.5 text-slate-500 opacity-70 transition group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-300"
											onclick={() => clubMusic.remove(track.id)}
											aria-label={`Remove ${track.title}`}
										>
											<Trash2 class="size-4" />
										</button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</section>
	</div>
{/if}

<style>
	@keyframes juke-bar {
		0%,
		100% {
			transform: scaleY(0.35);
		}
		50% {
			transform: scaleY(1);
		}
	}

	.juke-bar {
		display: inline-block;
		width: 2px;
		border-radius: 9999px;
		background: linear-gradient(to top, #ff2fd6, #22d3ee);
		transform-origin: bottom;
		animation: juke-bar 0.7s ease-in-out infinite;
	}
</style>
