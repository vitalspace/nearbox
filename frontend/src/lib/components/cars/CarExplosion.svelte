<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import { MeshBasicMaterial, SphereGeometry } from 'three';

	const DURATION = 1.2;
	const geometry = new SphereGeometry(1, 18, 14);
	const material = new MeshBasicMaterial({
		color: 0xffb347,
		transparent: true,
		opacity: 0.9,
		depthWrite: false
	});

	let elapsed = 0;
	let active = $state(true);
	let scale = $state(0.5);
	let opacity = $state(0.95);

	$effect(() => {
		material.opacity = opacity;
	});

	useTask((delta) => {
		if (!active) {
			return;
		}

		elapsed += delta;
		const progress = Math.min(1, elapsed / DURATION);

		scale = 0.6 + progress * 3.6;
		opacity = Math.max(0, 0.95 * (1 - progress));

		if (progress >= 1) {
			active = false;
		}
	});

	onDestroy(() => {
		geometry.dispose();
		material.dispose();
	});
</script>

{#if active}
	<T.Group>
		<T.Mesh {geometry} {material} {scale} />
		<T.PointLight color={0xffa53a} intensity={opacity * 24} distance={14} decay={2} />
	</T.Group>
{/if}
