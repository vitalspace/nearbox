import { Elysia } from 'elysia';
import { ByteBudget } from './server/budget';
import { ClubMusic, normalizeSoundCloudUrl } from './server/clubMusic';
import {
	addChatMessage,
	CHAT_MAX_LENGTH,
	checkChatRateLimit,
	clearChatRateLimit,
	createChatMessage,
	getChatHistory,
	parseChatCommand,
	sanitizeChatText,
	SYSTEM_PLAYER_ID,
	SYSTEM_PLAYER_NAME
} from './server/chat';
import { Cars } from './server/engines/cars';
import { Balloon } from './server/engines/balloon';
import { Npcs } from './server/engines/npcs';
import { Deathmatch } from './server/engines/deathmatch';
import { Crypt } from './server/engines/minigame2';
import { PaperRolls } from './server/engines/paperRolls';
import { Parkour } from './server/engines/parkour';
import { Royale } from './server/engines/royale';
import { Presence } from './server/engines/presence';
import { Race } from './server/engines/race';
import { trackForRoomType } from './server/engines/raceTracks';
import { Waves } from './server/engines/waves';
import type { RoomPort } from './server/port';
import {
	type ChatMessage,
	type HeroAnimation,
	type LobbyId,
	type LobbyPhase,
	type LobbyStatus,
	type MinigameLobbyId,
	MINIGAME_LOBBY_IDS,
	type Player,
	type ServerMessage
} from './server/protocol';
import { DM_MAX_PLAYERS } from './lib/state/dmConfig';
import { PARKOUR_MAX_PLAYERS } from './lib/state/parkourConfig';
import { ROYALE_MAX_PLAYERS } from './lib/state/royaleConfig';
import { WAVES_MAX_PLAYERS } from './lib/state/wavesConfig';
import { parseClientMessage } from './server/validate';
import { bindSession, clearSession } from './server/identity';
import { proxySoundCloudAudio, resolveSoundCloudStream } from './server/soundcloudStream';
import { proxyHlsAsset, toClientSource } from './server/hlsProxy';
import { relayerRoutes } from './routes/relayer';
import { statsRoutes } from './routes/stats';
import { progressionRoutes } from './routes/progression';
import { rewardsRoutes } from './routes/rewards';
import { closeMongo, ensureMongo } from './db/mongo';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const GLOBAL_TOPIC = 'lobby:global';
const JOIN_TIMEOUT_MS = 10_000;
const POSITION_MIN_INTERVAL_MS = 60;
const MAX_POSITION_COORD = 1000;

const TOPIC_BY_LOBBY: Partial<Record<LobbyId, string>> = {
	'minigame-2': 'lobby:minigame-2',
	'minigame-3': 'lobby:minigame-3',
	'minigame-4': 'lobby:minigame-4',
	'minigame-5': 'lobby:minigame-5',
	'minigame-6': 'lobby:minigame-6',
	'minigame-7': 'lobby:minigame-7',
	'minigame-8': 'lobby:minigame-8'
};

type SendableSocket = {
	send(data: string): unknown;
	close(code?: number, reason?: string): unknown;
};

type RoomSocket = SendableSocket & {
	unsubscribe(topic: string): unknown;
	subscribe(topic: string): unknown;
};

const joinTimers = new Map<string, ReturnType<typeof setTimeout>>();
const sockets = new Map<string, RoomSocket>();
const lastPositionAt = new Map<string, number>();

const presence = new Presence();
const budget = new ByteBudget({
	warn(message, data) {
		console.warn(`[ws] ${message}`, data ?? {});
	}
});

/** Set once Elysia is listening; engines only publish at runtime. */
let publish: (topic: string, message: string) => void = () => {};

function sendMessage(ws: SendableSocket, message: ServerMessage) {
	ws.send(JSON.stringify(message));
}

function sendError(ws: SendableSocket, code: string, message: string) {
	sendMessage(ws, { type: 'error', code, message });
}

function logEvent(event: string, data: Record<string, unknown> = {}) {
	console.log(`[ws] ${event}`, data);
}

function sanitizeName(name: string | undefined, id: string): string {
	const cleaned = (name ?? '')
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 24);

	if (cleaned.length > 0) {
		return cleaned;
	}

	const suffix = id
		.replace(/[^a-zA-Z0-9]/g, '')
		.slice(0, 4)
		.toUpperCase();

	return `Player-${suffix || '0000'}`;
}

function makePort(topic: string): RoomPort {
	return {
		broadcast(message) {
			budget.check(message);
			publish(topic, JSON.stringify(message));
		},
		sendTo(playerId, message) {
			const socket = sockets.get(playerId);

			if (socket) {
				sendMessage(socket, message as ServerMessage);
			}
		}
	};
}

const lobbyPort = makePort(GLOBAL_TOPIC);
const clubMusic = new ClubMusic({
	onChange: () => broadcastClubMusic(),
	log: logEvent
});

function broadcastClubMusic(): void {
	publish(
		GLOBAL_TOPIC,
		JSON.stringify({
			type: 'club-music-state',
			state: clubMusic.snapshot()
		} satisfies ServerMessage)
	);
}
const cryptPort = makePort('lobby:minigame-2');
const racePort = makePort('lobby:minigame-3');
const roadmapPort = makePort('lobby:minigame-4');
const wavesPort = makePort('lobby:minigame-5');
const deathmatchPort = makePort('lobby:minigame-6');
const parkourPort = makePort('lobby:minigame-7');
const royalePort = makePort('lobby:minigame-8');

/** Sends a player back to the hub; called by the engines when a round ends. */
function forceMoveToGlobal(playerId: string): void {
	const player = presence.get(playerId);

	if (!player || player.lobbyId === 'global') {
		return;
	}

	const topic = TOPIC_BY_LOBBY[player.lobbyId];

	if (topic) {
		sockets.get(playerId)?.unsubscribe(topic);
	}

	presence.setLobby(playerId, 'global');
	broadcastPresence();
	logPlayer('exit', { ...player, lobbyId: 'global' });
}

const rolls = new PaperRolls(lobbyPort);

const cars = new Cars(lobbyPort, {
	listGlobal: () => presence.listGlobal(),
	log: logEvent
});

const balloon = new Balloon(lobbyPort, {
	listGlobal: () => presence.listGlobal(),
	log: logEvent
});

const npcs = new Npcs(lobbyPort, {
	listGlobal: () => presence.listGlobal(),
	log: logEvent
});

const crypt = new Crypt(cryptPort, {
	moveToLobby: forceMoveToGlobal
});

const race = new Race(
	racePort,
	{ moveToLobby: forceMoveToGlobal, log: logEvent },
	trackForRoomType('race')
);

const roadmap = new Race(
	roadmapPort,
	{ moveToLobby: forceMoveToGlobal, log: logEvent },
	trackForRoomType('roadmap')
);

const waves = new Waves(wavesPort, {
	moveToLobby: forceMoveToGlobal
});

const deathmatch = new Deathmatch(deathmatchPort, {
	moveToLobby: forceMoveToGlobal
});

const parkour = new Parkour(parkourPort, {
	moveToLobby: forceMoveToGlobal
});

const royale = new Royale(royalePort, {
	moveToLobby: forceMoveToGlobal
});

function normalizeLobbyPhase(phase: string): LobbyPhase {
	if (phase === 'idle') {
		return 'waiting';
	}

	if (phase === 'countdown') {
		return 'countdown';
	}

	if (phase === 'playing' || phase === 'intermission') {
		return 'playing';
	}

	return 'results';
}

function makeLobbyStatus(
	rawPhase: string,
	admission: { ok: true } | { ok: false; code: string; message: string },
	maxPlayers: number | null,
	waitingForPlayers = false
): LobbyStatus {
	return {
		phase: waitingForPlayers ? 'waiting' : normalizeLobbyPhase(rawPhase),
		canEnter: admission.ok,
		reason: admission.ok ? null : admission.message,
		maxPlayers
	};
}

/** Activity of every mini lobby, piggybacked on the presence snapshot. */
function lobbyStatusFor(lobbyId: LobbyId): LobbyStatus | undefined {
	// Reconnection probes are not persisted; a generic id is enough to know
	// whether a brand-new player could join.
	const probeId = '__presence_probe__';

	switch (lobbyId) {
		case 'minigame-2':
			return makeLobbyStatus(crypt.phaseName, crypt.canEnter(probeId), null);
		case 'minigame-3':
			return makeLobbyStatus(race.phaseName, race.canEnter(probeId), race.maxPlayers);
		case 'minigame-4':
			return makeLobbyStatus(roadmap.phaseName, roadmap.canEnter(probeId), roadmap.maxPlayers);
		case 'minigame-5':
			return makeLobbyStatus(waves.phaseName, waves.canEnter(probeId), WAVES_MAX_PLAYERS);
		case 'minigame-6':
			return makeLobbyStatus(
				deathmatch.phaseName,
				deathmatch.canEnter(probeId),
				DM_MAX_PLAYERS,
				deathmatch.isWaitingForPlayers
			);
		case 'minigame-7':
			return makeLobbyStatus(
				parkour.phaseName,
				parkour.canEnter(probeId),
				PARKOUR_MAX_PLAYERS
			);
		case 'minigame-8':
			return makeLobbyStatus(
				royale.phaseName,
				royale.canEnter(probeId),
				ROYALE_MAX_PLAYERS
			);
		default:
			return undefined;
	}
}

function lobbyStatusKey(): string {
	return MINIGAME_LOBBY_IDS.map((lobbyId) => {
		const status = lobbyStatusFor(lobbyId);

		return `${lobbyId}:${status?.phase ?? '-'}:${status?.canEnter ? 1 : 0}`;
	}).join('|');
}

function broadcastPresence() {
	const payload: ServerMessage = {
		type: 'presence',
		presence: presence.buildSnapshot(lobbyStatusFor)
	};

	publish(GLOBAL_TOPIC, JSON.stringify(payload));
}

function logPlayer(action: string, player: { id: string; name: string; lobbyId: LobbyId }) {
	const total = presence.listGlobal().length;

	console.log(`[ws] ${action} ${player.id} ${player.name} lobby=${player.lobbyId} (${total} online)`);
}

function clearJoinTimer(id: string) {
	const timer = joinTimers.get(id);

	if (timer) {
		clearTimeout(timer);
		joinTimers.delete(id);
	}
}

/** Join burst: own record, chat backlog, rolls and the three cars. */
function sendWelcome(ws: SendableSocket, self: Player) {
	sendMessage(ws, {
		type: 'welcome',
		self,
		presence: presence.buildSnapshot(lobbyStatusFor)
	});

	sendMessage(ws, {
		type: 'chat-history',
		messages: getChatHistory()
	});

	sendMessage(ws, rolls.snapshot(Date.now()));
	sendMessage(ws, cars.snapshot(Date.now()));
	sendMessage(ws, balloon.snapshot(Date.now()));
	sendMessage(ws, npcs.snapshot(Date.now()));
	sendMessage(ws, { type: 'club-music-state', state: clubMusic.snapshot() });
}

function leaveCurrentLobby(ws: RoomSocket, player: Player) {
	const topic = TOPIC_BY_LOBBY[player.lobbyId];

	if (topic) {
		ws.unsubscribe(topic);
	}

	switch (player.lobbyId) {
		case 'minigame-2':
			crypt.onLeave(player.id);
			return;
		case 'minigame-3':
			race.onLeave(player.id);
			return;
		case 'minigame-4':
			roadmap.onLeave(player.id);
			return;
		case 'minigame-5':
			waves.onLeave(player.id);
			return;
		case 'minigame-6':
			deathmatch.onLeave(player.id, Date.now());
			return;
		case 'minigame-7':
			parkour.onLeave(player.id, Date.now());
			return;
		case 'minigame-8':
			royale.onLeave(player.id, Date.now());
			return;
	}
}

type EngineEntry =
	| { ok: true }
	| { ok: false; code: string; message: string }
	| undefined;

/** Joins the engine that owns a mini lobby. `undefined` = admitted. */
function enterEngine(player: Player, lobbyId: MinigameLobbyId, now: number): EngineEntry {
	switch (lobbyId) {
		case 'minigame-2':
			crypt.onEnter(player.id, player.name, now);
			return undefined;
		case 'minigame-3':
			race.onEnter(player, now);
			return undefined;
		case 'minigame-4':
			roadmap.onEnter(player, now);
			return undefined;
		case 'minigame-5':
			return waves.onEnter(player.id, player.name);
		case 'minigame-6':
			return deathmatch.onEnter(player.id, player.name, now);
		case 'minigame-7':
			return parkour.onEnter(player.id, player.name, now, player.skin);
		case 'minigame-8':
			return royale.onEnter(player.id, player.name, now, player.skin);
		default:
			return undefined;
	}
}

function checkEngineAdmission(
	player: Player,
	lobbyId: MinigameLobbyId
): { ok: true } | { ok: false; code: string; message: string } {
	switch (lobbyId) {
		case 'minigame-2':
			return crypt.canEnter(player.id);
		case 'minigame-3':
			return race.canEnter(player.id);
		case 'minigame-4':
			return roadmap.canEnter(player.id);
		case 'minigame-5':
			return waves.canEnter(player.id);
		case 'minigame-6':
			return deathmatch.canEnter(player.id);
		case 'minigame-7':
			return parkour.canEnter(player.id);
		case 'minigame-8':
			return royale.canEnter(player.id);
		default:
			return { ok: true };
	}
}

function enterLobby(ws: RoomSocket, player: Player, lobbyId: MinigameLobbyId) {
	if (player.lobbyId === lobbyId) {
		sendError(ws, 'ALREADY_IN_LOBBY', 'You are already in that mini lobby');
		return;
	}

	const admission = checkEngineAdmission(player, lobbyId);

	if (!admission.ok) {
		sendError(ws, admission.code, admission.message);
		return;
	}

	// Cars and NPCs only exist on the outdoor map.
	if (player.lobbyId === 'global') {
		cars.onPlayerLeave(player.id, 'lobby');
		balloon.onPlayerLeave(player.id, 'lobby');
		npcs.onPlayerLeave(player.id);
	} else {
		leaveCurrentLobby(ws, player);
	}

	const updated = presence.setLobby(player.id, lobbyId);

	if (!updated) {
		sendError(ws, 'NOT_JOINED', 'You must send join before this message');
		return;
	}

	const topic = TOPIC_BY_LOBBY[lobbyId];

	if (topic) {
		ws.subscribe(topic);
	}

	const result = enterEngine(updated, lobbyId, Date.now());

	if (result && !result.ok) {
		if (topic) {
			ws.unsubscribe(topic);
		}

		presence.setLobby(player.id, 'global');
		sendError(ws, result.code, result.message);
		broadcastPresence();
		return;
	}

	broadcastPresence();
	logPlayer('enter', updated);
}

function leaveLobby(ws: RoomSocket, player: Player) {
	if (player.lobbyId === 'global') {
		sendError(ws, 'NOT_IN_LOBBY', 'You are not in any mini lobby');
		return;
	}

	leaveCurrentLobby(ws, player);

	const updated = presence.setLobby(player.id, 'global');

	if (updated) {
		broadcastPresence();
		logPlayer('leave', updated);
	}
}

setInterval(() => rolls.tick(), 500);
setInterval(() => cars.tick(), 100);
setInterval(() => balloon.tick(), 100);
setInterval(() => npcs.tick(), 100);
setInterval(() => crypt.tick(), 100);
setInterval(() => race.tick(), 100);
setInterval(() => roadmap.tick(), 100);
setInterval(() => waves.tick(Date.now()), 100);
setInterval(() => deathmatch.tick(Date.now()), 100);
setInterval(() => parkour.tick(Date.now()), 100);
setInterval(() => royale.tick(Date.now()), 100);

// Phase changes happen inside the engines, outside any presence mutation.
// Poll the cheap status key and fan out a fresh snapshot only when it moves.
let lastLobbyStatusKey = lobbyStatusKey();
setInterval(() => {
	const next = lobbyStatusKey();

	if (next === lastLobbyStatusKey) {
		return;
	}

	lastLobbyStatusKey = next;
	broadcastPresence();
}, 500);

const app = new Elysia()
	.get('/', () => 'Hello Elysia')
	// Puente de audio del jukebox: el navegador no puede resolver ni leer el
	// MP3 de SoundCloud por CORS, así que el backend resuelve la pista y
	// reenvía el stream (con `Range`) sin guardarlo en disco.
	.get('/club/stream', async ({ query, request, set }) => {
		const raw = typeof query.url === 'string' ? query.url : '';
		const canonical = normalizeSoundCloudUrl(raw);

		if (!canonical) {
			set.status = 400;
			return { error: 'CLUB_MUSIC_INVALID_URL' };
		}

		return proxySoundCloudAudio(canonical, request.headers.get('range'));
	})
	// Fuente lista para el cliente: `/club/stream` (MP3) o `/club/hls` (HLS).
	.get('/club/source', async ({ query, set }) => {
		const raw = typeof query.url === 'string' ? query.url : '';
		const canonical = normalizeSoundCloudUrl(raw);

		if (!canonical) {
			set.status = 400;
			return { ok: false, error: 'CLUB_MUSIC_INVALID_URL' };
		}

		const resolved = await resolveSoundCloudStream(canonical);

		if (!resolved) {
			set.status = 404;
			return { ok: false, error: 'SOUNDCLOUD_STREAM_UNAVAILABLE' };
		}

		const source = toClientSource(resolved, canonical);

		return {
			ok: true,
			kind: source.kind,
			src: source.src,
			title: resolved.title,
			author: resolved.author,
			artworkUrl: resolved.artworkUrl,
			durationMs: resolved.durationMs
		};
	})
	// Proxy de playlists y segmentos HLS. Reescribe las URLs internas para que
	// `hls.js` siga pidiéndolas a este mismo backend.
	.get('/club/hls', async ({ query, set }) => {
		const raw = typeof query.url === 'string' ? query.url : '';

		if (!raw) {
			set.status = 400;
			return { error: 'CLUB_HLS_INVALID_URL' };
		}

		return proxyHlsAsset(raw);
	})
	// Diagnóstico: confirma si el scraper/CloudSaver encuentra audio para un
	// enlace, sin descargar la pista completa.
	.get('/club/resolve', async ({ query, set }) => {
		const raw = typeof query.url === 'string' ? query.url : '';
		const canonical = normalizeSoundCloudUrl(raw);

		if (!canonical) {
			set.status = 400;
			return { ok: false, error: 'CLUB_MUSIC_INVALID_URL' };
		}

		const resolved = await resolveSoundCloudStream(canonical);

		if (!resolved) {
			set.status = 404;
			return { ok: false, error: 'SOUNDCLOUD_STREAM_UNAVAILABLE' };
		}

		let streamHost = '';

		try {
			streamHost = new URL(resolved.streamUrl).host;
		} catch {
			streamHost = '';
		}

		return {
			ok: true,
			kind: resolved.kind,
			title: resolved.title,
			author: resolved.author,
			durationMs: resolved.durationMs,
			streamHost
		};
	})
	.ws('/ws', {
		open(ws) {
			ws.subscribe(GLOBAL_TOPIC);
			sockets.set(ws.id, ws as unknown as RoomSocket);

			const timer = setTimeout(() => {
				joinTimers.delete(ws.id);

				if (presence.get(ws.id)) {
					return;
				}

				sendError(ws, 'JOIN_TIMEOUT', 'No join received within 10 seconds');
				ws.close(4001, 'Join timeout');
			}, JOIN_TIMEOUT_MS);

			joinTimers.set(ws.id, timer);

			console.log(`[ws] open ${ws.id} (${presence.listGlobal().length} online)`);
		},

		async message(ws, raw) {
			const socket = ws as unknown as RoomSocket;
			const player = presence.get(ws.id);
			const text =
				typeof raw === 'string'
					? raw
					: raw instanceof Uint8Array || raw instanceof ArrayBuffer
						? new TextDecoder().decode(raw)
						: typeof raw === 'object' && raw !== null
							? JSON.stringify(raw)
							: '';
			const result = parseClientMessage(text);

			if (!result.ok) {
				sendError(ws, result.code, result.message);
				return;
			}

			const message = result.message;

			if (message.type === 'join') {
				if (player) {
					sendError(ws, 'ALREADY_JOINED', 'The player has already joined');
					return;
				}

				clearJoinTimer(ws.id);

				if (message.token || message.accountId || message.publicKey) {
					await bindSession(ws.id, {
						token: message.token,
						accountId: message.accountId,
						publicKey: message.publicKey
					});
				}

				const newPlayer = presence.add(ws.id, sanitizeName(message.name, ws.id), Date.now());

				sendWelcome(ws, newPlayer);
				broadcastPresence();
				logPlayer('join', newPlayer);
				return;
			}

			if (!player) {
				sendError(ws, 'NOT_JOINED', 'You must send join before this message');
				return;
			}

			switch (message.type) {
				case 'ping': {
					sendMessage(ws, { type: 'pong', at: Date.now() });
					return;
				}

				case 'sync': {
					sendWelcome(ws, player);
					return;
				}

				case 'chat': {
					const text = sanitizeChatText(message.text);

					if (text.length === 0) {
						sendError(ws, 'EMPTY_MESSAGE', 'The message cannot be empty');
						return;
					}

					if (text.length > CHAT_MAX_LENGTH) {
						sendError(
							ws,
							'MESSAGE_TOO_LONG',
							`The message cannot exceed ${CHAT_MAX_LENGTH} characters`
						);
						return;
					}

					if (!checkChatRateLimit(player.id)) {
						sendError(ws, 'RATE_LIMITED', 'Wait a moment before sending another message');
						return;
					}

					const command = parseChatCommand(text);

					if (command.type === 'help') {
						sendMessage(ws, {
							type: 'chat',
							message: createChatMessage({
								playerId: SYSTEM_PLAYER_ID,
								playerName: SYSTEM_PLAYER_NAME,
								text: 'Available commands: /help, /me <action> and /anim <name|number>',
								kind: 'system'
							})
						});
						return;
					}

					if (command.type === 'unknown') {
						sendMessage(ws, {
							type: 'chat',
							message: createChatMessage({
								playerId: SYSTEM_PLAYER_ID,
								playerName: SYSTEM_PLAYER_NAME,
								text: `Unknown command: /${command.name}`,
								kind: 'system'
							})
						});
						return;
					}

					if (command.type === 'emote' && command.text.length === 0) {
						sendError(ws, 'EMPTY_EMOTE', 'Usage: /me <action>');
						return;
					}

					const chatMessage: ChatMessage = addChatMessage({
						playerId: player.id,
						playerName: player.name,
						text: command.type === 'emote' ? command.text : text,
						kind: command.type === 'emote' ? 'emote' : 'user'
					});

					publish(
						GLOBAL_TOPIC,
						JSON.stringify({ type: 'chat', message: chatMessage } satisfies ServerMessage)
					);
					return;
				}

				case 'enter-lobby': {
					enterLobby(socket, player, message.lobbyId);
					return;
				}

				case 'leave-lobby': {
					leaveLobby(socket, player);
					return;
				}

				// Compatibility with the rooms-era client: `set-lobby` did the
				// same presence move that `enter-lobby`/`leave-lobby` do here.
				case 'set-lobby': {
					if (message.lobbyId === 'global') {
						leaveLobby(socket, player);
						return;
					}

					enterLobby(socket, player, message.lobbyId as MinigameLobbyId);
					return;
				}

				case 'emote': {
					// `/me` and `/help` used the chat engine in the rooms port.
					// Reuse the full chat handler so both clients keep working.
					const text = sanitizeChatText(message.text);

					if (text.length === 0) {
						sendError(ws, 'EMPTY_MESSAGE', 'The message cannot be empty');
						return;
					}

					const command = parseChatCommand(text);

					if (command.type === 'help' || command.type === 'unknown') {
						sendMessage(ws, {
							type: 'chat',
							message: createChatMessage({
								playerId: SYSTEM_PLAYER_ID,
								playerName: SYSTEM_PLAYER_NAME,
								text:
									command.type === 'help'
										? 'Available commands: /help, /me <action> and /anim <name|number>'
										: `Unknown command: /${command.name}`,
								kind: 'system'
							})
						});
						return;
					}

					if (command.type === 'emote' && command.text.length > 0) {
						const chatMessage = addChatMessage({
							playerId: player.id,
							playerName: player.name,
							text: command.text,
							kind: 'emote'
						});

						publish(
							GLOBAL_TOPIC,
							JSON.stringify({ type: 'chat', message: chatMessage } satisfies ServerMessage)
						);
					}

					return;
				}

				case 'player-skin': {
					const updated = presence.setSkin(player.id, message.skin);

					if (updated) {
						broadcastPresence();
					}

					return;
				}

				case 'player-animation': {
					const payload: ServerMessage = {
						type: 'player-animation',
						playerId: player.id,
						animation: message.animation as HeroAnimation,
						at: Date.now()
					};

					publish(GLOBAL_TOPIC, JSON.stringify(payload));
					return;
				}

				case 'player-position': {
					if (player.lobbyId !== 'global') {
						return;
					}

					const { x, y, z, yaw } = message;

					if ([x, y, z, yaw].some((value) => Math.abs(value) > MAX_POSITION_COORD)) {
						return;
					}

					const now = Date.now();
					const last = lastPositionAt.get(player.id) ?? 0;

					if (now - last < POSITION_MIN_INTERVAL_MS) {
						return;
					}

					lastPositionAt.set(player.id, now);
					cars.onPlayerPosition(player.id, x, y, z, now);
					balloon.onPlayerPosition(player.id, x, y, z, now);
					npcs.onPlayerPosition(player.id, x, y, z, now);

					const payload: ServerMessage = {
						type: 'player-position',
						playerId: player.id,
						position: { x, y, z, yaw },
						at: now
					};

					publish(GLOBAL_TOPIC, JSON.stringify(payload));
					return;
				}

				case 'club-music-add': {
					if (player.lobbyId !== 'global') {
						sendError(ws, 'NOT_IN_GLOBAL', 'The club jukebox only works on the outdoor map');
						return;
					}

					const result = clubMusic.add(player.id, player.name, message.url);

					if (!result.ok) {
						sendError(ws, result.code, result.message);
					}

					return;
				}

				case 'club-music-remove':
				case 'club-music-select': {
					if (player.lobbyId !== 'global') {
						sendError(ws, 'NOT_IN_GLOBAL', 'The club jukebox only works on the outdoor map');
						return;
					}

					if (!clubMusic.allowCommand(player.id)) {
						sendError(ws, 'CLUB_MUSIC_RATE_LIMIT', 'Wait a moment before using the jukebox');
						return;
					}

					const result =
						message.type === 'club-music-remove'
							? clubMusic.remove(message.trackId)
							: clubMusic.select(message.trackId);

					if (!result.ok) {
						sendError(ws, result.code, result.message);
					}

					return;
				}

				case 'club-music-play':
				case 'club-music-pause':
				case 'club-music-skip': {
					if (player.lobbyId !== 'global') {
						sendError(ws, 'NOT_IN_GLOBAL', 'The club jukebox only works on the outdoor map');
						return;
					}

					if (!clubMusic.allowCommand(player.id)) {
						sendError(ws, 'CLUB_MUSIC_RATE_LIMIT', 'Wait a moment before using the jukebox');
						return;
					}

					const result =
						message.type === 'club-music-play'
							? clubMusic.play()
							: message.type === 'club-music-pause'
								? clubMusic.pause()
								: clubMusic.skip(message.direction);

					if (!result.ok) {
						sendError(ws, result.code, result.message);
					}

					return;
				}

				case 'club-music-ended': {
					clubMusic.ended(message.trackId, message.version);
					return;
				}

				case 'club-music-duration': {
					clubMusic.setDuration(message.trackId, message.durationMs);
					return;
				}

				case 'throw-roll': {
					const scene = player.lobbyId === 'minigame-2' ? 'crypt' : 'map';

					if (message.scene !== scene) {
						return;
					}

					if (message.cannon) {
						// Cannon shots are only valid from the balloon crew's seat.
						if (
							scene !== 'map' ||
							!balloon.canFire(player.id, message.cannon, message.x, message.y, message.z)
						) {
							sendError(ws, 'BALLOON_NOT_GUNNER', 'Only the balloon crew can fire that cannon');
							return;
						}
					}

					rolls.onThrow(player.id, message, Date.now());
					return;
				}

				case 'npc-dialog': {
					if (player.lobbyId !== 'global') {
						sendError(ws, 'NOT_IN_GLOBAL', 'NPCs only walk on the outdoor map');
						return;
					}

					npcs.onDialog(player.id, message.npcId, message.open, Date.now());
					return;
				}

				case 'enter-car': {
					cars.onEnter(player, message.carId, Date.now());

					const car = cars.getCar(message.carId);

					logEvent('enter-car', {
						playerId: player.id,
						carId: message.carId,
						lobbyId: player.lobbyId,
						status: car?.status ?? 'missing',
						driverId: car?.driverId ?? null
					});
					return;
				}

				case 'exit-car': {
					cars.onExit(player.id, message.carId, Date.now());
					return;
				}

				case 'enter-balloon': {
					balloon.onEnter(player, Date.now());
					return;
				}

				case 'exit-balloon': {
					balloon.onExit(player.id, Date.now());
					return;
				}

				case 'switch-balloon-seat': {
					if (player.lobbyId !== 'global') {
						sendError(ws, 'NOT_IN_GLOBAL', 'You can only fly on the outdoor map');
						return;
					}

					balloon.onSwitchSeat(player, message.seat, Date.now());
					return;
				}

				case 'balloon-state': {
					if (player.lobbyId !== 'global') {
						sendError(ws, 'NOT_IN_GLOBAL', 'You can only fly on the outdoor map');
						return;
					}

					balloon.onState(player.id, message, Date.now());
					return;
				}

				case 'car-state': {
					if (player.lobbyId !== 'global') {
						sendError(ws, 'NOT_IN_GLOBAL', 'You can only drive on the outdoor map');
						return;
					}

					cars.onState(player.id, message.carId, message, Date.now());
					return;
				}

				case 'car-impact': {
					if (player.lobbyId !== 'global') {
						sendError(ws, 'NOT_IN_GLOBAL', 'You can only drive on the outdoor map');
						return;
					}

					cars.onImpact(
						player.id,
						message.carId,
						message.impactSpeed,
						message.cause,
						Date.now()
					);
					return;
				}

				case 'mg2-position': {
					if (player.lobbyId !== 'minigame-2') {
						sendError(ws, 'NOT_IN_MINIGAME', 'You are not in the crypt');
						return;
					}

					crypt.onPosition(
						player.id,
						message.x,
						message.y,
						message.z,
						message.yaw,
						Date.now()
					);
					return;
				}

				case 'mg2-deposit': {
					if (player.lobbyId !== 'minigame-2') {
						sendError(ws, 'NOT_IN_MINIGAME', 'You are not in the crypt');
						return;
					}

					crypt.onDeposit(player.id, Date.now());
					return;
				}

				case 'mg2-mummies': {
					if (player.lobbyId !== 'minigame-2') {
						return;
					}

					crypt.onMummiesReport(player.id, message.mummies, Date.now());
					return;
				}

				case 'mg2-stun': {
					if (player.lobbyId !== 'minigame-2') {
						return;
					}

					crypt.onStun(player.id, message.mummyId, Date.now());
					return;
				}

				case 'race-car-state': {
					const engine = raceEngineFor(player);

					if (!engine) {
						sendError(ws, 'NOT_IN_RACE', 'You are not in a race');
						return;
					}

					engine.onCarState(player.id, message, Date.now());
					return;
				}

				case 'race-use-item': {
					const engine = raceEngineFor(player);

					if (!engine) {
						sendError(ws, 'NOT_IN_RACE', 'You are not in a race');
						return;
					}

					engine.onUseItem(player.id, Date.now());
					return;
				}

				case 'race-reset': {
					const engine = raceEngineFor(player);

					if (!engine) {
						sendError(ws, 'NOT_IN_RACE', 'You are not in a race');
						return;
					}

					engine.onReset(player.id, Date.now());
					return;
				}

				case 'race-impact': {
					const engine = raceEngineFor(player);

					if (!engine) {
						sendError(ws, 'NOT_IN_RACE', 'You are not in a race');
						return;
					}

					engine.onImpact(player.id, message.impactSpeed, message.cause, Date.now());
					return;
				}

				case 'race-debug': {
					logEvent('race-debug', {
						playerId: player.id,
						event: message.event,
						detail: message.detail ?? null
					});
					return;
				}

				case 'mg5-position': {
					if (player.lobbyId !== 'minigame-5') {
						return;
					}

					waves.onPosition(player.id, message.x, message.y, message.z, message.yaw, Date.now());
					return;
				}

				case 'mg5-shoot': {
					if (player.lobbyId !== 'minigame-5') {
						return;
					}

					waves.onShoot(
						player.id,
						message.weapon,
						{ x: message.ox, y: message.oy, z: message.oz },
						{ x: message.dx, y: message.dy, z: message.dz },
						message.targetId,
						Date.now()
					);
					return;
				}

				case 'mg5-throw': {
					if (player.lobbyId !== 'minigame-5') {
						return;
					}

					waves.onThrow(
						player.id,
						{ x: message.gx, y: message.gy, z: message.gz },
						{ x: message.dx, y: message.dy, z: message.dz },
						message.tx,
						message.tz,
						Date.now()
					);
					return;
				}

				case 'mg5-car-enter': {
					if (player.lobbyId !== 'minigame-5') {
						return;
					}

					waves.onCarEnter(player.id, Date.now());
					return;
				}

				case 'mg5-car-exit': {
					if (player.lobbyId !== 'minigame-5') {
						return;
					}

					waves.onCarExit(player.id);
					return;
				}

				case 'mg5-car-state': {
					if (player.lobbyId !== 'minigame-5') {
						return;
					}

					waves.onCarState(player.id, message);
					return;
				}

				case 'mg5-reload': {
					if (player.lobbyId !== 'minigame-5') {
						return;
					}

					waves.onReload(player.id, Date.now());
					return;
				}

				case 'mg5-equip': {
					if (player.lobbyId !== 'minigame-5') {
						return;
					}

					waves.onEquip(player.id, message.slot);
					return;
				}

				case 'mg6-position': {
					if (player.lobbyId !== 'minigame-6') {
						return;
					}

					deathmatch.onPosition(
						player.id,
						message.x,
						message.y,
						message.z,
						message.yaw,
						Date.now()
					);
					return;
				}

				case 'mg6-shoot': {
					if (player.lobbyId !== 'minigame-6') {
						return;
					}

					deathmatch.onShoot(
						player.id,
						message.weapon,
						{ x: message.ox, y: message.oy, z: message.oz },
						{ x: message.dx, y: message.dy, z: message.dz },
						message.targetId,
						Date.now()
					);
					return;
				}

				case 'mg6-throw': {
					if (player.lobbyId !== 'minigame-6') {
						return;
					}

					deathmatch.onThrow(
						player.id,
						{ x: message.gx, y: message.gy, z: message.gz },
						{ x: message.dx, y: message.dy, z: message.dz },
						message.tx,
						message.tz,
						Date.now()
					);
					return;
				}

				case 'mg6-reload': {
					if (player.lobbyId !== 'minigame-6') {
						return;
					}

					deathmatch.onReload(player.id, Date.now());
					return;
				}

				case 'mg6-equip': {
					if (player.lobbyId !== 'minigame-6') {
						return;
					}

					deathmatch.onEquip(player.id, message.slot);
					return;
				}

				case 'mg7-position': {
					if (player.lobbyId !== 'minigame-7') {
						return;
					}

					parkour.onPosition(
						player.id,
						message.x,
						message.y,
						message.z,
						message.yaw,
						Date.now()
					);
					return;
				}

				case 'mg8-position': {
					if (player.lobbyId !== 'minigame-8') {
						return;
					}

					royale.onPosition(
						player.id,
						message.x,
						message.y,
						message.z,
						message.yaw,
						message.mode,
						message.vy,
						Date.now()
					);
					return;
				}

				case 'mg8-jump': {
					if (player.lobbyId !== 'minigame-8') {
						return;
					}

					royale.onJump(player.id, Date.now());
					return;
				}

				case 'mg8-shoot': {
					if (player.lobbyId !== 'minigame-8') {
						return;
					}

					royale.onShoot(
						player.id,
						message.weapon,
						{ x: message.ox, y: message.oy, z: message.oz },
						{ x: message.dx, y: message.dy, z: message.dz },
						message.targetId,
						Date.now()
					);
					return;
				}

				case 'mg8-throw': {
					if (player.lobbyId !== 'minigame-8') {
						return;
					}

					royale.onThrow(
						player.id,
						{ x: message.gx, y: message.gy, z: message.gz },
						{ x: message.dx, y: message.dy, z: message.dz },
						message.tx,
						message.tz,
						Date.now()
					);
					return;
				}

				case 'mg8-reload': {
					if (player.lobbyId !== 'minigame-8') {
						return;
					}

					royale.onReload(player.id, Date.now());
					return;
				}

				case 'mg8-equip': {
					if (player.lobbyId !== 'minigame-8') {
						return;
					}

					royale.onEquip(player.id, message.slot);
					return;
				}
			}
		},

		close(ws) {
			clearJoinTimer(ws.id);
			clearChatRateLimit(ws.id);
			clearSession(ws.id);

			const existing = presence.get(ws.id);

			if (existing) {
				leaveCurrentLobby(ws as unknown as RoomSocket, existing);
			}

			rolls.onPlayerLeave(ws.id);
			cars.onPlayerLeave(ws.id, 'disconnect');
			balloon.onPlayerLeave(ws.id, 'disconnect');
			npcs.onPlayerLeave(ws.id);
			lastPositionAt.delete(ws.id);
			sockets.delete(ws.id);

			const player = presence.remove(ws.id);

			if (!player) {
				console.log(`[ws] close ${ws.id} (${presence.listGlobal().length} online)`);
				return;
			}

			broadcastPresence();
			logPlayer('close', player);
		}
	})
	// Mini-relayer de FastAuth: crea la cuenta NEAR del jugador (solo
	// `create_account`, sin fondearla). El cliente lo llama como
	// `/api/relayer/create-account`; Vite (o el reverse proxy) quita `/api`.
	.use(statsRoutes)
	.use(relayerRoutes)
	.use(progressionRoutes)
	.use(rewardsRoutes)
	// `reusePort` is enabled by default in Elysia's Bun adapter.
	// With two instances on the same port, each would have its own
	// presence and its own room: players would be spread across processes
	// and the counters would stop matching. By disabling it, a second
	// instance fails with `EADDRINUSE` instead of splitting the game in two.
	.listen({ port: PORT, reusePort: false });

publish = (topic, message) => {
	app.server?.publish(topic, message);
};

// MongoDB is optional at boot: the realtime game must keep working without it.
// Stats routes retry the connection lazily and return 503 until it succeeds.
void ensureMongo();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	console.log(`[server] ${signal} received, shutting down`);

	try {
		await app.stop();
	} catch (cause) {
		console.warn('[server] could not stop Elysia:', cause instanceof Error ? cause.message : cause);
	}

	await closeMongo();
	process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));


function raceEngineFor(player: Player): Race | null {
	if (player.lobbyId === 'minigame-3') {
		return race;
	}

	if (player.lobbyId === 'minigame-4') {
		return roadmap;
	}

	return null;
}

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
