---
kind: decision
status: open
updated: 2026-11-11
priority: P1
area: security
---

# Rule whether the devcontainer firewall must stop credential theft, and build the proxy if it must

## What

The owner ruling recorded in `.devcontainer/devcontainer.json` names the container and its firewall as the boundary for an agent running with permission checks off. Item 2462 closed the firewall's open windows. A security review then showed that an address allowlist cannot be that boundary. The HTTPS allowlist holds addresses of shared content networks, so a request to any site those networks host passes; the reviewer reached an unrelated third-party site through one of the npm registry's addresses. DNS goes to public recursive resolvers, so data can leave inside lookups for an attacker's domain. Either route carries `/home/node/.claude` credentials out with one `curl` and no credential of the attacker's own. Separately, the open host range lets the container reach other services the host publishes on all interfaces. Evidence: `reports/review/2026-11-10-devcontainer-firewall.md`, findings P1-1, P1-2 and P2-1.

## Why

The owner runs agents in this sandbox with permission checks off on the strength of the ruling. As built, an agent steered by fetched content can still send the session credentials out.

## Done when

Owner ruling: no egress proxy; the ruling text is amended. .devcontainer/devcontainer.json and .devcontainer/README.md say what the firewall stops and what it does not: an address allowlist does not stop a request to another site on a shared content network or data leaving inside DNS lookups, so session credentials in the container are not protected from an agent steered by fetched content. The host range admits only the ports the sandbox needs, with a test that runs the real script.

## Evidence

Filled at landing: what ran and where its output is.
