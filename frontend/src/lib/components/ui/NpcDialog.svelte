<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { errandMissionForNpc } from '../../missions/progression';
	import { balloon } from '../../state/balloon.svelte';
	import { cars } from '../../state/cars.svelte';
	import { chat } from '../../state/chat.svelte';
	import { npcs } from '../../state/npcs.svelte';
	import { progression } from '../../state/progression.svelte';
	import { ride } from '../../state/ride.svelte';
	import { sceneState } from '../../state/sceneState.svelte';

	const npc = $derived(npcs.dialogNpc);
	const node = $derived(npcs.dialogNode);
	const choices = $derived(npcs.dialogChoices);
	const open = $derived(npcs.dialogOpen && sceneState.inHub);
	const errand = $derived(npc ? errandMissionForNpc(npc.id) : null);
	const errandState = $derived(errand ? progression.missionState(errand.id) : null);
	const errandTarget = $derived(errandState?.target ?? 0);
	const errandValue = $derived(errandState?.value ?? 0);
	const errandPercent = $derived(
		errandTarget > 0 ? Math.round((errandValue / errandTarget) * 100) : 0
	);

	function openCentral(): void {
		npcs.closeDialog();
		window.dispatchEvent(new CustomEvent('rw:open-central', { detail: { tab: 'errands' } }));
	}

	let panel = $state<HTMLDivElement>();
	let wasOpen = false;

	$effect(() => {
		if (open && panel) {
			panel.focus({ preventScroll: true });
			wasOpen = true;
		} else if (!open && wasOpen) {
			wasOpen = false;

			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
		}
	});

	// Chat, vehicles and scene changes close the conversation immediately.
	$effect(() => {
		if (
			npcs.dialogOpen &&
			(chat.isOpen || cars.isDriving || balloon.isDriving || ride.isRiding || !sceneState.inHub)
		) {
			npcs.closeDialog();
		}
	});

	$effect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!npcs.dialogOpen) {
				return;
			}

			// The same `E` press that opens the dialogue was already handled
			// by `NpcPrompt` (which calls `preventDefault`). Without this
			// guard the opening key would also pick the first option, closing
			// the panel immediately for nodes whose first choice is "close".
			if (event.defaultPrevented) {
				return;
			}

			if (
				event.target instanceof HTMLElement &&
				event.target.closest('input, textarea, select, [contenteditable="true"]') !== null
			) {
				return;
			}

			if (event.key === 'Escape') {
				event.preventDefault();
				npcs.closeDialog();
				return;
			}

			if (event.code === 'KeyE') {
				event.preventDefault();
				const first = npcs.dialogChoices[0];

				if (first) {
					npcs.choose(first.id);
				} else {
					npcs.closeDialog();
				}

				return;
			}

			if (/^[1-9]$/.test(event.key)) {
				const choice = npcs.dialogChoices[Number(event.key) - 1];

				if (choice) {
					event.preventDefault();
					npcs.choose(choice.id);
				}
			}
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

{#if npcs.toast}
	<div class="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-3">
		<p
			class="rounded-full border border-cyan-400/30 bg-slate-950/90 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-xl backdrop-blur-md"
			aria-live="polite"
		>
			{npcs.toast.message}
		</p>
	</div>
{/if}

{#if open && npc && node}
	<div
		class="npc-dialog pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-3"
	>
		<div
			bind:this={panel}
			role="dialog"
			aria-modal="false"
			aria-labelledby="npc-dialog-name"
			tabindex="-1"
			class="pointer-events-auto flex max-h-[45vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-2xl border border-cyan-400/25 bg-slate-950/92 p-4 text-slate-100 shadow-2xl backdrop-blur-md outline-none"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-[10px] font-semibold tracking-[0.3em] text-cyan-300 uppercase">
						{npc.role}
					</p>
					<h2 id="npc-dialog-name" class="truncate text-lg font-bold">{npc.name}</h2>
				</div>

				<button
					type="button"
					onclick={() => npcs.closeDialog()}
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-300 transition hover:bg-white/10 active:scale-95"
					aria-label="Close conversation"
				>
					<X size={18} strokeWidth={2} />
				</button>
			</div>

			<p class="text-sm leading-relaxed text-slate-200">{node.text}</p>

			{#if errand}
				<div class="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
					<div class="flex items-center justify-between gap-2">
						<p class="text-[10px] font-semibold tracking-[0.25em] text-cyan-300 uppercase">
							Errand
						</p>
						<span
							class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase {errandState?.status ===
								'completed' || errandState?.status === 'claimed'
								? 'bg-amber-400/20 text-amber-200'
								: errandState?.status === 'active'
									? 'bg-sky-400/15 text-sky-200'
									: 'bg-white/5 text-slate-400'}"
						>
							{errandState?.status === 'completed' || errandState?.status === 'claimed'
								? 'Completed'
								: errandState?.status === 'active'
									? 'Active'
									: 'Available'}
						</span>
					</div>
					<p class="mt-1 truncate text-[12px] font-semibold text-slate-100">{errand.title}</p>
					<p class="mt-0.5 text-[10px] leading-snug text-slate-400">{errand.description}</p>
					<div class="mt-1.5 flex items-center gap-2">
						<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
							<div
								class="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
								style:width="{errandPercent}%"
							></div>
						</div>
						<span class="shrink-0 font-mono text-[10px] text-slate-400">
							{errandValue}/{errandTarget}
						</span>
					</div>
					{#if errandState?.status === 'completed' || errandState?.status === 'claimed'}
						<button
							type="button"
							onclick={openCentral}
							class="mt-2 min-h-11 w-full rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-500/20"
						>
							Open Central → Errands
						</button>
					{/if}
				</div>
			{/if}

			<div class="flex flex-col gap-2">
				{#each choices as choice, index (choice.id)}
					<button
						type="button"
						onclick={() => npcs.choose(choice.id)}
						class="flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm font-medium text-slate-100 transition hover:border-cyan-400/40 hover:bg-cyan-500/15 active:scale-[0.99]"
					>
						<span
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 font-mono text-[11px] text-cyan-200"
						>
							{index + 1}
						</span>
						<span class="min-w-0">{choice.label}</span>
					</button>
				{/each}
			</div>

			<p class="text-[11px] text-slate-400">
				Press
				<kbd class="rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px]">E</kbd>
				to choose ·
				<kbd class="rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px]">Esc</kbd>
				to close
			</p>
		</div>
	</div>
{/if}

<style>
	/* Keep the panel above the touch controls. */
	:global(html.touch-controls-active) .npc-dialog {
		bottom: 11rem;
	}
</style>
