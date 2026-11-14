---
id: SPEC-039
titulo: "Rebranding del juego a NearBox"
estado: completado
prioridad: alta
creado: 2026-11-13
actualizado: 2026-11-13
responsable: "OpenCode agent"
etiquetas: [rebranding, branding, frontend, run, thumbnail]
depende_de: [SPEC-017, SPEC-022]
bloquea: []
estimacion: "2h"
---

# SPEC-039 — Rebranding del juego a NearBox

## 1. Contexto

El juego se publicó originalmente como **Monster Village** (antes «Calabazar Embrujado»). El nombre quedó fijado en el título HTML, splash de arranque, pantalla de carga, login, onboarding, centro de turismo, guía de la aldea, favicon, thumbnail de RUN y metadatos de la ficha del juego en la plataforma RUN.

El usuario decidió rebrandear el juego a **NearBox** sin cambiar la ambientación ni la jugabilidad. Este spec documenta el alcance ejecutado y deja constancia de qué se renombró y qué se conservó deliberadamente.

## 2. Objetivo

Sustituir el nombre público «Monster Village» por «NearBox» en código, assets y ficha de RUN, manteniendo intactos el mundo, los sistemas y los identificadores técnicos que ya están desplegados.

## 3. Alcance

**Incluye**

- Textos visibles del frontend que mostraban «Monster Village».
- Título y meta description de `app.html`.
- `aria-label` del splash, pantalla de carga y favicons.
- Thumbnail cuadrado de 512×512 usado por RUN.
- Metadatos de la ficha del juego en RUN: nombre, descripción y keywords.
- Nombres internos de los paquetes `frontend` y `backend` y sus lockfiles.
- Documentación del rebranding en este spec.

**No incluye**

- Cambiar la ambientación, historia, mapas, misiones, minijuegos o economía.
- Renombrar cuentas NEAR, contratos desplegados, `gameId` ni rutas de assets.
- Reescribir specs históricos: las menciones a «Monster Village» se conservan como registro.
- Redeploy de contratos o cambios on-chain.
- Publicar una nueva versión del juego en RUN (solo se actualizaron los metadatos de la ficha).

## 4. Requisitos

### Funcionales

| ID   | Requisito                                                                 | Prioridad |
| ---- | ------------------------------------------------------------------------- | --------- |
| RF-1 | Todo texto visible del frontend muestra «NearBox» en lugar del nombre viejo | alta      |
| RF-2 | La pestaña del navegador, el splash inicial y la pantalla de carga usan el nuevo nombre | alta |
| RF-3 | El favicon declara `aria-label="NearBox"`                                  | media     |
| RF-4 | La ficha del juego en RUN se llama «NearBox» con descripción y keywords revisadas | alta |
| RF-5 | El thumbnail 512×512 muestra el logo «NEARBOX»                             | alta      |
| RF-6 | Los paquetes internos usan nombres `nearbox-*`                             | baja      |

### No funcionales

| ID    | Requisito                                              | Criterio |
| ----- | ------------------------------------------------------ | -------- |
| RNF-1 | No romper el build de producción                       | `bun run build` termina sin errores |
| RNF-2 | No romper identificadores de RUN, NEAR ni rutas de assets | Mismo `gameId`, mismos `catalog_id`, mismas rutas |
| RNF-3 | Mantener la estética Halloween del thumbnail           | Misma composición, tipografía y paleta morada/naranja |

## 5. Criterios de aceptación

- [x] CA-1: `grep -rn "Monster Village" frontend/src frontend/static backend/src contracts` no devuelve resultados.
- [x] CA-2: `frontend/src/app.html` tiene `<title>NearBox</title>` y splash con «NearBox».
- [x] CA-3: La pantalla de carga, login, onboarding y centro de turismo muestran «NearBox».
- [x] CA-4: `rundot game info` muestra `Name: NearBox`, la nueva descripción y las 5 keywords de gameplay.
- [x] CA-5: `frontend/static/thumbnail.jpg` es 512×512 y muestra el logo «NEARBOX».
- [x] CA-6: `frontend/package.json` y `backend/package.json` se llaman `nearbox-frontend` y `nearbox-backend`.
- [x] CA-7: `bun run build` genera `dist` y `.build/static` sin referencias a «Monster Village».
- [x] CA-8: El thumbnail anterior queda respaldado en `frontend/static/_unused/thumbnail-monster-village.jpg`.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `frontend/src/app.html` | modificar | Título, meta description, fondo de transición y `aria-label` |
| `frontend/src/routes/+layout.svelte` | modificar | Eliminar la retirada del splash estático |
| `frontend/static/NearBox.png` | crear | Logo oficial usado por el splash |
| `frontend/src/lib/components/ui/LoadingScreen.svelte` | modificar | Nombre en pantalla de carga y `aria-label` |
| `frontend/src/lib/components/Guardian.svelte` | modificar | Nombre en pantalla de login |
| `frontend/src/lib/components/ui/OnboardingOverlay.svelte` | modificar | «Welcome to NearBox» |
| `frontend/src/lib/components/ui/onboardingTutorial.ts` | modificar | Título del tutorial |
| `frontend/src/lib/components/ui/TourismPanel.svelte` | modificar | Cabecera y subtítulo del centro de turismo |
| `frontend/src/lib/components/ui/villageGuide.ts` | modificar | Ubicación de la misión de gatos |
| `frontend/src/lib/state/hubKiosks.svelte.ts` | modificar | Hint del kiosco de guía |
| `frontend/src/lib/assets/favicon.svg` | modificar | `aria-label` |
| `frontend/static/favicon.svg` | modificar | `aria-label` |
| `frontend/static/thumbnail.jpg` | reemplazar | Nuevo arte 512×512 con logo NearBox |
| `frontend/static/_unused/thumbnail-monster-village.jpg` | crear | Respaldo del thumbnail anterior |
| `frontend/package.json` / `frontend/bun.lock` | modificar | Nombre `nearbox-frontend` |
| `backend/package.json` / `backend/bun.lock` | modificar | Nombre `nearbox-backend` |
| `frontend/dist` y `frontend/.build/static` | regenerar | Build de producción actualizado |
| Ficha del juego en RUN (`gameId crway8mkf3QwlWVncbfl`) | modificar | Nombre, descripción y keywords remotos |

## 7. Plan de implementación

### Fase 1 — Textos del frontend

- [x] Paso 1: Localizar todas las apariciones de «Monster Village» en `frontend/src` y `frontend/static`.
- [x] Paso 2: Sustituir por «NearBox» en HTML, splash, carga, login, onboarding, turismo, guía y kiosco.
- [x] Paso 3: Actualizar `aria-label` de favicons.

### Fase 2 — Identidad visual

- [x] Paso 1: Respaldar el thumbnail anterior.
- [x] Paso 2: Generar una versión con el logo «NEARBOX» manteniendo la composición.
- [x] Paso 3: Exportar a JPG 512×512.

### Fase 3 — Metadatos y paquetes

- [x] Paso 1: Renombrar el juego en RUN con `rundot game set-name "NearBox"`.
- [x] Paso 2: Actualizar descripción y revisar keywords en RUN.
- [x] Paso 3: Renombrar los paquetes internos y sus lockfiles.

### Fase 4 — Verificación

- [x] Paso 1: Buscar referencias restantes al nombre viejo.
- [x] Paso 2: Ejecutar el build de producción.
- [x] Paso 3: Confirmar metadatos con `rundot game info`.

## 8. Verificación

```bash
# Sin referencias al nombre viejo
grep -rn "Monster Village" frontend/src frontend/static backend/src contracts

# Build de producción
cd frontend && bun run build

# Metadatos de RUN
cd frontend && rundot game info
```

Casos manuales:

1. Abrir la app y comprobar el splash inicial y la pantalla de carga: debe decir «NearBox».
2. Comprobar la pestaña del navegador: título «NearBox».
3. Abrir el centro de turismo y la guía: deben mencionar «NearBox».
4. Revisar la ficha del juego en RUN: nombre «NearBox», descripción y keywords actualizadas.
5. Revisar el thumbnail: logo «NEARBOX» legible y estética Halloween intacta.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Cambiar identificadores técnicos y romper el deploy | alto | Solo se cambiaron textos y nombres de paquetes; `gameId`, cuentas y rutas intactos |
| Perder el arte original del thumbnail | medio | Respaldo en `frontend/static/_unused/thumbnail-monster-village.jpg` |
| Inconsistencia entre código y ficha de RUN | medio | Nombre remoto actualizado y verificado con `rundot game info` |
| Build viejo en `dist` con el nombre anterior | bajo | Se regeneró el build después de los cambios |
| Specs históricos con el nombre viejo | bajo | Se conservan como registro; este spec documenta el rename |

## 10. Preguntas abiertas

- [ ] ¿Se publicará una nueva versión en RUN con changelog de rebranding, o solo se actualizan metadatos?
- [ ] ¿Se renombrará también la URL pública `monster-village` de RUN?
- [ ] ¿Se actualizarán las cuentas NEAR y contratos `runworld-nep245.testnet` en una migración futura?

## 11. Decisiones y notas

- Se mantiene «village» como concepto del mundo (la aldea sigue existiendo); solo cambia el nombre del juego.
- El thumbnail conserva el logo de RUN.world por ser la plataforma de publicación.
- No se reescribieron specs anteriores: «Monster Village» queda como nombre histórico en `SPEC-017`, `SPEC-019`, `SPEC-022`, `SPEC-033` y `SPEC-036`.
- La generación del thumbnail se hizo con el generador de imágenes de RUN usando el arte original como referencia.
- RUN limita la ficha a 5 keywords: al intentar añadir `nearbox` conserva las 5 de gameplay (`halloween, cooperative, exploration, 3d, cats`). El nombre del juego ya cubre la búsqueda por marca.
- El splash quedó unificado: se eliminó el splash estático duplicado de `app.html` y el único splash visible es `LoadingScreen.svelte`, que carga `NearBox.png` y muestra el progreso real de assets. `app.html` conserva solo el fondo de transición con la paleta amarillo/cian.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-13 | en-progreso | Rebranding aplicado en frontend, assets y metadatos de RUN |
| 2026-11-13 | completado | Build verificado y ficha de RUN confirmada |
| 2026-11-13 | completado | Splash unificado con el logo `NearBox.png` y paleta amarillo/cian |

## 13. Changelog

- 2026-11-13 — Creación del spec y ejecución completa del rebranding a NearBox.
- 2026-11-13 — Splash único: eliminado el splash estático de `app.html`; `LoadingScreen.svelte` usa el logo NearBox y la nueva paleta.
