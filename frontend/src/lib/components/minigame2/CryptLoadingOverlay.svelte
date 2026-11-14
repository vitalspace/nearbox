<script lang="ts">
	import { onMount } from 'svelte';
	import { worldState } from '../../state/worldState.svelte';

	/**
	 * `game2.glb` se carga bajo demanda al entrar a la cripta. La escena y sus
	 * colliders no existen hasta que el GLTF resuelve, así que cubrimos el vacío
	 * con una pantalla breve. El jugador permanece congelado sin gravedad hasta
	 * que `worldState` marca la cripta como lista.
	 */
	const ready = $derived(worldState.isReady('crypt'));

	let slow = $state(false);

	onMount(() => {
		const timer = setTimeout(() => {
			slow = true;
		}, 15_000);

		return () => clearTimeout(timer);
	});

	function retry(): void {
		window.location.reload();
	}
</script>

{#if !ready}
	<div
		class="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 bg-[#05030d] text-amber-50"
		role="status"
		aria-live="polite"
		aria-label="Entering the mausoleum crypt"
	>
		<div
			class="h-10 w-10 animate-spin rounded-full border-2 border-amber-300/25 border-t-amber-300"
			aria-hidden="true"
		></div>

		<div class="text-center">
			<p class="text-xs font-semibold tracking-[0.35em] text-amber-200 uppercase">
				Entering the crypt
			</p>
			<p class="mt-1.5 text-sm text-slate-400">The mausoleum is waking…</p>
		</div>

		{#if slow}
			<div class="mt-2 text-center">
				<p class="text-xs text-slate-500">This is taking longer than usual.</p>
				<button
					type="button"
					onclick={retry}
					class="mt-2 rounded-md border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/20"
				>
					Reload
				</button>
			</div>
		{/if}
	</div>
{/if}
