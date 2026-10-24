---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: server
---

# A computed import() specifier bypasses the db admission rules

## What

A domain file can `await import(["@orb","db","wiring-boot"].join("/"))` (or `wiring-driver`): dependency-cruiser sees no dependency and ESLint passes, and a runtime probe from `domain/character/` minted a boot grant and received the raw db. D335 confines the boot grant to `BOOT_GRANT_IMPORTERS`; that holds only for literal specifiers. The only computed import in server, db and inference source today is `packages/inference/src/backends/local-light/model-cache.ts:53`.

## Why

The boot grant carries cross-owner authority; its confinement must not depend on every author writing a literal specifier.

## Done when

An ESLint rule refuses an `ImportExpression` whose source is not a string literal under `packages/server/src`, `packages/db/src` and `packages/inference/src`; `model-cache.ts` carries a named waiver with its reason; a planted computed import fails lint; D335 states that the confinement covers computed specifiers through that rule.

## Evidence

Filled at landing: what ran and where its output is.
