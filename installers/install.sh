#!/usr/bin/env bash
#
# GoveeDMX installer for Linux / Raspberry Pi.
# Installs the bridge as a systemd service that auto-starts on boot and
# restarts on failure. Run with sudo:  sudo ./install.sh
#
set -euo pipefail

APP_DIR="/opt/goveedmx"
DATA_DIR="/var/lib/goveedmx"
SERVICE_USER="goveedmx"
SERVICE_NAME="goveedmx"
HTTP_PORT="8080"

err() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ">> $*"; }

[ "$(id -u)" -eq 0 ] || err "Please run as root (sudo ./install.sh)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Locate Node.js (need >= 20) ---
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || err "Node.js 20+ not found. Install it first (e.g. https://github.com/nodesource/distributions) and re-run."
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || err "Node.js 20+ required (found $($NODE_BIN -v))."
info "Using Node $($NODE_BIN -v) at $NODE_BIN"

# --- Build artifacts if needed ---
SERVER_BUNDLE="$REPO_ROOT/server/dist/server.cjs"
WEB_DIST="$REPO_ROOT/web/dist"
if [ ! -f "$SERVER_BUNDLE" ] || [ ! -f "$WEB_DIST/index.html" ]; then
	info "Build artifacts missing; building from source..."
	command -v npm >/dev/null 2>&1 || err "npm not found and no prebuilt artifacts present."
	( cd "$REPO_ROOT" && npm install && npm run build )
fi
[ -f "$SERVER_BUNDLE" ] || err "Server bundle not found after build: $SERVER_BUNDLE"
[ -f "$WEB_DIST/index.html" ] || err "Web UI not found after build: $WEB_DIST"

# --- Service user ---
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
	info "Creating service user '$SERVICE_USER'"
	useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# --- Install files ---
info "Installing to $APP_DIR"
mkdir -p "$APP_DIR" "$DATA_DIR"
install -m 0644 "$SERVER_BUNDLE" "$APP_DIR/server.cjs"
rm -rf "$APP_DIR/web"
cp -r "$WEB_DIST" "$APP_DIR/web"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR" "$DATA_DIR"

# --- systemd unit ---
info "Installing systemd service '$SERVICE_NAME'"
sed -e "s|__NODE__|$NODE_BIN|g" -e "s|__USER__|$SERVICE_USER|g" \
	"$SCRIPT_DIR/goveedmx.service" > "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# --- Firewall (best effort) ---
if command -v ufw >/dev/null 2>&1; then
	info "Opening firewall ports (ufw)"
	ufw allow "$HTTP_PORT"/tcp >/dev/null 2>&1 || true
	ufw allow 6454/udp >/dev/null 2>&1 || true
	ufw allow 4001:4003/udp >/dev/null 2>&1 || true
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
info "GoveeDMX installed and running."
echo "   Web UI:   http://${IP:-<this-host>}:$HTTP_PORT"
echo "   Status:   sudo systemctl status $SERVICE_NAME"
echo "   Logs:     sudo journalctl -u $SERVICE_NAME -f"
echo "   Uninstall: sudo $SCRIPT_DIR/uninstall.sh"
