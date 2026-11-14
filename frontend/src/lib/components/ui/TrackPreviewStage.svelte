<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Group, type PerspectiveCamera } from 'three';
	import TrackPreviewModel from './TrackPreviewModel.svelte';
	import type { TrackId } from './trackPreview';

	interface Props {
		track: TrackId;
		loaded?: boolean;
		failed?: boolean;
	}

	let { track, loaded = $bindable(false), failed = $bindable(false) }: Props = $props();

	const ACCENTS: Record<TrackId, { ring: string; point: string }> = {
		'grand-prix': { ring: '#fb7185', point: '#f43f5e' },
		roadmap: { ring: '#22d3ee', point: '#38bdf8' }
	};

	const accent = $derived(ACCENTS[track]);
	const turntable = new Group();
	let elapsed = 0;

	// Gentle sway instead of a full spin: the track keeps most of its
	// recognisable silhouette while still catching the moving light.
	useTask((delta) => {
		elapsed += delta;
		turntable.rotation.y = Math.sin(elapsed * 0.32) * 0.62;
	});

	let camera = $state<PerspectiveCamera>();

	$effect(() => {
		camera?.lookAt(0, 0.55, 0);
	});
</script>

<T.PerspectiveCamera
	makeDefault
	bind:ref={camera}
	position={[0, 3.9, 6.7]}
	fov={30}
	near={0.1}
	far={80}
/>

<T.AmbientLight intensity={1.45} />
<T.DirectionalLight position={[4, 7.5, 5]} intensity={2.5} />
<T.DirectionalLight position={[-5, 3.5, -4]} intensity={1.15} color="#c4b5fd" />
<T.PointLight position={[0, 3.1, 4.2]} intensity={9} distance={14} decay={2} color={accent.point} />

<!-- Dark platform: grounds the miniature and catches the accent glow. -->
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
	<T.CircleGeometry args={[3.2, 64]} />
	<T.MeshStandardMaterial color="#0d0b1e" transparent opacity={0.9} roughness={0.9} metalness={0} />
</T.Mesh>
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
	<T.RingGeometry args={[3.02, 3.18, 64]} />
	<T.MeshBasicMaterial color={accent.ring} transparent opacity={0.8} />
</T.Mesh>
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
	<T.RingGeometry args={[2.06, 2.12, 64]} />
	<T.MeshBasicMaterial color={accent.ring} transparent opacity={0.25} />
</T.Mesh>

<T is={turntable}>
	{#key track}
		<TrackPreviewModel {track} bind:loaded bind:failed />
	{/key}
</T>
