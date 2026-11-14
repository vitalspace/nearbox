<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Quaternion, Vector3 } from 'three';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { dmEffects } from '../../state/dmEffects.svelte';
	import { WEAPON_BY_ID } from '../../state/dmConfig';
	import GrenadeProjectile from '../waves/GrenadeProjectile.svelte';
	import WaveExplosion from '../waves/WaveExplosion.svelte';
	import WaveThrowMark from '../waves/WaveThrowMark.svelte';
	import BloodHit from '../effects/BloodHit.svelte';

	type Explosion = { id: string; x: number; y: number; z: number };

	let grenades = $state.raw<Array<{ id: string; x: number; y: number; z: number }>>([]);
	let explosions = $state.raw<Explosion[]>([]);
	let explosionSeq = 0;
	let lastSeq = 0;
	let lastBloodAt = 0;

	const UP = new Vector3(0, 0, 1);
	const direction = new Vector3();
	const quaternion = new Quaternion();

	function midpoint(tracer: (typeof dmEffects.tracers)[number]): [number, number, number] {
		return [
			(tracer.from.x + tracer.to.x) / 2,
			(tracer.from.y + tracer.to.y) / 2,
			(tracer.from.z + tracer.to.z) / 2
		];
	}

	function length(tracer: (typeof dmEffects.tracers)[number]): number {
		return Math.max(
			0.1,
			Math.hypot(
				tracer.to.x - tracer.from.x,
				tracer.to.y - tracer.from.y,
				tracer.to.z - tracer.from.z
			)
		);
	}

	function rotation(tracer: (typeof dmEffects.tracers)[number]): [number, number, number, number] {
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
		dmEffects.prune();
		const sample = minigame6.sampleAt();
		grenades = sample?.grenades ?? [];

		// On mount the store may hold events from before we entered; start
		// from the newest one instead of replaying old explosions.
		if (lastSeq === 0 && minigame6.events.length > 0) {
			lastSeq = minigame6.events[minigame6.events.length - 1].seq;
		}

		for (const event of minigame6.events) {
			if (event.seq <= lastSeq) {
				continue;
			}

			lastSeq = event.seq;

			if (
				event.kind === 'shot-fired' &&
				event.playerId !== undefined &&
				event.playerId !== minigame6.selfId &&
				event.x !== undefined &&
				event.y !== undefined &&
				event.z !== undefined &&
				event.dx !== undefined &&
				event.dy !== undefined &&
				event.dz !== undefined
			) {
				const shotWeapon = event.weapon && event.weapon !== 'grenade' ? event.weapon : null;
				const range = Math.min(shotWeapon ? (WEAPON_BY_ID.get(shotWeapon)?.range ?? 55) : 55, 70);

				dmEffects.shot(
					{ x: event.x, y: event.y, z: event.z },
					{
						x: event.x + event.dx * range,
						y: event.y + event.dy * range,
						z: event.z + event.dz * range
					}
				);
			}

			if (event.kind === 'grenade-exploded' && event.x !== undefined && event.z !== undefined) {
				explosionSeq += 1;
				explosions = [
					...explosions.slice(-5),
					{
						id: `dm-explosion-${explosionSeq}`,
						x: event.x,
						y: event.y ?? 0.6,
						z: event.z
					}
				];
			}

			// Blood on the enemy when one of our bullets lands. The engine
			// only sends the point for enemy damage, and `otherId` is the
			// attacker, so friendly fire / self-damage cannot trigger it.
			if (
				event.kind === 'player-hurt' &&
				event.otherId === minigame6.selfId &&
				event.x !== undefined &&
				event.y !== undefined &&
				event.z !== undefined
			) {
				const now = performance.now();

				if (now - lastBloodAt > 55) {
					lastBloodAt = now;
					dmEffects.blood(event.x, event.y, event.z);
				}
			}
		}
	});

	function removeExplosion(id: string): void {
		explosions = explosions.filter((explosion) => explosion.id !== id);
	}
</script>

<!-- Landing marker for the local grenade throw -->
{#each dmEffects.throws as mark (mark.id)}
	<WaveThrowMark
		x={mark.x}
		z={mark.z}
		onDone={() => {
			dmEffects.throws = dmEffects.throws.filter((item) => item.id !== mark.id);
		}}
	/>
{/each}

<!-- Grenades in flight (interpolated from the 10 Hz buffer) -->
{#each grenades as grenade (grenade.id)}
	<GrenadeProjectile x={grenade.x} y={grenade.y} z={grenade.z} />
{/each}

<!-- Remote shot tracers and muzzle flashes -->
{#each dmEffects.tracers as tracer (tracer.id)}
	<T.Mesh position={midpoint(tracer)} quaternion={rotation(tracer)}>
		<T.BoxGeometry args={[0.025, 0.025, length(tracer)]} />
		<T.MeshBasicMaterial color={0xfde68a} transparent opacity={0.9} depthWrite={false} />
	</T.Mesh>
	<T.Mesh position={[tracer.from.x, tracer.from.y, tracer.from.z]}>
		<T.SphereGeometry args={[0.09, 8, 6]} />
		<T.MeshBasicMaterial color={0xfff7d6} transparent opacity={0.9} depthWrite={false} />
	</T.Mesh>
{/each}

{#each dmEffects.sparks as spark (spark.id)}
	<T.Mesh position={[spark.x, spark.y, spark.z]}>
		<T.SphereGeometry args={[0.14, 8, 6]} />
		<T.MeshBasicMaterial color={0xf97316} transparent opacity={0.85} depthWrite={false} />
	</T.Mesh>
{/each}

{#each dmEffects.bloods as blood (blood.id)}
	<BloodHit
		x={blood.x}
		y={blood.y}
		z={blood.z}
		seed={blood.seed}
		onDone={() => dmEffects.removeBlood(blood.id)}
	/>
{/each}

{#each explosions as explosion (explosion.id)}
	<WaveExplosion
		x={explosion.x}
		y={explosion.y}
		z={explosion.z}
		kind="grenade"
		onDone={() => removeExplosion(explosion.id)}
	/>
{/each}
