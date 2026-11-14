import { normalizeSoundCloudUrl } from './clubMusic';

/**
 * Proxy HLS para el jukebox.
 *
 * CloudSaver devuelve una playlist firmada (`playlist.m3u8`) en lugar de un
 * MP3 progresivo. Chrome/Brave no reproducen HLS de forma nativa, así que el
 * cliente usa `hls.js`; este proxy reenvía la playlist y sus segmentos y
 * reescribe todas las URLs para que sigan pasando por el backend. No se guarda
 * nada en disco.
 */

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UPSTREAM_TIMEOUT_MS = 8_000;

/** Solo se reenvían medios de los CDN de SoundCloud. */
const ALLOWED_HOST_SUFFIXES = ['soundcloud.cloud', 'sndcdn.com', 'soundcloud.com'];

function isAllowedHost(hostname: string): boolean {
	const host = hostname.toLowerCase();

	return ALLOWED_HOST_SUFFIXES.some(
		(suffix) => host === suffix || host.endsWith(`.${suffix}`)
	);
}

function corsHeaders(): Headers {
	const headers = new Headers();
	headers.set('access-control-allow-origin', '*');
	headers.set('access-control-expose-headers', 'Content-Length, Content-Range, Accept-Ranges');
	headers.set('cache-control', 'no-store');
	return headers;
}

function errorResponse(status: number, code: string): Response {
	const headers = corsHeaders();
	headers.set('content-type', 'application/json');
	return new Response(JSON.stringify({ error: code }), { status, headers });
}

/** Envuelve una URL de medio para que vuelva a pasar por este proxy. */
function proxyAssetUrl(absoluteUrl: string): string {
	return `/club/hls?url=${encodeURIComponent(absoluteUrl)}`;
}

function resolveAssetUrl(value: string, baseUrl: string): string {
	try {
		return new URL(value, baseUrl).href;
	} catch {
		return value;
	}
}

/**
 * Reescribe una playlist HLS:
 * - líneas de segmentos/variantes → `/club/hls?url=…`
 * - atributos `URI="…"` (claves, init segments, subtítulos) → igual
 *
 * Las URLs relativas se resuelven contra la playlist original.
 */
export function rewriteHlsPlaylist(text: string, baseUrl: string): string {
	const lines = text.split(/\r?\n/);

	const rewritten = lines.map((line) => {
		const trimmed = line.trim();

		if (!trimmed) {
			return line;
		}

		if (trimmed.startsWith('#')) {
			return line.replace(/URI="([^"]*)"/g, (_match, uri: string) => {
				const absolute = resolveAssetUrl(uri, baseUrl);
				return `URI="${proxyAssetUrl(absolute)}"`;
			});
		}

		return proxyAssetUrl(resolveAssetUrl(trimmed, baseUrl));
	});

	return rewritten.join('\n');
}

async function fetchUpstream(target: string): Promise<Response | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

	try {
		return await fetch(target, {
			signal: controller.signal,
			headers: {
				'user-agent': USER_AGENT,
				accept: '*/*',
				'accept-language': 'en-US,en;q=0.9',
				'cache-control': 'no-cache'
			}
		});
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

function isPlaylistResponse(contentType: string, url: URL): boolean {
	const type = contentType.toLowerCase();

	return (
		type.includes('mpegurl') ||
		type.includes('vnd.apple') ||
		url.pathname.toLowerCase().endsWith('.m3u8')
	);
}

export async function proxyHlsAsset(rawUrl: string): Promise<Response> {
	let target: URL;

	try {
		target = new URL(rawUrl);
	} catch {
		return errorResponse(400, 'CLUB_HLS_INVALID_URL');
	}

	if (target.protocol !== 'https:' && target.protocol !== 'http:') {
		return errorResponse(400, 'CLUB_HLS_INVALID_URL');
	}

	if (!isAllowedHost(target.hostname)) {
		return errorResponse(403, 'CLUB_HLS_HOST_NOT_ALLOWED');
	}

	const upstream = await fetchUpstream(target.href);

	if (!upstream) {
		return errorResponse(502, 'CLUB_HLS_UPSTREAM_UNREACHABLE');
	}

	if (!upstream.ok) {
		return errorResponse(upstream.status, 'CLUB_HLS_UPSTREAM_ERROR');
	}

	const contentType = upstream.headers.get('content-type') ?? '';

	if (isPlaylistResponse(contentType, target)) {
		const text = await upstream.text();

		if (!text.trimStart().startsWith('#EXTM3U')) {
			const headers = corsHeaders();
			headers.set('content-type', contentType || 'text/plain');
			return new Response(text, { status: 200, headers });
		}

		// Si el CDN redirigió, las rutas relativas se resuelven contra la URL final.
		const baseUrl = upstream.url || target.href;
		const headers = corsHeaders();
		headers.set('content-type', 'application/vnd.apple.mpegurl');

		return new Response(rewriteHlsPlaylist(text, baseUrl), { status: 200, headers });
	}

	// Segmentos de audio, init segments o claves: se reenvían tal cual.
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
		headers.set('content-type', 'application/octet-stream');
	}

	return new Response(upstream.body, { status: upstream.status, headers });
}

/**
 * Resuelve la URL de un enlace de SoundCloud y devuelve la fuente lista para
 * el cliente: `/club/stream` para MP3 progresivo o `/club/hls` para HLS.
 */
export function toClientSource(
	resolved: { kind: 'progressive' | 'hls'; streamUrl: string },
	trackUrl: string
): { kind: 'progressive' | 'hls'; src: string } {
	if (resolved.kind === 'hls') {
		return { kind: 'hls', src: proxyAssetUrl(resolved.streamUrl) };
	}

	const canonical = normalizeSoundCloudUrl(trackUrl) ?? trackUrl;

	return { kind: 'progressive', src: `/club/stream?url=${encodeURIComponent(canonical)}` };
}
