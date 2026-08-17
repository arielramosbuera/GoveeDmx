#!/usr/bin/env bash
#
# Build the architecture-independent Linux/systemd release assets.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/release}"
ASSET="goveedmx-linux-systemd.tar.gz"
STAGE="$(mktemp -d)"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

[ -f "$REPO_ROOT/server/dist/server.cjs" ] || {
	echo "Missing server/dist/server.cjs; run npm run build first." >&2
	exit 1
}
[ -f "$REPO_ROOT/web/dist/index.html" ] || {
	echo "Missing web/dist/index.html; run npm run build first." >&2
	exit 1
}

mkdir -p "$OUTPUT_DIR" "$STAGE/goveedmx/server/dist" "$STAGE/goveedmx/web/dist" "$STAGE/goveedmx/installers"
node -p 'require(process.argv[1]).version' "$REPO_ROOT/package.json" > "$STAGE/goveedmx/VERSION"
install -m 0644 "$REPO_ROOT/server/dist/server.cjs" "$STAGE/goveedmx/server/dist/server.cjs"
cp -R "$REPO_ROOT/web/dist/." "$STAGE/goveedmx/web/dist/"
install -m 0755 "$SCRIPT_DIR/install.sh" "$STAGE/goveedmx/installers/install.sh"
install -m 0755 "$SCRIPT_DIR/install-ubuntu.sh" "$STAGE/goveedmx/installers/install-ubuntu.sh"
install -m 0755 "$SCRIPT_DIR/uninstall.sh" "$STAGE/goveedmx/installers/uninstall.sh"
install -m 0644 "$SCRIPT_DIR/goveedmx.service" "$STAGE/goveedmx/installers/goveedmx.service"

rm -f "$OUTPUT_DIR/$ASSET" "$OUTPUT_DIR/$ASSET.sha256"
tar -czf "$OUTPUT_DIR/$ASSET" -C "$STAGE" goveedmx

if command -v sha256sum >/dev/null 2>&1; then
	( cd "$OUTPUT_DIR" && sha256sum "$ASSET" > "$ASSET.sha256" )
else
	(
		cd "$OUTPUT_DIR"
		hash="$(shasum -a 256 "$ASSET" | awk '{print $1}')"
		printf '%s  %s\n' "$hash" "$ASSET" > "$ASSET.sha256"
	)
fi

echo "Created:"
echo "  $OUTPUT_DIR/$ASSET"
echo "  $OUTPUT_DIR/$ASSET.sha256"
