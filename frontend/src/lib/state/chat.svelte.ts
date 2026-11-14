import type { ChatMessage } from '../services/protocol';

export const CHAT_DISPLAY_LIMIT = 20;
export const CHAT_AUTO_HIDE_MS = 15_000;

class ChatStore {
	messages = $state<ChatMessage[]>([]);
	isOpen = $state(false);
	visible = $state(true);
	manualHidden = $state(false);
	draft = $state('');
	unread = $state(0);
	lastActivityAt = $state(Date.now());

	addMessage(message: ChatMessage, selfId?: string): void {
		if (this.messages.some((item) => item.id === message.id)) {
			return;
		}

		this.messages = [...this.messages, message].slice(-CHAT_DISPLAY_LIMIT);
		this.lastActivityAt = Date.now();

		if (!this.manualHidden) {
			this.visible = true;
		}

		if (!this.isOpen && message.kind !== 'system' && message.playerId !== selfId) {
			this.unread += 1;
		}
	}

	setHistory(messages: ChatMessage[]): void {
		this.messages = messages.slice(-CHAT_DISPLAY_LIMIT);
		this.lastActivityAt = Date.now();
	}

	open(): void {
		this.isOpen = true;
		this.visible = true;
		this.manualHidden = false;
		this.unread = 0;
		this.lastActivityAt = Date.now();
	}

	close(): void {
		this.isOpen = false;
		this.draft = '';
		this.lastActivityAt = Date.now();
	}

	show(): void {
		this.visible = true;
		this.manualHidden = false;
		this.lastActivityAt = Date.now();
	}

	hide(manual = true): void {
		this.visible = false;
		this.isOpen = false;
		this.draft = '';
		this.lastActivityAt = Date.now();

		if (manual) {
			this.manualHidden = true;
		}
	}

	toggle(): void {
		if (this.isOpen) {
			this.close();
		} else {
			this.open();
		}
	}

	reset(): void {
		this.messages = [];
		this.isOpen = false;
		this.visible = true;
		this.manualHidden = false;
		this.draft = '';
		this.unread = 0;
		this.lastActivityAt = Date.now();
	}
}

export const chat = new ChatStore();
