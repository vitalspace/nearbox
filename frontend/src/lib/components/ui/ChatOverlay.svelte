<script lang="ts">
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Send from '@lucide/svelte/icons/send';
	import X from '@lucide/svelte/icons/x';
	import { onMount, tick } from 'svelte';
	import { animationCommandHelp, parseAnimationCommand } from '../../cosmetics/animationCommands';
	import type { ChatMessage } from '../../services/protocol';
	import { animationPalette } from '../../state/animationPalette.svelte';
	import { balloon } from '../../state/balloon.svelte';
	import { cars } from '../../state/cars.svelte';
	import { CHAT_AUTO_HIDE_MS, chat } from '../../state/chat.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { race } from '../../state/race.svelte';
	import { ride } from '../../state/ride.svelte';

	let inputEl = $state<HTMLInputElement>();
	let listEl = $state<HTMLDivElement>();

	let localMessageSeq = 0;

	const isConnected = $derived(lobby.status === 'connected');
	const driving = $derived(
		cars.isDriving || balloon.isOccupant || ride.isRiding || race.inCar || minigame5.isDriving
	);

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}

		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable ||
			target.closest('[contenteditable="true"]') !== null
		);
	}

	async function openChat(): Promise<void> {
		chat.open();
		document.exitPointerLock?.();
		await tick();
		inputEl?.focus();
	}

	function closeChat(): void {
		chat.close();
		inputEl?.blur();
	}

	function toggleChat(): void {
		if (chat.isOpen) {
			closeChat();
			return;
		}

		void openChat();
	}

	function pushSystemMessage(text: string): void {
		localMessageSeq += 1;

		const message: ChatMessage = {
			id: `local-anim-${localMessageSeq}`,
			playerId: 'system',
			playerName: 'System',
			text,
			sentAt: Date.now(),
			kind: 'system'
		};

		chat.addMessage(message);
	}

	/**
	 * `/anim` se resuelve en el cliente: el servidor no conoce los clips que
	 * tiene cada skin. El gesto se reproduce en local y se emite como
	 * `player-animation`, así que los demás jugadores también lo ven.
	 */
	function runAnimationCommand(query: string): void {
		const result = parseAnimationCommand(animationPalette.clips, query);

		if (result.kind === 'list') {
			for (const line of animationCommandHelp(animationPalette.clips)) {
				pushSystemMessage(line);
			}

			return;
		}

		if (result.kind === 'empty') {
			pushSystemMessage('Animations are still loading. Try again in a moment.');
			return;
		}

		if (result.kind === 'unavailable') {
			pushSystemMessage(`"${result.label}" is not available for this skin.`);
			return;
		}

		if (result.kind === 'unknown') {
			pushSystemMessage(`Unknown animation: "${result.query}". Try /anim list.`);
			return;
		}

		if (driving) {
			pushSystemMessage('Animations are not available while driving.');
			return;
		}

		const wasSitting = animationPalette.sitting;

		animationPalette.activate(result.clip.animation);

		if (result.clip.animation === 'HR_sit') {
			pushSystemMessage(wasSitting ? 'Standing up.' : 'Sitting down.');
		} else {
			pushSystemMessage(`Playing: ${result.clip.label} (${result.clip.clip})`);
		}

		// Cerrar el chat deja ver el gesto; el mensaje queda en el historial.
		closeChat();
	}

	function sendMessage(event: SubmitEvent): void {
		event.preventDefault();

		const text = chat.draft.trim();

		if (!text) {
			return;
		}

		const lower = text.toLowerCase();

		if (lower === '/anim' || lower.startsWith('/anim ')) {
			runAnimationCommand(text.slice('/anim'.length).trim());
			chat.draft = '';
			return;
		}

		if (lobby.sendChat(text)) {
			chat.draft = '';
		}
	}

	function formatTime(sentAt: number): string {
		const date = new Date(sentAt);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');

		return `${hours}:${minutes}`;
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key.toLowerCase() !== 't' || event.repeat) {
			return;
		}

		if (event.ctrlKey || event.metaKey || event.altKey) {
			return;
		}

		if (isEditableTarget(event.target)) {
			return;
		}

		event.preventDefault();
		void openChat();
	}

	onMount(() => {
		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});

	$effect(() => {
		chat.messages.length;
		chat.isOpen;
		chat.visible;

		if (!listEl) {
			return;
		}

		listEl.scrollTop = listEl.scrollHeight;
	});

	$effect(() => {
		const visible = chat.visible;
		const isOpen = chat.isOpen;
		const activity = chat.lastActivityAt;

		if (!visible || isOpen || !activity) {
			return;
		}

		const timer = setTimeout(() => chat.hide(false), CHAT_AUTO_HIDE_MS);

		return () => clearTimeout(timer);
	});

	// Lets the rest of the touch UI (missions, controls) move aside
	// while typing so it doesn't cover the keyboard or the panel.
	$effect(() => {
		document.documentElement.classList.toggle('chat-open', chat.isOpen);

		return () => document.documentElement.classList.remove('chat-open');
	});
</script>

<div
	class="chat-root pointer-events-none fixed top-1/2 left-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] -translate-y-1/2 text-xs text-slate-100"
	class:is-open={chat.isOpen}
>
	{#if chat.visible}
		<div
			class="chat-panel pointer-events-auto overflow-hidden rounded-xl border border-white/10 bg-slate-950/35 shadow-2xl backdrop-blur-sm"
		>
			<header
				class="flex items-center justify-between gap-2 border-b border-white/10 px-2.5 py-1.5"
			>
				<span class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
					Global chat
				</span>
				<div class="flex items-center gap-1">
					{#if !chat.isOpen}
						<button
							type="button"
							onclick={() => openChat()}
							class="rounded px-1.5 py-0.5 text-[10px] text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
						>
							Write
						</button>
					{/if}
					<button
						type="button"
						onclick={() => chat.hide(true)}
						class="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
						aria-label="Hide chat"
					>
						<EyeOff size={12} strokeWidth={2} aria-hidden="true" />
					</button>
				</div>
			</header>

			<div
				bind:this={listEl}
				role="log"
				aria-live="polite"
				aria-label="Chat messages"
				class="chat-list max-h-[45vh] [scrollbar-width:none] space-y-1 overflow-y-auto px-1.5 py-1.5 text-[11px] leading-snug [&::-webkit-scrollbar]:hidden"
			>
				{#if chat.messages.length === 0}
					<p
						class="rounded-md border border-dashed border-white/10 bg-slate-950/20 px-2 py-1.5 text-slate-500"
					>
						No messages yet
					</p>
				{:else}
					{#each chat.messages as message (message.id)}
						<p class="chat-message rounded-md bg-slate-950/25 px-2 py-1 text-slate-200">
							<span class="text-slate-500">[{formatTime(message.sentAt)}]</span>
							{#if message.kind === 'system'}
								<span class="text-amber-300">{message.playerName}:</span>
								<span class="text-amber-100">{message.text}</span>
							{:else if message.kind === 'emote'}
								<span class="text-fuchsia-300 italic">* {message.playerName} {message.text}</span>
							{:else}
								<span
									class={message.playerId === lobby.self?.id ? 'text-emerald-300' : 'text-sky-300'}
								>
									{message.playerName}{message.playerId === lobby.self?.id ? ' (you)' : ''}:
								</span>
								<span>{message.text}</span>
							{/if}
						</p>
					{/each}
				{/if}
			</div>

			{#if chat.isOpen}
				<form onsubmit={sendMessage} class="border-t border-white/10 bg-slate-950/20 p-1.5">
					<div class="flex gap-1.5">
						<label class="sr-only" for="chat-input">Chat message</label>
						<input
							id="chat-input"
							bind:this={inputEl}
							bind:value={chat.draft}
							maxlength="200"
							autocomplete="off"
							disabled={!isConnected}
							placeholder={isConnected ? 'Type a message…' : 'Connect to chat'}
							aria-label="Chat message"
							class="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-50"
							onkeydown={(event) => {
								if (event.key === 'Escape') {
									event.preventDefault();
									closeChat();
								}
							}}
						/>
						<button
							type="submit"
							disabled={!isConnected || chat.draft.trim().length === 0}
							class="shrink-0 rounded-md bg-emerald-500 px-2 py-1.5 text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
							aria-label="Send message"
						>
							<Send size={13} strokeWidth={2} aria-hidden="true" />
						</button>
						<button
							type="button"
							onclick={closeChat}
							class="shrink-0 rounded-md border border-white/10 px-1.5 py-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
							aria-label="Close chat"
						>
							<X size={13} strokeWidth={2} aria-hidden="true" />
						</button>
					</div>

					<p class="mt-1 text-[10px] text-slate-500">Type /help or /anim list to see commands</p>
				</form>
			{/if}
		</div>
	{:else}
		<button
			type="button"
			onclick={() => chat.show()}
			class="pointer-events-auto relative rounded-full border border-white/10 bg-slate-950/40 p-2.5 text-slate-200 shadow-2xl backdrop-blur-sm transition hover:bg-slate-900/60 hover:text-white"
			aria-label="Show chat"
		>
			<MessageSquare size={18} strokeWidth={2} aria-hidden="true" />
			{#if chat.unread > 0}
				<span
					class="absolute -top-1 -right-1 min-w-4 rounded-full bg-emerald-500 px-1 text-center text-[10px] leading-4 font-semibold text-emerald-950"
				>
					{chat.unread > 99 ? '99+' : chat.unread}
				</span>
			{/if}
		</button>
	{/if}
</div>

<style>
	/* On touch the closed chat is just a compact notice of the latest
	   messages; when typing it grows, but stays compact and anchored at the top so
	   the virtual keyboard doesn't cover it. */
	:global(html.touch-controls-active) .chat-root {
		left: max(0.75rem, env(safe-area-inset-left));
		width: min(17rem, calc(100vw - 4.5rem));
	}

	:global(html.touch-controls-active) .chat-root:not(.is-open) .chat-list {
		max-height: 4.25rem;
	}

	/* In the compact view only the three most recent messages are shown. */
	:global(html.touch-controls-active) .chat-root:not(.is-open) .chat-message:nth-last-child(n + 4) {
		display: none;
	}

	:global(html.touch-controls-active) .chat-root.is-open {
		top: max(3.75rem, calc(env(safe-area-inset-top) + 3.25rem));
		right: max(0.75rem, env(safe-area-inset-right));
		bottom: auto;
		left: max(0.75rem, env(safe-area-inset-left));
		transform: none;
		width: auto;
	}

	:global(html.touch-controls-active) .chat-root.is-open .chat-list {
		max-height: 26vh;
	}
</style>
