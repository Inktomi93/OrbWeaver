---
kind: bug
status: doing
updated: 2026-11-13
priority: P2
area: import
lane: wt/agent-a1f2b72497dfd46de
plan: import-robustness
---

# Import preview identity is profile-qualified

## What

An upload that holds several profile directories is collected into one preview by `packages/server/src/domain/import/loader/profile-directory.ts`, and every kind's source path is relative to its profile. The client's preview merge then folds two profiles' files at the same relative path into one entry, for characters, chats, presets, themes, backgrounds, groups and world books alike. The header of `packages/server/src/domain/import/substrate/preview.ts` rules that a path is relative to the profile and needs amending with the change.

## Why

The preview shows fewer entries than the import will write, so a user cannot review what a multi-profile upload brings in.

## Done when

A two-profile upload whose profiles hold the same relative path for each kind merges to a preview whose entries equal the run's found count for every kind, with a test, and the preview header states the qualified source.

## Evidence

Filled at landing: what ran and where its output is.
