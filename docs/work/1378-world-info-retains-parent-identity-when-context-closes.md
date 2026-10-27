---
kind: work
status: doing
updated: 2026-10-27
priority: P2
area: client
lane: snap_defaults
---

# World Info retains parent identity when Context closes

## What

Keep the selected book identifiable in the wide selected-entry view with Context closed. Use the existing drill-header metadata or Back label.

## Why

The entry view drops the parent book identity in the inspected wide layout. The narrow shell already retains it.

## Done when

Book identity remains visible in all supported entry pane states and narrow layouts. Preserve the single current-member heading and existing navigation.

## Case decisions

| Behavior | Layer and decision |
| - | - |
| Selected entry identifies its parent without Context | Add a production collection CT; confirm actual shell pane states through live driving. |
| Drill navigation and book persistence | Keep `tests/e2e/corpus-config-back-stack.spec.ts` and `tests/e2e/corpus-libraries.spec.ts` for their distinct journeys. |

## Evidence

Filled at landing: what ran and where its output is.
