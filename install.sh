#!/bin/sh
# LuCI Snort3 Module - Installation Script
# Copyright (C) 2025 David Dzieciol <david.dzieciol51100@gmail.com>
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#
# Installs the ucode/JS version of luci-app-snort.
# Requires OpenWrt 22.03+ with modern LuCI (JS-based).
#
# Usage:
#   sh install.sh
# Or directly from GitHub:
#   sh <(wget -qO- https://raw.githubusercontent.com/pcartwright81/luci-snort3-openwrt/convert-to-js/install.sh)

set -e

BASE_URL="https://raw.githubusercontent.com/pcartwright81/luci-snort3-openwrt/convert-to-js"
VERSION="4.0-ucode"

echo "================================================"
echo " LuCI Snort3 Installation (ucode/JS)"
echo " Version: $VERSION"
echo "================================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────────────

step()    { echo ""; echo "${BLUE}>> $1${NC}"; }
success() { echo "${GREEN}  [OK] $1${NC}"; }
warning() { echo "${YELLOW}  [WARN] $1${NC}"; }
die()     { echo "${RED}  [ERROR] $1${NC}"; exit 1; }

fetch() {
    local src="$1" dst="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$src" -o "$dst" || die "Failed to download $src"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$dst" "$src" || die "Failed to download $src"
    else
        die "Neither curl nor wget found"
    fi
}

# ── Pre-flight checks ────────────────────────────────────────────────────────

[ "$(id -u)" -eq 0 ] || die "Must be run as root"

command -v snort >/dev/null 2>&1 || die "Snort3 not installed. Run: opkg update && opkg install snort3"

OPENWRT_VER=$(grep DISTRIB_RELEASE /etc/openwrt_release 2>/dev/null | cut -d"'" -f2 || echo "Unknown")
SNORT_VER=$(snort -V 2>&1 | awk '/Version/{for(i=1;i<=NF;i++) if($i~/[0-9]+\.[0-9]+/){print $i;exit}}' || echo "Unknown")
echo "${BLUE}OpenWrt : $OPENWRT_VER${NC}"
echo "${BLUE}Snort   : $SNORT_VER${NC}"
echo ""

# Warn if LuCI JS base is absent
if [ ! -d /www/luci-static/resources ]; then
    warning "Modern LuCI resources not found at /www/luci-static/resources."
    warning "Ensure luci-base >= OpenWrt 22.03 is installed."
fi

# ── Directories ──────────────────────────────────────────────────────────────

step "Creating directories"
mkdir -p /usr/share/rpcd/ucode
mkdir -p /usr/share/rpcd/acl.d
mkdir -p /www/luci-static/resources/view/snort
mkdir -p /usr/share/luci/menu.d
mkdir -p /etc/snort
mkdir -p /var/log
success "Directories ready"

# ── ucode RPC module ─────────────────────────────────────────────────────────

step "Installing ucode RPC module"
fetch "$BASE_URL/src/ucode/snort.uc" /usr/share/rpcd/ucode/snort
success "ucode module -> /usr/share/rpcd/ucode/snort"

# ── rpcd ACL ─────────────────────────────────────────────────────────────────

step "Installing rpcd ACL policy"
fetch "$BASE_URL/src/rpcd/snort.json" /usr/share/rpcd/acl.d/luci-app-snort.json
success "ACL -> /usr/share/rpcd/acl.d/luci-app-snort.json"

# ── JS views ─────────────────────────────────────────────────────────────────

step "Installing LuCI JS views"
for view in config.js status.js alerts.js log.js; do
    fetch "$BASE_URL/src/htdocs/luci-static/resources/view/snort/$view" \
          "/www/luci-static/resources/view/snort/$view"
    success "view -> /www/luci-static/resources/view/snort/$view"
done

# ── Menu entry ───────────────────────────────────────────────────────────────

step "Installing LuCI menu entry"
fetch "$BASE_URL/src/root/usr/share/luci/menu.d/luci-app-snort.json" \
      /usr/share/luci/menu.d/luci-app-snort.json
success "menu.d -> /usr/share/luci/menu.d/luci-app-snort.json"

# ── procd init script ────────────────────────────────────────────────────────

step "Installing procd init script"
fetch "$BASE_URL/src/etc/init.d/snort" /etc/init.d/snort
chmod +x /etc/init.d/snort
success "init.d -> /etc/init.d/snort (executable)"

# ── UCI defaults ─────────────────────────────────────────────────────────────

step "Creating default UCI configuration (if absent)"
if [ ! -f /etc/config/snort ]; then
    cat > /etc/config/snort << 'EOF'
config snort 'snort'
	option enabled '0'
	option interface ''
	option mode 'ids'
	option method 'afpacket'
	option home_net '192.168.0.0/24'
	option config_dir '/etc/snort'
	option rules_dir '/etc/snort/rules'
	option log_dir '/var/log'
	option log_alerts '1'
	option log_format 'fast'
	option ruleset 'community'
EOF
    success "Created /etc/config/snort with defaults"
else
    warning "/etc/config/snort already exists — skipping (no overwrite)"
fi

# ── Reload services ──────────────────────────────────────────────────────────

step "Reloading rpcd and clearing LuCI cache"
/etc/init.d/rpcd restart && success "rpcd restarted" || warning "rpcd restart failed (try manually)"
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache 2>/dev/null
success "LuCI JS cache cleared"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "================================================"
echo "${GREEN} Installation complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Go to LuCI → Services → Snort IDS/IPS"
echo "  2. Set your network interface in Settings"
echo "  3. Enable Snort and click Save & Apply"
echo ""
echo "Run verify.sh to confirm everything is in place."
echo ""
