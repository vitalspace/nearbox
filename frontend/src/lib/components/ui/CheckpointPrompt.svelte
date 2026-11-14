<script lang="ts">
	import { checkpoints } from '../../state/checkpoints.svelte';
	import { hubKiosks } from '../../state/hubKiosks.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { missions } from '../../state/missions.svelte';
	import { ride } from '../../state/ride.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import { audio } from '../../audio/engine';
	import type { MinigameLobbyId } from '../../services/protocol';

	const RACE_LOBBY_IDS: readonly MinigameLobbyId[] = ['minigame-3', 'minigame-4'];

	const active = $derived(checkpoints.active);
	const catActive = $derived(missions.nearestCatId !== null);
	const kioskActive = $derived(hubKiosks.nearbyId !== null || hubKiosks.panelOpen);
	const connected = $derived(lobby.status === 'connected' && lobby.self !== null);
	const showPrompt = $derived(
		active !== null && !catActive && !kioskActive && !ride.isRiding && sceneState.inHub
	);
	const isHere = $derived(
		active !== null &&
			(lobby.isInLobby(active.id) || (active.id === 'minigame-3' && lobby.isInLobby('minigame-4')))
	);

	const status = $derived(active ? lobby.statusForLobby(active.id) : null);
	const raceStatuses = $derived(
		active?.id === 'minigame-3' ? RACE_LOBBY_IDS.map((id) => lobby.statusForLobby(id)) : []
	);

	/**
	 * The Grand Prix checkpoint serves two independent rooms: it stays open
	 * while at least one of them is accepting players.
	 */
	const canEnter = $derived(
		active?.id === 'minigame-3'
			? raceStatuses.some((entry) => entry === null || entry.canEnter)
			: (status?.canEnter ?? true)
	);
	const isFull = $derived(
		status !== null && !status.canEnter && (status.reason?.toLowerCase().includes('full') ?? false)
	);

	const statusText = $derived.by(() => {
		if (!connected) {
			return 'Connect to the lobby to enter';
		}

		if (isHere) {
			return 'You are inside. Press E to leave';
		}

		if (!canEnter) {
			if (active?.id === 'minigame-3') {
				return 'No track is accepting players right now';
			}

			return status?.reason ?? 'Entry is closed while the match is running';
		}

		if (active?.id === 'minigame-3') {
			return 'Press E to choose a track';
		}

		if (status?.phase === 'playing') {
			return 'Match in progress. Press E to join';
		}

		if (status?.phase === 'results') {
			return 'Match ending. Press E to join the next round';
		}

		if (status?.phase === 'countdown') {
			return 'Starting soon. Press E to join';
		}

		if (status?.phase === 'waiting' && status.maxPlayers !== null) {
			return 'Waiting for players. Press E to join';
		}

		return 'Press E to enter';
	});

	const actionLabel = $derived.by(() => {
		if (!connected) {
			return 'Offline';
		}

		if (isHere) {
			return 'Leave';
		}

		if (!canEnter) {
			if (active?.id === 'minigame-3') {
				return 'Closed';
			}

			return isFull || status?.phase === 'waiting' || status?.phase === 'countdown'
				? 'Full'
				: 'Closed';
		}

		if (active?.id === 'minigame-3') {
			return 'Choose';
		}

		if (status?.phase === 'playing' || status?.phase === 'results') {
			return 'Join';
		}

		return 'Enter';
	});

	function isEditableTarget(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLElement &&
			target.closest('input, textarea, select, [contenteditable="true"]') !== null
		);
	}

	function trigger(): void {
		const checkpoint = checkpoints.active;

		if (!checkpoint || catActive || kioskActive || lobby.status !== 'connected' || !lobby.self) {
			return;
		}

		if (isHere) {
			lobby.leaveLobby();
			return;
		}

		if (!canEnter) {
			lobby.showToast(
				checkpoint.id === 'minigame-3'
					? 'No track is accepting players right now'
					: (status?.reason ?? 'That match is not accepting players')
			);
			return;
		}

		// The Grand Prix checkpoint offers two tracks: Grand Prix and Haunted Highway.
		if (checkpoint.id === 'minigame-3') {
			checkpoints.openTrackSelect();
			return;
		}

		audio.play('checkpoint', { priority: 2 });
		lobby.enterLobby(checkpoint.id);
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
				!checkpoints.active ||
				catActive ||
				kioskActive ||
				ride.isRiding
			) {
				return;
			}

			event.preventDefault();
			trigger();
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

{#if showPrompt && active}
	<div
		class="checkpoint-prompt pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-3"
	>
		<div
			class="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-white/10 bg-slate-950/85 px-4 py-2.5 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
		>
			<span
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				style:background-color={active.color}
				aria-hidden="true"
			></span>

			<div class="min-w-0" aria-live="polite">
				<p class="truncate font-medium">{active.name}</p>
				<p class="text-[11px] text-slate-400">{statusText}</p>
			</div>

			<button
				type="button"
				onclick={trigger}
				disabled={!connected || (!isHere && !canEnter)}
				aria-label={isHere ? `Leave ${active.name}` : `Enter ${active.name}`}
				class="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 {isHere
					? 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
					: 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'}"
			>
				{actionLabel}
			</button>
		</div>
	</div>
{/if}

<style>
	/* Touch controls take up the bottom strip; we raise the prompt so they aren't covered. */
	:global(html.touch-controls-active) .checkpoint-prompt {
		bottom: 11rem;
	}
</style>
