<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { get, type Readable } from 'svelte/store';
	import { untrack } from 'svelte';
	import type { AnimationAction, AnimationMixer, Group } from 'three';
	import type { SpriteMaterial } from 'three';
	import { DEFAULT_SKIN } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';
	import {
		isLoopingAnimation,
		playRigClip,
		playerAnimations,
		replayRigClip
	} from '../../state/playerAnimations.svelte';
	import { playerSettings } from '../../state/playerSettings.svelte';
	import { createNameTagMaterial } from '../player/nameTag';
	import PlayerSkin from '../player/PlayerSkin.svelte';

	interface Props {
		id: string;
		name: string;
		carried: number;
	}

	let { id, name, carried }: Props = $props();

	// The crypt snapshot carries names and skull counts; the equipped skin
	// travels in the hub presence, which keeps tracking every player.
	const skin = $derived(lobby.playerById(id)?.skin ?? DEFAULT_SKIN);

	let actionsStore = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();
	let mixer = $state<AnimationMixer | undefined>();
	let group = $state<Group | undefined>();
	let current = '';
	let lastAnimationRevision = -1;

	let spriteMaterial = $state.raw<SpriteMaterial | null>(null);

	$effect(() => {
		// Recreated when the name, label color or carried
		// skulls change.
		const next = createNameTagMaterial(
			name,
			playerSettings.labelColor,
			carried > 0 ? `×${carried}` : undefined
		);
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

			if (previous) {
				previous.map?.dispose();
				previous.dispose();
			}
		};
	});

	// A skin change swaps the rig: restart from the current clip on the new
	// actions instead of keeping a pose from the previous model.
	let previousActions: typeof actionsStore;
	$effect(() => {
		if (actionsStore === previousActions) return;

		previousActions = actionsStore;
		current = '';
	});

	// Plays the last clip the remote player broadcast over the WebSocket.
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
			// Repeated gesture from this player: restart the finished one-shot.
			replayRigClip(actions, animation);
		}
	});

	useTask(() => {
		const sample = minigame2.sampleAt();
		const player = sample.players.find((item) => item.id === id);

		if (!group) return;

		if (!player) {
			group.visible = false;
			return;
		}

		group.visible = player.alive;
		group.position.set(player.x, player.y, player.z);
		group.rotation.y = player.yaw;
	});
</script>

<PlayerSkin bind:ref={group} bind:actions={actionsStore} bind:mixer {skin} visible={false}>
	{#if spriteMaterial}
		<T.Sprite position={[0, 2.45, 0]} scale={[1.8, 0.45, 1]} material={spriteMaterial} />
	{/if}
</PlayerSkin>
