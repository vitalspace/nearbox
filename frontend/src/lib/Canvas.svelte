<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { World, Debug } from '@threlte/rapier';
	import { onMount } from 'svelte';
	import LoadingScreen from './components/ui/LoadingScreen.svelte';
	import MobileControls from './components/ui/MobileControls.svelte';
	import CarHud from './components/ui/CarHud.svelte';
	import CarPrompt from './components/ui/CarPrompt.svelte';
	import AssetPreloader from './loaders/AssetPreloader.svelte';
	import { gameAssets } from './loaders/gameAssets.svelte';
	import Scene from './Scene.svelte';

	interface Props {
		/** Monta el mundo 3D (Rapier/Threlte) una vez que el jugador puede jugar. */
		sceneEnabled?: boolean;
		/** Mantiene el splash visible mientras se restaura la sesión. */
		splashHold?: boolean;
	}

	let { sceneEnabled = true, splashHold = false }: Props = $props();

	let debug = $state(false);
	let retryToken = $state(0);

	// The scene (and the Rapier world) is not mounted until all GLBs
	// are in the `useLoader` cache. The preloader lives inside the Canvas
	// to share that cache with `useGltf`.
	const ready = $derived(gameAssets.status === 'ready');

	onMount(() => {
		debug = new URLSearchParams(window.location.search).has('physics');
	});

	function retry(): void {
		retryToken += 1;
	}
</script>

<div class="relative h-screen w-full touch-none overflow-hidden select-none">
	<Canvas>
		<AssetPreloader {retryToken} />

		{#if ready && sceneEnabled}
			<World>
				{#if debug}
					<Debug />
				{/if}
				<Scene />
			</World>
		{/if}
	</Canvas>

	<!-- The controls are HTML: they must live outside the 3D canvas to be visible and receive touches. -->
	{#if ready && sceneEnabled}
		<CarPrompt />
		<CarHud />
		<MobileControls />
	{/if}

	<LoadingScreen onRetry={retry} hold={splashHold} />
</div>
