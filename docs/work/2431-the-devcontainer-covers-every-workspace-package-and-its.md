---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: security
lane: wt/agent-a7cc72305cac667b5
---

# The devcontainer covers every workspace package and its firewall survives a failed GitHub range fetch

## What

`tests/support` is a workspace package with no named volume in `.devcontainer/devcontainer.json` or `.devcontainer/Dockerfile`, and the guard in `tests/tooling/container-security-config.int.test.ts` lists packages from a directory scan that cannot see it. `.devcontainer/init-firewall.sh` calls the GitHub range fetch non-fatal, but `api.github.com` reaches the allowlist only through that fetch and the final self-test requires it. Smaller points from the same unit: the Dockerfile comment that says the firewall blocks `cdn.playwright.dev`, the partial volume list in the `.devcontainer/README.md` reset snippet, `.devcontainer/tools/` missing from the Dependabot npm entries, the unpinned Playwright ARG, and the two build-time downloads without a checksum. Source: `reports/codebase-review/units/root-dev-environment.md`.

## Why

The sandbox writes dependency links onto the host mount for one package, and a transient GitHub failure leaves the container locked with a failed start.

## Done when

The volume list and its guard derive from the workspace package globs, and the guard fails when `tests/support` has no volume. A failed range fetch leaves a working container. Each smaller point is fixed or closed with its reason in the item.

## Evidence

Filled at landing: what ran and where its output is.
