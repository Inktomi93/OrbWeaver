---
kind: bug
status: open
updated: 2026-11-26
priority: P3
area: chat
---

# A partial banned-phrase drop reads as if the whole setting failed

## What

When the llama.cpp row drops only some banned phrases (multi-token or untokenizable), the chat notice for the sampling_knob_dropped warning still says this model does not offer the setting, though the one-token phrases were sent.

## Why

The owner reads that banned phrases do nothing on this connection and may give up on a ban that works.

## Done when

A partial drop names the dropped phrases and says the rest were sent, a whole drop keeps today's wording, and a CT or int test asserts which notice each case raises.

## Evidence

Filled at landing: what ran and where its output is.
