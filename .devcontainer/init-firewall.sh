#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, and pipeline failures
IFS=$'\n\t'       # Stricter word splitting

# 1. Extract Docker DNS info BEFORE any flushing
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# Flush existing rules and delete existing ipsets
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# 2. Selectively restore ONLY internal Docker DNS resolution
if [ -n "$DOCKER_DNS_RULES" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
    echo "No Docker DNS rules to restore"
fi

# Bootstrap: reset to OPEN egress during setup. The GitHub-meta fetch + the per-domain `dig`
# resolves below run BEFORE the DROP policy is (re-)established near the end. `iptables -F` clears
# RULES but NOT the default policy, so a prior run that set OUTPUT→DROP (or one that aborted after
# setting it) leaves DROP in force here — the bootstrap fetches then fail, GitHub never gets
# allowlisted, the final self-test fails, and the policy stays DROP: every subsequent run is
# poisoned. A fresh container works only because Docker's default policy is ACCEPT. Reset to that
# known-open baseline so re-runs behave like a first run; the script re-locks to default-deny below.
iptables -P INPUT ACCEPT
iptables -P OUTPUT ACCEPT
iptables -P FORWARD ACCEPT

# First allow DNS and localhost before any restrictions
# Allow outbound DNS
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
# Allow inbound DNS responses
iptables -A INPUT -p udp --sport 53 -j ACCEPT
# Allow outbound SSH
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
# Allow inbound SSH responses
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
# Allow localhost
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Create ipset with CIDR support
ipset create allowed-domains hash:net

# Fetch GitHub meta information and aggregate + add their IP ranges
echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -sf --max-time 15 https://api.github.com/meta) || {
    echo "WARNING: Failed to fetch GitHub IP ranges (HTTP error or timeout) — skipping GitHub IPs"
    gh_ranges=""
}

if [ -n "$gh_ranges" ] && ! echo "$gh_ranges" | jq -e 'type == "object"' >/dev/null 2>&1; then
    echo "WARNING: GitHub API returned non-JSON response — skipping GitHub IPs"
    echo "  First 200 bytes: $(echo "$gh_ranges" | head -c 200)"
    gh_ranges=""
fi

if [ -n "$gh_ranges" ] && ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null 2>&1; then
    echo "WARNING: GitHub API response missing required fields — skipping GitHub IPs"
    gh_ranges=""
fi

if [ -n "$gh_ranges" ]; then
    echo "Processing GitHub IPs..."
    while read -r cidr; do
        if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
            echo "WARNING: Skipping non-IPv4 CIDR from GitHub meta: $cidr"
            continue
        fi
        echo "Adding GitHub range $cidr"
        # -exist: don't abort under `set -e` if two allowlisted sources yield an overlapping
        # range/IP (Azure Front Door puts VS Code/marketplace/blob on shared 13.107.x — a raw
        # `ipset add` of a dup exits non-zero and killed the whole rebuild; the orb fix).
        ipset add allowed-domains "$cidr" -exist
    done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)
else
    echo "Skipped GitHub IP ranges"
fi

# Resolve and add other allowed domains
for domain in \
    "registry.npmjs.org" \
    "cdn.playwright.dev" \
    "api.anthropic.com" \
    "sentry.io" \
    "statsig.anthropic.com" \
    "statsig.com" \
    "marketplace.visualstudio.com" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com"; do
    echo "Resolving $domain..."
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    if [ -z "$ips" ]; then
        # Non-fatal: a single allowlist domain that no longer resolves (e.g.
        # statsig.anthropic.com, telemetry) must not brick the whole sandbox.
        # Skip it and keep going instead of the upstream `exit 1`.
        echo "WARNING: Failed to resolve $domain — skipping (non-fatal)"
        continue
    fi

    while read -r ip; do
        if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            echo "ERROR: Invalid IP from DNS for $domain: $ip"
            exit 1
        fi
        echo "Adding $ip for $domain"
        # -exist: tolerate a dup IP across two allowlisted domains (see the GitHub-range note).
        ipset add allowed-domains "$ip" -exist
    done < <(echo "$ips")
done

# Get host IP from default route
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "ERROR: Failed to detect host IP"
    exit 1
fi

HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Host network detected as: $HOST_NETWORK"

# Set up remaining iptables rules
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Set default policies to DROP first
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# First allow established connections for already approved traffic
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Then allow only specific outbound traffic to allowed domains
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Explicitly REJECT all other outbound traffic for immediate feedback
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

echo "Firewall configuration complete"
echo "Verifying firewall rules..."
if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - was able to reach https://example.com"
    exit 1
else
    echo "Firewall verification passed - unable to reach https://example.com as expected"
fi

# Verify GitHub API access
if ! curl --connect-timeout 5 https://api.github.com/zen >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - unable to reach https://api.github.com"
    exit 1
else
    echo "Firewall verification passed - able to reach https://api.github.com as expected"
fi
