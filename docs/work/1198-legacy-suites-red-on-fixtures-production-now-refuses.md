---
kind: work
status: doing
updated: 2026-10-20
priority: P3
lane: codex/legacy-refused-fixtures-1198
plan: test-foundation
---

# Legacy suites red on fixtures production now refuses

## What

Inherited reds, red on main and unchanged by 1170. Rows: workloads/engine/runner.int and persistence/schedule-queries.int: fixtures mint workload_1 ids while the row read path validates TypeIDs; automation/engine/dispatch.int C5 'a global rule FIRES on a character import', 'S7 contentChanged', the two event-chain CONTROL and BEHIND cases: the injected run dispatcher is dead because createAutomationService builds its own; automation/substrate/run-now\.int 'a manual run raised while a bus event is mid-dispatch is QUEUED', 'a dispatch that raises a same-chat event completes': serial lanes are instance-owned and the two entries reach two owners; admin/verbs/create-user.int, chat/verbs/participants.int 'the host adds a character', chat/verbs/start-chat.int 'lazy room creation VERBATIM': toBe(role string) on opaque role state. Paths under tests/legacy/server/domain/.

## Why

Production tightened ids, dispatch ownership, lane ownership and role data; the legacy fixtures still assume the old shapes.

## Done when

Each case runs through a composed service or real ids and asserts roles at the wire projection, with its proof unchanged.

## Evidence

Completion covers the named rows, not general migration of their containing files. Preserve unrelated cases. Runner ID repair preserves legacy regression execution, not maintained-rebuild qualification. Keep its state-machine assertions unchanged; replace dead automation assemblies through the real root.

Admin and schedule successors qualify through the real root, with actual privilege and disabled-schedule defect controls. The named chat role projections also qualify. Automation ordering and dispatch successors remain active. Evidence: `reports/review/1198-refused-fixtures-review.md`.
