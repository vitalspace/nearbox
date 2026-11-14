<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { audio } from '../../audio/engine';
	import { SOUND_GROUPS, type SoundId } from '../../audio/recipes';
	import { audioSettings } from '../../audio/settings.svelte';
	import type { AudioStats } from '../../audio/types';

	/**
	 * Panel de desarrollo (`?audio`). No se monta en producción.
	 */

	let stats = $state<AudioStats>({
		oneShots: 0,
		loops: 0,
		cachedBytes: 0,
		state: 'none',
		unlocked: false
	});
	let collapsed = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	function refresh(): void {
		stats = audio.stats();
	}

	function run(id: SoundId): void {
		void audio.unlock().then((ready) => {
			if (ready) {
				audio.play(id, { volume: 0.85 });
			}

			refresh();
		});
	}

	onMount(() => {
		refresh();
		timer = setInterval(refresh, 300);
	});

	onDestroy(() => {
		if (timer !== null) {
			clearInterval(timer);
			timer = null;
		}
	});

	const megabytes = $derived((stats.cachedBytes / (1024 * 1024)).toFixed(2));
	const totalSounds = $derived(SOUND_GROUPS.reduce((sum, group) => sum + group.ids.length, 0));
</script>

<div
	class="fixed right-3 bottom-3 z-[90] max-h-[75vh] w-80 overflow-y-auto rounded-lg border border-white/15 bg-slate-950/90 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur"
>
	<div class="mb-2 flex items-center justify-between gap-2">
		<strong class="text-sm">Audio debug</strong>
		<button
			type="button"
			class="rounded border border-white/15 px-2 py-0.5 text-[11px] hover:bg-white/10"
			onclick={() => (collapsed = !collapsed)}
		>
			{collapsed ? 'Expand' : 'Collapse'}
		</button>
	</div>

	<div class="mb-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] text-slate-300">
		<span>state: {stats.state}</span>
		<span>ready: {stats.unlocked ? 'yes' : 'no'}</span>
		<span>one-shots: {stats.oneShots}/24</span>
		<span>loops: {stats.loops}/12</span>
		<span>cache: {megabytes} MB</span>
		<span>sounds: {totalSounds}</span>
	</div>

	{#if !collapsed}
		<div class="mb-2 flex flex-wrap gap-1">
			<button
				type="button"
				class="rounded bg-cyan-500/20 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/30"
				onclick={() => void audio.unlock().then(refresh)}
			>
				Unlock
			</button>
			<button
				type="button"
				class="rounded bg-red-500/20 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/30"
				onclick={() => {
					audio.stopAll(20);
					refresh();
				}}
			>
				Stop all
			</button>
			<button
				type="button"
				class="rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"
				onclick={() => audioSettings.toggleMuted()}
			>
				{audioSettings.muted ? 'Unmute' : 'Mute'}
			</button>
		</div>

		<div class="mb-3 grid gap-1">
			<label class="flex items-center gap-2">
				<span class="w-16 text-slate-400">Master</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={audioSettings.master}
					oninput={(event) => audioSettings.setMaster(event.currentTarget.valueAsNumber)}
					class="flex-1"
				/>
			</label>
			<label class="flex items-center gap-2">
				<span class="w-16 text-slate-400">Ambience</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={audioSettings.ambience}
					oninput={(event) => audioSettings.setAmbience(event.currentTarget.valueAsNumber)}
					class="flex-1"
				/>
			</label>
			<label class="flex items-center gap-2">
				<span class="w-16 text-slate-400">Music</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={audioSettings.music}
					oninput={(event) => audioSettings.setMusic(event.currentTarget.valueAsNumber)}
					class="flex-1"
				/>
			</label>
			<label class="flex items-center gap-2">
				<span class="w-16 text-slate-400">Effects</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={audioSettings.sfx}
					oninput={(event) => audioSettings.setSfx(event.currentTarget.valueAsNumber)}
					class="flex-1"
				/>
			</label>
			<label class="flex items-center gap-2">
				<span class="w-16 text-slate-400">Interface</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={audioSettings.ui}
					oninput={(event) => audioSettings.setUi(event.currentTarget.valueAsNumber)}
					class="flex-1"
				/>
			</label>
		</div>

		{#each SOUND_GROUPS as group (group.label)}
			<details class="mb-1 border-t border-white/10 pt-1">
				<summary class="cursor-pointer text-[11px] font-medium text-slate-300">
					{group.label} ({group.ids.length})
				</summary>
				<div class="mt-1 grid grid-cols-1 gap-0.5">
					{#each group.ids as id (id)}
						<button
							type="button"
							class="truncate rounded px-1 py-0.5 text-left font-mono text-[10px] text-slate-400 hover:bg-white/10 hover:text-slate-100"
							onclick={() => run(id)}
							title={id}
						>
							▶ {id}
						</button>
					{/each}
				</div>
			</details>
		{/each}
	{/if}
</div>
