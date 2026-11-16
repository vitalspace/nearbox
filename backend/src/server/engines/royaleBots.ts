/**
 * Controlador de bots de Skyfall Royale.
 *
 * La IA vive solo en el servidor: percibe con LOS contra los oclusores,
 * navega con A*, recoge loot con las mismas reglas que un humano, dispara con
 * error determinista y usa la misma tormenta y el mismo hitscan. Nunca envía
 * mensajes ni ocupa plazas de `maxPlayers`.
 */
import {
	ROYALE_BOT_AIM_ERROR_MAX_DEG,
	ROYALE_BOT_AIM_ERROR_MIN_DEG,
	ROYALE_BOT_ENGAGE_DELAY_MS,
	ROYALE_BOT_FOV_RAD,
	ROYALE_BOT_GRENADE_CD_MS,
	ROYALE_BOT_GROUND_SPEED,
	ROYALE_BOT_JUMP_MAX_MS,
	ROYALE_BOT_JUMP_MIN_MS,
	ROYALE_BOT_LOOT_SCAN,
	ROYALE_BOT_REACTION_MAX_MS,
	ROYALE_BOT_REACTION_MIN_MS,
	ROYALE_BOT_ROTATE_SPEED,
	ROYALE_BOT_VIEW_RANGE,
	ROYALE_GLIDE_FALL,
	ROYALE_GLIDE_SPEED,
	ROYALE_KILL_Y,
	ROYALE_LOOT_VERTICAL,
	ROYALE_MAX_AMMO,
	ROYALE_MAX_GRENADES,
	ROYALE_POIS,
	ROYALE_SKYDIVE_DEPLOY_MS,
	ROYALE_SKYDIVE_DEPLOY_Y,
	ROYALE_SKYDIVE_MAX_FALL,
	ROYALE_SKYDIVE_SPEED,
	ROYALE_WEAPON_BY_ID,
	ROYALE_WEAPONS,
	mulberry32,
	royaleBotStormMargin,
	royaleDistance,
	royaleInSafeZone,
	royaleZeppelinAt,
	type RoyaleLootKind,
	type RoyaleMode,
	type RoyaleVec3,
	type RoyaleWeaponId
} from '../../lib/state/royaleConfig';

export type BotInventory = Map<RoyaleWeaponId, number>;

export type BotLoot = {
	id: string;
	kind: RoyaleLootKind;
	weapon: RoyaleWeaponId | null;
	x: number;
	y: number;
	z: number;
	available: boolean;
};

export type BotStorm = {
	phase: number;
	cx: number;
	cz: number;
	radius: number;
	nextCx: number;
	nextCz: number;
	nextRadius: number;
	endsAt: number;
	state: 'wait' | 'shrink';
	dps: number;
};

export type BotMind = {
	index: number;
	random: () => number;
	jumpAt: number;
	jumpStartedAt: number;
	landing: RoyaleVec3;
	path: RoyaleVec3[] | null;
	pathIndex: number;
	repathAt: number;
	goalX: number | null;
	goalZ: number | null;
	relayX: number | null;
	relayZ: number | null;
	relayUntil: number;
	targetLootId: string | null;
	targetId: string | null;
	lastSeenX: number;
	lastSeenZ: number;
	lastSeenAt: number;
	nextThinkAt: number;
	reactionUntil: number;
	/** Instante a partir del cual el bot puede atacar. */
	engageAt: number;
	aimError: number;
	burstLeft: number;
	burstPauseUntil: number;
	strafeDir: number;
	nextGrenadeAt: number;
	stuckAt: number;
	lastX: number;
	lastZ: number;
	failCount: number;
	/** Velocidad e intención continuas: el bot piensa a 5 Hz pero se mueve a 10 Hz. */
	vx: number;
	vz: number;
	moveSpeed: number;
	moveYaw: number;
	yawTarget: number;
	intent: 'idle' | 'path' | 'strafe' | 'direct';
	strafeX: number;
	strafeZ: number;
	strafeUntil: number;
	/** Ticks seguidos sin desplazarse; dispara un empujón hacia una celda libre. */
	stillTicks: number;
	/** Ventana durante la que el empujón tiene prioridad sobre cualquier intención. */
	fallbackUntil: number;
	fallbackX: number | null;
	fallbackZ: number | null;
	patrolX: number | null;
	patrolZ: number | null;
	patrolUntil: number;
	wanderX: number | null;
	wanderZ: number | null;
	wanderUntil: number;
	safePhase: number;
	safeX: number | null;
	safeZ: number | null;
};

export type BotPlayer = {
	id: string;
	isBot: boolean;
	alive: boolean;
	health: number;
	shield: number;
	weapon: RoyaleWeaponId;
	magAmmo: number;
	reserveAmmo: number;
	grenades: number;
	inventory: BotInventory;
	mode: RoyaleMode;
	x: number;
	y: number;
	z: number;
	yaw: number;
	vy: number;
	seat: number;
	jumped: boolean;
	lastShotAt: number;
	lastReloadAt: number;
	lastGrenadeAt: number;
	lastAttackerId: string | null;
	lastAttackerAt: number;
	bot?: BotMind;
};

export type BotWorld = {
	now: number;
	players: BotPlayer[];
	loot: BotLoot[];
	storm: BotStorm;
	aliveCount: number;
	findPath: (from: RoyaleVec3, to: RoyaleVec3) => RoyaleVec3[] | null;
	hasLineOfSight: (from: RoyaleVec3, to: RoyaleVec3) => boolean;
	floorHeight: (x: number, z: number) => number | null;
	safePoint: (storm: BotStorm, x: number, z: number) => { x: number; z: number };
	jump: (player: BotPlayer) => void;
	shoot: (
		shooter: BotPlayer,
		dir: { x: number; y: number; z: number },
		targetId: string | null
	) => void;
	throwGrenade: (shooter: BotPlayer, point: { x: number; z: number }) => void;
	emit: (
		kind: 'player-landed',
		extra: { playerId: string; x: number; y: number; z: number; mode: RoyaleMode }
	) => void;
	markDirty: () => void;
};

/** Estado inicial del bot al entrar en la partida (o al rellenar). */
export function createBotMind(
	seed: number,
	index: number,
	anchor: RoyaleVec3,
	boardingStartedAt: number
): BotMind {
	const random = mulberry32((seed ^ (index * 0x9e3779b9)) >>> 0);

	// Salta cuando el zepelín pasa más cerca de su ancla: así el planeo
	// siempre tiene alcance suficiente y no cae al mar.
	let jumpDelay = ROYALE_BOT_JUMP_MIN_MS;
	let closest = Number.POSITIVE_INFINITY;

	for (let elapsed = ROYALE_BOT_JUMP_MIN_MS; elapsed <= ROYALE_BOT_JUMP_MAX_MS; elapsed += 100) {
		const point = royaleZeppelinAt(0, elapsed);
		const distance = Math.hypot(point.x - anchor.x, point.z - anchor.z);

		if (distance < closest - 1e-6) {
			closest = distance;
			jumpDelay = elapsed;
		}
	}

	// Pequeña variación para que dos bots con el mismo ancla no salten a la vez.
	jumpDelay = Math.max(
		ROYALE_BOT_JUMP_MIN_MS,
		Math.min(ROYALE_BOT_JUMP_MAX_MS, jumpDelay + Math.round((random() * 2 - 1) * 200))
	);

	const aimErrorDeg =
		ROYALE_BOT_AIM_ERROR_MIN_DEG +
		random() * (ROYALE_BOT_AIM_ERROR_MAX_DEG - ROYALE_BOT_AIM_ERROR_MIN_DEG);

	return {
		index,
		random,
		jumpAt: boardingStartedAt + jumpDelay,
		jumpStartedAt: 0,
		landing: { ...anchor },
		path: null,
		pathIndex: 0,
		repathAt: 0,
		goalX: null,
		goalZ: null,
		relayX: null,
		relayZ: null,
		relayUntil: 0,
		targetLootId: null,
		targetId: null,
		lastSeenX: 0,
		lastSeenZ: 0,
		lastSeenAt: 0,
		nextThinkAt: 0,
		reactionUntil: 0,
		engageAt: boardingStartedAt + ROYALE_BOT_ENGAGE_DELAY_MS,
		aimError: (aimErrorDeg * Math.PI) / 180,
		burstLeft: 0,
		burstPauseUntil: 0,
		strafeDir: random() < 0.5 ? -1 : 1,
		nextGrenadeAt: 0,
		stuckAt: 0,
		lastX: anchor.x,
		lastZ: anchor.z,
		failCount: 0,
		vx: 0,
		vz: 0,
		moveSpeed: ROYALE_BOT_GROUND_SPEED,
		moveYaw: 0,
		yawTarget: 0,
		intent: 'idle',
		strafeX: 0,
		strafeZ: 0,
		strafeUntil: 0,
		stillTicks: 0,
		fallbackUntil: 0,
		fallbackX: null,
		fallbackZ: null,
		patrolX: null,
		patrolZ: null,
		patrolUntil: 0,
		wanderX: null,
		wanderZ: null,
		wanderUntil: 0,
		safePhase: -1,
		safeX: null,
		safeZ: null
	};
}

function eye(player: BotPlayer): RoyaleVec3 {
	return { x: player.x, y: player.y + 1.2, z: player.z };
}

function hasLos(world: BotWorld, a: BotPlayer, b: BotPlayer): boolean {
	return world.hasLineOfSight(eye(a), eye(b));
}

function distanceTo(player: BotPlayer, target: { x: number; z: number }): number {
	return royaleDistance(player.x, player.z, target.x, target.z);
}

/** Enemigo visible más cercano, o el objetivo retenido durante 2 s. */
function findTarget(world: BotWorld, player: BotPlayer, mind: BotMind): BotPlayer | null {
	const now = world.now;
	const retained =
		mind.targetId !== null
			? (world.players.find((item) => item.id === mind.targetId) ?? null)
			: null;

	if (retained && retained.alive && now - mind.lastSeenAt <= 2_000) {
		const distance = distanceTo(player, retained);
		if (distance <= ROYALE_BOT_VIEW_RANGE * 1.6) {
			// La memoria de 2 s solo se refresca con LOS real. Antes el bot
			// copiaba la posición exacta del objetivo cada tick aunque hubiera
			// una pared en medio: sabía dónde estabas y lanzaba granadas a
			// través del edificio.
			if (hasLos(world, player, retained)) {
				mind.lastSeenX = retained.x;
				mind.lastSeenZ = retained.z;
				mind.lastSeenAt = now;
			}

			return retained;
		}
	}

	let best: BotPlayer | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	const forwardX = Math.sin(player.yaw);
	const forwardZ = Math.cos(player.yaw);

	for (const enemy of world.players) {
		if (!enemy.alive || enemy.id === player.id) continue;
		if (enemy.mode === 'riding') continue;

		const dx = enemy.x - player.x;
		const dz = enemy.z - player.z;
		const distance = Math.hypot(dx, dz);

		if (distance > ROYALE_BOT_VIEW_RANGE || distance < 1e-3) continue;

		const angle = Math.acos(Math.min(1, Math.max(-1, (dx * forwardX + dz * forwardZ) / distance)));

		// Un bot que ya estaba en combate mantiene el ángulo más amplio.
		const fov = mind.targetId !== null ? Math.PI : ROYALE_BOT_FOV_RAD / 2;

		if (angle > fov) continue;
		if (!hasLos(world, player, enemy)) continue;

		if (distance < bestDistance) {
			bestDistance = distance;
			best = enemy;
		}
	}

	if (best) {
		mind.targetId = best.id;
		mind.lastSeenX = best.x;
		mind.lastSeenZ = best.z;
		mind.lastSeenAt = now;
		mind.reactionUntil = Math.max(
			mind.reactionUntil,
			now +
				ROYALE_BOT_REACTION_MIN_MS +
				mind.random() * (ROYALE_BOT_REACTION_MAX_MS - ROYALE_BOT_REACTION_MIN_MS)
		);
		return best;
	}

	mind.targetId = null;
	return null;
}

function lootUseful(player: BotPlayer, loot: BotLoot): number {
	if (!loot.available) return 0;

	switch (loot.kind) {
		case 'weapon':
			if (!loot.weapon) return 0;
			return player.inventory.has(loot.weapon) ? 10 : 120;
		case 'ammo':
			return player.reserveAmmo < 30 ? 60 : 8;
		case 'shield':
			return player.shield < 50 ? 80 : 0;
		case 'medkit':
			return player.health < 75 ? 90 : 0;
		case 'grenade':
			return player.grenades < 2 ? 45 : 0;
		default:
			return 0;
	}
}

function chooseLootTarget(world: BotWorld, player: BotPlayer, mind: BotMind): BotLoot | null {
	let best: BotLoot | null = null;
	let bestScore = 0;

	for (const loot of world.loot) {
		if (!loot.available) continue;

		const distance = royaleDistance(player.x, player.z, loot.x, loot.z);
		if (distance > ROYALE_BOT_LOOT_SCAN) continue;
		// Solo loot realmente recogible: el motor exige 2.5 m verticales.
		if (Math.abs(player.y - loot.y) > ROYALE_LOOT_VERTICAL) continue;

		const usefulness = lootUseful(player, loot);
		if (usefulness <= 0) continue;

		const score = usefulness / Math.max(1, distance);
		if (score > bestScore) {
			bestScore = score;
			best = loot;
		}
	}

	mind.targetLootId = best?.id ?? null;
	return best;
}

function setPathTo(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind,
	target: { x: number; z: number }
): boolean {
	const goalChanged =
		mind.goalX === null ||
		mind.goalZ === null ||
		Math.hypot(target.x - mind.goalX, target.z - mind.goalZ) > 2.5;

	if (goalChanged) {
		mind.goalX = target.x;
		mind.goalZ = target.z;
		mind.relayX = null;
		mind.relayZ = null;
		mind.relayUntil = 0;
		mind.repathAt = 0;
	}

	const relayExpired = mind.relayX !== null && world.now > mind.relayUntil;
	const relayReached =
		mind.relayX !== null &&
		mind.relayZ !== null &&
		Math.hypot(player.x - mind.relayX, player.z - mind.relayZ) <= 3;

	if (relayExpired || relayReached) {
		mind.relayX = null;
		mind.relayZ = null;
		mind.relayUntil = 0;
		mind.repathAt = 0;
	}

	if (world.now < mind.repathAt) {
		return mind.path !== null && mind.pathIndex < mind.path.length;
	}

	mind.repathAt = world.now + 750;

	const destination =
		mind.relayX !== null && mind.relayZ !== null ? { x: mind.relayX, z: mind.relayZ } : target;

	const path = world.findPath(
		{ x: player.x, y: player.y, z: player.z },
		{
			x: destination.x,
			y: world.floorHeight(destination.x, destination.z) ?? player.y,
			z: destination.z
		}
	);

	if (path && path.length > 0) {
		mind.path = path;
		mind.pathIndex = 1;
		mind.failCount = 0;
		return true;
	}

	// Sin ruta directa: el presupuesto de A* (4 000 nodos) se agota en los
	// trayectos largos alrededor de las islas. Enlaza por el POI que menos
	// desvía y vuelve a intentarlo desde allí.
	if (mind.relayX === null) {
		const relays = ROYALE_POIS.filter(
			(poi) =>
				Math.hypot(poi.x - target.x, poi.z - target.z) > 4 &&
				Math.hypot(poi.x - player.x, poi.z - player.z) > 4
		)
			.map((poi) => ({
				poi,
				score:
					Math.hypot(poi.x - player.x, poi.z - player.z) +
					Math.hypot(poi.x - target.x, poi.z - target.z)
			}))
			.sort((a, b) => a.score - b.score)
			.slice(0, 4);

		for (const { poi } of relays) {
			const relayPath = world.findPath(
				{ x: player.x, y: player.y, z: player.z },
				{ x: poi.x, y: world.floorHeight(poi.x, poi.z) ?? player.y, z: poi.z }
			);

			if (relayPath && relayPath.length > 0) {
				mind.relayX = poi.x;
				mind.relayZ = poi.z;
				mind.relayUntil = world.now + 15_000;
				mind.path = relayPath;
				mind.pathIndex = 1;
				mind.failCount = 0;
				return true;
			}
		}
	}

	mind.path = null;
	mind.failCount += 1;
	return false;
}

/**
 * Altura del suelo con transición suave para escalones y rampas pequeñas.
 * Los saltos grandes (tejado → calle) siguen siendo instantáneos para que el
 * bot no flote sobre el vacío.
 */
function setGroundHeight(player: BotPlayer, floor: number, dt: number): void {
	const difference = floor - player.y;

	if (Math.abs(difference) > 1.2) {
		player.y = floor;
		return;
	}

	const maxStep = 6 * dt;
	player.y += Math.max(-maxStep, Math.min(maxStep, difference));
}

/**
 * Avance en línea recta de un solo tick. Prueba ángulos para no atravesar agua
 * ni celdas no caminables. Ahora recibe `dt` para moverse de forma continua a
 * 10 Hz en vez de dar saltos de 200 ms.
 */
function moveDirect(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind,
	target: { x: number; z: number },
	speed: number,
	dt: number
): boolean {
	const dx = target.x - player.x;
	const dz = target.z - player.z;
	const distance = Math.hypot(dx, dz);

	if (distance < 0.15) return false;

	const base = Math.atan2(dx, dz);
	const step = Math.min(distance, speed * dt);
	const offsets = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, Math.PI];

	for (const offset of offsets) {
		const angle = base + offset;
		const x = player.x + Math.sin(angle) * step;
		const z = player.z + Math.cos(angle) * step;
		const floor = world.floorHeight(x, z);

		if (floor === null) continue;

		player.x = x;
		player.z = z;
		setGroundHeight(player, floor, dt);
		mind.moveYaw = angle;
		world.markDirty();
		return true;
	}

	return false;
}

/**
 * Objetivo de vagabundeo persistente dentro de la zona segura. Antes se
 * elegía un punto aleatorio en cada decisión (5 Hz) y el bot giraba en
 * círculos sin avanzar; ahora el punto se mantiene hasta llegar o caducar.
 */
function wander(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind,
	speed = 3,
	radius = 2.5
): boolean {
	const now = world.now;
	const reached =
		mind.wanderX !== null &&
		mind.wanderZ !== null &&
		Math.hypot(player.x - mind.wanderX, player.z - mind.wanderZ) < 0.8;

	if (mind.wanderX === null || mind.wanderZ === null || reached || now >= mind.wanderUntil) {
		const margin = royaleBotStormMargin(world.storm.radius);
		let picked: { x: number; z: number } | null = null;

		for (let attempt = 0; attempt < 16; attempt += 1) {
			const angle = mind.random() * Math.PI * 2;
			const distance = 0.6 + mind.random() * radius;
			const x = player.x + Math.cos(angle) * distance;
			const z = player.z + Math.sin(angle) * distance;

			if (!royaleInSafeZone(world.storm, x, z, margin)) continue;
			if (world.floorHeight(x, z) === null) continue;

			picked = { x, z };
			break;
		}

		if (!picked) {
			mind.wanderX = null;
			mind.wanderZ = null;
			mind.wanderUntil = 0;
			mind.intent = 'idle';
			return false;
		}

		mind.wanderX = picked.x;
		mind.wanderZ = picked.z;
		mind.wanderUntil = now + 3_000 + mind.random() * 4_000;
	}

	mind.goalX = mind.wanderX;
	mind.goalZ = mind.wanderZ;
	mind.moveSpeed = speed;
	mind.intent = 'direct';
	return true;
}

/**
 * Fija la intención de movimiento. El desplazamiento real ocurre cada tick en
 * `advanceMovement`, así el bot se ve fluido aunque piense a 5 Hz.
 */
function moveToTarget(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind,
	target: { x: number; z: number },
	speed: number
): void {
	mind.moveSpeed = speed;

	if (setPathTo(world, player, mind, target)) {
		mind.intent = 'path';
		return;
	}

	// Sin ruta: ir en línea recta y, si tampoco se puede, vagar dentro de la
	// zona segura. Nunca se queda quieto.
	mind.goalX = target.x;
	mind.goalZ = target.z;
	mind.intent = 'direct';
}

/** Avanza por la ruta actual un tick. Devuelve `false` al terminarla. */
function moveAlongPath(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind,
	speed: number,
	dt: number
): boolean {
	if (!mind.path || mind.pathIndex >= mind.path.length) {
		return false;
	}

	let step = speed * dt;

	while (step > 0 && mind.pathIndex < mind.path.length) {
		const point = mind.path[mind.pathIndex];
		const dx = point.x - player.x;
		const dz = point.z - player.z;
		const distance = Math.hypot(dx, dz);

		if (distance <= 0.5) {
			mind.pathIndex += 1;
			continue;
		}

		const advance = Math.min(step, distance);
		const nextX = player.x + (dx / distance) * advance;
		const nextZ = player.z + (dz / distance) * advance;
		const floor = world.floorHeight(nextX, nextZ);

		// Nunca pisar una celda no caminable: era la causa de que un bot se
		// quedara atrapado y pareciera congelado durante el resto de la fase.
		if (floor === null) {
			mind.path = null;
			mind.pathIndex = 0;
			mind.repathAt = 0;
			return false;
		}

		player.x = nextX;
		player.z = nextZ;
		mind.moveYaw = Math.atan2(dx, dz);
		setGroundHeight(player, floor, dt);

		step -= advance;

		if (advance < distance) break;
		mind.pathIndex += 1;
	}

	player.vy = 0;
	player.mode = 'ground';
	world.markDirty();
	return mind.pathIndex < mind.path.length;
}

/** Strafe continuo alrededor del objetivo (no un salto por decisión). */
function advanceStrafe(world: BotWorld, player: BotPlayer, mind: BotMind, dt: number): void {
	const step = mind.moveSpeed * dt;
	const x = player.x + mind.strafeX * step;
	const z = player.z + mind.strafeZ * step;
	const floor = world.floorHeight(x, z);

	if (floor === null) {
		// Borde de agua o pared: invertir el sentido para no quedarse clavado.
		mind.strafeX = -mind.strafeX;
		mind.strafeZ = -mind.strafeZ;
		return;
	}

	player.x = x;
	player.z = z;
	setGroundHeight(player, floor, dt);
	mind.moveYaw = Math.atan2(mind.strafeX, mind.strafeZ);
	world.markDirty();
}

/** Ejecuta la intención actual a 10 Hz. */
function advanceMovement(world: BotWorld, player: BotPlayer, mind: BotMind, dt: number): void {
	const startX = player.x;
	const startZ = player.z;

	// Estado inválido (celda no caminable): salir al punto caminable más
	// cercano antes de intentar cualquier otra cosa.
	if (world.floorHeight(player.x, player.z) === null) {
		escapeInvalidCell(world, player, mind);
	}

	// El empujón de emergencia manda durante su ventana: si no, el siguiente
	// `thinkGround` (5 Hz) lo sobrescribía con un strafe bloqueado y el bot
	// volvía a quedarse quieto contra la pared.
	if (world.now < mind.fallbackUntil) {
		if (
			mind.fallbackX !== null &&
			mind.fallbackZ !== null &&
			moveDirect(world, player, mind, { x: mind.fallbackX, z: mind.fallbackZ }, mind.moveSpeed, dt)
		) {
			mind.stillTicks = 0;
			return;
		}
	}

	switch (mind.intent) {
		case 'path':
			if (!moveAlongPath(world, player, mind, mind.moveSpeed, dt)) {
				mind.intent = 'idle';
			}
			break;
		case 'strafe':
			advanceStrafe(world, player, mind, dt);
			break;
		case 'direct':
			if (
				mind.goalX === null ||
				mind.goalZ === null ||
				!moveDirect(world, player, mind, { x: mind.goalX, z: mind.goalZ }, mind.moveSpeed, dt)
			) {
				if (!wander(world, player, mind)) {
					mind.intent = 'idle';
				}
			}
			break;
		default:
			break;
	}

	// Red de seguridad: si la intención no movió al bot (pared, esquina o una
	// celda rodeada de agua) busca una celda libre cercana y camina hacia ella.
	// Sin esto un bot podía quedarse clavado más de 10 s y parecía congelado.
	const moved = Math.hypot(player.x - startX, player.z - startZ);

	if (moved > 0.004) {
		mind.stillTicks = 0;
		return;
	}

	mind.stillTicks += 1;

	if (mind.stillTicks < 3) return;

	mind.stillTicks = 0;
	nudgeToFreeCell(world, player, mind);
}

/** Saca al bot de una celda no caminable llevándolo al borde válido más cercano. */
function escapeInvalidCell(world: BotWorld, player: BotPlayer, mind: BotMind): void {
	for (let radius = 0.4; radius <= 3.8; radius += 0.4) {
		for (let step = 0; step < 16; step += 1) {
			const angle = (step / 16) * Math.PI * 2;
			const x = player.x + Math.cos(angle) * radius;
			const z = player.z + Math.sin(angle) * radius;
			const floor = world.floorHeight(x, z);

			if (floor === null) continue;

			player.x = x;
			player.z = z;
			player.y = floor;
			mind.path = null;
			mind.pathIndex = 0;
			mind.repathAt = 0;
			mind.stillTicks = 0;
			mind.fallbackUntil = 0;
			mind.intent = 'idle';
			world.markDirty();
			return;
		}
	}
}

/** Empujón de emergencia hacia la celda caminable más cercana. */
function nudgeToFreeCell(world: BotWorld, player: BotPlayer, mind: BotMind): void {
	const base = mind.random() * Math.PI * 2;

	for (const radius of [1, 1.8, 3, 4.5, 6]) {
		for (let step = 0; step < 16; step += 1) {
			const angle = base + (step / 16) * Math.PI * 2;
			const x = player.x + Math.cos(angle) * radius;
			const z = player.z + Math.sin(angle) * radius;

			if (world.floorHeight(x, z) === null) continue;

			mind.goalX = x;
			mind.goalZ = z;
			mind.fallbackX = x;
			mind.fallbackZ = z;
			mind.fallbackUntil = world.now + 1_500;
			mind.path = null;
			mind.pathIndex = 0;
			mind.repathAt = 0;
			mind.moveSpeed = ROYALE_BOT_GROUND_SPEED;
			mind.intent = 'direct';
			return;
		}
	}

	// Sin vecino caminable: al menos gira para mirar alrededor.
	mind.moveYaw = base;
	mind.intent = 'idle';
}

/** Gira el avatar hacia el objetivo de combate o hacia la dirección de avance. */
function smoothYaw(world: BotWorld, player: BotPlayer, mind: BotMind, dt: number): void {
	const chasing = mind.targetId !== null && world.now - mind.lastSeenAt <= 2_000;
	const target = chasing ? mind.yawTarget : mind.moveYaw;
	const difference = Math.atan2(Math.sin(target - player.yaw), Math.cos(target - player.yaw));
	const maxStep = ROYALE_BOT_ROTATE_SPEED * dt;

	player.yaw += Math.max(-maxStep, Math.min(maxStep, difference));
	player.yaw = Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw));
}

function bestWeaponFor(player: BotPlayer, distance: number): RoyaleWeaponId {
	const owned = ROYALE_WEAPONS.filter((weapon) => player.inventory.has(weapon.id));
	if (owned.length === 0) return 'pistol';

	if (distance < 12) {
		const shotgun = owned.find((weapon) => weapon.id === 'shotgun');
		if (shotgun) return 'shotgun';
	}

	if (distance < 30) {
		const smg = owned.find((weapon) => weapon.id === 'smg');
		if (smg) return 'smg';
	}

	if (distance > 30) {
		const rifle = owned.find((weapon) => weapon.id === 'rifle');
		if (rifle) return 'rifle';
	}

	const pistol = owned.find((weapon) => weapon.id === 'pistol');
	if (pistol) return 'pistol';

	return owned.sort((a, b) => b.damage - a.damage)[0].id;
}

function equipBotWeapon(player: BotPlayer, weapon: RoyaleWeaponId): void {
	if (player.weapon === weapon || !player.inventory.has(weapon)) return;
	player.weapon = weapon;
	player.magAmmo = player.inventory.get(weapon) ?? 0;
}

function reloadBot(player: BotPlayer, now: number): void {
	if (now - player.lastReloadAt < 600) return;

	const definition = ROYALE_WEAPON_BY_ID.get(player.weapon);
	if (!definition) return;

	const missing = definition.magSize - player.magAmmo;
	if (missing <= 0) return;

	const take = Math.min(missing, player.reserveAmmo);
	if (take <= 0) return;

	player.magAmmo += take;
	player.reserveAmmo -= take;
	player.inventory.set(player.weapon, player.magAmmo);
	player.lastReloadAt = now;
}

function aimWithError(
	player: BotPlayer,
	target: BotPlayer,
	error: number,
	random: () => number
): { x: number; y: number; z: number } {
	const dx = target.x - player.x;
	const dy = target.y + 1.1 - (player.y + 1.2);
	const dz = target.z - player.z;
	const length = Math.hypot(dx, dy, dz) || 1;
	const base = { x: dx / length, y: dy / length, z: dz / length };
	const angle = error * (random() * 2 - 1);
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	return {
		x: base.x * cos - base.z * sin,
		y: base.y,
		z: base.x * sin + base.z * cos
	};
}

/** Un tick completo de bot (10 Hz). */
export function updateBot(player: BotPlayer, world: BotWorld): void {
	const mind = player.bot;
	if (!mind || !player.alive) return;

	const now = world.now;

	if (player.mode === 'riding') {
		if (now >= mind.jumpAt) {
			world.jump(player);
		}
		return;
	}

	if (player.mode === 'skydive') {
		player.vy = Math.max(-ROYALE_SKYDIVE_MAX_FALL, player.vy - 40 * 0.1);
		player.y += player.vy * 0.1;
		driftToward(player, world, mind, ROYALE_SKYDIVE_SPEED);

		if (
			player.y <= ROYALE_SKYDIVE_DEPLOY_Y ||
			now - mind.jumpStartedAt >= ROYALE_SKYDIVE_DEPLOY_MS
		) {
			player.mode = 'glide';
			player.vy = -ROYALE_GLIDE_FALL;
		}

		world.markDirty();
		return;
	}

	if (player.mode === 'glide') {
		player.vy = -ROYALE_GLIDE_FALL;
		player.y -= ROYALE_GLIDE_FALL * 0.1;
		driftToward(player, world, mind, ROYALE_GLIDE_SPEED);

		const floor = world.floorHeight(player.x, player.z);
		if (floor !== null && player.y <= floor + 0.05) {
			player.y = floor;
			player.vy = 0;
			player.mode = 'ground';
			world.emit('player-landed', {
				playerId: player.id,
				x: player.x,
				y: player.y,
				z: player.z,
				mode: 'ground'
			});
		} else if (player.y < ROYALE_KILL_Y) {
			// El motor aplica la muerte por caída en su tick.
		}

		world.markDirty();
		return;
	}

	// ground
	if (now >= mind.nextThinkAt) {
		mind.nextThinkAt = now + 200;
		thinkGround(world, player, mind);
	}

	fireWeapon(world, player, mind);
	advanceMovement(world, player, mind, 0.1);
	smoothYaw(world, player, mind, 0.1);
	checkStuck(world, player, mind);
}

function driftToward(player: BotPlayer, world: BotWorld, mind: BotMind, speed: number): void {
	const dx = mind.landing.x - player.x;
	const dz = mind.landing.z - player.z;
	const distance = Math.hypot(dx, dz);

	if (distance < 0.4) return;

	const advance = Math.min(distance, speed * 0.1);
	player.x += (dx / distance) * advance;
	player.z += (dz / distance) * advance;
	player.yaw = Math.atan2(dx, dz);

	// El planeo puede cruzar agua: el ancla es caminable y es el destino
	// quien decide si se aterriza o se cae al mar.
	world.markDirty();
}

function thinkGround(world: BotWorld, player: BotPlayer, mind: BotMind): void {
	const now = world.now;
	const canFight = now >= mind.engageAt;
	const insideSafe = royaleInSafeZone(
		world.storm,
		player.x,
		player.z,
		royaleBotStormMargin(world.storm.radius)
	);
	const insideNext = royaleInSafeZone(
		{
			cx: world.storm.nextCx,
			cz: world.storm.nextCz,
			radius: world.storm.nextRadius
		},
		player.x,
		player.z,
		royaleBotStormMargin(world.storm.nextRadius)
	);
	const closingSoon = world.storm.state === 'shrink' && world.storm.endsAt - now <= 20_000;
	const fewAlive = world.aliveCount <= 4;
	const mustRotate = !insideSafe || (closingSoon && !insideNext) || (fewAlive && !insideNext);

	if (mustRotate) {
		// Rotar tiene prioridad: mira hacia donde camina, no hacia un enemigo
		// que quedó fuera de la zona segura.
		mind.targetId = null;
		// Objetivo estable por fase: la tormenta se encoge de forma continua y
		// recalcular el punto en cada tick hacía que el bot temblara en el sitio.
		const point = stormTarget(world, player, mind);
		moveToTarget(world, player, mind, point, !insideSafe || fewAlive ? 8 : ROYALE_BOT_GROUND_SPEED);
		return;
	}

	const target = canFight ? findTarget(world, player, mind) : null;

	if (target) {
		const distance = distanceTo(player, target);
		const visible = world.hasLineOfSight(eye(player), eye(target));
		const desiredWeapon = bestWeaponFor(player, distance);
		equipBotWeapon(player, desiredWeapon);

		// Sin LOS solo se persigue el último punto visto, nunca la posición
		// exacta actual. El servidor también exige LOS para el disparo y la
		// granada, pero el movimiento tampoco debe ser omnisciente.
		const aimX = visible ? target.x : mind.lastSeenX;
		const aimZ = visible ? target.z : mind.lastSeenZ;

		mind.yawTarget = Math.atan2(aimX - player.x, aimZ - player.z);

		const definition = ROYALE_WEAPON_BY_ID.get(player.weapon);
		const maxRange = definition?.range ?? 40;

		if (!visible) {
			moveToTarget(world, player, mind, { x: aimX, z: aimZ }, ROYALE_BOT_GROUND_SPEED);
			return;
		}

		if (distance <= Math.min(maxRange, ROYALE_BOT_VIEW_RANGE)) {
			mind.path = null;

			// A distancia media el bot avanza en vez de limitarse a orbitar.
			// Antes el strafe era siempre tangencial entre 7 y 32 m y los bots
			// se quedaban dando vueltas alrededor del objetivo sin cerrar el
			// combate ni acercarse a un rango donde sus disparos acierten.
			const idealMax = Math.min(maxRange * 0.6, 18);

			if (distance > idealMax + 2) {
				moveToTarget(world, player, mind, { x: target.x, z: target.z }, ROYALE_BOT_GROUND_SPEED);
				maybeGrenade(world, player, mind, target, distance);
				return;
			}

			// Parar un momento a disparar rompe la órbita perpetua y da al bot
			// una oportunidad real de acertar.
			if (mind.random() < 0.35) {
				mind.moveSpeed = 0;
				mind.intent = 'idle';
			} else {
				beginStrafe(world, player, mind, target, distance, maxRange);
			}

			maybeGrenade(world, player, mind, target, distance);
			return;
		}

		// Fuera de alcance: acercarse.
		moveToTarget(world, player, mind, { x: target.x, z: target.z }, ROYALE_BOT_GROUND_SPEED);
		return;
	}

	mind.targetId = null;

	// Sin enemigo: investigar el último daño o buscar loot.
	if (canFight && player.lastAttackerId && now - player.lastAttackerAt <= 5_000) {
		const attacker = world.players.find((item) => item.id === player.lastAttackerId);

		if (attacker && attacker.alive && world.hasLineOfSight(eye(player), eye(attacker))) {
			mind.lastSeenX = attacker.x;
			mind.lastSeenZ = attacker.z;
			moveToTarget(world, player, mind, { x: attacker.x, z: attacker.z }, ROYALE_BOT_GROUND_SPEED);
			return;
		}
	}

	const loot = chooseLootTarget(world, player, mind);

	if (loot) {
		moveToTarget(world, player, mind, { x: loot.x, z: loot.z }, ROYALE_BOT_GROUND_SPEED);
		return;
	}

	const patrol = patrolTarget(world, player, mind);
	if (patrol) {
		moveToTarget(world, player, mind, patrol, ROYALE_BOT_GROUND_SPEED);
		return;
	}

	// Sin destino: vagar dentro de la zona segura sin quedarse parado.
	wander(world, player, mind);
}

/**
 * Punto de rotación estable para la fase actual de la tormenta. Se recalcula
 * solo cuando cambia el círculo destino, no en cada tick.
 */
function stormTarget(world: BotWorld, player: BotPlayer, mind: BotMind): { x: number; z: number } {
	const storm = world.storm;
	const phaseKey = storm.phase * 1_000 + Math.round(storm.nextRadius);

	if (mind.safePhase === phaseKey && mind.safeX !== null && mind.safeZ !== null) {
		return { x: mind.safeX, z: mind.safeZ };
	}

	const margin = royaleBotStormMargin(storm.nextRadius);
	const usable = Math.max(0.6, storm.nextRadius - margin);
	let goal: { x: number; z: number } | null = null;

	for (let attempt = 0; attempt < 16; attempt += 1) {
		const angle = mind.random() * Math.PI * 2;
		const radius = usable * (0.15 + mind.random() * 0.5);
		const x = storm.nextCx + Math.cos(angle) * radius;
		const z = storm.nextCz + Math.sin(angle) * radius;

		if (world.floorHeight(x, z) === null) continue;

		goal = { x, z };
		break;
	}

	if (!goal) {
		goal = world.safePoint(storm, player.x, player.z);
	}

	mind.safePhase = phaseKey;
	mind.safeX = goal.x;
	mind.safeZ = goal.z;

	return goal;
}

/**
 * Strafe continuo alrededor del objetivo. `beginStrafe` decide la dirección y
 * `advanceStrafe` la aplica cada tick de 0,1 s, así el bot se desplaza de forma
 * fluida en vez de dar un salto de lado cada segundo.
 */
function beginStrafe(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind,
	target: BotPlayer,
	distance: number,
	maxRange: number
): void {
	const now = world.now;

	if (now >= mind.strafeUntil) {
		mind.strafeUntil = now + 700 + mind.random() * 900;
		mind.strafeDir = mind.random() < 0.5 ? -1 : 1;
	}

	const yaw = Math.atan2(target.x - player.x, target.z - player.z);
	const forwardX = Math.sin(yaw);
	const forwardZ = Math.cos(yaw);
	const rightX = Math.cos(yaw);
	const rightZ = -Math.sin(yaw);
	const idealMin = 6;
	const idealMax = Math.min(maxRange * 0.6, 18);
	let radial = 0;

	if (distance > idealMax) radial = 1;
	else if (distance < idealMin) radial = -1;

	const x = rightX * mind.strafeDir + forwardX * radial;
	const z = rightZ * mind.strafeDir + forwardZ * radial;
	const length = Math.hypot(x, z) || 1;

	mind.strafeX = x / length;
	mind.strafeZ = z / length;
	mind.moveSpeed = distance < 12 ? 3.1 : 2.4;
	mind.intent = 'strafe';
}

/** Patrulla persistente: no cambia de destino cinco veces por segundo. */
function patrolTarget(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind
): { x: number; z: number } | null {
	const now = world.now;
	const retained =
		mind.patrolX !== null &&
		mind.patrolZ !== null &&
		now < mind.patrolUntil &&
		Math.hypot(mind.patrolX - player.x, mind.patrolZ - player.z) > 3;

	if (retained) {
		return { x: mind.patrolX as number, z: mind.patrolZ as number };
	}

	const chosen = choosePatrolPoint(world, player, mind) ?? chooseNearbyPatrol(world, player, mind);

	if (!chosen) return null;

	mind.patrolX = chosen.x;
	mind.patrolZ = chosen.z;
	mind.patrolUntil = now + 8_000 + mind.random() * 7_000;

	return chosen;
}

function maybeGrenade(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind,
	target: BotPlayer,
	distance: number
): void {
	if (player.grenades <= 0) return;
	if (world.now < mind.nextGrenadeAt) return;
	if (distance < 10 || distance > 28) return;
	if (world.now - player.lastGrenadeAt < ROYALE_BOT_GRENADE_CD_MS) return;
	// No se lanzan granadas a ciegas contra la posición exacta del objetivo:
	// solo cuando hay línea de visión real.
	if (!world.hasLineOfSight(eye(player), eye(target))) return;

	mind.nextGrenadeAt = world.now + ROYALE_BOT_GRENADE_CD_MS;

	if (mind.random() > 0.12) return;

	world.throwGrenade(player, { x: target.x, z: target.z });
}

function chooseNearbyPatrol(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind
): { x: number; z: number } | null {
	const margin = royaleBotStormMargin(world.storm.radius);
	const maxDistance = Math.max(1.5, world.storm.radius - margin);

	for (let attempt = 0; attempt < 24; attempt += 1) {
		const angle = mind.random() * Math.PI * 2;
		const distance = 1 + mind.random() * Math.min(19, maxDistance);
		const x = player.x + Math.cos(angle) * distance;
		const z = player.z + Math.sin(angle) * distance;

		if (world.floorHeight(x, z) === null) continue;
		if (!royaleInSafeZone(world.storm, x, z, margin)) continue;
		if (Math.hypot(x - player.x, z - player.z) < 0.4) continue;
		return { x, z };
	}

	return null;
}

function choosePatrolPoint(
	world: BotWorld,
	player: BotPlayer,
	mind: BotMind
): { x: number; z: number } | null {
	const margin = royaleBotStormMargin(world.storm.nextRadius);
	const candidates = ROYALE_POIS.filter((poi) =>
		royaleInSafeZone(world.storm, poi.x, poi.z, royaleBotStormMargin(world.storm.radius))
	);

	if (candidates.length === 0) {
		// Círculo final sin POI: patrulla dentro de la zona segura en puntos
		// caminables para no quedarse quieto durante minutos.
		const radius = Math.max(0.5, world.storm.nextRadius - margin);

		for (let attempt = 0; attempt < 24; attempt += 1) {
			const angle = mind.random() * Math.PI * 2;
			const distance = Math.max(0.3, Math.sqrt(mind.random()) * radius);
			const x = world.storm.nextCx + Math.cos(angle) * distance;
			const z = world.storm.nextCz + Math.sin(angle) * distance;

			if (world.floorHeight(x, z) === null) continue;
			if (Math.hypot(x - player.x, z - player.z) < 0.4) continue;
			return { x, z };
		}

		return null;
	}

	// Rutas cortas: A* tiene un presupuesto de 4 000 nodos y los saltos a
	// otros POI lejanos pueden agotarlo.
	const allowed = candidates.filter(
		(poi) => distanceTo(player, poi) > 6 && distanceTo(player, poi) <= 45
	);

	if (allowed.length > 0) {
		const chosen = allowed[Math.floor(mind.random() * allowed.length) % allowed.length];
		return { x: chosen.x, z: chosen.z };
	}

	return chooseNearbyPatrol(world, player, mind);
}

function fireWeapon(world: BotWorld, player: BotPlayer, mind: BotMind): void {
	if (world.now < mind.engageAt) return;
	if (!mind.targetId || world.now < mind.reactionUntil) return;
	if (player.mode !== 'ground') return;

	const target = world.players.find((item) => item.id === mind.targetId);
	if (!target || !target.alive) return;

	// El objetivo se conserva 2 s aunque salga del FOV, pero nunca se dispara
	// a través de una pared: solo con línea de visión real.
	if (!world.hasLineOfSight(eye(player), eye(target))) return;

	const distance = distanceTo(player, target);
	const definition = ROYALE_WEAPON_BY_ID.get(player.weapon);
	if (!definition) return;
	if (distance > definition.range) return;

	if (player.magAmmo <= 0) {
		reloadBot(player, world.now);
		return;
	}

	if (world.now < mind.burstPauseUntil) return;

	if (mind.burstLeft <= 0) {
		mind.burstLeft = 3 + Math.floor(mind.random() * 6);
	}

	const minInterval = 1000 / definition.rate;
	if (world.now - player.lastShotAt < minInterval * 0.9) return;

	const errorScale = 1 + distance / 80;
	const dir = aimWithError(player, target, mind.aimError * errorScale, mind.random);
	world.shoot(player, dir, target.id);
	mind.burstLeft -= 1;
	player.lastShotAt = world.now;

	if (mind.burstLeft <= 0) {
		mind.burstPauseUntil = world.now + 400 + mind.random() * 700;
	}
}

function checkStuck(world: BotWorld, player: BotPlayer, mind: BotMind): void {
	if (world.now < mind.stuckAt) return;

	mind.stuckAt = world.now + 1_500;
	const moved = Math.hypot(player.x - mind.lastX, player.z - mind.lastZ);

	if (player.mode === 'ground' && moved < 0.5) {
		mind.failCount += 1;
		mind.path = null;
		mind.repathAt = 0;

		if (mind.failCount >= 3) {
			mind.targetLootId = null;
			mind.failCount = 0;
			// Elige un punto de patrulla distinto en el siguiente think.
			mind.landing = {
				x: player.x + (mind.random() - 0.5) * 20,
				y: player.y,
				z: player.z + (mind.random() - 0.5) * 20
			};
		}
	} else {
		mind.failCount = 0;
	}

	mind.lastX = player.x;
	mind.lastZ = player.z;
}

/** Fuerza la recarga de un bot (el motor la aplica como a un humano). */
export function botReload(player: BotPlayer, now: number): void {
	reloadBot(player, now);
}

/** Comprueba si el bot tiene un arma con munición para el tick actual. */
export function botCanShoot(player: BotPlayer): boolean {
	if (player.magAmmo > 0) return true;
	return player.reserveAmmo > 0;
}

export { ROYALE_MAX_GRENADES };
