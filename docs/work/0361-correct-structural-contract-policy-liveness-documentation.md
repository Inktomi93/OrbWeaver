---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: tooling
---

# Correct structural contract-policy liveness documentation

## What

State the current proof purpose of AUTOMATION_BUS_EVENT_TYPES, CONTENT_CLASS_POLICY and KIND_DEFS. Keep their exhaustive membership and meaningful behavioral or type checks.

Correct the unbuilt-route claim above `RPG_BUS_FILTERS` in `packages/client/src/data/invalidation-reads.ts`.

## Why

The bus facts discover the automation registry structurally, but its annotation cites a future client invalidation consumer. The content policy and capability definitions support current checks, while comments imply runtime lookups that their callers do not perform.

The RPG map claims its handlers return empty filters until the router exists. Its handlers already name real queries and feed the live invalidation dispatcher.

## Done when

Confirm the bus fact readers, content projection binding tests and capability type checks. Correct annotations and nearby claims without inventing runtime consumers or weakening existing checks. Preserve the current policy values and their canonical homes. Use the supported public-marker contract.

Confirm the RPG event dispatcher and its existing query-invalidation tests. Correct only the false wiring claim; preserve the event filters and parked game scope.

## Evidence

Filled at landing: what ran and where its output is.
