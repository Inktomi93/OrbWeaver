---
kind: work
status: open
updated: 2026-09-25
priority: P1
area: infra
---

# Build the network-and-auth-modes legs

## What

Build legs A to F of the network-and-auth-modes program (`docs/adr/0255-network-and-auth-modes.md`) in order: secrets default on, the relay guard on the owner fallback and first-run, bind by mode, per-request cookie transport, the boot disclaimer block, and the docs and tunnel recipes. Each leg lands alone with the floor named in the plan's test plan.

## Why

Bare-metal local mode cannot boot without a hand-made secret, a same-host tunnel makes every visitor the owner under single-user, and a LAN device cannot keep a login over plain http.

## Done when

Every matrix row in the plan behaves as its 'will' column says, proven by the suites the test plan names, and the ledger's deleted knobs are gone from code, env files and docs.

## Evidence

Filled at landing: what ran and where its output is.
