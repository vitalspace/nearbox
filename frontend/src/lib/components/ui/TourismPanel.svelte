<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Compass from '@lucide/svelte/icons/compass';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trophy from '@lucide/svelte/icons/trophy';
	import X from '@lucide/svelte/icons/x';
	import { tick, untrack } from 'svelte';
	import { SKINS, type SkinDefinition } from '../../cosmetics/skins';
	import { SKIN_ICONS } from '../../cosmetics/skinUi';
	import {
		missionById,
		PROGRESSION_TRACKS,
		type ProgressionMission,
		type ProgressionMissionState
	} from '../../missions/progression';
	import { cosmetics } from '../../state/cosmetics.svelte';
	import { hubKiosks } from '../../state/hubKiosks.svelte';
	import { missions } from '../../state/missions.svelte';
	import { progression } from '../../state/progression.svelte';
	import GuidePreview from './GuidePreview.svelte';
	import { VILLAGE_GUIDE, type VillageGuideEntry } from './villageGuide';

	type EntryStatus = {
		label: string;
		className: string;
		done: boolean;
	};

	const COMPLETED_CLASS = 'border-emerald-300/30 bg-emerald-400/15 text-emerald-200';
	const FREE_CLASS = 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200';
	const PENDING_CLASS = 'border-white/10 bg-white/5 text-slate-300';
	const PROGRESS_CLASS = 'border-amber-300/30 bg-amber-400/10 text-amber-200';

	const open = $derived(hubKiosks.panelId === 'tourism');

	let selectedId = $state('cats');
	let closeButton = $state<HTMLButtonElement>();
	let wasOpen = false;

	const entry = $derived(VILLAGE_GUIDE.find((item) => item.id === selectedId) ?? VILLAGE_GUIDE[0]);
	const status = $derived(statusFor(entry));
	const reward = $derived(rewardFor(entry));
	const rewardUnlocked = $derived(reward ? cosmetics.isUnlocked(reward.id) : false);
	const rewardEquipped = $derived(reward ? cosmetics.equippedSkin === reward.id : false);
	const nftMission = $derived(
		entry.progressionMissionId ? missionById(entry.progressionMissionId) : null
	);
	const nftState = $derived(
		entry.progressionMissionId ? progression.missionState(entry.progressionMissionId) : null
	);
	const nftTrack = $derived(
		entry.progressionTrack
			? (PROGRESSION_TRACKS.find((track) => track.id === entry.progressionTrack) ?? null)
			: null
	);
	const nftStatus = $derived(nftStatusFor(nftMission, nftState));

	function statusFor(item: VillageGuideEntry): EntryStatus {
		if (!item.missionId) {
			return {
				label: item.id === 'village' ? 'Always open' : 'Free ride',
				className: FREE_CLASS,
				done: false
			};
		}

		if (item.missionId === 'cats-25') {
			if (missions.completed) {
				return { label: 'Completed', className: COMPLETED_CLASS, done: true };
			}

			return {
				label: `${missions.capturedCount}/${missions.mission.target} cats`,
				className: PROGRESS_CLASS,
				done: false
			};
		}

		return missions.isMissionCompleted(item.missionId)
			? { label: 'Completed', className: COMPLETED_CLASS, done: true }
			: { label: 'Not completed', className: PENDING_CLASS, done: false };
	}

	function rewardFor(item: VillageGuideEntry): SkinDefinition | null {
		if (!item.rewardSkinId) {
			return null;
		}

		return SKINS.find((skin) => skin.id === item.rewardSkinId) ?? null;
	}

	function rewardLabel(item: VillageGuideEntry): string {
		const skin = rewardFor(item);
		const nft = nftRewardLabel(item);

		if (!skin && !nft) {
			return 'No reward';
		}

		const skinLabel = skin ? `${skin.name} skin` : null;

		return [skinLabel, nft].filter(Boolean).join(' · ');
	}

	function nftRewardLabel(item: VillageGuideEntry): string | null {
		const mission = item.progressionMissionId ? missionById(item.progressionMissionId) : null;

		return mission?.reward?.label ?? null;
	}

	function nftStatusFor(
		mission: ProgressionMission | null,
		state: ProgressionMissionState | null
	): EntryStatus | null {
		if (!mission?.reward) {
			return null;
		}

		if (!progression.snapshot) {
			return { label: 'Sync to track', className: PENDING_CLASS, done: false };
		}

		switch (state?.status) {
			case 'claimed':
				return { label: 'Claimed', className: COMPLETED_CLASS, done: true };
			case 'completed':
				return { label: 'Ready to claim', className: PROGRESS_CLASS, done: true };
			case 'active':
				return { label: 'In progress', className: PROGRESS_CLASS, done: false };
			case 'available':
				return { label: 'Available', className: FREE_CLASS, done: false };
			default:
				return { label: 'Locked', className: PENDING_CLASS, done: false };
		}
	}

	function nftProgressLabel(
		mission: ProgressionMission | null,
		state: ProgressionMissionState | null
	): string {
		if (!mission) {
			return '';
		}

		if (!state) {
			return `${mission.tier} · ${mission.title}`;
		}

		const value = Math.min(state.value, state.target);

		return `${mission.tier} · ${mission.title} · ${value}/${state.target}`;
	}

	function initialEntryId(): string {
		if (!missions.completed) {
			return 'cats';
		}

		const pending = VILLAGE_GUIDE.find(
			(item) => item.missionId !== null && !missions.isMissionCompleted(item.missionId)
		);

		return pending?.id ?? 'village';
	}

	function close(): void {
		hubKiosks.close();
	}

	function selectEntry(id: string): void {
		selectedId = id;
	}

	$effect(() => {
		if (open === wasOpen) {
			return;
		}

		wasOpen = open;

		if (!open) {
			return;
		}

		selectedId = untrack(initialEntryId);
		void tick().then(() => closeButton?.focus());
	});

	$effect(() => {
		if (!open) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code !== 'Escape') {
				return;
			}

			event.preventDefault();
			close();
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

{#if open}
	<div
		id="tourism-panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="tourism-title"
		class="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4"
	>
		<button
			type="button"
			class="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
			aria-label="Close Tourism Office"
			onclick={close}
		></button>

		<section
			class="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-teal-300/30 bg-[#071312]/95 text-slate-100 shadow-[0_0_60px_rgba(45,212,191,0.2)]"
		>
			<header
				class="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-teal-500/15 via-transparent to-cyan-400/5 px-4 py-3 sm:px-5"
			>
				<div class="flex min-w-0 items-center gap-3">
					<span
						class="flex size-10 shrink-0 items-center justify-center rounded-full border border-teal-300/50 bg-teal-500/10 text-teal-300"
						aria-hidden="true"
					>
						<Compass class="size-5" />
					</span>
					<div class="min-w-0">
						<p class="text-[10px] font-semibold tracking-[0.3em] text-teal-300/80 uppercase">
							NearBox
						</p>
						<h2 id="tourism-title" class="truncate text-lg font-bold text-teal-50">
							Tourism Office
						</h2>
						<p class="text-[11px] text-slate-400">
							Everything you can do in NearBox · {VILLAGE_GUIDE.length} activities · NFT rewards
						</p>
					</div>
				</div>

				<button
					bind:this={closeButton}
					type="button"
					class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/15 hover:text-white focus:ring-2 focus:ring-teal-300/60 focus:outline-none"
					onclick={close}
					aria-label="Close Tourism Office"
				>
					<X class="size-5" />
				</button>
			</header>

			<div
				class="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] md:overflow-hidden"
			>
				<section
					class="order-1 min-h-0 overflow-y-auto border-b border-white/10 md:order-2 md:border-b-0 md:border-l"
					aria-labelledby="tourism-activity-title"
				>
					<div class="relative h-60 w-full overflow-hidden bg-slate-950/70 sm:h-72 md:h-80">
						{#key entry.id}
							<GuidePreview kind={entry.preview} />
						{/key}

						<div
							class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#071312] via-[#071312]/80 to-transparent px-4 pt-10 pb-3"
						>
							<p class="text-[9px] font-semibold tracking-[0.25em] text-teal-300/80 uppercase">
								{entry.kicker}
							</p>
							<p class="truncate text-sm font-bold text-slate-50">{entry.caption}</p>
						</div>
					</div>

					<div class="p-4 sm:p-5">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div class="min-w-0">
								<p
									class="text-[10px] font-semibold tracking-[0.28em] uppercase"
									style:color={entry.accent}
								>
									{entry.kicker}
								</p>
								<h3 id="tourism-activity-title" class="text-xl font-bold text-slate-50">
									{entry.title}
								</h3>
							</div>
							<span
								class="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase {status.className}"
							>
								{status.label}
							</span>
						</div>

						<p class="mt-2 text-sm leading-relaxed text-slate-300">{entry.description}</p>

						<ul class="mt-3 space-y-1.5">
							{#each entry.points as point}
								<li class="flex gap-2 text-[12px] leading-snug text-slate-300">
									<span
										class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
										style:background-color={entry.accent}
										aria-hidden="true"
									></span>
									<span>{point}</span>
								</li>
							{/each}
						</ul>

						<div class="mt-4 grid gap-2.5 sm:grid-cols-2">
							<div class="rounded-xl border border-white/10 bg-white/5 p-3">
								<p class="text-[9px] font-semibold tracking-[0.25em] text-slate-400 uppercase">
									Controls
								</p>
								<div class="mt-1.5 flex flex-wrap gap-1.5">
									{#each entry.controls as control (control.keys)}
										<span
											class="inline-flex items-center gap-1 rounded-md border border-white/10 bg-slate-950/50 px-1.5 py-1 text-[10px] text-slate-300"
										>
											<kbd class="font-mono font-semibold text-slate-100">{control.keys}</kbd>
											<span class="text-slate-400">{control.label}</span>
										</span>
									{/each}
								</div>
							</div>

							<div class="rounded-xl border border-white/10 bg-white/5 p-3">
								<p
									class="flex items-center gap-1 text-[9px] font-semibold tracking-[0.25em] text-slate-400 uppercase"
								>
									<MapPin size={11} strokeWidth={2.5} aria-hidden="true" />
									Where to go
								</p>
								<p class="mt-1.5 text-[11px] leading-snug text-slate-300">{entry.location}</p>
								<p class="mt-1 text-[10px] text-slate-500">
									Map · <span class="text-slate-400">{entry.mapLabel}</span>
								</p>
							</div>
						</div>

						{#if reward}
							{@const RewardIcon = SKIN_ICONS[reward.id]}
							<div
								class="mt-2.5 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3"
							>
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950/50 text-slate-200"
									aria-hidden="true"
								>
									<RewardIcon size={18} strokeWidth={2} />
								</span>
								<div class="min-w-0">
									<p class="text-[9px] font-semibold tracking-[0.25em] text-slate-400 uppercase">
										Skin reward
									</p>
									<p class="truncate text-sm font-semibold text-slate-100">{reward.name} skin</p>
									<p class="text-[10px] text-slate-400">
										{#if rewardEquipped}
											Equipped right now
										{:else if rewardUnlocked}
											NFT owned · ready to equip in the shop
										{:else}
											Complete and claim its NFT reward to equip it
										{/if}
									</p>
								</div>
							</div>
						{:else}
							<p
								class="mt-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] text-slate-400"
							>
								{nftMission?.reward
									? 'No local skin · this activity only rewards the NFT below.'
									: 'Free activity · no skin reward.'}
							</p>
						{/if}

						{#if nftMission?.reward && nftStatus}
							<div
								class="mt-2.5 flex items-center gap-2.5 rounded-xl border border-amber-300/25 bg-amber-400/10 p-3"
							>
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 bg-slate-950/50 text-amber-200"
									aria-hidden="true"
								>
									<Sparkles size={18} strokeWidth={2} />
								</span>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between gap-2">
										<p
											class="flex items-center gap-1 text-[9px] font-semibold tracking-[0.25em] text-amber-200/90 uppercase"
										>
											<Trophy size={10} strokeWidth={2.5} aria-hidden="true" />
											NFT reward
										</p>
										<span
											class="shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {nftStatus.className}"
										>
											{nftStatus.label}
										</span>
									</div>
									<p class="truncate text-sm font-semibold text-slate-100">
										{nftMission.reward.label}
									</p>
									<p class="text-[10px] text-slate-400">
										{nftTrack?.label ?? 'Progression'} · {nftProgressLabel(nftMission, nftState)}
									</p>
									<p class="text-[10px] text-amber-200/70">
										{#if nftStatus.done}
											Claim it in Mission Central → Rewards.
										{:else}
											Progress is tracked by the server · claim it in Mission Central.
										{/if}
									</p>
								</div>
							</div>
						{/if}
					</div>
				</section>

				<nav
					class="order-2 p-4 md:order-1 md:min-h-0 md:overflow-y-auto"
					aria-label="Village activities"
				>
					<div class="mb-2 flex items-baseline justify-between gap-2">
						<h3 class="text-[10px] font-semibold tracking-[0.3em] text-teal-300 uppercase">
							Activities
						</h3>
						<p class="text-[10px] text-slate-500">Pick one to see the details</p>
					</div>

					<ul class="space-y-1.5">
						{#each VILLAGE_GUIDE as item (item.id)}
							{@const itemStatus = statusFor(item)}
							{@const isSelected = entry.id === item.id}
							<li>
								<button
									type="button"
									onclick={() => selectEntry(item.id)}
									aria-pressed={isSelected}
									class="flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition {isSelected
										? 'border-teal-300/60 bg-teal-400/10 shadow-[0_0_18px_-8px_rgba(45,212,191,0.8)]'
										: 'border-white/10 bg-slate-900/40 hover:border-teal-300/30 hover:bg-teal-500/5'}"
								>
									<span
										class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
										style:background-color={item.accent}
										aria-hidden="true"
									></span>

									<span class="min-w-0 flex-1">
										<span
											class="block text-[9px] font-semibold tracking-[0.2em] text-slate-400 uppercase"
										>
											{item.kicker}
										</span>
										<span class="block truncate text-sm font-bold text-slate-100">
											{item.title}
										</span>
										<span class="mt-1 flex flex-wrap items-center gap-1">
											<span
												class="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {itemStatus.className}"
											>
												{itemStatus.label}
											</span>
											<span class="text-[10px] text-slate-500">{rewardLabel(item)}</span>
										</span>
									</span>

									{#if itemStatus.done}
										<Check
											class="mt-1 size-4 shrink-0 text-emerald-300"
											strokeWidth={2.5}
											aria-hidden="true"
										/>
									{/if}
								</button>
							</li>
						{/each}
					</ul>

					<button
						type="button"
						onclick={() => hubKiosks.open('shop')}
						class="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-left text-[11px] font-medium text-orange-100 transition hover:bg-orange-500/20"
					>
						<ShoppingBag size={15} strokeWidth={2} aria-hidden="true" />
						Want a new look? Visit the Halloween Shop →
					</button>
				</nav>
			</div>
		</section>
	</div>
{/if}
