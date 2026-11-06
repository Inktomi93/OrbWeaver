---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: testing
plan: surface-walk
---

# After a delete in a walk journey, the walker asserts focus is not on body and no read of the deleted id follows

## What

After a delete in a walk journey, make the walker assert that focus is not on the page body and that no read of the deleted id follows.

## Why

A delete that leaves focus on the page body strands keyboard users, and a read of the deleted id returns 404 (the deleted-preset `preset.get` case). `walkDoor` in tests/e2e/support/surface-walker.ts asserts focus returns to the opening door only; no walk step checks focus after a delete or watches reads of a deleted id.

## Done when

The walker fails a journey that leaves focus on the body or reads the deleted id after a delete. A planted control journey that does both fails the check.

## Evidence

Checked tests/e2e/support/surface-walker.ts: its only focus assertion is `toBeFocused` on the door trigger after close.
