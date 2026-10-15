---
kind: work
status: doing
updated: 2026-10-15
priority: P2
area: server
lane: codex/corpus-row-clocks
plan: test-foundation
---

# Persist tag and character timestamps through the injected production clock

## What

Supply canonical tag and junction birth stamps from the production clock. Stamp character insert timestamps together in group, handoff and duplicate paths.

## Why

The actual corpus comparison exposes SQL wall-clock defaults in retained application rows. Native protocol time permission does not cover business-data timestamps.

## Done when

Real composed operations persist exact injected timestamps with an advanced clock. Conflict and idempotent paths retain existing birth stamps. Canonical insert boundaries require the timestamps. Native ownership and handoff policy remain unchanged; no test-only SQL interception or copied assembly.

## Evidence

Integrated `8d4e68e40a`; independent security review confirms the bounded assignment. Native composed timestamp and ownership cases pass; retained tag cases pass unchanged. Server types and affected lint pass. Root and legacy programs remain red outside the changed population; the retained discovery missing-scope case remains failed. Evidence: `.claude/worktrees/codex-corpus-row-clocks/reports/review/1037-row-clocks-delivery.md` and adjacent independent review. The committed corpus is unchanged; genuine republishing and complete corpus qualification remain with item 959.
