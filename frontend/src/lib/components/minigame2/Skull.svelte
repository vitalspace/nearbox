<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { untrack } from 'svelte';
	import type { Group } from 'three';
	import { BoxGeometry, MeshStandardMaterial, SphereGeometry } from 'three';

	interface Props {
		position: [number, number, number];
		phase?: number;
		scale?: number;
	}

	let { position, phase = 0, scale = 1 }: Props = $props();

	const cranium = new SphereGeometry(0.22, 16, 12);
	const jaw = new BoxGeometry(0.24, 0.12, 0.18);
	const socket = new SphereGeometry(0.05, 10, 8);
	const eye = new SphereGeometry(0.022, 8, 6);

	const bone = new MeshStandardMaterial({
		color: '#e9e0c6',
		roughness: 0.62,
		metalness: 0.04,
		emissive: '#2f4a2c',
		emissiveIntensity: 0.35
	});

	const cavity = new MeshStandardMaterial({ color: '#181410', roughness: 0.9 });
	const glow = new MeshStandardMaterial({
		color: '#9dff9a',
		emissive: '#6dff5f',
		emissiveIntensity: 2.4
	});

	let group = $state<Group>();
	let elapsed = untrack(() => phase);

	useTask((delta) => {
		elapsed += delta;

		if (!group) return;

		group.position.y = position[1] + Math.sin(elapsed * 1.9) * 0.09;
		group.rotation.y = elapsed * 1.15;
	});

	$effect(() => {
		return () => {
			cranium.dispose();
			jaw.dispose();
			socket.dispose();
			eye.dispose();
			bone.dispose();
			cavity.dispose();
			glow.dispose();
		};
	});
</script>

<T.Group bind:ref={group} {position} {scale}>
	<T.Mesh geometry={cranium} material={bone} scale={[1, 1.05, 1.1]} />

	<!-- Jaw -->
	<T.Mesh geometry={jaw} material={bone} position={[0, -0.17, 0.03]} scale={[1, 1, 0.9]} />

	<!-- Eye sockets -->
	<T.Mesh geometry={socket} material={cavity} position={[-0.09, 0.02, 0.18]} />
	<T.Mesh geometry={socket} material={cavity} position={[0.09, 0.02, 0.18]} />

	<!-- Supernatural glow -->
	<T.Mesh geometry={eye} material={glow} position={[-0.09, 0.02, 0.21]} />
	<T.Mesh geometry={eye} material={glow} position={[0.09, 0.02, 0.21]} />
</T.Group>
