<script lang="ts">
	import { minigame2 } from '../../state/minigame2.svelte';
	import Mummy from './Mummy.svelte';

	const mummies = $derived(minigame2.snapshot?.mummies ?? []);
</script>

{#each mummies as mummy (mummy.id)}
	<Mummy id={mummy.id} />
{/each}
