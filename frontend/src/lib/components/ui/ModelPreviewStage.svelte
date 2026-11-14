<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { untrack } from 'svelte';
	import {
		AnimationMixer,
		Box3,
		Group,
		LoopRepeat,
		Mesh,
		Vector3,
		type AnimationClip,
		type Object3D,
		type PerspectiveCamera
	} from 'three';
	import { asset } from '../../assets/path';

	interface Props {
		url: string;
		accent: string;
	}

	let { url, accent }: Props = $props();

	const gltf = useGltf(
		untrack(() => asset(url)),
		{
			dracoLoader: useDraco(asset('draco/'))
		}
	);

	const turntable = new Group();
	let elapsed = 0;
	let camera = $state<PerspectiveCamera>();
	let source: Object3D | null = null;
	let prepared: Object3D | null = null;
	let mixer: AnimationMixer | null = null;

	$effect(() => {
		camera?.lookAt(0, 0.9, 0);
	});

	$effect(() => {
		return () => {
			mixer?.stopAllAction();
			mixer = null;
		};
	});

	// Rotate, float and play any baked clip (the coin pistol has a `Fire` anim).
	useTask((delta) => {
		elapsed += delta;
		turntable.rotation.y = Math.PI + elapsed * 0.3;
		turntable.position.y = 0.06 + Math.sin(elapsed * 1.5) * 0.06;
		mixer?.update(delta);
	});

	/**
	 * Center, scale and ground the GLB so weapons, props and rides all fill the
	 * same turntable. The clone is needed because `useGltf` caches the scene.
	 */
	function prepare(scene: Object3D, clips: readonly AnimationClip[]): Object3D {
		if (source === scene && prepared) {
			return prepared;
		}

		source = scene;
		const clone = scene.clone(true);
		clone.updateMatrixWorld(true);

		const bounds = new Box3().setFromObject(clone);
		const size = new Vector3();
		const center = new Vector3();
		bounds.getSize(size);
		bounds.getCenter(center);

		const longest = Math.max(size.x, size.y, size.z);
		const scale = longest > 0 ? 2.2 / longest : 1;

		clone.scale.setScalar(scale);
		clone.position.set(-center.x * scale, -bounds.min.y * scale + 0.01, -center.z * scale);

		clone.traverse((child) => {
			if ((child as Mesh).isMesh) {
				child.castShadow = true;
				child.receiveShadow = false;
			}
		});

		prepared = clone;

		if (clips.length > 0) {
			mixer = new AnimationMixer(clone);

			for (const clip of clips) {
				mixer.clipAction(clip).setLoop(LoopRepeat, Infinity).play();
			}
		}

		return clone;
	}
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
<T.PointLight position={[0, 2.8, 3.2]} intensity={8} distance={14} decay={2} color={accent} />

<!-- Same stage as the car turntable, tinted with the item accent. -->
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
	<T.CircleGeometry args={[2.6, 64]} />
	<T.MeshStandardMaterial color="#0b1020" transparent opacity={0.9} roughness={0.9} metalness={0} />
</T.Mesh>
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
	<T.RingGeometry args={[2.48, 2.58, 64]} />
	<T.MeshBasicMaterial color={accent} transparent opacity={0.65} />
</T.Mesh>
<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
	<T.RingGeometry args={[1.7, 1.74, 64]} />
	<T.MeshBasicMaterial color={accent} transparent opacity={0.24} />
</T.Mesh>

{#await gltf}
	<!-- The poster/blank stage remains visible while the GLB loads. -->
{:then loaded}
	<T is={turntable}>
		<T is={prepare(loaded.scene, loaded.animations)} dispose={false} />
	</T>
{/await}
