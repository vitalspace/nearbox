import { z } from 'zod';
import { statsPlayerIdSchema } from '../stats/schema';

export const progressionPlayerIdSchema = statsPlayerIdSchema;

const objectiveId = z.string().trim().min(1).max(64);

export const errandSyncSchema = z.object({
	errands: z
		.array(
			z.object({
				missionId: objectiveId,
				collectedIds: z.array(objectiveId).max(64)
			})
		)
		.max(64),
	/**
	 * IDs importados de `rw:missions:v1` en el primer sync (SPEC-045 §11.10).
	 * El servidor solo acepta la lista blanca de hitos `T0` y `cats-25`.
	 */
	legacyCompleted: z.array(objectiveId).max(64).optional()
});

export const missionProgressBodySchema = z.object({
	collectedIds: z.array(objectiveId).max(64)
});

export type ErrandSyncInput = z.infer<typeof errandSyncSchema>;
export type MissionProgressInput = z.infer<typeof missionProgressBodySchema>;
