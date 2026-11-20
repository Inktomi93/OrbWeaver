---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: test-foundation
---

# Chat review: memory view phone case and frame sheet test read production

## What

Code review of the chat follow-ups. tests/client/features/chat/components/memory-view-tab.ct.tsx uses text too short to catch a wrapping regression and never checks overflow inside a row. tests/server/entry/http/card-frame-grant-withdrawn.int.test.ts copies part of an unexported selector from packages/kit/src/card-frame/index.ts. packages/client/src/features/character/components/character-trust-tab.tsx wraps a one-off control in the @orb/ui Field, which .claude/rules/ui-and-client.md says a feature does not do.

## Why

A fixture too short to wrap proves nothing at phone width, and a copied selector passes when production changes.

## Done when

The memory view CT uses text long enough to wrap and asserts no overflow inside a row, red when wrapping breaks; the frame test reads the selector from its production home; the trust tab control follows the ui-and-client rule.

## Evidence

Filled at landing: what ran and where its output is.
