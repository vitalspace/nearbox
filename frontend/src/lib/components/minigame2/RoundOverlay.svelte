<script lang="ts">
	import LogOut from '@lucide/svelte/icons/log-out';
	import Skull from '@lucide/svelte/icons/skull';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import { MISSION_CRYPT_5 } from '../../missions/crypt';
	import { cosmetics } from '../../state/cosmetics.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';

	let now = $state(minigame2.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame2.serverNow();
		}, 250);

		return () => clearInterval(timer);
	});

	const snapshot = $derived(minigame2.snapshot);
	const phase = $derived(snapshot?.phase ?? 'idle');
	const self = $derived(minigame2.self);
	const endsAt = $derived(snapshot?.endsAt ?? null);
	const remainingSeconds = $derived(endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0);

	const showCountdown = $derived(phase === 'countdown');
	const showDeath = $derived(phase === 'playing' && self !== null && !self.alive);
	const showResult = $derived(phase === 'won' || phase === 'lost');
	const totalSkulls = $derived(snapshot?.skulls.length || 10);
	const players = $derived(snapshot?.players ?? []);
	const reward = $derived(cosmetics.rewardForMission(MISSION_CRYPT_5.id));
</script>

{#if showCountdown}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0612]/70 backdrop-blur-[2px]"
	>
		<div class="flex flex-col items-center gap-3 text-center">
			<div class="text-[11px] font-semibold tracking-[0.4em] text-amber-400 uppercase">
				The Mummy Crypt
			</div>
			<h1 class="text-4xl font-black tracking-tight text-amber-100 sm:text-5xl">
				The ritual begins
			</h1>
			<p class="flex items-center gap-2 text-sm text-slate-300">
				<Users size={16} strokeWidth={2.4} aria-hidden="true" />
				{players.length}
				{players.length === 1 ? 'explorer' : 'explorers'} ready
			</p>
			<div class="mt-2 text-7xl font-black text-amber-200 tabular-nums">
				{remainingSeconds}
			</div>
			<p class="text-xs text-slate-400">The mummies are still asleep. You cannot move.</p>
		</div>
	</div>
{:else if showDeath}
	<div class="pointer-events-none fixed inset-x-0 bottom-40 z-40 flex justify-center px-4">
		<div
			class="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-950/85 px-6 py-3 text-rose-100 shadow-2xl backdrop-blur-md"
		>
			<Skull size={22} strokeWidth={2} class="shrink-0 text-rose-300" aria-hidden="true" />
			<div>
				<p class="text-sm font-bold">The mummies drained your life</p>
				<p class="text-[11px] text-rose-300/90">Returning to the outside world…</p>
			</div>
		</div>
	</div>
{:else if showResult}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#0b0612]/75 p-4 backdrop-blur-[2px]"
	>
		<div
			class="pointer-events-auto w-[min(92vw,440px)] rounded-2xl border border-amber-400/20 bg-[#171020]/95 px-6 py-6 text-center text-slate-50 shadow-2xl"
		>
			{#if phase === 'won'}
				<Trophy size={44} strokeWidth={1.8} class="mx-auto text-amber-400" aria-hidden="true" />
				<h2 class="mt-2 text-4xl font-black tracking-tight text-amber-300">
					The ritual is complete
				</h2>
				<p class="mt-1 text-sm text-slate-300">All {totalSkulls} skulls rest in the main tomb.</p>

				<div class="mt-4 flex items-center justify-center gap-6 rounded-xl bg-white/5 px-4 py-3">
					<div>
						<div class="text-2xl font-black text-white tabular-nums">
							{snapshot?.depositedTotal ?? totalSkulls}<span
								class="text-sm font-semibold text-slate-400">/{totalSkulls}</span
							>
						</div>
						<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
							skulls
						</div>
					</div>
					<div>
						<div class="text-2xl font-black text-white tabular-nums">{players.length}</div>
						<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
							explorers
						</div>
					</div>
				</div>

				{#if reward}
					<div class="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2">
						<p class="text-xs text-amber-100">
							NFT reward: <span class="font-semibold">{reward.name}</span> · claim it in Mission Central
							→ Rewards.
						</p>
					</div>
				{/if}
			{:else}
				<Skull size={44} strokeWidth={1.8} class="mx-auto text-rose-400" aria-hidden="true" />
				<h2 class="mt-2 text-4xl font-black tracking-tight text-rose-200">
					The mummies have caught you
				</h2>
				<p class="mt-1 text-sm text-slate-300">Time ran out with the ritual incomplete.</p>
			{/if}

			<p class="mt-4 text-xs text-slate-500">Returning in {remainingSeconds}s…</p>
			<button
				type="button"
				class="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2.5 text-sm font-bold text-amber-200 transition hover:bg-amber-500/30"
				onclick={() => lobby.leaveLobby()}
			>
				<LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
				Back to the mausoleum
			</button>
		</div>
	</div>
{/if}
