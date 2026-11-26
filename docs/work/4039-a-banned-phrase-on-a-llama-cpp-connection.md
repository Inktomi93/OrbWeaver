---
kind: bug
status: open
updated: 2026-11-26
priority: P2
area: inference
---

# A banned phrase on a llama.cpp connection bans every token it contains for the whole reply

## What

The llama-cpp provider row spells bannedStrings as logit-bias-ban, so spellSamplers (packages/inference/src/backends/openai-compat/sampling.ts) sends each phrase as a logit_bias key set to false. llama.cpp tokenizes that key and bans every token of it globally, with no sequence context, so banning "her spine" bans "her" and " spine" everywhere.

## Why

A multi-token phrase silently guts common words from every reply, and nothing tells the user; the contract comment says only that llama.cpp tokenizes and bans the phrase itself.

## Done when

On the llama-cpp row a phrase that tokenizes to one token is still sent as a false bias, and a multi-token phrase is dropped with a sampling_knob_dropped warning naming it; a body-shaping test in tests/inference/backends/openai-compat covers both, and the contract comment states the per-token rule.

## Evidence

Filled at landing: what ran and where its output is.
