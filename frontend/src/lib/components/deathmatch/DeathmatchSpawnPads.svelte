<script lang="ts">
	import { T } from '@threlte/core';
	import { DM_TEAM_META, DM_TEAM_SPAWNS, DM_TEAMS } from '../../state/dmConfig';
</script>

<!-- Presentation-only markers for the two team spawns. The server still
     decides which slot each player gets. -->
<T.Group position={[0, 0, 0]}>
	{#each DM_TEAMS as team (team)}
		{#each DM_TEAM_SPAWNS[team] as slot, index (index)}
			<T.Group position={[slot.x, slot.y, slot.z]}>
				<T.Mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
					<T.RingGeometry args={[0.52, 0.72, 24]} />
					<T.MeshBasicMaterial
						color={DM_TEAM_META[team].color}
						transparent
						opacity={0.45}
						depthWrite={false}
					/>
				</T.Mesh>
			</T.Group>
		{/each}
	{/each}
</T.Group>
