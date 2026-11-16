<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Quaternion, Vector3 } from 'three';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleEffects } from '../../state/royaleEffects.svelte';
	import { ROYALE_GRENADE_RADIUS, ROYALE_WEAPON_BY_ID } from '../../state/royaleConfig';
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
	let lastImpactAt = 0;

	const UP = new Vector3(0, 0, 1);
	const direction = new Vector3();
	const quaternion = new Quaternion();

	function midpoint(tracer: (typeof royaleEffects.tracers)[number]): [number, number, number] {
		return [
			(tracer.from.x + tracer.to.x) / 2,
			(tracer.from.y + tracer.to.y) / 2,
			(tracer.from.z + tracer.to.z) / 2
		];
	}

	function length(tracer: (typeof royaleEffects.tracers)[number]): number {
		return Math.max(
			0.1,
			Math.hypot(
				tracer.to.x - tracer.from.x,
				tracer.to.y - tracer.from.y,
				tracer.to.z - tracer.from.z
			)
		);
	}

	function rotation(
		tracer: (typeof royaleEffects.tracers)[number]
	): [number, number, number, number] {
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
		royaleEffects.prune();
		const sample = minigame8.sampleAt();
		grenades = sample?.grenades ?? [];

		if (lastSeq === 0 && minigame8.events.length > 0) {
			lastSeq = minigame8.events[minigame8.events.length - 1].seq;
		}

		for (const event of minigame8.events) {
			if (event.seq <= lastSeq) {
				continue;
			}

			lastSeq = event.seq;

			if (
				event.kind === 'shot-fired' &&
				event.playerId !== undefined &&
				event.playerId !== minigame8.selfId &&
				event.x !== undefined &&
				event.y !== undefined &&
				event.z !== undefined &&
				event.dx !== undefined &&
				event.dy !== undefined &&
				event.dz !== undefined
			) {
				const shotWeapon = event.weapon ?? null;
				const range = Math.min(
					shotWeapon ? (ROYALE_WEAPON_BY_ID.get(shotWeapon)?.range ?? 55) : 55,
					140
				);

				royaleEffects.shot(
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
						id: `royale-explosion-${explosionSeq}`,
						x: event.x,
						y: event.y ?? 0.6,
						z: event.z
					}
				];
			}

			if (
				event.kind === 'player-hurt' &&
				event.otherId === minigame8.selfId &&
				event.x !== undefined &&
				event.y !== undefined &&
				event.z !== undefined
			) {
				const now = performance.now();

				// El crosshair escucha `royaleEffects.hitAt`; sin esto el
				// jugador no tenía confirmación visual de que el disparo había
				// entrado, aunque el servidor sí aplicara el daño.
				if (now - lastImpactAt > 45) {
					lastImpactAt = now;
					royaleEffects.impact(event.x, event.y, event.z);
				}

				if (now - lastBloodAt > 55) {
					lastBloodAt = now;
					royaleEffects.blood(event.x, event.y, event.z);
				}
			}

			if (event.kind === 'player-hurt' && event.playerId === minigame8.selfId) {
				royaleEffects.hurt();
			}
		}
	});

	function removeExplosion(id: string): void {
		explosions = explosions.filter((explosion) => explosion.id !== id);
	}
</script>

{#each royaleEffects.throws as mark (mark.id)}
	<WaveThrowMark
		x={mark.x}
		z={mark.z}
		onDone={() => {
			royaleEffects.throws = royaleEffects.throws.filter((item) => item.id !== mark.id);
		}}
	/>
{/each}

{#each grenades as grenade (grenade.id)}
	<GrenadeProjectile x={grenade.x} y={grenade.y} z={grenade.z} />
{/each}

{#each royaleEffects.tracers as tracer (tracer.id)}
	<T.Mesh position={midpoint(tracer)} quaternion={rotation(tracer)}>
		<T.BoxGeometry args={[0.03, 0.03, length(tracer)]} />
		<T.MeshBasicMaterial color={0xfde68a} transparent opacity={0.9} depthWrite={false} />
	</T.Mesh>
	<T.Mesh position={[tracer.from.x, tracer.from.y, tracer.from.z]}>
		<T.SphereGeometry args={[0.1, 8, 6]} />
		<T.MeshBasicMaterial color={0xfff7d6} transparent opacity={0.9} depthWrite={false} />
	</T.Mesh>
{/each}

{#each royaleEffects.sparks as spark (spark.id)}
	<T.Mesh position={[spark.x, spark.y, spark.z]}>
		<T.SphereGeometry args={[0.15, 8, 6]} />
		<T.MeshBasicMaterial color={0xf97316} transparent opacity={0.85} depthWrite={false} />
	</T.Mesh>
{/each}

{#each royaleEffects.bloods as blood (blood.id)}
	<BloodHit
		x={blood.x}
		y={blood.y}
		z={blood.z}
		seed={blood.seed}
		onDone={() => royaleEffects.removeBlood(blood.id)}
	/>
{/each}

{#each explosions as explosion (explosion.id)}
	<WaveExplosion
		x={explosion.x}
		y={explosion.y}
		z={explosion.z}
		kind="grenade"
		radius={ROYALE_GRENADE_RADIUS}
		onDone={() => removeExplosion(explosion.id)}
	/>
{/each}
