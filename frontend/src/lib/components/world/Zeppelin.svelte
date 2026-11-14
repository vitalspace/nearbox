<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { AnimationMixer, Group, LoopRepeat, type AnimationClip, type Object3D } from 'three';
	import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
	import { onDestroy, untrack } from 'svelte';
	import { asset } from '../../assets/path';

	type Vector3Tuple = [number, number, number];

	let {
		position = [0, 0, 0] as Vector3Tuple,
		rotation = [0, 0, 0] as Vector3Tuple,
		scale = 1 as number | Vector3Tuple,
		/** Gira las hélices traseras. */
		propellers = true,
		propellerSpeed = 2.4,
		/** Vuela en círculo alrededor del centro (por defecto, la pista del mapa). */
		orbit = false,
		orbitRadius = 93,
		orbitHeight = 21,
		/** Radianes por segundo. Negativo invierte el sentido de giro. */
		orbitSpeed = 0.035,
		/** Ángulo inicial en radianes (0 = lado +X de la pista). */
		orbitStart = 0,
		orbitCenter = [0, 0] as [number, number],
		/** Ruta recta por waypoints (Skyfall Royale). Tiene prioridad sobre `orbit`. */
		path = null as readonly Vector3Tuple[] | null,
		/** Tiempo transcurrido de la ruta, en ms. Se consulta una vez por frame. */
		pathElapsed = null as (() => number) | null,
		/** Velocidad de la ruta, en m/s. */
		pathSpeed = 12.5,
		/** Reproduce las animaciones incluidas en el GLB (bandera, etc.). */
		animations = true,
		animationSpeed = 1
	}: {
		position?: Vector3Tuple;
		rotation?: Vector3Tuple;
		scale?: number | Vector3Tuple;
		propellers?: boolean;
		propellerSpeed?: number;
		orbit?: boolean;
		orbitRadius?: number;
		orbitHeight?: number;
		orbitSpeed?: number;
		orbitStart?: number;
		orbitCenter?: [number, number];
		path?: readonly Vector3Tuple[] | null;
		pathElapsed?: (() => number) | null;
		pathSpeed?: number;
		animations?: boolean;
		animationSpeed?: number;
	} = $props();

	// El GLB se extrae de map.glb con `world:externalize` y conserva sus animaciones.
	const gltf = useGltf(asset('props/zeppelin.glb'), {
		dracoLoader: useDraco(asset('draco/'))
	});

	let root = $state.raw<Group>();
	let sourceScene: Object3D | null = null;
	let model: Object3D | null = null;
	let leftPropeller: Object3D | null = null;
	let rightPropeller: Object3D | null = null;
	let lookedUp = false;
	let mixer: AnimationMixer | undefined;
	let elapsed = 0;

	/** Posición del zepelín sobre la pista para un ángulo dado. */
	function orbitPosition(angle: number): Vector3Tuple {
		return [
			orbitCenter[0] + Math.cos(angle) * orbitRadius,
			orbitHeight,
			orbitCenter[1] + Math.sin(angle) * orbitRadius
		];
	}

	/** Orientación tangente a la pista (el morro local apunta a +X). */
	function orbitRotation(angle: number): Vector3Tuple {
		const direction = orbitSpeed < 0 ? -1 : 1;
		const yaw = Math.atan2(-Math.cos(angle) * direction, -Math.sin(angle) * direction);
		return [rotation[0], rotation[1] + yaw, rotation[2]];
	}

	/**
	 * Posición y orientación sobre la ruta de Skyfall Royale. El morro local
	 * del GLB apunta a +X, así que el yaw se calcula como atan2(-dz, dx).
	 */
	function pathPose(): { position: Vector3Tuple; rotation: Vector3Tuple } {
		const points = path;

		if (!points || points.length < 2) {
			return { position, rotation };
		}

		const elapsed = Math.max(0, pathElapsed?.() ?? 0);
		let remaining = (elapsed / 1000) * pathSpeed;
		let x = points[0][0];
		let y = points[0][1];
		let z = points[0][2];
		let yaw = 0;

		for (let index = 0; index < points.length - 1; index += 1) {
			const a = points[index];
			const b = points[index + 1];
			const dx = b[0] - a[0];
			const dy = b[1] - a[1];
			const dz = b[2] - a[2];
			const length = Math.hypot(dx, dy, dz);
			const t = length <= 0 ? 0 : Math.min(1, remaining / length);

			x = a[0] + dx * t;
			y = a[1] + dy * t;
			z = a[2] + dz * t;
			yaw = Math.atan2(-dz, dx);

			if (remaining <= length) break;
			remaining -= length;
		}

		return { position: [x, y, z], rotation: [rotation[0], rotation[1] + yaw, rotation[2]] };
	}

	const initialPose = untrack(() => (path ? pathPose() : null));

	/** Clona el modelo para que varias instancias no compartan la misma escena. */
	function prepare(scene: Object3D, clips: AnimationClip[]): Object3D {
		if (sourceScene === scene && model) return model;

		sourceScene = scene;
		const clone = cloneSkeleton(scene);
		clone.position.set(0, 0, 0);
		clone.rotation.set(0, 0, 0);
		clone.scale.setScalar(1);

		model = clone;

		// Las hélices se giran a mano (ver useTask); el resto de clips son decorativos.
		mixer?.stopAllAction();
		mixer = undefined;

		const decorative = animations ? clips.filter((clip) => !/propeller/i.test(clip.name)) : [];
		if (decorative.length > 0) {
			const next = new AnimationMixer(clone);
			for (const clip of decorative) {
				next.clipAction(clip).setLoop(LoopRepeat, Infinity).play();
			}
			next.timeScale = animationSpeed;
			mixer = next;
		}

		return clone;
	}

	useTask((delta) => {
		mixer?.update(delta);

		if (!root) return;

		if (propellers) {
			if (!lookedUp) {
				leftPropeller = root.getObjectByName('ZEP_Propeller_L') ?? null;
				rightPropeller = root.getObjectByName('ZEP_Propeller_R') ?? null;
				lookedUp = Boolean(leftPropeller || rightPropeller);
			}

			const step = delta * propellerSpeed;
			if (leftPropeller) leftPropeller.rotation.x += step;
			if (rightPropeller) rightPropeller.rotation.x -= step;
		}

		if (path) {
			const pose = pathPose();
			root.position.set(...pose.position);
			root.rotation.set(...pose.rotation);
			return;
		}

		if (!orbit) return;

		elapsed += delta;
		const angle = orbitStart + elapsed * orbitSpeed;
		root.position.set(...orbitPosition(angle));
		root.rotation.set(...orbitRotation(angle));
	});

	onDestroy(() => {
		mixer?.stopAllAction();
		mixer = undefined;
	});
</script>

<T.Group
	position={initialPose ? initialPose.position : orbit ? orbitPosition(orbitStart) : position}
	rotation={initialPose ? initialPose.rotation : orbit ? orbitRotation(orbitStart) : rotation}
	{scale}
	bind:ref={root}
>
	{#await gltf}
		<!-- El GLB llega desde la caché; no se dibuja nada mientras carga. -->
	{:then loaded}
		<T is={prepare(loaded.scene, loaded.animations ?? [])} dispose={false} />
	{/await}
</T.Group>
