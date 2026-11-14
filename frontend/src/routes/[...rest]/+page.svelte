<script lang="ts">
	// RUN.world serves the build under /<version>/index.html, so the SPA router
	// sees an arbitrary path. This catch-all renders the game for any URL.
	import GamePage from '#lib/GamePage.svelte';
</script>

<GamePage />
