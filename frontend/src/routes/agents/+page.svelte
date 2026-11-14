<script lang="ts">
	import doc from '#lib/content/agents.md?raw';
	import { renderMarkdown } from '#lib/agents/markdown.ts';

	// The document is authored in the repo and mirrored here by
	// `scripts/sync-agents.mjs`. Rendering is done once at module scope.
	const html = renderMarkdown(doc);
</script>

<svelte:head>
	<title>NearBox — Economy & Agents</title>
	<meta
		name="description"
		content="NearBox (nearbox.lol): a live NEAR village where five merchant NPCs with wallets price their stock, players move those prices, and the chain stays invisible. Track 09: Games With Real Economies."
	/>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a class="brand" href="./">
			<span class="brand-mark">NB</span>
			<span>NearBox</span>
		</a>
		<nav>
			<a href="./agents.md">Raw .md</a>
			<a class="play" href="./">Play</a>
		</nav>
	</header>

	<main class="prose">
		{@html html}
	</main>

	<footer>
		<p>
			Source of truth: <code>AGENTS.md</code> at the repo root. This page is generated from it. The
			economy it describes is live at <a href="./">nearbox.lol</a>.
		</p>
	</footer>
</div>

<style>
	.page {
		min-height: 100vh;
		max-width: 920px;
		margin: 0 auto;
		padding: 0 24px 96px;
		color: #e9eef7;
		font-family: 'IM Fell English', Georgia, serif;
		font-size: 17px;
		line-height: 1.65;
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin: 0 -24px 32px;
		padding: 14px 24px;
		background: rgba(4, 7, 15, 0.82);
		border-bottom: 1px solid rgba(255, 176, 0, 0.18);
		backdrop-filter: blur(12px);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		color: #ffb000;
		font-family: 'Creepster', 'IM Fell English', serif;
		font-size: 26px;
		letter-spacing: 0.04em;
		text-decoration: none;
	}

	.brand-mark {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 1px solid rgba(0, 200, 255, 0.45);
		border-radius: 8px;
		background: rgba(0, 200, 255, 0.08);
		color: #7fe4ff;
		font-family: 'IM Fell English', serif;
		font-size: 14px;
		letter-spacing: 0.06em;
	}

	.topbar nav {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
	}

	.topbar nav a {
		padding: 7px 12px;
		border: 1px solid rgba(233, 238, 247, 0.18);
		border-radius: 999px;
		color: #c9d3e4;
		text-decoration: none;
	}

	.topbar nav a:hover {
		border-color: rgba(255, 176, 0, 0.5);
		color: #ffb000;
	}

	.topbar nav a.play {
		border-color: rgba(255, 176, 0, 0.55);
		background: rgba(255, 176, 0, 0.12);
		color: #ffcf66;
	}

	.prose :global(h1) {
		margin: 8px 0 4px;
		color: #ffb000;
		font-family: 'Creepster', 'IM Fell English', serif;
		font-size: clamp(34px, 6vw, 48px);
		font-weight: 400;
		line-height: 1.1;
		letter-spacing: 0.02em;
	}

	.prose :global(h2) {
		margin: 56px 0 14px;
		padding-bottom: 8px;
		border-bottom: 1px solid rgba(255, 176, 0, 0.22);
		color: #7fe4ff;
		font-family: 'Creepster', 'IM Fell English', serif;
		font-size: 30px;
		font-weight: 400;
		letter-spacing: 0.03em;
	}

	.prose :global(h3) {
		margin: 34px 0 10px;
		color: #ffd27a;
		font-size: 21px;
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	.prose :global(h4) {
		margin: 26px 0 8px;
		color: #e9eef7;
		font-size: 18px;
	}

	.prose :global(p) {
		margin: 0 0 16px;
		color: #d7dfec;
	}

	.prose :global(strong) {
		color: #fff4d6;
	}

	.prose :global(em) {
		color: #b9c6da;
	}

	.prose :global(a) {
		color: #7fe4ff;
		text-decoration: underline;
		text-decoration-color: rgba(127, 228, 255, 0.4);
		text-underline-offset: 3px;
	}

	.prose :global(a:hover) {
		color: #ffb000;
		text-decoration-color: rgba(255, 176, 0, 0.6);
	}

	.prose :global(hr) {
		margin: 40px 0;
		border: 0;
		border-top: 1px solid rgba(233, 238, 247, 0.12);
	}

	.prose :global(ul),
	.prose :global(ol) {
		margin: 0 0 18px;
		padding-left: 26px;
	}

	.prose :global(li) {
		margin: 6px 0;
		color: #d7dfec;
	}

	.prose :global(li::marker) {
		color: #ffb000;
	}

	.prose :global(blockquote) {
		margin: 20px 0;
		padding: 12px 18px;
		border-left: 3px solid #ffb000;
		background: rgba(255, 176, 0, 0.06);
		color: #ffe6b0;
	}

	.prose :global(code) {
		padding: 2px 6px;
		border: 1px solid rgba(127, 228, 255, 0.18);
		border-radius: 5px;
		background: rgba(0, 200, 255, 0.08);
		color: #a9edff;
		font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
		font-size: 0.86em;
	}

	.prose :global(pre) {
		margin: 0 0 20px;
		padding: 16px 18px;
		overflow-x: auto;
		border: 1px solid rgba(233, 238, 247, 0.12);
		border-radius: 10px;
		background: rgba(2, 5, 11, 0.85);
		line-height: 1.55;
	}

	.prose :global(pre code) {
		padding: 0;
		border: 0;
		background: none;
		color: #cfe6ef;
		font-size: 14px;
	}

	.prose :global(.table-wrap) {
		margin: 0 0 22px;
		overflow-x: auto;
		border: 1px solid rgba(233, 238, 247, 0.14);
		border-radius: 10px;
	}

	.prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}

	.prose :global(th) {
		padding: 10px 12px;
		border-bottom: 1px solid rgba(255, 176, 0, 0.28);
		background: rgba(255, 176, 0, 0.08);
		color: #ffcf66;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}

	.prose :global(td) {
		padding: 10px 12px;
		border-bottom: 1px solid rgba(233, 238, 247, 0.08);
		color: #d7dfec;
		vertical-align: top;
	}

	.prose :global(tbody tr:last-child td) {
		border-bottom: 0;
	}

	.prose :global(tbody tr:hover) {
		background: rgba(0, 200, 255, 0.05);
	}

	footer {
		margin-top: 64px;
		padding-top: 18px;
		border-top: 1px solid rgba(233, 238, 247, 0.12);
		color: #8695ac;
		font-size: 14px;
	}

	footer code {
		color: #a9edff;
		font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
	}

	footer a {
		color: #7fe4ff;
		text-underline-offset: 3px;
	}

	@media (max-width: 640px) {
		.page {
			padding: 0 16px 72px;
			font-size: 16px;
		}

		.topbar {
			margin: 0 -16px 24px;
			padding: 12px 16px;
		}

		.brand {
			font-size: 22px;
		}

		.prose :global(h2) {
			font-size: 25px;
			margin-top: 42px;
		}
	}
</style>
