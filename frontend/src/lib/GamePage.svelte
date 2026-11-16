<script lang="ts">
	import { onMount } from 'svelte';
	import Canvas from '#lib/Canvas.svelte';
	import AudioBootstrap from '#lib/components/audio/AudioBootstrap.svelte';
	import AudioDebug from '#lib/components/audio/AudioDebug.svelte';
	import Guardian from '#lib/components/Guardian.svelte';
	import CatPrompt from '#lib/components/ui/CatPrompt.svelte';
	import ChatOverlay from '#lib/components/ui/ChatOverlay.svelte';
	import CheckpointPrompt from '#lib/components/ui/CheckpointPrompt.svelte';
	import ClubMusic from '#lib/components/ui/ClubMusic.svelte';
	import KioskPrompt from '#lib/components/ui/KioskPrompt.svelte';
	import NpcPrompt from '#lib/components/ui/NpcPrompt.svelte';
	import ShopPanel from '#lib/components/ui/ShopPanel.svelte';
	import TourismPanel from '#lib/components/ui/TourismPanel.svelte';
	import NpcDialog from '#lib/components/ui/NpcDialog.svelte';
	import AnimationPalette from '#lib/components/ui/AnimationPalette.svelte';
	import AimCrosshair from '#lib/components/combat/AimCrosshair.svelte';
	import TrackSelectDialog from '#lib/components/ui/TrackSelectDialog.svelte';
	import MissionHud from '#lib/components/ui/MissionHud.svelte';
	import OnboardingOverlay from '#lib/components/ui/OnboardingOverlay.svelte';
	import DepositPrompt from '#lib/components/minigame2/DepositPrompt.svelte';
	import CryptLoadingOverlay from '#lib/components/minigame2/CryptLoadingOverlay.svelte';
	import Minijuego2Hud from '#lib/components/minigame2/Minijuego2Hud.svelte';
	import RoundOverlay from '#lib/components/minigame2/RoundOverlay.svelte';
	import RaceControls from '#lib/components/race/RaceControls.svelte';
	import RaceHud from '#lib/components/race/RaceHud.svelte';
	import RaceOverlay from '#lib/components/race/RaceOverlay.svelte';
	import WaveHud from '#lib/components/waves/WaveHud.svelte';
	import WaveOverlay from '#lib/components/waves/WaveOverlay.svelte';
	import DeathmatchHud from '#lib/components/deathmatch/DeathmatchHud.svelte';
	import DeathmatchKillfeed from '#lib/components/deathmatch/DeathmatchKillfeed.svelte';
	import DeathmatchOverlay from '#lib/components/deathmatch/DeathmatchOverlay.svelte';
	import DeathmatchTop5 from '#lib/components/deathmatch/DeathmatchTop5.svelte';
	import ParkourHud from '#lib/components/parkour/ParkourHud.svelte';
	import ParkourOverlay from '#lib/components/parkour/ParkourOverlay.svelte';
	import RoyaleHud from '#lib/components/royale/RoyaleHud.svelte';
	import RoyaleKillfeed from '#lib/components/royale/RoyaleKillfeed.svelte';
	import RoyaleMinimap from '#lib/components/royale/RoyaleMinimap.svelte';
	import RoyaleOverlay from '#lib/components/royale/RoyaleOverlay.svelte';
	import RoyaleTopAlive from '#lib/components/royale/RoyaleTopAlive.svelte';
	import RoadmapHud from '#lib/components/roadmap/RoadmapHud.svelte';
	import SettingsMenu from '#lib/components/ui/SettingsMenu.svelte';
	import { gameAssets } from '#lib/loaders/gameAssets.svelte.ts';
	import { authSession } from '#lib/state/auth.svelte.ts';
	import { cars } from '#lib/state/cars.svelte.ts';
	import { chat } from '#lib/state/chat.svelte.ts';
	import { cosmetics } from '#lib/state/cosmetics.svelte.ts';
	import { equipment } from '#lib/state/equipment.svelte.ts';
	import { hubKiosks } from '#lib/state/hubKiosks.svelte.ts';
	import { nftOwnership } from '#lib/state/nftOwnership.svelte.ts';
	import { lobby } from '#lib/state/lobby.svelte.ts';
	import { minigame2 } from '#lib/state/minigame2.svelte.ts';
	import { missions } from '#lib/state/missions.svelte.ts';
	import { npcs } from '#lib/state/npcs.svelte.ts';
	import { playerProfile } from '#lib/state/playerProfile.svelte.ts';
	import { playerSettings } from '#lib/state/playerSettings.svelte.ts';
	import { progression } from '#lib/state/progression.svelte.ts';
	import { ride } from '#lib/state/ride.svelte.ts';
	import { roadmapCar } from '#lib/state/roadmapCar.svelte.ts';
	import { sceneState } from '#lib/state/sceneState.svelte.ts';
	import { stats } from '#lib/state/stats.svelte.ts';
	import { minigame5 } from '#lib/state/minigame5.svelte.ts';

	// TEMP PERF DEBUG
	if (import.meta.env.DEV && typeof window !== 'undefined') {
		(window as any).__debug = { lobby, minigame5, sceneState };
	}

	let showAudioDebug = $state(false);

	// The player connects on their own: no visible lobby panel.
	onMount(() => {
		showAudioDebug =
			import.meta.env.DEV && new URLSearchParams(window.location.search).has('audio');

		playerSettings.init();
		playerProfile.init();
		nftOwnership.init();
		equipment.init();
		missions.init(playerProfile.playerId);
		npcs.init(playerProfile.playerId);
		cosmetics.init();
		lobby.init();

		return () => {
			lobby.disconnect();
			missions.destroy();
			npcs.destroy();
			progression.destroy();
			stats.destroy();
			playerProfile.destroy();
		};
	});

	// La sesión se restaura en `+layout.svelte` mientras corre el splash. La
	// escena y el WebSocket no se montan hasta que haya cuenta NEAR lista: así
	// nadie aparece en el lobby antes de iniciar sesión.
	const authReady = $derived(!authSession.loading);
	const canPlay = $derived(authReady && authSession.canPlay);

	// El inventario NFT y el loadout son por cuenta. Al restaurar la sesión se
	// carga la caché local y se refresca la propiedad on-chain en segundo plano.
	$effect(() => {
		if (authSession.loading) return;

		const accountId = authSession.accountId;

		equipment.setAccount(accountId);
		nftOwnership.setAccount(accountId);
	});

	// Las stats usan la cuenta NEAR como identidad estable. El modo invitado usa
	// el UUID local (el backend lo acepta como identidad sin dueño). El UUID
	// antiguo solo se migra una vez, así que borrar `localStorage` no pierde nada.
	const identityId = $derived(authSession.isGuest ? playerProfile.playerId : authSession.accountId);
	let statsAccountId = '';

	$effect(() => {
		if (!canPlay) {
			return;
		}

		const accountId = identityId;

		if (!accountId || statsAccountId === accountId) {
			return;
		}

		statsAccountId = accountId;
		stats.init(accountId, { legacyPlayerId: playerProfile.playerId });
	});

	// La Central de progresión usa la misma identidad que las stats.
	let progressionAccountId = '';

	$effect(() => {
		if (!canPlay) {
			return;
		}

		const accountId = identityId;

		if (!accountId || progressionAccountId === accountId) {
			return;
		}

		progressionAccountId = accountId;
		progression.init(accountId, { legacyPlayerId: playerProfile.playerId });
	});

	let lobbyConnected = false;

	$effect(() => {
		if (!canPlay) {
			if (lobbyConnected) {
				lobbyConnected = false;
				lobby.disconnect();
			}

			return;
		}

		if (lobbyConnected) return;

		lobbyConnected = true;
		lobby.connect();
	});

	// Every skin change (settings, onboarding, mission reward or another tab)
	// is published so remote players redraw this avatar with the same model.
	$effect(() => {
		lobby.sendPlayerSkin(cosmetics.equippedSkin);
	});

	// Alias and skin are stored with the stats so the podium can render the
	// player even when they are offline.
	$effect(() => {
		void cosmetics.equippedSkin;
		void playerProfile.alias;

		stats.syncProfile();
	});

	// Completing a mission in this session unlocks its reward. On startup,
	// `cosmetics.init()` already syncs the completed missions.
	$effect(() => {
		void missions.completionSeq;
		void missions.completed;

		cosmetics.syncUnlocks();
	});

	// The crypt room is authoritative for the round: a `won` phase means the
	// team deposited the ten skulls. Record that victory locally so the mummy
	// skin stays unlocked across sessions.
	$effect(() => {
		if (minigame2.phase === 'won') {
			missions.completeCryptMission();
		}
	});
	// The scene (and the Rapier world) is not mounted until all the GLBs
	// are in the `useLoader` cache. The preloader lives inside the Canvas
	// to share that cache with `useGltf`.
	const gameReady = $derived(gameAssets.status === 'ready');
	const needsOnboarding = $derived(
		gameReady && playerProfile.playerId !== '' && !playerProfile.onboardingCompleted
	);

	// Kiosk panels are modal and only belong to the outdoor hub. Leaving the
	// map, starting the onboarding or opening the chat closes them; the shop
	// and the tourism office also close themselves when settings opens.
	$effect(() => {
		if (
			!gameReady ||
			needsOnboarding ||
			!sceneState.inHub ||
			chat.isOpen ||
			cars.isDriving ||
			ride.isRiding
		) {
			hubKiosks.reset();
		}
	});
</script>

<Canvas sceneEnabled={canPlay} splashHold={!authReady} />
<AudioBootstrap />
{#if showAudioDebug}
	<AudioDebug />
{/if}
{#if gameReady && authReady}
	<Guardian>
		{#if needsOnboarding}
			<OnboardingOverlay />
		{:else}
			<CatPrompt />
			<CheckpointPrompt />
			<ClubMusic />
			<NpcPrompt />
			<KioskPrompt />
			<ShopPanel />
			<TourismPanel />
			<NpcDialog />
			<TrackSelectDialog />
			<ChatOverlay />
			{#if !sceneState.inWaves && !sceneState.inDeathmatch && !sceneState.inParkour && !sceneState.inRoyale}
				<MissionHud />
			{/if}
			<SettingsMenu />
			<AnimationPalette />

			{#if sceneState.inRoadmap && !sceneState.inRace}
				<RoadmapHud />
				<div class="fixed top-16 right-3 z-40 flex gap-2">
					<button
						type="button"
						class="rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 shadow-lg backdrop-blur-sm hover:bg-white/20"
						onclick={() => roadmapCar.requestReset()}
					>
						Reset car
					</button>
					<button
						type="button"
						class="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-cyan-950 shadow-lg hover:bg-cyan-400"
						onclick={() => sceneState.resetMap()}
					>
						Back to map
					</button>
				</div>
			{/if}

			{#if sceneState.inCrypt}
				<CryptLoadingOverlay />
				<Minijuego2Hud />
				<RoundOverlay />
				<DepositPrompt />
			{/if}

			{#if sceneState.inRace}
				<RaceHud />
				<RaceOverlay />
				<RaceControls />
			{/if}

			{#if sceneState.inWaves}
				<AimCrosshair mode="waves" />
				<WaveHud />
				<WaveOverlay />
			{/if}

			{#if sceneState.inDeathmatch}
				<AimCrosshair mode="deathmatch" />
				<DeathmatchHud />
				<DeathmatchTop5 />
				<DeathmatchKillfeed />
				<DeathmatchOverlay />
			{/if}

			{#if sceneState.inParkour}
				<ParkourHud />
				<ParkourOverlay />
			{/if}

			{#if sceneState.inRoyale}
				<AimCrosshair mode="royale" />
				<RoyaleHud />
				<RoyaleMinimap />
				<RoyaleTopAlive />
				<RoyaleKillfeed />
				<RoyaleOverlay />
			{/if}
		{/if}
	</Guardian>
{/if}
