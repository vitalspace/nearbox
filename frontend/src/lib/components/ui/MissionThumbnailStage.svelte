<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Group, type PerspectiveCamera } from 'three';
	import CarModel from '../cars/CarModel.svelte';
	import Skull from '../minigame2/Skull.svelte';
	import Cat from '../world/Cat.svelte';
	import { CAR_MODEL_URLS } from '../../state/carConfig';

	interface Props {
		kind: 'cats' | 'crypt' | 'race';
	}

	let { kind }: Props = $props();

	const ACCENTS = {
		cats: { ring: '#fbbf24', point: '#fb923c' },
		crypt: { ring: '#a78bfa', point: '#8b5cf6' },
		race: { ring: '#fb7185', point: '#f43f5e' }
	} as const;

	// Each thumbnail gets its own framing: the cat is ~1 m tall, the skull is
	// a ~0.5 m procedural prop and the car is ~5.5 m long.
	const CAMERAS: Record<
		'cats' | 'crypt' | 'race',
		{ position: [number, number, number]; target: [number, number, number] }
	> = {
		cats: { position: [0, 0.9, 2.75], target: [0, 0.5, 0] },
		crypt: { position: [0, 0.58, 2.15], target: [0, 0.36, 0] },
		race: { position: [0, 3.2, 11.5], target: [0, 1.05, 0] }
	};

	const accent = $derived(ACCENTS[kind]);
	const framing = $derived(CAMERAS[kind]);

	let camera = $state<PerspectiveCamera>();
	const turntable = new Group();
	let elapsed = 0;

	$effect(() => {
		const target = framing.target;
		camera?.lookAt(target[0], target[1], target[2]);
	});

	// Slow showcase rotation. The skull already spins on its own, so it stays
	// still here to avoid two rotations fighting each other.
	useTask((delta) => {
		if (kind === 'crypt') {
			return;
		}

		elapsed += delta;
		turntable.rotation.y = Math.PI + elapsed * (kind === 'race' ? 0.28 : 0.55);
	});
</script>

<T.PerspectiveCamera
	makeDefault
	bind:ref={camera}
	position={framing.position}
	fov={30}
	near={0.1}
	far={40}
/>

<T.AmbientLight intensity={1.5} />
<T.DirectionalLight position={[3, 5.5, 3.5]} intensity={2.5} />
<T.DirectionalLight position={[-3, 2, -2.5]} intensity={1.2} color="#c4b5fd" />
<T.PointLight position={[0, 2.2, 2.4]} intensity={6} distance={9} decay={2} color={accent.point} />

<!-- Dark platform that grounds the miniature (the car preview is shown alone). -->
{#if kind !== 'race'}
	<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
		<T.CircleGeometry args={[0.95, 48]} />
		<T.MeshStandardMaterial
			color="#0b1020"
			transparent
			opacity={0.85}
			roughness={0.9}
			metalness={0}
		/>
	</T.Mesh>
	<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
		<T.RingGeometry args={[0.9, 0.97, 48]} />
		<T.MeshBasicMaterial color={accent.ring} transparent opacity={0.5} />
	</T.Mesh>
{/if}

<T is={turntable}>
	{#if kind === 'cats'}
		<Cat
			cat={{
				id: 'cat-06',
				name: 'Preview',
				zone: 'centro',
				position: { x: 0, y: 0, z: 0 }
			}}
		/>
	{:else if kind === 'crypt'}
		<Skull position={[0, 0.32, 0]} scale={1.4} />
	{:else if kind === 'race'}
		<T.Group position={[0, 1, 0]}>
			<CarModel modelUrl={CAR_MODEL_URLS.coche_calabaza} />
		</T.Group>
	{/if}
</T>
