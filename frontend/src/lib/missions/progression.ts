/**
 * Catálogo de progresión de SPEC-045.
 *
 * El servidor es la fuente de verdad del estado (aceptar, completar, reclamar);
 * este archivo define los IDs, textos y objetivos que el HUD necesita y debe
 * coincidir con `backend/src/progression/catalog.ts`. El test de huella del
 * backend detecta cualquier divergencia entre ambos catálogos.
 */

export const PROGRESSION_VERSION = 1;

export type ProgressionTrackId =
	'barn' | 'royale' | 'gp' | 'hexfire' | 'parkour' | 'crypt' | 'explorer';

export type ProgressionTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export type StatMetric =
	| 'cats.found'
	| 'cats.completed'
	| 'crypt.completed'
	| 'crypt.deaths'
	| 'barn.kills'
	| 'barn.completed'
	| 'barn.waves'
	| 'race.finished'
	| 'race.won'
	| 'race.podiums'
	| 'race.laps'
	| 'royale.matches'
	| 'royale.wins'
	| 'royale.kills'
	| 'royale.top3'
	| 'hexfire.matches'
	| 'hexfire.wins'
	| 'hexfire.kills'
	| 'parkour.finishes'
	| 'parkour.wins'
	| 'errands.completed'
	| 'missions.completed';

export type StatRequirement = {
	metric: StatMetric;
	target: number;
};

export type MissionObjective =
	| {
			type: 'stat';
			metric: StatMetric;
			target: number;
			/** Requisitos adicionales que deben cumplirse a la vez (p. ej. kills y victorias). */
			also?: readonly StatRequirement[];
	  }
	| { type: 'collect'; objectiveIds: readonly string[] }
	| {
			type: 'meta';
			track?: ProgressionTrackId;
			/** Exact tier of the missions counted. */
			tier?: ProgressionTier;
			/** Counts missions up to and including this tier. */
			maxTier?: ProgressionTier;
			/** Restringe el conteo a estas pistas (p. ej. solo minijuegos). */
			tracks?: readonly ProgressionTrackId[];
			target: number;
	  };

export type MissionUnlock = {
	missions?: readonly string[];
	tier?: ProgressionTier;
	nft?: readonly { catalogId: string; copies?: number }[];
};

export type RewardRef = {
	catalogId: string;
	label: string;
	/** Cosmético existente: skin, arma, asset o vehículo. */
	kind: 'cosmetic';
};

export type ProgressionMission = {
	id: string;
	track: ProgressionTrackId;
	tier: ProgressionTier;
	title: string;
	description: string;
	objective: MissionObjective;
	unlock: MissionUnlock;
	reward: RewardRef | null;
	serverAttested: boolean;
};

export type ProgressionStatus = 'locked' | 'available' | 'active' | 'completed' | 'claimed';

export type RewardClaimState = {
	claimId: string;
	missionId: string;
	catalogId: string;
	status: 'pending' | 'minting' | 'minted' | 'already-owned' | 'failed';
	tokenId: string | null;
	serial: number | null;
	txHash: string | null;
	error: string | null;
	createdAt: number;
	updatedAt: number;
};

export type ProgressionMissionState = {
	missionId: string;
	status: ProgressionStatus;
	value: number;
	target: number;
	collectedIds: string[];
	lockedReason: string | null;
	completedAt: number | null;
	claimedAt: number | null;
	claim: RewardClaimState | null;
};

export const PROGRESSION_TRACKS: readonly {
	id: ProgressionTrackId;
	label: string;
	kicker: string;
	accent: string;
}[] = [
	{ id: 'barn', label: 'Barn Siege', kicker: 'Wave defense', accent: '#fb923c' },
	{ id: 'royale', label: 'Skyfall Royale', kicker: 'Battle royale', accent: '#38bdf8' },
	{ id: 'gp', label: 'Grand Prix', kicker: 'Racing', accent: '#ef4444' },
	{ id: 'hexfire', label: 'Hexfire', kicker: 'Deathmatch', accent: '#a855f7' },
	{ id: 'parkour', label: 'Parkour Spire', kicker: 'Climb', accent: '#22d3ee' },
	{ id: 'crypt', label: 'The Crypt', kicker: 'Co-op heist', accent: '#94a3b8' },
	{ id: 'explorer', label: 'Explorer', kicker: 'Village & errands', accent: '#fbbf24' }
];

export const PROGRESSION_TIERS: readonly ProgressionTier[] = ['T0', 'T1', 'T2', 'T3', 'T4'];

/** Remaining copies accepted by the contract's per-account cap. */
const reward = (catalogId: string, label: string, kind: RewardRef['kind']): RewardRef => ({
	catalogId,
	label,
	kind
});

const collect = (...objectiveIds: string[]): MissionObjective => ({
	type: 'collect',
	objectiveIds
});

/** Password-free helper for the 9 NPC errands from SPEC-035. */
const errand = (
	id: string,
	title: string,
	description: string,
	objectiveIds: string[]
): ProgressionMission => ({
	id,
	track: 'explorer',
	tier: 'T0',
	title,
	description,
	objective: collect(...objectiveIds),
	unlock: {},
	reward: null,
	serverAttested: false
});

const range = (prefix: string, count: number): string[] =>
	Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`);

/**
 * Las misiones se listan por pista y tramo. El orden es estable: el evaluador
 * procesa las `meta` al final y el HUD las agrupa por pista.
 */
export const PROGRESSION_MISSIONS: readonly ProgressionMission[] = [
	// -- Barn Siege ---------------------------------------------------------
	{
		id: 'barn-first',
		track: 'barn',
		tier: 'T0',
		title: 'Hold the Farm',
		description: 'Survive one Barn Siege match.',
		objective: { type: 'stat', metric: 'barn.completed', target: 1 },
		unlock: {},
		reward: null,
		serverAttested: true
	},
	{
		id: 'barn-kills-25',
		track: 'barn',
		tier: 'T1',
		title: 'First Blood',
		description: 'Destroy 25 monsters in Barn Siege.',
		objective: { type: 'stat', metric: 'barn.kills', target: 25 },
		unlock: {},
		reward: reward('shotgun-gold', 'Golden Shotgun', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'barn-kills-100',
		track: 'barn',
		tier: 'T2',
		title: 'Siege Veteran',
		description: 'Destroy 100 monsters in Barn Siege.',
		objective: { type: 'stat', metric: 'barn.kills', target: 100 },
		unlock: { nft: [{ catalogId: 'shotgun-gold' }] },
		reward: reward('pistol-gold', 'Golden Pistol', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'barn-kills-250',
		track: 'barn',
		tier: 'T3',
		title: 'Butcher of the Barn',
		description: 'Destroy 250 monsters in Barn Siege.',
		objective: { type: 'stat', metric: 'barn.kills', target: 250 },
		unlock: { nft: [{ catalogId: 'pistol-gold' }] },
		reward: reward('frankenstein', 'Frankenstein', 'cosmetic'),
		serverAttested: true
	},

	// -- Skyfall Royale -----------------------------------------------------
	{
		id: 'royale-first',
		track: 'royale',
		tier: 'T0',
		title: 'Drop In',
		description: 'Play one Skyfall Royale match.',
		objective: { type: 'stat', metric: 'royale.matches', target: 1 },
		unlock: {},
		reward: null,
		serverAttested: true
	},
	{
		id: 'royale-kills-10',
		track: 'royale',
		tier: 'T1',
		title: 'Island Hunter',
		description: 'Eliminate 10 rivals in Skyfall Royale.',
		objective: { type: 'stat', metric: 'royale.kills', target: 10 },
		unlock: {},
		reward: reward('sniper-gold', 'Golden Sniper', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'royale-kills-50',
		track: 'royale',
		tier: 'T2',
		title: 'Storm Chaser',
		description: 'Eliminate 50 rivals in Skyfall Royale.',
		objective: { type: 'stat', metric: 'royale.kills', target: 50 },
		unlock: { nft: [{ catalogId: 'sniper-gold' }] },
		reward: reward('bazooka-gold', 'Golden Bazooka', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'royale-kills-200',
		track: 'royale',
		tier: 'T3',
		title: 'Last One Standing',
		description: 'Eliminate 200 rivals and win 5 Skyfall Royale matches.',
		objective: {
			type: 'stat',
			metric: 'royale.kills',
			target: 200,
			also: [{ metric: 'royale.wins', target: 5 }]
		},
		unlock: { nft: [{ catalogId: 'bazooka-gold' }] },
		reward: reward('ghost', 'Ghost', 'cosmetic'),
		serverAttested: true
	},

	// -- Grand Prix ---------------------------------------------------------
	{
		id: 'gp-first',
		track: 'gp',
		tier: 'T0',
		title: 'Lights Out',
		description: 'Finish one Grand Prix race.',
		objective: { type: 'stat', metric: 'race.finished', target: 1 },
		unlock: {},
		reward: null,
		serverAttested: true
	},
	{
		id: 'gp-podium-3',
		track: 'gp',
		tier: 'T1',
		title: 'Podium Regular',
		description: 'Reach the podium 3 times in the Grand Prix.',
		objective: { type: 'stat', metric: 'race.podiums', target: 3 },
		unlock: {},
		reward: reward('skateboard', 'Skateboard', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'gp-wins-3',
		track: 'gp',
		tier: 'T2',
		title: 'Grand Prix Winner',
		description: 'Win 3 Grand Prix races.',
		objective: { type: 'stat', metric: 'race.won', target: 3 },
		unlock: { nft: [{ catalogId: 'skateboard' }] },
		reward: reward('vampire', 'Vampire Skin', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'gp-wins-10',
		track: 'gp',
		tier: 'T3',
		title: 'Track Legend',
		description: 'Win 10 Grand Prix races.',
		objective: { type: 'stat', metric: 'race.won', target: 10 },
		unlock: { nft: [{ catalogId: 'vampire' }] },
		reward: reward('vampire', 'Vampire', 'cosmetic'),
		serverAttested: true
	},

	// -- Hexfire ------------------------------------------------------------
	{
		id: 'hexfire-first',
		track: 'hexfire',
		tier: 'T0',
		title: 'Enter the Witch House',
		description: 'Play one Hexfire Deathmatch.',
		objective: { type: 'stat', metric: 'hexfire.matches', target: 1 },
		unlock: {},
		reward: null,
		serverAttested: true
	},
	{
		id: 'hexfire-wins-5',
		track: 'hexfire',
		tier: 'T1',
		title: 'Hexfire Regular',
		description: 'Win 5 Hexfire Deathmatches.',
		objective: { type: 'stat', metric: 'hexfire.wins', target: 5 },
		unlock: {},
		reward: reward('demon', 'Demon', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'hexfire-wins-20',
		track: 'hexfire',
		tier: 'T2',
		title: 'Witch Hunter',
		description: 'Win 20 Hexfire Deathmatches.',
		objective: { type: 'stat', metric: 'hexfire.wins', target: 20 },
		unlock: { nft: [{ catalogId: 'demon' }] },
		reward: reward('mp5-gold', 'Golden MP5', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'hexfire-wins-50',
		track: 'hexfire',
		tier: 'T3',
		title: 'Hexfire Champion',
		description: 'Win 50 Hexfire Deathmatches.',
		objective: { type: 'stat', metric: 'hexfire.wins', target: 50 },
		unlock: { nft: [{ catalogId: 'mp5-gold' }] },
		reward: reward('demon', 'Demon', 'cosmetic'),
		serverAttested: true
	},

	// -- Parkour ------------------------------------------------------------
	{
		id: 'parkour-first',
		track: 'parkour',
		tier: 'T0',
		title: 'First Ascent',
		description: 'Finish one Parkour Spire climb.',
		objective: { type: 'stat', metric: 'parkour.finishes', target: 1 },
		unlock: {},
		reward: null,
		serverAttested: true
	},
	{
		id: 'parkour-wins-3',
		track: 'parkour',
		tier: 'T1',
		title: 'Spire Runner',
		description: 'Win 3 Parkour Spire climbs.',
		objective: { type: 'stat', metric: 'parkour.wins', target: 3 },
		unlock: {},
		reward: reward('ghost', 'Ghost', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'parkour-wins-10',
		track: 'parkour',
		tier: 'T2',
		title: 'Sky Climber',
		description: 'Win 10 Parkour Spire climbs.',
		objective: { type: 'stat', metric: 'parkour.wins', target: 10 },
		unlock: { nft: [{ catalogId: 'ghost' }] },
		reward: reward('magic-broom', 'Magic Broom', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'parkour-wins-25',
		track: 'parkour',
		tier: 'T3',
		title: 'Spire Master',
		description: 'Win 25 Parkour Spire climbs.',
		objective: { type: 'stat', metric: 'parkour.wins', target: 25 },
		unlock: { nft: [{ catalogId: 'magic-broom' }] },
		reward: reward('magic-broom', 'Magic Broom', 'cosmetic'),
		serverAttested: true
	},

	// -- The Crypt ----------------------------------------------------------
	{
		id: 'crypt-first',
		track: 'crypt',
		tier: 'T0',
		title: 'Skull Collector',
		description: 'Complete one Crypt run.',
		objective: { type: 'stat', metric: 'crypt.completed', target: 1 },
		unlock: {},
		reward: null,
		serverAttested: true
	},
	{
		id: 'crypt-5',
		track: 'crypt',
		tier: 'T1',
		title: 'Crypt Regular',
		description: 'Complete 5 Crypt runs.',
		objective: { type: 'stat', metric: 'crypt.completed', target: 5 },
		unlock: {},
		reward: reward('crown', 'Crown', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'crypt-25',
		track: 'crypt',
		tier: 'T2',
		title: 'Tomb Raider',
		description: 'Complete 25 Crypt runs.',
		objective: { type: 'stat', metric: 'crypt.completed', target: 25 },
		unlock: { nft: [{ catalogId: 'crown' }] },
		reward: reward('crown', 'Crown', 'cosmetic'),
		serverAttested: true
	},
	{
		id: 'crypt-50',
		track: 'crypt',
		tier: 'T3',
		title: 'Keeper of the Crypt',
		description: 'Complete 50 Crypt runs.',
		objective: { type: 'stat', metric: 'crypt.completed', target: 50 },
		unlock: { nft: [{ catalogId: 'crown' }] },
		reward: reward('mummy', 'Mummy', 'cosmetic'),
		serverAttested: true
	},

	// -- Explorer -----------------------------------------------------------
	errand('alba-moonflowers', 'Moonflowers', 'Gather Alba’s moonflowers.', range('moon', 5)),
	errand('bruno-ingredients', 'Midnight Batch', 'Gather Bruno’s ingredients.', range('ing', 4)),
	errand('carmen-parcels', 'Lost Parcels', 'Recover Carmen’s lost parcels.', range('parcel', 3)),
	errand('mateo-mail-run', 'Mail Run', 'Deliver Mateo’s letters.', range('mail', 5)),
	errand('lucia-watch', 'Neighborhood Watch', 'Check Lucía’s watch posts.', range('watch', 6)),
	errand('tomas-parts', 'Missing Parts', 'Find Tomás’s machine parts.', range('part', 4)),
	errand('vera-relics', 'Castle Relics', 'Recover Vera’s relics.', range('relic', 4)),
	errand('rosa-pumpkins', 'Pumpkin Hunt', 'Collect Rosa’s pumpkins.', range('pumpkin', 5)),
	errand('elias-lanterns', 'Lanterns', 'Light Elías’s lanterns.', range('lantern', 4)),
	{
		id: 'cats-first',
		track: 'explorer',
		tier: 'T0',
		title: 'Cat Person',
		description: 'Find your first hidden cat.',
		objective: { type: 'stat', metric: 'cats.found', target: 1 },
		unlock: {},
		reward: null,
		serverAttested: false
	},
	{
		id: 'cats-25',
		track: 'explorer',
		tier: 'T1',
		title: 'All the Cats',
		description: 'Find 25 hidden cats.',
		objective: { type: 'stat', metric: 'cats.found', target: 25 },
		unlock: {},
		reward: reward('witch', 'Witch', 'cosmetic'),
		serverAttested: false
	},
	{
		id: 'errands-9',
		track: 'explorer',
		tier: 'T1',
		title: 'Neighborhood Hero',
		description: 'Complete all 9 village errands.',
		objective: { type: 'stat', metric: 'errands.completed', target: 9 },
		unlock: {},
		reward: reward('coin-pistol', 'Coin Pistol', 'cosmetic'),
		serverAttested: false
	},
	{
		id: 'explorer-veteran',
		track: 'explorer',
		tier: 'T2',
		title: 'Village Veteran',
		description: 'Complete 8 explorer missions up to Tier 1.',
		objective: { type: 'meta', track: 'explorer', maxTier: 'T1', target: 8 },
		unlock: { nft: [{ catalogId: 'witch' }, { catalogId: 'coin-pistol' }] },
		reward: reward('golem', 'Golem', 'cosmetic'),
		serverAttested: false
	},
	{
		id: 'explorer-all',
		track: 'explorer',
		tier: 'T3',
		title: 'Heart of RunWorld',
		description: 'Complete all 12 non-meta explorer missions.',
		objective: { type: 'meta', track: 'explorer', target: 12 },
		unlock: { nft: [{ catalogId: 'golem' }] },
		reward: reward('skeleton', 'Skeleton', 'cosmetic'),
		serverAttested: false
	},

	// -- Tier medals (meta) -------------------------------------------------
	{
		id: 'tier-initiate',
		track: 'explorer',
		tier: 'T1',
		title: 'Initiate',
		description: 'Complete 4 Tier 1 missions from any track.',
		objective: { type: 'meta', tier: 'T1', target: 4 },
		unlock: {},
		reward: reward('hero', 'Heroine', 'cosmetic'),
		serverAttested: false
	},
	{
		id: 'tier-veteran',
		track: 'explorer',
		tier: 'T2',
		title: 'Veteran',
		description: 'Complete 4 Tier 2 missions from any track.',
		objective: { type: 'meta', tier: 'T2', target: 4 },
		unlock: { nft: [{ catalogId: 'hero' }] },
		reward: reward('crow-warden', 'Scarecrow', 'cosmetic'),
		serverAttested: false
	},
	{
		id: 'tier-champion',
		track: 'explorer',
		tier: 'T3',
		title: 'Champion',
		description: 'Complete 4 Tier 3 missions from any track.',
		objective: { type: 'meta', tier: 'T3', target: 4 },
		unlock: { nft: [{ catalogId: 'crow-warden' }] },
		reward: reward('pumpkin-king', 'Pumpkin King', 'cosmetic'),
		serverAttested: false
	},
	{
		id: 'tier-legend',
		track: 'explorer',
		tier: 'T4',
		title: 'Legend',
		description: 'Complete all 6 Tier 3 minigame missions.',
		objective: {
			type: 'meta',
			tier: 'T3',
			tracks: ['barn', 'royale', 'gp', 'hexfire', 'parkour', 'crypt'],
			target: 6
		},
		unlock: { nft: [{ catalogId: 'pumpkin-king' }] },
		reward: reward('pumpkin-king', 'Pumpkin King', 'cosmetic'),
		serverAttested: false
	}
];

const MISSION_BY_ID = new Map(PROGRESSION_MISSIONS.map((mission) => [mission.id, mission]));

export function missionById(id: string): ProgressionMission | null {
	return MISSION_BY_ID.get(id) ?? null;
}

export function missionsByTrack(track: ProgressionTrackId): ProgressionMission[] {
	return PROGRESSION_MISSIONS.filter((mission) => mission.track === track);
}

/** Encargo de SPEC-035 asociado a cada NPC del lobby. */
export const ERRAND_BY_NPC: Readonly<Record<string, string>> = {
	alba: 'alba-moonflowers',
	bruno: 'bruno-ingredients',
	carmen: 'carmen-parcels',
	mateo: 'mateo-mail-run',
	lucia: 'lucia-watch',
	tomas: 'tomas-parts',
	vera: 'vera-relics',
	rosa: 'rosa-pumpkins',
	elias: 'elias-lanterns'
};

export function errandMissionForNpc(npcId: string): ProgressionMission | null {
	const missionId = ERRAND_BY_NPC[npcId];
	return missionId ? missionById(missionId) : null;
}

/** Misiones que dan un NFT, en orden de catálogo. */
export function rewardMissions(): ProgressionMission[] {
	return PROGRESSION_MISSIONS.filter((mission) => mission.reward !== null);
}

/** Checks the static unlock list (missions and exact-tier NFTs). */
export function unlockMissions(unlock: MissionUnlock): string[] {
	return [...(unlock.missions ?? [])];
}

/**
 * FNV-1a de 32 bits sobre la forma canónica del catálogo. Debe coincidir con
 * `backend/src/progression/catalog.ts`; el test del backend lo verifica.
 */
export function catalogFingerprint(
	missions: readonly ProgressionMission[] = PROGRESSION_MISSIONS
): string {
	const canonical = missions.map((mission) => [
		mission.id,
		mission.track,
		mission.tier,
		mission.objective,
		mission.unlock,
		mission.reward,
		mission.serverAttested ? 1 : 0
	]);

	const text = JSON.stringify(canonical);
	let hash = 0x811c9dc5;

	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}

	return hash.toString(16).padStart(8, '0');
}
