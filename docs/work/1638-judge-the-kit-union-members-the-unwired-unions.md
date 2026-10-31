---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the kit union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `kit`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CARRIED_TONE_HOSTS.user-bubble` | `kit/src/theme-derivation/index.ts:1068` | unbuilt | unknown (read) | each host is a key of the derived record that production iterates: keep, and teach the scan record-key members |
| `CARRIED_TONE_HOSTS.ai-bubble` | `kit/src/theme-derivation/index.ts:1069` | unbuilt | unknown (read) | each host is a key of the derived record that production iterates: keep, and teach the scan record-key members |
| `CARRIED_TONE_HOSTS.system-bubble` | `kit/src/theme-derivation/index.ts:1070` | unbuilt | unknown (read) | each host is a key of the derived record that production iterates: keep, and teach the scan record-key members |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
