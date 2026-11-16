import type { SkinId } from '../../cosmetics/skins';
import type { ProgressionTrackId } from '../../missions/progression';
import type { MinigameLobbyId } from '../../services/protocol';
import {
	ONBOARDING_TUTORIAL,
	type OnboardingPreviewKind,
	type OnboardingTutorialStep,
	type TutorialControl
} from './onboardingTutorial';

export type VillageGuideEntry = OnboardingTutorialStep & {
	/** Local mission whose progress and reward the guide shows. */
	missionId: string | null;
	/** Minigame checkpoint that starts the activity, when it has one. */
	checkpointId: MinigameLobbyId | null;
	/** Direction and landmark from the tourism office. */
	location: string;
	/** Skin unlocked by the activity, when it has a mission reward. */
	rewardSkinId: SkinId | null;
	/** Progression track whose NFT rewards are shown (SPEC-045). */
	progressionTrack: ProgressionTrackId | null;
	/** First NFT-bearing progression mission of the track. */
	progressionMissionId: string | null;
	/** World map that hosts the activity; `map` is the NearBox village. */
	mapId: string;
	mapLabel: string;
};

type GuideMeta = Pick<
	VillageGuideEntry,
	| 'missionId'
	| 'checkpointId'
	| 'location'
	| 'rewardSkinId'
	| 'progressionTrack'
	| 'progressionMissionId'
	| 'mapId'
	| 'mapLabel'
>;

/**
 * The guide reuses the onboarding copy (descriptions, bullets and controls) so
 * both places always describe the same mechanics. This table only adds the
 * "where to go", "what you win" and "which map" layers.
 *
 * `progressionMissionId` points at the first NFT reward of the track defined in
 * `missions/progression.ts` (SPEC-045). The tourism panel never mints: it only
 * explains the reward and links back to Mission Central → Rewards.
 */
const GUIDE_META: Record<string, GuideMeta> = {
	village: {
		missionId: null,
		checkpointId: null,
		location: 'The central plaza and the big tree, right where you spawn.',
		rewardSkinId: null,
		progressionTrack: null,
		progressionMissionId: null,
		mapId: 'map',
		mapLabel: 'NearBox village'
	},
	cats: {
		missionId: 'cats-25',
		checkpointId: null,
		location:
			'All over NearBox. The mission tracker in the top-left corner points to the nearest cat.',
		rewardSkinId: null,
		progressionTrack: 'explorer',
		progressionMissionId: 'cats-25',
		mapId: 'map',
		mapLabel: 'NearBox village'
	},
	crypt: {
		missionId: 'crypt-5-skulls',
		checkpointId: 'minigame-2',
		location: 'North-east of the plaza. Follow the amber ring at the mausoleum.',
		rewardSkinId: 'mummy',
		progressionTrack: 'crypt',
		progressionMissionId: 'crypt-5',
		mapId: 'crypt',
		mapLabel: 'Mausoleum Crypt'
	},
	race: {
		missionId: 'race-5-laps',
		checkpointId: 'minigame-3',
		location: 'East of the plaza, at the red ring next to the garage. Pick the first card.',
		rewardSkinId: 'vampire',
		progressionTrack: 'gp',
		progressionMissionId: 'gp-podium-3',
		mapId: 'map',
		mapLabel: 'NearBox racing ring'
	},
	roadmap: {
		missionId: null,
		checkpointId: 'minigame-3',
		location: 'East of the plaza, at the red ring next to the garage. Pick the second card.',
		rewardSkinId: null,
		progressionTrack: null,
		progressionMissionId: null,
		mapId: 'roadmap',
		mapLabel: 'Haunted Highway'
	},
	barn: {
		missionId: 'barn-8-waves',
		checkpointId: 'minigame-5',
		location: 'North-west of the plaza. Follow the orange ring to the farm.',
		rewardSkinId: 'pumpkin-king',
		progressionTrack: 'barn',
		progressionMissionId: 'barn-kills-25',
		mapId: 'barnsiege',
		mapLabel: 'Barn Siege farm'
	},
	deathmatch: {
		missionId: 'hexfire-first-win',
		checkpointId: 'minigame-6',
		location: 'South-west of the plaza. Follow the purple ring to the witch house gate.',
		rewardSkinId: 'demon',
		progressionTrack: 'hexfire',
		progressionMissionId: 'hexfire-wins-5',
		mapId: 'whi-interior',
		mapLabel: 'Witch House'
	},
	parkour: {
		missionId: 'parkour-summit',
		checkpointId: 'minigame-7',
		location: 'South-east of the plaza. Follow the yellow ring below Dracula Castle.',
		rewardSkinId: 'ghost',
		progressionTrack: 'parkour',
		progressionMissionId: 'parkour-wins-3',
		mapId: 'parkour',
		mapLabel: 'Parkour Spire'
	},
	royale: {
		missionId: 'royale-first-win',
		checkpointId: 'minigame-8',
		location:
			'Beside the Halloween Shop on the plaza. Follow the sky-blue ring to the Skyfall Royale checkpoint.',
		rewardSkinId: null,
		progressionTrack: 'royale',
		progressionMissionId: 'royale-kills-10',
		mapId: 'islas-ciudad',
		mapLabel: 'Islas Ciudad'
	}
};

/** Reading order used by the tourism panel. */
const GUIDE_ORDER = [
	'village',
	'cats',
	'crypt',
	'race',
	'roadmap',
	'barn',
	'deathmatch',
	'parkour',
	'royale'
] as const;

export const VILLAGE_GUIDE: readonly VillageGuideEntry[] = GUIDE_ORDER.map((id) => {
	const step = ONBOARDING_TUTORIAL.find((entry) => entry.id === id);
	const meta = GUIDE_META[id];

	if (!step || !meta) {
		throw new Error(`Missing village guide content for "${id}"`);
	}

	return {
		...step,
		...meta,
		rewardSkinId: step.reward?.skin ?? null
	};
});

export type { OnboardingPreviewKind, TutorialControl };
