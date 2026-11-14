#!/usr/bin/env bash
# Genera el componente Threlte del mapa y lo mueve a components/world.
# Uso: bun run map:build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/static"

npx --yes @threlte/gltf@latest map.glb -K -k \
  -d "https://www.gstatic.com/draco/versioned/decoders/1.4.3/"

GENERATED=""
for candidate in map.svelte Map.svelte; do
  if [ -f "$candidate" ]; then
    GENERATED="$candidate"
    break
  fi
done

if [ -z "$GENERATED" ]; then
  echo "No se generó ningún componente para map.glb" >&2
  exit 1
fi

mv "$GENERATED" "$ROOT/src/lib/components/world/Map.svelte"
node "$ROOT/scripts/inject-map-colliders.mjs"
npx --yes prettier --write "$ROOT/src/lib/components/world/Map.svelte"
echo "Map.svelte actualizado desde static/maps/map.glb"
