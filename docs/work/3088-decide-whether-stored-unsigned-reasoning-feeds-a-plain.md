---
kind: decision
status: open
updated: 2026-11-20
priority: P2
area: inference
---

# Decide whether stored unsigned reasoning feeds a plain-text replay

## What

The prompt pass already carries reasoning parts: packages/server/src/domain/chat/substrate/wire-history.ts carries them on the conversation step and packages/inference/src/funnel/resolve-chat.ts resolves the text, off and unsupported-replay steps. No ADR or law clause records this behaviour as the ruling.

## Why

The prompt pass reads no reasoning; a replay step would be the only path reasoning reaches a prompt.

## Done when

The shipped reasoning carry is recorded as a ruling in an ADR or the inference law with each step's behaviour, and the existing tests that hold each step are cited from it.

## Evidence

Filled at landing: what ran and where its output is.
