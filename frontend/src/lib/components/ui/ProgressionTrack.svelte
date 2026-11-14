<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { missionsByTrack, type ProgressionTrackId } from '../../missions/progression.ts';
	import { progression } from '../../state/progression.svelte.ts';
	import RewardCard from './RewardCard.svelte';

	interface Props {
		track: {
			id: ProgressionTrackId;
			label: string;
			kicker: string;
			accent: string;
		};
		accountId: string;
		publicKey: string;
		onClaim: (missionId: string) => void;
	}

	let { track, accountId, publicKey, onClaim }: Props = $props();

	const missions = $derived(missionsByTrack(track.id));
	const states = $derived(
		missions.map((mission) => ({
			mission,
			state: progression.missionState(mission.id)
		}))
	);
	const completed = $derived(
		states.filter(
			(entry) => entry.state?.status === 'completed' || entry.state?.status === 'claimed'
		).length
	);
</script>

<details
	class="group rounded-lg border border-white/10 bg-slate-900/40"
	open={completed < missions.length}
>
	<summary
		class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2"
	>
		<span class="flex min-w-0 items-center gap-2">
			<span class="h-2 w-2 shrink-0 rounded-full" style:background={track.accent}></span>
			<span class="min-w-0">
				<span class="block truncate text-[11px] font-semibold text-slate-100">{track.label}</span>
				<span class="block truncate text-[9px] tracking-wide text-slate-500 uppercase">
					{track.kicker}
				</span>
			</span>
		</span>
		<span class="flex shrink-0 items-center gap-2 text-[10px] text-slate-400">
			<span class="font-mono">{completed}/{missions.length}</span>
			<ChevronDown
				size={14}
				strokeWidth={2}
				aria-hidden="true"
				class="transition-transform group-open:rotate-180"
			/>
		</span>
	</summary>

	<div class="space-y-2 border-t border-white/10 p-2">
		{#each states as entry (entry.mission.id)}
			<RewardCard
				mission={entry.mission}
				state={entry.state}
				{accountId}
				{publicKey}
				claiming={progression.isClaiming(entry.mission.id)}
				{onClaim}
				compact
			/>
		{/each}
	</div>
</details>
