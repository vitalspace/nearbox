<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Trophy from '@lucide/svelte/icons/trophy';
	import { DM_TEAM_META } from '../../state/dmConfig';
	import { dmHud } from '../../state/dmHud.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';

	const players = $derived(minigame6.top5);
	const selfId = $derived(minigame6.selfId);
</script>

{#if minigame6.snapshot}
	{#if dmHud.top5Visible}
		<aside
			class="pointer-events-auto fixed top-1/2 right-3 z-30 w-44 -translate-y-1/2 rounded-xl border border-white/10 bg-slate-950/55 text-white shadow-2xl backdrop-blur-sm sm:w-52"
			aria-label="Top 5 kills"
		>
			<div class="flex items-center justify-between gap-2 border-b border-white/10 px-2.5 py-1.5">
				<span
					class="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-300 uppercase"
				>
					<Trophy size={12} strokeWidth={2.4} class="text-amber-300" aria-hidden="true" />
					Top 5 kills
				</span>
				<button
					type="button"
					aria-label="Hide the top 5 panel"
					title="Hide the top 5 panel"
					class="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
					onclick={() => dmHud.toggleTop5()}
				>
					<ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
				</button>
			</div>

			<ol class="space-y-1 p-1.5">
				{#each players as player, index (player.id)}
					{@const meta = DM_TEAM_META[player.team]}
					<li
						class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] {player.id ===
						selfId
							? 'bg-white/10'
							: 'bg-white/[0.03]'}"
					>
						<span class="w-3 shrink-0 text-center font-bold text-slate-500">{index + 1}</span>
						<span
							class="h-2 w-2 shrink-0 rounded-full"
							style:background={meta.color}
							aria-hidden="true"
						></span>
						<span
							class="min-w-0 flex-1 truncate {player.id === selfId
								? 'font-bold text-white'
								: 'text-slate-200'}"
						>
							{player.name}
						</span>
						<span class="shrink-0 text-right tabular-nums">
							<span class="font-bold text-white">{player.kills}</span>
							<span class="text-slate-500">/</span>
							<span class="text-slate-400">{player.deaths}</span>
						</span>
					</li>
				{:else}
					<li class="rounded-lg px-2 py-1.5 text-center text-[11px] text-slate-500">
						Waiting for players…
					</li>
				{/each}
			</ol>
		</aside>
	{:else}
		<button
			type="button"
			aria-label="Show the top 5 panel"
			title="Show the top 5 panel"
			class="pointer-events-auto fixed top-1/2 right-3 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-white/10 bg-slate-950/55 px-2 py-2.5 text-slate-200 shadow-2xl backdrop-blur-sm transition hover:bg-slate-900/70 hover:text-white"
			onclick={() => dmHud.toggleTop5()}
		>
			<ChevronLeft size={14} strokeWidth={2.4} aria-hidden="true" />
			<Trophy size={16} strokeWidth={2.2} class="text-amber-300" aria-hidden="true" />
			<span class="text-[9px] font-semibold tracking-widest uppercase">Top 5</span>
		</button>
	{/if}
{/if}
