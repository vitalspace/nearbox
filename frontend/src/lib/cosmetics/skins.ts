import type { HeroAnimation } from '../services/protocol';
import { asset } from '../assets/path';
import { DEFAULT_SKIN, isSkinId, SKIN_IDS, type SkinId } from './skinIds';

export { DEFAULT_SKIN, isSkinId, SKIN_IDS, type SkinId };

export type SkinDefinition = {
	id: SkinId;
	name: string;
	description: string;
	modelPath: string | null;
	unlockMissionId: string | null;
	/**
	 * La skin solo se desbloquea poseyendo su NFT (tienda o recompensa de
	 * progresión), nunca por una misión local ni desde el primer arranque.
	 */
	nftOnly?: boolean;
	/** Prefix of the GLB animation clips (`WH_`, `DM_`, …). `null` for `Hero.glb`. */
	animationPrefix: string | null;
	/** Nodes hidden in first person so the character does not block the camera. */
	hideInFirstPerson?: string[];
};

export const SKINS: readonly SkinDefinition[] = [
	{
		id: 'hero',
		name: 'Heroine',
		description: 'The fearless explorer, with her backpack and hood.',
		modelPath: null,
		unlockMissionId: null,
		animationPrefix: null
	},
	{
		id: 'crow-warden',
		name: 'Scarecrow',
		description: 'The guardian of the fields, with crow, hat and straw boots.',
		modelPath: asset('characters/Scarecrow_Feet.glb'),
		unlockMissionId: null,
		nftOnly: true,
		animationPrefix: 'SF',
		hideInFirstPerson: ['SF_Head', 'SF_Hat', 'SF_Crow', 'SF_Post']
	},
	{
		id: 'witch',
		name: 'Witch',
		description: 'A cursed sorceress with a crooked hat and a nasty temper.',
		modelPath: asset('characters/Witch.glb'),
		unlockMissionId: null,
		animationPrefix: 'WH',
		hideInFirstPerson: ['WH_Head', 'WH_Hat', 'WH_Hair']
	},
	{
		id: 'demon',
		name: 'Demon',
		description: 'A horned fiend straight from the underworld.',
		modelPath: asset('characters/Demon.glb'),
		unlockMissionId: 'hexfire-first-win',
		animationPrefix: 'DM',
		hideInFirstPerson: ['DM_Head']
	},
	{
		id: 'frankenstein',
		name: 'Frankenstein',
		description: 'Stitched together, powered by lightning and bad moods.',
		modelPath: asset('characters/Frankenstein.glb'),
		unlockMissionId: null,
		animationPrefix: 'FR',
		hideInFirstPerson: ['FR_Head']
	},
	{
		id: 'ghost',
		name: 'Ghost',
		description: 'A drifting spirit that never quite found its way home.',
		modelPath: asset('characters/Ghost.glb'),
		unlockMissionId: 'parkour-summit',
		animationPrefix: 'GH'
	},
	{
		id: 'golem',
		name: 'Golem',
		description: 'A walking pile of stone with a heart carved in the chest.',
		modelPath: asset('characters/Golem.glb'),
		unlockMissionId: null,
		animationPrefix: 'GO',
		hideInFirstPerson: ['GO_Head']
	},
	{
		id: 'mummy',
		name: 'Mummy',
		description: 'Wrapped in old bandages and older curses.',
		modelPath: asset('characters/Mummy.glb'),
		unlockMissionId: 'crypt-5-skulls',
		animationPrefix: 'MU',
		hideInFirstPerson: ['MU_Head']
	},
	{
		id: 'pumpkin-king',
		name: 'Pumpkin King',
		description: 'The grinning ruler of the pumpkin patch.',
		modelPath: asset('characters/PumpkinKing.glb'),
		unlockMissionId: 'barn-8-waves',
		animationPrefix: 'PK',
		hideInFirstPerson: ['PK_Head']
	},
	{
		id: 'skeleton',
		name: 'Skeleton',
		description: 'All bones, no skin, and no patience for grave robbers.',
		modelPath: asset('characters/Skeleton.glb'),
		unlockMissionId: null,
		animationPrefix: 'SK',
		hideInFirstPerson: ['SK_Head']
	},
	{
		id: 'vampire',
		name: 'Vampire',
		description: 'An elegant count who only goes out after sunset.',
		modelPath: asset('characters/Vampire.glb'),
		unlockMissionId: 'race-5-laps',
		animationPrefix: 'VA',
		hideInFirstPerson: ['VA_Head']
	}
];

export const SKIN_BY_ID: ReadonlyMap<SkinId, SkinDefinition> = new Map(
	SKINS.map((skin) => [skin.id, skin])
);

/** Skins without an unlock condition are available from the first launch. */
export function isSkinAlwaysUnlocked(skin: SkinDefinition): boolean {
	return skin.unlockMissionId === null && skin.nftOnly !== true;
}

/**
 * Traduce los nombres de clip del contrato del jugador (`HR_*`) al prefijo
 * del rig de la skin (`WH_*`, `DM_*`, …). Los clips que no existen en el GLB
 * se descartan al construir el mapa de acciones.
 */
export function skinAnimations(prefix: string): Partial<Record<HeroAnimation, string>> {
	return {
		HR_idle: `${prefix}_idle`,
		HR_walk: `${prefix}_walk`,
		HR_run: `${prefix}_run`,
		HR_jump: `${prefix}_jump`,
		HR_sit: `${prefix}_sit`,
		HR_attack: `${prefix}_attack`,
		HR_shoot: `${prefix}_shoot`,
		HR_wave: `${prefix}_wave`,
		HR_pickup: `${prefix}_pickup`,
		HR_hit: `${prefix}_hit`,
		HR_death: `${prefix}_death`,
		HR_aim: `${prefix}_aim`,
		HR_walk_aim: `${prefix}_walk_aim`,
		HR_run_aim: `${prefix}_run_aim`,
		HR_crouch_aim: `${prefix}_crouch_aim`,
		HR_injured: `${prefix}_injured`,
		HR_heal: `${prefix}_heal`,
		HR_carry: `${prefix}_carry`,
		HR_throw: `${prefix}_throw`,
		HR_paquete: `${prefix}_paquete`,
		HR_gracias: `${prefix}_gracias`,
		HR_dormir: `${prefix}_dormir`,
		HR_hablar: `${prefix}_hablar`,
		HR_si: `${prefix}_si`,
		HR_no: `${prefix}_no`,
		HR_dance: `${prefix}_dance`
	};
}
