<script lang="ts">
	import { useTask } from '@threlte/core';
	import { chat } from '../../state/chat.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { playerState } from '../../state/playerState';
	import { sceneState } from '../../state/sceneState.svelte';

	let index = 0;
	let lastId = '';

	const active = $derived(
		sceneState.inRoyale &&
			minigame8.phase === 'playing' &&
			minigame8.self !== null &&
			!minigame8.self.alive
	);

	const targets = $derived(
		(minigame8.snapshot?.players ?? [])
			.filter((player) => player.alive && player.id !== minigame8.selfId)
			.sort((a, b) => b.kills - a.kills || b.damage - a.damage)
	);

	const target = $derived(targets.length > 0 ? targets[index % targets.length] : null);

	function cycle(): void {
		if (!active || targets.length === 0) return;
		index = (index + 1) % targets.length;
	}

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.code !== 'KeyV' || !active || chat.isOpen) return;

		if (event.target instanceof HTMLElement) {
			const tag = event.target;

			if (
				tag instanceof HTMLInputElement ||
				tag instanceof HTMLTextAreaElement ||
				tag instanceof HTMLSelectElement ||
				tag.closest('[contenteditable="true"]')
			) {
				return;
			}
		}

		event.preventDefault();
		cycle();
	};

	$effect(() => {
		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});

	// Si el espectado muere, saltar al siguiente vivo.
	$effect(() => {
		if (!active || targets.length === 0) {
			lastId = '';
			return;
		}

		if (!targets.some((player) => player.id === lastId)) {
			index = 0;
			lastId = target?.id ?? '';
		}
	});

	useTask(() => {
		if (!active || !target) {
			lastId = '';
			return;
		}

		lastId = target.id;

		const sample = minigame8.sampleAt();
		const player = sample?.players.find((item) => item.id === target.id);

		if (!player) return;

		// La cámara del juego sigue `playerState`; el cuerpo local queda
		// congelado (y oculto) en su posición de muerte.
		playerState.x = player.x;
		playerState.y = player.y;
		playerState.z = player.z;
	});
</script>

{#if active}
	<div
		class="pointer-events-none fixed top-20 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-slate-950/70 px-4 py-2 text-center text-white shadow-lg backdrop-blur-sm"
	>
		<div class="text-[10px] font-semibold tracking-[0.3em] text-rose-300 uppercase">Spectating</div>
		<div class="flex items-center justify-center gap-2 text-sm font-bold">
			<span>{target?.name ?? 'No one left'}</span>
			{#if target?.isBot}
				<span class="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-black text-amber-200">
					BOT
				</span>
			{/if}
		</div>
		<div class="text-[10px] text-slate-400">Press V to switch target</div>
	</div>
{/if}
