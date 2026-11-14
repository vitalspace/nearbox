<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { AdditiveBlending } from 'three';
	import { TRACK_CENTER } from '../../state/raceConfig';
	import { race } from '../../state/race.svelte';
	import type { RaceMissileState } from '../../services/protocol';

	let now = $state(Date.now());

	useTask(() => {
		now = race.serverNow();
	});

	const missiles = $derived(
		(race.snapshot?.missiles ?? []).filter((missile) => now < missile.hitAt)
	);

	type Pose = {
		x: number;
		y: number;
		z: number;
		yaw: number;
		progress: number;
	};

	function lerp(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}

	/**
	 * Missiles locked onto a rival follow the circular track instead of
	 * cutting straight across the infield. The angle advances in the race
	 * direction, while the radius and height blend between origin and target.
	 */
	function poseFor(missile: RaceMissileState): Pose {
		const progress = Math.min(
			1,
			Math.max(0, (now - missile.firedAt) / Math.max(1, missile.hitAt - missile.firedAt))
		);

		const dx = missile.to.x - missile.from.x;
		const dz = missile.to.z - missile.from.z;

		if (!missile.targetPlayerId) {
			return {
				x: missile.from.x + dx * progress,
				y: lerp(missile.from.y, missile.to.y, progress),
				z: missile.from.z + dz * progress,
				yaw: Math.atan2(dx, dz),
				progress
			};
		}

		const startAngle = Math.atan2(missile.from.z - TRACK_CENTER.z, missile.from.x - TRACK_CENTER.x);
		const endAngle = Math.atan2(missile.to.z - TRACK_CENTER.z, missile.to.x - TRACK_CENTER.x);
		let delta = endAngle - startAngle;

		// Pick the shortest arc. Targets are always close in race progress, so
		// this still follows the tarmac without wrapping almost a full lap.
		while (delta <= -Math.PI) delta += Math.PI * 2;
		while (delta > Math.PI) delta -= Math.PI * 2;

		const direction = delta >= 0 ? 1 : -1;
		const angle = startAngle + delta * progress;
		const startRadius = Math.hypot(
			missile.from.x - TRACK_CENTER.x,
			missile.from.z - TRACK_CENTER.z
		);
		const endRadius = Math.hypot(missile.to.x - TRACK_CENTER.x, missile.to.z - TRACK_CENTER.z);
		const radius = lerp(startRadius, endRadius, progress);

		return {
			x: TRACK_CENTER.x + Math.cos(angle) * radius,
			y: lerp(missile.from.y, missile.to.y, progress) + Math.sin(progress * Math.PI) * 0.35,
			z: TRACK_CENTER.z + Math.sin(angle) * radius,
			yaw: Math.atan2(-Math.sin(angle) * direction, Math.cos(angle) * direction),
			progress
		};
	}
</script>

{#each missiles as missile (missile.id)}
	{@const pose = poseFor(missile)}
	<T.Group position={[pose.x, pose.y, pose.z]} rotation={[0, pose.yaw, 0]}>
		<!-- Body -->
		<T.Mesh rotation={[Math.PI / 2, 0, 0]}>
			<T.CylinderGeometry args={[0.14, 0.18, 0.9, 14]} />
			<T.MeshStandardMaterial
				color="#e2e8f0"
				metalness={0.75}
				roughness={0.28}
				emissive="#f97316"
				emissiveIntensity={0.18}
			/>
		</T.Mesh>

		<!-- Nose -->
		<T.Mesh position={[0, 0, 0.62]} rotation={[Math.PI / 2, 0, 0]}>
			<T.ConeGeometry args={[0.14, 0.5, 14]} />
			<T.MeshStandardMaterial
				color="#ef4444"
				metalness={0.45}
				roughness={0.35}
				emissive="#b91c1c"
				emissiveIntensity={0.35}
			/>
		</T.Mesh>

		<!-- Fins -->
		<T.Mesh position={[0, 0, -0.28]}>
			<T.BoxGeometry args={[0.46, 0.05, 0.3]} />
			<T.MeshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.5} />
		</T.Mesh>
		<T.Mesh position={[0, 0, -0.28]}>
			<T.BoxGeometry args={[0.05, 0.46, 0.3]} />
			<T.MeshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.5} />
		</T.Mesh>

		<!-- Exhaust flame -->
		<T.Mesh position={[0, 0, -0.72]} rotation={[-Math.PI / 2, 0, 0]}>
			<T.ConeGeometry args={[0.16, 0.55, 10]} />
			<T.MeshBasicMaterial
				color="#fb923c"
				transparent
				opacity={0.85}
				depthWrite={false}
				blending={AdditiveBlending}
			/>
		</T.Mesh>

		<!-- Short glowing trail -->
		{#each [0.95, 1.25, 1.55] as distance, index (distance)}
			<T.Mesh position={[0, 0, -distance]}>
				<T.SphereGeometry args={[0.22 - index * 0.045, 10, 8]} />
				<T.MeshBasicMaterial
					color="#fdba74"
					transparent
					opacity={0.34 - index * 0.08}
					depthWrite={false}
					blending={AdditiveBlending}
				/>
			</T.Mesh>
		{/each}

		<T.PointLight color="#fb923c" intensity={7} distance={9} decay={2} />
	</T.Group>
{/each}
