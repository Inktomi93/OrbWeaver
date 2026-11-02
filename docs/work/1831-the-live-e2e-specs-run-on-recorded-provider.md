---
kind: work
status: open
updated: 2026-11-02
priority: P2
area: testing
plan: test-foundation
---

# The live e2e specs run on recorded provider streams in routine e2e

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
Owner idea, agreed. Title: The `@live` e2e specs run on recorded provider streams in routine e2e.
What: record a few real turns from a local engine at the raw provider boundary, including streamed text and state tool calls. Store them as testkit data, replay them through the existing scripted peer by step in the journey, not by request hash, because a prompt change would invalidate every hash. Convert `guided-generations.spec.ts` and `rpg-lite-loop.spec.ts`. Keep one small optional live smoke.
Why: these specs skip without an engine, and their headers assert app fidelity, not model behaviour.
Done: both specs run with `E2E_LIVE=0` in `pnpm e2e`; a re-record command exists; a tape that no longer parses fails with its name. Tapes hold no secrets and no owner data. Scripted turns must keep Spine-Testing §9: production parsing runs on the tape.
Owner idea, 2026-11-01. Covers the parts of 1778 that stay unproven.
