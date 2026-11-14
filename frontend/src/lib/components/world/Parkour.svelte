<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { onDestroy } from 'svelte';
	import { AnimationMixer } from 'three';
	import { asset } from '../../assets/path';

	/**
	 * Componente manual de `Parkour.glb`.
	 *
	 * El mapa tiene ~2 100 mallas y 57 animaciones; `@threlte/gltf` generaría un
	 * componente enorme y difícil de mantener. Montamos la escena tal cual y
	 * animamos todos los clips existentes (nubes, llamas, banderas…).
	 */
	const gltf = useGltf(asset('maps/Parkour.glb'), {
		dracoLoader: useDraco(asset('draco/'))
	});

	// Texto decorativo del tejado: la única meta es `HP_SummitTerrace`.
	const HIDDEN_NODES = ['HP_FinishSub', 'HP_FinishSub2'];

	/**
	 * Mallas apoyadas encima de las plataformas (el césped/suelo de las islas,
	 * `HP_*_Top`). Comparten plano con la plataforma de debajo y producen
	 * z-fighting (rayas y bordes dentados). Se suben 3 cm y ya está.
	 */
	const TOP_MESH_PATTERN = /_Top$/;
	const TOP_MESH_LIFT = 0.03;

	let mixer: AnimationMixer | undefined;
	let started = false;

	$effect(() => {
		const loaded = $gltf;
		if (!loaded || started) return;

		for (const name of HIDDEN_NODES) {
			const node = loaded.scene.getObjectByName(name);
			if (node) node.visible = false;
		}

		loaded.scene.traverse((node) => {
			if (!TOP_MESH_PATTERN.test(node.name)) return;

			// `useGltf` cachea la escena: recordar la Y original evita que la
			// malla suba otros 3 cm cada vez que se vuelve a entrar al mapa.
			const baseY = node.userData.parkourBaseY ?? node.position.y;
			node.userData.parkourBaseY = baseY;
			node.position.y = baseY + TOP_MESH_LIFT;
		});

		mixer = new AnimationMixer(loaded.scene);
		for (const clip of loaded.animations) {
			mixer.clipAction(clip).play();
		}

		started = true;

		if (import.meta.env.DEV) {
			console.info(`[parkour] ${loaded.animations.length} clips del mapa en marcha`);
		}
	});

	useTask((delta) => {
		mixer?.update(delta);
	});

	onDestroy(() => {
		mixer?.stopAllAction();
		mixer = undefined;
	});
</script>

{#if $gltf}
	<T is={$gltf.scene} />
{/if}
