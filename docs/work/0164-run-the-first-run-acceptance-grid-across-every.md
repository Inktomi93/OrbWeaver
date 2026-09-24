---
kind: work
status: open
updated: 2026-09-24
priority: P0
area: first-run
---

# Run the first-run acceptance grid across every install, auth mode and access path

## What

Drive every cell of {bare-metal pnpm start, docker compose} x {single-user, local, oidc, forward-header} x {loopback, LAN http, https proxy or tunnel} from a fresh clone, following README.md verbatim. In each cell, drive with pnpm snap: first boot, the setup wizard, the owner claim, the persona step, the first connection, the first chat and a second human joining. A side-eye review covers each cell. Fix until every cell works and looks right. Items 0091 to 0095 fold in; 0094 is a P1 security fix. While testing, also verify three facts: whether the egress guard blocks private addresses by default (packages/server/src/infra/network/egress.ts), the session lifetime, and whether the login page lists user names.

## Why

The owner's launch bar: a stranger clones and runs it in any mode, on any OS and deployment, with no hand-edited hidden files.

## Done when

Every cell has a snap slot and a side-eye verdict with no open P0 or P1 finding. Items 0091 to 0095 are landed, and the three facts are recorded with evidence.

## Evidence

Filled at landing: what ran and where its output is.
