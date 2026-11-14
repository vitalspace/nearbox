---
id: SPEC-000
titulo: "<título corto e imperativo>"
estado: borrador # borrador | en-progreso | bloqueado | completado | cancelado
prioridad: media # baja | media | alta | crítica
creado: YYYY-MM-DD
actualizado: YYYY-MM-DD
responsable: "<persona o agente>"
etiquetas: []
depende_de: []
bloquea: []
estimacion: "<ej. 4h>"
---

# SPEC-000 — <Título>

<!--
INSTRUCCIONES PARA LA IA (eliminar este bloque al generar el spec final):

1. Lee el contexto completo del usuario y explora el código existente ANTES de escribir.
2. Rellena TODAS las secciones. Si falta información, escribe "TBD: <pregunta>" y añádela a "Preguntas abiertas".
3. El plan debe poder ejecutarlo otro agente sin contexto adicional: pasos atómicos, ordenados y verificables.
4. En "Archivos relevantes" usa rutas reales del repo (verifícalas). Indica si se crean, modifican o eliminan.
5. Cada requisito funcional debe tener al menos un criterio de aceptación medible.
6. Usa los comandos reales del proyecto para verificar (ver package.json / README).
7. No inventes APIs, librerías ni archivos. Si algo no existe, propón crearlo explícitamente.
8. Stack del repo: frontend SvelteKit 3 + Svelte 5 + Threlte + Rapier; backend ElysiaJS + Bun.
9. Al completar la tarea: actualiza `estado`, `actualizado`, "Progreso", marca checkboxes y añade una entrada al "Changelog".
10. El spec es la fuente de verdad: si el plan cambia durante la implementación, actualízalo primero.
-->

## 1. Contexto

<Qué existe hoy, por qué surge la tarea, enlaces a issues, capturas o conversaciones relevantes.>

## 2. Objetivo

<Resultado esperado en 1-3 frases.>

## 3. Alcance

**Incluye**

- ...

**No incluye**

- ...

## 4. Requisitos

### Funcionales

| ID   | Requisito | Prioridad |
| ---- | --------- | --------- |
| RF-1 | ...       | alta      |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | ...       | ...      |

## 5. Criterios de aceptación

- [ ] CA-1: ...
- [ ] CA-2: ...

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `frontend/src/...` | modificar | ... |
| `backend/src/...`  | crear     | ... |

## 7. Plan de implementación

### Fase 1 — <nombre>

- [ ] Paso 1: ...
- [ ] Paso 2: ...

### Fase 2 — <nombre>

- [ ] Paso 1: ...

## 8. Verificación

```bash
# Frontend
cd frontend && bun run check && bun run lint

# Backend
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. ...

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| ...    | ...     | ...        |

## 10. Preguntas abiertas

- [ ] ...

## 11. Decisiones y notas

- ...

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| YYYY-MM-DD | borrador | Spec creado |

## 13. Changelog

- YYYY-MM-DD — Creación del spec.
