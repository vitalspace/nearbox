<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import PawPrint from '@lucide/svelte/icons/paw-print';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import Trophy from '@lucide/svelte/icons/trophy';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { CATS_25, CAT_ZONE_ORDER, CAT_ZONES, type CatZone } from '../../missions/cats';
	import { PROGRESSION_MISSIONS, PROGRESSION_TRACKS } from '../../missions/progression';
	import { authSession } from '../../state/auth.svelte';
	import { cosmetics } from '../../state/cosmetics.svelte';
	import { missions } from '../../state/missions.svelte';
	import { playerProfile } from '../../state/playerProfile.svelte';
	import { progression } from '../../state/progression.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import ProgressionRewards from './ProgressionRewards.svelte';
	import ProgressionTrack from './ProgressionTrack.svelte';
	import RewardCard from './RewardCard.svelte';

	const zones = CAT_ZONE_ORDER.map((zone) => ({
		zone,
		...CAT_ZONES[zone],
		cats: CATS_25.filter((cat) => cat.zone === zone)
	}));

	// Circumference of the progress ring drawn around the button.
	const RING_RADIUS = 18;
	const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

	type HudTab = 'cats' | 'errands' | 'challenges' | 'rewards';

	let open = $state(false);
	let showRegistry = $state(false);
	let activeTab = $state<HudTab>('challenges');
	let rootEl = $state<HTMLDivElement>();

	const visible = $derived(playerProfile.missionHudVisible && sceneState.inHub);
	const total = $derived(missions.mission.target);
	const captured = $derived(missions.capturedCount);
	const completed = $derived(missions.completed);
	const catPercent = $derived(total > 0 ? Math.round((captured / total) * 100) : 0);
	const percent = $derived(progression.snapshot ? progression.percent : catPercent);
	const reward = $derived(cosmetics.rewardForMission(missions.mission.id));
	const catsNftReward = $derived(
		PROGRESSION_MISSIONS.find((mission) => mission.id === missions.mission.id)?.reward?.label ??
			null
	);
	const errands = $derived(
		PROGRESSION_MISSIONS.filter((mission) => mission.objective.type === 'collect')
	);
	const errandsDone = $derived(
		errands.filter((mission) => {
			const status = progression.missionState(mission.id)?.status;
			return status === 'completed' || status === 'claimed';
		}).length
	);

	function claim(missionId: string): void {
		void progression.claim(missionId, authSession.accountId, authSession.publicKey);
	}

	$effect(() => {
		if (!visible) {
			open = false;
		}
	});

	function close(): void {
		open = false;
	}

	function zoneCaptured(zone: CatZone): number {
		return CATS_25.filter((cat) => cat.zone === zone && missions.isCaptured(cat.id)).length;
	}

	onMount(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && open) {
				event.preventDefault();
				close();
			}
		};

		const onPointerDown = (event: PointerEvent) => {
			if (!open) return;

			const target = event.target;

			if (target instanceof Node && rootEl?.contains(target)) {
				return;
			}

			close();
		};

		// `NpcDialog` y Ajustes abren la Central sin crear un modal nuevo.
		const onOpenCentral = (event: Event) => {
			const tab = (event as CustomEvent<{ tab?: HudTab }>).detail?.tab;
			open = true;
			if (tab === 'cats' || tab === 'errands' || tab === 'challenges' || tab === 'rewards') {
				activeTab = tab;
			}
		};

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('rw:open-central', onOpenCentral);

		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('rw:open-central', onOpenCentral);
		};
	});
</script>

{#if visible}
	<div
		class="mission-hud pointer-events-none fixed top-3 left-3 z-40 flex w-[min(21rem,calc(100vw-1.5rem))] flex-col items-start gap-2 text-xs text-slate-100"
		bind:this={rootEl}
	>
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-label={open
				? 'Close Central'
				: `Open Central (${progression.completedCount}/${progression.totalCount})`}
			aria-expanded={open}
			aria-controls="mission-panel"
			title="Central"
			class="pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/60 text-slate-100 shadow-2xl backdrop-blur-sm transition hover:bg-slate-900/80 active:scale-95"
		>
			<svg
				class="pointer-events-none absolute inset-0 -rotate-90"
				viewBox="0 0 40 40"
				aria-hidden="true"
			>
				<circle
					cx="20"
					cy="20"
					r={RING_RADIUS}
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="text-white/15"
				/>
				<circle
					cx="20"
					cy="20"
					r={RING_RADIUS}
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-dasharray={RING_LENGTH}
					stroke-dashoffset={RING_LENGTH * (1 - percent / 100)}
					class="transition-[stroke-dashoffset] duration-300 {progression.claimableCount > 0
						? 'text-amber-400'
						: 'text-emerald-400'}"
				/>
			</svg>

			{#if open}
				<X size={17} strokeWidth={2} aria-hidden="true" />
			{:else if progression.claimableCount > 0}
				<Trophy size={17} strokeWidth={2} class="text-amber-300" aria-hidden="true" />
			{:else}
				<ScrollText size={17} strokeWidth={2} aria-hidden="true" />
			{/if}
		</button>

		{#if open}
			<div
				id="mission-panel"
				class="pointer-events-auto flex max-h-[calc(100vh-7.5rem)] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/85 shadow-2xl backdrop-blur-md"
			>
				<header
					class="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2"
				>
					<p class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">Central</p>
					<span
						class="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase"
					>
						<span
							class="h-1.5 w-1.5 rounded-full {progression.claimableCount > 0
								? 'bg-amber-400'
								: 'bg-emerald-400'}"
						></span>
						{progression.claimableCount > 0
							? `${progression.claimableCount} ready`
							: `${progression.completedCount}/${progression.totalCount}`}
					</span>
				</header>

				<nav
					class="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-1.5"
					aria-label="Central sections"
				>
					<button
						type="button"
						onclick={() => (activeTab = 'cats')}
						aria-pressed={activeTab === 'cats'}
						class="min-h-11 shrink-0 rounded-lg px-3 text-[10px] font-bold tracking-wide uppercase transition {activeTab ===
						'cats'
							? 'bg-amber-400/20 text-amber-200'
							: 'bg-white/5 text-slate-400 hover:bg-white/10'}"
					>
						Cats
					</button>
					<button
						type="button"
						onclick={() => (activeTab = 'errands')}
						aria-pressed={activeTab === 'errands'}
						class="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-bold tracking-wide uppercase transition {activeTab ===
						'errands'
							? 'bg-amber-400/20 text-amber-200'
							: 'bg-white/5 text-slate-400 hover:bg-white/10'}"
					>
						<ScrollText size={13} strokeWidth={2} aria-hidden="true" />
						Errands
					</button>
					<button
						type="button"
						onclick={() => (activeTab = 'challenges')}
						aria-pressed={activeTab === 'challenges'}
						class="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-bold tracking-wide uppercase transition {activeTab ===
						'challenges'
							? 'bg-amber-400/20 text-amber-200'
							: 'bg-white/5 text-slate-400 hover:bg-white/10'}"
					>
						<ListChecks size={13} strokeWidth={2} aria-hidden="true" />
						Challenges
					</button>
					<button
						type="button"
						onclick={() => (activeTab = 'rewards')}
						aria-pressed={activeTab === 'rewards'}
						class="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-bold tracking-wide uppercase transition {activeTab ===
						'rewards'
							? 'bg-amber-400/20 text-amber-200'
							: 'bg-white/5 text-slate-400 hover:bg-white/10'}"
					>
						<Trophy size={13} strokeWidth={2} aria-hidden="true" />
						Rewards
					</button>
				</nav>

				<div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
					{#if activeTab === 'cats'}
						<section class="rounded-lg border border-white/10 bg-slate-900/40">
							<div class="p-2.5">
								<div class="flex items-start gap-2.5">
									<span
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {completed
											? 'bg-amber-400/20 text-amber-300'
											: 'bg-white/10 text-slate-200'}"
										aria-hidden="true"
									>
										{#if completed}
											<Trophy size={15} strokeWidth={2} />
										{:else}
											<PawPrint size={15} strokeWidth={2} />
										{/if}
									</span>

									<div class="min-w-0 flex-1">
										<p class="truncate font-semibold text-slate-100">{missions.mission.title}</p>
										<p class="mt-0.5 text-[10px] leading-snug text-slate-500">
											{missions.mission.description}
										</p>
									</div>

									<span
										class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {completed
											? 'bg-amber-400/20 text-amber-200'
											: 'bg-sky-400/15 text-sky-200'}"
									>
										{completed ? 'Complete' : 'In progress'}
									</span>
								</div>

								<div class="mt-2.5 flex items-end justify-between gap-2">
									<div>
										<div
											class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
										>
											Captured
										</div>
										<div class="text-2xl font-black text-slate-100 tabular-nums">
											{captured}<span class="text-sm font-semibold text-slate-400">/{total}</span>
										</div>
									</div>
									<span
										class="rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-amber-200 uppercase"
									>
										{percent}%
									</span>
								</div>
								<div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
									<div
										class="h-full rounded-full transition-[width] duration-300 {completed
											? 'bg-amber-400'
											: 'bg-emerald-400'}"
										style:width="{percent}%"
									></div>
								</div>

								<button
									type="button"
									onclick={() => (showRegistry = !showRegistry)}
									aria-expanded={showRegistry}
									aria-controls="mission-registry"
									class="mt-2 flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/10"
								>
									<span>{showRegistry ? 'Hide cats' : 'View cats'}</span>
									<span class="flex items-center gap-1.5 text-[10px] text-slate-500">
										{captured}/{total}
										<ChevronDown
											size={13}
											strokeWidth={2}
											aria-hidden="true"
											class="transition-transform {showRegistry ? 'rotate-180' : ''}"
										/>
									</span>
								</button>
							</div>

							{#if showRegistry}
								<div id="mission-registry" class="border-t border-white/10 px-2.5 py-2">
									{#each zones as zone (zone.zone)}
										<section class="mb-2 last:mb-0">
											<h3
												class="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase"
											>
												<span class="truncate">{zone.label}</span>
												<span class="shrink-0 font-mono normal-case">
													{zoneCaptured(zone.zone)}/{zone.cats.length}
												</span>
											</h3>
											<ul class="space-y-0.5">
												{#each zone.cats as cat (cat.id)}
													{@const caught = missions.isCaptured(cat.id)}
													<li class="flex items-center gap-2 rounded-md px-1 py-0.5">
														<span
															class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full {caught
																? 'bg-emerald-400/20 text-emerald-300'
																: 'bg-white/5 text-slate-600'}"
															aria-hidden="true"
														>
															{#if caught}
																<Check size={10} strokeWidth={3} />
															{:else}
																<span class="h-1 w-1 rounded-full bg-slate-600"></span>
															{/if}
														</span>
														<span
															class="min-w-0 flex-1 truncate {caught
																? 'text-emerald-300'
																: 'text-slate-400'}"
														>
															{cat.name}
														</span>
														<span class="sr-only">
															{caught ? 'Caught' : 'Pending'}
														</span>
													</li>
												{/each}
											</ul>
										</section>
									{/each}
								</div>
							{/if}
						</section>

						{#if completed && reward}
							<div
								class="rounded-xl border border-amber-400/25 bg-amber-400/10 px-2.5 py-2 text-[10px] text-amber-200"
							>
								NFT reward: <span class="font-semibold">{reward.name}</span> · claim it in Mission Central
								→ Rewards.
							</div>
						{:else if completed && catsNftReward}
							<div
								class="rounded-xl border border-amber-300/25 bg-amber-400/10 px-2.5 py-2 text-[10px] text-amber-200"
							>
								NFT reward: <span class="font-semibold">{catsNftReward}</span> · claim it in Mission Central
								→ Rewards.
							</div>
						{/if}

						<p class="px-0.5 text-[10px] leading-relaxed text-slate-600">
							Progress is saved only in this browser.
						</p>
					{/if}

					{#if activeTab === 'errands'}
						<div
							class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2 text-[10px] text-slate-400"
						>
							<div class="flex items-center justify-between gap-2">
								<span>{progression.syncLabel}</span>
								<span class="font-mono">{errandsDone}/{errands.length}</span>
							</div>
							{#if progression.error}
								<p class="mt-1 text-rose-300">{progression.error}</p>
							{/if}
							{#if !authSession.accountId}
								<p class="mt-1 text-amber-200">Sign in to sync your errands.</p>
							{:else if progression.offline}
								<p class="mt-1 text-amber-200">Rewards unavailable offline; errands are cached.</p>
							{/if}
						</div>

						{#each errands as mission (mission.id)}
							<RewardCard
								{mission}
								state={progression.missionState(mission.id)}
								accountId={authSession.accountId}
								publicKey={authSession.publicKey}
								claiming={progression.isClaiming(mission.id)}
								onClaim={claim}
							/>
						{/each}
					{/if}

					{#if activeTab === 'challenges'}
						<div
							class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2 text-[10px] text-slate-400"
						>
							<div class="flex items-center justify-between gap-2">
								<span>{progression.syncLabel}</span>
								<span class="font-mono">{progression.completedCount}/{progression.totalCount}</span>
							</div>
							{#if progression.error}
								<p class="mt-1 text-rose-300">{progression.error}</p>
							{/if}
							{#if !authSession.accountId}
								<p class="mt-1 text-amber-200">Sign in to sync and claim rewards.</p>
							{/if}
						</div>

						{#each PROGRESSION_TRACKS as track (track.id)}
							<ProgressionTrack
								{track}
								accountId={authSession.accountId}
								publicKey={authSession.publicKey}
								onClaim={claim}
							/>
						{/each}
					{/if}

					{#if activeTab === 'rewards'}
						<ProgressionRewards
							accountId={authSession.accountId}
							publicKey={authSession.publicKey}
							onClaim={claim}
						/>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

{#if missions.showCompletion}
	<div
		class="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-3"
		aria-live="assertive"
	>
		<div
			class="max-w-full rounded-2xl border border-amber-400/30 bg-amber-950/80 px-6 py-3 text-amber-100 shadow-2xl backdrop-blur-md"
		>
			<div class="flex items-center gap-3">
				<Trophy size={22} strokeWidth={2} class="shrink-0 text-amber-300" aria-hidden="true" />
				<div class="min-w-0">
					<p class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">
						Mission complete!
					</p>
					<p class="text-sm font-bold">You found all {total} cats on the map.</p>
				</div>
			</div>

			{#if reward}
				<div class="mt-2 border-t border-amber-400/20 pt-2">
					<p class="text-[11px] text-amber-300/90">
						NFT reward: <span class="font-semibold text-amber-100">{reward.name}</span> · claim it in
						Mission Central → Rewards.
					</p>
				</div>
			{:else if catsNftReward}
				<div class="mt-2 border-t border-amber-400/20 pt-2">
					<p class="text-[11px] text-amber-300/90">
						NFT reward: <span class="font-semibold text-amber-100">{catsNftReward}</span> · claim it in
						Mission Central → Rewards.
					</p>
				</div>
			{/if}
		</div>
	</div>
{:else if missions.toast}
	<div
		class="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-3"
		aria-live="polite"
	>
		<div
			class="flex max-w-full items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-950/80 px-5 py-2.5 text-emerald-100 shadow-2xl backdrop-blur-md"
		>
			<PawPrint size={16} strokeWidth={2} class="shrink-0 text-emerald-300" aria-hidden="true" />
			<span class="truncate text-sm font-bold">{missions.toast.message}</span>
		</div>
	</div>
{/if}

{#if progression.notice}
	<div
		class="pointer-events-none fixed inset-x-0 top-28 z-40 flex justify-center px-3"
		aria-live="polite"
	>
		<div
			class="max-w-full rounded-2xl border border-amber-400/30 bg-slate-950/90 px-5 py-2.5 text-amber-100 shadow-2xl backdrop-blur-md"
		>
			<span class="block truncate text-sm font-bold">{progression.notice}</span>
		</div>
	</div>
{/if}

<style>
	/* On touch the mission button makes room for the car HUD and the open
	   chat, which take up the top strip. */
	:global(html.touch-controls-active.car-hud-active) .mission-hud,
	:global(html.touch-controls-active.chat-open) .mission-hud {
		display: none;
	}
</style>
