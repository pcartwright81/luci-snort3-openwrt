#!/bin/sh
# LuCI Snort3 Module - Installation Verification Script
# Verifies the ucode/JS layout (v4.0+)

echo "================================================"
echo " LuCI Snort3 - Installation Verification"
echo "================================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

check() {
    if [ "$1" -eq 0 ]; then
        echo "${GREEN}✓${NC} $2"
    else
        echo "${RED}✗${NC} $2"
        ERRORS=$((ERRORS + 1))
    fi
}

warn() {
    echo "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

# ── System ───────────────────────────────────────────────────────────────────

echo "System requirements"
echo "-------------------"

[ "$(id -u)" -eq 0 ] && check 0 "Running as root" || warn "Not running as root — some checks may fail"

if command -v snort >/dev/null 2>&1; then
    VER=$(snort -V 2>&1 | awk '/Version/{for(i=1;i<=NF;i++) if($i~/[0-9]+\.[0-9]+/){print $i;exit}}')
    check 0 "Snort3 installed (${VER:-unknown})"
else
    check 1 "Snort3 not found"
fi

if [ -f /etc/openwrt_release ]; then
    OVR=$(grep DISTRIB_RELEASE /etc/openwrt_release | cut -d"'" -f2)
    check 0 "OpenWrt $OVR"
else
    check 1 "Not running on OpenWrt"
fi

[ -d /www/luci-static/resources ] && check 0 "Modern LuCI resources present" || check 1 "LuCI resources missing (/www/luci-static/resources)"

# ── Installed files ──────────────────────────────────────────────────────────

echo ""
echo "Installed files"
echo "---------------"

check_file() { [ -f "$1" ] && check 0 "$1" || check 1 "$1 (missing)"; }

check_file /usr/share/rpcd/ucode/snort
check_file /usr/share/rpcd/acl.d/luci-app-snort.json
check_file /usr/share/luci/menu.d/luci-app-snort.json
check_file /www/luci-static/resources/view/snort/config.js
check_file /www/luci-static/resources/view/snort/status.js
check_file /www/luci-static/resources/view/snort/alerts.js
check_file /www/luci-static/resources/view/snort/log.js
check_file /etc/init.d/snort

[ -x /etc/init.d/snort ] && check 0 "/etc/init.d/snort is executable" || check 1 "/etc/init.d/snort not executable"

# ── Obsolete legacy files (should NOT exist) ─────────────────────────────────

echo ""
echo "Legacy file check (should all be absent)"
echo "-----------------------------------------"

check_absent() {
    if [ -f "$1" ]; then
        echo "${YELLOW}⚠${NC} Legacy file still present: $1"
        WARNINGS=$((WARNINGS + 1))
    else
        echo "${GREEN}✓${NC} Absent: $1"
    fi
}

check_absent /usr/lib/lua/luci/controller/snort.lua
check_absent /usr/lib/lua/luci/model/cbi/snort/config.lua
check_absent /usr/lib/lua/luci/view/snort/status_page.htm
check_absent /usr/lib/lua/luci/view/snort/alerts.htm
check_absent /usr/lib/lua/luci/view/snort/control.htm
check_absent /usr/lib/lua/luci/view/snort/recent_alerts.htm

# ── UCI configuration ────────────────────────────────────────────────────────

echo ""
echo "UCI configuration"
echo "-----------------"

if [ -f /etc/config/snort ]; then
    check 0 "/etc/config/snort exists"
    IFACE=$(uci get snort.snort.interface 2>/dev/null)
    [ -n "$IFACE" ] && check 0 "interface = $IFACE" || warn "interface not set (required before starting)"
    MODE=$(uci get snort.snort.mode 2>/dev/null)
    [ -n "$MODE" ] && check 0 "mode = $MODE" || warn "mode not set"
else
    check 1 "/etc/config/snort missing"
fi

# ── rpcd / ubus ──────────────────────────────────────────────────────────────

echo ""
echo "Services"
echo "--------"

if /etc/init.d/rpcd status >/dev/null 2>&1; then
    check 0 "rpcd running"
else
    check 1 "rpcd not running"
fi

# Check the luci.snort ubus object is registered
if ubus list luci.snort >/dev/null 2>&1; then
    check 0 "luci.snort ubus object registered"
else
    warn "luci.snort ubus object not found (try: /etc/init.d/rpcd restart)"
fi

# Check service
if /etc/init.d/snort status >/dev/null 2>&1; then
    PID=$(ps | grep '/usr/bin/snort' | grep -v grep | awk '{print $1}')
    check 0 "Snort running (PID: ${PID:-?})"
else
    warn "Snort not running (normal if not yet enabled)"
fi

[ -d /etc/snort ]       && check 0 "/etc/snort exists"     || check 1 "/etc/snort missing"
[ -d /var/log ]         && check 0 "/var/log exists"       || check 1 "/var/log missing"

if /etc/init.d/uhttpd status >/dev/null 2>&1; then
    check 0 "uhttpd (web server) running"
else
    check 1 "uhttpd not running"
fi

# ── Resources ────────────────────────────────────────────────────────────────

echo ""
echo "System resources"
echo "----------------"

TOTAL_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
FREE_MB=$(awk '/MemFree/{print int($2/1024)}' /proc/meminfo)
[ "$TOTAL_MB" -ge 128 ] && check 0 "RAM: ${TOTAL_MB}MB total, ${FREE_MB}MB free" || warn "Low RAM: ${TOTAL_MB}MB (128MB+ recommended)"

ROOT_MB=$(df / | tail -1 | awk '{print int($4/1024)}')
[ "$ROOT_MB" -ge 10 ] && check 0 "Disk: ${ROOT_MB}MB free" || warn "Low disk: ${ROOT_MB}MB free"

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "================================================"

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo "${GREEN}All checks passed.${NC}"
elif [ "$ERRORS" -eq 0 ]; then
    echo "${YELLOW}OK with $WARNINGS warning(s). Review above.${NC}"
else
    echo "${RED}$ERRORS error(s), $WARNINGS warning(s). Fix errors before use.${NC}"
fi

echo ""
echo "Next steps:"
echo "  1. Logout/login to LuCI and clear browser cache (Ctrl+Shift+R)"
echo "  2. Navigate to Services → Snort IDS/IPS"
echo "  3. Set your network interface and enable the service"
echo ""

[ "$ERRORS" -eq 0 ]
