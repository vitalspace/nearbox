#!/usr/bin/env bash
# Ejecuta near-cli usando las credenciales que viven dentro del repo
# (.near-credentials/) en lugar de ~/.near-credentials.
#
# Uso:
#   ./contracts/scripts/near.sh state <account>
#   ./contracts/scripts/near.sh call <contract> <method> '<args>' --accountId <account>
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOME="$ROOT" exec near "$@"
