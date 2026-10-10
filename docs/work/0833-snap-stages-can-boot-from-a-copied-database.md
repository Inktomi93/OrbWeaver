---
kind: tooling
status: open
updated: 2026-10-10
priority: P2
area: tooling
---

# Snap stages can boot from a copied database

## What

seedStageData (tooling/src/snap/ops/stage-source.ts:102-131) only copies the dev checkout's data dir when the stage db is missing; no flag names another source. Owner wants drives against a copy of the real container DB (cards, chats, world books). Needs the copy's owner handle and DB-bound identity env (stage.ts:111-140 STAGE_INHERITED_ENV_KEYS) so the stage signs in as the principal that owns the rows.

## Why

Real data finds layout and length bugs seed fixtures hide.

## Done when

A snap flag such as --stage-db <path> clones the copied db (+wal/+shm) into the isolated stage's data dir and rewrites its owner identity to the stage principal, so the stage signs in and sees the rows. No container env inheritance; the source file is never opened for write. A test covers the clone-and-rewrite path, and the help text names the flag.

## Evidence

Filled at landing: what ran and where its output is.
