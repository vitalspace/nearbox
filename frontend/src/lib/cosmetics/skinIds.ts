/**
 * Canonical skin ids, shared with the room server.
 *
 * Kept free of Three.js / asset imports so `src/server` can validate the wire
 * without pulling client-only code into the room bundle.
 */
export const SKIN_IDS = [
	'hero',
	'crow-warden',
	'witch',
	'demon',
	'frankenstein',
	'ghost',
	'golem',
	'mummy',
	'pumpkin-king',
	'skeleton',
	'vampire'
] as const;

export type SkinId = (typeof SKIN_IDS)[number];

export const DEFAULT_SKIN: SkinId = 'hero';

export function isSkinId(value: unknown): value is SkinId {
	return typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value);
}
