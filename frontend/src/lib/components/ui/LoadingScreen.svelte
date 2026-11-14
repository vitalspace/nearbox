<script lang="ts">
	import { fade } from 'svelte/transition';
	import { asset } from '../../assets/path';
	import { gameAssets } from '../../loaders/gameAssets.svelte';

	interface Props {
		onRetry: () => void;
		/** Mantiene el splash visible aunque los assets ya estén listos. */
		hold?: boolean;
		holdLabel?: string;
	}

	let { onRetry, hold = false, holdLabel = 'Checking your session…' }: Props = $props();

	const logoUrl = asset('NearBox.png');

	const ready = $derived(gameAssets.status === 'ready');
	const failed = $derived(gameAssets.status === 'error');
	const visible = $derived(!ready || hold);
	const percent = $derived(Math.round(gameAssets.progress * 100));
	const loadedMb = $derived((gameAssets.loadedBytes / 1_048_576).toFixed(1));
	const totalMb = $derived((gameAssets.totalBytes / 1_048_576).toFixed(1));

	const statusText = $derived.by(() => {
		if (failed) {
			return 'The monsters are hiding from us';
		}

		if (gameAssets.status === 'idle') {
			return 'Preparing the ritual…';
		}

		if (hold && ready) {
			return holdLabel;
		}

		if (gameAssets.status === 'ready') {
			return 'The village is awake';
		}

		return gameAssets.currentLabel;
	});

	// Deterministic embers: each spark gets its own position and rhythm.
	const embers = Array.from({ length: 18 }, (_, index) => {
		const seed = (index * 9301 + 49297) % 233280;
		const random = seed / 233280;

		return {
			left: `${(random * 100).toFixed(2)}%`,
			delay: `${(random * 9).toFixed(2)}s`,
			duration: `${(7 + random * 7).toFixed(2)}s`,
			size: `${(2 + random * 3).toFixed(1)}px`,
			opacity: (0.2 + random * 0.5).toFixed(2)
		};
	});

	const stars = Array.from({ length: 26 }, (_, index) => {
		const seed = (index * 7919 + 104729) % 233280;
		const random = seed / 233280;
		const seed2 = (index * 3571 + 6151) % 233280;
		const random2 = seed2 / 233280;

		return {
			left: `${(random * 100).toFixed(2)}%`,
			top: `${(random2 * 62).toFixed(2)}%`,
			size: `${(1 + random * 1.6).toFixed(2)}px`,
			delay: `${(random * 6).toFixed(2)}s`,
			duration: `${(3 + random2 * 4).toFixed(2)}s`
		};
	});
</script>

{#if visible}
	<div
		class="loading-screen fixed inset-0 z-[100] overflow-hidden bg-[#04070f] text-sky-50"
		transition:fade={{ duration: 650 }}
		role="status"
		aria-live="polite"
		aria-label="Loading NearBox"
	>
		<!-- Night sky -->
		<div class="pointer-events-none absolute inset-0" aria-hidden="true">
			<div class="loading-nebula"></div>
			<div class="loading-stars"></div>

			{#each stars as star}
				<span
					class="loading-star"
					style="left: {star.left}; top: {star.top}; width: {star.size}; height: {star.size}; animation-delay: {star.delay}; animation-duration: {star.duration};"
				></span>
			{/each}

			<div class="loading-fog loading-fog-a"></div>
			<div class="loading-fog loading-fog-b"></div>
		</div>

		<!-- Bats crossing the moon -->
		<div class="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden="true">
			<svg class="loading-bat loading-bat-a" viewBox="0 0 64 32" fill="currentColor">
				<path
					d="M32 11c-2-4-6-6-10-5 2 2 3 4 3 7-3-2-6-2-8 0-4 3-9 3-13 0 1 5 5 8 10 9-2 3-2 6-1 9 3-3 6-4 9-3 2 1 4 3 5 6 1-3 3-5 5-6 3-1 6 0 9 3 1-3 1-6-1-9 5-1 9-4 10-9-4 3-9 3-13 0-2-2-5-2-8 0 0-3 1-5 3-7-4-1-8 1-10 5z"
				/>
			</svg>
			<svg class="loading-bat loading-bat-b" viewBox="0 0 64 32" fill="currentColor">
				<path
					d="M32 11c-2-4-6-6-10-5 2 2 3 4 3 7-3-2-6-2-8 0-4 3-9 3-13 0 1 5 5 8 10 9-2 3-2 6-1 9 3-3 6-4 9-3 2 1 4 3 5 6 1-3 3-5 5-6 3-1 6 0 9 3 1-3 1-6-1-9 5-1 9-4 10-9-4 3-9 3-13 0-2-2-5-2-8 0 0-3 1-5 3-7-4-1-8 1-10 5z"
				/>
			</svg>
			<svg class="loading-bat loading-bat-c" viewBox="0 0 64 32" fill="currentColor">
				<path
					d="M32 11c-2-4-6-6-10-5 2 2 3 4 3 7-3-2-6-2-8 0-4 3-9 3-13 0 1 5 5 8 10 9-2 3-2 6-1 9 3-3 6-4 9-3 2 1 4 3 5 6 1-3 3-5 5-6 3-1 6 0 9 3 1-3 1-6-1-9 5-1 9-4 10-9-4 3-9 3-13 0-2-2-5-2-8 0 0-3 1-5 3-7-4-1-8 1-10 5z"
				/>
			</svg>
		</div>

		<!-- Village silhouette -->
		<svg
			class="loading-village pointer-events-none absolute inset-x-0 bottom-0 z-[2] w-full"
			viewBox="0 0 1440 300"
			preserveAspectRatio="xMidYMax slice"
			aria-hidden="true"
		>
			<!-- Distant hills and houses -->
			<path
				d="M0 236 C 90 214 150 232 230 222 C 310 212 360 236 440 226 C 520 216 580 240 660 230 C 760 218 820 240 900 228 C 980 216 1040 238 1120 226 C 1200 214 1260 236 1340 226 C 1390 220 1420 228 1440 224 L1440 300 L0 300 Z"
				fill="#0a0616"
			/>
			<g fill="#0a0616">
				<path d="M120 226v-26h30v26zM114 200l21-16 21 16z" />
				<path d="M336 228v-20h24v20zM330 208l18-14 18 14z" />
				<path d="M596 232v-24h28v24zM590 208l20-15 20 15z" />
				<path d="M940 230v-22h26v22zM934 208l19-14 19 14z" />
				<path d="M1216 228v-20h24v20zM1210 208l18-14 18 14z" />
			</g>

			<!-- Mid layer -->
			<g fill="#070310">
				<path d="M36 300v-62h58v62zM28 238l37-30 37 30z" />
				<path d="M186 300l2-74 52-8v82zM178 226l32-34 42 32z" />
				<path d="M292 300v-78h64v78zM280 222l44-38 44 38z" />
				<path d="M410 300v-90h92v90zM402 210l54-42 54 42z" />
				<path d="M580 300l14-110h36l14 110zM586 190h52l-8-18h-36z" />
				<path d="M672 300v-86h76v86zM660 214l50-42 50 42z" />
				<path d="M800 300v-96l48-14v110zM792 190l38-44 28 36z" />
				<path d="M900 300v-74h70v74zM888 226l47-36 47 36z" />
				<path d="M1020 300v-96h84v96zM1008 204l54-44 54 44z" />
				<path d="M1150 300v-70h64v70zM1138 230l44-36 44 36z" />
				<path d="M1268 300v-88h74v88zM1256 212l49-42 49 42z" />
				<path d="M1380 300v-60h60v60zM1370 240l40-32 40 32z" />
			</g>

			<!-- Church tower and steeple -->
			<g fill="#05020e">
				<path d="M440 210v-82h32v82z" />
				<path d="M432 128 456 82l24 46z" />
				<path d="M454 82V62h4v20zM446 70h20v3h-20z" />
				<path d="M410 300v-90h92v90z" />
			</g>

			<!-- Dead trees -->
			<g class="loading-trees" fill="none" stroke="#05020e" stroke-linecap="round">
				<path d="M166 300v-74M166 258l-16-20M166 244l18-24M166 232l-9-14" stroke-width="5" />
				<path d="M548 300v-86M548 254l-20-24M548 240l22-26M548 226l-11-16" stroke-width="6" />
				<path d="M866 300v-78M866 260l-17-20M866 246l19-24M866 234l-10-14" stroke-width="5" />
				<path d="M1236 300v-72M1236 262l-15-19M1236 248l17-22M1236 236l-9-13" stroke-width="5" />
				<path d="M1428 300v-64M1428 266l-14-17M1428 252l16-20" stroke-width="4" />
			</g>

			<!-- Lit windows -->
			<g class="loading-windows">
				<rect x="50" y="252" width="12" height="14" rx="1" />
				<rect x="72" y="252" width="12" height="14" rx="1" />
				<rect x="202" y="256" width="11" height="13" rx="1" />
				<rect x="224" y="244" width="11" height="13" rx="1" />
				<rect x="310" y="248" width="13" height="15" rx="1" />
				<rect x="336" y="248" width="13" height="15" rx="1" />
				<rect x="446" y="146" width="10" height="18" rx="4" />
				<rect x="446" y="244" width="14" height="18" rx="5" />
				<rect x="692" y="242" width="13" height="15" rx="1" />
				<rect x="718" y="242" width="13" height="15" rx="1" />
				<rect x="812" y="238" width="11" height="14" rx="1" />
				<rect x="916" y="252" width="12" height="14" rx="1" />
				<rect x="940" y="252" width="12" height="14" rx="1" />
				<rect x="1040" y="236" width="14" height="16" rx="1" />
				<rect x="1066" y="236" width="14" height="16" rx="1" />
				<rect x="1166" y="258" width="12" height="14" rx="1" />
				<rect x="1288" y="242" width="13" height="15" rx="1" />
				<rect x="1312" y="242" width="13" height="15" rx="1" />
			</g>

			<!-- Monster-green windows -->
			<g class="loading-windows-green">
				<rect x="228" y="272" width="10" height="12" rx="1" />
				<rect x="812" y="262" width="11" height="14" rx="1" />
				<rect x="1190" y="272" width="11" height="13" rx="1" />
			</g>

			<!-- Glowing pumpkins on the ground -->
			<g class="loading-pumpkins">
				<ellipse cx="180" cy="292" rx="9" ry="7" />
				<ellipse cx="700" cy="294" rx="7" ry="6" />
				<ellipse cx="1206" cy="292" rx="8" ry="6" />
			</g>

			<!-- Ground -->
			<path d="M0 296h1440v4H0z" fill="#020108" />
		</svg>

		<!-- Ground fog -->
		<div
			class="loading-ground-fog pointer-events-none absolute inset-x-0 bottom-0 z-[3]"
			aria-hidden="true"
		></div>

		<!-- Embers -->
		<div class="pointer-events-none absolute inset-0 z-[4] overflow-hidden" aria-hidden="true">
			{#each embers as ember}
				<span
					class="loading-ember"
					style="left: {ember.left}; --ember-opacity: {ember.opacity}; animation-delay: {ember.delay}; animation-duration: {ember.duration}; width: {ember.size}; height: {ember.size};"
				></span>
			{/each}
		</div>

		<!-- Content -->
		<div class="relative z-10 flex h-full flex-col items-center justify-center px-6 py-8">
			<p class="loading-eyebrow">Welcome to</p>
			<div class="loading-logo-wrap mb-7">
				<span class="loading-logo-aura loading-logo-aura--warm" aria-hidden="true"></span>
				<span class="loading-logo-aura loading-logo-aura--cool" aria-hidden="true"></span>
				<h1 class="loading-title">
					<img class="loading-logo" src={logoUrl} alt="NearBox" />
				</h1>
			</div>
			<p class="loading-tagline">{statusText}</p>

			<div class="loading-ornament" aria-hidden="true">
				<span></span>
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M12 2C7.6 2 4 5.6 4 10c0 2.5 1.2 4.7 3 6.2V20a1 1 0 0 0 1 1h1.5v-2h1v2h3v-2h1v2H16a1 1 0 0 0 1-1v-3.8c1.8-1.5 3-3.7 3-6.2 0-4.4-3.6-8-8-8Zm-3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm-3 1 1 2h-2l1-2Z"
					/>
				</svg>
				<span></span>
			</div>

			<div class="loading-panel w-full max-w-md">
				<div
					class="loading-track"
					role="progressbar"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={percent}
				>
					<div class="loading-bar" style:width={`${percent}%`}>
						<span class="loading-bar-shine"></span>
						<span class="loading-bar-spark"></span>
					</div>
				</div>

				<div class="loading-meta">
					<span class="loading-meta-label">
						{#if failed}
							Summoning error
						{:else}
							<span class="loading-pulse"></span>
							{gameAssets.completed} / {gameAssets.total} assets
						{/if}
					</span>
					<span class="loading-meta-mb">{loadedMb} / {totalMb} MB</span>
					<span class="loading-percent">{percent}%</span>
				</div>
			</div>

			{#if failed}
				<div class="loading-error">
					<p class="loading-error-title">The ritual failed</p>
					<p class="loading-error-text">The spirits could not gather every piece of the village.</p>
					{#if gameAssets.error}
						<p class="loading-error-detail">{gameAssets.error}</p>
					{/if}
					<button type="button" onclick={onRetry} class="loading-retry">Try again</button>
				</div>
			{:else}
				<p class="loading-note">Don't close the window · The village is watching you</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.loading-screen {
		font-family: 'IM Fell English', 'Times New Roman', serif;
	}

	/* ---------- Sky ---------- */

	.loading-nebula {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse at 24% 26%, rgba(255, 176, 0, 0.26), transparent 46%),
			radial-gradient(ellipse at 78% 24%, rgba(0, 200, 255, 0.24), transparent 48%),
			radial-gradient(ellipse at 50% 108%, rgba(8, 74, 110, 0.38), transparent 62%),
			linear-gradient(165deg, #071326 0%, #050b16 48%, #02040a 100%);
	}

	.loading-stars {
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(1px 1px at 8% 18%, rgba(255, 255, 255, 0.75), transparent),
			radial-gradient(1px 1px at 21% 41%, rgba(255, 255, 255, 0.4), transparent),
			radial-gradient(1.5px 1.5px at 34% 12%, rgba(255, 255, 255, 0.6), transparent),
			radial-gradient(1px 1px at 47% 29%, rgba(255, 255, 255, 0.5), transparent),
			radial-gradient(1px 1px at 58% 8%, rgba(255, 255, 255, 0.45), transparent),
			radial-gradient(1.5px 1.5px at 69% 37%, rgba(255, 255, 255, 0.55), transparent),
			radial-gradient(1px 1px at 82% 16%, rgba(255, 255, 255, 0.65), transparent),
			radial-gradient(1px 1px at 93% 44%, rgba(255, 255, 255, 0.35), transparent),
			radial-gradient(1px 1px at 14% 66%, rgba(255, 255, 255, 0.3), transparent),
			radial-gradient(1.5px 1.5px at 29% 78%, rgba(255, 255, 255, 0.4), transparent),
			radial-gradient(1px 1px at 42% 58%, rgba(255, 255, 255, 0.35), transparent),
			radial-gradient(1px 1px at 61% 72%, rgba(255, 255, 255, 0.45), transparent),
			radial-gradient(1.5px 1.5px at 74% 88%, rgba(255, 255, 255, 0.3), transparent),
			radial-gradient(1px 1px at 88% 69%, rgba(255, 255, 255, 0.5), transparent),
			radial-gradient(1px 1px at 96% 83%, rgba(255, 255, 255, 0.3), transparent);
		animation: loading-stars-pulse 9s ease-in-out infinite alternate;
	}

	.loading-star {
		position: absolute;
		border-radius: 9999px;
		background: #dbeafe;
		box-shadow: 0 0 6px rgba(191, 219, 254, 0.8);
		animation-name: loading-twinkle;
		animation-timing-function: ease-in-out;
		animation-iteration-count: infinite;
		animation-direction: alternate;
	}

	.loading-fog {
		position: absolute;
		width: 74%;
		height: 58%;
		border-radius: 50%;
		filter: blur(80px);
		opacity: 0.45;
		background: radial-gradient(circle, rgba(255, 176, 0, 0.4), transparent 66%);
	}

	.loading-fog-a {
		bottom: -18%;
		left: -18%;
		animation: loading-drift 19s ease-in-out infinite alternate;
	}

	.loading-fog-b {
		right: -18%;
		bottom: -22%;
		background: radial-gradient(circle, rgba(0, 200, 255, 0.3), transparent 66%);
		animation: loading-drift 25s ease-in-out infinite alternate-reverse;
	}

	/* ---------- Bats ---------- */

	.loading-bat {
		position: absolute;
		color: #03060d;
		opacity: 0.9;
		filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.1));
		animation-name: loading-bat-fly;
		animation-timing-function: linear;
		animation-iteration-count: infinite;
	}

	.loading-bat-a {
		top: 14%;
		width: 42px;
		animation-duration: 17s;
		animation-delay: -3s;
	}

	.loading-bat-b {
		top: 9%;
		width: 26px;
		animation-duration: 23s;
		animation-delay: -12s;
		animation-direction: reverse;
		opacity: 0.7;
	}

	.loading-bat-c {
		top: 21%;
		width: 18px;
		animation-duration: 29s;
		animation-delay: -20s;
		opacity: 0.55;
	}

	/* ---------- Village ---------- */

	.loading-village {
		height: min(38vh, 320px);
		filter: drop-shadow(0 -12px 40px rgba(2, 1, 8, 0.9));
	}

	.loading-windows {
		fill: #fbbf24;
		filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.85));
	}

	.loading-windows rect {
		animation: loading-flicker 5s ease-in-out infinite alternate;
	}

	.loading-windows rect:nth-child(3n) {
		animation-delay: -1.4s;
		animation-duration: 4.2s;
	}

	.loading-windows rect:nth-child(4n) {
		animation-delay: -2.6s;
		animation-duration: 6.4s;
	}

	.loading-windows rect:nth-child(5n) {
		animation-delay: -0.7s;
		animation-duration: 3.6s;
	}

	.loading-windows-green {
		fill: #22d3ee;
		filter: drop-shadow(0 0 7px rgba(34, 211, 238, 0.75));
	}

	.loading-pumpkins {
		fill: #fb923c;
		filter: drop-shadow(0 0 9px rgba(249, 115, 22, 0.85));
		animation: loading-pumpkin-glow 4s ease-in-out infinite alternate;
	}

	.loading-ground-fog {
		height: 22%;
		background: linear-gradient(
			to top,
			rgba(4, 7, 15, 0.92) 12%,
			rgba(4, 7, 15, 0.35) 55%,
			transparent 100%
		);
	}

	/* ---------- Logo ---------- */

	.loading-logo-wrap {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: min(76vw, 430px);
		isolation: isolate;
	}

	.loading-logo-aura {
		position: absolute;
		z-index: -1;
		width: 48%;
		height: 94%;
		border-radius: 50%;
		filter: blur(28px);
		opacity: 0.62;
		animation: loading-aura 4.8s ease-in-out infinite alternate;
	}

	.loading-logo-aura--warm {
		left: 0;
		background: radial-gradient(circle, rgba(255, 176, 0, 0.72), transparent 70%);
	}

	.loading-logo-aura--cool {
		right: 0;
		background: radial-gradient(circle, rgba(0, 200, 255, 0.62), transparent 70%);
		animation-delay: -2.4s;
	}

	.loading-logo {
		display: block;
		width: 100%;
		height: auto;
		filter: drop-shadow(0 14px 34px rgba(0, 0, 0, 0.6))
			drop-shadow(0 0 22px rgba(34, 211, 238, 0.18));
		animation: loading-logo-float 6s ease-in-out infinite alternate;
	}

	/* ---------- Copy ---------- */

	.loading-eyebrow {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.52em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #fbbf24 0%, #fef3c7 46%, #22d3ee 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 0 16px rgba(34, 211, 238, 0.18));
	}

	.loading-title {
		margin: 0;
		line-height: 0;
	}

	.loading-tagline {
		margin-top: 0.75rem;
		min-height: 1.5rem;
		font-size: 1.02rem;
		font-style: italic;
		color: rgba(224, 242, 254, 0.74);
		text-shadow: 0 0 18px rgba(34, 211, 238, 0.16);
	}

	.loading-ornament {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		margin-top: 1.15rem;
		width: min(100%, 20rem);
		color: rgba(251, 191, 36, 0.65);
	}

	.loading-ornament span {
		height: 1px;
		flex: 1;
		background: linear-gradient(to right, transparent, rgba(34, 211, 238, 0.5), transparent);
	}

	.loading-ornament svg {
		height: 1.1rem;
		width: 1.1rem;
		filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.4));
	}

	/* ---------- Progress ---------- */

	.loading-panel {
		margin-top: 1.1rem;
	}

	.loading-track {
		position: relative;
		height: 0.85rem;
		overflow: hidden;
		border-radius: 9999px;
		border: 1px solid rgba(34, 211, 238, 0.22);
		background: rgba(2, 6, 14, 0.72);
		box-shadow:
			inset 0 2px 8px rgba(0, 0, 0, 0.8),
			0 0 0 1px rgba(2, 6, 14, 0.6);
	}

	.loading-bar {
		position: relative;
		height: 100%;
		border-radius: 9999px;
		background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 34%, #22d3ee 68%, #0ea5e9 100%);
		box-shadow:
			0 0 12px rgba(251, 191, 36, 0.45),
			0 0 26px rgba(34, 211, 238, 0.45);
		transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.loading-bar-shine {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
		transform: translateX(-100%);
		animation: loading-shine 1.9s ease-in-out infinite;
	}

	.loading-bar-spark {
		position: absolute;
		top: 50%;
		right: 2px;
		height: 0.5rem;
		width: 0.5rem;
		border-radius: 50%;
		background: #ecfeff;
		box-shadow:
			0 0 10px 3px rgba(165, 243, 252, 0.9),
			0 0 22px 8px rgba(34, 211, 238, 0.45);
		transform: translateY(-50%);
	}

	.loading-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.7rem;
		font-size: 0.78rem;
		color: rgba(214, 211, 209, 0.62);
	}

	.loading-meta-label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.loading-meta-mb {
		font-family: ui-monospace, 'SFMono-Regular', 'Menlo', monospace;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		color: rgba(214, 211, 209, 0.5);
	}

	.loading-percent {
		font-family: 'IM Fell English', 'Times New Roman', serif;
		font-size: 1.3rem;
		font-weight: 700;
		line-height: 1;
		color: #a5f3fc;
		text-shadow: 0 0 14px rgba(34, 211, 238, 0.55);
		font-variant-numeric: tabular-nums;
	}

	.loading-pulse {
		height: 0.4rem;
		width: 0.4rem;
		border-radius: 50%;
		background: #22d3ee;
		box-shadow: 0 0 8px 2px rgba(34, 211, 238, 0.55);
		animation: loading-pulse 1.6s ease-in-out infinite;
	}

	.loading-note {
		margin-top: 1.5rem;
		font-size: 0.62rem;
		letter-spacing: 0.26em;
		text-align: center;
		text-wrap: balance;
		text-transform: uppercase;
		color: rgba(186, 230, 253, 0.42);
	}

	/* ---------- Error ---------- */

	.loading-error {
		margin-top: 1.5rem;
		width: 100%;
		max-width: 26rem;
		border-radius: 0.9rem;
		border: 1px solid rgba(251, 113, 133, 0.24);
		background: linear-gradient(to bottom, rgba(76, 5, 25, 0.72), rgba(30, 2, 12, 0.85));
		padding: 1rem 1.1rem 1.1rem;
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
	}

	.loading-error-title {
		font-family: 'Creepster', 'IM Fell English', serif;
		font-size: 1.5rem;
		letter-spacing: 0.03em;
		color: #fecdd3;
		text-shadow: 0 0 18px rgba(244, 63, 94, 0.45);
	}

	.loading-error-text {
		margin-top: 0.25rem;
		font-size: 0.88rem;
		font-style: italic;
		color: rgba(254, 205, 211, 0.75);
	}

	.loading-error-detail {
		margin-top: 0.4rem;
		font-family: ui-monospace, 'SFMono-Regular', 'Menlo', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.02em;
		color: rgba(254, 205, 211, 0.42);
	}

	.loading-retry {
		margin-top: 0.85rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.55rem;
		border: 1px solid rgba(253, 230, 138, 0.32);
		background: linear-gradient(to bottom, rgba(190, 18, 60, 0.75), rgba(76, 5, 25, 0.9));
		padding: 0.5rem 1.35rem;
		font-family: 'Creepster', 'IM Fell English', serif;
		font-size: 1.2rem;
		letter-spacing: 0.06em;
		color: #fff1f2;
		box-shadow: 0 0 20px rgba(190, 18, 60, 0.25);
		transition:
			transform 150ms ease,
			box-shadow 150ms ease,
			background-color 150ms ease;
	}

	.loading-retry:hover {
		transform: translateY(-1px);
		box-shadow:
			0 0 26px rgba(251, 191, 36, 0.35),
			0 0 12px rgba(190, 18, 60, 0.5);
	}

	.loading-retry:focus-visible {
		outline: 2px solid rgba(253, 230, 138, 0.85);
		outline-offset: 3px;
	}

	/* ---------- Embers ---------- */

	.loading-ember {
		position: absolute;
		bottom: -12px;
		border-radius: 9999px;
		background: #fbbf24;
		box-shadow: 0 0 8px 2px rgba(251, 191, 36, 0.45);
		animation-name: loading-ember-rise;
		animation-timing-function: linear;
		animation-iteration-count: infinite;
	}

	.loading-ember:nth-child(3n) {
		background: #22d3ee;
		box-shadow: 0 0 8px 2px rgba(34, 211, 238, 0.45);
	}

	/* ---------- Keyframes ---------- */

	@keyframes loading-twinkle {
		from {
			opacity: 0.15;
			transform: scale(0.7);
		}
		to {
			opacity: 1;
			transform: scale(1.15);
		}
	}

	@keyframes loading-stars-pulse {
		from {
			opacity: 0.35;
		}
		to {
			opacity: 0.7;
		}
	}

	@keyframes loading-aura {
		from {
			opacity: 0.42;
			transform: scale(0.92);
		}
		to {
			opacity: 0.78;
			transform: scale(1.08);
		}
	}

	@keyframes loading-logo-float {
		from {
			transform: translateY(0) scale(1);
		}
		to {
			transform: translateY(-7px) scale(1.012);
		}
	}

	@keyframes loading-drift {
		from {
			transform: translate3d(-4%, 2%, 0) scale(0.95);
		}
		to {
			transform: translate3d(6%, -3%, 0) scale(1.08);
		}
	}

	@keyframes loading-bat-fly {
		0% {
			transform: translate3d(-15vw, 0, 0) scale(1) rotate(-4deg);
		}
		25% {
			transform: translate3d(25vw, -2vh, 0) scale(1.1) rotate(3deg);
		}
		50% {
			transform: translate3d(55vw, 1vh, 0) scale(0.9) rotate(-2deg);
		}
		75% {
			transform: translate3d(85vw, -2vh, 0) scale(1.05) rotate(4deg);
		}
		100% {
			transform: translate3d(118vw, 0, 0) scale(1) rotate(-4deg);
		}
	}

	@keyframes loading-shine {
		0% {
			transform: translateX(-100%);
		}
		55%,
		100% {
			transform: translateX(100%);
		}
	}

	@keyframes loading-pulse {
		0%,
		100% {
			opacity: 0.35;
			transform: scale(0.8);
		}
		50% {
			opacity: 1;
			transform: scale(1.15);
		}
	}

	@keyframes loading-flicker {
		0% {
			opacity: 0.72;
		}
		40% {
			opacity: 1;
		}
		62% {
			opacity: 0.55;
		}
		100% {
			opacity: 0.88;
		}
	}

	@keyframes loading-pumpkin-glow {
		from {
			opacity: 0.7;
			filter: drop-shadow(0 0 5px rgba(249, 115, 22, 0.6));
		}
		to {
			opacity: 1;
			filter: drop-shadow(0 0 13px rgba(249, 115, 22, 0.95));
		}
	}

	@keyframes loading-ember-rise {
		0% {
			transform: translate3d(0, 0, 0) scale(1);
			opacity: 0;
		}
		12% {
			opacity: var(--ember-opacity, 0.55);
		}
		72% {
			opacity: var(--ember-opacity, 0.55);
		}
		100% {
			transform: translate3d(24px, -108vh, 0) scale(0.35);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.loading-stars,
		.loading-star,
		.loading-fog,
		.loading-logo,
		.loading-logo-aura,
		.loading-bat,
		.loading-bar-shine,
		.loading-pulse,
		.loading-windows rect,
		.loading-pumpkins,
		.loading-ember {
			animation: none;
		}

		.loading-bar-shine {
			opacity: 0;
		}

		.loading-ember {
			display: none;
		}
	}

	@media (max-height: 560px) {
		.loading-logo-wrap {
			width: min(62vw, 300px);
			margin-bottom: 1rem;
		}

		.loading-ornament,
		.loading-note {
			margin-top: 0.85rem;
		}
	}
</style>
