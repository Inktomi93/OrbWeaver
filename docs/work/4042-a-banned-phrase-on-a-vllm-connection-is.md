---
kind: bug
status: open
updated: 2026-11-26
priority: P2
area: inference
---

# A banned phrase on a vLLM connection is mostly never banned

## What

The vllm row spells bannedStrings as bad_words. vLLM strips a word's leading space, tokenizes it bare and keeps the spaced form only when the token counts match, so on Qwen a word like waving bans only its bare pieces and a mid-sentence use is never banned; measured live, the ban has no effect mid-sentence.

## Why

The owner's banned phrases silently do nothing on a vLLM connection.

## Done when

The vllm row either sends phrases where they are honored as sequences (the antislop proxy's backtracking banned_strings, per the antislop item) or drops them with a sampling_knob_dropped warning that says why, and a body-shaping test covers the choice.

## Evidence

Filled at landing: what ran and where its output is.
