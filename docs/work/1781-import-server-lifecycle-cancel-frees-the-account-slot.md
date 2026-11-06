---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: server
plan: unwired-code
---

# Import server lifecycle: cancel frees the account slot, and poison or deleted-owner rows free their upload without waiting for boot

## What

Make a cancelled import free the account's import slot at once, and free the upload of a poison row or a deleted owner's row without waiting for the next boot.

## Why

A cancelled import row stays in the cancelling state for seconds and the next pick is refused. A poison row has no readable params, and the staged upload of a row whose owner is gone stays on disk until the boot sweep.

## Done when

A test cancels a running import and picks again at once without a refusal. A test with a poison row and one with a deleted owner finds the staged upload removed before any boot sweep.

## Evidence

Filled at landing: what ran and where its output is.
