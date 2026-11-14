/**
 * `waves:terrain` — valida la altura caminable de los monstruos de Barn Siege.
 *
 * `waves.ts` es autoritativo y no usa físicas de malla: aproxima las rampas de
 * los miradores con `MONSTER_CLIMBS`. Este check simula la IA de subida para
 * asegurar que:
 *   1. desde el pie de cada rampa se llega a la plataforma;
 *   2. desde el lado y desde detrás de la torre también se llega (rodeo);
 *   3. un monstruo a ras de suelo no puede "teletransportarse" a la plataforma;
 *   4. la diferencia de altura de la plataforma supera el alcance de melé y de
 *      los charcos de ácido desde el suelo, que es lo que impedía pegar a
 *      través del suelo (el proyectil de ácido sí puede apuntar a la altura
 *      real del jugador).
 *
 * Se ejecuta con Bun porque importa el motor TypeScript directamente.
 */
import {
	ACID_VERTICAL_REACH,
	ARENA_FLOOR_Y,
	MELEE_VERTICAL_REACH,
	MONSTER_CLIMBS
} from '../src/lib/state/wavesConfig.ts';
import {
	climbWaypoint,
	monsterGroundHeight,
	pointInArena,
	stepMonster
} from '../src/server/engines/waves.ts';

const STEP = 0.26;

function fail(message) {
	console.error(`waves:terrain ✗ ${message}`);
	process.exit(1);
}

function topCenter(climb) {
	return {
		x: (climb.top.minX + climb.top.maxX) / 2,
		y: climb.top.y,
		z: (climb.top.minZ + climb.top.maxZ) / 2
	};
}

function simulate(climb, start, maxTicks = 400) {
	const target = topCenter(climb);
	let monster = { x: start.x, y: ARENA_FLOOR_Y, z: start.z };
	let stuckTicks = 0;

	for (let tick = 0; tick < maxTicks; tick += 1) {
		const waypoint = climbWaypoint(monster, target);
		const aimX = waypoint ? waypoint.x : target.x;
		const aimZ = waypoint ? waypoint.z : target.z;
		const dx = aimX - monster.x;
		const dz = aimZ - monster.z;
		const distance = Math.hypot(dx, dz);

		if (distance < 0.05) {
			break;
		}

		const step = Math.min(STEP, distance);
		const next = stepMonster(
			monster,
			monster.x + (dx / distance) * step,
			monster.z + (dz / distance) * step
		);

		if (Math.abs(next.x - monster.x) < 1e-4 && Math.abs(next.z - monster.z) < 1e-4) {
			stuckTicks += 1;

			if (stuckTicks > 20) {
				return { ok: false, ticks: tick, position: monster };
			}
		} else {
			stuckTicks = 0;
		}

		monster = next;

		if (monster.y >= climb.top.y - 0.05) {
			return { ok: true, ticks: tick, position: monster };
		}
	}

	return { ok: false, ticks: maxTicks, position: monster };
}

if (MONSTER_CLIMBS.length === 0) {
	fail('MONSTER_CLIMBS está vacío');
}

for (const climb of MONSTER_CLIMBS) {
	const center = topCenter(climb);
	const label = `mirador (${center.x.toFixed(0)}, ${center.z.toFixed(0)})`;

	if (!pointInArena(climb.entry.x, climb.entry.z)) {
		fail(
			`${label}: el pie de la rampa (${climb.entry.x}, ${climb.entry.z}) queda fuera de la arena`
		);
	}

	if (!pointInArena(center.x, center.z)) {
		fail(`${label}: la plataforma (${center.x}, ${center.z}) queda fuera de la arena`);
	}

	if (monsterGroundHeight(center.x, center.z, climb.top.y) !== climb.top.y) {
		fail(`${label}: la plataforma no devuelve su altura caminable`);
	}

	if (monsterGroundHeight(center.x, center.z, ARENA_FLOOR_Y) !== ARENA_FLOOR_Y) {
		fail(`${label}: un monstruo a ras de suelo se subiría a la plataforma de golpe`);
	}

	const heightGap = climb.top.y - ARENA_FLOOR_Y;

	if (heightGap <= MELEE_VERTICAL_REACH) {
		fail(
			`${label}: la plataforma está al alcance de melé desde el suelo (${heightGap.toFixed(2)} m)`
		);
	}

	if (heightGap <= ACID_VERTICAL_REACH) {
		fail(
			`${label}: la plataforma está al alcance del charco de ácido desde el suelo (${heightGap.toFixed(2)} m)`
		);
	}

	const starts = [
		{ name: 'pie', ...climb.entry },
		{ name: 'lado', x: climb.entry.x + (climb.entry.x > 0 ? 3 : -3), z: -16 },
		{ name: 'detrás', x: center.x, z: climb.top.minZ - 3 }
	];

	for (const start of starts) {
		const result = simulate(climb, start);

		if (!result.ok) {
			const p = result.position;
			fail(
				`${label}: no llega a la plataforma desde ${start.name} ` +
					`(quedó en ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`
			);
		}

		console.log(
			`${label} desde ${start.name}: OK en ${result.ticks} ticks ` +
				`(y=${result.position.y.toFixed(2)})`
		);
	}
}

console.log('waves:terrain ✓ rampas, plataformas y altura de combate correctas');
