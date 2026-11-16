<script lang="ts">
	import { useTask } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { onDestroy } from 'svelte';
	import type { Readable } from 'svelte/store';
	import type { AnimationAction, AnimationMixer, Group } from 'three';
	import type { HeroAnimation } from '../../services/protocol';
	import { cars } from '../../state/cars.svelte';
	import { balloon } from '../../state/balloon.svelte';
	import { asset } from '../../assets/path';
	import { animationPalette } from '../../state/animationPalette.svelte';
	import { cosmetics } from '../../state/cosmetics.svelte';
	import { equipment } from '../../state/equipment.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { playerSettings } from '../../state/playerSettings.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { race } from '../../state/race.svelte';
	import { ride } from '../../state/ride.svelte';
	import { royaleInput } from '../../state/royaleInput';
	import { sceneState } from '../../state/sceneState.svelte';
	import PlayerAccessory from './PlayerAccessory.svelte';
	import PlayerBehaviour from './PlayerBehaviour.svelte';
	import PlayerCollider from './PlayerCollider.svelte';
	import PlayerSkin from './PlayerSkin.svelte';

	// The active skin exposes `actions` as a store (from `useGltfAnimations`);
	// the raw store is kept here and the resolved value is passed down to the
	// behaviour component.
	let actionsStore = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();
	let mixer = $state<AnimationMixer | undefined>();
	let ref = $state<Group | undefined>();

	const displayName = $derived(lobby.self?.name ?? lobby.alias);
	// El globo es el único vehículo abierto: el ocupante se ve en 2ª y 3ª
	// persona. En 1ª la cámara va dentro de la cabeza y se oculta entero.
	const showBalloonAvatar = $derived(balloon.isOccupant && balloon.view !== 'first');
	const driving = $derived(
		cars.isDriving ||
			balloon.isOccupant ||
			race.inCar ||
			sceneState.inRoadmap ||
			minigame5.isDriving
	);

	const skin = $derived(cosmetics.equippedSkin);
	// En Skyfall Royale el cuerpo local se oculta al morir: la cámara pasa a
	// seguir al espectado y el avatar yacente no debe tapar la vista.
	const royaleDown = $derived(
		sceneState.inRoyale &&
			minigame8.snapshot !== null &&
			minigame8.self !== null &&
			!minigame8.self.alive
	);

	// El modo local lo mantiene `PlayerCollider` y no depende del snapshot: así
	// el cuerpo se oculta aunque el `self` del servidor tarde en llegar.
	// `useTask` lo relee cada frame porque `royaleInput.mode` no es reactivo.
	let royaleLocalMode = $state(royaleInput.mode);

	useTask(() => {
		if (sceneState.inRoyale) {
			royaleLocalMode = royaleInput.mode;
		}
	});

	// A bordo del zepelín el cuerpo local no debe verse: la cámara está sobre el
	// casco y el avatar tapaba la vista. Se oculta como en los coches, también
	// durante la cuenta atrás (antes flotaba a 140 m sin zepelín visible); al
	// saltar vuelve a mostrarse.
	const royaleRiding = $derived(
		sceneState.inRoyale &&
			(royaleLocalMode === 'riding' ||
				minigame8.riding ||
				minigame8.isDriving ||
				(minigame8.self !== null && minigame8.self.alive && minigame8.self.mode === 'riding'))
	);

	// Cosméticos NFT: corona visible en el lobby, Barn Siege y Skyfall Royale;
	// montura (skateboard / escoba) visible solo en el lobby, Barn Siege y
	// Skyfall Royale, nunca dentro de un vehículo ni del zepelín.
	const showCrown = $derived(
		equipment.hasCrown && !sceneState.firstPerson && !driving && !royaleDown && !royaleRiding
	);
	const rideModel = $derived(equipment.equippedRide);
	const showRide = $derived(
		!!rideModel &&
			!ride.isRiding &&
			(sceneState.inHub || sceneState.inWaves || sceneState.inRoyale) &&
			!driving &&
			!royaleDown &&
			!royaleRiding &&
			!balloon.isOccupant
	);

	// Refuerzo imperativo: algunos rigs ignoran el prop `visible` al cambiar de
	// skin, así que aplicamos la visibilidad directamente al grupo raíz.
	$effect(() => {
		const visible = (!driving || showBalloonAvatar) && !royaleDown && !royaleRiding;

		if (ref) {
			ref.visible = visible;
		}
	});

	// Publish the clips that the equipped skin really has. `SkinCharacter`
	// already dropped the missing ones when building this map.
	$effect(() => {
		const store = actionsStore;

		if (!store) {
			animationPalette.publish(undefined);
			return;
		}

		return store.subscribe((value) => animationPalette.publish(value));
	});

	onDestroy(() => {
		animationPalette.clear();
	});
</script>

<PlayerSkin
	bind:actions={actionsStore}
	bind:mixer
	bind:ref
	{skin}
	visible={(!driving || showBalloonAvatar) && !royaleDown && !royaleRiding}
	hideHead={!balloon.isOccupant && sceneState.firstPerson}
>
	{#if ref && actionsStore}
		<PlayerBehaviour {ref} actions={$actionsStore} {mixer} />

		{#if showCrown}
			<PlayerAccessory url={asset('props/crown.glb')} position={[0, 2.08, 0]} targetSize={0.52} />
		{/if}

		{#if showRide && rideModel}
			{#key rideModel}
				<PlayerAccessory url={asset(rideModel)} position={[0, 0.06, 0]} targetSize={1.7} />
			{/key}
		{/if}

		{#if ride.isRiding && ride.tuning}
			{@const tuning = ride.tuning}
			{#key tuning.id}
				<PlayerAccessory
					url={asset(tuning.model)}
					position={[0, tuning.visualY, 0]}
					targetSize={tuning.targetSize}
				/>
			{/key}
		{/if}
	{/if}

	{#if !sceneState.firstPerson && displayName && !driving && !royaleDown && !royaleRiding}
		<HTML position={[0, 2.45, 0]} center pointerEvents="none" zIndexRange={[20, 0]}>
			<div
				class="pointer-events-none rounded-full bg-slate-950/70 px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap shadow-lg backdrop-blur-sm select-none"
				style:color={playerSettings.labelColor}
			>
				{displayName}
			</div>
		</HTML>
	{/if}
</PlayerSkin>

<PlayerCollider />
