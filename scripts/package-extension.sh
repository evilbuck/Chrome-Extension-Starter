#!/usr/bin/env bash
# Production-build the extension and zip dist/ contents for Chrome Web Store upload.
# Zip root is dist/ (manifest.json at the top level), not the repo.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if command -v pnpm >/dev/null 2>&1; then
    pnpm build:prod
elif [[ -x ./node_modules/.bin/rsbuild ]]; then
    ./node_modules/.bin/rsbuild build --mode=production
else
    echo "package-extension: pnpm/rsbuild not found. Run pnpm install first." >&2
    exit 1
fi

if [[ ! -f dist/manifest.json ]]; then
    echo "package-extension: dist/manifest.json missing after build." >&2
    exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
    echo "package-extension: zip is required." >&2
    exit 1
fi

version="$(python3 -c 'import json; print(json.load(open("dist/manifest.json"))["version"])')"
name="$(python3 -c 'import json; print(json.load(open("package.json"))["name"])')"
outdir="$root/releases"
mkdir -p "$outdir"
outfile="$outdir/${name}-v${version}.zip"
rm -f "$outfile"

(
    cd dist
    zip -r "$outfile" . -x '*.map' -x '*.DS_Store' -x '*/.DS_Store'
)

if ! zipinfo -1 "$outfile" | grep -qx 'manifest.json'; then
    echo "package-extension: zip is missing manifest.json at the archive root." >&2
    exit 1
fi

echo "Packaged $outfile"
