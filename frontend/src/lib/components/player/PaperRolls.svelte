<script lang="ts">
	import { paperRolls } from '../../state/paperRolls.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import PaperRoll from './PaperRoll.svelte';

	// Only rolls from the active scene are drawn: outdoor ones do not
	// appear inside the crypt, and vice versa.
	const scene = $derived(sceneState.inCrypt ? 'crypt' : 'map');
	const visibleRolls = $derived(paperRolls.rolls.filter((roll) => roll.scene === scene));
</script>

{#each visibleRolls as roll (roll.id)}
	<PaperRoll {roll} />
{/each}
