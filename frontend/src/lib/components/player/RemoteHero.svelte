<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { get, type Readable } from 'svelte/store';
	import { untrack } from 'svelte';
	import type { AnimationAction, AnimationMixer, Group, SpriteMaterial } from 'three';
	import { DEFAULT_SKIN, type SkinId } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';
	import {
		isLoopingAnimation,
		playRigClip,
		playerAnimations,
		replayRigClip
	} from '../../state/playerAnimations.svelte';
	import { playerSettings } from '../../state/playerSettings.svelte';
	import { remotePlayers } from '../../state/remotePlayers.svelte';
	import { balloon, cannonForSeat } from '../../state/balloon.svelte';
	import { cannonSeatDeckPosition, cannonSeatFacing } from '../../state/balloonCannons';
	import { asset } from '../../assets/path';
	import { catalogItemById } from '../../nft/catalog.ts';
	import { createNameTagMaterial } from './nameTag';
	import PlayerSkin from './PlayerSkin.svelte';
	import PlayerAccessory from './PlayerAccessory.svelte';

	interface Props {
		id: string;
		name: string;
		skin?: SkinId;
		crown?: boolean;
		ride?: string | null;
		weaponVariant?: string | null;
	}

	let {
		id,
		name,
		skin = DEFAULT_SKIN,
		crown = false,
		ride = null,
		weaponVariant = null
	}: Props = $props();

	let actionsStore = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();
	let mixer = $state<AnimationMixer | undefined>();
	let group = $state<Group | undefined>();
	let current = '';
	let lastAnimationRevision = -1;

	let spriteMaterial = $state.raw<SpriteMaterial | null>(null);

	const rideModel = $derived(ride ? (catalogItemById(ride)?.model ?? null) : null);

	$effect(() => {
		const next = createNameTagMaterial(name, playerSettings.labelColor);
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
		if (!actionsStore) return;

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
		if (!group) return;

		// A bordo del globo el jugador deja de reportar su posición de suelo:
		// se dibuja en su asiento, sobre la cubierta, mirando al cañón.
		const seat = balloon.seatOfPlayer(id);

		if (seat) {
			const cannon = cannonForSeat(seat);
			const feet = cannonSeatDeckPosition(balloon.position, balloon.yaw, cannon);

			group.visible = true;
			group.position.set(feet.x, feet.y, feet.z);
			group.rotation.y = cannonSeatFacing(balloon.yaw, cannon);
			return;
		}

		// Already interpolated by the store with a shared server clock: applying
		// a second exponential smoothing here made avatars lag and trail their
		// orientation by an extra ~80 ms.
		const position = remotePlayers.sampleAt(id);

		if (!position) {
			// Without a known position the avatar is not drawn yet.
			group.visible = false;
			return;
		}

		// The buffer is already continuous; the first sample is drawn at its
		// real position so the avatar does not slide in from the origin.
		group.visible = true;
		group.position.set(position.x, position.y, position.z);
		group.rotation.y = position.yaw;
	});
</script>

<PlayerSkin bind:ref={group} bind:actions={actionsStore} bind:mixer {skin} visible={false}>
	{#if spriteMaterial}
		<T.Sprite position={[0, 2.45, 0]} scale={[1.8, 0.45, 1]} material={spriteMaterial} />
	{/if}

	{#if crown}
		<PlayerAccessory url={asset('props/crown.glb')} position={[0, 2.08, 0]} targetSize={0.52} />
	{/if}

	{#if rideModel}
		{#key rideModel}
			<PlayerAccessory url={asset(rideModel)} position={[0, 0.06, 0]} targetSize={1.7} />
		{/key}
	{/if}
</PlayerSkin>
