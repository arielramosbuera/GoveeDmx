#!/usr/bin/env bash
#
# GoveeDMX uninstaller for Linux / Raspberry Pi. Run with sudo.
# Pass --purge to also remove the data directory and service user.
#
set -euo pipefail

APP_DIR="/opt/goveedmx"
DATA_DIR="/var/lib/goveedmx"
SERVICE_USER="goveedmx"
SERVICE_NAME="goveedmx"
PURGE="${1:-}"
HTTP_PORT="8080"
ARTNET_PORT="6454"

info() { echo ">> $*"; }
[ "$(id -u)" -eq 0 ] || { echo "Please run as root (sudo ./uninstall.sh)" >&2; exit 1; }

if [ -f "$DATA_DIR/config.json" ] && command -v node >/dev/null 2>&1; then
	HTTP_PORT="$(node -e 'try{console.log(require(process.argv[1]).server.httpPort||8080)}catch{console.log(8080)}' "$DATA_DIR/config.json")"
	ARTNET_PORT="$(node -e 'try{console.log(require(process.argv[1]).artnet.port||6454)}catch{console.log(6454)}' "$DATA_DIR/config.json")"
fi

if systemctl list-unit-files | grep -q "^$SERVICE_NAME.service"; then
	info "Stopping and disabling service"
	systemctl stop "$SERVICE_NAME" 2>/dev/null || true
	systemctl disable "$SERVICE_NAME" 2>/dev/null || true
	rm -f "/etc/systemd/system/$SERVICE_NAME.service"
	systemctl daemon-reload
fi

if command -v ufw >/dev/null 2>&1; then
	info "Removing GoveeDMX firewall rules"
	ufw delete allow "$HTTP_PORT"/tcp >/dev/null 2>&1 || true
	ufw delete allow "$ARTNET_PORT"/udp >/dev/null 2>&1 || true
	ufw delete allow 4001:4003/udp >/dev/null 2>&1 || true
fi

info "Removing $APP_DIR"
rm -rf "$APP_DIR"

if [ "$PURGE" = "--purge" ]; then
	info "Purging data dir and service user"
	rm -rf "$DATA_DIR"
	if id "$SERVICE_USER" >/dev/null 2>&1; then
		userdel "$SERVICE_USER" 2>/dev/null || true
	fi
else
	info "Kept config/data at $DATA_DIR (use --purge to remove)"
fi

info "GoveeDMX uninstalled."
