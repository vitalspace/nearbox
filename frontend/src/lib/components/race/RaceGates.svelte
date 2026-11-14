<script lang="ts">
	import { HTML } from '@threlte/extras';
	import { T } from '@threlte/core';
	import { RACE_GATES, ROADMAP_RACE_GATES, TRACK_SURFACE_Y } from '../../state/raceConfig';
	import { race } from '../../state/race.svelte';

	const track = $derived(race.snapshot?.track ?? 'grand-prix');
	const gateCount = $derived(race.snapshot?.gateCount ?? 8);
	const allGates = $derived(track === 'roadmap' ? ROADMAP_RACE_GATES : RACE_GATES);
	const gates = $derived(allGates.filter((gate) => gate.index !== 0));

	const nextGate = $derived.by(() => {
		const self = race.self;

		if (!self) {
			return -1;
		}

		if (self.status === 'grid') {
			return 0;
		}

		return self.gate >= gateCount - 1 ? 0 : self.gate + 1;
	});

	function gateRotation(yaw: number, angle: number): [number, number, number] {
		if (track === 'roadmap') {
			return [0, yaw - Math.PI / 2, 0];
		}

		return [0, -angle, 0];
	}

	const finish = $derived(allGates[0] ?? RACE_GATES[0]);
	/** Haunted Highway checkpoints use the server's proximity radius as the arch width. */
	const halfWidth = $derived(track === 'roadmap' ? (allGates[0]?.radius ?? 12) : 6);
</script>

<!-- Finish line over the start/finish marker. -->
<T.Mesh
	position={[finish.x, TRACK_SURFACE_Y + 0.03, finish.z]}
	rotation={[-Math.PI / 2, 0, track === 'roadmap' ? finish.yaw - Math.PI / 2 : 0]}
>
	<T.PlaneGeometry args={[13, 2]} />
	<T.MeshBasicMaterial color="#f8fafc" transparent opacity={0.55} depthWrite={false} />
</T.Mesh>

<HTML position={[finish.x, 6.2, finish.z]} center pointerEvents="none" zIndexRange={[10, 0]}>
	<div class="rounded bg-slate-950/70 px-2 py-0.5 text-[11px] font-bold text-white">FINISH</div>
</HTML>

{#each gates as gate (gate.index)}
	<T.Group
		position={[gate.x, TRACK_SURFACE_Y, gate.z]}
		rotation={gateRotation(gate.yaw, gate.angle)}
	>
		<T.Mesh position={[-halfWidth, 2.5, 0]}>
			<T.BoxGeometry args={[0.45, 5, 0.45]} />
			<T.MeshStandardMaterial
				color={gate.index === nextGate ? '#f8fafc' : '#22d3ee'}
				emissive={gate.index === nextGate ? '#f8fafc' : '#0891b2'}
				emissiveIntensity={gate.index === nextGate ? 2.5 : 0.9}
			/>
		</T.Mesh>
		<T.Mesh position={[halfWidth, 2.5, 0]}>
			<T.BoxGeometry args={[0.45, 5, 0.45]} />
			<T.MeshStandardMaterial
				color={gate.index === nextGate ? '#f8fafc' : '#22d3ee'}
				emissive={gate.index === nextGate ? '#f8fafc' : '#0891b2'}
				emissiveIntensity={gate.index === nextGate ? 2.5 : 0.9}
			/>
		</T.Mesh>
		<T.Mesh position={[0, 5, 0]}>
			<T.BoxGeometry args={[halfWidth * 2 + 0.45, 0.45, 0.45]} />
			<T.MeshStandardMaterial
				color={gate.index === nextGate ? '#f8fafc' : '#22d3ee'}
				emissive={gate.index === nextGate ? '#f8fafc' : '#0891b2'}
				emissiveIntensity={gate.index === nextGate ? 2.5 : 0.9}
			/>
		</T.Mesh>
	</T.Group>

	<HTML position={[gate.x, 6.4, gate.z]} center pointerEvents="none" zIndexRange={[10, 0]}>
		<div
			class="rounded-full bg-slate-950/70 px-2 py-0.5 text-[11px] font-bold"
			style:color={gate.index === nextGate ? '#ffffff' : '#67e8f9'}
		>
			{gate.index}
		</div>
	</HTML>
{/each}
