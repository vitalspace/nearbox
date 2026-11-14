<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf, useGltfAnimations } from '@threlte/extras';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import {
		Box3,
		Group,
		Vector3,
		type AnimationAction,
		type Mesh,
		type Object3D,
		type SpriteMaterial
	} from 'three';
	import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
	import { asset } from '../../assets/path';
	import { isLoopingNpcClip, NPC_CLIPS, type NpcClip } from '../../npcs/npcAnimations';
	import {
		NPC_NAME_TAG_RADIUS,
		NPC_RENDER_RADIUS,
		NPC_SHADOW_RADIUS,
		type NpcDefinition
	} from '../../npcs/npcConfig';
	import { createNpcNameTagMaterial } from '../../npcs/npcNameTag';
	import { npcs } from '../../state/npcs.svelte';
	import { playRigClip, replayRigClip } from '../../state/playerAnimations.svelte';
	import { playerState } from '../../state/playerState';

	let { definition }: { definition: NpcDefinition } = $props();

	// The population keys this component by `definition.id`, so the URL is static.
	// svelte-ignore state_referenced_locally
	const gltf = useGltf(asset(definition.model), {
		dracoLoader: useDraco(asset('draco/'))
	});
	const ref = new Group();
	const animations = useGltfAnimations(
		() => $gltf,
		() => ref
	);

	let source: Object3D | null = null;
	let model: Object3D | null = null;
	let current = '';
	let activeOneShot: NpcClip | null = null;
	let lastGestureSeq = -1;
	let lastLodAt = 0;
	let lastShadow: boolean | null = null;

	let tagVisible = $state(false);
	let spriteMaterial = $state.raw<SpriteMaterial | null>(null);

	$effect(() => {
		const next = createNpcNameTagMaterial(definition.name, definition.role, definition.color);
		const previous = untrack(() => spriteMaterial);
		spriteMaterial = next;

		return () => {
			untrack(() => {
				if (spriteMaterial === next) {
					spriteMaterial = null;
				}
			});

			next?.map?.dispose();
			next?.dispose();
			previous?.map?.dispose();
			previous?.dispose();
		};
	});

	/** Scales the clone to `definition.height` and rests its feet on y = 0. */
	function prepare(scene: Object3D): Object3D {
		if (source === scene && model) {
			return model;
		}

		source = scene;

		const clone = cloneSkeleton(scene);

		clone.position.set(0, 0, 0);
		clone.rotation.set(0, 0, 0);
		clone.scale.setScalar(1);

		clone.traverse((child) => {
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
			clone.scale.setScalar(definition.height / height);
		}

		clone.updateMatrixWorld(true);

		const box = new Box3().setFromObject(clone);
		const center = box.getCenter(new Vector3());

		clone.position.set(-center.x, -box.min.y, -center.z);

		model = clone;

		return clone;
	}

	$effect(() => {
		const mixer = animations.mixer;
		const actions = animations.actions;

		const onFinished = (event: { action: AnimationAction }): void => {
			if (!activeOneShot) {
				return;
			}

			if (get(actions)[NPC_CLIPS[activeOneShot]] === event.action) {
				activeOneShot = null;
			}
		};

		mixer.addEventListener('finished', onFinished);

		return () => mixer.removeEventListener('finished', onFinished);
	});

	useTask((delta) => {
		const state = npcs.runtime[definition.id];
		const dx = playerState.x - state.x;
		const dz = playerState.z - state.z;
		const distance = Math.hypot(dx, dz);

		ref.position.set(state.x, state.y, state.z);
		ref.rotation.y = state.yaw;
		ref.visible = distance <= NPC_RENDER_RADIUS;

		const now = Date.now();

		if (now - lastLodAt >= 500) {
			lastLodAt = now;
			tagVisible = distance <= NPC_NAME_TAG_RADIUS;

			const castShadow = distance <= NPC_SHADOW_RADIUS;

			if (model && castShadow !== lastShadow) {
				lastShadow = castShadow;
				model.traverse((child) => {
					const mesh = child as Mesh;

					if (mesh.isMesh) {
						mesh.castShadow = castShadow;
					}
				});
			}
		}

		const actions = get(animations.actions);

		if (Object.keys(actions).length === 0) {
			// The GLB is still loading. Do not consume gestures yet: the first
			// greeting can arrive while there is no clip to play, and marking it
			// as seen used to freeze the NPC forever (Carmen never walked).
			return;
		}

		if (activeOneShot) {
			const action = actions[NPC_CLIPS[activeOneShot]];

			// `finished` normally clears this. If the gesture was interrupted or
			// its action never played, locomotion must not stay blocked.
			if (!action || (!action.isRunning() && action.time >= action.getClip().duration)) {
				activeOneShot = null;
			}
		}

		if (state.gestureSeq !== lastGestureSeq) {
			if (state.gesture && actions[NPC_CLIPS[state.gesture]]) {
				const name = NPC_CLIPS[state.gesture];
				lastGestureSeq = state.gestureSeq;
				activeOneShot = state.gesture;

				if (current === name) {
					replayRigClip(actions, name);
				} else if (playRigClip(actions, current, name, false)) {
					current = name;
				} else {
					activeOneShot = null;
				}
			} else if (!state.gesture) {
				lastGestureSeq = state.gestureSeq;
			}
		}

		if (activeOneShot) {
			return;
		}

		const desired = NPC_CLIPS[state.clip];

		if (
			desired !== current &&
			playRigClip(actions, current, desired, isLoopingNpcClip(state.clip))
		) {
			current = desired;
		}
	});
</script>

<T is={ref} dispose={false}>
	{#if $gltf}
		<T is={prepare($gltf.scene)} dispose={false} />
	{/if}

	{#if spriteMaterial}
		<T.Sprite
			position={[0, definition.height + 0.25, 0]}
			scale={[2, 0.6, 1]}
			material={spriteMaterial}
			visible={tagVisible}
		/>
	{/if}
</T>
