---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: test-foundation
---

# Bound and recover abandoned session boot mutexes

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-TSSEC-Q0005`: Add owner-aware bounded acquisition/recovery or refusal to the boot mutex, preserving live-owner exclusion and atomic session name/cap reservation.

Inspect `tests/tooling/snap/ops/session-daemon.int.test.ts`, `tooling/src/snap/ops/session-registry.ts`, `tooling/src/snap/ops/session-client.ts`, `tooling/src/floor/process/sync-sleep.ts`.

## Why

`AF3-TSSEC-Q0005`: An abandoned .boot.lock blocks valid cold boots synchronously before their advertised deadline exists; later reservation/sweep cleanup cannot recover it.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-TSSEC-Q0005`: Private-registry abandoned-lock control finishes with bounded recovery/refusal, live-holder control is not stolen, and existing clean cap-one race stays valid. Native checks remain owed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
