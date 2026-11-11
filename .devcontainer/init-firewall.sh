#!/bin/bash
# Default-deny egress for the bypass-mode sandbox: the container and this firewall are the boundary
# (devcontainer.json). The script never passes through an open state. It sets the DROP policies before it
# flushes anything and builds the allowlist under them, so an exit at any point, and a re-run through sudo,
# leave egress dropped. A host joins the allowlist before anything dials it.
set -euo pipefail  # Exit on error, undefined vars, and pipeline failures
IFS=$'\n\t'       # Stricter word splitting

ALLOWED_SET="allowed-domains"
SSH_SET="github-ssh"

# 1. Extract Docker DNS info BEFORE any flushing
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# 2. Lock first. Every chain drops from here on, this run's own setup included; a flush clears rules, never
# the policy, so the order below holds on a re-run too.
iptables -P INPUT DROP
iptables -P OUTPUT DROP
iptables -P FORWARD DROP
# IPv6 admits loopback only: no allowlist entry is IPv6, and a daemon or network that enables IPv6 must not
# open a route around every rule below.
ip6tables -P INPUT DROP
ip6tables -P OUTPUT DROP
ip6tables -P FORWARD DROP
ip6tables -F
ip6tables -X
ip6tables -A INPUT -i lo -j ACCEPT
ip6tables -A OUTPUT -o lo -j ACCEPT

iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy "$ALLOWED_SET" 2>/dev/null || true
ipset destroy "$SSH_SET" 2>/dev/null || true

# 3. Selectively restore ONLY internal Docker DNS resolution
if [ -n "$DOCKER_DNS_RULES" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
    echo "No Docker DNS rules to restore"
fi

# 4. Loopback, and replies to traffic this firewall admitted. There is deliberately no OUTPUT rule for
# established connections: every outbound packet must match a destination below, so a connection opened
# before this run cannot keep sending once it ends.
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 5. DNS only to this container's own resolvers, the ones Docker wrote into resolv.conf (127.0.0.11 on a
# user-defined network, else the daemon's `dns` setting). A query to any other resolver is refused.
resolvers=$(awk '$1 == "nameserver" && $2 ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ {print $2}' /etc/resolv.conf)
if [ -z "$resolvers" ]; then
    echo "ERROR: /etc/resolv.conf names no IPv4 nameserver"
    exit 1
fi
while read -r resolver; do
    echo "Admitting DNS to $resolver"
    iptables -A OUTPUT -p udp -d "$resolver" --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp -d "$resolver" --dport 53 -j ACCEPT
done < <(echo "$resolvers")

# 6. The allowlist: HTTPS to the allowed set, and ssh only to GitHub's git ranges. The sets fill below.
ipset create "$ALLOWED_SET" hash:net
ipset create "$SSH_SET" hash:net
iptables -A OUTPUT -p tcp --dport 443 -m set --match-set "$ALLOWED_SET" dst -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -m set --match-set "$SSH_SET" dst -j ACCEPT

# 7. The host network (the bind-mounted host's own services; an accepted trade, see the README).
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "ERROR: Failed to detect host IP"
    exit 1
fi
HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Host network detected as: $HOST_NETWORK"
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# 8. Resolve the allowed domains. api.github.com comes first: the GitHub range fetch below needs it, and it is
# also the host the self-test must reach, so a failed or junk range fetch still leaves it admitted. Keep that
# self-test unconditional: it is the one check that the allow path works on every start. github.com also
# admits ssh, so `git` over ssh works even when the range fetch fails.
for domain in \
    "api.github.com" \
    "github.com" \
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
    # Non-fatal: a domain that times out or no longer resolves (e.g. statsig.anthropic.com, telemetry) is
    # skipped rather than bricking the sandbox; egress stays dropped for it either way.
    ips=$(dig +noall +answer +time=5 +tries=2 A "$domain" | awk '$4 == "A" {print $5}') || ips=""
    if [ -z "$ips" ]; then
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
        ipset add "$ALLOWED_SET" "$ip" -exist
        if [ "$domain" = "github.com" ]; then
            ipset add "$SSH_SET" "$ip" -exist
        fi
    done < <(echo "$ips")
done

# 9. Fetch GitHub meta information and aggregate + add their IP ranges
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

# Add a range list from the meta answer to one set; a non-IPv4 entry is skipped.
add_github_ranges() {
    local set="$1" filter="$2" cidr
    while read -r cidr; do
        if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
            echo "WARNING: Skipping non-IPv4 CIDR from GitHub meta: $cidr"
            continue
        fi
        echo "Adding GitHub range $cidr to $set"
        # -exist: don't abort under `set -e` if two allowlisted sources yield an overlapping
        # range/IP (Azure Front Door puts VS Code/marketplace/blob on shared 13.107.x — a raw
        # `ipset add` of a dup exits non-zero and killed the whole rebuild; the orb fix).
        ipset add "$set" "$cidr" -exist
    done < <(echo "$gh_ranges" | jq -r "$filter" | aggregate -q)
}

if [ -n "$gh_ranges" ]; then
    echo "Processing GitHub IPs..."
    add_github_ranges "$ALLOWED_SET" '(.web + .api + .git)[]'
    add_github_ranges "$SSH_SET" '.git[]'
else
    echo "Skipped GitHub IP ranges"
fi

# 10. Explicitly REJECT all other outbound traffic for immediate feedback
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
