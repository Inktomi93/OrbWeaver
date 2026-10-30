---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: client
plan: test-foundation
---

# Cover autosave editor draft recovery across a reload

## What

The character, preset, world-info entry and automation rule editors keep crash-survival drafts through createAutosaveEntityForm and their entity draft stores, but no test reloads the page and proves an unsaved edit is restored. Existing coverage stops at the store lifecycle and in-session retry.

## Why

Draft recovery is the feature's whole point; a regression would lose typed work silently.

## Done when

An E2E journey types into an editor, fails or interrupts the save, reloads, and sees the edit restored and then saved, with a control that fails when the draft store is not wired; chosen per Spine-Testing §10.

## Evidence

Filled at landing: what ran and where its output is.
