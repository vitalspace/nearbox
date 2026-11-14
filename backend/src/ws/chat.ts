import type { ChatMessage, ChatMessageKind } from './protocol';

export const CHAT_HISTORY_LIMIT = 20;
export const CHAT_MAX_LENGTH = 200;
export const CHAT_RATE_LIMIT_MS = 500;
export const SYSTEM_PLAYER_ID = 'system';
export const SYSTEM_PLAYER_NAME = 'System';

const history: ChatMessage[] = [];
const lastSentAt = new Map<string, number>();

export type CreateChatMessageInput = {
	playerId: string;
	playerName: string;
	text: string;
	kind: ChatMessageKind;
};

export type ChatCommand =
	| { type: 'none' }
	| { type: 'help' }
	| { type: 'emote'; text: string }
	| { type: 'unknown'; name: string };

export function sanitizeChatText(raw: string): string {
	return raw
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function isChatTextValid(text: string): boolean {
	return text.length > 0 && text.length <= CHAT_MAX_LENGTH;
}

export function parseChatCommand(text: string): ChatCommand {
	if (!text.startsWith('/')) {
		return { type: 'none' };
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

export function createChatMessage(input: CreateChatMessageInput): ChatMessage {
	return {
		id: crypto.randomUUID(),
		playerId: input.playerId,
		playerName: input.playerName,
		text: input.text,
		sentAt: Date.now(),
		kind: input.kind
	};
}

export function addChatMessage(input: CreateChatMessageInput): ChatMessage {
	const message = createChatMessage(input);

	history.push(message);

	if (history.length > CHAT_HISTORY_LIMIT) {
		history.splice(0, history.length - CHAT_HISTORY_LIMIT);
	}

	return message;
}

export function getChatHistory(): ChatMessage[] {
	return history.map((message) => ({ ...message }));
}

export function checkChatRateLimit(playerId: string, now = Date.now()): boolean {
	const last = lastSentAt.get(playerId) ?? 0;

	if (now - last < CHAT_RATE_LIMIT_MS) {
		return false;
	}

	lastSentAt.set(playerId, now);

	return true;
}

export function clearChatRateLimit(playerId: string): void {
	lastSentAt.delete(playerId);
}
