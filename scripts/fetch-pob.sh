#!/usr/bin/env bash
# Sparse-clone Path of Building PoE2's game data (src/Data only) into vendor/pob.
# Then: pip install lupa && python3 data/load.py && python3 data/build_data.py && npm run build
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -d vendor/pob/.git ]; then
  git -C vendor/pob pull --ff-only
else
  git clone --depth 1 --filter=blob:none --sparse https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2.git vendor/pob
  git -C vendor/pob sparse-checkout set src/Data
fi
git -C vendor/pob log -1 --format='PoB PoE2 data at %h (%cd)' --date=short
