<script lang="ts">
	import { useLoader } from '@threlte/core';
	import { useDraco } from '@threlte/extras';
	import { onDestroy, onMount } from 'svelte';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { buildSceneGraph } from './buildSceneGraph';
	import { gameAssets, getGameAssets } from './gameAssets.svelte';
	import { asset } from '../assets/path';

	const DRACO_DECODER_PATH = asset('draco/');

	interface Props {
		/** Cambiar este valor vuelve a intentar los recursos que hayan fallado. */
		retryToken?: number;
	}

	let { retryToken = 0 }: Props = $props();

	// La lista se decide una sola vez, al montar el componente. Solo incluye los
	// recursos del mundo base; la cripta se carga bajo demanda al entrar a
	// `minigame-2` para no retener su GLTF en memoria desde el arranque.
	const assets = getGameAssets();

	// `useLoader` comparte la caché de Threlte con `useGltf`: cuando la escena
	// se monte después, encontrará estos mismos GLTF ya resueltos.
	const { load } = useLoader(GLTFLoader, {
		extend(loader) {
			loader.setDRACOLoader(useDraco(DRACO_DECODER_PATH));
		}
	});

	let run = 0;
	let lastRetryToken: number | undefined;

	async function preload(): Promise<void> {
		const currentRun = ++run;

		gameAssets.begin(assets);

		await Promise.all(
			assets.map(async (asset) => {
				try {
					const store = load(asset.url, {
						onProgress: (event) => {
							if (currentRun === run) {
								gameAssets.update(asset.url, event);
							}
						},
						transform: (gltf) => ({
							...gltf,
							...buildSceneGraph(gltf.scene)
						})
					});

					await store;

					if (currentRun === run) {
						gameAssets.complete(asset.url);
					}
				} catch (error) {
					if (currentRun === run) {
						gameAssets.fail(asset.url, error);
					}
				}
			})
		);

		if (currentRun === run) {
			gameAssets.finish();
		}
	}

	onMount(() => {
		void preload();
	});

	$effect(() => {
		const token = retryToken;

		if (lastRetryToken === undefined) {
			lastRetryToken = token;
			return;
		}

		if (token === lastRetryToken) {
			return;
		}

		lastRetryToken = token;
		void preload();
	});

	onDestroy(() => {
		run += 1;
	});
</script>
