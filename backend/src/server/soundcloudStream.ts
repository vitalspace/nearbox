import { normalizeSoundCloudUrl } from './clubMusic';

/**
 * Scraper propio de SoundCloud.
 *
 * 1. Descarga la página del track.
 * 2. Lee `window.__sc_hydration` para obtener título, autor, artwork,
 *    `media.transcodings` y `track_authorization`.
 * 3. Descubre el `client_id` público en la propia página o en sus bundles JS.
 * 4. Pide la transcodificación progresiva (MP3) y obtiene la URL firmada del
 *    CDN.
 * 5. El backend reenvía ese audio con `Range`; no se guarda nada en disco.
 *
 * Si el scrape falla, se usa CloudSaver como respaldo.
 */

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CLIENT_ID_TTL_MS = 60 * 60 * 1000;
const STREAM_URL_TTL_MS = 10 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const RESOLVE_TIMEOUT_MS = 8_000;
const SCRIPT_TIMEOUT_MS = 4_000;
const CLIENT_ID_SCRAPE_BUDGET_MS = 12_000;

const CLOUDSAVER_API = 'https://www.cloudsaver.net/api/soundcloud';
const CLOUDSAVER_HEADERS: Record<string, string> = {
	origin: 'https://www.cloudsaver.net',
	referer: 'https://www.cloudsaver.net/en'
};

type SoundCloudTranscoding = {
	url?: string;
	preset?: string;
	format?: {
		protocol?: string;
		mime_type?: string;
	};
};

type SoundCloudTrack = {
	kind?: string;
	title?: string;
	duration?: number;
	artwork_url?: string | null;
	user?: {
		username?: string;
		avatar_url?: string | null;
	};
	media?: {
		transcodings?: SoundCloudTranscoding[];
	};
	track_authorization?: string;
};

export type ResolvedSoundCloudStream = {
	streamUrl: string;
	kind: 'progressive' | 'hls';
	title: string;
	author: string;
	artworkUrl: string | null;
	durationMs: number | null;
	/** Cabeceras que el CDN pueda necesitar al reenviar audio. */
	requestHeaders?: Record<string, string>;
};

let cachedClientId: { value: string; expiresAt: number } | null = null;
const streamCache = new Map<string, { value: ResolvedSoundCloudStream; expiresAt: number }>();
/** Evita martillear SoundCloud/CloudSaver cuando una pista no se puede resolver. */
const failureCache = new Map<string, number>();
/** Varios clientes pueden pedir la misma pista a la vez: comparten la promesa. */
const inflight = new Map<string, Promise<ResolvedSoundCloudStream | null>>();

function timeoutSignal(timeoutMs = RESOLVE_TIMEOUT_MS): {
	signal: AbortSignal;
	cancel: () => void;
} {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	return {
		signal: controller.signal,
		cancel: () => clearTimeout(timer)
	};
}

async function fetchText(
	url: string,
	accept = 'text/html,application/xhtml+xml',
	timeoutMs = RESOLVE_TIMEOUT_MS
): Promise<string | null> {
	const { signal, cancel } = timeoutSignal(timeoutMs);

	try {
		const response = await fetch(url, {
			signal,
			headers: {
				'user-agent': USER_AGENT,
				accept,
				'accept-language': 'en-US,en;q=0.9',
				'cache-control': 'no-cache'
			}
		});

		if (!response.ok) {
			return null;
		}

		return await response.text();
	} catch {
		return null;
	} finally {
		cancel();
	}
}

async function fetchJson(
	url: string,
	timeoutMs = RESOLVE_TIMEOUT_MS
): Promise<Record<string, unknown> | null> {
	const { signal, cancel } = timeoutSignal(timeoutMs);

	try {
		const response = await fetch(url, {
			signal,
			headers: {
				'user-agent': USER_AGENT,
				accept: 'application/json',
				'accept-language': 'en-US,en;q=0.9',
				origin: 'https://soundcloud.com',
				referer: 'https://soundcloud.com/'
			}
		});

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as unknown;

		return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
	} catch {
		return null;
	} finally {
		cancel();
	}
}

const CLIENT_ID_PATTERNS = [
	/client_id\s*[:=]\s*["']([A-Za-z0-9]{20,48})["']/g,
	/"client_id"\s*:\s*"([A-Za-z0-9]{20,48})"/g,
	/client_id=([A-Za-z0-9]{20,48})/g,
	/clientId\s*[:=]\s*["']([A-Za-z0-9]{20,48})["']/g
];

function extractClientIds(text: string): string[] {
	const found = new Set<string>();

	for (const pattern of CLIENT_ID_PATTERNS) {
		pattern.lastIndex = 0;

		for (const match of text.matchAll(pattern)) {
			if (match[1]) {
				found.add(match[1]);
			}
		}
	}

	return [...found].slice(0, 8);
}

function extractScriptUrls(html: string, base: string): string[] {
	const urls: string[] = [];

	for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
		try {
			const url = new URL(match[1], base);

			if (url.protocol === 'https:' || url.protocol === 'http:') {
				urls.push(url.href);
			}
		} catch {
			// Ignora scripts con URL inválida.
		}
	}

	return urls;
}

function rememberClientId(value: string): void {
	cachedClientId = {
		value,
		expiresAt: Date.now() + CLIENT_ID_TTL_MS
	};
}

/**
 * Busca el `client_id` en la página del track, la home y sus bundles JS.
 * Devuelve varios candidatos por si el primero es un falso positivo.
 */
async function scrapeClientIds(trackUrl: string, trackHtml: string): Promise<string[]> {
	const deadline = Date.now() + CLIENT_ID_SCRAPE_BUDGET_MS;
	const ids = new Set<string>(extractClientIds(trackHtml));
	const scriptUrls: string[] = extractScriptUrls(trackHtml, trackUrl);

	if (ids.size === 0) {
		for (const page of ['https://soundcloud.com/', 'https://soundcloud.com/discover']) {
			if (Date.now() > deadline) {
				break;
			}

			const html = await fetchText(page);

			if (!html) {
				continue;
			}

			for (const id of extractClientIds(html)) {
				ids.add(id);
			}

			scriptUrls.push(...extractScriptUrls(html, page));

			if (ids.size > 0) {
				break;
			}
		}
	}

	const uniqueScripts = [...new Set(scriptUrls)].slice(0, 20);

	for (let index = 0; index < uniqueScripts.length; index += 4) {
		if (ids.size > 0 || Date.now() > deadline) {
			break;
		}

		const batch = uniqueScripts.slice(index, index + 4);
		const results = await Promise.all(
			batch.map(async (scriptUrl) => {
				const source = await fetchText(scriptUrl, '*/*', SCRIPT_TIMEOUT_MS);

				return source ? extractClientIds(source) : [];
			})
		);

		for (const result of results) {
			for (const id of result) {
				ids.add(id);
			}
		}
	}

	return [...ids].slice(0, 8);
}

function pickProgressiveTranscoding(
	transcodings: SoundCloudTranscoding[]
): SoundCloudTranscoding | null {
	const progressive = transcodings.filter(
		(entry) => entry.format?.protocol === 'progressive' && typeof entry.url === 'string'
	);

	if (progressive.length === 0) {
		return null;
	}

	return (
		progressive.find((entry) => entry.format?.mime_type === 'audio/mpeg') ??
		progressive.find((entry) => entry.preset === 'mp3_0_1') ??
		progressive[0]
	);
}

function pickHlsTranscoding(transcodings: SoundCloudTranscoding[]): SoundCloudTranscoding | null {
	const hls = transcodings.filter(
		(entry) => entry.format?.protocol === 'hls' && typeof entry.url === 'string'
	);

	if (hls.length === 0) {
		return null;
	}

	return hls.find((entry) => entry.format?.mime_type === 'audio/mpeg') ?? hls[0];
}

function parseHydration(html: string): unknown[] | null {
	const match =
		html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/) ??
		html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/);

	if (!match) {
		return null;
	}

	try {
		const parsed = JSON.parse(match[1]) as unknown;

		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function findHydratedTrack(entries: unknown[]): SoundCloudTrack | null {
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}

		const record = entry as { hydratable?: unknown; data?: unknown };

		if (
			(record.hydratable === 'sound' || record.hydratable === 'track') &&
			record.data &&
			typeof record.data === 'object'
		) {
			return record.data as SoundCloudTrack;
		}
	}

	return null;
}

function resultFromTrack(
	track: SoundCloudTrack,
	streamUrl: string,
	kind: ResolvedSoundCloudStream['kind']
): ResolvedSoundCloudStream {
	const artwork = track.artwork_url ?? track.user?.avatar_url ?? null;

	return {
		streamUrl,
		kind,
		title: track.title?.trim() || 'SoundCloud track',
		author: track.user?.username?.trim() || 'SoundCloud',
		artworkUrl: artwork?.replace('-large', '-t500x500') ?? null,
		durationMs:
			typeof track.duration === 'number' && track.duration > 0
				? Math.round(track.duration)
				: null
	};
}

async function requestTranscoding(
	track: SoundCloudTrack,
	transcodingUrl: string,
	clientId: string
): Promise<string | null> {
	const url = new URL(transcodingUrl);
	url.searchParams.set('client_id', clientId);

	if (track.track_authorization) {
		url.searchParams.set('track_authorization', track.track_authorization);
	}

	const data = await fetchJson(url.href);

	if (typeof data?.url === 'string' && /^https?:\/\//i.test(data.url)) {
		return data.url;
	}

	return null;
}

/** Scraper principal: página del track + transcodificación progresiva. */
async function resolveFromTrackPage(
	trackUrl: string
): Promise<ResolvedSoundCloudStream | null> {
	const html = await fetchText(trackUrl);

	if (!html) {
		console.warn(`[club-stream] Track page fetch failed: ${trackUrl}`);
		return null;
	}

	const entries = parseHydration(html);
	const track = entries ? findHydratedTrack(entries) : null;

	if (!entries) {
		console.warn(`[club-stream] No __sc_hydration found on ${trackUrl}`);
		return null;
	}

	if (!track?.media?.transcodings?.length) {
		console.warn(`[club-stream] No track data/transcodings on ${trackUrl}`);
		return null;
	}

	const progressive = pickProgressiveTranscoding(track.media.transcodings);
	const hls = pickHlsTranscoding(track.media.transcodings);
	const transcoding = progressive ?? hls;

	if (!transcoding?.url) {
		console.warn(`[club-stream] No progressive or HLS transcoding for ${trackUrl}`);
		return null;
	}

	const kind: ResolvedSoundCloudStream['kind'] = progressive ? 'progressive' : 'hls';

	if (!progressive) {
		console.log(`[club-stream] Track only offers HLS, using HLS proxy: ${trackUrl}`);
	}

	const tried = new Set<string>();
	const configured = process.env.SOUNDCLOUD_CLIENT_ID?.trim();
	const cached =
		cachedClientId && cachedClientId.expiresAt > Date.now() ? cachedClientId.value : null;

	for (const clientId of [configured, cached]) {
		if (!clientId || tried.has(clientId)) {
			continue;
		}

		tried.add(clientId);
		const streamUrl = await requestTranscoding(track, transcoding.url, clientId);

		if (streamUrl) {
			rememberClientId(clientId);
			return resultFromTrack(track, streamUrl, kind);
		}
	}

	const scraped = await scrapeClientIds(trackUrl, html);

	if (scraped.length === 0) {
		console.warn(`[club-stream] No client_id found for ${trackUrl}`);
		return null;
	}

	for (const clientId of scraped) {
		if (tried.has(clientId)) {
			continue;
		}

		tried.add(clientId);
		const streamUrl = await requestTranscoding(track, transcoding.url, clientId);

		if (streamUrl) {
			rememberClientId(clientId);
			return resultFromTrack(track, streamUrl, kind);
		}
	}

	console.warn(
		`[club-stream] None of ${tried.size} client_id candidates worked for ${trackUrl}`
	);
	return null;
}

/* ------------------------------------------------------------------ */
/* Respaldo: CloudSaver                                                */
/* ------------------------------------------------------------------ */

type UrlCandidate = { url: string; path: string };

function collectUrlCandidates(
	value: unknown,
	path: string,
	out: UrlCandidate[],
	depth = 0
): void {
	if (depth > 6 || out.length >= 60) {
		return;
	}

	if (typeof value === 'string') {
		const cleaned = value.trim().replace(/\\\//g, '/').replace(/&amp;/g, '&');
		const matches = cleaned.match(/https?:\/\/[^\s"'<>]+/gi);

		if (matches) {
			for (const match of matches) {
				const url = match.replace(/[),.;]+$/, '');

				if (/^https?:\/\//i.test(url)) {
					out.push({ url, path });
				}
			}
		}

		return;
	}

	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			collectUrlCandidates(entry, `${path}[${index}]`, out, depth + 1);
		}

		return;
	}

	if (value && typeof value === 'object') {
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			collectUrlCandidates(entry, path ? `${path}.${key}` : key, out, depth + 1);
		}
	}
}

function isHlsUrl(url: string): boolean {
	return /\.m3u8(\?|$)/i.test(url) || /\/hls(\/|\?|$)/i.test(url);
}

function scoreUrlCandidate(candidate: UrlCandidate): number {
	const url = candidate.url.toLowerCase();
	const path = candidate.path.toLowerCase();
	const haystack = `${url} ${path}`;
	let score = 0;

	if (/\.m3u8(\?|$)/.test(url)) score += 200;
	if (/\/hls(\/|\?|$)/.test(url)) score += 120;
	if (/\.mp3(\?|$)/.test(url)) score += 100;
	if (/audio|mpeg|m4a|aac/.test(url)) score += 50;
	if (/sndcdn|soundcloud|cf-media|media-streaming/.test(url)) score += 40;
	if (/download|stream|audio|mp3|media|url|link/.test(path)) score += 30;
	if (/artwork|cover|image|thumb|avatar|jpg|jpeg|png|webp|gif/.test(haystack)) score -= 150;
	if (/cloudsaver\.net/.test(url)) score -= 80;
	if (/soundcloud\.com\//.test(url)) score -= 60;

	return score;
}

async function probeAudioUrl(url: string, headers: Record<string, string>): Promise<boolean> {
	const { signal, cancel } = timeoutSignal();

	try {
		const response = await fetch(url, {
			signal,
			headers: { ...headers, range: 'bytes=0-1' }
		});
		const type = (response.headers.get('content-type') ?? '').toLowerCase();
		const looksLikeAudio = /\.(mp3|m4a|aac)(\?|$)/i.test(url);
		const playable =
			(response.status === 200 || response.status === 206) &&
			(type.startsWith('audio/') ||
				type.includes('mpeg') ||
				type.includes('octet-stream') ||
				(type === '' && looksLikeAudio));

		if (response.body) {
			await response.body.cancel().catch(() => {});
		}

		return playable;
	} catch {
		return false;
	} finally {
		cancel();
	}
}

/**
 * Comprueba que una URL HLS devuelve una playlist válida. El CDN responde con
 * `application/vnd.apple.mpegurl` o, a veces, como texto plano; en ambos casos
 * debe empezar por `#EXTM3U`.
 */
async function probeHlsPlaylist(url: string, headers: Record<string, string>): Promise<boolean> {
	const { signal, cancel } = timeoutSignal();

	try {
		const response = await fetch(url, { signal, headers: { ...headers, accept: '*/*' } });

		if (!response.ok) {
			return false;
		}

		const type = (response.headers.get('content-type') ?? '').toLowerCase();

		if (type.includes('mpegurl') || type.includes('vnd.apple')) {
			if (response.body) {
				await response.body.cancel().catch(() => {});
			}

			return true;
		}

		const text = await response.text();

		return text.trimStart().startsWith('#EXTM3U');
	} catch {
		return false;
	} finally {
		cancel();
	}
}

function findStringField(value: unknown, keys: Set<string>, depth = 0): string | null {	if (depth > 6 || !value) {
		return null;
	}

	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = findStringField(entry, keys, depth + 1);

			if (found) {
				return found;
			}
		}

		return null;
	}

	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;

		for (const [key, entry] of Object.entries(record)) {
			if (keys.has(key.toLowerCase()) && typeof entry === 'string' && entry.trim()) {
				return entry.trim();
			}
		}

		for (const entry of Object.values(record)) {
			const found = findStringField(entry, keys, depth + 1);

			if (found) {
				return found;
			}
		}
	}

	return null;
}

function findNumberField(value: unknown, keys: Set<string>, depth = 0): number | null {
	if (depth > 6 || !value) {
		return null;
	}

	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = findNumberField(entry, keys, depth + 1);

			if (found !== null) {
				return found;
			}
		}

		return null;
	}

	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;

		for (const [key, entry] of Object.entries(record)) {
			if (!keys.has(key.toLowerCase())) {
				continue;
			}

			const number = typeof entry === 'number' ? entry : Number(entry);

			if (Number.isFinite(number) && number > 0) {
				return number;
			}
		}

		for (const entry of Object.values(record)) {
			const found = findNumberField(entry, keys, depth + 1);

			if (found !== null) {
				return found;
			}
		}
	}

	return null;
}

async function resolveViaCloudSaver(
	trackUrl: string
): Promise<ResolvedSoundCloudStream | null> {
	const { signal, cancel } = timeoutSignal();
	let payload: unknown;

	try {
		const response = await fetch(CLOUDSAVER_API, {
			method: 'POST',
			signal,
			headers: {
				'user-agent': USER_AGENT,
				accept: '*/*',
				'accept-language': 'en-US,en;q=0.7',
				'content-type': 'application/json',
				...CLOUDSAVER_HEADERS
			},
			body: JSON.stringify({ url: trackUrl })
		});

		if (!response.ok) {
			console.warn(`[club-stream] CloudSaver responded ${response.status} for ${trackUrl}`);
			return null;
		}

		// Si la API redirige directamente al MP3, el destino ya es la URL buena.
		if (response.redirected && response.url) {
			const type = (response.headers.get('content-type') ?? '').toLowerCase();

			if (
				type.startsWith('audio/') ||
				type.includes('mpeg') ||
				type.includes('octet-stream')
			) {
				if (response.body) {
					await response.body.cancel().catch(() => {});
				}

				return {
					streamUrl: response.url,
					kind: 'progressive',
					title: 'SoundCloud track',
					author: 'SoundCloud',
					artworkUrl: null,
					durationMs: null,
					requestHeaders: CLOUDSAVER_HEADERS
				};
			}
		}

		const text = await response.text();

		try {
			payload = JSON.parse(text) as unknown;
		} catch {
			payload = text;
		}
	} catch {
		console.warn(`[club-stream] CloudSaver request failed for ${trackUrl}`);
		return null;
	} finally {
		cancel();
	}

	const found: UrlCandidate[] = [];
	collectUrlCandidates(payload, '', found);

	if (found.length === 0) {
		console.warn(`[club-stream] CloudSaver returned no URLs for ${trackUrl}`);
		return null;
	}

	const candidates = new Map<string, UrlCandidate>();

	for (const candidate of found) {
		if (!candidates.has(candidate.url)) {
			candidates.set(candidate.url, candidate);
		}
	}

	const ordered = [...candidates.values()]
		.sort((a, b) => scoreUrlCandidate(b) - scoreUrlCandidate(a))
		.slice(0, 8);

	for (const candidate of ordered) {
		if (scoreUrlCandidate(candidate) < 0) {
			continue;
		}

		const kind: ResolvedSoundCloudStream['kind'] = isHlsUrl(candidate.url)
			? 'hls'
			: 'progressive';
		const playable =
			kind === 'hls'
				? await probeHlsPlaylist(candidate.url, CLOUDSAVER_HEADERS)
				: await probeAudioUrl(candidate.url, CLOUDSAVER_HEADERS);

		if (!playable) {
			continue;
		}

		const rawDuration = findNumberField(
			payload,
			new Set(['duration', 'duration_ms', 'durationms', 'length'])
		);
		const durationMs =
			rawDuration === null
				? null
				: rawDuration < 10_000
					? Math.round(rawDuration * 1000)
					: Math.round(rawDuration);
		const artwork = findStringField(
			payload,
			new Set(['artwork', 'artwork_url', 'thumbnail', 'thumb', 'cover', 'image', 'picture'])
		);
		const artworkUrl =
			artwork && /^https?:\/\//i.test(artwork) && !/\.(mp3|m4a|aac)(\?|$)/i.test(artwork)
				? artwork.replace('-large', '-t500x500')
				: null;

		return {
			streamUrl: candidate.url,
			kind,
			title:
				findStringField(payload, new Set(['title', 'track', 'name', 'filename', 'song'])) ??
				'SoundCloud track',
			author:
				findStringField(
					payload,
					new Set(['author', 'artist', 'username', 'uploader', 'channel'])
				) ?? 'SoundCloud',
			artworkUrl,
			durationMs,
			requestHeaders: CLOUDSAVER_HEADERS
		};
	}

	console.warn(`[club-stream] CloudSaver returned no playable audio for ${trackUrl}`);
	return null;
}

export async function resolveSoundCloudStream(
	trackUrl: string
): Promise<ResolvedSoundCloudStream | null> {
	const canonical = normalizeSoundCloudUrl(trackUrl);

	if (!canonical) {
		return null;
	}

	const cached = streamCache.get(canonical);

	if (cached && cached.expiresAt > Date.now()) {
		return cached.value;
	}

	const failedUntil = failureCache.get(canonical);

	if (failedUntil && failedUntil > Date.now()) {
		return null;
	}

	const pending = inflight.get(canonical);

	if (pending) {
		return pending;
	}

	const promise = resolveUncached(canonical);
	inflight.set(canonical, promise);

	try {
		return await promise;
	} finally {
		inflight.delete(canonical);
	}
}

async function resolveUncached(
	canonical: string
): Promise<ResolvedSoundCloudStream | null> {
	const scraped = await resolveFromTrackPage(canonical);
	const resolved = scraped ?? (await resolveViaCloudSaver(canonical));

	if (!resolved) {
		failureCache.set(canonical, Date.now() + FAILURE_TTL_MS);
		console.warn(`[club-stream] Could not resolve audio for ${canonical}`);
		return null;
	}

	if (!scraped) {
		console.log(`[club-stream] Resolved via CloudSaver: ${canonical}`);
	} else {
		console.log(`[club-stream] Resolved from track page: ${canonical}`);
	}

	failureCache.delete(canonical);
	streamCache.set(canonical, {
		value: resolved,
		expiresAt: Date.now() + STREAM_URL_TTL_MS
	});

	return resolved;
}

function corsHeaders(): Headers {
	const headers = new Headers();
	headers.set('access-control-allow-origin', '*');
	headers.set('access-control-expose-headers', 'Content-Length, Content-Range, Accept-Ranges');
	headers.set('cache-control', 'no-store');
	return headers;
}

/**
 * Reenvía el audio al cliente respetando `Range`. Así el `<audio>` puede
 * buscar dentro de la pista y el servidor no descarga el archivo completo
 * antes de empezar a sonar.
 */
export async function proxySoundCloudAudio(
	trackUrl: string,
	range: string | null
): Promise<Response> {
	const resolved = await resolveSoundCloudStream(trackUrl);

	if (!resolved) {
		return unavailable();
	}

	// HLS no se puede entregar como un único MP3: el cliente debe usar
	// `/club/source` y reproducirlo con hls.js a través de `/club/hls`.
	if (resolved.kind === 'hls') {
		const headers = corsHeaders();
		headers.set('content-type', 'application/json');
		return new Response(
			JSON.stringify({ error: 'SOUNDCLOUD_STREAM_IS_HLS', hint: 'Use /club/source and /club/hls' }),
			{ status: 404, headers }
		);
	}

	async function fetchUpstream(
		streamUrl: string,
		extraHeaders?: Record<string, string>
	): Promise<Response | null> {
		const headers: Record<string, string> = {
			'user-agent': USER_AGENT,
			accept: '*/*',
			...extraHeaders
		};

		if (range) {
			headers.range = range;
		}

		// Timeout solo hasta recibir cabeceras: una vez empieza el cuerpo no
		// se aborta para no cortar la reproducción.
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

		try {
			return await fetch(streamUrl, { headers, signal: controller.signal });
		} catch {
			return null;
		} finally {
			clearTimeout(timer);
		}
	}

	function unavailable(status = 404): Response {
		const headers = corsHeaders();
		headers.set('content-type', 'application/json');
		return new Response(JSON.stringify({ error: 'SOUNDCLOUD_STREAM_UNAVAILABLE' }), {
			status,
			headers
		});
	}

	function isAudioResponse(response: Response): boolean {
		const type = (response.headers.get('content-type') ?? '').toLowerCase();

		return (
			type === '' ||
			type.startsWith('audio/') ||
			type.includes('mpeg') ||
			type.includes('octet-stream') ||
			type.includes('mp4')
		);
	}

	let upstream = await fetchUpstream(resolved.streamUrl, resolved.requestHeaders);

	// La URL del CDN puede caducar. Se vuelve a resolver una vez y se reintenta.
	if (!upstream || !upstream.ok || !isAudioResponse(upstream)) {
		const canonical = normalizeSoundCloudUrl(trackUrl);

		if (canonical) {
			streamCache.delete(canonical);
			failureCache.delete(canonical);
		}

		const retried = await resolveSoundCloudStream(trackUrl);

		if (retried && retried.kind === 'progressive') {
			const retryResponse = await fetchUpstream(retried.streamUrl, retried.requestHeaders);

			if (retryResponse && retryResponse.ok && isAudioResponse(retryResponse)) {
				upstream = retryResponse;
			}
		}
	}

	if (!upstream) {
		return unavailable(502);
	}

	if (!upstream.ok) {
		const headers = corsHeaders();
		return new Response('Stream unavailable', { status: upstream.status, headers });
	}

	const headers = corsHeaders();

	for (const name of [
		'content-type',
		'content-length',
		'content-range',
		'accept-ranges',
		'etag',
		'last-modified'
	]) {
		const value = upstream.headers.get(name);

		if (value) {
			headers.set(name, value);
		}
	}

	if (!headers.has('content-type')) {
		headers.set('content-type', 'audio/mpeg');
	}

	if (!headers.has('accept-ranges')) {
		headers.set('accept-ranges', 'bytes');
	}

	return new Response(upstream.body, {
		status: upstream.status,
		headers
	});
}
