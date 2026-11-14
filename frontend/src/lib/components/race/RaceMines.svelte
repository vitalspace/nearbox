<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { race } from '../../state/race.svelte';

	let now = $state(Date.now());

	useTask(() => {
		now = race.serverNow();
	});

	const mines = $derived((race.snapshot?.mines ?? []).filter((mine) => now < mine.expiresAt));
	const spikes = Array.from({ length: 8 }, (_, index) => {
		const angle = (index / 8) * Math.PI * 2;

		return {
			index,
			x: Math.cos(angle) * 0.48,
			z: Math.sin(angle) * 0.48
		};
	});
</script>

{#each mines as mine (mine.id)}
	{@const armed = now >= mine.armedAt}
	{@const pulse = 0.85 + Math.sin((now - mine.placedAt) * 0.012) * 0.15}
	<T.Group position={[mine.x, mine.y, mine.z]}>
		<T.Mesh scale={[pulse, 1, pulse]}>
			<T.CylinderGeometry args={[0.58, 0.66, 0.14, 18]} />
			<T.MeshStandardMaterial
				color={armed ? '#7f1d1d' : '#78350f'}
				emissive={armed ? '#ef4444' : '#f59e0b'}
				emissiveIntensity={armed ? 1.1 : 0.55}
				metalness={0.45}
				roughness={0.5}
			/>
		</T.Mesh>

		{#each spikes as spike (spike.index)}
			<T.Mesh position={[spike.x, 0.14, spike.z]}>
				<T.ConeGeometry args={[0.09, 0.38, 6]} />
				<T.MeshStandardMaterial
					color={armed ? '#ef4444' : '#fbbf24'}
					emissive={armed ? '#dc2626' : '#d97706'}
					emissiveIntensity={0.8}
					metalness={0.35}
					roughness={0.45}
				/>
			</T.Mesh>
		{/each}

		<T.Mesh position={[0, 0.27, 0]}>
			<T.SphereGeometry args={[0.12, 12, 10]} />
			<T.MeshBasicMaterial color={armed ? '#fecaca' : '#fde68a'} />
		</T.Mesh>

		<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.19, 0]}>
			<T.RingGeometry args={[0.72, 0.92, 24]} />
			<T.MeshBasicMaterial
				color={armed ? '#f87171' : '#fbbf24'}
				transparent
				opacity={0.55}
				depthWrite={false}
			/>
		</T.Mesh>

		<T.PointLight
			color={armed ? '#ef4444' : '#f59e0b'}
			intensity={armed ? 3 : 1.5}
			distance={5}
			decay={2}
		/>
	</T.Group>
{/each}
