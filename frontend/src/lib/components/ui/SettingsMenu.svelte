<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Flag from '@lucide/svelte/icons/flag';
	import HeartCrack from '@lucide/svelte/icons/heart-crack';
	import House from '@lucide/svelte/icons/house';
	import Lock from '@lucide/svelte/icons/lock';
	import LogOut from '@lucide/svelte/icons/log-out';
	import PawPrint from '@lucide/svelte/icons/paw-print';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Settings from '@lucide/svelte/icons/settings';
	import Shirt from '@lucide/svelte/icons/shirt';
	import Skull from '@lucide/svelte/icons/skull';
	import Swords from '@lucide/svelte/icons/swords';
	import Trophy from '@lucide/svelte/icons/trophy';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	import X from '@lucide/svelte/icons/x';
	import { onMount, tick, type Component } from 'svelte';
	import { audio } from '../../audio/engine';
	import { audioSettings } from '../../audio/settings.svelte';
	import { SKINS, type SkinId } from '../../cosmetics/skins';
	import { SKIN_ICONS, SKIN_TONES } from '../../cosmetics/skinUi';
	import { explorerAccountUrl } from '../../near/rpc';
	import type { Mg2Phase, RacePhase } from '../../services/protocol';
	import { authSession } from '../../state/auth.svelte';
	import { cosmetics } from '../../state/cosmetics.svelte';
	import { hubKiosks } from '../../state/hubKiosks.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';
	import { missions } from '../../state/missions.svelte';
	import { playerProfile } from '../../state/playerProfile.svelte';
	import { playerSettings } from '../../state/playerSettings.svelte';
	import { progression } from '../../state/progression.svelte';
	import { race } from '../../state/race.svelte';
	import { stats } from '../../state/stats.svelte';
	import MissionThumbnail from './MissionThumbnail.svelte';
	import SkinPreview from './SkinPreview.svelte';

	type TabId = 'profile' | 'skins' | 'stats' | 'progress';

	type TabDefinition = {
		id: TabId;
		label: string;
		icon: Component<{ size?: number; strokeWidth?: number; class?: string }>;
	};

	const TABS: readonly TabDefinition[] = [
		{ id: 'profile', label: 'Profile', icon: UserRound },
		{ id: 'skins', label: 'Skins', icon: Shirt },
		{ id: 'stats', label: 'Stats', icon: ChartColumn },
		{ id: 'progress', label: 'Progress', icon: Trophy }
	];

	const PRESET_COLORS = [
		{ value: '#f8fafc', label: 'White' },
		{ value: '#4ade80', label: 'Green' },
		{ value: '#38bdf8', label: 'Blue' },
		{ value: '#fbbf24', label: 'Amber' },
		{ value: '#fb7185', label: 'Pink' },
		{ value: '#c084fc', label: 'Violet' },
		{ value: '#f472b6', label: 'Fuchsia' },
		{ value: '#a3e635', label: 'Lime' }
	];

	const CRYPT_PHASE_LABELS: Record<Mg2Phase, string> = {
		idle: 'Not started',
		countdown: 'Starting',
		playing: 'In progress',
		won: 'Complete',
		lost: 'Defeat'
	};

	const RACE_PHASE_LABELS: Record<RacePhase, string> = {
		idle: 'Not started',
		countdown: 'Starting',
		playing: 'Racing',
		results: 'Results'
	};

	let open = $state(false);
	let loggingOut = $state(false);
	let tab = $state<TabId>('profile');
	let previewSkinId = $state<SkinId | null>(null);
	let nameInput = $state('');
	let nameEl = $state<HTMLInputElement>();
	let savedMessage = $state('');
	let savedTimer: ReturnType<typeof setTimeout> | undefined;
	let confirmReset = $state(false);
	let confirmStatsReset = $state(false);
	let confirmErrandsReset = $state(false);
	let errandsMessage = $state('');
	let errandsTimer: ReturnType<typeof setTimeout> | undefined;
	let missionMessage = $state('');
	let missionTimer: ReturnType<typeof setTimeout> | undefined;
	let statsMessage = $state('');
	let statsTimer: ReturnType<typeof setTimeout> | undefined;

	const activeTab = $derived(TABS.find((entry) => entry.id === tab) ?? TABS[0]);
	const previewSkin = $derived(
		SKINS.find((skin) => skin.id === (previewSkinId ?? cosmetics.equippedSkin)) ?? SKINS[0]
	);
	const previewUnlocked = $derived(cosmetics.isUnlocked(previewSkin.id));
	const previewEquipped = $derived(cosmetics.equippedSkin === previewSkin.id);
	const previewIndex = $derived(SKINS.findIndex((skin) => skin.id === previewSkin.id) + 1);
	const previewName = $derived(nameInput.trim() || lobby.alias || 'Player');
	const captured = $derived(missions.capturedCount);
	const missionTotal = $derived(missions.mission.target);
	const missionPercent = $derived(
		missionTotal > 0 ? Math.round((captured / missionTotal) * 100) : 0
	);
	const unlockedSkins = $derived(SKINS.filter((skin) => cosmetics.isUnlocked(skin.id)).length);
	const statsData = $derived(stats.data);

	const cryptTotal = $derived(minigame2.snapshot?.skulls.length || 10);
	const cryptDeposited = $derived(minigame2.depositedTotal);
	const cryptPercent = $derived(
		cryptTotal > 0 ? Math.round((cryptDeposited / cryptTotal) * 100) : 0
	);
	const cryptPhase = $derived(minigame2.phase);
	const cryptChipClass = $derived(
		cryptPhase === 'won'
			? 'bg-amber-400/20 text-amber-200'
			: cryptPhase === 'lost'
				? 'bg-rose-500/20 text-rose-200'
				: cryptPhase === 'playing' || cryptPhase === 'countdown'
					? 'bg-sky-400/15 text-sky-200'
					: 'bg-slate-700/60 text-slate-400'
	);

	const raceTotalLaps = $derived(race.snapshot?.totalLaps ?? 5);
	const raceLap = $derived(race.displayLap);
	const racePercent = $derived(raceTotalLaps > 0 ? Math.round((raceLap / raceTotalLaps) * 100) : 0);
	const racePhase = $derived(race.phase);
	const raceChipClass = $derived(
		racePhase === 'results'
			? 'bg-amber-400/20 text-amber-200'
			: racePhase === 'playing' || racePhase === 'countdown'
				? 'bg-sky-400/15 text-sky-200'
				: 'bg-slate-700/60 text-slate-400'
	);

	$effect(() => {
		nameInput = lobby.alias;
	});

	function toggleOpen(): void {
		open = !open;

		if (open) {
			hubKiosks.close();
			previewSkinId = null;

			if (tab === 'profile') {
				void tick().then(() => nameEl?.focus());
			}
		} else {
			confirmReset = false;
			confirmStatsReset = false;
		}
	}

	function close(): void {
		open = false;
		confirmReset = false;
		confirmStatsReset = false;
	}

	function selectTab(next: TabId): void {
		tab = next;
		confirmReset = false;
		confirmStatsReset = false;

		if (next === 'skins') {
			previewSkinId = null;
		}

		if (next === 'profile') {
			void tick().then(() => nameEl?.focus());
		}
	}

	function saveName(event: SubmitEvent): void {
		event.preventDefault();

		const value = nameInput.trim();

		if (!value) {
			nameInput = lobby.alias;
			return;
		}

		if (value === lobby.alias) {
			nameInput = lobby.alias;
			return;
		}

		lobby.setAlias(value);
		nameInput = lobby.alias;
		audio.play('ui_confirm', { priority: 1 });
		savedMessage = 'Name updated';
		clearTimeout(savedTimer);
		savedTimer = setTimeout(() => {
			savedMessage = '';
		}, 2500);
	}

	function pickColor(color: string): void {
		playerSettings.setLabelColor(color);
		audio.play('ui_click', { priority: 1 });
	}

	async function handleLogout(): Promise<void> {
		if (loggingOut) return;

		loggingOut = true;
		await authSession.logout();
	}

	function selectPreviewSkin(id: SkinId): void {
		previewSkinId = id;
		audio.play('ui_click', { priority: 1 });
	}

	function equipSkin(id: SkinId): void {
		if (!cosmetics.equip(id)) {
			return;
		}

		previewSkinId = id;
		audio.play('ui_confirm', { priority: 1 });
	}

	function unlockLabel(skinId: SkinId): string {
		const skin = SKINS.find((entry) => entry.id === skinId);

		return skin ? `Mint or claim the ${skin.name} NFT` : '';
	}

	function resetMission(): void {
		missions.resetMission();
		confirmReset = false;
		missionMessage = 'Mission restarted';
		clearTimeout(missionTimer);
		missionTimer = setTimeout(() => {
			missionMessage = '';
		}, 2500);
	}

	async function resetErrands(): Promise<void> {
		await progression.resetErrands();
		confirmErrandsReset = false;
		errandsMessage = 'Errands reset. Claimed NFTs are kept.';

		clearTimeout(errandsTimer);
		errandsTimer = setTimeout(() => (errandsMessage = ''), 3200);
	}

	function openCentral(): void {
		window.dispatchEvent(new CustomEvent('rw:open-central', { detail: { tab: 'errands' } }));
	}

	function resetStats(): void {
		stats.resetStats();
		confirmStatsReset = false;
		statsMessage = 'Stats reset';
		clearTimeout(statsTimer);
		statsTimer = setTimeout(() => {
			statsMessage = '';
		}, 2500);
	}

	onMount(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && open) {
				event.preventDefault();
				close();
			}
		};

		window.addEventListener('keydown', onKeyDown);

		return () => {
			window.removeEventListener('keydown', onKeyDown);
			clearTimeout(savedTimer);
			clearTimeout(missionTimer);
			clearTimeout(statsTimer);
		};
	});
</script>

<div class="pointer-events-none fixed inset-0 z-50 text-xs text-slate-100">
	<div class="pointer-events-auto absolute top-3 right-3 flex items-center gap-2">
		<button
			type="button"
			onclick={handleLogout}
			disabled={loggingOut}
			aria-label="Sign out"
			title="Sign out"
			class="flex h-10 w-10 items-center justify-center rounded-full border border-rose-400/25 bg-slate-950/50 text-rose-200 shadow-2xl backdrop-blur-sm transition hover:border-rose-300/50 hover:bg-rose-500/20 active:scale-95 disabled:cursor-wait disabled:opacity-60"
		>
			<LogOut size={18} strokeWidth={2} aria-hidden="true" />
		</button>

		<button
			type="button"
			onclick={toggleOpen}
			aria-label={open ? 'Close settings' : 'Open settings'}
			aria-expanded={open}
			aria-controls="settings-panel"
			class="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/50 text-slate-100 shadow-2xl backdrop-blur-sm transition hover:bg-slate-900/70 active:scale-95"
		>
			{#if open}
				<X size={18} strokeWidth={2} aria-hidden="true" />
			{:else}
				<Settings size={18} strokeWidth={2} aria-hidden="true" />
			{/if}
		</button>
	</div>

	{#if open}
		<div class="pointer-events-auto fixed inset-0 flex items-center justify-center p-3 sm:p-6">
			<button
				type="button"
				tabindex="-1"
				aria-label="Close settings"
				onclick={close}
				class="absolute inset-0 cursor-default bg-[#050310]/80 backdrop-blur-sm"
			></button>

			<div
				id="settings-panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="settings-title"
				class="relative flex max-h-[min(90dvh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-orange-400/20 bg-gradient-to-b from-[#1a1030] via-[#130c24] to-[#0b0716] shadow-[0_30px_90px_-25px_rgba(0,0,0,0.95),0_0_70px_-30px_rgba(251,146,60,0.35)]"
			>
				<div
					class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent"
					aria-hidden="true"
				></div>

				<header class="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
					<span
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-400/25 bg-orange-400/15 text-orange-200"
						aria-hidden="true"
					>
						<Settings size={16} strokeWidth={2} />
					</span>

					<div class="min-w-0">
						<p class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">
							Settings
						</p>
						<h2 id="settings-title" class="truncate text-sm font-bold text-slate-100">
							{activeTab.label}
						</h2>
					</div>

					<span class="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-slate-400">
						<span
							class="h-1.5 w-1.5 rounded-full {lobby.status === 'connected'
								? 'bg-emerald-400'
								: 'bg-amber-400'}"
						></span>
						{lobby.status === 'connected' ? 'Connected' : 'Offline'}
					</span>

					<button
						type="button"
						onclick={close}
						aria-label="Close settings"
						class="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:outline-none"
					>
						<X size={16} strokeWidth={2.5} aria-hidden="true" />
					</button>
				</header>

				<div class="flex min-h-0 flex-1 flex-col sm:flex-row">
					<nav
						class="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0 sm:p-2.5"
						aria-label="Settings sections"
					>
						{#each TABS as entry (entry.id)}
							{@const Icon = entry.icon}
							{@const active = tab === entry.id}
							<button
								type="button"
								onclick={() => selectTab(entry.id)}
								aria-pressed={active}
								class="flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-semibold tracking-wider uppercase transition sm:w-full {active
									? 'bg-orange-400/15 text-orange-100'
									: 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}"
							>
								<span
									class="shrink-0 {active ? 'text-orange-300' : 'text-slate-500'}"
									aria-hidden="true"
								>
									<Icon size={15} strokeWidth={2} />
								</span>
								{entry.label}
								{#if entry.id === 'skins'}
									<span
										class="ml-auto hidden rounded-full bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 sm:inline"
									>
										{unlockedSkins}/{SKINS.length}
									</span>
								{:else if entry.id === 'progress'}
									<span
										class="ml-auto hidden rounded-full bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 sm:inline"
									>
										{missionPercent}%
									</span>
								{/if}
							</button>
						{/each}
					</nav>

					<div class="min-h-0 flex-1 overflow-y-auto p-4">
						{#if tab === 'profile'}
							<div class="space-y-4">
								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										Name
									</h2>
									<form class="flex gap-1.5" onsubmit={saveName}>
										<label class="sr-only" for="settings-name">Player name</label>
										<input
											id="settings-name"
											bind:this={nameEl}
											bind:value={nameInput}
											maxlength="24"
											autocomplete="nickname"
											placeholder="Your name"
											class="min-w-0 flex-1 rounded-lg border border-orange-400/20 bg-orange-400/5 px-2 py-1.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-orange-300/70"
										/>
										<button
											type="submit"
											class="shrink-0 rounded-lg border border-orange-400/40 bg-orange-500/20 px-2.5 py-1.5 font-bold text-orange-200 transition hover:bg-orange-500/30"
										>
											Save
										</button>
									</form>
									{#if savedMessage}
										<p
											class="mt-1 flex items-center gap-1 text-[10px] text-amber-300"
											role="status"
										>
											<Check size={11} strokeWidth={2.5} aria-hidden="true" />
											{savedMessage}
										</p>
									{:else}
										<p class="mt-1 text-[10px] text-slate-500">
											Changing it reconnects to the server with the new name.
										</p>
									{/if}
								</section>

								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										NEAR account
									</h2>

									{#if authSession.accountId}
										<a
											href={explorerAccountUrl(authSession.accountId)}
											target="_blank"
											rel="noreferrer"
											title={authSession.publicKey}
											class="block truncate rounded-lg border border-orange-400/20 bg-orange-400/5 px-2 py-1.5 font-mono text-[11px] text-amber-100/90 transition hover:border-orange-300/50 hover:text-amber-50"
										>
											{authSession.accountId} ↗
										</a>
									{:else}
										<p class="text-[10px] text-slate-500">Preparing your account…</p>
									{/if}

									<button
										type="button"
										onclick={handleLogout}
										disabled={loggingOut}
										class="mt-2 w-full rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
									>
										{loggingOut ? 'Signing out…' : 'Sign out'}
									</button>
								</section>

								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										3D label color
									</h2>

									<div class="flex items-center gap-2">
										<label class="sr-only" for="settings-label-color">3D label color</label>
										<input
											id="settings-label-color"
											type="color"
											value={playerSettings.labelColor}
											oninput={(event) => pickColor(event.currentTarget.value)}
											class="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-white/10 bg-transparent p-0.5"
										/>
										<div class="flex flex-wrap gap-1.5">
											{#each PRESET_COLORS as preset (preset.value)}
												<button
													type="button"
													onclick={() => pickColor(preset.value)}
													aria-label={preset.label}
													title={preset.label}
													aria-pressed={playerSettings.labelColor.toLowerCase() === preset.value}
													class="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 transition hover:scale-110 active:scale-95"
													style:background-color={preset.value}
												>
													{#if playerSettings.labelColor.toLowerCase() === preset.value}
														<Check
															size={13}
															strokeWidth={3}
															aria-hidden="true"
															class="text-slate-950"
														/>
													{/if}
												</button>
											{/each}
										</div>
									</div>

									<div
										class="mt-2 flex min-h-14 items-center justify-center rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2.5"
									>
										<span
											class="max-w-full truncate rounded-full bg-slate-950/80 px-3 py-1 text-[13px] font-semibold shadow-lg"
											style:color={playerSettings.labelColor}
										>
											{previewName}
										</span>
									</div>
									<p class="mt-1 text-[10px] text-slate-500">
										This is how the name will look above players' heads.
									</p>
								</section>

								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										Interface
									</h2>

									<button
										type="button"
										onclick={() =>
											playerProfile.setMissionHudVisible(!playerProfile.missionHudVisible)}
										aria-pressed={playerProfile.missionHudVisible}
										class="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-slate-200 transition hover:bg-white/10"
									>
										<span class="flex items-center gap-1.5">
											{#if playerProfile.missionHudVisible}
												<Eye size={13} strokeWidth={2} aria-hidden="true" />
											{:else}
												<EyeOff size={13} strokeWidth={2} aria-hidden="true" />
											{/if}
											Show mission button
										</span>
										<span
											class="relative h-4 w-7 shrink-0 rounded-full transition {playerProfile.missionHudVisible
												? 'bg-orange-500'
												: 'bg-slate-600'}"
											aria-hidden="true"
										>
											<span
												class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all {playerProfile.missionHudVisible
													? 'left-3.5'
													: 'left-0.5'}"
											></span>
										</span>
									</button>

									<p class="mt-1 text-[10px] text-slate-500">
										Your profile and progress are saved only in this browser.
									</p>
								</section>

								<section>
									<div class="mb-1.5 flex items-center justify-between gap-2">
										<h2 class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">
											Audio
										</h2>
										<button
											type="button"
											onclick={() => {
												audioSettings.toggleMuted();
												audio.play('ui_click', { priority: 1 });
											}}
											aria-pressed={audioSettings.muted}
											aria-label={audioSettings.muted ? 'Unmute audio' : 'Mute audio'}
											title={audioSettings.muted ? 'Unmute' : 'Mute'}
											class="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
										>
											{#if audioSettings.muted}
												<VolumeX size={13} strokeWidth={2} aria-hidden="true" />
											{:else}
												<Volume2 size={13} strokeWidth={2} aria-hidden="true" />
											{/if}
										</button>
									</div>

									<div class="space-y-1.5">
										<label class="grid grid-cols-[52px_1fr_30px] items-center gap-2">
											<span class="text-slate-300">Master</span>
											<input
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={audioSettings.master}
												oninput={(event) =>
													audioSettings.setMaster(event.currentTarget.valueAsNumber)}
												class="accent-orange-400"
											/>
											<span class="text-right font-mono text-[10px] text-slate-500">
												{Math.round(audioSettings.master * 100)}
											</span>
										</label>
										<label class="grid grid-cols-[52px_1fr_30px] items-center gap-2">
											<span class="text-slate-300">Ambience</span>
											<input
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={audioSettings.ambience}
												oninput={(event) =>
													audioSettings.setAmbience(event.currentTarget.valueAsNumber)}
												class="accent-orange-400"
											/>
											<span class="text-right font-mono text-[10px] text-slate-500">
												{Math.round(audioSettings.ambience * 100)}
											</span>
										</label>
										<label class="grid grid-cols-[52px_1fr_30px] items-center gap-2">
											<span class="text-slate-300">Music</span>
											<input
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={audioSettings.music}
												oninput={(event) =>
													audioSettings.setMusic(event.currentTarget.valueAsNumber)}
												class="accent-orange-400"
											/>
											<span class="text-right font-mono text-[10px] text-slate-500">
												{Math.round(audioSettings.music * 100)}
											</span>
										</label>
										<label class="grid grid-cols-[52px_1fr_30px] items-center gap-2">
											<span class="text-slate-300">Effects</span>
											<input
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={audioSettings.sfx}
												oninput={(event) => audioSettings.setSfx(event.currentTarget.valueAsNumber)}
												class="accent-orange-400"
											/>
											<span class="text-right font-mono text-[10px] text-slate-500">
												{Math.round(audioSettings.sfx * 100)}
											</span>
										</label>
										<label class="grid grid-cols-[52px_1fr_30px] items-center gap-2">
											<span class="text-slate-300">Interface</span>
											<input
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={audioSettings.ui}
												oninput={(event) => audioSettings.setUi(event.currentTarget.valueAsNumber)}
												class="accent-orange-400"
											/>
											<span class="text-right font-mono text-[10px] text-slate-500">
												{Math.round(audioSettings.ui * 100)}
											</span>
										</label>
									</div>

									<p class="mt-1 text-[10px] text-slate-500">
										Procedural audio, no downloads. Saved in this browser.
									</p>
								</section>
							</div>
						{:else if tab === 'skins'}
							<div class="space-y-3">
								<div class="flex items-end justify-between gap-2">
									<h2 class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">
										Appearance
									</h2>
									<span class="text-[10px] text-slate-500">
										{unlockedSkins}/{SKINS.length} available
									</span>
								</div>

								<div
									class="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start"
								>
									<!-- Live 3D preview of the highlighted skin. -->
									<div
										class="relative overflow-hidden rounded-xl border border-amber-500/20 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.16),rgba(76,29,149,0.18)_42%,rgba(8,4,20,0.96)_74%)] lg:sticky lg:top-0"
									>
										<div class="pointer-events-none absolute inset-0" aria-hidden="true">
											<div
												class="absolute -bottom-10 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-orange-500/20 blur-3xl"
											></div>
											<div
												class="absolute -top-10 -right-6 h-40 w-40 rounded-full bg-violet-600/25 blur-3xl"
											></div>
										</div>

										<div class="relative h-[220px] w-full sm:h-[280px]">
											<SkinPreview skin={previewSkin.id} />
										</div>

										<div
											class="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0b0716] via-[#0b0716]/85 to-transparent"
											aria-hidden="true"
										></div>

										<div
											class="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5"
										>
											{#if !previewUnlocked}
												<span
													class="flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 text-[9px] font-semibold tracking-wider text-amber-200 uppercase backdrop-blur-sm"
												>
													<Lock size={10} strokeWidth={2.5} aria-hidden="true" />
													Locked
												</span>
											{:else if previewEquipped}
												<span
													class="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-1 text-[9px] font-semibold tracking-wider text-amber-100 uppercase backdrop-blur-sm"
												>
													<Check size={10} strokeWidth={3} aria-hidden="true" />
													Equipped
												</span>
											{/if}
											<span
												class="rounded-full bg-slate-950/70 px-2 py-1 text-[9px] font-semibold text-slate-300 backdrop-blur-sm"
											>
												{previewIndex} / {SKINS.length}
											</span>
										</div>

										<div class="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2.5">
											<p
												class="text-[9px] font-semibold tracking-[0.2em] text-amber-300/80 uppercase"
											>
												{previewUnlocked ? 'Selected skin' : 'Reward skin'}
											</p>
											<p class="truncate text-sm font-bold text-slate-50" aria-live="polite">
												{previewSkin.name}
											</p>
											<p class="line-clamp-2 text-[10px] leading-snug text-slate-400">
												{previewUnlocked ? previewSkin.description : unlockLabel(previewSkin.id)}
											</p>
										</div>
									</div>

									<!-- Catalog: pick a card to inspect it, then equip. -->
									<div class="min-w-0 space-y-2">
										<ul class="grid grid-cols-2 gap-1.5">
											{#each SKINS as skin (skin.id)}
												{@const unlocked = cosmetics.isUnlocked(skin.id)}
												{@const equipped = cosmetics.equippedSkin === skin.id}
												{@const selected = previewSkin.id === skin.id}
												{@const Icon = SKIN_ICONS[skin.id]}
												<li>
													<button
														type="button"
														onclick={() => selectPreviewSkin(skin.id)}
														aria-pressed={selected}
														title={unlocked ? skin.name : `${skin.name} — ${unlockLabel(skin.id)}`}
														class="group relative flex w-full flex-col items-center gap-1 rounded-lg border px-1.5 py-2 transition {selected
															? 'border-amber-400/70 bg-amber-400/10 shadow-[0_0_18px_-6px_rgba(251,191,36,0.7)]'
															: 'border-white/10 bg-slate-900/50 hover:border-amber-400/30 hover:bg-amber-500/5'}"
													>
														<span
															class="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br {SKIN_TONES[
																skin.id
															]}"
															aria-hidden="true"
														>
															<Icon size={15} strokeWidth={2} />
														</span>
														<span
															class="w-full truncate text-center text-[9px] font-medium {selected
																? 'text-amber-200'
																: unlocked
																	? 'text-slate-300'
																	: 'text-slate-500'}"
														>
															{skin.name}
														</span>

														{#if !unlocked}
															<span
																class="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-950/90 text-slate-400"
																aria-hidden="true"
															>
																<Lock size={8} strokeWidth={3} />
															</span>
														{:else if equipped}
															<span
																class="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-amber-950"
																aria-hidden="true"
															>
																<Check size={9} strokeWidth={3} />
															</span>
														{/if}
													</button>
												</li>
											{/each}
										</ul>

										<button
											type="button"
											disabled={!previewUnlocked || previewEquipped}
											onclick={() => equipSkin(previewSkin.id)}
											class="flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2.5 text-[11px] font-semibold tracking-wide uppercase transition {previewEquipped
												? 'cursor-default border-amber-400/30 bg-amber-400/10 text-amber-200'
												: previewUnlocked
													? 'border-orange-400/40 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30 active:scale-[0.99]'
													: 'cursor-not-allowed border-white/5 bg-slate-800/40 text-slate-500'}"
										>
											{#if previewEquipped}
												<Check size={13} strokeWidth={2.5} aria-hidden="true" />
												Equipped
											{:else if previewUnlocked}
												Equip {previewSkin.name}
											{:else}
												<Lock size={12} strokeWidth={2.5} aria-hidden="true" />
												Locked
											{/if}
										</button>

										<p class="text-[10px] leading-snug text-slate-500">
											{#if previewUnlocked}
												Select a skin to preview it in 3D, then equip it.
											{:else}
												{unlockLabel(previewSkin.id)} to unlock this skin.
											{/if}
										</p>
										<p class="text-[10px] leading-snug text-slate-500">
											Unlocked skins are kept even if you restart a mission.
										</p>
									</div>
								</div>
							</div>
						{:else if tab === 'stats'}
							<div class="space-y-3">
								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										Overview
									</h2>

									<div class="grid grid-cols-2 gap-1.5">
										<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<p class="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
												Missions played
											</p>
											<p class="mt-0.5 font-mono text-lg leading-none text-slate-100">
												{stats.missionsPlayed}
											</p>
										</div>
										<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<p class="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
												Completed
											</p>
											<p class="mt-0.5 font-mono text-lg leading-none text-amber-200">
												{stats.missionsCompleted}
											</p>
										</div>
										<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<p
												class="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase"
											>
												<Swords size={10} strokeWidth={2} aria-hidden="true" />
												Kills
											</p>
											<p class="mt-0.5 font-mono text-lg leading-none text-slate-100">
												{stats.totalKills}
											</p>
										</div>
										<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<p
												class="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase"
											>
												<HeartCrack size={10} strokeWidth={2} aria-hidden="true" />
												Deaths
											</p>
											<p class="mt-0.5 font-mono text-lg leading-none text-rose-200">
												{stats.totalDeaths}
											</p>
										</div>
									</div>
								</section>

								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										By mode
									</h2>

									<ul class="space-y-2">
										<li class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<div class="flex items-center gap-2">
												<span
													class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/25 to-orange-500/10 text-amber-200"
													aria-hidden="true"
												>
													<PawPrint size={14} strokeWidth={2} />
												</span>
												<p class="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-100">
													The 25 Lost Cats
												</p>
												<span
													class="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-amber-200 uppercase"
												>
													{statsData.missions.cats.catsFound} found
												</span>
											</div>
											<div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Runs</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.cats.played}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Completed</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.cats.completed}
													</span>
												</div>
											</div>
										</li>

										<li class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<div class="flex items-center gap-2">
												<span
													class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/25 to-slate-700/10 text-violet-200"
													aria-hidden="true"
												>
													<Skull size={14} strokeWidth={2} />
												</span>
												<p class="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-100">
													The Mummy Crypt
												</p>
												<span
													class="shrink-0 rounded-full bg-violet-400/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-violet-200 uppercase"
												>
													{statsData.missions.crypt.completed} won
												</span>
											</div>
											<div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Rounds</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.crypt.played}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Victories</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.crypt.completed}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Defeats</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.crypt.failed}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Deaths</span>
													<span class="font-mono text-rose-200">
														{statsData.missions.crypt.deaths}
													</span>
												</div>
											</div>
										</li>

										<li class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<div class="flex items-center gap-2">
												<span
													class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-500/25 to-rose-600/10 text-red-200"
													aria-hidden="true"
												>
													<Flag size={14} strokeWidth={2} />
												</span>
												<p class="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-100">
													Grand Prix
												</p>
												<span
													class="shrink-0 rounded-full bg-red-400/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-red-200 uppercase"
												>
													{statsData.missions.race.won} wins
												</span>
											</div>
											<div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Races</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.race.played}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Finished</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.race.finished}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Laps</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.race.laps}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Destroyed</span>
													<span class="font-mono text-rose-200">
														{statsData.missions.race.deaths}
													</span>
												</div>
											</div>
										</li>

										<li class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<div class="flex items-center gap-2">
												<span
													class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/25 to-teal-600/10 text-emerald-200"
													aria-hidden="true"
												>
													<Swords size={14} strokeWidth={2} />
												</span>
												<p class="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-100">
													Barn Siege
												</p>
												<span
													class="shrink-0 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-200 uppercase"
												>
													{statsData.missions.barn.completed} won
												</span>
											</div>
											<div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Matches</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.barn.played}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Victories</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.barn.completed}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Kills</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.barn.kills}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Downs</span>
													<span class="font-mono text-rose-200">
														{statsData.missions.barn.deaths}
													</span>
												</div>
												<div class="flex items-baseline justify-between gap-1">
													<span class="text-slate-500">Defeats</span>
													<span class="font-mono text-slate-300">
														{statsData.missions.barn.failed}
													</span>
												</div>
											</div>
										</li>
									</ul>
								</section>

								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										Data
									</h2>

									{#if confirmStatsReset}
										<div class="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-2">
											<p class="text-[10px] text-rose-200">
												Reset all stats? This cannot be undone.
											</p>
											<div class="mt-1.5 flex gap-1.5">
												<button
													type="button"
													onclick={resetStats}
													class="rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-medium text-rose-950 transition hover:bg-rose-400"
												>
													Yes, reset
												</button>
												<button
													type="button"
													onclick={() => (confirmStatsReset = false)}
													class="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 transition hover:bg-white/10"
												>
													Cancel
												</button>
											</div>
										</div>
									{:else}
										<button
											type="button"
											onclick={() => (confirmStatsReset = true)}
											class="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
										>
											<RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
											Reset stats
										</button>
									{/if}

									{#if statsMessage}
										<p
											class="mt-1 flex items-center gap-1 text-[10px] text-amber-300"
											role="status"
										>
											<Check size={11} strokeWidth={2.5} aria-hidden="true" />
											{statsMessage}
										</p>
									{:else}
										<p class="mt-1 text-[10px] text-slate-500">
											{#if stats.syncState === 'synced'}
												Stats synced to the cloud.
											{:else if stats.syncState === 'syncing'}
												Saving stats…
											{:else if stats.syncState === 'offline'}
												Offline — saved in this browser.
											{:else}
												Saved in this browser.
											{/if}
										</p>
									{/if}
								</section>
							</div>
						{:else}
							<div class="space-y-4">
								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										Missions
									</h2>

									<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
										<div class="flex items-start gap-2">
											<div
												class="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-amber-400/20 bg-slate-950/60"
											>
												<MissionThumbnail kind="cats" />
												{#if missions.completed}
													<span
														class="absolute right-1 bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow"
														aria-hidden="true"
													>
														<Check size={10} strokeWidth={3} />
													</span>
												{/if}
											</div>

											<div class="min-w-0 flex-1">
												<div class="flex items-center justify-between gap-2">
													<p class="truncate text-[11px] font-medium text-slate-100">
														{missions.mission.title}
													</p>
													<span
														class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {missions.completed
															? 'bg-amber-400/20 text-amber-200'
															: 'bg-sky-400/15 text-sky-200'}"
													>
														{missions.completed ? 'Complete' : 'In progress'}
													</span>
												</div>
												<p class="mt-0.5 text-[10px] leading-snug text-slate-500">
													{missions.mission.description}
												</p>
											</div>
										</div>

										<div class="mt-2 flex items-baseline justify-between gap-2 text-[10px]">
											<span class="text-slate-500">Cats found</span>
											<span class="shrink-0 font-mono text-slate-300">
												{captured}/{missionTotal}
											</span>
										</div>
										<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
											<div
												class="h-full rounded-full transition-[width] duration-300 {missions.completed
													? 'bg-amber-400'
													: 'bg-orange-400'}"
												style:width="{missionPercent}%"
											></div>
										</div>

										{#if confirmReset}
											<div
												class="mt-2 rounded-md border border-rose-400/30 bg-rose-500/10 px-2.5 py-2"
											>
												<p class="text-[10px] text-rose-200">
													Restart the mission? All 25 cats will reappear and you'll lose your
													current progress.
												</p>
												<div class="mt-1.5 flex gap-1.5">
													<button
														type="button"
														onclick={resetMission}
														class="rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-medium text-rose-950 transition hover:bg-rose-400"
													>
														Yes, restart
													</button>
													<button
														type="button"
														onclick={() => (confirmReset = false)}
														class="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 transition hover:bg-white/10"
													>
														Cancel
													</button>
												</div>
											</div>
										{:else}
											<button
												type="button"
												onclick={() => (confirmReset = true)}
												class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
											>
												<RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
												Restart mission
											</button>
										{/if}

										{#if missionMessage}
											<p
												class="mt-1 flex items-center gap-1 text-[10px] text-amber-300"
												role="status"
											>
												<Check size={11} strokeWidth={2.5} aria-hidden="true" />
												{missionMessage}
											</p>
										{/if}
									</div>
								</section>

								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										Progression
									</h2>

									<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
										<div class="grid grid-cols-2 gap-2 text-[10px]">
											<div class="rounded-md bg-white/5 px-2 py-1.5">
												<p class="text-slate-500">Missions completed</p>
												<p class="font-mono text-sm text-slate-100">
													{progression.completedCount}/{progression.totalCount}
												</p>
											</div>
											<div class="rounded-md bg-white/5 px-2 py-1.5">
												<p class="text-slate-500">NFTs claimed</p>
												<p class="font-mono text-sm text-amber-200">{progression.claimedCount}</p>
											</div>
										</div>

										<p class="mt-1.5 text-[10px] text-slate-500">{progression.syncLabel}</p>

										<div class="mt-1.5 flex gap-1.5">
											<button
												type="button"
												onclick={openCentral}
												class="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-slate-200 transition hover:bg-white/10"
											>
												<Trophy size={12} strokeWidth={2} aria-hidden="true" />
												Open Central
											</button>

											{#if confirmErrandsReset}
												<button
													type="button"
													onclick={resetErrands}
													class="min-h-9 flex-1 rounded-md bg-rose-500 px-2 text-[11px] font-medium text-rose-950 transition hover:bg-rose-400"
												>
													Confirm reset
												</button>
												<button
													type="button"
													onclick={() => (confirmErrandsReset = false)}
													class="min-h-9 rounded-md border border-white/15 bg-white/5 px-2 text-[11px] text-slate-200 transition hover:bg-white/10"
												>
													Cancel
												</button>
											{:else}
												<button
													type="button"
													onclick={() => (confirmErrandsReset = true)}
													class="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-slate-300 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
												>
													<RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
													Reset errands
												</button>
											{/if}
										</div>

										{#if confirmErrandsReset}
											<p class="mt-1 text-[10px] leading-snug text-rose-200">
												Errands return to available. Completed missions and claimed NFTs are kept
												and cannot be claimed again.
											</p>
										{:else if errandsMessage}
											<p class="mt-1 flex items-center gap-1 text-[10px] text-amber-300">
												<Check size={11} strokeWidth={2.5} aria-hidden="true" />
												{errandsMessage}
											</p>
										{/if}
									</div>
								</section>

								<section>
									<h2
										class="mb-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase"
									>
										Minigames
									</h2>

									<ul class="space-y-2">
										<li class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<div class="flex items-start gap-2">
												<div
													class="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-violet-400/20 bg-slate-950/60"
												>
													<MissionThumbnail kind="crypt" />
												</div>
												<div class="min-w-0 flex-1">
													<div class="flex items-center justify-between gap-2">
														<p class="truncate text-[11px] font-medium text-slate-100">
															The Cursed Crypt
														</p>
														<span
															class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {cryptChipClass}"
														>
															{CRYPT_PHASE_LABELS[cryptPhase]}
														</span>
													</div>
													<p class="mt-0.5 text-[10px] leading-snug text-slate-500">
														Deliver all 10 skulls to the main tomb. Mausoleum Crypt.
													</p>
												</div>
											</div>
											<div class="mt-1.5 flex items-baseline justify-between gap-2 text-[10px]">
												<span class="text-slate-500">Skulls delivered</span>
												<span class="font-mono text-slate-300">{cryptDeposited}/{cryptTotal}</span>
											</div>
											<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
												<div
													class="h-full rounded-full bg-amber-400 transition-[width] duration-300"
													style:width="{cryptPercent}%"
												></div>
											</div>
										</li>

										<li class="rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
											<div class="flex items-start gap-2">
												<div
													class="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-red-400/20 bg-slate-950/60"
												>
													<MissionThumbnail kind="race" />
												</div>
												<div class="min-w-0 flex-1">
													<div class="flex items-center justify-between gap-2">
														<p class="truncate text-[11px] font-medium text-slate-100">
															Grand Prix
														</p>
														<span
															class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {raceChipClass}"
														>
															{RACE_PHASE_LABELS[racePhase]}
														</span>
													</div>
													<p class="mt-0.5 text-[10px] leading-snug text-slate-500">
														Win the 5-lap race with cars and power-ups. TWN Track.
													</p>
												</div>
											</div>
											<div class="mt-1.5 flex items-baseline justify-between gap-2 text-[10px]">
												<span class="text-slate-500">Laps completed</span>
												<span class="font-mono text-slate-300">{raceLap}/{raceTotalLaps}</span>
											</div>
											<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
												<div
													class="h-full rounded-full bg-red-400 transition-[width] duration-300"
													style:width="{racePercent}%"
												></div>
											</div>
										</li>

										<li
											class="rounded-lg border border-white/5 bg-slate-900/30 px-2.5 py-2 opacity-80"
										>
											<div class="flex items-start gap-2">
												<div
													class="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-violet-400/15 bg-gradient-to-br from-violet-500/20 to-slate-700/10 text-violet-200"
													aria-hidden="true"
												>
													<House size={20} strokeWidth={2} />
												</div>
												<div class="min-w-0 flex-1">
													<div class="flex items-center justify-between gap-2">
														<p class="truncate text-[11px] font-medium text-slate-100">
															Haunted House
														</p>
														<span
															class="shrink-0 rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-slate-400 uppercase"
														>
															Coming soon
														</span>
													</div>
													<p class="mt-0.5 text-[10px] leading-snug text-slate-500">
														Escape the 5-floor witch house with 5 keys. Not available yet.
													</p>
												</div>
											</div>
										</li>
									</ul>

									<p class="mt-2 text-[10px] leading-relaxed text-slate-500">
										Mission progress is saved in this browser. Crypt and race progress is live and
										resets when the minigame ends.
									</p>
								</section>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
