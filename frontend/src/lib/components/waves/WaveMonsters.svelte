<script lang="ts">
	import { minigame5 } from '../../state/minigame5.svelte';
	import WaveMonster from './WaveMonster.svelte';

	// La lista de ids sale del snapshot (reactivo); la posición la calcula
	// cada instancia con la interpolación de `sampleAt()`.
	const monsters = $derived(minigame5.snapshot?.monsters ?? []);
</script>

{#each monsters as monster (monster.id)}
	<WaveMonster id={monster.id} />
{/each}
