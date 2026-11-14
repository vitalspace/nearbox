<script lang="ts">
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import { chat } from '../../state/chat.svelte';
	import { hubKiosks } from '../../state/hubKiosks.svelte';
	import { npcs } from '../../state/npcs.svelte';
	import { sceneState } from '../../state/sceneState.svelte';

	const npc = $derived(
		sceneState.inHub && npcs.canInteract && !hubKiosks.panelOpen ? npcs.nearestNpc : null
	);

	function isEditableTarget(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLElement &&
			target.closest('input, textarea, select, [contenteditable="true"]') !== null
		);
	}

	function talk(): void {
		if (!npcs.canInteract || chat.isOpen || hubKiosks.panelOpen) {
			return;
		}

		npcs.interact();
	}

	$effect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code !== 'KeyE' || event.repeat || event.defaultPrevented) {
				return;
			}

			if (event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}

			if (
				isEditableTarget(event.target) ||
				chat.isOpen ||
				hubKiosks.panelOpen ||
				!npc ||
				!npcs.canInteract
			) {
				return;
			}

			event.preventDefault();
			npcs.interact();
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

{#if npc}
	<div
		class="npc-prompt pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-3"
	>
		<div
			class="pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl border border-cyan-400/30 bg-slate-950/85 px-5 py-3 text-cyan-50 shadow-2xl backdrop-blur-md"
		>
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300"
				aria-hidden="true"
			>
				<MessageCircle size={18} strokeWidth={2} />
			</span>

			<div class="min-w-0" aria-live="polite">
				<p class="text-[10px] font-semibold tracking-[0.3em] text-cyan-300 uppercase">
					{npc.role} · nearby
				</p>
				<p class="truncate text-sm font-bold">{npc.name}</p>
				<p class="text-[11px] text-cyan-200/90">
					Press
					<kbd class="rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px]">E</kbd> to
					talk
				</p>
			</div>

			<button
				type="button"
				onclick={talk}
				class="min-h-11 shrink-0 rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-500/30 active:scale-95"
			>
				Talk
			</button>
		</div>
	</div>
{/if}

<style>
	/* Touch controls take up the bottom strip; raise the prompt above them. */
	:global(html.touch-controls-active) .npc-prompt {
		bottom: 11rem;
	}
</style>
