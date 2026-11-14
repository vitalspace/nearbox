<script lang="ts">
	import { T } from '@threlte/core';
	import { useDraco, useGltf, useGltfAnimations } from '@threlte/extras';
	import type { Snippet } from 'svelte';
	import { derived, type Readable } from 'svelte/store';
	import {
		Box3,
		Group,
		Vector3,
		type AnimationAction,
		type AnimationMixer,
		type Mesh,
		type Object3D
	} from 'three';
	import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
	import { asset } from '../../assets/path';
	import { skinAnimations, type SkinDefinition } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';

	interface Props {
		/** Static per mount: the parent must key this component by `skin.id`. */
		skin: SkinDefinition;
		visible?: boolean;
		/** First person: hides the head/hat nodes listed by the skin. */
		hideHead?: boolean;
		/**
		 * Normalized height in meters. Defaults to the hero's (2.23).
		 * `WaveMonster` passes a per-kind height (Golem ≈ 2.6, Skeleton ≈ 1.9…).
		 */
		targetHeight?: number;
		onError?: (error: unknown) => void;
		children?: Snippet;
		ref?: Group;
		actions?: Readable<Partial<Record<HeroAnimation, AnimationAction>>>;
		mixer?: AnimationMixer;
	}

	let {
		skin,
		visible = true,
		hideHead = false,
		targetHeight = 2.23,
		onError,
		children,
		ref = $bindable(),
		actions = $bindable(),
		mixer = $bindable()
	}: Props = $props();

	ref = new Group();

	// This component is keyed by `skin.id`, so the model path is static per mount.
	// svelte-ignore state_referenced_locally
	const gltf = useGltf(skin.modelPath ?? '', {
		dracoLoader: useDraco(asset('draco/'))
	});

	let source: Object3D | null = null;
	let model: Object3D | null = null;
	let headParts: Object3D[] = [];

	/**
	 * Clones the skeleton once per mount and normalizes the model: scale to the
	 * target height, center X/Z and rest the feet on `y = 0`.
	 */
	function prepare(scene: Object3D): Object3D {
		if (source === scene && model) {
			return model;
		}

		source = scene;

		const clone = cloneSkeleton(scene);

		clone.position.set(0, 0, 0);
		clone.rotation.set(0, 0, 0);
		clone.scale.setScalar(1);

		const hidden = new Set(skin.hideInFirstPerson ?? []);
		headParts = [];

		clone.traverse((child) => {
			if (hidden.has(child.name)) {
				headParts.push(child);
			}

			const mesh = child as Mesh;

			if (!mesh.isMesh) {
				return;
			}

			mesh.castShadow = true;
			mesh.receiveShadow = false;
		});

		clone.updateMatrixWorld(true);

		const initialBox = new Box3().setFromObject(clone);
		const height = initialBox.max.y - initialBox.min.y;

		if (height > 0.001) {
			clone.scale.setScalar(targetHeight / height);
		}

		clone.updateMatrixWorld(true);

		const box = new Box3().setFromObject(clone);
		const center = box.getCenter(new Vector3());

		clone.position.set(-center.x, -box.min.y, -center.z);

		model = clone;

		return clone;
	}

	const animations = useGltfAnimations(
		() => $gltf,
		() => ref
	);

	// Every rig uses its own clip prefix (`WH_`, `DM_`, …); the behaviour and
	// the WebSocket speak `HR_*`. A store with the same contract is exposed.
	const mappedActions: Readable<Partial<Record<HeroAnimation, AnimationAction>>> = derived(
		animations.actions,
		($actions) => {
			const mapped: Partial<Record<HeroAnimation, AnimationAction>> = {};
			const clipNames = skinAnimations(skin.animationPrefix ?? '');

			for (const [animation, clip] of Object.entries(clipNames)) {
				const action = $actions[clip];

				if (action) {
					mapped[animation as HeroAnimation] = action;
				}
			}

			return mapped;
		}
	);

	actions = mappedActions;
	mixer = animations.mixer;

	// In first person the head/hat sits at camera height and fills the screen.
	$effect(() => {
		const loaded = $gltf;
		const hide = hideHead;

		if (!loaded) {
			return;
		}

		for (const part of headParts) {
			part.visible = !hide;
		}
	});

	$effect(() => {
		const reportError = onError;

		gltf.catch((error: unknown) => {
			console.warn(
				`[cosmetics] Failed to load ${skin.modelPath}; the default skin will be used.`,
				error
			);
			reportError?.(error);
		});
	});
</script>

<T is={ref} dispose={false} {visible}>
	{#if $gltf}
		<T is={prepare($gltf.scene)} dispose={false} />
	{/if}

	{@render children?.()}
</T>
