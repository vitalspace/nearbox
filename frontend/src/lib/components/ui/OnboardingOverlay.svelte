<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Lock from '@lucide/svelte/icons/lock';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trophy from '@lucide/svelte/icons/trophy';
	import { onMount, tick } from 'svelte';
	import { DEFAULT_SKIN, SKINS, type SkinDefinition, type SkinId } from '../../cosmetics/skins';
	import { SKIN_ICONS } from '../../cosmetics/skinUi';
	import { cosmetics } from '../../state/cosmetics.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { playerProfile } from '../../state/playerProfile.svelte';
	import OnboardingPreview from './OnboardingPreview.svelte';
	import { ONBOARDING_TUTORIAL } from './onboardingTutorial';
	import SkinPreview from './SkinPreview.svelte';

	const TUTORIAL_STEPS = ONBOARDING_TUTORIAL;
	const CHARACTER_STEP = TUTORIAL_STEPS.length;
	const TOTAL_STEPS = CHARACTER_STEP + 1;

	let step = $state(0);
	let name = $state('');
	let selectedSkin = $state<SkinId>(DEFAULT_SKIN);
	let error = $state('');
	let nameEl = $state<HTMLInputElement>();

	const isTutorial = $derived(step < CHARACTER_STEP);
	const tutorialStep = $derived(
		TUTORIAL_STEPS[Math.min(step, CHARACTER_STEP - 1)] ?? TUTORIAL_STEPS[0]
	);
	const stepNumber = $derived(step + 1);
	const progressPercent = $derived((stepNumber / TOTAL_STEPS) * 100);

	// Mission-reward skins go last so the free ones are the first thing the
	// player sees when using the arrows.
	const orderedSkins = $derived(
		[...SKINS].sort(
			(a, b) =>
				Number(Boolean(a.unlockMissionId) || a.nftOnly === true) -
				Number(Boolean(b.unlockMissionId) || b.nftOnly === true)
		)
	);

	const currentIndex = $derived(
		Math.max(
			0,
			orderedSkins.findIndex((skin) => skin.id === selectedSkin)
		)
	);
	const currentSkin = $derived(orderedSkins[currentIndex] ?? orderedSkins[0]);
	const currentUnlocked = $derived(cosmetics.isUnlocked(currentSkin.id));
	const availableCount = $derived(
		cosmetics.skins.filter((skin) => cosmetics.isUnlocked(skin.id)).length
	);

	function unlockLabel(skin: SkinDefinition): string {
		return `Own the ${skin.name} NFT`;
	}

	function selectSkin(skin: SkinDefinition): void {
		selectedSkin = skin.id;
	}

	function cycle(direction: number): void {
		const length = orderedSkins.length;

		if (length === 0) {
			return;
		}

		const next = (currentIndex + direction + length) % length;
		selectedSkin = orderedSkins[next].id;
	}

	function goToStep(next: number): void {
		step = Math.max(0, Math.min(CHARACTER_STEP, next));

		if (step === CHARACTER_STEP) {
			void tick().then(() => nameEl?.focus());
		}
	}

	function nextStep(): void {
		goToStep(step + 1);
	}

	function previousStep(): void {
		goToStep(step - 1);
	}

	function skipTutorial(): void {
		goToStep(CHARACTER_STEP);
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();

		const alias = name.trim();

		if (!alias) {
			error = 'Enter a name to continue.';
			nameEl?.focus();
			return;
		}

		if (!currentUnlocked) {
			return;
		}

		if (!cosmetics.equip(selectedSkin)) {
			error = 'That skin is not available yet.';
			return;
		}

		error = '';
		// `lobby.setAlias` is a no-op when there is no backend configured, so
		// persist the name first to guarantee the profile is updated offline.
		playerProfile.setAlias(alias);
		lobby.setAlias(alias);
		playerProfile.completeOnboarding();
	}

	onMount(() => {
		// The onboarding is modal: game shortcuts must not fire while it is
		// open. Typing in the name field keeps working (game handlers already
		// ignore editable targets); everything else is swallowed here.
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.target === nameEl) {
				return;
			}

			if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
				event.preventDefault();

				if (step < CHARACTER_STEP) {
					if (event.key === 'ArrowLeft') {
						previousStep();
					} else {
						nextStep();
					}
				} else {
					cycle(event.key === 'ArrowLeft' ? -1 : 1);
				}
			}

			event.stopImmediatePropagation();
		};

		window.addEventListener('keydown', onKeyDown, true);

		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
		};
	});
</script>

<div
	class="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-3 text-slate-100 backdrop-blur-md sm:items-center sm:p-6"
	role="dialog"
	aria-modal="true"
	aria-labelledby="onboarding-title"
>
	<!-- Decorative glow -->
	<div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
		<div class="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl"></div>
		<div
			class="absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-violet-600/10 blur-3xl"
		></div>
	</div>

	<div
		class="relative my-auto w-full max-w-3xl rounded-2xl border border-amber-500/20 bg-[#0b0716]/95 shadow-[0_30px_90px_-25px_rgba(0,0,0,0.95),0_0_70px_-30px_rgba(251,146,60,0.35)]"
	>
		<header
			class="border-b border-amber-500/15 bg-gradient-to-r from-amber-500/5 via-transparent to-violet-600/10 px-4 py-4 sm:px-6"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-[10px] font-semibold tracking-[0.25em] text-amber-300/80 uppercase">
						{isTutorial ? `Tutorial · ${tutorialStep.kicker}` : 'Welcome to NearBox'}
					</p>
					<h1 id="onboarding-title" class="mt-1 text-xl font-bold text-amber-50 sm:text-2xl">
						{isTutorial ? tutorialStep.title : 'Create your character'}
					</h1>
					<p class="mt-1 text-xs leading-relaxed text-slate-400">
						{isTutorial
							? tutorialStep.description
							: 'Pick a name and a look. You can change both later from Settings.'}
					</p>
				</div>

				<span
					class="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-slate-400"
				>
					{stepNumber} / {TOTAL_STEPS}
				</span>
			</div>

			<div class="mt-3 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
				<div
					class="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-300"
					style:width="{progressPercent}%"
				></div>
			</div>
		</header>

		{#if isTutorial}
			<div class="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
				<div class="grid gap-4 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] sm:items-center">
					<!-- Live 3D preview of the activity. -->
					<div
						class="relative overflow-hidden rounded-xl border border-amber-500/20 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.16),rgba(76,29,149,0.18)_42%,rgba(8,4,20,0.96)_74%)]"
					>
						<div class="pointer-events-none absolute inset-0" aria-hidden="true">
							<div
								class="absolute -bottom-10 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-orange-500/20 blur-3xl"
							></div>
							<div
								class="absolute -top-10 -right-6 h-40 w-40 rounded-full bg-violet-600/25 blur-3xl"
							></div>
						</div>

						<div class="relative h-[210px] w-full sm:h-[250px]">
							<OnboardingPreview kind={tutorialStep.preview} />
						</div>

						<div
							class="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0b0716] via-[#0b0716]/70 to-transparent"
							aria-hidden="true"
						></div>

						<div class="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-3">
							<p
								class="text-[9px] font-semibold tracking-[0.2em] uppercase"
								style:color={tutorialStep.accent}
							>
								Preview
							</p>
							<p class="truncate text-sm font-bold text-slate-50">{tutorialStep.caption}</p>
						</div>
					</div>

					<div class="min-w-0">
						<ul class="space-y-2">
							{#each tutorialStep.points as point, index}
								<li class="flex gap-2 text-[11px] leading-relaxed text-slate-300">
									<span
										class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-[8px] font-bold"
										style:color={tutorialStep.accent}
										aria-hidden="true"
									>
										{index + 1}
									</span>
									<span>{point}</span>
								</li>
							{/each}
						</ul>

						<div class="mt-3 flex flex-wrap gap-1.5">
							{#each tutorialStep.controls as control}
								<span
									class="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-1"
								>
									<kbd
										class="rounded border border-amber-500/25 bg-amber-500/10 px-1 py-0.5 font-mono text-[9px] font-bold text-amber-200"
									>
										{control.keys}
									</kbd>
									<span class="text-[10px] text-slate-400">{control.label}</span>
								</span>
							{/each}
						</div>

						{#if tutorialStep.reward}
							{@const RewardIcon = SKIN_ICONS[tutorialStep.reward.skin]}
							<div
								class="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-2"
							>
								<span
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-400/20 text-amber-200"
									aria-hidden="true"
								>
									<RewardIcon size={15} strokeWidth={2} />
								</span>
								<div class="min-w-0">
									<p class="text-[8px] font-semibold tracking-[0.18em] text-amber-200/70 uppercase">
										Mission reward
									</p>
									<p class="truncate text-[11px] font-semibold text-amber-100">
										{tutorialStep.reward.label}
									</p>
								</div>
								<Trophy
									size={14}
									strokeWidth={2}
									class="ml-auto shrink-0 text-amber-300/70"
									aria-hidden="true"
								/>
							</div>
						{/if}
					</div>
				</div>

				<div class="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
					<button
						type="button"
						onclick={previousStep}
						disabled={step === 0}
						class="flex h-10 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 text-[11px] font-medium text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
					>
						<ChevronLeft size={15} strokeWidth={2.5} aria-hidden="true" />
						Back
					</button>

					<button
						type="button"
						onclick={skipTutorial}
						class="text-[10px] text-slate-500 underline-offset-2 transition hover:text-slate-300 hover:underline"
					>
						Skip tutorial
					</button>

					<button
						type="button"
						onclick={nextStep}
						class="flex h-10 items-center gap-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 text-[11px] font-bold text-amber-950 shadow-[0_0_24px_-8px_rgba(251,146,60,0.7)] transition hover:from-amber-300 hover:to-orange-400 active:scale-[0.99]"
					>
						{step === CHARACTER_STEP - 1 ? 'Create character' : 'Next'}
						<ChevronRight size={15} strokeWidth={2.5} aria-hidden="true" />
					</button>
				</div>
			</div>
		{:else}
			<form onsubmit={submit} class="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
				<button
					type="button"
					onclick={previousStep}
					class="flex items-center gap-1 text-[10px] font-medium text-slate-500 transition hover:text-amber-200"
				>
					<ChevronLeft size={12} strokeWidth={2.5} aria-hidden="true" />
					Back to tutorial
				</button>

				<section>
					<label
						for="onboarding-name"
						class="mb-1.5 block text-[11px] font-semibold tracking-wider text-amber-200/70 uppercase"
					>
						Your name
					</label>
					<input
						id="onboarding-name"
						bind:this={nameEl}
						bind:value={name}
						oninput={() => (error = '')}
						maxlength="24"
						autocomplete="nickname"
						placeholder="Enter your name"
						aria-invalid={error ? 'true' : 'false'}
						aria-describedby={error ? 'onboarding-name-error' : undefined}
						class="w-full rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-400/70 focus:bg-amber-500/10"
					/>
					{#if error}
						<p id="onboarding-name-error" class="mt-1 text-[11px] text-rose-300" role="alert">
							{error}
						</p>
					{:else}
						<p class="mt-1 text-[10px] text-slate-500">
							This is the name other players will see. Up to 24 characters.
						</p>
					{/if}
				</section>

				<section>
					<div class="mb-2 flex items-end justify-between gap-2">
						<h2 class="text-[11px] font-semibold tracking-wider text-amber-200/70 uppercase">
							Choose your look
						</h2>
						<span class="text-[10px] text-amber-200/50">
							{availableCount} of {SKINS.length} available
						</span>
					</div>

					<!-- Character stage: the selected GLB is rendered live, idling. -->
					<div
						class="relative overflow-hidden rounded-xl border border-amber-500/20 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.16),rgba(76,29,149,0.18)_42%,rgba(8,4,20,0.96)_74%)]"
					>
						<!-- Mood lighting behind the transparent canvas. -->
						<div class="pointer-events-none absolute inset-0" aria-hidden="true">
							<div
								class="absolute -bottom-10 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-orange-500/20 blur-3xl"
							></div>
							<div
								class="absolute -top-10 -right-6 h-40 w-40 rounded-full bg-violet-600/25 blur-3xl"
							></div>
						</div>

						<div class="relative h-[240px] w-full sm:h-[340px]">
							<SkinPreview skin={currentSkin.id} />
						</div>

						<!-- Soft spotlight ring under the character. -->
						<div
							class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/90 to-transparent"
							aria-hidden="true"
						></div>

						<div class="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5">
							{#if !currentUnlocked}
								<span
									class="flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 text-[9px] font-semibold tracking-wider text-amber-200 uppercase backdrop-blur-sm"
								>
									<Lock size={10} strokeWidth={2.5} aria-hidden="true" />
									Locked
								</span>
							{/if}
							<span
								class="rounded-full bg-slate-950/70 px-2 py-1 text-[9px] font-semibold text-slate-300 backdrop-blur-sm"
							>
								{currentIndex + 1} / {orderedSkins.length}
							</span>
						</div>

						<div class="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-3">
							<p class="text-[9px] font-semibold tracking-[0.2em] text-amber-300/80 uppercase">
								{currentUnlocked ? 'Selected skin' : 'Reward skin'}
							</p>
							<p class="truncate text-base font-bold text-slate-50" aria-live="polite">
								{currentSkin.name}
							</p>
							<p class="truncate text-[11px] text-slate-400">
								{currentUnlocked ? currentSkin.description : unlockLabel(currentSkin)}
							</p>
						</div>
					</div>

					<!-- Carousel controls: previous / start playing / next. -->
					<div class="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
						<button
							type="button"
							onclick={() => cycle(-1)}
							aria-label="Previous skin"
							class="flex h-11 items-center justify-center gap-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 text-amber-100 transition hover:border-amber-400/40 hover:bg-amber-500/15 active:scale-[0.98]"
						>
							<ChevronLeft size={18} strokeWidth={2.5} aria-hidden="true" />
							<span class="hidden text-[11px] font-medium sm:inline">Previous</span>
						</button>

						{#if currentUnlocked}
							<button
								type="submit"
								class="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 text-sm font-bold text-amber-950 shadow-[0_0_28px_-6px_rgba(251,146,60,0.65)] transition hover:from-amber-300 hover:to-orange-400 active:scale-[0.99]"
							>
								<Sparkles size={16} strokeWidth={2.5} aria-hidden="true" />
								Start playing
							</button>
						{:else}
							<button
								type="button"
								disabled
								class="flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/5 bg-slate-800/60 px-4 text-sm font-semibold text-slate-400"
							>
								<Lock size={15} strokeWidth={2.5} aria-hidden="true" />
								Locked
							</button>
						{/if}

						<button
							type="button"
							onclick={() => cycle(1)}
							aria-label="Next skin"
							class="flex h-11 items-center justify-center gap-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 text-amber-100 transition hover:border-amber-400/40 hover:bg-amber-500/15 active:scale-[0.98]"
						>
							<span class="hidden text-[11px] font-medium sm:inline">Next</span>
							<ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" />
						</button>
					</div>

					{#if !currentUnlocked}
						<p class="mt-2 text-center text-[10px] text-amber-200/90">
							{unlockLabel(currentSkin)} to unlock this skin.
						</p>
					{/if}

					<!-- All skins at a glance, with the current one highlighted. -->
					<div class="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-11">
						{#each orderedSkins as skin (skin.id)}
							{@const unlocked = cosmetics.isUnlocked(skin.id)}
							{@const selected = currentSkin.id === skin.id}
							{@const Icon = SKIN_ICONS[skin.id]}
							<button
								type="button"
								onclick={() => selectSkin(skin)}
								aria-label={unlocked ? skin.name : `${skin.name} (locked)`}
								aria-pressed={selected}
								title={unlocked ? skin.name : `${skin.name} — ${unlockLabel(skin)}`}
								class="group relative flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition {selected
									? 'border-amber-400/70 bg-amber-400/10 shadow-[0_0_18px_-6px_rgba(251,191,36,0.7)]'
									: 'border-white/10 bg-slate-900/50 hover:border-amber-400/30 hover:bg-amber-500/5'}"
							>
								<span
									class="flex h-7 w-7 items-center justify-center rounded-md {unlocked
										? selected
											? 'bg-amber-400/20 text-amber-200'
											: 'bg-white/5 text-slate-300'
										: 'bg-white/5 text-slate-500'}"
									aria-hidden="true"
								>
									<Icon size={15} strokeWidth={2} />
								</span>
								<span
									class="w-full truncate text-center text-[8px] font-medium {selected
										? 'text-amber-200'
										: unlocked
											? 'text-slate-400'
											: 'text-slate-600'}"
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
								{:else if selected}
									<span
										class="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-amber-950"
										aria-hidden="true"
									>
										<Check size={9} strokeWidth={3} />
									</span>
								{/if}
							</button>
						{/each}
					</div>

					<p class="mt-2 text-[10px] text-slate-500">
						Win activities to unlock five skins: Vampire, Mummy, Pumpkin King, Demon and Ghost.
						Scarecrow unlocks by owning its NFT. Unlocked skins stay available forever.
					</p>
				</section>

				<div class="border-t border-white/10 pt-3">
					<p class="text-center text-[10px] text-slate-500">
						Your progress is saved only in this browser.
					</p>
				</div>
			</form>
		{/if}
	</div>
</div>
