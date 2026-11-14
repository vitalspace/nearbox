/**
 * Catálogo de progresión de SPEC-045 (copia autoritativa del servidor).
 *
 * Debe coincidir campo a campo con `frontend/src/lib/missions/progression.ts`.
 * `catalogFingerprint()` resume ambos catálogos; el test del backend y el HUD
 * comparan la huella para detectar divergencias sin duplicar la lista.
 */

export const PROGRESSION_VERSION = 1;

export type ProgressionTrackId =
	| 'barn'
	| 'royale'
	| 'gp'
	| 'hexfire'
	| 'parkour'
	| 'crypt'
	| 'explorer';

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

export const PROGRESSION_TIERS: readonly ProgressionTier[] = ['T0', 'T1', 'T2', 'T3', 'T4'];

export const TIER_GATES: Readonly<
	Record<ProgressionTier, { missions: number; catalogId?: string }>
> = {
	T0: { missions: 0 },
	T1: { missions: 2 },
	T2: { missions: 3, catalogId: 'hero' },
	T3: { missions: 3, catalogId: 'crow-warden' },
	T4: { missions: 3, catalogId: 'pumpkin-king' }
};

/** Registro de una misión completada que cuenta para los gates de tramo. */
export type CompletedMission = { id: string; track: ProgressionTrackId; tier: ProgressionTier };

const reward = (
	catalogId: string,
	label: string,
	kind: RewardRef['kind']
): RewardRef => ({ catalogId, label, kind });

const collect = (...objectiveIds: string[]): MissionObjective => ({
	type: 'collect',
	objectiveIds
});

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

/**
 * Recompensas NFT de SPEC-045: solo cosméticos que ya existen en la tienda
 * (skins, armas, assets y vehículos). No se crean medallas ni trofeos.
 */
export type RewardCatalogEntry = {
	catalogId: string;
	title: string;
	description: string;
	kind: 'cosmetic';
	icon: string;
	accent: string;
	cap: number;
	perAccountCap: number;
};

export const REWARD_CATALOG: readonly RewardCatalogEntry[] = [
	{
		catalogId: 'hero',
		title: 'Heroine',
		description: 'Heroine cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#34d399',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'crow-warden',
		title: 'Scarecrow',
		description: 'Scarecrow cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#f59e0b',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'witch',
		title: 'Witch',
		description: 'Witch cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#a78bfa',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'demon',
		title: 'Demon',
		description: 'Demon cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#f43f5e',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'frankenstein',
		title: 'Frankenstein',
		description: 'Frankenstein cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#84cc16',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'ghost',
		title: 'Ghost',
		description: 'Ghost cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#a5f3fc',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'golem',
		title: 'Golem',
		description: 'Golem cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#a8a29e',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'mummy',
		title: 'Mummy',
		description: 'Mummy cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#fde68a',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'pumpkin-king',
		title: 'Pumpkin King',
		description: 'Pumpkin King cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#fb923c',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'skeleton',
		title: 'Skeleton',
		description: 'Skeleton cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#e2e8f0',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'vampire',
		title: 'Vampire',
		description: 'Vampire cosmetic reward.',
		kind: 'cosmetic',
		icon: 'skin',
		accent: '#b91c1c',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'pistol-gold',
		title: 'Golden Pistol',
		description: 'Golden Pistol cosmetic reward.',
		kind: 'cosmetic',
		icon: 'weapon',
		accent: '#fbbf24',
		cap: 25,
		perAccountCap: 3
	},
	{
		catalogId: 'shotgun-gold',
		title: 'Golden Shotgun',
		description: 'Golden Shotgun cosmetic reward.',
		kind: 'cosmetic',
		icon: 'weapon',
		accent: '#facc15',
		cap: 25,
		perAccountCap: 3
	},
	{
		catalogId: 'mp5-gold',
		title: 'Golden SMG',
		description: 'Golden SMG cosmetic reward.',
		kind: 'cosmetic',
		icon: 'weapon',
		accent: '#f59e0b',
		cap: 25,
		perAccountCap: 3
	},
	{
		catalogId: 'sniper-gold',
		title: 'Golden Sniper',
		description: 'Golden Sniper cosmetic reward.',
		kind: 'cosmetic',
		icon: 'weapon',
		accent: '#fcd34d',
		cap: 25,
		perAccountCap: 3
	},
	{
		catalogId: 'bazooka-gold',
		title: 'Golden Bazooka',
		description: 'Golden Bazooka cosmetic reward.',
		kind: 'cosmetic',
		icon: 'weapon',
		accent: '#fbbf24',
		cap: 25,
		perAccountCap: 3
	},
	{
		catalogId: 'crown',
		title: 'Crown',
		description: 'Crown cosmetic reward.',
		kind: 'cosmetic',
		icon: 'asset',
		accent: '#fbbf24',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'coin-pistol',
		title: 'Coin Pistol',
		description: 'Coin Pistol cosmetic reward.',
		kind: 'cosmetic',
		icon: 'asset',
		accent: '#fbbf24',
		cap: 50,
		perAccountCap: 5
	},
	{
		catalogId: 'skateboard',
		title: 'Skateboard',
		description: 'Skateboard cosmetic reward.',
		kind: 'cosmetic',
		icon: 'vehicle',
		accent: '#94a3b8',
		cap: 25,
		perAccountCap: 3
	},
	{
		catalogId: 'magic-broom',
		title: 'Magic Broom',
		description: 'Magic Broom cosmetic reward.',
		kind: 'cosmetic',
		icon: 'vehicle',
		accent: '#22d3ee',
		cap: 25,
		perAccountCap: 3
	}
];

const REWARD_BY_ID = new Map(REWARD_CATALOG.map((entry) => [entry.catalogId, entry]));

export function rewardById(catalogId: string): RewardCatalogEntry | null {
	return REWARD_BY_ID.get(catalogId) ?? null;
}

/**
 * No hay catálogos exclusivos de recompensa: todos son cosméticos que también
 * se venden en la tienda, así que `sponsor-mint` sigue permitiéndolos.
 */
export const REWARD_ONLY_CATALOGS: readonly string[] = [];

const REWARD_ONLY = new Set<string>();

/** Catálogo válido para `rewardMint`: cualquiera de las recompensas del catálogo. */
export function isRewardCatalog(catalogId: string): boolean {
	return REWARD_BY_ID.has(catalogId);
}

/** Catálogo que solo se obtiene reclamando una misión (hoy no hay ninguno). */
export function isRewardOnlyCatalog(catalogId: string): boolean {
	return REWARD_ONLY.has(catalogId);
}

/** Tope de un catálogo de recompensa (cosmético existente). */
export function rewardCapFor(
	catalogId: string
): { cap: number; perAccountCap: number } | null {
	const entry = REWARD_BY_ID.get(catalogId);

	return entry ? { cap: entry.cap, perAccountCap: entry.perAccountCap } : null;
}

/** IDs de catálogo que el jugador debe poseer para desbloquear una misión. */
export function missionGateCatalogIds(mission: ProgressionMission): string[] {
	return (mission.unlock.nft ?? []).map((entry) => entry.catalogId);
}

export function maxTierValue(tier: ProgressionTier): number {
	return PROGRESSION_TIERS.indexOf(tier);
}

/**
 * FNV-1a de 32 bits sobre la forma canónica del catálogo. Es estable entre
 * Node, Bun y el navegador; no necesita `crypto`.
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
