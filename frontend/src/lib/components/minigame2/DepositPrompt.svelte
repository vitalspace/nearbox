<script lang="ts">
	import { playerState } from '../../state/playerState';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';

	const DEPOSIT = { x: 36.68, y: -7.98, z: 40.3 };
	const RADIUS = 2.5;
	const VERTICAL = 2.0;

	let near = $state(false);
	let carrying = $derived(minigame2.carried);
	let playing = $derived(minigame2.phase === 'playing');

	function isEditableTarget(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLElement &&
			target.closest('input, textarea, select, [contenteditable="true"]') !== null
		);
	}

	function deposit(): void {
		if (!playing || !near || carrying === 0) return;

		lobby.sendMg2Deposit();
	}

	$effect(() => {
		const timer = setInterval(() => {
			const distance = Math.hypot(playerState.x - DEPOSIT.x, playerState.z - DEPOSIT.z);

			near = distance <= RADIUS && Math.abs(playerState.y - DEPOSIT.y) <= VERTICAL;
		}, 100);

		return () => clearInterval(timer);
	});

	$effect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code !== 'KeyE' || event.repeat || event.defaultPrevented) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (isEditableTarget(event.target)) return;

			event.preventDefault();
			deposit();
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

{#if playing && near && carrying > 0}
	<div
		class="deposit-prompt pointer-events-none fixed inset-x-0 bottom-32 z-40 flex justify-center px-3"
	>
		<div
			class="pointer-events-auto flex items-center gap-3 rounded-xl border border-amber-300/30 bg-slate-950/85 px-4 py-2.5 text-sm text-amber-100 shadow-2xl backdrop-blur-md"
		>
			<span class="text-lg" aria-hidden="true">💀</span>
			<p>
				Deposit {carrying}
				{carrying === 1 ? 'skull' : 'skulls'} in the main tomb
			</p>
			<button
				type="button"
				onclick={deposit}
				class="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-300"
			>
				<kbd
					class="mr-1 rounded border border-amber-900/30 bg-amber-950/10 px-1 font-mono text-[10px]"
					>E</kbd
				>
				Deposit
			</button>
		</div>
	</div>
{/if}

<style>
	:global(html.touch-controls-active) .deposit-prompt {
		bottom: 11rem;
	}
</style>
