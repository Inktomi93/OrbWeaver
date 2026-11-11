---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# The debug probe scope exemption cites one ruling in every file that names it

## What

The debug probes under `packages/server/src/foundation/observability/debug/inspect/` read the whole database with no principal. `packages/server/src/foundation/observability/debug/inspect/config.ts` holds the exemption and cites D20, which rules vector ownership. The codebase review changed `packages/server/src/foundation/observability/debug/routes.ts` and `inspect/automation-fires.ts` to cite D17 and to point at `config.ts`, so the files now name two rulings for one exemption. `packages/server/src/entry/auth/seam.ts` still cites a deleted `@owner-scope-ok` marker, and `packages/server/src/domain/discovery/persistence/character-scope.ts` and `packages/server/src/domain/plugin/persistence/wire-name-census.ts` cite the deleted `owner-scoped-reads` policy. `docs/adr/0323-prototype-exposure-per-native-generation.md` names that policy as live. `docs/law/Tier-2-Foundation.md` lists three inspect probes by name while the directory holds more. Source: `docs/work/codebase-review/units/server-foundation.md`.

## Why

An authorization exemption that cites the wrong ruling, or two rulings, cannot be checked against the ledger by the next author.

## Done when

One ledger ruling covers the un-principal debug read, found or written, and every file that names the exemption cites it. No comment cites the deleted marker or policy name as live. ADR 0323 states the standing enforcement. The law doc points at `debug/inspect/index.ts` instead of listing probes. `tests/server/entry/debug-gate-admission.int.test.ts` passes unchanged.

## Evidence

Filled at landing: what ran and where its output is.
