<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Quaternion, Vector3 } from 'three';
	import { waveEffects, type WaveTracer } from '../../state/waveEffects.svelte';
	import BloodHit from '../effects/BloodHit.svelte';

	// The server does not render bullets (hitscan); these short beams and
	// sparks confirm each shot and each impact without changing authority.
	const UP = new Vector3(0, 0, 1);
	const direction = new Vector3();
	const quaternion = new Quaternion();

	function midpoint(tracer: WaveTracer): [number, number, number] {
		return [
			(tracer.from.x + tracer.to.x) / 2,
			(tracer.from.y + tracer.to.y) / 2,
			(tracer.from.z + tracer.to.z) / 2
		];
	}

	function length(tracer: WaveTracer): number {
		return Math.max(
			0.1,
			Math.hypot(
				tracer.to.x - tracer.from.x,
				tracer.to.y - tracer.from.y,
				tracer.to.z - tracer.from.z
			)
		);
	}

	function rotation(tracer: WaveTracer): [number, number, number, number] {
		direction.set(
			tracer.to.x - tracer.from.x,
			tracer.to.y - tracer.from.y,
			tracer.to.z - tracer.from.z
		);

		if (direction.lengthSq() < 1e-6) {
			direction.set(0, 0, 1);
		}

		quaternion.setFromUnitVectors(UP, direction.normalize());

		return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
	}

	useTask(() => {
		waveEffects.prune();
	});
</script>

{#each waveEffects.tracers as tracer (tracer.id)}
	<T.Mesh position={midpoint(tracer)} quaternion={rotation(tracer)}>
		<T.BoxGeometry args={[0.025, 0.025, length(tracer)]} />
		<T.MeshBasicMaterial color={0xfde68a} transparent opacity={0.9} depthWrite={false} />
	</T.Mesh>
	<T.Mesh position={[tracer.from.x, tracer.from.y, tracer.from.z]}>
		<T.SphereGeometry args={[0.09, 8, 6]} />
		<T.MeshBasicMaterial color={0xfff7d6} transparent opacity={0.9} depthWrite={false} />
	</T.Mesh>
{/each}

{#each waveEffects.sparks as spark (spark.id)}
	<T.Mesh position={[spark.x, spark.y, spark.z]}>
		<T.SphereGeometry args={[0.16, 8, 6]} />
		<T.MeshBasicMaterial color={0xf97316} transparent opacity={0.85} depthWrite={false} />
	</T.Mesh>
{/each}

{#each waveEffects.bloods as blood (blood.id)}
	<BloodHit
		x={blood.x}
		y={blood.y}
		z={blood.z}
		seed={blood.seed}
		onDone={() => waveEffects.removeBlood(blood.id)}
	/>
{/each}
