/**
 * Contenido del mini tutorial que se muestra a los jugadores nuevos antes de
 * crear su personaje. Cada paso resume una actividad del mapa y monta una
 * pequeña vista 3D representativa (`OnboardingPreview`).
 */

import type { SkinId } from '../../cosmetics/skins';

export type OnboardingPreviewKind =
	'village' | 'cats' | 'race' | 'roadmap' | 'crypt' | 'barn' | 'deathmatch' | 'parkour';

export type TutorialControl = {
	keys: string;
	label: string;
};

export type OnboardingTutorialStep = {
	id: string;
	kicker: string;
	title: string;
	description: string;
	points: readonly string[];
	controls: readonly TutorialControl[];
	preview: OnboardingPreviewKind;
	/** Skin unlocked by winning this activity, when it has a mission reward. */
	reward?: {
		skin: SkinId;
		label: string;
	};
	/** Accent color used by the badge, dots and bullet markers. */
	accent: string;
	/** Small caption drawn over the 3D stage. */
	caption: string;
};

export const ONBOARDING_TUTORIAL: readonly OnboardingTutorialStep[] = [
	{
		id: 'village',
		kicker: 'First steps',
		title: 'Explore NearBox',
		description:
			'You wake up in a cursed village shared with other players. Walk around, chat and follow the glowing markers to start an activity.',
		points: [
			'Move with WASD, run with Shift and jump with Space.',
			'Drag the mouse to look around; press C to sit down.',
			'Click to throw a paper roll — mummies hate them.'
		],
		controls: [
			{ keys: 'WASD', label: 'move' },
			{ keys: 'Shift', label: 'run' },
			{ keys: 'Space', label: 'jump' },
			{ keys: 'E', label: 'interact' }
		],
		preview: 'village',
		accent: '#fbbf24',
		caption: 'Your character'
	},
	{
		id: 'cats',
		kicker: 'Village mission',
		title: 'The 25 Lost Cats',
		description:
			'Twenty-five cursed cats are hiding all over the village. Get close and press E to catch them.',
		points: [
			'The mission button keeps track of how many cats you have found.',
			'Catch all 25 to earn the Witch NFT in Mission Central.',
			'Your progress is saved in this browser.'
		],
		controls: [
			{ keys: 'E', label: 'catch cat' },
			{ keys: 'Mission', label: 'open tracker' }
		],
		preview: 'cats',
		reward: { skin: 'witch', label: 'Witch NFT' },
		accent: '#fbbf24',
		caption: 'One of the lost cats'
	},
	{
		id: 'race',
		kicker: 'Checkpoint · Race',
		title: 'Grand Prix',
		description:
			'At the red race checkpoint, choose a track and join up to 6 drivers for a 5-lap race around the village ring.',
		points: [
			'Grab power-up boxes and use them with Q: nitro, missiles, mines, shields and more.',
			'R puts your car back on the track if you crash or flip over.',
			'Win the five-lap race to unlock the Vampire skin; the same checkpoint opens Haunted Highway.'
		],
		controls: [
			{ keys: 'W/S', label: 'accelerate' },
			{ keys: 'A/D', label: 'steer' },
			{ keys: 'Space', label: 'handbrake' },
			{ keys: 'Q', label: 'use item' },
			{ keys: 'R', label: 'reset car' }
		],
		preview: 'race',
		reward: { skin: 'vampire', label: 'Vampire skin' },
		accent: '#fb7185',
		caption: 'Pumpkin Car'
	},
	{
		id: 'roadmap',
		kicker: 'Checkpoint · Race',
		title: 'Haunted Highway',
		description:
			'Pick the second card at the race checkpoint to drive the neon jump track on your own.',
		points: [
			'Three ramps launch you over the haunted highway — keep your speed up.',
			'Drive with WASD or the arrow keys and press R to restart from the grid.',
			'Use the on-screen button to return to the village whenever you want.'
		],
		controls: [
			{ keys: 'WASD', label: 'drive' },
			{ keys: 'Space', label: 'handbrake' },
			{ keys: 'R', label: 'reset car' }
		],
		preview: 'roadmap',
		accent: '#22d3ee',
		caption: 'Halloween Car'
	},
	{
		id: 'crypt',
		kicker: 'Checkpoint · Co-op',
		title: 'The Mausoleum Crypt',
		description:
			'Enter the mausoleum with E. As a team, find the 10 skulls hidden in the crypt and carry them to the main tomb.',
		points: [
			'Mummies patrol every chamber — a paper roll stuns them for a few seconds.',
			'Your health regenerates after a short time without taking damage.',
			'Deposit all 10 skulls before the timer runs out to unlock the Mummy skin.'
		],
		controls: [
			{ keys: 'E', label: 'deposit skull' },
			{ keys: 'Click', label: 'throw roll' }
		],
		preview: 'crypt',
		reward: { skin: 'mummy', label: 'Mummy skin' },
		accent: '#a78bfa',
		caption: 'A crypt mummy'
	},
	{
		id: 'barn',
		kicker: 'Checkpoint · Survival',
		title: 'Barn Siege',
		description:
			'Up to 12 players defend the village square from 8 waves of monsters. Survive them all to win.',
		points: [
			'Start with a rusty pistol; monsters drop shotguns, rifles, ammo, grenades and medkits.',
			'Press 1–4 to switch weapons, R to reload and G to throw a grenade.',
			'The pumpkin car can run monsters over, but the horde can destroy it.',
			'Survive all eight waves to unlock the Pumpkin King skin.'
		],
		controls: [
			{ keys: 'Click', label: 'shoot' },
			{ keys: '1-4', label: 'weapon' },
			{ keys: 'G', label: 'grenade' },
			{ keys: 'R', label: 'reload' },
			{ keys: 'E', label: 'car' }
		],
		preview: 'barn',
		reward: { skin: 'pumpkin-king', label: 'Pumpkin King skin' },
		accent: '#fb923c',
		caption: 'A scarecrow from the horde'
	},
	{
		id: 'deathmatch',
		kicker: 'Checkpoint · PvP',
		title: 'Witch House Deathmatch',
		description:
			'At the witch house gate, join a 6v6 team battle inside the walled village. The team with the most takedowns after 6 minutes wins.',
		points: [
			'You are sorted into Coven or Hunters automatically; friendly fire is off.',
			'Grab shotguns, SMGs, rifles, grenades, ammo and medkits around the arena.',
			'Respawn in 3 seconds with 5 seconds of protection; shooting cancels it.',
			'Win the match to unlock the Demon skin.'
		],
		controls: [
			{ keys: 'Click', label: 'shoot' },
			{ keys: '1-4', label: 'weapon' },
			{ keys: 'G', label: 'grenade' },
			{ keys: 'R', label: 'reload' }
		],
		preview: 'deathmatch',
		reward: { skin: 'demon', label: 'Demon skin' },
		accent: '#a855f7',
		caption: 'Coven vs Hunters'
	},
	{
		id: 'parkour',
		kicker: 'Checkpoint · Race',
		title: 'Parkour Spire',
		description:
			'At the yellow plaza checkpoint, race up the floating platforms of the Halloween Tower. Activate all 12 checkpoints in order and reach the summit first.',
		points: [
			'The yellow beacon always points to your next checkpoint — only that one counts.',
			'Guardians push you with rocks, acid and fire, but they never deal damage.',
			'If you fall, you respawn at your last checkpoint after 1 second.',
			'Be the first to reach the summit to unlock the Ghost skin.'
		],
		controls: [
			{ keys: 'WASD', label: 'move' },
			{ keys: 'Shift', label: 'run' },
			{ keys: 'Space', label: 'jump' }
		],
		preview: 'parkour',
		reward: { skin: 'ghost', label: 'Ghost skin' },
		accent: '#eab308',
		caption: 'The Halloween Tower'
	},
	{
		id: 'royale',
		kicker: 'Checkpoint · Battle Royale',
		title: 'Skyfall Royale',
		description:
			'At the sky-blue plaza checkpoint, board the zeppelin over Islas Ciudad. Twelve players jump, loot and fight until only one is left.',
		points: [
			'Jump from the zeppelin and the glider opens automatically near the ground.',
			'Loot shotguns, SMGs, rifles, shields, medkits and grenades across the islands.',
			'The storm closes in seven phases; stay inside the circle.',
			'Win the match to complete the local Skyfall Royale mission.'
		],
		controls: [
			{ keys: 'Space', label: 'jump' },
			{ keys: 'Click', label: 'shoot' },
			{ keys: '1-4', label: 'weapon' },
			{ keys: 'G', label: 'grenade' }
		],
		preview: 'parkour',
		accent: '#38bdf8',
		caption: 'The zeppelin over Islas Ciudad'
	}
];
