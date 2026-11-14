<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Group, type PerspectiveCamera } from 'three';
	import type { CarId, CarModel as CarModelId } from '../../services/protocol';
	import { CAR_MODEL_URLS } from '../../state/carConfig';
	import CarModel from '../cars/CarModel.svelte';

	interface Props {
		car: CarId;
	}

	let { car }: Props = $props();

	const CAR_MODELS: Record<CarId, CarModelId> = {
		'car-calabaza': 'coche_calabaza',
		'car-momia': 'coche_momia',
		'car-halloween': 'coche_halloween'
	};

	const turntable = new Group();
	let elapsed = 0;
	let camera = $state<PerspectiveCamera>();

	$effect(() => {
		camera?.lookAt(0, 0.7, 0);
	});

	// Rotate the car on a turntable so every side of the model can be seen.
	useTask((delta) => {
		elapsed += delta;
		turntable.rotation.y = Math.PI + elapsed * 0.28;
	});
</script>

<T.PerspectiveCamera
	makeDefault
	bind:ref={camera}
	position={[0, 1.9, 6.7]}
	fov={32}
	near={0.1}
	far={40}
/>

<T.AmbientLight intensity={1.5} />
<T.DirectionalLight position={[3.5, 6, 4]} intensity={2.6} castShadow />
<T.DirectionalLight position={[-4, 2.5, -3]} intensity={1.4} color="#c4b5fd" />
<T.PointLight position={[0, 2.8, 3.2]} intensity={8} distance={14} decay={2} color="#f43f5e" />

<!-- Dark platform: grounds the car and catches the red rim light. -->
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
	<T.CircleGeometry args={[2.6, 64]} />
	<T.MeshStandardMaterial color="#0b1020" transparent opacity={0.9} roughness={0.9} metalness={0} />
</T.Mesh>
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
	<T.RingGeometry args={[2.48, 2.58, 64]} />
	<T.MeshBasicMaterial color="#f43f5e" transparent opacity={0.65} />
</T.Mesh>
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
	<T.RingGeometry args={[1.7, 1.74, 64]} />
	<T.MeshBasicMaterial color="#fb7185" transparent opacity={0.24} />
</T.Mesh>

<T is={turntable}>
	<T.Group position={[0, 1, 0]}>
		<CarModel modelUrl={CAR_MODEL_URLS[CAR_MODELS[car]]} />
	</T.Group>
</T>
