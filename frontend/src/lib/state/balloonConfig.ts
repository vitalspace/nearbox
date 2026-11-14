/**
 * Constantes del globo aerostático del mapa exterior.
 *
 * Deben coincidir con `backend/src/server/protocol.ts`
 * (`BALLOON_SPAWN`, `BALLOON_MAX_RADIUS`, `BALLOON_MIN_Y`, `BALLOON_MAX_Y`).
 */

export const BALLOON_SPAWN = { x: 14.16, y: 0.02, z: -9 };

/** El globo nunca sale del recinto del mapa (radio de las murallas ~103). */
export const BALLOON_MAX_RADIUS = 90;

/** Altura mínima (base del globo apoyada en el suelo del claro). */
export const BALLOON_MIN_Y = BALLOON_SPAWN.y;

/** Techo de vuelo: por debajo del zepelín decorativo (21 m). */
export const BALLOON_MAX_Y = 40;

/** Velocidad horizontal máxima (m/s). */
export const BALLOON_MAX_SPEED = 14;

/** Velocidad vertical al mantener Space / Shift. */
export const BALLOON_LIFT_SPEED = 7;

/** Aceleración/frenado horizontal. */
export const BALLOON_ACCELERATION = 5;

/** Velocidad de giro con A/D (rad/s). */
export const BALLOON_YAW_SPEED = 1.2;

/** Intervalo de reporte al servidor, igual que los coches. */
export const BALLOON_STATE_INTERVAL_MS = 100;

/** Radio horizontal para poder subir a la canasta. */
export const BALLOON_ENTER_RADIUS = 7;

/** Diferencia vertical máxima entre los pies del jugador y la base del globo. */
export const BALLOON_ENTER_MAX_DY = 6;

/** Distancia lateral a la que aparece el jugador al salir de la canasta. */
export const BALLOON_EJECT_DISTANCE = 3;
