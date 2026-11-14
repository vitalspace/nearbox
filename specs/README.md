# Specs

Cada tarea del proyecto se describe con un spec en esta carpeta. El spec es la fuente de verdad: contexto, plan, archivos afectados, estado y verificación.

## Crear un spec

1. Copia `TEMPLATE.md` a `specs/SPEC-###-slug-corto.md` (usa el siguiente número libre).
2. Pega tu contexto en la sección 1 o pásaselo a la IA junto con este prompt:

   ```
   Lee specs/TEMPLATE.md y specs/README.md.
   Genera specs/SPEC-<siguiente-id>-<slug>.md a partir de este contexto:

   <pega aquí tu contexto>

   Explora el repo para verificar rutas, stack y comandos reales.
   Rellena todas las secciones, elimina el bloque de instrucciones para la IA
   y deja las dudas en "Preguntas abiertas".
   ```

3. Revisa el plan y responde las preguntas abiertas.
4. Pasa el spec a la IA que vaya a implementarlo (indica la ruta del archivo).
5. La IA actualiza el estado y el progreso al terminar.

Con opencode puedes usar el comando `/spec <contexto>` para generar el archivo automáticamente.

## Estados

| Estado        | Significado                                      |
| ------------- | ------------------------------------------------ |
| `borrador`    | Spec creado, pendiente de revisión o preguntas   |
| `en-progreso` | Aprobado y en implementación                     |
| `bloqueado`   | Esperando decisión, dependencia o acceso         |
| `completado`  | Criterios de aceptación cumplidos y verificados  |
| `cancelado`   | Descartado; indicar motivo en el changelog       |

## Reglas

- Un spec = una tarea entregable. Si crece demasiado, divídelo y usa `depende_de`.
- Rutas de archivos reales, nunca inventadas.
- Criterios de aceptación medibles y verificables.
- Actualiza `estado`, `actualizado`, "Progreso" y "Changelog" en cada cambio relevante.
- No marques `completado` sin haber ejecutado la verificación de la sección 8.
