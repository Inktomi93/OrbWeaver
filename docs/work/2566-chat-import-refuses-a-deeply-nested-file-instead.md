---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: import
plan: import-robustness
---

# Chat import refuses a deeply nested file instead of overflowing the stack

## What

The chat import residue check in packages/server/src/primitives/serde/chat/index.ts validates with the recursive z.json() schema. A deeply nested chat file is suspected to overflow the stack there, the same failure the card import had. The suspicion is not yet probed.

## Why

An import must answer a hostile or damaged file with a coded refusal. A stack overflow is an unhandled failure the user cannot act on.

## Done when

A probe imports a chat file nested past the engine's recursion limit through the production import entry and records what happens. If it overflows, the residue check becomes iterative or shallow by the same rule the card import follows, and a test pins a coded refusal or a successful import. If it does not overflow, the item lands with the probe as evidence.

## Evidence

Filled at landing: what ran and where its output is.
