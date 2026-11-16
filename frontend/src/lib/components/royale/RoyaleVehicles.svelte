<script lang="ts">
	import { useTask } from '@threlte/core';
	import { playerState } from '../../state/playerState';
	import { minigame8 } from '../../state/minigame8.svelte';
	import RoyaleBalloon from './RoyaleBalloon.svelte';
	import RoyaleCar from './RoyaleCar.svelte';

	// Los datos llegan a 10 Hz; se reevalúa cada frame para interpolar.
	let now = $state(Date.now());

	useTask(() => {
		now = Date.now();
	});

	const vehicles = $derived(minigame8.snapshot?.vehicles ?? []);
	const sample = $derived.by(() => {
		void now;
		return minigame8.sampleAt();
	});

	function poseOf(id: string) {
		const posed = sample?.vehicles.find((vehicle) => vehicle.id === id);
		const state = vehicles.find((vehicle) => vehicle.id === id);

		return {
			x: posed?.x ?? state?.x ?? 0,
			y: posed?.y ?? state?.y ?? 0,
			z: posed?.z ?? state?.z ?? 0,
			qx: posed?.qx ?? state?.qx ?? 0,
			qy: posed?.qy ?? state?.qy ?? 0,
			qz: posed?.qz ?? state?.qz ?? 0,
			qw: posed?.qw ?? state?.qw ?? 1,
			yaw: posed?.yaw ?? state?.yaw ?? 0,
			speed: posed?.speed ?? state?.speed ?? 0
		};
	}
</script>

{#each vehicles as vehicle (vehicle.id)}
	{@const pose = poseOf(vehicle.id)}
	{@const distance = Math.hypot(playerState.x - pose.x, playerState.z - pose.z)}
	{@const visibleBar =
		vehicle.driverId !== minigame8.selfId && distance < (vehicle.destroyed ? 42 : 60)}

	{#if vehicle.kind === 'car'}
		<RoyaleCar
			id={vehicle.id}
			name={vehicle.name}
			model={vehicle.model}
			health={vehicle.health}
			maxHealth={vehicle.maxHealth}
			destroyed={vehicle.destroyed}
			driverId={vehicle.driverId}
			{pose}
			{visibleBar}
		/>
	{:else}
		<RoyaleBalloon
			id={vehicle.id}
			name={vehicle.name}
			health={vehicle.health}
			maxHealth={vehicle.maxHealth}
			destroyed={vehicle.destroyed}
			driverId={vehicle.driverId}
			{pose}
			{visibleBar}
		/>
	{/if}
{/each}
