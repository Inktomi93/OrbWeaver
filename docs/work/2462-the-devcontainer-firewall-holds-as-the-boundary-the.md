---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# The devcontainer firewall holds as the boundary the bypass-mode ruling names

## What

A comment in `.devcontainer/devcontainer.json` records the owner ruling that the container and its firewall are the boundary for an agent running with permission checks off. A security review found that `.devcontainer/init-firewall.sh` does not hold against a deliberate actor. It admits tcp port 22 and udp port 53 to any host, so an agent steered by fetched content can open an ssh proxy past the allowlist. It sets the ACCEPT policies first and the DROP policies near the end, so an exit in between, such as one DNS lookup timing out, leaves egress open. `.devcontainer/Dockerfile` lets the container user re-run the script through sudo, which reopens that window, and a connection opened in the window survives the lockdown through the established-connection rule. The pinned hash for the zsh setup script covers only that script, which then downloads and runs more code at an unpinned head during the build. Evidence: `reports/review/2026-11-10-review-fix-train-b-security.md`, findings P2-2, P2-3 and P3-1.

## Why

The owner runs agents in this sandbox with permission checks off because the firewall is the boundary. An agent that reads attacker-controlled content can leave it and take the session credentials with it.

## Done when

DNS is limited to the container resolver and port 22 to the GitHub ranges already in the set. A failure at any point in the script ends with egress dropped, shown by a test that runs the real script through a failing lookup. A re-run cannot leave a connection that outlives the lockdown. The shell setup downloads no unpinned code at build time, or the item records the owner's ruling that it may. The devcontainer still starts and can reach every allowlisted host.

## Evidence

Filled at landing: what ran and where its output is.
