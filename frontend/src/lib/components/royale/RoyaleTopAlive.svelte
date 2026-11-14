<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Trophy from '@lucide/svelte/icons/trophy';
	import { minigame8 } from '../../state/minigame8.svelte';

	let visible = $state(true);
	const players = $derived(minigame8.topAlive);
	const selfId = $derived(minigame8.selfId);
</script>

{#if minigame8.snapshot && minigame8.phase === 'playing'}
	{#if visible}
		<aside
			class="pointer-events-auto fixed top-1/2 right-3 z-30 w-48 -translate-y-1/2 rounded-xl border border-white/10 bg-slate-950/55 text-white shadow-2xl backdrop-blur-sm sm:w-56"
			aria-label="Top alive players"
		>
			<div class="flex items-center justify-between gap-2 border-b border-white/10 px-2.5 py-1.5">
				<span
					class="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-300 uppercase"
				>
					<Trophy size={12} strokeWidth={2.4} class="text-amber-300" aria-hidden="true" />
					Top alive
				</span>
				<button
					type="button"
					aria-label="Hide the top alive panel"
					title="Hide the top alive panel"
					class="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
					onclick={() => (visible = false)}
				>
					<ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
				</button>
			</div>

			<ol class="space-y-1 p-1.5">
				{#each players as player, index (player.id)}
					<li
						class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] {player.id ===
						selfId
							? 'bg-white/10'
							: 'bg-white/[0.03]'}"
					>
						<span class="w-3 shrink-0 text-center font-bold text-slate-500">{index + 1}</span>
						<span
							class="h-2 w-2 shrink-0 rounded-full"
							style:background={player.isBot ? '#fbbf24' : '#38bdf8'}
							aria-hidden="true"
						></span>
						<span
							class="min-w-0 flex-1 truncate {player.id === selfId
								? 'font-bold text-white'
								: 'text-slate-200'}"
						>
							{player.name}
						</span>
						{#if player.isBot}
							<span
								class="shrink-0 rounded bg-amber-400/20 px-1 text-[8px] font-black text-amber-200"
							>
								BOT
							</span>
						{/if}
						<span class="shrink-0 text-right font-bold text-white tabular-nums">
							{player.kills}<span class="ml-0.5 text-[9px] font-semibold text-slate-500">K</span>
						</span>
					</li>
				{:else}
					<li class="rounded-lg px-2 py-1.5 text-center text-[11px] text-slate-500">
						No one alive
					</li>
				{/each}
			</ol>
		</aside>
	{:else}
		<button
			type="button"
			aria-label="Show the top alive panel"
			title="Show the top alive panel"
			class="pointer-events-auto fixed top-1/2 right-3 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-white/10 bg-slate-950/55 px-2 py-2.5 text-slate-200 shadow-2xl backdrop-blur-sm transition hover:bg-slate-900/70 hover:text-white"
			onclick={() => (visible = true)}
		>
			<ChevronLeft size={14} strokeWidth={2.4} aria-hidden="true" />
			<Trophy size={16} strokeWidth={2.2} class="text-amber-300" aria-hidden="true" />
			<span class="text-[9px] font-semibold tracking-widest uppercase">Alive</span>
		</button>
	{/if}
{/if}
