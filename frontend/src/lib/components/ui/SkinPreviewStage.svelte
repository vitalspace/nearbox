<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { Readable } from 'svelte/store';
	import { Group, type AnimationAction } from 'three';
	import type { SkinId } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';
	import PlayerSkin from '../player/PlayerSkin.svelte';

	interface Props {
		skin: SkinId;
	}

	let { skin }: Props = $props();

	let actions = $state<Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined>();
	const turntable = new Group();
	let elapsed = 0;
	let current: AnimationAction | null = null;

	// The idle clip is the only animation used in the preview. It is played as
	// soon as the skin exposes its mapped `HR_*` actions.
	$effect(() => {
		const store = actions;

		if (!store) {
			return;
		}

		const unsubscribe = store.subscribe(($actions) => {
			const idle = $actions?.HR_idle;

			if (!idle || idle === current) {
				return;
			}

			current?.fadeOut(0.2);
			idle.reset().fadeIn(0.2).play();
			current = idle;
		});

		return () => {
			unsubscribe();
			current?.stop();
			current = null;
		};
	});

	// Gentle sway instead of a full spin: the character keeps facing the camera
	// while showing a three-quarter view.
	useTask((delta) => {
		elapsed += delta;
		turntable.rotation.y = Math.sin(elapsed * 0.45) * 0.55;
	});
</script>

<T.PerspectiveCamera makeDefault position={[0, 1.2, 5.4]} fov={30} near={0.1} far={50} />

<T.AmbientLight intensity={1.5} />
<T.DirectionalLight position={[3.5, 6, 4]} intensity={2.6} castShadow />
<T.DirectionalLight position={[-4, 2.5, -3]} intensity={1.4} color="#a78bfa" />
<T.PointLight position={[0, 2.8, 3.2]} intensity={9} distance={14} decay={2} color="#fbbf24" />

<!-- Dark platform: gives the character a ground and catches its shadow. -->
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
	<T.CircleGeometry args={[1.9, 64]} />
	<T.MeshStandardMaterial
		color="#0b1020"
		transparent
		opacity={0.85}
		roughness={0.9}
		metalness={0}
	/>
</T.Mesh>
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
	<T.RingGeometry args={[1.84, 1.96, 64]} />
	<T.MeshBasicMaterial color="#f59e0b" transparent opacity={0.4} />
</T.Mesh>

<T is={turntable}>
	{#key skin}
		<PlayerSkin {skin} bind:actions />
	{/key}
</T>
