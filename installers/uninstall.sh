#!/usr/bin/env bash
#
# GoveeDMX uninstaller for Linux / Raspberry Pi.  Run with sudo: sudo ./uninstall.sh
# Pass --purge to also remove the data dir and the service user.
#
set -euo pipefail

APP_DIR="/opt/goveedmx"
DATA_DIR="/var/lib/goveedmx"
SERVICE_USER="goveedmx"
SERVICE_NAME="goveedmx"
PURGE="${1:-}"

info() { echo ">> $*"; }
[ "$(id -u)" -eq 0 ] || { echo "Please run as root (sudo ./uninstall.sh)" >&2; exit 1; }

if systemctl list-unit-files | grep -q "^$SERVICE_NAME.service"; then
	info "Stopping and disabling service"
	systemctl stop "$SERVICE_NAME" 2>/dev/null || true
	systemctl disable "$SERVICE_NAME" 2>/dev/null || true
	rm -f "/etc/systemd/system/$SERVICE_NAME.service"
	systemctl daemon-reload
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
