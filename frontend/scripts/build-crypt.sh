#!/usr/bin/env bash
# Genera el componente Threlte de la cripta y lo mueve a components/world.
# Uso: bun run crypt:build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/static"

npx --yes @threlte/gltf@latest game2.glb -K -k \
  -d "https://www.gstatic.com/draco/versioned/decoders/1.4.3/"

GENERATED=""
for candidate in game2.svelte Game2.svelte; do
  if [ -f "$candidate" ]; then
    GENERATED="$candidate"
    break
  fi
done

if [ -z "$GENERATED" ]; then
  echo "No se generó ningún componente para game2.glb" >&2
  exit 1
fi

mv "$GENERATED" "$ROOT/src/lib/components/world/Crypt.svelte"
node "$ROOT/scripts/inject-crypt-colliders.mjs"
npx --yes prettier --write "$ROOT/src/lib/components/world/Crypt.svelte"
echo "Crypt.svelte actualizado desde static/maps/game2.glb"
