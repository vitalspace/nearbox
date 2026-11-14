/**
 * Server copy of `frontend/src/lib/npcs/npcAnimations.ts`.
 * Keep both files in sync: the backend simulates the same nine NPCs so every
 * player sees them at the same place at the same time.
 */
/**
 * Clips de los NPCs del lobby.
 *
 * Los nueve GLB humanos comparten el rig `HR_*`; los monstruos no incluyen los
 * seis clips sociales, así que este mapa es exclusivo del roster de NPCs.
 * No se reutiliza `HeroAnimation` para no ampliar el contrato del WebSocket.
 */
export const NPC_CLIPS = {
	idle: 'HR_idle',
	walk: 'HR_walk',
	run: 'HR_run',
	sit: 'HR_sit',
	wave: 'HR_wave',
	talk: 'HR_hablar',
	package: 'HR_paquete',
	thanks: 'HR_gracias',
	sleep: 'HR_dormir',
	yes: 'HR_si',
	no: 'HR_no'
} as const;

export type NpcClip = keyof typeof NPC_CLIPS;
export type NpcClipName = (typeof NPC_CLIPS)[NpcClip];

/** Clips que se reproducen en bucle mientras dura su estado. */
export const LOOPING_NPC_CLIPS: ReadonlySet<NpcClip> = new Set<NpcClip>([
	'idle',
	'walk',
	'run',
	'sit',
	'talk',
	'sleep'
]);

/** Gestos que se reproducen una sola vez y vuelven a la locomoción. */
export const ONE_SHOT_NPC_CLIPS: ReadonlySet<NpcClip> = new Set<NpcClip>([
	'wave',
	'package',
	'thanks',
	'yes',
	'no'
]);

export function isLoopingNpcClip(clip: NpcClip): boolean {
	return LOOPING_NPC_CLIPS.has(clip);
}

export function npcClipName(clip: NpcClip): NpcClipName {
	return NPC_CLIPS[clip];
}
