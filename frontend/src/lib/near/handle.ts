/**
 * Reglas del handle legible de la cuenta NEAR (`t-<handle>.testnet`).
 *
 * Este módulo es intencionalmente liviano: lo usa también `Guardian` para
 * previsualizar el nombre, así que NO debe importar los SDKs de FastAuth.
 */
import { ACCOUNT_PREFIX, ACCOUNT_SUFFIX, HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from './config.ts';

/** `t-` + 3..20 caracteres `[a-z0-9-]`, sin guion al principio ni al final. */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$/;

/**
 * Convierte lo que escribe el jugador a un handle válido:
 * minúsculas, sin acentos, espacios/underscores → guiones, sin guiones
 * repetidos ni en los extremos y recortado al máximo.
 */
export function normalizeHandle(raw: string): string {
	return raw
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, HANDLE_MAX_LENGTH)
		.replace(/-+$/g, '');
}

export function isValidHandle(handle: string): boolean {
	return HANDLE_PATTERN.test(handle);
}

export function accountIdFromHandle(handle: string): string {
	return `${ACCOUNT_PREFIX}${handle}${ACCOUNT_SUFFIX}`;
}

export const HANDLE_RULES = `${HANDLE_MIN_LENGTH}–${HANDLE_MAX_LENGTH} characters: a-z, 0-9 and hyphens (no hyphen at the start or end).`;
