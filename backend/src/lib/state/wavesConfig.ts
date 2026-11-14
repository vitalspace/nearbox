/**
 * Barn Siege (minigame-5) — constantes de arena y de partida.
 *
 * ⚠️ DEPENDE DEL MAPA. Todas las coordenadas de arena están medidas sobre
 * `frontend/static/barnsiege.glb`. El checkpoint de entrada sigue en el mapa
 * exterior (`map.glb`, junto al granero); al entrar en la sala se carga SOLO
 * este mapa (`sceneState.active === 'barnsiege'`). Si se sustituye el GLB hay
 * que volver a medir y actualizar solo este archivo:
 *
 *   - `ARENA_POLYGON`  — recinto completo de la aldea, hasta la valla (y = 0.5).
 *   - `ARENA_CENTER`   — centro de la plaza `(0, 0)`.
 *   - `PLAYER_SPAWNS`  — rejilla de aparición en la plaza.
 *   - `MONSTER_SPAWNS` — puntos de aparición repartidos por todo el recinto.
 *   - `BARN_CHECKPOINT`— el checkpoint físico “Barn Siege” (mapa global).
 *   - `WAVES_CAR`      — posición aparcada del coche calabaza.
 *
 * `bun run waves:check` valida todo esto contra `barnsiege.glb`.
 */

// ---------------------------------------------------------------------------
// Arena (coordenadas de mundo, y = 0.5)
// ---------------------------------------------------------------------------

export const ARENA_FLOOR_Y = 0.5;
export const ARENA_CENTER = { x: 0, z: 0 } as const;

/**
 * Zona jugable de Barn Siege: todo el recinto cerrado por la valla
 * (`BS_Fence`, ±58.3) menos un margen de seguridad para no rozarla. Antes era
 * un anillo interior de radio ≈37.5: los jugadores podían salir de él y
 * quedarse fuera del alcance de los monstruos. El servidor mantiene los
 * edificios sólidos en `BUILDING_BLOCKS`; aquí solo se define el límite
 * exterior transitable.
 */
export const ARENA_POLYGON: readonly (readonly [number, number])[] = [
	[56.5, 0],
	[52.0, 22.0],
	[40.0, 40.0],
	[22.0, 52.0],
	[0, 56.5],
	[-22.0, 52.0],
	[-40.0, 40.0],
	[-52.0, 22.0],
	[-56.5, 0],
	[-52.0, -22.0],
	[-40.0, -40.0],
	[-22.0, -52.0],
	[0, -56.5],
	[22.0, -52.0],
	[40.0, -40.0],
	[52.0, -22.0]
];

/** Checkpoint físico "Barn Siege" delante de la puerta sur del granero (mapa global). */
export const BARN_CHECKPOINT = { x: -41.6, y: 0.4, z: 32.6 } as const;

/** Teletransporte al salir de la partida (mapa global, junto al granero). */
export const WAVES_EXIT = { ...BARN_CHECKPOINT } as const;

/** Rejilla de aparición: plaza central, al sur del granero de `barnsiege`. */
export const PLAYER_SPAWNS: readonly { x: number; y: number; z: number }[] = [
	{ x: -6.0, y: 0.55, z: -6.0 },
	{ x: -2.0, y: 0.55, z: -6.0 },
	{ x: 2.0, y: 0.55, z: -6.0 },
	{ x: 6.0, y: 0.55, z: -6.0 },
	{ x: -6.0, y: 0.55, z: -2.0 },
	{ x: -2.0, y: 0.55, z: -2.0 },
	{ x: 2.0, y: 0.55, z: -2.0 },
	{ x: 6.0, y: 0.55, z: -2.0 },
	{ x: -6.0, y: 0.55, z: 2.0 },
	{ x: -2.0, y: 0.55, z: 2.0 },
	{ x: 2.0, y: 0.55, z: 2.0 },
	{ x: 6.0, y: 0.55, z: 2.0 }
];

/**
 * Puntos de aparición de los monstruos. Antes eran solo los seis portales del
 * anillo interior; ahora cubren todo el recinto amurallado para que no exista
 * una zona “segura” en el borde desde la que matar sin riesgo. El servidor
 * elige en cada spawn el punto más lejano a los jugadores vivos (con 14 m de
 * separación mínima) y el cliente dibuja allí el portal de aparición.
 *
 * Los seis primeros conservan los nombres de los portales decorativos
 * (`BS_Portal_*`); el resto son claros, calles y esquinas del resto de la
 * aldea. `bun run waves:check` comprueba que ninguno cae dentro de un edificio.
 */
export const MONSTER_SPAWNS = [
	{ id: 'gate', x: 0, z: 32.0 },
	{ id: 'barn', x: -16.0, z: -31.0 },
	{ id: 'farmhouse', x: 29.0, z: 17.0 },
	{ id: 'fields', x: -29.0, z: 17.0 },
	{ id: 'giant-pumpkin', x: 29.0, z: -16.0 },
	{ id: 'silo', x: -29.0, z: -16.0 },
	// Perímetro y zonas exteriores del recinto (todo el suelo transitable).
	{ id: 'south-east-gate', x: 22.0, z: -50.0 },
	{ id: 'north-west-field', x: -30.0, z: 46.0 },
	{ id: 'north-east-field', x: 30.0, z: 46.0 },
	{ id: 'west-gate', x: -54.0, z: 2.0 },
	{ id: 'east-gate', x: 54.0, z: 2.0 },
	{ id: 'south-west-gate', x: -6.0, z: -54.0 },
	{ id: 'north-gate-outer', x: -6.0, z: 54.0 },
	{ id: 'south-west-corner', x: -46.0, z: -30.0 },
	{ id: 'south-east-corner', x: 46.0, z: -30.0 },
	{ id: 'north-west-corner', x: -46.0, z: 30.0 },
	{ id: 'north-east-corner', x: 46.0, z: 30.0 },
	{ id: 'south-field', x: -30.0, z: -46.0 },
	{ id: 'lake-south', x: 6.0, z: -34.0 },
	{ id: 'windmill-south', x: 14.0, z: 42.0 },
	{ id: 'plaza', x: -2.0, z: -2.0 },
	{ id: 'south-west-field', x: -18.0, z: -50.0 },
	{ id: 'north-west-field-2', x: -18.0, z: 50.0 },
	{ id: 'west-edge', x: -54.0, z: -10.0 },
	{ id: 'east-edge', x: 54.0, z: -10.0 },
	{ id: 'north-edge', x: 6.0, z: 54.0 },
	{ id: 'west-plaza', x: -38.0, z: -2.0 },
	{ id: 'east-plaza', x: 38.0, z: -2.0 },
	{ id: 'north-west-plaza', x: -18.0, z: 30.0 },
	{ id: 'north-east-plaza', x: 22.0, z: 30.0 }
] as const;

export type MonsterSpawnId = (typeof MONSTER_SPAWNS)[number]['id'];

/** Coche calabaza aparcado en el este de la plaza (posición e yaw inicial). */
export const WAVES_CAR = { x: 6.5, y: 1.5, z: -1.5, yaw: Math.PI } as const;

/**
 * Rampas y plataformas elevadas que los monstruos pueden subir. No hay
 * navmesh: el servidor aproxima cada escalera como una rampa lineal y usa
 * `monsterGroundHeight()` para decidir la altura de los pies. Medido sobre
 * `barnsiege.glb` (los dos miradores, `ADD_Mirador_Wood` y
 * `ADD_Mirador_Stone`). Al cambiar el mapa hay que volver a medir.
 */
export type MonsterClimb = {
	/** Plataforma superior transitable. */
	top: { minX: number; maxX: number; minZ: number; maxZ: number; y: number };
	/** Rampa de subida: `zBottom` es el pie (sur) y `zTop` la coronación (norte). */
	ramp: {
		minX: number;
		maxX: number;
		zBottom: number;
		zTop: number;
		yBottom: number;
		yTop: number;
	};
	/** Punto de tierra firme al pie de la rampa. */
	entry: { x: number; z: number };
};

export const MONSTER_CLIMBS: readonly MonsterClimb[] = [
	{
		// Mirador de madera (oeste): rampa en la cara este, sube hacia el norte.
		top: { minX: -27.15, maxX: -24.85, minZ: -17.15, maxZ: -14.25, y: 3.46 },
		ramp: {
			minX: -26.65,
			maxX: -25.35,
			zBottom: -8.55,
			zTop: -14.25,
			yBottom: ARENA_FLOOR_Y,
			yTop: 3.31
		},
		entry: { x: -26.0, z: -7.4 }
	},
	{
		// Mirador de piedra (este): misma escalera, espejada en X.
		top: { minX: 24.85, maxX: 27.15, minZ: -17.15, maxZ: -14.25, y: 3.46 },
		ramp: {
			minX: 25.35,
			maxX: 26.65,
			zBottom: -8.55,
			zTop: -14.25,
			yBottom: ARENA_FLOOR_Y,
			yTop: 3.31
		},
		entry: { x: 26.0, z: -7.4 }
	}
];

export type ArenaBlock = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Volúmenes bloqueantes de `barnsiege.glb` (mundo). Los monstruos no tienen
 * físicas de malla: se deslizan por el borde o se detienen; nunca entran en el
 * granero, el silo, la casa en ruinas, la calabaza gigante, el lago, el pozo,
 * el carro ni las casas del resto de la aldea. Los dos miradores son sólidos
 * salvo por su rampa, que `insideBuildingBlock()` deja pasar para subir.
 *
 * Vive aquí (y no en `waves.ts`) para que `waves:check` valide los puntos de
 * aparición contra los mismos volúmenes que usa la IA.
 */
export const BUILDING_BLOCKS: readonly ArenaBlock[] = [
	{ minX: -7.95, maxX: 7.95, minZ: -22.77, maxZ: -8.23 }, // BS_Barn
	{ minX: -19.0, maxX: -14.0, minZ: -14.05, maxZ: -8.95 }, // BS_Silo
	{ minX: 11.94, maxX: 22.03, minZ: -13.21, maxZ: -6.17 }, // BS_FarmhouseRuin
	{ minX: 15.18, maxX: 21.86, minZ: 4.35, maxZ: 10.65 }, // BS_GiantPumpkin
	{ minX: 6.85, maxX: 24.47, minZ: -31.07, maxZ: -15.36 }, // BS_LakeShore/Water
	{ minX: -10.2, maxX: -6.8, minZ: 11.32, maxZ: 14.68 }, // BS_Well
	{ minX: 8.6, maxX: 13.81, minZ: 2.35, maxZ: 4.65 }, // BS_Cart
	{ minX: -27.75, maxX: -24.25, minZ: -17.8, maxZ: -9.0 }, // ADD_Mirador_Wood
	{ minX: 24.25, maxX: 27.75, minZ: -17.8, maxZ: -9.0 }, // ADD_Mirador_Stone
	// Edificios del resto del recinto (medidos sobre `barnsiege.glb`).
	{ minX: -38.8, maxX: -26.0, minZ: -38.8, maxZ: -26.0 }, // BS_Granary
	{ minX: 9.4, maxX: 16.7, minZ: 45.0, maxZ: 52.5 }, // BS_Windmill
	{ minX: 26.2, maxX: 43.8, minZ: -43.8, maxZ: -26.2 }, // BS_VillageBarns (NE)
	{ minX: -55.4, maxX: -40.2, minZ: 4.1, maxZ: 19.7 }, // BS_VillageBarns (O)
	{ minX: -41.3, maxX: -26.6, minZ: 26.6, maxZ: 41.3 }, // BS_VillageHouses (NO)
	{ minX: 26.5, maxX: 40.7, minZ: 26.5, maxZ: 40.7 }, // BS_VillageHouses (NE)
	{ minX: 5.8, maxX: 19.1, minZ: -52.5, maxZ: -39.7 }, // BS_VillageHouses (S)
	{ minX: 39.4, maxX: 51.8, minZ: -18.7, maxZ: -5.9 }, // BS_VillageHouses (E)
	{ minX: -51.7, maxX: -39.5, minZ: -18.5, maxZ: -6.1 }, // BS_VillageHouses (O)
	{ minX: 40.6, maxX: 52.5, minZ: 6.5, maxZ: 18.6 }, // BS_VillageHouses (ENE)
	{ minX: 17.7, maxX: 23.9, minZ: -38.9, maxZ: -33.1 }, // BS_Shops (NE)
	{ minX: -23.9, maxX: -17.7, minZ: -38.9, maxZ: -33.1 }, // BS_Shops (NO)
	{ minX: -23.9, maxX: -17.7, minZ: 33.1, maxZ: 38.9 }, // BS_Shops (SO)
	{ minX: 17.7, maxX: 23.9, minZ: 33.1, maxZ: 38.9 } // BS_Shops (SE)
];

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

export const WAVES_TOTAL = 8;
export const WAVES_COUNTDOWN_MS = 30_000;
export const WAVES_COUNTDOWN_FULL_MS = 10_000;
export const WAVES_MAX_PLAYERS = 12;
export const WAVES_INTERMISSION_MS = 12_000;
export const WAVES_RESULT_MS = 15_000;
export const WAVES_SPAWN_STAGGER_MS = 650;
export const WAVES_SPAWN_TELEGRAPH_MS = 1_000;
/** Tiempo que el monstruo queda materializándose antes de poder moverse. */
export const WAVES_SPAWN_ACTIVATE_MS = 900;
/** Distancia mínima a la que se elige un portal respecto a los jugadores vivos. */
export const WAVES_SPAWN_SAFE_DISTANCE = 14;
export const WAVES_MAX_CONCURRENT = 26;
export const WAVES_REVIVE_HEALTH = 50;
/** Ventana mínima entre golpes directos distintos para no morir en un tick. */
export const WAVES_PLAYER_HIT_GRACE_MS = 300;

// ---------------------------------------------------------------------------
// Aliento de fuego (Demon)
// ---------------------------------------------------------------------------

/**
 * El demonio escupe una llamarada en cono desde la boca. El daño se aplica
 * por ticks mientras dura el chorro, no de golpe: el servidor valida cono,
 * alcance y altura; el cliente solo dibuja el cono con el shader.
 */
export const DEMON_FIRE_RANGE = 8.5;
/** Semiángulo del cono (~20.6°): estrecho cerca de la boca y ancho al final. */
export const DEMON_FIRE_HALF_ANGLE = 0.36;
export const DEMON_FIRE_DURATION_MS = 950;
export const DEMON_FIRE_TICK_MS = 320;
/** Altura del chorro respecto a los pies del monstruo: sube a la boca. */
export const DEMON_FIRE_MOUTH_HEIGHT = 1.56;
/**
 * El aliento del demonio es un cono 3D que se reorienta hacia el objetivo
 * (`aimBreath`), así que puede subir por la rampa de un mirador. El límite
 * vertical solo evita que alcance a alguien en un tejado muy alto; con 6 m
 * cubre de sobra la plataforma de los miradores (~3 m).
 */
export const DEMON_FIRE_VERTICAL_REACH = 6;

// ---------------------------------------------------------------------------
// Roca de lava (Golem)
// ---------------------------------------------------------------------------

/**
 * El Golem ya no pega melé: arranca una roca de lava y la lanza en arco.
 * La roca apunta a la posición y altura reales del objetivo en el momento del
 * lanzamiento, así que se puede esquivar moviéndose. Al impactar daña en un
 * radio pequeño y, si alcanza a un jugador, el servidor emite `rock-hit` para
 * que su cliente lo lance por los aires (el vuelo lo simula la física local).
 */
export const GOLEM_ROCK_RANGE = 19;
export const GOLEM_ROCK_DAMAGE = 32;
export const GOLEM_ROCK_COOLDOWN_MS = 3_200;
/** Velocidad media de la roca: define el tiempo de vuelo (se puede esquivar). */
export const GOLEM_ROCK_SPEED = 18;
export const GOLEM_ROCK_GRAVITY = 12;
export const GOLEM_ROCK_MIN_FLIGHT = 0.55;
export const GOLEM_ROCK_MAX_FLIGHT = 1.45;
/** Radio de daño al estallar / romperse la roca. */
export const GOLEM_ROCK_IMPACT_RADIUS = 2.0;
export const GOLEM_ROCK_VERTICAL_REACH = 2.6;
/**
 * Anticipación del lanzamiento sobre la velocidad reportada del objetivo
 * (0 = apuntar a donde estaba, 1 = apuntar a donde estará al impactar).
 * Antes se apuntaba al punto de lanzamiento y correr en línea recta dejaba
 * al jugador totalmente a salvo; con 0.8 una huida recta recibe el impacto y
 * para esquivar hay que cambiar de dirección después del lanzamiento.
 */
export const GOLEM_ROCK_TARGET_LEAD = 0.8;
/** Radio del proyectil para el barrido continuo contra el cuerpo del jugador. */
export const GOLEM_ROCK_SWEEP_RADIUS = 0.7;
/** Empuje horizontal, salto vertical y amortiguación del vuelo del jugador. */
export const GOLEM_ROCK_KNOCKBACK_SPEED = 10;
export const GOLEM_ROCK_KNOCKBACK_LIFT = 6.2;
export const GOLEM_ROCK_KNOCKBACK_DAMPING = 2.6;

// ---------------------------------------------------------------------------
// Monstruos
// ---------------------------------------------------------------------------

export type Mg5MonsterKind =
	| 'skeleton'
	| 'mummy'
	| 'frankenstein'
	| 'golem'
	| 'demon'
	| 'scarecrow'
	| 'ghost'
	| 'witch'
	| 'vampire'
	| 'pumpkin-king';

export type Mg5AttackType = 'melee' | 'acid' | 'fire' | 'rock';

export type Mg5MonsterDefinition = {
	kind: Mg5MonsterKind;
	name: string;
	maxHealth: number;
	speed: number;
	damage: number;
	attack: Mg5AttackType;
	/** Alcance de melé o distancia máxima de lanzamiento (ácido). */
	range: number;
	/** Enfriamiento entre ataques. */
	cooldownMs: number;
	/** Estatura objetivo para el render. */
	height: number;
	/** Skin de `cosmetics/skins.ts` usada para renderizarlo. */
	skinId:
		| 'skeleton'
		| 'mummy'
		| 'frankenstein'
		| 'golem'
		| 'demon'
		| 'crow-warden'
		| 'ghost'
		| 'witch'
		| 'vampire'
		| 'pumpkin-king';
	/** Puntos por baja. */
	score: number;
};

export const MONSTER_DEFINITIONS: readonly Mg5MonsterDefinition[] = [
	{
		kind: 'skeleton',
		name: 'Skeleton',
		maxHealth: 40,
		speed: 2.6,
		damage: 8,
		attack: 'melee',
		range: 2.0,
		cooldownMs: 1200,
		height: 1.9,
		skinId: 'skeleton',
		score: 10
	},
	{
		kind: 'mummy',
		name: 'Mummy',
		maxHealth: 80,
		speed: 1.9,
		damage: 12,
		attack: 'melee',
		range: 2.0,
		cooldownMs: 1300,
		height: 2.0,
		skinId: 'mummy',
		score: 15
	},
	{
		kind: 'frankenstein',
		name: 'Frankenstein',
		maxHealth: 130,
		speed: 1.6,
		damage: 18,
		attack: 'melee',
		range: 2.2,
		cooldownMs: 1500,
		height: 2.1,
		skinId: 'frankenstein',
		score: 20
	},
	{
		kind: 'golem',
		name: 'Golem',
		maxHealth: 220,
		speed: 1.25,
		damage: GOLEM_ROCK_DAMAGE,
		attack: 'rock',
		range: GOLEM_ROCK_RANGE,
		cooldownMs: GOLEM_ROCK_COOLDOWN_MS,
		height: 2.6,
		skinId: 'golem',
		score: 35
	},
	{
		kind: 'demon',
		name: 'Demon',
		maxHealth: 95,
		speed: 2.4,
		damage: 16,
		attack: 'fire',
		range: DEMON_FIRE_RANGE,
		cooldownMs: 2600,
		height: 2.0,
		skinId: 'demon',
		score: 25
	},
	{
		kind: 'scarecrow',
		name: 'Scarecrow',
		maxHealth: 85,
		speed: 2.3,
		damage: 12,
		attack: 'melee',
		range: 2.1,
		cooldownMs: 1200,
		height: 2.0,
		skinId: 'crow-warden',
		score: 15
	},
	{
		kind: 'ghost',
		name: 'Ghost',
		maxHealth: 45,
		speed: 3.6,
		damage: 10,
		attack: 'melee',
		range: 1.8,
		cooldownMs: 900,
		height: 1.8,
		skinId: 'ghost',
		score: 10
	},
	{
		kind: 'witch',
		name: 'Witch',
		maxHealth: 60,
		speed: 2.1,
		damage: 10,
		attack: 'acid',
		range: 16,
		cooldownMs: 2600,
		height: 1.8,
		skinId: 'witch',
		score: 20
	},
	{
		kind: 'vampire',
		name: 'Vampire',
		maxHealth: 75,
		speed: 2.9,
		damage: 12,
		attack: 'acid',
		range: 14,
		cooldownMs: 2200,
		height: 1.9,
		skinId: 'vampire',
		score: 20
	},
	{
		kind: 'pumpkin-king',
		name: 'Pumpkin King',
		maxHealth: 160,
		speed: 1.9,
		damage: 18,
		attack: 'acid',
		range: 20,
		cooldownMs: 3000,
		height: 2.4,
		skinId: 'pumpkin-king',
		score: 50
	}
];

export const MONSTER_BY_KIND: ReadonlyMap<Mg5MonsterKind, Mg5MonsterDefinition> = new Map(
	MONSTER_DEFINITIONS.map((definition) => [definition.kind, definition])
);

/**
 * Diferencia vertical máxima entre los pies del monstruo y los del jugador
 * para que un golpe de melé conecte. Evita pegar a través del suelo de una
 * plataforma o desde el pie de una escalera.
 */
export const MELEE_VERTICAL_REACH = 1.6;

/**
 * Altura máxima que un monstruo puede subir en un solo paso de IA. Las
 * rampas de los miradores suben ~0.12 m por tick; una pared son 3 m, así que
 * este valor deja subir escaleras y bloquea muros.
 */
export const MONSTER_MAX_STEP = 0.35;

export type WaveDefinition = {
	name: string;
	monsters: Partial<Record<Mg5MonsterKind, number>>;
};

export const WAVE_DEFINITIONS: readonly WaveDefinition[] = [
	{ name: 'Cornfield Skeletons', monsters: { skeleton: 6 } },
	{ name: 'The Undead', monsters: { skeleton: 6, mummy: 3 } },
	{ name: 'Bandages and Bones', monsters: { mummy: 5, skeleton: 4, witch: 2 } },
	{ name: 'Fresh Meat', monsters: { frankenstein: 3, mummy: 4, vampire: 2 } },
	{ name: 'Stone and Fire', monsters: { golem: 2, demon: 4, witch: 2, vampire: 2 } },
	{ name: 'The Harvest', monsters: { 'pumpkin-king': 2, demon: 4, scarecrow: 3, witch: 2 } },
	{
		name: 'The Coven',
		monsters: { golem: 3, demon: 4, 'pumpkin-king': 2, vampire: 3, ghost: 4 }
	},
	{
		name: 'The Final Night',
		monsters: {
			'pumpkin-king': 2,
			demon: 4,
			golem: 2,
			witch: 2,
			vampire: 2,
			ghost: 4,
			skeleton: 6
		}
	}
];

// ---------------------------------------------------------------------------
// Ácido
// ---------------------------------------------------------------------------

export const ACID_POOL_RADIUS = 2.2;
export const ACID_POOL_DPS = 8;
export const ACID_POOL_DURATION_MS = 6_000;
export const ACID_MAX_POOLS = 10;
export const ACID_DIRECT_RADIUS = 1.2;
export const ACID_GRAVITY = 9.8;
/**
 * Anticipación del lanzamiento sobre la velocidad reportada del objetivo.
 * Se apunta algo por delante para que correr en línea recta no conceda
 * inmunidad; cambiar de dirección (o frenar) después del lanzamiento sigue
 * esquivando el charco.
 */
export const ACID_TARGET_LEAD = 0.85;
/** Radio del proyectil para el barrido continuo contra el cuerpo del jugador. */
export const ACID_SWEEP_RADIUS = 0.45;
/**
 * Los charcos se quedan en la superficie donde impacta el proyectil. El
 * proyectil de ácido se lanza resolviendo la parábola contra la altura real
 * del objetivo, así que puede estallar en la rampa o la plataforma de un
 * mirador; el charco solo daña a quien está a ≤1.4 m de esa superficie.
 * Un charco en el suelo no alcanza a quien está arriba (ni al revés).
 */
export const ACID_VERTICAL_REACH = 1.4;

// ---------------------------------------------------------------------------
// Armas
// ---------------------------------------------------------------------------

export type Mg5WeaponId = 'pistol' | 'shotgun' | 'smg' | 'rifle';

export type Mg5WeaponDefinition = {
	id: Mg5WeaponId;
	name: string;
	damage: number;
	/** Disparos por segundo. */
	rate: number;
	range: number;
	magSize: number;
	/** `Infinity` para la pistola (reserva infinita). */
	pellets?: number;
	/** Dispersión en radianes (escopeta). */
	spread?: number;
	auto: boolean;
};

export const WEAPON_DEFINITIONS: readonly Mg5WeaponDefinition[] = [
	{
		id: 'pistol',
		name: 'Rusty Pistol',
		damage: 12,
		rate: 6,
		range: 55,
		magSize: 12,
		auto: false
	},
	{
		id: 'shotgun',
		name: 'Shotgun',
		damage: 6,
		rate: 0.9,
		range: 20,
		magSize: 6,
		pellets: 8,
		spread: (7 * Math.PI) / 180,
		auto: false
	},
	{ id: 'smg', name: 'SMG', damage: 9, rate: 11, range: 42, magSize: 30, auto: true },
	{ id: 'rifle', name: 'Hunting Rifle', damage: 46, rate: 1.5, range: 130, magSize: 5, auto: false }
];

export const WEAPON_BY_ID: ReadonlyMap<Mg5WeaponId, Mg5WeaponDefinition> = new Map(
	WEAPON_DEFINITIONS.map((weapon) => [weapon.id, weapon])
);

/**
 * Fixed inventory slots (PUBG-style): `1` pistol, `2` shotgun, `3` SMG,
 * `4` rifle. Picking a weapon fills its slot instead of replacing the
 * equipped one; `1`–`4` switch between the owned weapons.
 */
export const WEAPON_SLOT_BY_ID: Readonly<Record<Mg5WeaponId, number>> = {
	pistol: 1,
	shotgun: 2,
	smg: 3,
	rifle: 4
};

export const WEAPON_BY_SLOT: Readonly<Record<number, Mg5WeaponId>> = {
	1: 'pistol',
	2: 'shotgun',
	3: 'smg',
	4: 'rifle'
};

export const INVENTORY_SLOT_COUNT = 4;

export const STARTER_WEAPON: Mg5WeaponId = 'pistol';
export const STARTER_AMMO = 60;
export const STARTER_GRENADES = 1;
export const MAX_GRENADES = 6;
export const AMMO_PACK_AMOUNT = 50;
export const MEDKIT_AMOUNT = 40;

export const GRENADE_DAMAGE = 75;
export const GRENADE_EDGE_DAMAGE = 30;
export const GRENADE_RADIUS = 4.5;
/** La explosión no atraviesa plataformas: mismo alcance vertical razonable. */
export const GRENADE_VERTICAL_REACH = 2.5;
export const GRENADE_FUSE_MS = 1_500;

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------

export type Mg5DropKind = 'shotgun' | 'smg' | 'rifle' | 'grenade' | 'ammo' | 'medkit';

export const DROP_TABLE: readonly { kind: Mg5DropKind; weight: number }[] = [
	{ kind: 'grenade', weight: 22 },
	{ kind: 'shotgun', weight: 18 },
	{ kind: 'smg', weight: 16 },
	{ kind: 'ammo', weight: 14 },
	{ kind: 'rifle', weight: 10 },
	{ kind: 'medkit', weight: 12 }
];
export const DROP_NOTHING_WEIGHT = 8;
export const DROP_PICKUP_RADIUS = 1.6;
export const DROP_DESPAWN_MS = 45_000;

// ---------------------------------------------------------------------------
// Coche
// ---------------------------------------------------------------------------

export const WAVES_CAR_MAX_HEALTH = 600;
export const WAVES_CAR_RAM_DAMAGE = 55;
export const WAVES_CAR_RAM_COOLDOWN_MS = 700;
export const WAVES_CAR_ENTER_RADIUS = 2.5;
export const WAVES_CAR_RAM_RADIUS = 2.3;
export const WAVES_CAR_EJECT_DAMAGE = 25;

// ---------------------------------------------------------------------------
// Jugador
// ---------------------------------------------------------------------------

export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_SPEED_CAP = 9;

// ---------------------------------------------------------------------------
// Grupos de colisión Rapier (memberships<<16 | filter, regla AND de Rapier)
// ---------------------------------------------------------------------------

export const GROUP_MONSTER = 0x0010;
export const GROUP_WAVECAR = 0x0020;

/**
 * Monstruos: pertenecen al grupo 4 y solo colisionan con el grupo 0
 * (mapa/jugadores). No chocan con el coche (grupo 5).
 *
 * `@threlte/rapier` no acepta `collisionGroups` como prop de `Collider`;
 * se aplican con `<CollisionGroups memberships filter>` usando índices de bit.
 */
export const MONSTER_COLLISION_BITS: { memberships: [4]; filter: [0] } = {
	memberships: [4],
	filter: [0]
};
/** Coche del minijuego: choca con el mapa y los jugadores, atraviesa monstruos. */
export const WAVECAR_COLLISION_GROUPS = (GROUP_WAVECAR << 16) | 0x0001;
