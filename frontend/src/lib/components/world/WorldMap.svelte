<script lang="ts">
	import { T } from '@threlte/core';
	import type { Group } from 'three';
	import { worldMaps, type WorldMapId } from '../../world/registry.generated';
	import type { PhysicsConfig } from '../../world/types';
	import CryptLighting from './CryptLighting.svelte';
	import ChunkedColliders from './ChunkedColliders.svelte';
	import Lighting from './Lighting.svelte';
	import WorldColliders from './WorldColliders.svelte';
	import VideoWall from './VideoWall.svelte';
	import PodiumGold from './PodiumGold.svelte';
	import ClubLasers from './ClubLasers.svelte';
	import TowerLights from './TowerLights.svelte';

	let { mapId }: { mapId: WorldMapId } = $props();

	const entry = $derived(worldMaps[mapId]);
	let root = $state<Group>();
</script>

{#if entry}
	{@const MapComponent = entry.component}
	<T.Group
		bind:ref={root}
		position={entry.transform.position}
		rotation={entry.transform.rotation}
		scale={entry.transform.scale}
	>
		<MapComponent />
		{#if mapId === 'map'}
			<VideoWall {root} />
			<PodiumGold {root} />
			<ClubLasers {root} />
			<TowerLights {root} />
		{/if}
		{#if entry.physics.collision?.mode === 'merged'}
			<WorldColliders mapId={entry.id} {root} config={entry.physics as PhysicsConfig} />
		{:else if entry.physics.collision?.mode === 'chunked'}
			<ChunkedColliders mapId={entry.id} {root} config={entry.physics as PhysicsConfig} />
		{/if}
	</T.Group>

	{#if entry.lighting === 'crypt'}
		<CryptLighting />
	{:else}
		<Lighting />
	{/if}
{/if}
