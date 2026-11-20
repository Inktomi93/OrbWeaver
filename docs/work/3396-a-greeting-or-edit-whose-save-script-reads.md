---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
---

# A greeting or edit whose save script reads the databank or memory gives the host no notice when retrieval failed

## What

Under 3375 a save pass on a greeting, a card alternate step or a run-on-edit edit gathers retrieval only when a script it runs reads `{{memory}}` or `{{databank}}` (`regexCallReadsRetrieval`), and reads a failed retrieval as an empty slot (`retrievalSettler` in packages/server/src/domain/chat/assembly/gather.ts). The only drain for the retrieval warning episode is the turn engine (`takeIndexUnavailable` in packages/server/src/domain/chat/engine/engine.ts), so these writes log a warning and tell the host nothing.

## Why

The stored row keeps the script's rewrite with an empty slot, and a host who wrote `{{databank}}` into a save script cannot tell the slot was empty because the embedder refused.

## Done when

A greeting or edit save pass whose retrieval degraded tells the host, through the same retrieval warning codes a turn uses, on the surface the write returns to; a composed test with a refusing embedder reads that notice.

## Evidence

Filled at landing: what ran and where its output is.
