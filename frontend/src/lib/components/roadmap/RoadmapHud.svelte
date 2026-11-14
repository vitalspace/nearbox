<script lang="ts">
	import { roadmapCar } from '../../state/roadmapCar.svelte';
	import { worldState } from '../../state/worldState.svelte';

	const ready = $derived(worldState.isReady('roadmap'));
	const speedKmh = $derived(Math.round(roadmapCar.speed * 3.6));
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-3">
	<div
		class="flex min-w-56 flex-col items-center rounded-xl bg-slate-950/65 px-5 py-3 text-white shadow-lg backdrop-blur-sm"
	>
		{#if ready}
			<div class="text-[11px] tracking-widest text-cyan-300 uppercase">Haunted Highway</div>
			<div class="flex items-end gap-2">
				<div class="text-3xl leading-none font-black">{speedKmh}</div>
				<div class="pb-0.5 text-[10px] tracking-widest text-slate-300 uppercase">km/h</div>
			</div>
			<div class="mt-1 text-[10px] text-slate-300">
				WASD / arrows to drive · Space handbrake · R reset
			</div>
		{:else}
			<div class="text-[11px] tracking-widest text-cyan-300 uppercase">Haunted Highway</div>
			<div class="mt-1 text-sm font-semibold text-slate-100">Loading the track…</div>
		{/if}
	</div>
</div>
