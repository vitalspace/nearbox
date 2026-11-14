<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { authSession } from '#lib/state/auth.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Restaura la sesión de Auth0 mientras corre el splash de `LoadingScreen`,
	// así el login no agrega una espera perceptible al arranque normal.
	onMount(() => {
		void authSession.init();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
