<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Power from '@lucide/svelte/icons/power';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import type { LobbyId, LobbyStatus } from '../../services/protocol';
	import { lobby } from '../../state/lobby.svelte';

	let aliasInput = $state('');
	let isOnline = $state(true);
	let now = $state(Date.now());
	let collapsed = $state(false);

	onMount(() => {
		collapsed = window.matchMedia('(max-width: 639px)').matches;
		lobby.init();
		aliasInput = lobby.alias;
		lobby.connect();

		const syncOnline = () => {
			isOnline = navigator.onLine;
		};

		syncOnline();
		window.addEventListener('online', syncOnline);
		window.addEventListener('offline', syncOnline);

		return () => {
			window.removeEventListener('online', syncOnline);
			window.removeEventListener('offline', syncOnline);
			lobby.disconnect();
		};
	});

	$effect(() => {
		if (lobby.status !== 'reconnecting') {
			return;
		}

		now = Date.now();
		const timer = setInterval(() => {
			now = Date.now();
		}, 250);

		return () => clearInterval(timer);
	});

	$effect(() => {
		const toast = lobby.toast;

		if (!toast) {
			return;
		}

		const timer = setTimeout(() => {
			if (lobby.toast?.id === toast.id) {
				lobby.dismissToast();
			}
		}, 3500);

		return () => clearTimeout(timer);
	});

	const statusLabel = $derived(
		{
			idle: 'Not connected',
			connecting: 'Connecting…',
			connected: 'Connected',
			reconnecting: 'Reconnecting…',
			disconnected: 'Disconnected',
			error: 'Error'
		}[lobby.status]
	);

	const statusDotClass = $derived(
		lobby.status === 'connected'
			? 'bg-emerald-400'
			: lobby.status === 'connecting' || lobby.status === 'reconnecting'
				? 'animate-pulse bg-amber-400'
				: lobby.status === 'error'
					? 'bg-rose-500'
					: 'bg-slate-500'
	);

	const retrySeconds = $derived(
		lobby.nextRetryAt ? Math.max(0, Math.ceil((lobby.nextRetryAt - now) / 1000)) : 0
	);

	const globalLobby = $derived(
		lobby.presence?.lobbies.find((item) => item.id === 'global') ?? null
	);

	const minigames = $derived(
		lobby.presence?.lobbies.filter((item) => item.kind === 'minigame') ?? []
	);

	const total = $derived(lobby.presence?.total ?? 0);

	function lobbyName(id: LobbyId): string {
		return lobby.presence?.lobbies.find((item) => item.id === id)?.name ?? id;
	}

	function isFull(status: LobbyStatus | null): boolean {
		return (
			status !== null &&
			!status.canEnter &&
			(status.reason?.toLowerCase().includes('full') ?? false)
		);
	}

	function phaseLabel(status: LobbyStatus | null): string {
		if (!status) {
			return 'Open';
		}

		if (isFull(status)) {
			return 'Full';
		}

		if (status.phase === 'playing') {
			return 'In progress';
		}

		if (status.phase === 'results') {
			return status.canEnter ? 'Results' : 'Ending';
		}

		if (!status.canEnter) {
			return 'Full';
		}

		if (status.phase === 'countdown') {
			return 'Starting';
		}

		if (status.phase === 'waiting') {
			return 'Waiting';
		}

		return 'Open';
	}

	function phaseDotClass(status: LobbyStatus | null): string {
		if (!status) {
			return 'bg-emerald-400';
		}

		if (!status.canEnter) {
			return status.phase === 'results' ? 'bg-slate-400' : 'bg-rose-400';
		}

		if (status.phase === 'playing' || status.phase === 'countdown') {
			return 'animate-pulse bg-amber-400';
		}

		if (status.phase === 'results') {
			return 'bg-slate-400';
		}

		return 'bg-emerald-400';
	}

	function submitAlias(event: SubmitEvent) {
		event.preventDefault();

		const value = aliasInput.trim();

		if (!value) {
			aliasInput = lobby.alias;
			return;
		}

		lobby.setAlias(value);
		aliasInput = lobby.alias;
	}

	function enterLobby(id: LobbyId) {
		if (id === 'global') {
			return;
		}

		lobby.enterLobby(id);
	}
</script>

<aside
	class="pointer-events-none fixed inset-x-3 top-3 z-50 flex justify-end text-xs text-slate-100 sm:inset-x-auto sm:right-3 sm:w-80"
>
	<div
		class="pointer-events-auto w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/85 shadow-2xl backdrop-blur-md"
	>
		<header class="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
			<div class="flex items-center gap-2">
				<span class="h-2 w-2 rounded-full {statusDotClass}"></span>
				<div>
					<p class="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">Lobby</p>
					<p class="text-[11px] text-slate-400" aria-live="polite">{statusLabel}</p>
				</div>
			</div>
			<span class="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
				{total} online
			</span>
			<button
				type="button"
				onclick={() => (collapsed = !collapsed)}
				class="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
				aria-label={collapsed ? 'Expand lobby panel' : 'Collapse lobby panel'}
				aria-expanded={!collapsed}
			>
				{#if collapsed}
					<ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
				{:else}
					<ChevronUp size={13} strokeWidth={2} aria-hidden="true" />
				{/if}
			</button>
		</header>

		{#if !collapsed}
			<div class="space-y-3 p-3">
				{#if lobby.toast}
					<div
						class="flex items-center justify-between gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1.5 text-[11px] text-emerald-200"
						role="status"
					>
						<span class="flex min-w-0 items-center gap-1.5">
							<CircleCheck size={13} strokeWidth={2} aria-hidden="true" class="shrink-0" />
							<span class="truncate">{lobby.toast.message}</span>
						</span>
						<button
							type="button"
							onclick={() => lobby.dismissToast()}
							class="shrink-0 rounded p-0.5 text-emerald-300/70 transition hover:bg-emerald-400/10 hover:text-emerald-100"
							aria-label="Close notice"
						>
							<X size={13} strokeWidth={2} aria-hidden="true" />
						</button>
					</div>
				{/if}

				{#if !isOnline}
					<div
						class="flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200"
						role="status"
					>
						<WifiOff size={13} strokeWidth={2} aria-hidden="true" class="shrink-0" />
						<span>No internet connection. It will retry when you're back online.</span>
					</div>
				{/if}

				{#if lobby.status === 'reconnecting'}
					<div
						class="space-y-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200"
						role="status"
					>
						<p class="flex items-center gap-1.5">
							<RefreshCw
								size={13}
								strokeWidth={2}
								aria-hidden="true"
								class="shrink-0 animate-spin"
							/>
							<span>Attempt {lobby.reconnectAttempt} · retrying in {retrySeconds}s</span>
						</p>
						<button
							type="button"
							onclick={() => lobby.retryNow()}
							class="flex items-center gap-1 rounded-md border border-amber-300/30 px-2 py-1 text-[10px] text-amber-100 transition hover:bg-amber-300/10"
						>
							<RotateCw size={11} strokeWidth={2} aria-hidden="true" />
							Retry now
						</button>
					</div>
				{/if}

				<form class="flex gap-1.5" onsubmit={submitAlias}>
					<label class="sr-only" for="lobby-alias">Alias</label>
					<input
						id="lobby-alias"
						bind:value={aliasInput}
						maxlength="24"
						autocomplete="nickname"
						placeholder="Your alias"
						class="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
					/>
					<button
						type="submit"
						class="shrink-0 rounded-md bg-emerald-500 px-2.5 py-1.5 font-medium text-emerald-950 transition hover:bg-emerald-400"
					>
						{lobby.status === 'connected' || lobby.status === 'reconnecting'
							? 'Reconnect'
							: 'Connect'}
					</button>
				</form>

				{#if lobby.status === 'connecting' || lobby.status === 'connected' || lobby.status === 'reconnecting'}
					<button
						type="button"
						onclick={() => lobby.disconnect()}
						class="flex w-full items-center justify-center gap-1 rounded-md border border-white/10 px-2 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/10"
					>
						<Power size={11} strokeWidth={2} aria-hidden="true" />
						Disconnect
					</button>
				{/if}

				{#if lobby.error}
					<p
						class="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200"
					>
						{lobby.error}
						{#if lobby.errorCode}
							<span class="text-rose-300/60"> · {lobby.errorCode}</span>
						{/if}
					</p>
				{/if}

				<section>
					<div class="mb-1.5 flex items-center justify-between gap-2">
						<h2 class="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
							Connected players
						</h2>
						{#if lobby.self}
							<span class="max-w-40 truncate text-[10px] text-emerald-300">
								You: {lobby.self.name}
							</span>
						{/if}
					</div>

					{#if globalLobby && globalLobby.players.length > 0}
						<ul class="max-h-40 space-y-1 overflow-y-auto pr-1">
							{#each globalLobby.players as player (player.id)}
								<li
									class="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2 py-1.5"
								>
									<span class="truncate">
										{player.name}
										{#if player.id === lobby.self?.id}
											<span class="text-emerald-400"> (you)</span>
										{/if}
									</span>
									{#if player.lobbyId !== 'global'}
										<span
											class="shrink-0 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300"
										>
											{lobbyName(player.lobbyId)}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p
							class="rounded-md border border-dashed border-white/10 px-2 py-2 text-[11px] text-slate-500"
						>
							No players connected.
						</p>
					{/if}
				</section>

				<section>
					<div class="mb-1.5 flex items-center justify-between gap-2">
						<h2 class="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
							Mini lobbies
						</h2>
						{#if lobby.self && lobby.self.lobbyId !== 'global'}
							<button
								type="button"
								onclick={() => lobby.leaveLobby()}
								class="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-white/10"
							>
								Leave to global
							</button>
						{/if}
					</div>

					<div class="space-y-1.5">
						{#each minigames as minigame (minigame.id)}
							{@const isCurrent = lobby.self?.lobbyId === minigame.id}
							{@const status = minigame.status ?? null}
							<div
								class="rounded-lg border px-2 py-1.5 {isCurrent
									? 'border-emerald-400/40 bg-emerald-400/5'
									: 'border-white/10 bg-white/[0.02]'}"
							>
								<div class="flex items-center justify-between gap-2">
									<div class="min-w-0">
										<p class="truncate font-medium text-slate-200">{minigame.name}</p>
										<p class="flex items-center gap-1.5 text-[10px] text-slate-400">
											<span
												class="h-1.5 w-1.5 shrink-0 rounded-full {phaseDotClass(status)}"
												aria-hidden="true"
											></span>
											<span>{phaseLabel(status)}</span>
											<span class="text-slate-600">·</span>
											<span>
												{minigame.players.length}
												{minigame.players.length === 1 ? 'player' : 'players'}
												{#if status?.maxPlayers}
													/{status.maxPlayers}
												{/if}
											</span>
										</p>
									</div>

									{#if isCurrent}
										<button
											type="button"
											onclick={() => lobby.leaveLobby()}
											class="shrink-0 rounded-md border border-emerald-400/30 px-2 py-1 text-[10px] text-emerald-300 transition hover:bg-emerald-400/10"
										>
											Leave
										</button>
									{:else}
										<button
											type="button"
											onclick={() => enterLobby(minigame.id)}
											disabled={lobby.status !== 'connected' || status?.canEnter === false}
											title={status?.reason ?? undefined}
											class="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-200 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
										>
											{status?.canEnter === false
												? phaseLabel(status)
												: lobby.self?.lobbyId === 'global'
													? 'Join'
													: 'Switch'}
										</button>
									{/if}
								</div>

								{#if minigame.players.length > 0}
									<p class="mt-1 truncate text-[10px] text-slate-400">
										{minigame.players.map((player) => player.name).join(', ')}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			</div>
		{/if}
	</div>
</aside>
