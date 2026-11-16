<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Lock from '@lucide/svelte/icons/lock';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import NftArt from '../market/NftArt.svelte';
	import { catalogExtraFor, catalogItemById } from '../../nft/catalog.ts';
	import type { ProgressionMission, ProgressionMissionState } from '../../missions/progression.ts';

	interface Props {
		mission: ProgressionMission;
		state: ProgressionMissionState | null;
		accountId: string;
		publicKey: string;
		claiming?: boolean;
		onClaim?: (missionId: string) => void;
		compact?: boolean;
	}

	let {
		mission,
		state,
		accountId,
		publicKey,
		claiming = false,
		onClaim,
		compact = false
	}: Props = $props();

	const reward = $derived(mission.reward);
	const item = $derived(reward ? catalogItemById(reward.catalogId) : null);
	const catalog = $derived(item ? catalogExtraFor(item) : null);
	const claim = $derived(state?.claim ?? null);
	const done = $derived(state?.status === 'completed' || state?.status === 'claimed');
	const claimed = $derived(
		state?.status === 'claimed' || claim?.status === 'minted' || claim?.status === 'already-owned'
	);
	const minting = $derived(claim?.status === 'minting' || claiming);
	const locked = $derived(state?.status === 'locked' || state === null);
	const canClaim = $derived(Boolean(reward) && done && !claimed && Boolean(accountId));
	const progress = $derived(
		state && state.target > 0 ? Math.min(100, Math.round((state.value / state.target) * 100)) : 0
	);

	function claimLabel(): string {
		if (!accountId) return 'Sign in to claim';
		if (claiming) return 'Claiming…';
		if (claim?.status === 'minting') return 'Minting…';
		if (claim?.status === 'failed') return 'Retry claim';
		return 'Claim';
	}
</script>

<article class="rounded-lg border border-white/10 bg-slate-900/50 p-2.5" aria-live="polite">
	<div class="flex items-start gap-2.5">
		<div class="w-14 shrink-0">
			{#if item}
				<NftArt {catalog} metadata={null} title={reward?.label ?? mission.title} compact />
			{:else}
				<span
					class="flex h-20 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400"
					aria-hidden="true"
				>
					<Sparkles size={22} strokeWidth={1.7} />
				</span>
			{/if}
		</div>

		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-[11px] font-semibold text-slate-100">{mission.title}</p>
					{#if reward}
						<p class="truncate text-[10px] text-amber-200/90">{reward.label}</p>
					{/if}
				</div>

				<span
					class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {claimed
						? 'bg-emerald-400/20 text-emerald-200'
						: done
							? 'bg-amber-400/20 text-amber-200'
							: locked
								? 'bg-white/5 text-slate-400'
								: 'bg-sky-400/15 text-sky-200'}"
				>
					{claimed
						? 'Claimed'
						: minting
							? 'Minting'
							: done
								? reward
									? 'Ready'
									: 'Completed'
								: locked
									? 'Locked'
									: 'Active'}
				</span>
			</div>

			{#if locked}
				<p class="mt-1 flex items-center gap-1 text-[10px] leading-snug text-slate-400">
					<Lock size={11} strokeWidth={2} aria-hidden="true" />
					{state?.lockedReason ?? 'Sync your progress to unlock'}
				</p>
			{:else if state}
				<div class="mt-2 flex items-center gap-2">
					<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
						<div
							class="h-full rounded-full {done ? 'bg-amber-400' : 'bg-sky-400'}"
							style:width="{progress}%"
						></div>
					</div>
					<span class="shrink-0 font-mono text-[10px] text-slate-400">
						{state.value}/{state.target}
					</span>
				</div>
			{/if}

			{#if claim?.error && state?.status !== 'claimed'}
				<p class="mt-1 truncate text-[10px] text-rose-300">{claim.error}</p>
			{/if}

			{#if done && !claimed && reward}
				<button
					type="button"
					disabled={!canClaim || minting}
					onclick={() => onClaim?.(mission.id)}
					class="mt-2 min-h-11 w-full rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-[11px] font-bold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-default disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-400"
				>
					{claimLabel()}
				</button>
			{/if}

			{#if claimed}
				<div class="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
					{#if claim?.serial != null}
						<span class="font-mono">#{claim.serial}</span>
					{/if}
					{#if claim?.txHash}
						<a
							class="inline-flex min-h-8 items-center gap-1 text-sky-300 hover:text-sky-200"
							href={`https://testnet.nearblocks.io/txns/${claim.txHash}`}
							target="_blank"
							rel="noreferrer"
						>
							Transaction <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
						</a>
					{/if}
					{#if accountId}
						<a
							class="inline-flex min-h-8 items-center gap-1 text-sky-300 hover:text-sky-200"
							href={`https://testnet.nearblocks.io/account/${accountId}`}
							target="_blank"
							rel="noreferrer"
						>
							Account <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
						</a>
					{/if}
				</div>
			{/if}

			{#if !compact}
				<p class="mt-1 text-[10px] leading-snug text-slate-500">{mission.description}</p>
			{/if}
		</div>
	</div>
</article>
