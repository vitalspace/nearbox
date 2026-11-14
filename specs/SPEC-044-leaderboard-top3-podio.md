---
id: SPEC-044
titulo: "Top 3 global en el podio del mapa"
estado: completado
prioridad: media
creado: 2026-11-14
actualizado: 2026-11-14
responsable: "opencode"
etiquetas: [backend, frontend, stats, leaderboard, podio, mongodb]
depende_de: [SPEC-041, SPEC-042, SPEC-043]
bloquea: []
estimacion: "3h"
---

# SPEC-044 — Top 3 global en el podio del mapa

## 1. Contexto

SPEC-043 vincula las estadísticas a la cuenta, pero solo expone lecturas por
`playerId`. El mapa ya tiene el podio `Top3_Root` (`TOP3_PedestalTop1..3`) y el
jugador no puede ver quién lidera el progreso global.

## 2. Objetivo

Mostrar sobre el podio del mapa a los 3 jugadores con más misiones completadas,
renderizando su skin actual y un cartel con alias y contadores.

## 3. Alcance

**Incluye**

- `GET /stats/leaderboard?limit=N` público, ordenado por misiones completadas y
  desempatado por kills.
- Persistir `alias` y `skin` en `player_stats` al hacer `PUT /stats/:playerId`.
- Store `leaderboard` en el frontend con caché corta y refresco periódico.
- `PodiumPlayers`/`PodiumPlayer`: avatares 3D y etiqueta sobre `Top3_Root`.

**No incluye**

- Historial de temporadas, paginación ni rankings por minijuego.
- Verificación on-chain de la identidad (sigue igual que SPEC-043).

## 4. Requisitos

| ID | Requisito |
| -- | --------- |
| RF-1 | `GET /stats/leaderboard` devuelve como máximo 20 filas y requiere `score > 0` o `kills > 0`. |
| RF-2 | El ranking usa `cats.completed + crypt.completed + barn.completed + race.won`. |
| RF-3 | El `PUT` guarda `alias` (1–24) y `skin` (1–32, `[a-z0-9-]`) sin afectar a `$max`. |
| RF-4 | El podio pinta hasta 3 avatares con `PlayerSkin` y reproduce `HR_idle`. |
| RF-5 | Si el jugador no tiene alias, se usa el handle de la cuenta o un id corto. |
| RF-6 | Sin MongoDB o si la petición falla, el mapa sigue funcionando sin podio. |

## 5. Criterios de aceptación

- [x] CA-1: Dos cuentas con distinto progreso aparecen ordenadas por misiones.
- [x] CA-2: `alias` y `skin` se devuelven en `GET`/`PUT` y en el leaderboard.
- [x] CA-3: Un `skin` inválido en el snapshot devuelve `400`.
- [x] CA-4: `PodiumPlayers` se monta sobre las coordenadas del podio sin generar
  colliders (`AutoColliders` no incluye los avatares).
- [x] CA-5: `bunx tsc --noEmit`, `bun test`, `bun run check` y Prettier pasan.

## 6. Archivos relevantes

| Ruta | Acción |
| ---- | ------ |
| `backend/src/db/models/playerStats.ts` | `alias` y `skin`. |
| `backend/src/stats/schema.ts` | Campos opcionales y tipos del leaderboard. |
| `backend/src/stats/service.ts` | `applySnapshot` con perfil y `getLeaderboard`. |
| `backend/src/routes/stats.ts` | `GET /leaderboard` antes de `/:playerId`. |
| `backend/tests/stats.test.ts` | Test de ranking y perfil. |
| `frontend/src/lib/state/leaderboard.svelte.ts` | Store del Top 3. |
| `frontend/src/lib/state/stats.svelte.ts` | Envía alias/skin en cada sync. |
| `frontend/src/lib/components/world/PodiumPlayers.svelte` | Slots del podio. |
| `frontend/src/lib/components/world/PodiumPlayer.svelte` | Avatar, idle y cartel. |
| `frontend/src/lib/components/world/Map.svelte` | Monta `PodiumPlayers` junto a `Top3_Root`. |

## 7. Decisiones y notas

- **Score = misiones completadas**: es fácil de explicar en el cartel y no
  premia grind de muertes. `kills` es el desempate y, por sí solas, también
  clasifican: un jugador con kills pero sin victorias sigue viéndose en el
  podio cuando hay hueco.
- **Perfil en `player_stats`**: evita otra colección y permite pintar el podio
  con jugadores desconectados.
- **`$set` para el perfil**: el alias/skin más reciente gana; los contadores
  siguen siendo monótonos con `$max`.
- **Ruta antes de `/:playerId`**: evita que `leaderboard` se interprete como id.
- **Fuera de `AutoColliders`**: los modelos de los avatares se cargan después y
  no deben entrar en el trimesh de colisión del podio.

## 8. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-14 | completado | Endpoint, perfil persistido, store y podio 3D; checks en verde |
| 2026-11-14 | completado | Las kills también clasifican para el podio (antes un jugador con 0 misiones no aparecía) |
