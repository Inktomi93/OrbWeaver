---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: preset
plan: cross-surface-consistency
---

# A preset shows the output and context limits it will really use, and a guessed limit never caps it

## What

A first user could not raise max output above 4096 or context above 8192 for a NanoGPT model: the server reported no limits, so the connection used cautious guesses that capped the preset sliders, and the fix lived in Connections, Advanced, What this server accepts. A blank max output silently means DEFAULT_MAX_OUTPUT_TOKENS (2048, packages/contracts/src/preset/index.ts), and on a reasoning wire that budget also covers thinking. The preset Output section shows none of this.

## Why

Users cannot see what a reply is capped at, or why, and a guess behaves like a hard limit.

## Done when

The preset Output section always shows the effective max output and context (a blank names the default it falls to), names the source of each slider limit (reported by the server, set by an override, or guessed) with a link to the connection override, lets a slider pass a guessed limit with a warning while a reported limit stays a hard cap, and on a reasoning wire says the max covers thinking and reply; component tests cover a reported, an overridden and a guessed limit.

## Evidence

Filled at landing: what ran and where its output is.
