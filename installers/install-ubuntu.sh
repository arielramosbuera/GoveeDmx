#!/usr/bin/env bash
#
# Public bootstrap and maintenance utility for Ubuntu/Debian installations.
# Designed to work when piped to sudo bash.
#
set -euo pipefail

REPO="arielramosbuera/GoveeDmx"
ASSET="goveedmx-linux-systemd.tar.gz"
CHECKSUM_ASSET="${ASSET}.sha256"
RELEASE_BASE="https://github.com/${REPO}/releases/latest/download"
APP_DIR="/opt/goveedmx"
DATA_DIR="/var/lib/goveedmx"
SERVICE_NAME="goveedmx"
TTY="/dev/tty"

ACTION=""
USE_DEFAULTS=0
ASSUME_YES=0
PURGE=0
PORT_VALUE=""

info() { printf '>> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
	cat <<'EOF'
Usage: install-ubuntu.sh [option]

Without options, a first install opens guided setup; an existing install opens
the maintenance menu.

  --install [--defaults]       Install GoveeDMX
  --update                     Update while preserving configuration
  --reinstall --yes [--defaults]
                               Factory reset and install cleanly
  --uninstall [--purge --yes]  Uninstall and optionally remove all data
  --port PORT                  Change the web UI port
  --repair                     Repair service, ownership, and firewall rules
  --defaults                   Accept recommended first-install defaults
  --yes                        Confirm a destructive noninteractive operation
  --help                       Show this help
EOF
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--install|--update|--reinstall|--uninstall|--repair)
			[ -z "$ACTION" ] || die "Only one action may be selected."
			ACTION="${1#--}"
			;;
		--defaults) USE_DEFAULTS=1 ;;
		--yes) ASSUME_YES=1 ;;
		--purge) PURGE=1 ;;
		--port)
			shift
			[ "$#" -gt 0 ] || die "--port requires a value."
			[ -z "$ACTION" ] || die "Only one action may be selected."
			ACTION="port"
			PORT_VALUE="$1"
			;;
		--help|-h) usage; exit 0 ;;
		*) die "Unknown option: $1" ;;
	esac
	shift
done

[ "$(id -u)" -eq 0 ] || die "Run with sudo: curl ... | sudo bash"

has_tty() { [ -r "$TTY" ] && [ -w "$TTY" ]; }

prompt() {
	local message="$1" default="${2:-}" answer
	if [ -n "$default" ]; then
		printf '%s [%s]: ' "$message" "$default" >"$TTY"
	else
		printf '%s: ' "$message" >"$TTY"
	fi
	IFS= read -r answer <"$TTY"
	printf '%s' "${answer:-$default}"
}

confirm() {
	local message="$1" answer
	answer="$(prompt "$message" "no")"
	case "${answer,,}" in y|yes) return 0 ;; *) return 1 ;; esac
}

is_installed() {
	[ -f "$APP_DIR/server.cjs" ] || [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]
}

validate_port() {
	[[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1024 ] && [ "$1" -le 65535 ]
}

validate_universes() {
	local value="$1" item
	local -a items
	[[ "$value" =~ ^[0-9]+(,[0-9]+)*$ ]] || return 1
	IFS=',' read -ra items <<<"$value"
	for item in "${items[@]}"; do
		[ "$item" -le 32767 ] || return 1
	done
}

validate_ipv4() {
	local value="$1" octet
	local -a octets
	[[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
	IFS='.' read -ra octets <<<"$value"
	for octet in "${octets[@]}"; do
		[ "$octet" -le 255 ] || return 1
	done
}

port_is_free() {
	local protocol="$1" port="$2"
	command -v ss >/dev/null 2>&1 || return 0
	if [ "$protocol" = "tcp" ]; then
		! ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$"
	else
		! ss -lunH 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$"
	fi
}

ensure_prerequisites() {
	export DEBIAN_FRONTEND=noninteractive
	info "Installing required Ubuntu packages"
	apt-get update -qq
	apt-get install -y -qq ca-certificates curl gnupg tar iproute2

	local node_major=0
	if command -v node >/dev/null 2>&1; then
		node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')"
	fi
	if [ "$node_major" -lt 20 ]; then
		info "Installing Node.js 20"
		curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
		apt-get install -y -qq nodejs
	fi
	[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "Node.js 20+ installation failed."
}

download_release() {
	local destination="$1"
	info "Downloading the latest GoveeDMX release"
	curl -fL --retry 3 --retry-delay 2 -o "$destination/$ASSET" "$RELEASE_BASE/$ASSET"
	curl -fL --retry 3 --retry-delay 2 -o "$destination/$CHECKSUM_ASSET" "$RELEASE_BASE/$CHECKSUM_ASSET"
	(
		cd "$destination"
		sha256sum -c "$CHECKSUM_ASSET"
		tar -xzf "$ASSET"
	)
	[ -f "$destination/goveedmx/installers/install.sh" ] || die "Release archive is missing installers/install.sh."
}

run_release_installer() {
	local mode="${1:-install}" temp_dir
	ensure_prerequisites
	temp_dir="$(mktemp -d)"
	trap 'rm -rf "${temp_dir:-}"' EXIT
	download_release "$temp_dir"
	if [ "$mode" = "repair" ]; then
		bash "$temp_dir/goveedmx/installers/install.sh" --repair
	else
		GOVEEDMX_WRITE_CONFIG="${GOVEEDMX_WRITE_CONFIG:-0}" \
		GOVEEDMX_HTTP_PORT="${GOVEEDMX_HTTP_PORT:-}" \
		GOVEEDMX_ARTNET_PORT="${GOVEEDMX_ARTNET_PORT:-}" \
		GOVEEDMX_UNIVERSES="${GOVEEDMX_UNIVERSES:-}" \
		GOVEEDMX_BIND_ADDRESS="${GOVEEDMX_BIND_ADDRESS:-}" \
		GOVEEDMX_NODE_NAME="${GOVEEDMX_NODE_NAME:-}" \
			bash "$temp_dir/goveedmx/installers/install.sh"
	fi
	rm -rf "$temp_dir"
	trap - EXIT
}

guided_install() {
	local http_port="8080" artnet_port="6454" universes="0" bind_address="0.0.0.0"
	local node_name answer detected
	node_name="GoveeDMX-$(hostname -s 2>/dev/null || printf 'server')"

	if [ "$USE_DEFAULTS" -ne 1 ]; then
		has_tty || die "Guided setup needs an interactive terminal. Re-run with --install --defaults for unattended installation."
		while true; do
			answer="$(prompt "Web UI port" "$http_port")"
			validate_port "$answer" || { warn "Enter a port from 1024 to 65535."; continue; }
			port_is_free tcp "$answer" || { warn "TCP port $answer is already in use."; continue; }
			http_port="$answer"
			break
		done
		while true; do
			answer="$(prompt "Art-Net UDP port" "$artnet_port")"
			validate_port "$answer" || { warn "Enter a port from 1024 to 65535."; continue; }
			port_is_free udp "$answer" || { warn "UDP port $answer is already in use."; continue; }
			artnet_port="$answer"
			break
		done
		while true; do
			answer="$(prompt "Art-Net universes (comma-separated)" "$universes")"
			validate_universes "$answer" || { warn "Use comma-separated universe numbers from 0 to 32767."; continue; }
			universes="$answer"
			break
		done
		detected="$(ip -o -4 addr show scope global 2>/dev/null | awk '{print $2 "=" $4}' | cut -d/ -f1 | paste -sd ', ' -)"
		[ -z "$detected" ] || printf 'Detected IPv4 interfaces: %s\n' "$detected" >"$TTY"
		answer="$(prompt "Bind IPv4 address (0.0.0.0 uses all interfaces)" "$bind_address")"
		validate_ipv4 "$answer" || die "Invalid IPv4 bind address."
		bind_address="$answer"
		answer="$(prompt "Art-Net node name" "$node_name")"
		[ -n "$answer" ] || die "Node name cannot be empty."
		node_name="$answer"

		cat >"$TTY" <<EOF

GoveeDMX setup summary
  Web UI port:       $http_port
  Art-Net port:      $artnet_port
  Art-Net universes: $universes
  Network binding:   $bind_address
  Node name:         $node_name

EOF
		confirm "Install with these settings?" || die "Installation cancelled."
	fi

	export GOVEEDMX_WRITE_CONFIG=1
	export GOVEEDMX_HTTP_PORT="$http_port"
	export GOVEEDMX_ARTNET_PORT="$artnet_port"
	export GOVEEDMX_UNIVERSES="$universes"
	export GOVEEDMX_BIND_ADDRESS="$bind_address"
	export GOVEEDMX_NODE_NAME="$node_name"
	run_release_installer install
}

installed_uninstaller() {
	[ -x "$APP_DIR/uninstall.sh" ] || die "Installed uninstaller not found. Use --repair first."
	if [ "$PURGE" -eq 1 ]; then
		"$APP_DIR/uninstall.sh" --purge
	else
		"$APP_DIR/uninstall.sh"
	fi
}

factory_reinstall() {
	if [ "$ASSUME_YES" -ne 1 ]; then
		has_tty || die "Factory reset requires --yes in noninteractive mode."
		confirm "Factory reset deletes all GoveeDMX configuration and logs. Continue?" || die "Factory reset cancelled."
	fi
	if ! has_tty && [ "$USE_DEFAULTS" -ne 1 ]; then
		die "Noninteractive factory reset also requires --defaults. No data was removed."
	fi
	PURGE=1 installed_uninstaller
	guided_install
}

change_port() {
	local new_port="$PORT_VALUE" config="$DATA_DIR/config.json" old_port=""
	is_installed || die "GoveeDMX is not installed."
	if [ -z "$new_port" ]; then
		has_tty || die "--port requires a value."
		new_port="$(prompt "New web UI port" "8080")"
	fi
	validate_port "$new_port" || die "Web UI port must be from 1024 to 65535."
	port_is_free tcp "$new_port" || die "TCP port $new_port is already in use."
	[ -f "$config" ] || die "Configuration not found: $config"
	old_port="$(node -e 'try{console.log(require(process.argv[1]).server.httpPort||8080)}catch{console.log(8080)}' "$config")"
	CONFIG_PATH="$config" NEW_PORT="$new_port" node <<'NODE'
const fs = require('node:fs')
const file = process.env.CONFIG_PATH
const config = JSON.parse(fs.readFileSync(file, 'utf8'))
config.server = { ...(config.server || {}), httpPort: Number(process.env.NEW_PORT) }
fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(config, null, 2)}\n`)
fs.renameSync(`${file}.tmp`, file)
NODE
	chown goveedmx:goveedmx "$config"
	if command -v ufw >/dev/null 2>&1; then
		ufw delete allow "$old_port"/tcp >/dev/null 2>&1 || true
		ufw allow "$new_port"/tcp >/dev/null 2>&1 || true
	fi
	systemctl restart "$SERVICE_NAME"
	info "Web UI port changed to $new_port."
}

service_tools() {
	local choice
	cat >"$TTY" <<'EOF'
Service tools
  1) Show status
  2) Restart service
  3) Show recent logs
  4) Back
EOF
	choice="$(prompt "Choose an option" "1")"
	case "$choice" in
		1) systemctl --no-pager status "$SERVICE_NAME" || true ;;
		2) systemctl restart "$SERVICE_NAME"; info "Service restarted." ;;
		3) journalctl -u "$SERVICE_NAME" -n 100 --no-pager ;;
		4) return ;;
		*) die "Invalid service option." ;;
	esac
}

maintenance_menu() {
	local choice uninstall_choice
	has_tty || die "Maintenance menu needs an interactive terminal. Use an explicit command option for automation."
	cat >"$TTY" <<'EOF'
GoveeDMX maintenance
  1) Update (preserve configuration)
  2) Reinstall / factory reset
  3) Uninstall
  4) Change web UI port
  5) Service tools
  6) Repair service and firewall
  7) Exit
EOF
	choice="$(prompt "Choose an option" "1")"
	case "$choice" in
		1) run_release_installer install ;;
		2) factory_reinstall ;;
		3)
			uninstall_choice="$(prompt "Keep configuration data? (yes keeps data, no purges it)" "yes")"
			case "${uninstall_choice,,}" in
				y|yes) PURGE=0 ;;
				*) confirm "Permanently delete configuration and logs?" || die "Uninstall cancelled."; PURGE=1 ;;
			esac
			installed_uninstaller
			;;
		4) change_port ;;
		5) service_tools ;;
		6) run_release_installer repair ;;
		7) info "No changes made." ;;
		*) die "Invalid menu option." ;;
	esac
}

case "$ACTION" in
	install)
		if is_installed; then
			die "GoveeDMX is already installed. Use --update or run without options for the maintenance menu."
		fi
		guided_install
		;;
	update)
		is_installed || die "GoveeDMX is not installed. Use --install."
		run_release_installer install
		;;
	reinstall)
		is_installed || die "GoveeDMX is not installed. Use --install."
		factory_reinstall
		;;
	uninstall)
		is_installed || die "GoveeDMX is not installed."
		[ "$PURGE" -eq 0 ] || [ "$ASSUME_YES" -eq 1 ] || die "--uninstall --purge requires --yes."
		installed_uninstaller
		;;
	port) change_port ;;
	repair)
		is_installed || die "GoveeDMX is not installed."
		run_release_installer repair
		;;
	"")
		if is_installed; then maintenance_menu; else guided_install; fi
		;;
esac
