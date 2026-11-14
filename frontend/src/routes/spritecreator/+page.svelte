<script lang="ts">
	type Frame = { x: number; y: number; w: number; h: number };
	type Anim = { duration: number; frames: Frame[] };
	type Animations = Record<string, Anim>;

	let canvasEl: HTMLCanvasElement | undefined = $state();
	let containerEl: HTMLDivElement | undefined = $state();

	let img = $state<HTMLImageElement | null>(null);
	let imgName = $state('');
	let imgSrc = $state('');
	let loadError = $state('');
	let bgColor = $state('#0c0c0f');

	let zoom = $state(1);
	let offset = $state({ x: 0, y: 0 });

	let selection = $state<Frame | null>(null);
	let selected = $state<{ anim: string; index: number } | null>(null);

	let animations = $state<Animations>({});
	let animName = $state('idle');
	let animDuration = $state(100);

	let dragStart = $state<{ x: number; y: number } | null>(null);
	let panStart = $state<{ x: number; y: number; ox: number; oy: number } | null>(null);
	let spaceDown = $state(false);
	let cursorImg = $state<{ x: number; y: number } | null>(null);
	let needsFit = $state(false);

	const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

	let containerW = 0;
	let containerH = 0;

	const animNames = $derived(Object.keys(animations));
	const selectedFrame = $derived(
		selected && animations[selected.anim]?.frames[selected.index]
			? {
					anim: selected.anim,
					index: selected.index,
					frame: animations[selected.anim].frames[selected.index]
				}
			: null
	);

	function loadImage(src: string, name: string) {
		const image = new Image();
		image.onload = () => {
			img = image;
			imgName = name;
			loadError = '';
			needsFit = true;
		};
		image.onerror = () => {
			loadError = 'Could not load the image';
			img = null;
		};
		image.src = src;
	}

	function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			imgSrc = String(reader.result);
			loadImage(imgSrc, file.name);
		};
		reader.readAsDataURL(file);
		input.value = '';
	}

	function onUrlLoad() {
		if (!imgSrc.trim()) return;
		loadImage(imgSrc.trim(), imgSrc.trim().split('/').pop() || 'image');
	}

	function fitToScreen() {
		if (!img || !containerW || !containerH) return;
		const pad = 40;
		const zx = (containerW - pad) / img.width;
		const zy = (containerH - pad) / img.height;
		zoom = Math.min(zx, zy, 4);
		offset.x = (containerW - img.width * zoom) / 2;
		offset.y = (containerH - img.height * zoom) / 2;
	}

	function toImage(cx: number, cy: number) {
		return { x: (cx - offset.x) / zoom, y: (cy - offset.y) / zoom };
	}

	function clampToImage(f: Frame): Frame {
		if (!img) return f;
		const x = Math.max(0, Math.min(img.width - 1, Math.round(f.x)));
		const y = Math.max(0, Math.min(img.height - 1, Math.round(f.y)));
		const w = Math.max(1, Math.min(img.width - x, Math.round(f.w)));
		const h = Math.max(1, Math.min(img.height - y, Math.round(f.h)));
		return { x, y, w, h };
	}

	function onPointerDown(e: PointerEvent) {
		if (!img || !canvasEl) return;
		canvasEl.setPointerCapture(e.pointerId);
		const rect = canvasEl.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;

		if (e.button === 1 || spaceDown || e.button === 2) {
			panStart = { x: cx, y: cy, ox: offset.x, oy: offset.y };
			return;
		}
		if (e.button !== 0) return;

		const p = toImage(cx, cy);
		const hit = hitFrame(p.x, p.y);
		if (hit) {
			selected = hit;
			selection = null;
			return;
		}
		dragStart = p;
		selection = { x: p.x, y: p.y, w: 0, h: 0 };
	}

	function onPointerMove(e: PointerEvent) {
		if (!img || !canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;
		const p = toImage(cx, cy);
		cursorImg = {
			x: Math.max(0, Math.min(img.width, Math.round(p.x))),
			y: Math.max(0, Math.min(img.height, Math.round(p.y)))
		};

		if (panStart) {
			offset.x = panStart.ox + (cx - panStart.x);
			offset.y = panStart.oy + (cy - panStart.y);
			return;
		}
		if (dragStart) {
			selection = clampToImage({
				x: Math.min(dragStart.x, p.x),
				y: Math.min(dragStart.y, p.y),
				w: Math.abs(p.x - dragStart.x),
				h: Math.abs(p.y - dragStart.y)
			});
		}
	}

	function onPointerUp(_e: PointerEvent) {
		if (panStart) {
			panStart = null;
			return;
		}
		if (dragStart) {
			dragStart = null;
			if (selection && (selection.w < 2 || selection.h < 2)) {
				selection = null;
			}
		}
	}

	function onWheel(e: WheelEvent) {
		if (!img || !canvasEl) return;
		e.preventDefault();
		const rect = canvasEl.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;
		const p = toImage(cx, cy);
		const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
		zoom = Math.max(0.05, Math.min(16, zoom * factor));
		offset.x = cx - p.x * zoom;
		offset.y = cy - p.y * zoom;
	}

	function hitFrame(ix: number, iy: number) {
		for (const [name, anim] of Object.entries(animations)) {
			for (let i = anim.frames.length - 1; i >= 0; i--) {
				const f = anim.frames[i];
				if (ix >= f.x && ix <= f.x + f.w && iy >= f.y && iy <= f.y + f.h) {
					return { anim: name, index: i };
				}
			}
		}
		return null;
	}

	function addFrame() {
		if (!selection) return;
		const name = animName.trim() || 'default';
		if (!animations[name]) {
			animations[name] = { duration: animDuration, frames: [] };
		}
		animations[name].duration = animDuration;
		animations[name].frames.push({ ...selection });
		selected = { anim: name, index: animations[name].frames.length - 1 };
		selection = null;
	}

	function removeFrame(anim: string, index: number) {
		animations[anim].frames.splice(index, 1);
		if (animations[anim].frames.length === 0) {
			delete animations[anim];
		}
		if (selected?.anim === anim && selected.index === index) selected = null;
	}

	function removeAnim(name: string) {
		delete animations[name];
		if (selected?.anim === name) selected = null;
	}

	function selectFrame(anim: string, index: number) {
		selected = { anim, index };
		selection = null;
	}

	function setSelectedFrame(f: Frame) {
		if (!selectedFrame) return;
		animations[selectedFrame.anim].frames[selectedFrame.index] = clampToImage(f);
	}

	function setSelection(f: Frame) {
		selection = clampToImage(f);
	}

	function nudge(dx: number, dy: number) {
		if (selection) {
			selection = clampToImage({ ...selection, x: selection.x + dx, y: selection.y + dy });
		} else if (selectedFrame) {
			const f = selectedFrame.frame;
			setSelectedFrame({ ...f, x: f.x + dx, y: f.y + dy });
		}
	}

	function duplicateSelected() {
		if (!selectedFrame) return;
		const anim = animations[selectedFrame.anim];
		anim.frames.splice(selectedFrame.index + 1, 0, { ...selectedFrame.frame });
		selected = { anim: selectedFrame.anim, index: selectedFrame.index + 1 };
	}

	function moveFrame(anim: string, index: number, dir: -1 | 1) {
		const frames = animations[anim]?.frames;
		if (!frames) return;
		const j = index + dir;
		if (j < 0 || j >= frames.length) return;
		const [f] = frames.splice(index, 1);
		frames.splice(j, 0, f);
		if (selected?.anim === anim && selected.index === index) {
			selected = { anim, index: j };
		} else if (selected?.anim === anim && selected.index === j) {
			selected = { anim, index };
		}
	}

	function addSelectionTo(name: string) {
		if (!selection) return;
		if (!animations[name]) animations[name] = { duration: animDuration, frames: [] };
		animations[name].frames.push({ ...selection });
		selected = { anim: name, index: animations[name].frames.length - 1 };
		selection = null;
	}

	function replaceSelectedWithSelection() {
		if (!selection || !selected) return;
		const frames = animations[selected.anim]?.frames;
		if (!frames?.[selected.index]) return;
		frames[selected.index] = { ...selection };
		selection = null;
	}

	let renaming = $state<string | null>(null);
	let renameValue = $state('');

	function startRename(name: string) {
		renaming = name;
		renameValue = name;
	}

	function commitRename(oldName: string) {
		if (renaming !== oldName) return;
		renaming = null;
		const newName = renameValue.trim();
		if (!newName || newName === oldName || animations[newName]) return;
		animations[newName] = animations[oldName];
		delete animations[oldName];
		if (selected?.anim === oldName) selected = { anim: newName, index: selected.index };
		if (animName === oldName) animName = newName;
	}

	function duplicateAnim(name: string) {
		const anim = animations[name];
		if (!anim) return;
		let copy = name + '_copy';
		let i = 2;
		while (animations[copy]) copy = name + '_copy' + i++;
		animations[copy] = {
			duration: anim.duration,
			frames: anim.frames.map((f) => ({ ...f }))
		};
	}

	function download(name: string, data: unknown) {
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = name;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function exportPixelJson() {
		const data = {
			meta: {
				generator: 'spritecreator',
				version: 1,
				image: imgName,
				imageWidth: img?.width ?? 0,
				imageHeight: img?.height ?? 0
			},
			animations: Object.fromEntries(
				Object.entries(animations).map(([name, a]) => [
					name,
					{ duration: a.duration, frames: a.frames.map((f) => ({ ...f })) }
				])
			)
		};
		download((imgName.replace(/\.[^.]+$/, '') || 'sprites') + '.pixels.json', data);
	}

	function exportSpritesheetJson() {
		const frames: [number, number, number, number][] = [];
		const anims: Record<string, [number, number][]> = {};
		const animationLengths: number[] = [];
		const W = img?.width || 1;
		const H = img?.height || 1;
		for (const [name, a] of Object.entries(animations)) {
			const start = frames.length;
			for (const f of a.frames) {
				frames.push([f.x / W, 1 - (f.y + f.h) / H, f.w / W, f.h / H]);
			}
			anims[name] = a.frames.map((_, i) => [start + i, a.duration]);
			animationLengths.push(a.frames.length);
		}
		download((imgName.replace(/\.[^.]+$/, '') || 'sprites') + '.spritesheet.json', {
			frames,
			animations: anims,
			sheetSize: [W, H],
			animationLengths
		});
	}

	function onImport(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const data = JSON.parse(String(reader.result));
				if (data.animations) {
					const out: Animations = {};
					for (const [name, a] of Object.entries<Record<string, unknown>>(data.animations)) {
						const anim = a as { duration?: number; frames?: Frame[] };
						if (anim.frames?.[0]?.x !== undefined) {
							out[name] = {
								duration: anim.duration ?? 100,
								frames: anim.frames.map((f) => ({ ...f }))
							};
						}
					}
					if (Object.keys(out).length) {
						animations = out;
						const first = Object.keys(out)[0];
						if (first) animName = first;
					}
				}
			} catch {
				loadError = 'Invalid JSON';
			}
		};
		reader.readAsText(file);
		input.value = '';
	}

	function clearAll() {
		animations = {};
		selection = null;
		selected = null;
	}

	const COLORS = [
		'#22c55e',
		'#3b82f6',
		'#f59e0b',
		'#ec4899',
		'#8b5cf6',
		'#06b6d4',
		'#ef4444',
		'#84cc16'
	];

	function colorFor(name: string) {
		let h = 0;
		for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
		return COLORS[h % COLORS.length];
	}

	function redraw() {
		const canvas = canvasEl;
		if (!canvas) return;
		const w = containerW;
		const h = containerH;
		if (!w || !h) return;

		// only touch the drawing-buffer size (for DPR), never the CSS size
		const bw = Math.max(1, Math.floor(w * DPR));
		const bh = Math.max(1, Math.floor(h * DPR));
		if (canvas.width !== bw) canvas.width = bw;
		if (canvas.height !== bh) canvas.height = bh;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, w, h);

		if (!img) return;

		ctx.imageSmoothingEnabled = zoom < 1;
		ctx.drawImage(img, offset.x, offset.y, img.width * zoom, img.height * zoom);

		for (const [name, anim] of Object.entries(animations)) {
			const color = colorFor(name);
			anim.frames.forEach((f, i) => {
				const isSel = selected?.anim === name && selected.index === i;
				ctx.strokeStyle = isSel ? '#fff' : color;
				ctx.lineWidth = isSel ? 2 : 1;
				ctx.setLineDash(isSel ? [] : [4, 3]);
				ctx.strokeRect(offset.x + f.x * zoom, offset.y + f.y * zoom, f.w * zoom, f.h * zoom);
				ctx.setLineDash([]);
				if (zoom > 0.4) {
					ctx.fillStyle = isSel ? '#fff' : color;
					ctx.font = '10px monospace';
					ctx.fillText(String(i), offset.x + f.x * zoom + 2, offset.y + f.y * zoom + 10);
				}
			});
		}

		if (selection) {
			ctx.strokeStyle = '#facc15';
			ctx.lineWidth = 1.5;
			ctx.setLineDash([6, 4]);
			ctx.strokeRect(
				offset.x + selection.x * zoom,
				offset.y + selection.y * zoom,
				selection.w * zoom,
				selection.h * zoom
			);
			ctx.setLineDash([]);
			ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
			ctx.fillRect(
				offset.x + selection.x * zoom,
				offset.y + selection.y * zoom,
				selection.w * zoom,
				selection.h * zoom
			);
		}
	}

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) {
				containerW = e.contentRect.width;
				containerH = e.contentRect.height;
			}
			if (needsFit) {
				needsFit = false;
				fitToScreen();
			}
			redraw();
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	$effect(() => {
		void img;
		void zoom;
		void offset.x;
		void offset.y;
		void selection;
		void animations;
		void selected;
		void bgColor;
		redraw();
	});

	$effect(() => {
		const down = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			const typing = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA';
			if (e.code === 'Space' && !typing) {
				spaceDown = true;
				e.preventDefault();
			}
			if ((e.code === 'Delete' || e.code === 'Backspace') && !typing) {
				if (selected) removeFrame(selected.anim, selected.index);
			}
			if (!typing && (selection || selected) && e.code.startsWith('Arrow')) {
				const step = e.shiftKey ? 10 : 1;
				if (e.code === 'ArrowLeft') nudge(-step, 0);
				if (e.code === 'ArrowRight') nudge(step, 0);
				if (e.code === 'ArrowUp') nudge(0, -step);
				if (e.code === 'ArrowDown') nudge(0, step);
				e.preventDefault();
			}
			if (!typing && (selection || selected) && e.code === 'Escape') {
				selection = null;
				selected = null;
			}
		};
		const up = (e: KeyboardEvent) => {
			if (e.code === 'Space') spaceDown = false;
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
		};
	});
</script>

<svelte:head>
	<title>Sprite Creator</title>
</svelte:head>

<div class="flex h-screen flex-col bg-zinc-950 text-zinc-100">
	<header class="flex items-center gap-3 border-b border-zinc-800 px-4 py-2">
		<h1 class="text-sm font-bold tracking-wide text-zinc-300">SPRITE CREATOR</h1>
		<div class="ml-auto flex items-center gap-2 text-xs">
			{#if img}
				<span class="text-zinc-500">{imgName} · {img.width}×{img.height}</span>
			{/if}
			<div class="flex items-center gap-1.5">
				<input
					type="color"
					bind:value={bgColor}
					title="Canvas background color"
					class="h-6 w-6 cursor-pointer rounded border border-zinc-800 bg-zinc-800 p-0"
				/>
				<span class="text-zinc-500">background</span>
			</div>
			<label class="cursor-pointer rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700">
				Load image
				<input type="file" accept="image/*" class="hidden" onchange={onFile} />
			</label>
			<input
				bind:value={imgSrc}
				placeholder="/textures/... or URL"
				class="w-44 rounded bg-zinc-900 px-2 py-1 text-xs ring-zinc-700 outline-none focus:ring-1"
				onkeydown={(e) => e.key === 'Enter' && onUrlLoad()}
			/>
			<button class="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700" onclick={onUrlLoad}
				>URL</button
			>
			<label class="cursor-pointer rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700">
				Import JSON
				<input type="file" accept=".json" class="hidden" onchange={onImport} />
			</label>
		</div>
	</header>

	<div class="flex min-h-0 flex-1">
		<div class="relative min-w-0 flex-1 overflow-hidden" bind:this={containerEl}>
			{#if loadError}
				<div class="absolute inset-0 flex items-center justify-center text-sm text-red-400">
					{loadError}
				</div>
			{/if}
			{#if !img && !loadError}
				<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-600">
					<svg
						width="48"
						height="48"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						viewBox="0 0 24 24"
					>
						<path
							d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21zM8.25 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
						/>
					</svg>
					<p class="text-sm">Load a spritesheet to get started</p>
				</div>
			{/if}
			<canvas
				bind:this={canvasEl}
				class="absolute inset-0 touch-none {spaceDown ? 'cursor-grab' : 'cursor-crosshair'}"
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onpointercancel={onPointerUp}
				onwheel={onWheel}
				oncontextmenu={(e) => e.preventDefault()}
			></canvas>

			{#if img}
				<div
					class="pointer-events-none absolute bottom-2 left-2 flex gap-3 font-mono text-[10px] text-zinc-500"
				>
					{#if cursorImg}
						<span>x:{cursorImg.x} y:{cursorImg.y}</span>
					{/if}
					{#if selection}
						<span class="text-yellow-400">
							sel {selection.x},{selection.y}
							{selection.w}×{selection.h}
						</span>
					{/if}
					<span>zoom {(zoom * 100).toFixed(0)}%</span>
					<span>wheel: zoom · drag: crop · space/middle button: pan · click on frame: select</span>
				</div>
				<div class="absolute top-2 left-2 flex gap-1">
					<button
						class="rounded bg-zinc-900/80 px-2 py-1 text-xs hover:bg-zinc-800"
						onclick={() => {
							zoom = Math.min(16, zoom * 1.3);
						}}>+</button
					>
					<button
						class="rounded bg-zinc-900/80 px-2 py-1 text-xs hover:bg-zinc-800"
						onclick={() => {
							zoom = Math.max(0.05, zoom / 1.3);
						}}>-</button
					>
					<button
						class="rounded bg-zinc-900/80 px-2 py-1 text-xs hover:bg-zinc-800"
						onclick={fitToScreen}>fit</button
					>
				</div>
			{/if}
		</div>

		<aside
			class="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-zinc-800 bg-zinc-900/50 p-3 text-xs"
		>
			{#snippet frameEditor(f: Frame, apply: (f: Frame) => void, label: string, accent: string)}
				{@const scale = Math.min(1, 72 / Math.max(f.w, f.h, 1))}
				<div class="flex gap-2">
					<div
						class="h-18 w-18 shrink-0 rounded border border-zinc-700 bg-zinc-950"
						style="background-image:url('{imgSrc}');background-repeat:no-repeat;background-size:{img
							? img.width * scale
							: 0}px {img ? img.height * scale : 0}px;background-position:{-f.x * scale}px {-f.y *
							scale}px;image-rendering:pixelated"
					></div>
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex items-center justify-between">
							<span class="font-mono text-[10px] {accent}">{label}</span>
							<span class="font-mono text-[10px] text-zinc-600">{f.w}×{f.h}</span>
						</div>
						<div class="grid grid-cols-4 gap-1">
							{#each ['x', 'y', 'w', 'h'] as const as prop (prop)}
								<label class="flex flex-col gap-0.5 text-[9px] text-zinc-500">
									{prop.toUpperCase()}
									<input
										type="number"
										step="1"
										class="w-full rounded bg-zinc-950 px-1 py-0.5 font-mono text-[11px] text-zinc-200 ring-zinc-700 outline-none focus:ring-1"
										value={f[prop]}
										oninput={(e) => apply({ ...f, [prop]: Number(e.currentTarget.value) })}
									/>
								</label>
							{/each}
						</div>
						<div class="flex flex-wrap items-center gap-0.5">
							<button
								class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] hover:bg-zinc-700"
								title="move x-1 (←)"
								onclick={() => apply({ ...f, x: f.x - 1 })}>◀</button
							>
							<button
								class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] hover:bg-zinc-700"
								title="move y-1 (↑)"
								onclick={() => apply({ ...f, y: f.y - 1 })}>▲</button
							>
							<button
								class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] hover:bg-zinc-700"
								title="move y+1 (↓)"
								onclick={() => apply({ ...f, y: f.y + 1 })}>▼</button
							>
							<button
								class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] hover:bg-zinc-700"
								title="move x+1 (→)"
								onclick={() => apply({ ...f, x: f.x + 1 })}>▶</button
							>
							<span class="mx-0.5 text-zinc-700">|</span>
							<button
								class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] hover:bg-zinc-700"
								title="width -1"
								onclick={() => apply({ ...f, w: Math.max(1, f.w - 1) })}>w−</button
							>
							<button
								class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] hover:bg-zinc-700"
								title="width +1"
								onclick={() => apply({ ...f, w: f.w + 1 })}>w+</button
							>
							<button
								class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] hover:bg-zinc-700"
								title="height -1"
								onclick={() => apply({ ...f, h: Math.max(1, f.h - 1) })}>h−</button
							>
							<button
								class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] hover:bg-zinc-700"
								title="height +1"
								onclick={() => apply({ ...f, h: f.h + 1 })}>h+</button
							>
						</div>
					</div>
				</div>
			{/snippet}

			{#if selection}
				<section
					class="flex flex-col gap-1.5 rounded border border-yellow-700/40 bg-yellow-900/10 p-2"
				>
					{@render frameEditor(selection, setSelection, 'SELECTION', 'text-yellow-400')}
					{#if animNames.length}
						<div class="flex flex-wrap items-center gap-1">
							<span class="text-[9px] text-zinc-600">Add to:</span>
							{#each animNames as n (n)}
								<button
									class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-emerald-700 hover:text-white"
									title={'Add selection to ' + n}
									onclick={() => addSelectionTo(n)}>{n}</button
								>
							{/each}
						</div>
					{/if}
					{#if selected}
						<button
							class="rounded bg-amber-800/70 py-1 text-[10px] hover:bg-amber-700"
							onclick={replaceSelectedWithSelection}
						>
							Replace {selected.anim}#{selected.index} with this selection
						</button>
					{/if}
				</section>
			{:else if selectedFrame}
				<section
					class="flex flex-col gap-1.5 rounded border border-emerald-700/40 bg-emerald-900/10 p-2"
				>
					{@render frameEditor(
						selectedFrame.frame,
						setSelectedFrame,
						'FRAME ' + selectedFrame.anim + '#' + selectedFrame.index,
						'text-emerald-400'
					)}
					<div class="grid grid-cols-4 gap-1">
						<button
							class="rounded bg-zinc-800 py-1 text-[10px] hover:bg-zinc-700 disabled:opacity-30"
							disabled={selectedFrame.index === 0}
							title="move frame earlier in the group"
							onclick={() => moveFrame(selectedFrame.anim, selectedFrame.index, -1)}>←</button
						>
						<button
							class="rounded bg-zinc-800 py-1 text-[10px] hover:bg-zinc-700 disabled:opacity-30"
							disabled={selectedFrame.index === animations[selectedFrame.anim].frames.length - 1}
							title="move frame later in the group"
							onclick={() => moveFrame(selectedFrame.anim, selectedFrame.index, 1)}>→</button
						>
						<button class="rounded bg-zinc-800 py-1 hover:bg-zinc-700" onclick={duplicateSelected}
							>Duplicate</button
						>
						<button
							class="rounded bg-red-900/60 py-1 hover:bg-red-800"
							onclick={() => selected && removeFrame(selected.anim, selected.index)}>Delete</button
						>
					</div>
				</section>
			{:else}
				<section>
					<h2 class="mb-1 font-semibold text-zinc-400">Current selection</h2>
					<p class="text-zinc-600">Drag over the image to crop</p>
				</section>
			{/if}

			<section class="flex flex-col gap-2">
				<h2 class="font-semibold text-zinc-400">Save to animation</h2>
				<label class="flex flex-col gap-0.5 text-[10px] text-zinc-500">
					Name (e.g. run, jump, idle)
					<input
						list="anim-list"
						bind:value={animName}
						class="rounded bg-zinc-900 px-2 py-1.5 text-zinc-200 ring-zinc-700 outline-none focus:ring-1"
					/>
					<datalist id="anim-list">
						{#each animNames as n (n)}
							<option value={n}></option>
						{/each}
					</datalist>
				</label>
				<label class="flex flex-col gap-0.5 text-[10px] text-zinc-500">
					Duration per frame (ms)
					<input
						type="number"
						min="16"
						bind:value={animDuration}
						class="rounded bg-zinc-900 px-2 py-1.5 font-mono text-zinc-200 ring-zinc-700 outline-none focus:ring-1"
					/>
				</label>
				<button
					class="rounded bg-emerald-700 py-2 font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
					disabled={!selection}
					onclick={addFrame}
				>
					+ Add frame to “{animName || 'default'}”
				</button>
			</section>

			<section class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<h2 class="font-semibold text-zinc-400">Animaciones ({animNames.length})</h2>
					{#if animNames.length}
						<button class="text-[10px] text-zinc-600 hover:text-zinc-300" onclick={clearAll}
							>clear all</button
						>
					{/if}
				</div>
				{#each animNames as name (name)}
					{@const anim = animations[name]}
					{@const color = colorFor(name)}
					<div class="rounded border border-zinc-800 bg-zinc-900/80 p-2">
						<div class="mb-1 flex items-center gap-1.5">
							<span class="h-2 w-2 shrink-0 rounded-full" style="background:{color}"></span>
							{#if renaming === name}
								<input
									class="min-w-0 flex-1 rounded bg-zinc-950 px-1 py-0.5 text-zinc-200 ring-zinc-700 outline-none focus:ring-1"
									bind:value={renameValue}
									onkeydown={(e) => {
										if (e.key === 'Enter') commitRename(name);
										if (e.key === 'Escape') renaming = null;
									}}
									onblur={() => commitRename(name)}
								/>
							{:else}
								<button
									class="truncate font-semibold text-zinc-200 hover:text-white"
									title="Click to rename"
									onclick={() => startRename(name)}>{name}</button
								>
							{/if}
							<span class="shrink-0 text-[10px] text-zinc-600">{anim.frames.length}f</span>
							<input
								type="number"
								min="16"
								class="w-14 shrink-0 rounded bg-zinc-950 px-1 py-0.5 text-right font-mono text-[10px] text-zinc-300 ring-zinc-700 outline-none focus:ring-1"
								title="duration per frame (ms)"
								value={anim.duration}
								oninput={(e) => (animations[name].duration = Number(e.currentTarget.value))}
							/>
							<span class="shrink-0 text-[9px] text-zinc-600">ms</span>
							<button
								class="ml-auto shrink-0 text-zinc-600 hover:text-sky-400"
								title="Duplicate animation"
								onclick={() => duplicateAnim(name)}>⧉</button
							>
							<button
								class="shrink-0 text-zinc-600 hover:text-red-400"
								title="Delete animation"
								onclick={() => removeAnim(name)}>✕</button
							>
						</div>
						<div class="flex flex-wrap gap-1">
							{#each anim.frames as f, i (f)}
								<button
									class="rounded px-1.5 py-0.5 font-mono text-[10px] {selected?.anim === name &&
									selected.index === i
										? 'bg-white text-zinc-900'
										: 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}"
									onclick={() => selectFrame(name, i)}
								>
									{i}: {f.w}×{f.h}
								</button>
							{/each}
							{#if selection}
								<button
									class="rounded border border-dashed border-emerald-700 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400 hover:bg-emerald-800/40"
									title="Add the current selection to this group"
									onclick={() => addSelectionTo(name)}>+ sel</button
								>
							{/if}
						</div>
					</div>
				{/each}
			</section>

			<section class="mt-auto flex flex-col gap-2 border-t border-zinc-800 pt-3">
				<button
					class="rounded bg-sky-700 py-2 font-semibold text-white hover:bg-sky-600 disabled:opacity-40"
					disabled={!animNames.length}
					onclick={exportPixelJson}
				>
					Export JSON (pixels)
				</button>
				<button
					class="rounded bg-violet-700 py-2 font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
					disabled={!animNames.length}
					onclick={exportSpritesheetJson}
					title="Normalized UV frame format for InstancedSprite (@threlte/extras)"
				>
					Export SpritesheetFormat (UV)
				</button>
			</section>
		</aside>
	</div>
</div>
