import { describe, expect, test } from 'bun:test';
import {
	PROGRESSION_MISSIONS as BACKEND_MISSIONS,
	catalogFingerprint as backendFingerprint,
	missionById as backendMissionById
} from '../src/progression/catalog';
import {
	PROGRESSION_MISSIONS as FRONTEND_MISSIONS,
	catalogFingerprint as frontendFingerprint,
	missionById as frontendMissionById
} from '../../frontend/src/lib/missions/progression';

/**
 * RF-6 / CA-20: el catálogo del backend y el del frontend deben ser idénticos.
 *
 * El test importa el archivo puro del frontend (sin Svelte ni DOM) y compara la
 * huella y las misiones una a una. Si alguien cambia un objetivo, un umbral o
 * un `catalogId` en un solo lado, este test falla.
 */
describe('progression catalog parity', () => {
	test('both catalogs produce the same fingerprint', () => {
		expect(backendFingerprint()).toBe(frontendFingerprint());
	});

	test('mission ids are identical and in the same order', () => {
		expect(BACKEND_MISSIONS.map((mission) => mission.id)).toEqual(
			FRONTEND_MISSIONS.map((mission) => mission.id)
		);
	});

	test('every mission matches field by field', () => {
		for (const mission of BACKEND_MISSIONS) {
			const frontendMission = frontendMissionById(mission.id);

			expect(frontendMission).not.toBeNull();
			expect(frontendMission).toEqual(mission);
		}

		for (const mission of FRONTEND_MISSIONS) {
			expect(backendMissionById(mission.id)).not.toBeNull();
		}
	});
});
