<script lang="ts">
	import type { Snippet } from 'svelte';
	import { humanizeError } from '#lib/near/errors.ts';
	import {
		accountIdFromHandle,
		HANDLE_RULES,
		isValidHandle,
		normalizeHandle
	} from '#lib/near/handle.ts';
	import { authSession } from '#lib/state/auth.svelte.ts';
	import { playerProfile } from '#lib/state/playerProfile.svelte.ts';

	let { children }: { children: Snippet } = $props();

	let busy = $state(false);
	let error = $state('');
	let retrying = $state(false);
	let handleInput = $state('');
	let seededHandle = $state(false);
	let claiming = $state(false);

	const message = $derived(error || authSession.error);
	const waitingForAccount = $derived(
		authSession.loggedIn && authSession.accountCreating && !authSession.accountId
	);

	// El alias local es solo una sugerencia: el handle definitivo lo confirma
	// el jugador porque NEAR no permite renombrar cuentas.
	const suggestedHandle = $derived(normalizeHandle(playerProfile.alias));
	const handlePreview = $derived(normalizeHandle(handleInput));
	const handleValid = $derived(isValidHandle(handlePreview));
	const handleAccountId = $derived(
		handlePreview ? accountIdFromHandle(handlePreview) : 't-your-name.testnet'
	);

	$effect(() => {
		if (!authSession.needsHandle) {
			seededHandle = false;
			return;
		}

		if (!seededHandle) {
			seededHandle = true;
			handleInput = suggestedHandle;
		}
	});

	async function handleLogin() {
		if (busy) return;

		busy = true;
		error = '';

		try {
			await authSession.login();
		} catch (cause) {
			error = humanizeError(cause) || 'Could not sign in. Try again.';
		} finally {
			busy = false;
		}
	}

	async function handleRetry() {
		if (retrying) return;

		retrying = true;
		error = '';

		try {
			await authSession.loadAccount();
		} finally {
			retrying = false;
		}
	}

	async function handleClaim(event: SubmitEvent) {
		event.preventDefault();

		if (claiming || !handleValid) return;

		claiming = true;
		error = '';

		try {
			await authSession.claimHandle(handlePreview);
		} finally {
			claiming = false;
		}
	}

	async function handleSwitchAccount() {
		await authSession.logout();
	}
</script>

{#if authSession.loading || waitingForAccount}
	<div
		class="fixed inset-0 z-[110] flex items-center justify-center bg-[#05030d] px-4 text-amber-50"
		role="status"
		aria-live="polite"
	>
		<div class="flex flex-col items-center gap-4">
			<span
				class="h-10 w-10 animate-spin rounded-full border-2 border-amber-200/20 border-t-amber-300"
				aria-hidden="true"
			></span>
			<p class="text-sm tracking-wide text-amber-100/70">
				{waitingForAccount ? 'Creating your NEAR account…' : 'Connecting…'}
			</p>
		</div>
	</div>
{:else if authSession.loggedIn}
	{#if authSession.accountId}
		{@render children()}
	{:else if authSession.needsHandle}
		<main
			class="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[#05030d] px-4 py-12 text-amber-50"
		>
			<div
				class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,146,60,0.18),transparent_45%),radial-gradient(circle_at_50%_100%,rgba(109,40,217,0.2),transparent_55%)]"
				aria-hidden="true"
			></div>

			<div
				class="relative w-full max-w-md rounded-2xl border border-amber-300/15 bg-[#0b0618]/95 p-8 shadow-2xl sm:p-10"
			>
				<div class="flex flex-col items-center text-center">
					<div
						class="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-500/15 shadow-lg"
						aria-hidden="true"
					>
						<svg
							class="h-7 w-7 text-amber-300"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
						>
							<circle cx="12" cy="8" r="3.2" />
							<path d="M5 20c.7-3.5 3.4-5.5 7-5.5s6.3 2 7 5.5" stroke-linecap="round" />
						</svg>
					</div>

					<p class="mt-6 text-[10px] font-semibold tracking-[0.4em] text-amber-300/60 uppercase">
						Your account
					</p>
					<h2 class="mt-1 font-serif text-3xl font-semibold tracking-tight text-amber-50">
						Choose your name
					</h2>
					<p class="mt-3 max-w-xs text-sm leading-relaxed text-amber-100/55">
						This is your NEAR account and it cannot be renamed. Save it: you will need it to sign in
						from another device.
					</p>
				</div>

				<form class="mt-6 space-y-3" onsubmit={handleClaim}>
					<label class="sr-only" for="near-handle">NEAR account name</label>
					<div
						class="flex items-center overflow-hidden rounded-xl border border-amber-200/20 bg-black/30 px-3 py-2 font-mono text-sm text-amber-100 transition focus-within:border-amber-300/60"
					>
						<span class="text-amber-300/60">t-</span>
						<input
							id="near-handle"
							bind:value={handleInput}
							maxlength="24"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
							placeholder="your-name"
							class="min-w-0 flex-1 bg-transparent px-0.5 text-amber-50 outline-none placeholder:text-amber-100/25"
						/>
						<span class="text-amber-300/60">.testnet</span>
					</div>

					<p class="text-center font-mono text-[11px] text-amber-100/45">→ {handleAccountId}</p>
					<p class="text-center text-[11px] leading-relaxed text-amber-100/40">{HANDLE_RULES}</p>

					<button
						type="submit"
						disabled={!handleValid || claiming}
						class="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-500/20 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{claiming ? 'Creating your account…' : 'Create my account'}
					</button>

					{#if message}
						<p
							class="rounded-lg border border-rose-400/25 bg-rose-950/40 px-3 py-2 text-center text-xs leading-relaxed text-rose-100/80"
							role="alert"
						>
							{message}
						</p>
					{/if}
				</form>

				<button
					type="button"
					onclick={handleSwitchAccount}
					class="mt-4 w-full text-center text-[11px] text-amber-100/40 underline-offset-2 transition hover:text-amber-100/70 hover:underline"
				>
					Use another Google account
				</button>
			</div>
		</main>
	{:else if message}
		<main
			class="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[#05030d] px-4 py-12 text-amber-50"
		>
			<div
				class="w-full max-w-md rounded-2xl border border-rose-400/20 bg-[#0b0618]/95 p-8 text-center shadow-2xl"
			>
				<h2 class="font-serif text-2xl font-semibold text-rose-100">
					We could not prepare your account
				</h2>
				<p class="mt-3 text-sm break-words text-rose-100/70">{message}</p>
				<button
					type="button"
					onclick={handleRetry}
					disabled={retrying}
					class="mt-6 rounded-lg border border-amber-300/40 bg-amber-500/20 px-5 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{retrying ? 'Retrying…' : 'Try again'}
				</button>
			</div>
		</main>
	{:else}
		<div
			class="fixed inset-0 z-[110] flex items-center justify-center bg-[#05030d] px-4 text-amber-50"
			role="status"
			aria-live="polite"
		>
			<div class="flex flex-col items-center gap-4">
				<span
					class="h-10 w-10 animate-spin rounded-full border-2 border-amber-200/20 border-t-amber-300"
					aria-hidden="true"
				></span>
				<p class="text-sm tracking-wide text-amber-100/70">Preparing your account…</p>
			</div>
		</div>
	{/if}
{:else}
	<main
		class="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[#05030d] px-4 py-12 text-amber-50"
	>
		<div
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,146,60,0.18),transparent_45%),radial-gradient(circle_at_50%_100%,rgba(109,40,217,0.2),transparent_55%)]"
			aria-hidden="true"
		></div>

		<div
			class="relative w-full max-w-md rounded-2xl border border-amber-300/15 bg-[#0b0618]/95 p-8 shadow-2xl sm:p-10"
		>
			<div class="flex flex-col items-center text-center">
				<div
					class="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-500/15 shadow-lg"
					aria-hidden="true"
				>
					<svg class="h-7 w-7 text-amber-300" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M12 2C7.6 2 4 5.6 4 10c0 2.5 1.2 4.7 3 6.2V20a1 1 0 0 0 1 1h1.5v-2h1v2h3v-2h1v2H16a1 1 0 0 0 1-1v-3.8c1.8-1.5 3-3.7 3-6.2 0-4.4-3.6-8-8-8Zm-3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm-3 1 1 2h-2l1-2Z"
						/>
					</svg>
				</div>

				<p class="mt-6 text-[10px] font-semibold tracking-[0.4em] text-amber-300/60 uppercase">
					Welcome to
				</p>
				<h1 class="mt-1 font-serif text-3xl font-semibold tracking-tight text-amber-50">NearBox</h1>
				<p class="mt-3 max-w-xs text-sm leading-relaxed text-amber-100/55">
					Sign in with Google to enter the village. No wallet needed: your NEAR account is created
					automatically with FastAuth.
				</p>
			</div>

			<button
				type="button"
				onclick={handleLogin}
				disabled={busy}
				class="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border border-amber-200/20 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 shadow-lg transition-colors hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{#if busy}
					<span
						class="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800"
						aria-hidden="true"
					></span>
					<span>Connecting…</span>
				{:else}
					<svg class="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
						<path
							fill="#FFC107"
							d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9Z"
						/>
						<path
							fill="#FF3D00"
							d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z"
						/>
						<path
							fill="#4CAF50"
							d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44Z"
						/>
						<path
							fill="#1976D2"
							d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9Z"
						/>
					</svg>
					<span>Continue with Google</span>
				{/if}
			</button>

			{#if message}
				<p
					class="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/40 px-3 py-2 text-center text-xs leading-relaxed text-rose-100/80"
					role="alert"
				>
					{message}
				</p>
			{/if}

			<p class="mt-6 text-center text-[11px] leading-relaxed text-amber-100/35">
				No wallet. Your account is created with FastAuth and your key is protected by NEAR MPC.
			</p>
		</div>

		<p class="absolute bottom-6 text-[10px] tracking-[0.3em] text-amber-100/30 uppercase">
			NEAR Testnet
		</p>
	</main>
{/if}
