<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { untrack } from 'svelte';
	import { race } from '../../state/race.svelte';

	type Point = { x: number; y: number; z: number };
	type Beam = {
		id: number;
		from: Point;
		to: Point;
		until: number;
	};

	let now = $state(race.serverNow());
	let beams = $state<Beam[]>([]);
	let sequence = 0;

	useTask(() => {
		now = race.serverNow();

		if (beams.length > 0 && beams.some((beam) => now >= beam.until)) {
			beams = beams.filter((beam) => now < beam.until);
		}
	});

	$effect(() => {
		const event = race.lastEvent;

		if (event?.kind !== 'ray-fired' || !event.from || !event.to) {
			return;
		}

		sequence += 1;
		const beam: Beam = {
			id: sequence,
			from: event.from,
			to: event.to,
			until: event.at + 450
		};

		untrack(() => {
			beams = [...beams, beam];
		});
	});

	function pose(beam: Beam) {
		const dx = beam.to.x - beam.from.x;
		const dz = beam.to.z - beam.from.z;
		const length = Math.max(0.1, Math.hypot(dx, dz));

		return {
			length,
			x: (beam.from.x + beam.to.x) / 2,
			y: (beam.from.y + beam.to.y) / 2,
			z: (beam.from.z + beam.to.z) / 2,
			yaw: Math.atan2(dx, dz)
		};
	}
</script>

{#each beams as beam (beam.id)}
	{@const shape = pose(beam)}
	<T.Group position={[shape.x, shape.y, shape.z]} rotation={[0, shape.yaw, 0]}>
		<!-- Core beam -->
		<T.Mesh rotation={[Math.PI / 2, 0, 0]}>
			<T.CylinderGeometry args={[0.08, 0.08, shape.length, 8]} />
			<T.MeshBasicMaterial color="#fef08a" transparent opacity={0.98} depthWrite={false} />
		</T.Mesh>

		<!-- Soft glow -->
		<T.Mesh rotation={[Math.PI / 2, 0, 0]}>
			<T.CylinderGeometry args={[0.26, 0.26, shape.length, 10]} />
			<T.MeshBasicMaterial color="#facc15" transparent opacity={0.2} depthWrite={false} />
		</T.Mesh>

		<T.PointLight position={[0, 0, shape.length / 2]} color="#fde047" intensity={5} distance={7} />
		<T.PointLight position={[0, 0, -shape.length / 2]} color="#fde047" intensity={5} distance={7} />
	</T.Group>
{/each}
