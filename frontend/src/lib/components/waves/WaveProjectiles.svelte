<script lang="ts">
	import { useTask } from '@threlte/core';
	import type { Mg5Breath } from '../../services/protocol';
	import { minigame5, type Mg5Projectile } from '../../state/minigame5.svelte';
	import { waveEffects } from '../../state/waveEffects.svelte';
	import AcidProjectile from './AcidProjectile.svelte';
	import FireBreath from './FireBreath.svelte';
	import GrenadeProjectile from './GrenadeProjectile.svelte';
	import RockProjectile from './RockProjectile.svelte';
	import WaveExplosion from './WaveExplosion.svelte';
	import WaveThrowMark from './WaveThrowMark.svelte';

	type Explosion = {
		id: string;
		x: number;
		y: number;
		z: number;
		kind: 'acid' | 'grenade' | 'rock';
	};

	let projectiles = $state.raw<Mg5Projectile[]>([]);
	let grenades = $state.raw<Mg5Projectile[]>([]);
	let rocks = $state.raw<Mg5Projectile[]>([]);
	let breaths = $state.raw<Mg5Breath[]>([]);
	let explosions = $state.raw<Explosion[]>([]);

	let explosionSeq = 0;
	let lastSeq = 0;

	useTask(() => {
		const sample = minigame5.sampleAt();
		projectiles = sample?.projectiles ?? [];
		grenades = sample?.grenades ?? [];
		rocks = sample?.rocks ?? [];
		// Los conos de fuego van sin el retardo de interpolación: el demonio
		// puede haberse girado y el chorro debe salir de su boca actual.
		breaths = minigame5.latestBreaths();

		// Explosiones a partir de los eventos del servidor.
		for (const event of minigame5.events) {
			if (event.seq <= lastSeq) {
				continue;
			}

			lastSeq = event.seq;

			if (event.kind === 'acid-impact' && event.x !== undefined && event.z !== undefined) {
				explosionSeq += 1;
				explosions = [
					...explosions,
					{
						id: `acid-${explosionSeq}`,
						x: event.x,
						y: event.y ?? 0.5,
						z: event.z,
						kind: 'acid'
					}
				];
			} else if (
				event.kind === 'grenade-exploded' &&
				event.x !== undefined &&
				event.z !== undefined
			) {
				explosionSeq += 1;
				explosions = [
					...explosions,
					{
						id: `grenade-${explosionSeq}`,
						x: event.x,
						y: event.y ?? 0.6,
						z: event.z,
						kind: 'grenade'
					}
				];
			} else if (event.kind === 'rock-impact' && event.x !== undefined && event.z !== undefined) {
				explosionSeq += 1;
				explosions = [
					...explosions,
					{
						id: `rock-${explosionSeq}`,
						x: event.x,
						y: event.y ?? 0.5,
						z: event.z,
						kind: 'rock'
					}
				];
			}
		}
	});

	function removeExplosion(id: string): void {
		explosions = explosions.filter((explosion) => explosion.id !== id);
	}
</script>

<!-- Punto de caída de la granada -->
{#each waveEffects.throws as mark (mark.id)}
	<WaveThrowMark
		x={mark.x}
		z={mark.z}
		onDone={() => {
			waveEffects.removeThrow(mark.id);
		}}
	/>
{/each}

<!-- Ácido en vuelo: plasma verde con shader procedural -->
{#each projectiles as projectile (projectile.id)}
	<AcidProjectile x={projectile.x} y={projectile.y} z={projectile.z} />
{/each}

<!-- Aliento de fuego del demonio: cono procedural desde la boca -->
{#each breaths as breath (breath.id)}
	<FireBreath x={breath.x} y={breath.y} z={breath.z} dx={breath.dx} dy={breath.dy} dz={breath.dz} />
{/each}

<!-- Granadas -->
{#each grenades as grenade (grenade.id)}
	<GrenadeProjectile x={grenade.x} y={grenade.y} z={grenade.z} />
{/each}

<!-- Rocas de lava del Golem -->
{#each rocks as rock (rock.id)}
	<RockProjectile x={rock.x} y={rock.y} z={rock.z} />
{/each}

<!-- Explosiones -->
{#each explosions as explosion (explosion.id)}
	<WaveExplosion
		x={explosion.x}
		y={explosion.y}
		z={explosion.z}
		kind={explosion.kind}
		onDone={() => removeExplosion(explosion.id)}
	/>
{/each}
