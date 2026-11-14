<script lang="ts">
	import { useTask } from '@threlte/core';
	import { minigame7 } from '../../state/minigame7.svelte';
	import { parkourWardenById } from '../../state/parkourConfig';
	import AcidProjectile from '../waves/AcidProjectile.svelte';
	import FireBreath from '../waves/FireBreath.svelte';
	import RockProjectile from '../waves/RockProjectile.svelte';
	import WaveExplosion from '../waves/WaveExplosion.svelte';

	type Projectile = {
		id: string;
		kind: 'rock' | 'acid';
		from: { x: number; y: number; z: number };
		to: { x: number; y: number; z: number };
		startedAt: number;
		duration: number;
		radius: number;
		x: number;
		y: number;
		z: number;
	};

	type Breath = {
		id: string;
		x: number;
		y: number;
		z: number;
		dx: number;
		dy: number;
		dz: number;
		length: number;
		until: number;
	};

	type Explosion = {
		id: string;
		kind: 'rock' | 'acid';
		radius: number;
		x: number;
		y: number;
		z: number;
		until: number;
	};

	let projectiles = $state.raw<Projectile[]>([]);
	let breaths = $state.raw<Breath[]>([]);
	let explosions = $state.raw<Explosion[]>([]);

	let lastSeq = 0;

	// The server sends `warden-attack`; the client only draws the projectile
	// or cone. Impacts, pushes and damage are decided by the engine.
	$effect(() => {
		for (const event of minigame7.events) {
			if (event.seq <= lastSeq) {
				continue;
			}

			lastSeq = event.seq;

			if (event.kind !== 'warden-attack' || !event.attack) {
				continue;
			}

			const attack = event.attack;
			const warden = parkourWardenById(attack.wardenId);
			const duration = Math.max(180, attack.impactAt - attack.at);

			if (attack.kind === 'rock' || attack.kind === 'acid') {
				projectiles = [
					...projectiles,
					{
						id: attack.id,
						kind: attack.kind,
						from: attack.origin,
						to: attack.target,
						startedAt: Date.now(),
						duration,
						radius: warden?.impactRadius ?? 2.5,
						x: attack.origin.x,
						y: attack.origin.y,
						z: attack.origin.z
					}
				];
				continue;
			}

			if (attack.kind === 'fire') {
				breaths = [
					...breaths,
					{
						id: attack.id,
						x: attack.origin.x,
						y: attack.origin.y,
						z: attack.origin.z,
						dx: attack.dx,
						dy: 0,
						dz: attack.dz,
						length: warden?.range ?? 17,
						until: Date.now() + duration
					}
				];
			}

			// `shove` is an immediate ghost swipe: the warden clip is the effect.
		}
	});

	useTask(() => {
		const now = Date.now();
		const nextProjectiles: Projectile[] = [];
		const impacts: Explosion[] = [];

		for (const projectile of projectiles) {
			const t = (now - projectile.startedAt) / projectile.duration;

			if (t >= 1) {
				impacts.push({
					id: projectile.id,
					kind: projectile.kind,
					radius: projectile.radius,
					x: projectile.to.x,
					y: projectile.to.y,
					z: projectile.to.z,
					until: now + 1_100
				});
				continue;
			}

			const arc = projectile.kind === 'rock' ? Math.sin(Math.PI * t) * 2.4 : 0;

			nextProjectiles.push({
				...projectile,
				x: projectile.from.x + (projectile.to.x - projectile.from.x) * t,
				y: projectile.from.y + (projectile.to.y - projectile.from.y) * t + arc,
				z: projectile.from.z + (projectile.to.z - projectile.from.z) * t
			});
		}

		if (projectiles.length > 0) {
			projectiles = nextProjectiles;
		}

		if (impacts.length > 0) {
			explosions = [...explosions, ...impacts];
		}

		const liveBreaths = breaths.filter((breath) => breath.until > now);

		if (liveBreaths.length !== breaths.length) {
			breaths = liveBreaths;
		}

		const liveExplosions = explosions.filter((explosion) => explosion.until > now);

		if (liveExplosions.length !== explosions.length) {
			explosions = liveExplosions;
		}
	});
</script>

{#each projectiles as projectile (projectile.id)}
	{#if projectile.kind === 'rock'}
		<RockProjectile x={projectile.x} y={projectile.y} z={projectile.z} />
	{:else}
		<AcidProjectile x={projectile.x} y={projectile.y} z={projectile.z} />
	{/if}
{/each}

{#each breaths as breath (breath.id)}
	<FireBreath
		x={breath.x}
		y={breath.y}
		z={breath.z}
		dx={breath.dx}
		dy={breath.dy}
		dz={breath.dz}
		length={breath.length}
	/>
{/each}

{#each explosions as explosion (explosion.id)}
	<WaveExplosion
		x={explosion.x}
		y={explosion.y}
		z={explosion.z}
		kind={explosion.kind}
		radius={explosion.radius}
	/>
{/each}
