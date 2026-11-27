---
kind: work
status: open
updated: 2026-11-27
priority: P2
area: inference
---

# A native backtracking phrase ban and slop bias for unmetered local servers

## What

Orbweaver bans phrases and softens slop lists itself, in the stream: it holds back a lookahead the length of the longest listed phrase, and when a listed phrase appears it cuts the reply to just before it and asks again from that prefix (assistant prefill) with the phrase's first token biased down for that one step, so no retraction reaches the browser. A slop list uses a soft bias instead of a ban, with the room's character and user names allowed. A per-turn retry cap ends it, and a row without the needed features warns and drops.

## Why

llama.cpp and vLLM cannot ban a multi-token phrase, and the owner's antislop proxy is box tooling; a native ban gives every local install the feature on every OS with no extra process.

## Done when

The ban runs only on a connection whose row is unmetered and declares prefill and logit bias; a metered or hosted connection never retries and gets the server's own ban or a warning, which a test proves. The Word lists library of D358 ships with it: named lists with one effect scale, attached from presets, one import path, search and bulk edit, per-entry connection status, and existing preset bias, banned phrases and the preset slop list migrated to the library or inline extras. A UX review passes before merge, and body and stream tests through the composed root cover a banned phrase cut and retried, a slop bias, the retry cap, and the refusal on a metered row.

## Evidence

Filled at landing: what ran and where its output is.
