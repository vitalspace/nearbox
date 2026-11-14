import type { RoomChatMessage } from '../protocol';
import type { RoomPort } from '../port';

/**
 * The `/me` and `/help` slice of the old `backend/src/ws/chat.ts`.
 *
 * Normal chat is platform room chat now: the platform persists it, rate-limits
 * it and fans it out. What it does NOT do is commands, so the room keeps the
 * command sugar alive as its own message type (`emote`) and keeps a small
 * history so a joining client renders the same backlog it did before.
 */

export const CHAT_HISTORY_LIMIT = 20;
export const CHAT_MAX_LENGTH = 200;
export const CHAT_RATE_LIMIT_MS = 500;
export const SYSTEM_PLAYER_ID = 'system';
export const SYSTEM_PLAYER_NAME = 'System';

export type EmoteInput = {
	playerId: string;
	playerName: string;
	text: string;
};

export type EmoteResult =
	{ ok: true; messages: RoomChatMessage[] } | { ok: false; code: string; message: string };

type ChatCommand =
	| { type: 'emote'; text: string }
	| { type: 'help' }
	| { type: 'unknown'; name: string }
	| { type: 'plain' };

function sanitizeChatText(raw: string): string {
	return raw
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseChatCommand(text: string): ChatCommand {
	if (!text.startsWith('/')) {
		return { type: 'plain' };
	}

	const [rawName = '', ...rest] = text.slice(1).split(' ');
	const name = rawName.toLowerCase();

	if (name === 'help') {
		return { type: 'help' };
	}

	if (name === 'me') {
		return { type: 'emote', text: rest.join(' ').trim() };
	}

	return { type: 'unknown', name: rawName };
}

export class Emotes {
	private readonly history: RoomChatMessage[] = [];
	private readonly lastSentAt = new Map<string, number>();
	private seq = 0;

	constructor(private readonly port: RoomPort) {}

	private create(input: {
		playerId: string;
		playerName: string;
		text: string;
		kind: RoomChatMessage['kind'];
		now: number;
	}): RoomChatMessage {
		// No `crypto.randomUUID` in the room sandbox: a per-room counter is enough
		// because the id only has to be unique inside this room's history.
		this.seq += 1;

		return {
			id: `emote-${this.seq}`,
			playerId: input.playerId,
			playerName: input.playerName,
			text: input.text,
			sentAt: input.now,
			kind: input.kind
		};
	}

	private remember(message: RoomChatMessage): void {
		this.history.push(message);

		if (this.history.length > CHAT_HISTORY_LIMIT) {
			this.history.splice(0, this.history.length - CHAT_HISTORY_LIMIT);
		}
	}

	getHistory(): RoomChatMessage[] {
		return this.history.map((message) => ({ ...message }));
	}

	onInput(input: EmoteInput, now = Date.now()): EmoteResult {
		const text = sanitizeChatText(input.text);

		if (text.length === 0) {
			return { ok: false, code: 'EMPTY_MESSAGE', message: 'The message cannot be empty' };
		}

		if (text.length > CHAT_MAX_LENGTH) {
			return {
				ok: false,
				code: 'MESSAGE_TOO_LONG',
				message: `The message cannot exceed ${CHAT_MAX_LENGTH} characters`
			};
		}

		const last = this.lastSentAt.get(input.playerId) ?? 0;

		if (now - last < CHAT_RATE_LIMIT_MS) {
			return {
				ok: false,
				code: 'RATE_LIMITED',
				message: 'Wait a moment before sending another message'
			};
		}

		const command = parseChatCommand(text);

		// Plain text belongs to platform room chat, which already owns history and
		// fan-out. The room only keeps commands.
		if (command.type === 'plain') {
			return {
				ok: false,
				code: 'USE_ROOM_CHAT',
				message: 'Send normal messages through platform room chat'
			};
		}

		this.lastSentAt.set(input.playerId, now);

		if (command.type === 'help') {
			const message = this.create({
				playerId: SYSTEM_PLAYER_ID,
				playerName: SYSTEM_PLAYER_NAME,
				text: 'Available commands: /help, /me <action> and /anim <name|number>',
				kind: 'system',
				now
			});

			this.remember(message);

			return { ok: true, messages: [message] };
		}

		if (command.type === 'unknown') {
			const message = this.create({
				playerId: SYSTEM_PLAYER_ID,
				playerName: SYSTEM_PLAYER_NAME,
				text: `Unknown command: /${command.name}`,
				kind: 'system',
				now
			});

			this.remember(message);

			return { ok: true, messages: [message] };
		}

		if (command.text.length === 0) {
			return { ok: false, code: 'EMPTY_EMOTE', message: 'Usage: /me <action>' };
		}

		const message = this.create({
			playerId: input.playerId,
			playerName: input.playerName,
			text: command.text,
			kind: 'emote',
			now
		});

		this.remember(message);
		this.port.broadcast({ type: 'emote', message });

		return { ok: true, messages: [message] };
	}

	clearRateLimit(playerId: string): void {
		this.lastSentAt.delete(playerId);
	}

	debugState(): { history: number; rateLimited: number } {
		return { history: this.history.length, rateLimited: this.lastSentAt.size };
	}
}
