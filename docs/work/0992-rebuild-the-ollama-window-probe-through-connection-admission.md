---
kind: work
status: open
updated: 2026-10-14
priority: P2
area: inference
plan: test-foundation
---

# Rebuild the Ollama window probe through connection admission and composed turns

## What

Replace fabricated dependencies and connections in `scripts/probes/local-servers/ollama-window.ts` with persisted connection writes and composed chat turns. Use injectable network, catalog and provider edges with lifecycle cleanup. Preserve room-derived tool membership.

## Why

Fake connection rows bypass endpoint admission and persisted ownership. The parallel turn context invents tool execution membership instead of reading real room state.

## Done when

Remove legacy helpers without bypassing admission. Preserve stated windows, native declared windows, the losing `/v1` control, pinned windows and server-context cases. Capture the oldest fact, request body and context counts. Cover scripted refusal, cancellation and cross-owner cases. Keep live pin creation and deletion opt-in; never access engines implicitly.

## Evidence

Filled at landing: what ran and where its output is.
