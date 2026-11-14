<script lang="ts">
	import { PARKOUR_WARDENS } from '../../state/parkourConfig';
	import ParkourWarden from './ParkourWarden.svelte';
</script>

{#each PARKOUR_WARDENS as warden (warden.id)}
	<ParkourWarden {warden} />
{/each}
