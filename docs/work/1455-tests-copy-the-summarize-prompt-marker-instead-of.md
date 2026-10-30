---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: tests
---

# Tests copy the summarize prompt marker instead of importing it

## What

The summarize marker `Transcript block:` is inline and unexported in packages/server/src/domain/chat/memory/generate/substrate/prompts.ts:24, and the testkit and about nine suites copy the literal to find summarize calls on the provider wire.

## Why

Spine-Testing §9 says constants come from their production home; a copied marker passes after production rewords the prompt and the suites stop counting summarize calls.

## Done when

The marker is a named constant in its production home, used by the prompt builder, and every test and testkit site imports it through a door or kit reach; no suite spells the literal.

## Evidence

Filled at landing: what ran and where its output is.
