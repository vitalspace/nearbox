/**
 * Navegación del battle royale.
 *
 * Decodifica la rejilla de 2 m generada por `royale:build` y ofrece A*
 * 4-direccional con diagonales solo cuando ambos vecinos ortogonales son
 * caminables, límite de nodos, suavizado por segmento y consultas de altura.
 */
import { ROYALE_MAP, ROYALE_POIS, type RoyaleVec3 } from '../../lib/state/royaleConfig';

const NAV = ROYALE_MAP.nav;
const WALKABLE = NAV.walkable;

export const NAV_CELL_SIZE = NAV.cellSize;
export const NAV_ORIGIN_X = NAV.originX;
export const NAV_ORIGIN_Z = NAV.originZ;
export const NAV_COLS = NAV.cols;
export const NAV_ROWS = NAV.rows;

const MAX_PATH_NODES = 4_000;

export type NavCell = { col: number; row: number };

export function isInside(col: number, row: number): boolean {
	return col >= 0 && row >= 0 && col < NAV_COLS && row < NAV_ROWS;
}

export function cellIndex(col: number, row: number): number {
	return row * NAV_COLS + col;
}

export function isWalkable(col: number, row: number): boolean {
	if (!isInside(col, row)) return false;
	return WALKABLE.charCodeAt(cellIndex(col, row)) === 49;
}

/** Altura del suelo en una celda, o `null` si no es caminable. */
export function cellHeight(col: number, row: number): number | null {
	if (!isWalkable(col, row)) return null;
	return NAV.heights[cellIndex(col, row)] / 10;
}

export function worldToCell(x: number, z: number): NavCell {
	return {
		col: Math.floor((x - NAV_ORIGIN_X) / NAV_CELL_SIZE),
		row: Math.floor((z - NAV_ORIGIN_Z) / NAV_CELL_SIZE)
	};
}

export function cellToWorld(col: number, row: number): RoyaleVec3 {
	const y = cellHeight(col, row) ?? 0;
	return {
		x: NAV_ORIGIN_X + (col + 0.5) * NAV_CELL_SIZE,
		y,
		z: NAV_ORIGIN_Z + (row + 0.5) * NAV_CELL_SIZE
	};
}

/** Altura del suelo en coordenadas de mundo; `null` si la celda no vale. */
export function floorHeightAt(x: number, z: number): number | null {
	const { col, row } = worldToCell(x, z);
	return cellHeight(col, row);
}

/**
 * Celda caminable más cercana dentro de `radiusCells`, prefiriendo la de
 * altura más parecida a `preferredY` (para no teletransportar de tejado a
 * calle cuando hay una calle al lado).
 */
export function nearestWalkable(
	x: number,
	z: number,
	radiusCells = 8,
	preferredY?: number
): RoyaleVec3 | null {
	const origin = worldToCell(x, z);
	let best: RoyaleVec3 | null = null;
	let bestScore = Number.POSITIVE_INFINITY;

	for (let radius = 0; radius <= radiusCells; radius += 1) {
		for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
			for (let col = origin.col - radius; col <= origin.col + radius; col += 1) {
				if (Math.max(Math.abs(col - origin.col), Math.abs(row - origin.row)) !== radius) {
					continue;
				}

				const y = cellHeight(col, row);
				if (y === null) continue;

				const point = cellToWorld(col, row);
				const distance = Math.hypot(point.x - x, point.z - z);
				const heightPenalty = preferredY === undefined ? 0 : Math.abs(point.y - preferredY) * 2;
				const score = distance + heightPenalty;

				if (score < bestScore) {
					bestScore = score;
					best = point;
				}
			}
		}

		if (best) return best;
	}

	return null;
}

/** Comprueba que una línea recta entre dos puntos pisa solo celdas caminables. */
export function walkableLine(from: RoyaleVec3, to: RoyaleVec3): boolean {
	const distance = Math.hypot(to.x - from.x, to.z - from.z);
	const steps = Math.max(1, Math.ceil(distance / (NAV_CELL_SIZE * 0.5)));

	for (let step = 0; step <= steps; step += 1) {
		const t = step / steps;
		const x = from.x + (to.x - from.x) * t;
		const z = from.z + (to.z - from.z) * t;
		const { col, row } = worldToCell(x, z);

		if (!isWalkable(col, row)) {
			return false;
		}
	}

	return true;
}

type HeapNode = { index: number; score: number };

class MinHeap {
	private items: HeapNode[] = [];

	get size(): number {
		return this.items.length;
	}

	push(node: HeapNode): void {
		this.items.push(node);
		let index = this.items.length - 1;

		while (index > 0) {
			const parent = (index - 1) >> 1;
			if (this.items[parent].score <= this.items[index].score) break;
			[this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
			index = parent;
		}
	}

	pop(): HeapNode | null {
		if (this.items.length === 0) return null;

		const top = this.items[0];
		const last = this.items.pop()!;

		if (this.items.length > 0) {
			this.items[0] = last;
			let index = 0;

			for (;;) {
				const left = index * 2 + 1;
				const right = left + 1;
				let smallest = index;

				if (left < this.items.length && this.items[left].score < this.items[smallest].score) {
					smallest = left;
				}

				if (right < this.items.length && this.items[right].score < this.items[smallest].score) {
					smallest = right;
				}

				if (smallest === index) break;

				[this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
				index = smallest;
			}
		}

		return top;
	}
}

function heuristic(col: number, row: number, goalCol: number, goalRow: number): number {
	const dx = Math.abs(col - goalCol);
	const dz = Math.abs(row - goalRow);
	return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

/**
 * Distancias reales desde una celda a todo el mapa (Dijkstra 8-direccional).
 * Se usan como "landmarks" para una heurística ALT admisible: en un mapa con
 * islas y bahías A* necesita explorar >4 000 nodos para rutas de 100 m, pero
 * con ALT encuentra las mismas rutas en ~600 nodos sin subir el presupuesto.
 */
function buildLandmarkField(cell: NavCell): Float32Array {
	const cells = NAV_COLS * NAV_ROWS;
	const distance = new Float32Array(cells);
	distance.fill(Number.POSITIVE_INFINITY);
	const closed = new Uint8Array(cells);
	const open = new MinHeap();
	const startIndex = cellIndex(cell.col, cell.row);

	distance[startIndex] = 0;
	open.push({ index: startIndex, score: 0 });

	while (open.size > 0) {
		const current = open.pop()!;
		if (closed[current.index]) continue;
		closed[current.index] = 1;

		const col = current.index % NAV_COLS;
		const row = Math.floor(current.index / NAV_COLS);

		for (let dirRow = -1; dirRow <= 1; dirRow += 1) {
			for (let dirCol = -1; dirCol <= 1; dirCol += 1) {
				if (dirRow === 0 && dirCol === 0) continue;

				const nextCol = col + dirCol;
				const nextRow = row + dirRow;

				if (!isWalkable(nextCol, nextRow)) continue;
				if (
					dirCol !== 0 &&
					dirRow !== 0 &&
					(!isWalkable(col + dirCol, row) || !isWalkable(col, row + dirRow))
				) {
					continue;
				}

				const nextIndex = cellIndex(nextCol, nextRow);
				if (closed[nextIndex]) continue;

				const step = dirCol !== 0 && dirRow !== 0 ? Math.SQRT2 : 1;
				const tentative = distance[current.index] + step;

				if (tentative >= distance[nextIndex]) continue;

				distance[nextIndex] = tentative;
				open.push({ index: nextIndex, score: tentative });
			}
		}
	}

	return distance;
}

let landmarkFields: Float32Array[] | null = null;

function getLandmarkFields(): Float32Array[] {
	if (landmarkFields) return landmarkFields;

	// Extremos del mapa + centro: los seis POI más separados entre sí.
	const picks: { x: number; z: number }[] = [];
	const add = (poi: { x: number; z: number } | undefined) => {
		if (poi && !picks.includes(poi)) picks.push(poi);
	};
	add([...ROYALE_POIS].sort((a, b) => a.x - b.x)[0]);
	add([...ROYALE_POIS].sort((a, b) => b.x - a.x)[0]);
	add([...ROYALE_POIS].sort((a, b) => a.z - b.z)[0]);
	add([...ROYALE_POIS].sort((a, b) => b.z - a.z)[0]);
	add([...ROYALE_POIS].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]);
	add([...ROYALE_POIS].sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))[0]);

	const fields: Float32Array[] = [];

	for (const poi of picks) {
		const cell = nearestWalkable(poi.x, poi.z, 4);
		if (!cell) continue;
		fields.push(buildLandmarkField(worldToCell(cell.x, cell.z)));
	}

	landmarkFields = fields;
	return fields;
}

/** Heurística ALT: cota inferior admisible basada en los landmarks. */
function altHeuristic(
	col: number,
	row: number,
	goalDistances: readonly number[],
	fields: readonly Float32Array[]
): number | null {
	const index = cellIndex(col, row);
	let best = 0;
	let used = false;

	for (let i = 0; i < fields.length; i += 1) {
		const goalDistance = goalDistances[i];
		if (!Number.isFinite(goalDistance)) continue;

		const value = fields[i][index];
		if (!Number.isFinite(value)) continue;

		used = true;
		const estimate = Math.abs(value - goalDistance);
		if (estimate > best) best = estimate;
	}

	return used ? best : null;
}

/**
 * A* sobre la rejilla. Devuelve una lista de waypoints suavizada; `null` si no
 * hay ruta o se supera el presupuesto de nodos.
 */
export function findPath(
	from: RoyaleVec3,
	to: RoyaleVec3,
	maxNodes = MAX_PATH_NODES
): RoyaleVec3[] | null {
	const start = nearestWalkable(from.x, from.z, 3, from.y);
	const goal = nearestWalkable(to.x, to.z, 3, to.y);

	if (!start || !goal) {
		return null;
	}

	const startCell = worldToCell(start.x, start.z);
	const goalCell = worldToCell(goal.x, goal.z);
	const cells = NAV_COLS * NAV_ROWS;
	const gScore = new Float32Array(cells);
	gScore.fill(Number.POSITIVE_INFINITY);
	const cameFrom = new Int32Array(cells);
	cameFrom.fill(-1);
	const closed = new Uint8Array(cells);
	const startIndex = cellIndex(startCell.col, startCell.row);
	const goalIndex = cellIndex(goalCell.col, goalCell.row);
	const open = new MinHeap();
	let visited = 0;

	const landmarks = getLandmarkFields();
	const goalDistances = landmarks.map((field) => field[goalIndex]);
	const scoreAt = (col: number, row: number): number => {
		const estimate = altHeuristic(col, row, goalDistances, landmarks);
		return estimate === null ? heuristic(col, row, goalCell.col, goalCell.row) : estimate;
	};

	gScore[startIndex] = 0;
	open.push({ index: startIndex, score: scoreAt(startCell.col, startCell.row) });

	while (open.size > 0) {
		const current = open.pop()!;

		if (closed[current.index]) continue;
		closed[current.index] = 1;
		visited += 1;

		if (current.index === goalIndex) {
			return buildPath(cameFrom, startIndex, goalIndex, start, goal);
		}

		if (visited >= maxNodes) break;

		const col = current.index % NAV_COLS;
		const row = Math.floor(current.index / NAV_COLS);

		for (let dirRow = -1; dirRow <= 1; dirRow += 1) {
			for (let dirCol = -1; dirCol <= 1; dirCol += 1) {
				if (dirRow === 0 && dirCol === 0) continue;

				const nextCol = col + dirCol;
				const nextRow = row + dirRow;

				if (!isWalkable(nextCol, nextRow)) continue;

				// Diagonal: exige ambos ortogonales para no cortar esquinas.
				if (
					dirCol !== 0 &&
					dirRow !== 0 &&
					(!isWalkable(col + dirCol, row) || !isWalkable(col, row + dirRow))
				) {
					continue;
				}

				const nextIndex = cellIndex(nextCol, nextRow);
				if (closed[nextIndex]) continue;

				const step = dirCol !== 0 && dirRow !== 0 ? Math.SQRT2 : 1;
				const tentative = gScore[current.index] + step;

				if (tentative >= gScore[nextIndex]) continue;

				gScore[nextIndex] = tentative;
				cameFrom[nextIndex] = current.index;
				open.push({
					index: nextIndex,
					score: tentative + scoreAt(nextCol, nextRow)
				});
			}
		}
	}

	return null;
}

function buildPath(
	cameFrom: Int32Array,
	startIndex: number,
	goalIndex: number,
	start: RoyaleVec3,
	goal: RoyaleVec3
): RoyaleVec3[] {
	const cells: number[] = [];
	let cursor = goalIndex;

	while (cursor !== -1 && cells.length <= MAX_PATH_NODES) {
		cells.push(cursor);
		if (cursor === startIndex) break;
		cursor = cameFrom[cursor];
	}

	cells.reverse();

	const points: RoyaleVec3[] = cells.map((index) => {
		const col = index % NAV_COLS;
		const row = Math.floor(index / NAV_COLS);
		return cellToWorld(col, row);
	});

	if (points.length === 0) return [];

	// El primer punto se mantiene: el bot camina desde donde está.
	points[0] = { x: start.x, y: start.y, z: start.z };

	// La meta exacta solo si está en una celda caminable cercana: un punto de
	// loot pegado a una pared puede caer en una celda no caminable y dejaba al
	// bot atrapado dentro de ella.
	const last = points[points.length - 1];
	const goalCell = worldToCell(goal.x, goal.z);

	if (
		Math.hypot(goal.x - last.x, goal.z - last.z) <= NAV_CELL_SIZE * 1.5 &&
		isWalkable(goalCell.col, goalCell.row)
	) {
		points[points.length - 1] = { x: goal.x, y: goal.y, z: goal.z };
	}

	// Suavizado: salta waypoints si la recta sigue siendo caminable.
	const smoothed: RoyaleVec3[] = [];
	let index = 0;

	while (index < points.length) {
		smoothed.push(points[index]);
		let furthest = index + 1;

		for (let candidate = points.length - 1; candidate > index + 1; candidate -= 1) {
			if (walkableLine(points[index], points[candidate])) {
				furthest = candidate;
				break;
			}
		}

		index = furthest;
	}

	return smoothed;
}
