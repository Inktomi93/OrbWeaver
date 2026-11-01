---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: server
plan: unwired-code
---

# Wire the RPG reveal view, read-only marker, checkpoint trigger and trace seq/at; first check nothing similar exists (read-only may already show as a pin) (owner: wire)

## What

The host reads every hidden span by turn in the Status tab's Veiled section, and each mark names how it was made. The read-only marker and the trace `seq` and `at` already reach a user, so they need no new surface.

| Field | Outcome | Reader |
| - | - | - |
| `RpgRevealView.messages` | wired | `packages/client/src/features/rpg/components/rpg-veiled-section.tsx` |
| `RpgRevealedSpan.revealLabel` | wired | `packages/client/src/features/rpg/components/rpg-veiled-section.tsx` |
| `RpgRevealedSpan.fields` | wired | `packages/client/src/features/rpg/components/rpg-veiled-section.tsx` |
| `RpgCheckpointView.trigger` | wired | `packages/client/src/features/rpg/components/rpg-journal-tab.tsx` |
| `RpgTrackerView.trackersReadOnly` | existed | the lock badge in `packages/client/src/features/rpg/components/rpg-takeover-header.tsx`, fed by `packages/client/src/features/rpg/components/rpg-header-band.tsx` |
| `rpgTraceRecordSchema.seq`, `.at` | existed | `/api/_debug/rpg/traces` in `packages/server/src/foundation/observability/debug/routes.ts`; `at` also windows the bug report in `packages/server/src/foundation/observability/debug/bug-report.ts` |

The read-only marker is a lock badge with a hint, not a pin. The pin icon marks a Journal mark.

## Why

The owner ruled these half-built rows wire, each only after a check for an existing surface. The server already parsed every hidden span per message, but only standing lies rendered. An `<ofilter>` and an unreadable span reached the host nowhere, and the trigger was stored and never shown.

## Done when

- A host with hidden spans sees a closed disclosure in Status, Veiled. It lists each span's label and turn.
- Each span's field values stay unmounted behind a reveal gate. A span with no readable field says so and offers no gate.
- A room with an `<ofilter>` and no standing lie still shows the section.
- A member never mounts the section.
- Each mark row in Journal, Marks shows its trigger label when the trigger is not `manual`, and a new trigger fails `tsc` until it has a label or an explicit `null`.

## Evidence

Filled at landing: what ran and where its output is.
