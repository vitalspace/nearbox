import type { ClubMusicSnapshot, ClubTrack } from './protocol';

/**
 * Jukebox compartido del club.
 *
 * El servidor es la única fuente de verdad: guarda la cola, la pista actual,
 * si está sonando y en qué segundo va. Cada cliente reproduce el mismo track
 * de SoundCloud en su iframe y corrige la deriva contra este estado.
 */

export const CLUB_MUSIC_MAX_TRACKS = 40;
export const CLUB_MUSIC_ADD_COOLDOWN_MS = 1500;
export const CLUB_MUSIC_COMMAND_COOLDOWN_MS = 350;
export const CLUB_MUSIC_MAX_URL_LENGTH = 512;

const SOUNDCLOUD_HOSTS = new Set([
	'soundcloud.com',
	'www.soundcloud.com',
	'm.soundcloud.com',
	'on.soundcloud.com'
]);

type ClubMusicResult = { ok: true } | { ok: false; code: string; message: string };
type ClubMusicAddResult =
	| { ok: true; track: ClubTrack }
	| { ok: false; code: string; message: string };

type ClubMusicOptions = {
	onChange: () => void;
	log?: (event: string, data?: Record<string, unknown>) => void;
};

/** Acepta enlaces de pista de SoundCloud y devuelve una URL canónica. */
export function normalizeSoundCloudUrl(raw: string): string | null {
	const trimmed = raw.trim();

	if (trimmed.length === 0 || trimmed.length > CLUB_MUSIC_MAX_URL_LENGTH) {
		return null;
	}

	let parsed: URL;

	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}

	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		return null;
	}

	const host = parsed.hostname.toLowerCase();

	if (!SOUNDCLOUD_HOSTS.has(host)) {
		return null;
	}

	if (parsed.pathname === '' || parsed.pathname === '/' || parsed.pathname.startsWith('/player')) {
		return null;
	}

	const pathname = parsed.pathname.replace(/\/+$/, '');

	if (pathname.length === 0) {
		return null;
	}

	const canonicalHost =
		host === 'www.soundcloud.com' || host === 'm.soundcloud.com' ? 'soundcloud.com' : host;

	return `https://${canonicalHost}${pathname}`;
}

export function isSoundCloudUrl(raw: string): boolean {
	return normalizeSoundCloudUrl(raw) !== null;
}

function fallbackMetadata(url: string): { title: string; author: string } {
	try {
		const segments = new URL(url).pathname
			.split('/')
			.filter(Boolean)
			.map((segment) => decodeURIComponent(segment));
		const slug = segments[segments.length - 1] ?? 'SoundCloud track';
		const author = segments.length > 1 ? segments[0] : 'SoundCloud';
		const humanize = (value: string) =>
			value
				.replace(/[-_]+/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.replace(/\b\w/g, (char) => char.toUpperCase());

		return {
			title: humanize(slug).slice(0, 120) || 'SoundCloud track',
			author: humanize(author).slice(0, 60) || 'SoundCloud'
		};
	} catch {
		return { title: 'SoundCloud track', author: 'SoundCloud' };
	}
}

export class ClubMusic {
	private tracks: ClubTrack[] = [];
	private currentId: string | null = null;
	private playing = false;
	private position = 0;
	private updatedAt = Date.now();
	private version = 0;
	private lastAddAt = new Map<string, number>();
	private lastCommandAt = new Map<string, number>();
	private readonly onChange: () => void;
	private readonly log?: (event: string, data?: Record<string, unknown>) => void;

	constructor(options: ClubMusicOptions) {
		this.onChange = options.onChange;
		this.log = options.log;
	}

	snapshot(now = Date.now()): ClubMusicSnapshot {
		const position =
			this.playing && this.currentId
				? this.position + Math.max(0, now - this.updatedAt) / 1000
				: this.position;

		return {
			tracks: this.tracks.map((track) => ({ ...track })),
			currentId: this.currentId,
			playing: this.playing,
			position,
			serverTime: now,
			version: this.version
		};
	}

	/** Límite compartido para play/pause/skip/select/remove. */
	allowCommand(playerId: string, now = Date.now()): boolean {
		return this.cooldown(
			this.lastCommandAt,
			playerId,
			now,
			CLUB_MUSIC_COMMAND_COOLDOWN_MS
		);
	}

	add(
		playerId: string,
		playerName: string,
		rawUrl: string,
		now = Date.now()
	): ClubMusicAddResult {
		if (!this.cooldown(this.lastAddAt, playerId, now, CLUB_MUSIC_ADD_COOLDOWN_MS)) {
			return {
				ok: false,
				code: 'CLUB_MUSIC_RATE_LIMIT',
				message: 'Wait a moment before adding another track'
			};
		}

		const url = normalizeSoundCloudUrl(rawUrl);

		if (!url) {
			return {
				ok: false,
				code: 'CLUB_MUSIC_INVALID_URL',
				message: 'Paste a public SoundCloud track link'
			};
		}

		if (this.tracks.length >= CLUB_MUSIC_MAX_TRACKS) {
			return {
				ok: false,
				code: 'CLUB_MUSIC_FULL',
				message: `The queue is full (${CLUB_MUSIC_MAX_TRACKS} tracks)`
			};
		}

		if (this.tracks.some((track) => track.url === url)) {
			return {
				ok: false,
				code: 'CLUB_MUSIC_DUPLICATE',
				message: 'That track is already in the queue'
			};
		}

		const metadata = fallbackMetadata(url);
		const track: ClubTrack = {
			id: crypto.randomUUID(),
			url,
			title: metadata.title,
			author: metadata.author,
			artworkUrl: null,
			durationMs: null,
			addedBy: playerName,
			addedAt: now
		};

		this.tracks.push(track);

		if (!this.currentId) {
			this.currentId = track.id;
			this.position = 0;
			this.playing = true;
			this.updatedAt = now;
		}

		this.touch(now);
		this.log?.('club-music-add', { playerId, trackId: track.id, url });
		void this.resolveMetadata(track.id, url);

		return { ok: true, track };
	}

	remove(trackId: string, now = Date.now()): ClubMusicResult {
		const index = this.tracks.findIndex((track) => track.id === trackId);

		if (index < 0) {
			return { ok: false, code: 'CLUB_MUSIC_NOT_FOUND', message: 'That track is no longer in the queue' };
		}

		const wasCurrent = this.currentId === trackId;
		this.tracks.splice(index, 1);

		if (wasCurrent) {
			if (this.tracks.length === 0) {
				this.currentId = null;
				this.playing = false;
				this.position = 0;
				this.updatedAt = now;
			} else {
				const nextIndex = Math.min(index, this.tracks.length - 1);
				this.currentId = this.tracks[nextIndex].id;
				this.position = 0;
				this.updatedAt = now;
			}
		}

		this.touch(now);
		return { ok: true };
	}

	select(trackId: string, now = Date.now()): ClubMusicResult {
		if (!this.tracks.some((track) => track.id === trackId)) {
			return { ok: false, code: 'CLUB_MUSIC_NOT_FOUND', message: 'That track is no longer in the queue' };
		}

		this.currentId = trackId;
		this.position = 0;
		this.playing = true;
		this.updatedAt = now;
		this.touch(now);
		return { ok: true };
	}

	play(now = Date.now()): ClubMusicResult {
		if (!this.currentId && this.tracks.length > 0) {
			this.currentId = this.tracks[0].id;
			this.position = 0;
			this.updatedAt = now;
		}

		if (!this.currentId) {
			return { ok: false, code: 'CLUB_MUSIC_EMPTY', message: 'The queue is empty' };
		}

		if (!this.playing) {
			this.playing = true;
			this.updatedAt = now;
			this.touch(now);
		}

		return { ok: true };
	}

	pause(now = Date.now()): ClubMusicResult {
		if (!this.currentId) {
			return { ok: false, code: 'CLUB_MUSIC_EMPTY', message: 'Nothing is playing' };
		}

		if (this.playing) {
			this.position += Math.max(0, now - this.updatedAt) / 1000;
			this.playing = false;
			this.updatedAt = now;
			this.touch(now);
		}

		return { ok: true };
	}

	skip(direction: 1 | -1, now = Date.now()): ClubMusicResult {
		if (this.tracks.length === 0) {
			return { ok: false, code: 'CLUB_MUSIC_EMPTY', message: 'The queue is empty' };
		}

		const currentIndex = Math.max(
			0,
			this.tracks.findIndex((track) => track.id === this.currentId)
		);
		const nextIndex = (currentIndex + direction + this.tracks.length) % this.tracks.length;

		this.currentId = this.tracks[nextIndex].id;
		this.position = 0;
		this.playing = true;
		this.updatedAt = now;
		this.touch(now);
		return { ok: true };
	}

	/**
	 * Un cliente avisa de que la pista terminó. Solo avanza si sigue siendo la
	 * pista y la versión que ese cliente estaba reproduciendo: así varios
	 * clientes pueden avisar sin saltarse canciones de más.
	 */
	ended(trackId: string, version: number, now = Date.now()): boolean {
		if (this.currentId !== trackId || this.version !== version) {
			return false;
		}

		this.skip(1, now);
		return true;
	}

	/** Metadatos de duración reportados por el widget de SoundCloud. */
	setDuration(trackId: string, durationMs: number, now = Date.now()): void {
		const track = this.tracks.find((entry) => entry.id === trackId);

		if (!track) {
			return;
		}

		const clamped = Math.min(3_600_000, Math.max(1_000, Math.round(durationMs)));

		// SoundCloud only reports one stable duration per track. Ignore later
		// reports so a client cannot spam version bumps.
		if (track.durationMs !== null) {
			return;
		}

		track.durationMs = clamped;
		this.touch(now);
	}

	private cooldown(
		map: Map<string, number>,
		playerId: string,
		now: number,
		minimumMs: number
	): boolean {
		const last = map.get(playerId) ?? 0;

		if (now - last < minimumMs) {
			return false;
		}

		map.set(playerId, now);
		return true;
	}

	/**
	 * Acumula en `position` el tiempo reproducido desde `updatedAt`.
	 *
	 * Sin esto, cualquier `touch()` mientras suena una pista (añadir otra,
	 * reportar duración, resolver metadatos) reiniciaba la referencia temporal
	 * y el snapshot salía con la posición a cero, haciendo que todos los
	 * clientes rebobinaran la canción actual.
	 */
	private advance(now: number): void {
		if (this.playing && this.currentId) {
			this.position += Math.max(0, now - this.updatedAt) / 1000;
		}

		this.updatedAt = now;
	}

	private touch(now: number): void {
		this.advance(now);
		this.version += 1;
		this.onChange();
	}

	private async resolveMetadata(trackId: string, url: string): Promise<void> {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 4000);
			const response = await fetch(
				`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
				{ signal: controller.signal }
			);
			clearTimeout(timer);

			if (!response.ok) {
				return;
			}

			const data: unknown = await response.json();

			if (typeof data !== 'object' || data === null) {
				return;
			}

			const record = data as Record<string, unknown>;
			const track = this.tracks.find((entry) => entry.id === trackId);

			if (!track) {
				return;
			}

			let changed = false;

			if (typeof record.title === 'string' && record.title.trim().length > 0) {
				track.title = record.title.trim().slice(0, 120);
				changed = true;
			}

			if (typeof record.author_name === 'string' && record.author_name.trim().length > 0) {
				track.author = record.author_name.trim().slice(0, 60);
				changed = true;
			}

			if (
				typeof record.thumbnail_url === 'string' &&
				record.thumbnail_url.startsWith('https://')
			) {
				track.artworkUrl = record.thumbnail_url.slice(0, 500);
				changed = true;
			}

			if (changed) {
				this.touch(Date.now());
			}
		} catch {
			// Sin red o SoundCloud caído: la cola sigue funcionando con el slug.
		}
	}
}
