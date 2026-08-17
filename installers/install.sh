#!/usr/bin/env bash
#
# GoveeDMX installer for Linux / Raspberry Pi.
# Installs or repairs the bridge as a systemd service that auto-starts on boot.
# Run with sudo: sudo ./install.sh [--repair]
#
set -euo pipefail

APP_DIR="/opt/goveedmx"
DATA_DIR="/var/lib/goveedmx"
SERVICE_USER="goveedmx"
SERVICE_NAME="goveedmx"
HTTP_PORT="8080"
ARTNET_PORT="6454"
MODE="${1:-install}"

err() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ">> $*"; }

[ "$(id -u)" -eq 0 ] || err "Please run as root (sudo ./install.sh)"
[ "$MODE" = "install" ] || [ "$MODE" = "--repair" ] || err "Usage: sudo ./install.sh [--repair]"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Locate Node.js (need >= 20) ---
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || err "Node.js 20+ not found. Install it first (e.g. https://github.com/nodesource/distributions) and re-run."
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || err "Node.js 20+ required (found $($NODE_BIN -v))."
info "Using Node $($NODE_BIN -v) at $NODE_BIN"

SERVER_BUNDLE="$REPO_ROOT/server/dist/server.cjs"
WEB_DIST="$REPO_ROOT/web/dist"

if [ "$MODE" = "install" ]; then
	# --- Build artifacts if needed ---
	if [ ! -f "$SERVER_BUNDLE" ] || [ ! -f "$WEB_DIST/index.html" ]; then
		info "Build artifacts missing; building from source..."
		command -v npm >/dev/null 2>&1 || err "npm not found and no prebuilt artifacts present."
		( cd "$REPO_ROOT" && npm install && npm run build )
	fi
	[ -f "$SERVER_BUNDLE" ] || err "Server bundle not found after build: $SERVER_BUNDLE"
	[ -f "$WEB_DIST/index.html" ] || err "Web UI not found after build: $WEB_DIST"
fi

# --- Service user ---
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
	info "Creating service user '$SERVICE_USER'"
	useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

mkdir -p "$APP_DIR" "$DATA_DIR"

if [ "$MODE" = "install" ]; then
	# --- Install files ---
	info "Installing to $APP_DIR"
	install -m 0644 "$SERVER_BUNDLE" "$APP_DIR/server.cjs"
	rm -rf "$APP_DIR/web"
	cp -r "$WEB_DIST" "$APP_DIR/web"
	if [ -f "$REPO_ROOT/VERSION" ]; then
		install -m 0644 "$REPO_ROOT/VERSION" "$APP_DIR/VERSION"
	fi
fi
install -m 0755 "$SCRIPT_DIR/install.sh" "$APP_DIR/install.sh"
install -m 0755 "$SCRIPT_DIR/uninstall.sh" "$APP_DIR/uninstall.sh"
if [ -f "$SCRIPT_DIR/install-ubuntu.sh" ]; then
	install -m 0755 "$SCRIPT_DIR/install-ubuntu.sh" "$APP_DIR/install-ubuntu.sh"
fi

# --- Initial guided configuration ---
if [ "${GOVEEDMX_WRITE_CONFIG:-0}" = "1" ]; then
	CONFIG_PATH="$DATA_DIR/config.json"
	HTTP_VALUE="${GOVEEDMX_HTTP_PORT:-8080}"
	ARTNET_VALUE="${GOVEEDMX_ARTNET_PORT:-6454}"
	UNIVERSE_VALUE="${GOVEEDMX_UNIVERSES:-0}"
	BIND_VALUE="${GOVEEDMX_BIND_ADDRESS:-0.0.0.0}"
	NODE_NAME_VALUE="${GOVEEDMX_NODE_NAME:-GoveeDMX}"
	CONFIG_PATH="$CONFIG_PATH" HTTP_VALUE="$HTTP_VALUE" ARTNET_VALUE="$ARTNET_VALUE" \
	UNIVERSE_VALUE="$UNIVERSE_VALUE" BIND_VALUE="$BIND_VALUE" NODE_NAME_VALUE="$NODE_NAME_VALUE" \
		"$NODE_BIN" <<'NODE'
const fs = require('node:fs')
const file = process.env.CONFIG_PATH
let config = {}
try { config = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
const universes = process.env.UNIVERSE_VALUE.split(',').map(Number)
config = {
	version: Number(config.version) || 1,
	server: { ...(config.server || {}), httpPort: Number(process.env.HTTP_VALUE) },
	artnet: {
		bindAddress: '0.0.0.0',
		port: 6454,
		universes: [0],
		enableArtPollReply: true,
		nodeName: 'GoveeDMX',
		...(config.artnet || {}),
		bindAddress: process.env.BIND_VALUE,
		port: Number(process.env.ARTNET_VALUE),
		universes,
		nodeName: process.env.NODE_NAME_VALUE,
	},
	govee: {
		interfaceAddress: '',
		autoDiscover: true,
		discoverInterval: 60,
		pollInterval: 5,
		maxMessagesPerSecond: 8,
		...(config.govee || {}),
		interfaceAddress: process.env.BIND_VALUE === '0.0.0.0' ? '' : process.env.BIND_VALUE,
	},
	bulbs: Array.isArray(config.bulbs) ? config.bulbs : [],
	patch: Array.isArray(config.patch) ? config.patch : [],
}
fs.mkdirSync(require('node:path').dirname(file), { recursive: true })
fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(config, null, 2)}\n`)
fs.renameSync(`${file}.tmp`, file)
NODE
fi

chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR" "$DATA_DIR"

# --- systemd unit ---
info "Installing systemd service '$SERVICE_NAME'"
sed -e "s|__NODE__|$NODE_BIN|g" -e "s|__USER__|$SERVICE_USER|g" \
	"$SCRIPT_DIR/goveedmx.service" > "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# --- Firewall (best effort) ---
if [ -f "$DATA_DIR/config.json" ]; then
	HTTP_PORT="$("$NODE_BIN" -e 'try{console.log(require(process.argv[1]).server.httpPort||8080)}catch{console.log(8080)}' "$DATA_DIR/config.json")"
	ARTNET_PORT="$("$NODE_BIN" -e 'try{console.log(require(process.argv[1]).artnet.port||6454)}catch{console.log(6454)}' "$DATA_DIR/config.json")"
fi
if command -v ufw >/dev/null 2>&1; then
	info "Opening firewall ports (ufw)"
	ufw allow "$HTTP_PORT"/tcp >/dev/null 2>&1 || true
	ufw allow "$ARTNET_PORT"/udp >/dev/null 2>&1 || true
	ufw allow 4001:4003/udp >/dev/null 2>&1 || true
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
if [ "$MODE" = "--repair" ]; then
	info "GoveeDMX service and permissions repaired."
else
	info "GoveeDMX installed and running."
fi
echo "   Web UI:   http://${IP:-<this-host>}:$HTTP_PORT"
echo "   Status:   sudo systemctl status $SERVICE_NAME"
echo "   Logs:     sudo journalctl -u $SERVICE_NAME -f"
echo "   Maintenance: curl -fsSL https://raw.githubusercontent.com/arielramosbuera/GoveeDmx/main/installers/install-ubuntu.sh | sudo bash"
