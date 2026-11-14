<script lang="ts">
	import { minigame8 } from '../../state/minigame8.svelte';
	import {
		ROYALE_BOARDING_MS,
		ROYALE_ZEPPELIN_PATH,
		ROYALE_ZEPPELIN_SCALE,
		ROYALE_ZEPPELIN_SPEED
	} from '../../state/royaleConfig';
	import Zeppelin from '../world/Zeppelin.svelte';

	const startedAt = $derived(minigame8.snapshot?.boardingStartedAt ?? 0);
	const visible = $derived(
		minigame8.phase === 'playing' &&
			startedAt > 0 &&
			minigame8.serverNow() - startedAt <= ROYALE_BOARDING_MS + 500
	);

	function elapsed(): number {
		if (!startedAt) return 0;
		return Math.max(0, minigame8.serverNow() - startedAt);
	}
</script>

{#if visible}
	<Zeppelin
		path={ROYALE_ZEPPELIN_PATH}
		pathElapsed={elapsed}
		pathSpeed={ROYALE_ZEPPELIN_SPEED}
		scale={ROYALE_ZEPPELIN_SCALE}
	/>
{/if}
