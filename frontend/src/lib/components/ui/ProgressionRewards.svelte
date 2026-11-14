<script lang="ts">
	import Trophy from '@lucide/svelte/icons/trophy';
	import { rewardMissions } from '../../missions/progression.ts';
	import { progression } from '../../state/progression.svelte.ts';
	import RewardCard from './RewardCard.svelte';

	interface Props {
		accountId: string;
		publicKey: string;
		onClaim: (missionId: string) => void;
	}

	let { accountId, publicKey, onClaim }: Props = $props();

	const rewards = $derived(
		rewardMissions()
			.map((mission) => ({ mission, state: progression.missionState(mission.id) }))
			.sort((a, b) => {
				const rank = (status?: string) =>
					status === 'claimed' ? 0 : status === 'completed' ? 1 : 2;

				return rank(a.state?.status) - rank(b.state?.status);
			})
	);

	const claimed = $derived(
		rewards.filter(
			(entry) =>
				entry.state?.status === 'claimed' ||
				entry.state?.claim?.status === 'minted' ||
				entry.state?.claim?.status === 'already-owned'
		).length
	);
</script>

<section class="space-y-2">
	<header class="flex items-center justify-between gap-2 px-0.5">
		<p
			class="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.24em] text-amber-300 uppercase"
		>
			<Trophy size={13} strokeWidth={2} aria-hidden="true" />
			Rewards
		</p>
		<span class="font-mono text-[10px] text-slate-400">{claimed}/{rewards.length}</span>
	</header>

	{#if rewards.length === 0}
		<p class="rounded-lg border border-white/10 bg-slate-900/40 p-3 text-[11px] text-slate-400">
			Complete missions to unlock NFTs.
		</p>
	{:else}
		{#each rewards as entry (entry.mission.id)}
			<RewardCard
				mission={entry.mission}
				state={entry.state}
				{accountId}
				{publicKey}
				claiming={progression.isClaiming(entry.mission.id)}
				{onClaim}
			/>
		{/each}
	{/if}
</section>
