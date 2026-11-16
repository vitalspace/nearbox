<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { untrack } from 'svelte';
	import type { Group, Object3D } from 'three';
	import { asset } from '../../assets/path';
	import CarExplosion from '../cars/CarExplosion.svelte';
	import { carInput } from '../../state/carInput';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { playerState } from '../../state/playerState';
	import {
		ROYALE_BALLOON_ACCELERATION,
		ROYALE_BALLOON_BOUNDS_MARGIN,
		ROYALE_BALLOON_LIFT_SPEED,
		ROYALE_BALLOON_MAX_SPEED,
		ROYALE_BALLOON_MAX_Y,
		ROYALE_BALLOON_YAW_SPEED,
		ROYALE_MAP_BOUNDS,
		ROYALE_VEHICLE_BAR_HEIGHT
	} from '../../state/royaleConfig';
	import { royaleInput } from '../../state/royaleInput';
	import { royaleVehicles } from '../../state/royaleVehicles.svelte';
	import RoyaleVehicleBar from './RoyaleVehicleBar.svelte';

	type Pose = {
		x: number;
		y: number;
		z: number;
		yaw: number;
		speed: number;
	};

	type Props = {
		id: string;
		name: string;
		health: number;
		maxHealth: number;
		destroyed: boolean;
		driverId: string | null;
		pose: Pose;
		visibleBar: boolean;
	};

	let { id, name, health, maxHealth, destroyed, driverId, pose, visibleBar }: Props = $props();

	const gltf = useGltf(asset('props/balloon.glb'), {
		dracoLoader: useDraco(asset('draco/'))
	});

	const isDriver = $derived(minigame8.drivingVehicleId === id);
	const active = $derived(isDriver && minigame8.phase === 'playing' && minigame8.isAlive);

	let group = $state<Group>();
	let model: Object3D | null = null;
	let sourceScene: Object3D | null = null;

	// El globo del royale no necesita colliders: el jugador entra por radio y
	// el servidor decide el vuelo. Solo se clona el modelo para cada instancia.
	function prepare(scene: Object3D): Object3D {
		if (sourceScene === scene && model) return model;

		sourceScene = scene;
		const clone = scene.clone(true);
		clone.position.set(0, 0, 0);
		clone.rotation.set(0, 0, 0);
		clone.scale.setScalar(1);
		model = clone;
		return clone;
	}

	const initial = untrack(() => pose);
	const local = {
		x: initial.x,
		y: initial.y,
		z: initial.z,
		yaw: initial.yaw,
		speed: 0,
		vy: 0
	};
	const baseY = initial.y;

	let wasDriver = false;
	let lastReportAt = 0;

	$effect(() => {
		if (isDriver && !wasDriver) {
			local.x = pose.x;
			local.y = pose.y;
			local.z = pose.z;
			local.yaw = pose.yaw;
			local.speed = pose.speed;
			local.vy = 0;
			lastReportAt = 0;
			royaleVehicles.balloonYaw = local.yaw;
		}

		wasDriver = isDriver;
	});

	function clampFlight(): void {
		const margin = ROYALE_BALLOON_BOUNDS_MARGIN;

		local.x = Math.min(
			ROYALE_MAP_BOUNDS.maxX - margin,
			Math.max(ROYALE_MAP_BOUNDS.minX + margin, local.x)
		);
		local.z = Math.min(
			ROYALE_MAP_BOUNDS.maxZ - margin,
			Math.max(ROYALE_MAP_BOUNDS.minZ + margin, local.z)
		);
		local.y = Math.min(ROYALE_BALLOON_MAX_Y, Math.max(baseY, local.y));
	}

	useTask((delta) => {
		if (!group) return;

		if (isDriver && active && !destroyed) {
			const dt = Math.min(delta, 0.05);

			local.yaw -= carInput.steering * ROYALE_BALLOON_YAW_SPEED * dt;

			const targetSpeed = carInput.throttle * ROYALE_BALLOON_MAX_SPEED;
			const step = ROYALE_BALLOON_ACCELERATION * dt;
			local.speed += Math.max(-step, Math.min(step, targetSpeed - local.speed));

			local.x += -Math.sin(local.yaw) * local.speed * dt;
			local.z += -Math.cos(local.yaw) * local.speed * dt;
			local.vy = royaleInput.lift * ROYALE_BALLOON_LIFT_SPEED;
			local.y += local.vy * dt;
			clampFlight();

			group.position.set(local.x, local.y, local.z);
			group.rotation.y = local.yaw;

			royaleVehicles.balloonYaw = local.yaw;

			playerState.x = local.x;
			playerState.y = local.y + 1.2;
			playerState.z = local.z;
			playerState.facingYaw = local.yaw;
			playerState.grounded = true;

			const now = Date.now();

			if (now - lastReportAt >= 100) {
				lastReportAt = now;
				minigame8.sendVehicleState(id, {
					x: local.x,
					y: local.y,
					z: local.z,
					qx: 0,
					qy: Math.sin(local.yaw / 2),
					qz: 0,
					qw: Math.cos(local.yaw / 2),
					vx: -Math.sin(local.yaw) * local.speed,
					vy: local.vy,
					vz: -Math.cos(local.yaw) * local.speed,
					speed: Math.abs(local.speed),
					steering: carInput.steering
				});
			}

			return;
		}

		group.position.set(pose.x, pose.y, pose.z);
		group.rotation.y = pose.yaw;
	});

	$effect(() => {
		return () => {
			model = null;
			sourceScene = null;
		};
	});
</script>

<T.Group bind:ref={group}>
	{#if !destroyed && $gltf}
		<T is={prepare($gltf.scene)} dispose={false} />
	{:else if destroyed}
		<T.Group scale={2.4}>
			<CarExplosion />
		</T.Group>
	{/if}

	<RoyaleVehicleBar
		{health}
		{maxHealth}
		height={ROYALE_VEHICLE_BAR_HEIGHT.balloon}
		label={name}
		kind="balloon"
		visible={visibleBar}
	/>
</T.Group>
