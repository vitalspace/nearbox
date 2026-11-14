<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import { AdditiveBlending, DoubleSide, MeshBasicMaterial, RingGeometry, type Mesh } from 'three';
	import { ARENA_FLOOR_Y } from '../../state/wavesConfig';

	interface Props {
		x: number;
		z: number;
		onDone?: () => void;
	}

	let { x, z, onDone }: Props = $props();

	const DURATION = 1.1;

	// The ring marks the grenade's landing point. It pulses once and fades so
	// it does not clutter the arena while several throws are in the air.
	const geometry = new RingGeometry(0.72, 0.9, 40);
	const coreGeometry = new RingGeometry(0.28, 0.36, 32);
	const material = new MeshBasicMaterial({
		color: 0xfbbf24,
		transparent: true,
		opacity: 0.9,
		depthWrite: false,
		side: DoubleSide,
		blending: AdditiveBlending
	});

	let outer = $state<Mesh>();
	let inner = $state<Mesh>();
	let elapsed = 0;
	let active = $state(true);

	useTask((delta) => {
		if (!active) {
			return;
		}

		elapsed += delta;
		const progress = Math.min(1, elapsed / DURATION);

		material.opacity = 0.9 * (1 - progress) ** 1.2;
		outer?.scale.setScalar(0.55 + progress * 0.9);
		inner?.scale.setScalar(0.35 + progress * 0.45);

		if (progress >= 1) {
			active = false;
			onDone?.();
		}
	});

	onDestroy(() => {
		geometry.dispose();
		coreGeometry.dispose();
		material.dispose();
	});
</script>

{#if active}
	<T.Group position={[x, ARENA_FLOOR_Y + 0.035, z]} rotation={[-Math.PI / 2, 0, 0]}>
		<T.Mesh bind:ref={outer} {geometry} {material} />
		<T.Mesh bind:ref={inner} geometry={coreGeometry} {material} />
	</T.Group>
{/if}
