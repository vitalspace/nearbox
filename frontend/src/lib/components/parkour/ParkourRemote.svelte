<script lang="ts">
	import { T as Threlte, useTask } from '@threlte/core';
	import { get, type Readable } from 'svelte/store';
	import { untrack } from 'svelte';
	import type { AnimationAction, AnimationMixer, Group } from 'three';
	import type { SpriteMaterial } from 'three';
	import type { SkinId } from '../../cosmetics/skinIds';
	import { DEFAULT_SKIN } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame7 } from '../../state/minigame7.svelte';
	import {
		isLoopingAnimation,
		playRigClip,
		playerAnimations,
		replayRigClip
	} from '../../state/playerAnimations.svelte';
	import { createNameTagMaterial } from '../player/nameTag';
	import PlayerSkin from '../player/PlayerSkin.svelte';

	interface Props {
		id: string;
		name: string;
		checkpoint: number;
	}

	let { id, name, checkpoint }: Props = $props();

	// The skin is cosmetic and lives in the lobby presence, not in the
	// authoritative race snapshot.
	const skin = $derived<SkinId>(lobby.playerById(id)?.skin ?? DEFAULT_SKIN);

	let actionsStore = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();
	let mixer = $state<AnimationMixer | undefined>();
	let group = $state<Group | undefined>();
	let current = '';
	let lastAnimationRevision = -1;

	let spriteMaterial = $state.raw<SpriteMaterial | null>(null);

	const badge = $derived(
		checkpoint <= 0 ? 'START' : checkpoint >= 13 ? 'FINISH' : `CP ${checkpoint}`
	);

	$effect(() => {
		const next = createNameTagMaterial(name, '#eab308', badge);
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

	let previousActions: typeof actionsStore;

	$effect(() => {
		if (actionsStore === previousActions) return;

		previousActions = actionsStore;
		current = '';
	});

	$effect(() => {
		if (!actionsStore || !group) return;

		const animation = playerAnimations.get(id) ?? 'HR_idle';
		const revision = playerAnimations.revision(id);
		const isNewMessage = revision !== lastAnimationRevision;
		lastAnimationRevision = revision;
		const actions = get(actionsStore);

		if (animation !== current) {
			if (playRigClip(actions, current, animation)) {
				current = animation;
			}
		} else if (isNewMessage && !isLoopingAnimation(animation)) {
			replayRigClip(actions, animation);
		}
	});

	useTask(() => {
		if (!group) return;

		const sample = minigame7.sampleAt();
		const player = sample?.players.find((item) => item.id === id);

		if (!player) {
			group.visible = false;
			return;
		}

		group.visible = true;
		group.position.set(player.x, player.y, player.z);
		group.rotation.y = player.yaw;
	});
</script>

<PlayerSkin bind:ref={group} bind:actions={actionsStore} bind:mixer {skin} visible={false}>
	{#if spriteMaterial}
		<Threlte.Sprite position={[0, 2.45, 0]} scale={[1.8, 0.45, 1]} material={spriteMaterial} />
	{/if}
</PlayerSkin>
