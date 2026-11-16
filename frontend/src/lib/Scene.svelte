<script lang="ts">
	import Checkpoints from './components/world/Checkpoints.svelte';
	import ClubMusicBooth from './components/world/ClubMusicBooth.svelte';
	import Kiosks from './components/world/Kiosks.svelte';
	import Cats from './components/world/Cats.svelte';
	import NpcPopulation from './components/npc/NpcPopulation.svelte';
	import NpcDebug from './components/npc/NpcDebug.svelte';
	import Sky from './components/world/Sky.svelte';
	import WorldMap from './components/world/WorldMap.svelte';
	import Mummies from './components/minigame2/Mummies.svelte';
	import RemotePlayers from './components/minigame2/RemotePlayers.svelte';
	import Skulls from './components/minigame2/Skulls.svelte';
	import TombZone from './components/minigame2/TombZone.svelte';
	import CryptSession from './components/minigame2/CryptSession.svelte';
	import Player from './components/player/Player.svelte';
	import RemoteHeroes from './components/player/RemoteHeroes.svelte';
	import PaperRolls from './components/player/PaperRolls.svelte';
	import Cars from './components/cars/Cars.svelte';
	import CarControls from './components/cars/CarControls.svelte';
	import RoadmapCar from './components/cars/RoadmapCar.svelte';
	import RoadmapControls from './components/roadmap/RoadmapControls.svelte';
	import RaceCars from './components/race/RaceCars.svelte';
	import RaceGates from './components/race/RaceGates.svelte';
	import RaceGuardrail from './components/race/RaceGuardrail.svelte';
	import RaceItems from './components/race/RaceItems.svelte';
	import RaceMines from './components/race/RaceMines.svelte';
	import RaceMissiles from './components/race/RaceMissiles.svelte';
	import RaceRays from './components/race/RaceRays.svelte';
	import WaveCar from './components/waves/WaveCar.svelte';
	import WaveCarControls from './components/waves/WaveCarControls.svelte';
	import WaveControls from './components/waves/WaveControls.svelte';
	import WaveDrops from './components/waves/WaveDrops.svelte';
	import WaveMonsters from './components/waves/WaveMonsters.svelte';
	import WavePools from './components/waves/WavePools.svelte';
	import WaveProjectiles from './components/waves/WaveProjectiles.svelte';
	import WaveRemotes from './components/waves/WaveRemotes.svelte';
	import WaveSession from './components/waves/WaveSession.svelte';
	import WaveSpawnPortals from './components/waves/WaveSpawnPortals.svelte';
	import WaveTracers from './components/waves/WaveTracers.svelte';
	import DeathmatchControls from './components/deathmatch/DeathmatchControls.svelte';
	import DeathmatchPickups from './components/deathmatch/DeathmatchPickups.svelte';
	import DeathmatchProjectiles from './components/deathmatch/DeathmatchProjectiles.svelte';
	import DeathmatchRemotes from './components/deathmatch/DeathmatchRemotes.svelte';
	import DeathmatchSession from './components/deathmatch/DeathmatchSession.svelte';
	import DeathmatchSpawnPads from './components/deathmatch/DeathmatchSpawnPads.svelte';
	import ParkourAttackFx from './components/parkour/ParkourAttackFx.svelte';
	import ParkourBeacons from './components/parkour/ParkourBeacons.svelte';
	import ParkourRemotes from './components/parkour/ParkourRemotes.svelte';
	import ParkourSession from './components/parkour/ParkourSession.svelte';
	import ParkourWardens from './components/parkour/ParkourWardens.svelte';
	import RoyaleControls from './components/royale/RoyaleControls.svelte';
	import RoyaleDrop from './components/royale/RoyaleDrop.svelte';
	import RoyaleLoot from './components/royale/RoyaleLoot.svelte';
	import RoyaleProjectiles from './components/royale/RoyaleProjectiles.svelte';
	import RoyaleRemotes from './components/royale/RoyaleRemotes.svelte';
	import RoyaleSession from './components/royale/RoyaleSession.svelte';
	import RoyaleSpectator from './components/royale/RoyaleSpectator.svelte';
	import RoyaleStorm from './components/royale/RoyaleStorm.svelte';
	import RoyaleVehicleControls from './components/royale/RoyaleVehicleControls.svelte';
	import RoyaleVehicles from './components/royale/RoyaleVehicles.svelte';
	import ThirdPersonCamera from './components/camera/ThirdPersonCamera.svelte';
	import CrosshairTracker from './components/combat/CrosshairTracker.svelte';
	import SceneAudio from './components/audio/SceneAudio.svelte';
	import { race } from './state/race.svelte';
	import { minigame5 } from './state/minigame5.svelte';
	import { minigame6 } from './state/minigame6.svelte';
	import { minigame7 } from './state/minigame7.svelte';
	import { minigame8 } from './state/minigame8.svelte';
	import { sceneState } from './state/sceneState.svelte';
	import { useThrelte } from '@threlte/core';

	const npcDebug =
		import.meta.env.DEV &&
		typeof window !== 'undefined' &&
		new URLSearchParams(window.location.search).has('npcs');

	// TEMP PERF DEBUG
	const __threlte = useThrelte();
	if (import.meta.env.DEV && typeof window !== 'undefined') {
		(window as any).__three = __threlte;
	}
</script>

<ThirdPersonCamera />
<CrosshairTracker />

<SceneAudio />
<Player />
<PaperRolls />

{#if sceneState.inCrypt}
	<WorldMap mapId="crypt" />
	<Skulls />
	<Mummies />
	<RemotePlayers />
	<TombZone />
	<CryptSession />
{:else}
	<WorldMap mapId={sceneState.active} />
	{#if sceneState.inGlobal}
		{#if !sceneState.inRace}
			<RemoteHeroes />
			<Cars />
			<CarControls />
			<Checkpoints />
			<Kiosks />
			<ClubMusicBooth />
			<Cats />
			<NpcPopulation />
			{#if npcDebug}
				<NpcDebug />
			{/if}
		{/if}
		<Sky />
	{:else if sceneState.inRoadmap}
		<Sky />
		{#if !sceneState.inRace}
			<RoadmapCar />
			<RoadmapControls />
		{/if}
	{:else if sceneState.inWaves || sceneState.inDeathmatch || sceneState.inRoyale}
		<Sky />
	{/if}

	{#if sceneState.inRace}
		{#if sceneState.inGrandPrix}
			<RaceGuardrail />
		{/if}
		<RaceGates />
		{#if race.snapshot}
			<RaceCars />
			<RaceItems />
			<RaceMines />
			<RaceMissiles />
			<RaceRays />
		{/if}
	{/if}

	{#if sceneState.inWaves}
		<WaveSession />
		<WaveControls />
		<WaveCarControls />
		{#if minigame5.snapshot}
			<WaveMonsters />
			<WaveRemotes />
			<WaveDrops />
			<WavePools />
			<WaveProjectiles />
			<WaveTracers />
			<WaveSpawnPortals />
			<WaveCar />
		{/if}
	{/if}

	{#if sceneState.inDeathmatch}
		<DeathmatchSession />
		<DeathmatchControls />
		{#if minigame6.snapshot}
			<DeathmatchRemotes />
			<DeathmatchPickups />
			<DeathmatchSpawnPads />
			<DeathmatchProjectiles />
		{/if}
	{/if}

	{#if sceneState.inParkour}
		<ParkourSession />
		<ParkourWardens />
		<ParkourBeacons />
		<ParkourAttackFx />
		{#if minigame7.snapshot}
			<ParkourRemotes />
		{/if}
	{/if}

	{#if sceneState.inRoyale}
		<RoyaleSession />
		<RoyaleDrop />
		<RoyaleStorm />
		<RoyaleControls />
		<RoyaleVehicleControls />
		<RoyaleSpectator />
		{#if minigame8.snapshot}
			<RoyaleRemotes />
			<RoyaleLoot />
			<RoyaleProjectiles />
			<RoyaleVehicles />
		{/if}
	{/if}
{/if}
