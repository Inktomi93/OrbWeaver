---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: chat
---

# A live game turn can hang with its ghost pending and no error

## What

In the live CYOA case (tests/e2e/live-parity-plus-capstone.spec.ts), a choice-sent turn on the local vLLM connection never resolved within 120 s: the reply ghost and Stop stayed live and the server logged no error or warning. The same case passed alone in 6.8 s.

## Why

A turn that never finalizes and never errors leaves the user stuck with nothing to retry.

## Done when

The hang is reproduced with server-side logging at each stage of the turn, the cause is named, and either the stream finalizes or the turn fails visibly, with a regression case.

## Evidence

Filled at landing: what ran and where its output is.
