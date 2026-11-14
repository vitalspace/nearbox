<script lang="ts">
	import { useTask } from '@threlte/core';
	import { CHASSIS_CENTER_Y } from '../../state/carConfig';
	import { NITRO_ENGINE_FACTOR, RACECAR_COLLISION_GROUPS } from '../../state/raceConfig';
	import { raceInput } from '../../state/raceInput';
	import { race } from '../../state/race.svelte';
	import { playerState } from '../../state/playerState';
	import type { RacePlayerState } from '../../services/protocol';
	import VehiclePhysics, { type VehicleSnapshot } from '../cars/VehiclePhysics.svelte';
	import { setCarTelemetry } from '../../audio/telemetry';

	type Props = {
		player: RacePlayerState;
	};

	let { player }: Props = $props();

	let now = $state(Date.now());

	useTask((delta) => {
		void delta;
		now = race.serverNow();
	});

	const isSelf = $derived(player.id === race.selfId);
	const live = $derived(race.positionFor(player.id, now));
	const snapshot = $derived<VehicleSnapshot>({
		position: live
			? { x: live.x, y: live.y, z: live.z }
			: { x: player.x, y: player.y, z: player.z },
		rotation: live
			? { x: live.qx, y: live.qy, z: live.qz, w: live.qw }
			: {
					x: 0,
					y: Math.sin(player.yaw / 2),
					z: 0,
					w: Math.cos(player.yaw / 2)
				},
		velocity: live ? { x: live.vx, y: live.vy, z: live.vz } : { x: 0, y: 0, z: 0 },
		speed: live?.speed ?? player.speed,
		steering: live?.steering ?? 0
	});

	const destroyed = $derived(player.status === 'destroyed');
	const active = $derived(isSelf && race.phase === 'playing' && player.status === 'racing');
	const shielded = $derived(player.shieldUntil !== null && player.shieldUntil > now);
	const nitro = $derived(
		isSelf && player.nitroUntil !== null && player.nitroUntil > now && race.phase === 'playing'
	);

	// While frozen (countdown/finished) the server position keeps the camera
	// and the avatar target in sync; while racing the physics does it.
	useTask(() => {
		if (!isSelf || active) {
			return;
		}

		const livePosition = race.positionFor(player.id);

		if (livePosition) {
			playerState.x = livePosition.x;
			playerState.y = livePosition.y - CHASSIS_CENTER_Y;
			playerState.z = livePosition.z;
			playerState.grounded = true;
		}
	});
</script>

<VehiclePhysics
	model={player.model}
	{snapshot}
	isDriver={isSelf}
	{active}
	{destroyed}
	input={raceInput}
	snapToken={`${player.status}:${player.slot}:${player.respawnSeq}`}
	maxSpeed={55}
	engineFactor={nitro ? NITRO_ENGINE_FACTOR : 1}
	collisionGroups={RACECAR_COLLISION_GROUPS}
	{shielded}
	onReport={(report) => {
		if (isSelf) {
			race.sendState(report);
		}
	}}
	onImpact={(impactSpeed, cause) => {
		if (isSelf) {
			race.sendImpact(impactSpeed, cause);
		}
	}}
	onTelemetry={(speed, steering, throttle, handbrake) => {
		if (isSelf) {
			setCarTelemetry({ speed, maxSpeed: 55, steering, throttle, handbrake });
		}
	}}
/>
