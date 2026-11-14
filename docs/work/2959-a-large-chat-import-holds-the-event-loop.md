---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# A large chat import holds the event loop once before its first stage

## What

The staged landing bounds each stage, but one gap per large import grows with the chat. The likely cause is the whole-chat map in `chatShell` in `packages/server/src/domain/import/substrate/chat-input.ts`, which runs before any stage. It is not profiled. The gap stays under the bound for a five megabyte chat on a quiet box and grows toward the upload cap.

## Why

A health check or a live turn waits for that gap during a very large import.

## Done when

The gap is profiled and its cause named. A chat at the upload cap imports with no gap above the bound the yield test uses, or a decision record rules the gap accepted.

## Evidence

Filled at landing: what ran and where its output is.
