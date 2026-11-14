<script lang="ts">
	import { T } from '@threlte/core';
	import { CHECKPOINTS } from '../../state/checkpoints.svelte';
	import Checkpoint from './Checkpoint.svelte';
</script>

<!-- Checkpoints are Rapier sensors; the ground now comes from the map. -->
<T.Group position={[0, 0.1, 0]}>
	{#each CHECKPOINTS as checkpoint (checkpoint.id)}
		<Checkpoint {...checkpoint} />
	{/each}
</T.Group>
