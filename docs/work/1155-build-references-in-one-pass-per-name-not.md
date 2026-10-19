---
kind: bug
status: doing
updated: 2026-10-19
priority: P1
lane: wt/agent-a1f19683428ee1d4b
---

# Build references in one pass per name, not one search per declaration

## What

Complete-reference extraction runs native findReferences per declaration, so work is the sum over declarations of the occurrences of each name: hundreds of millions of candidate positions against a few million for one pass per name, with common names (id, type, name, value, chatId) dominating. It is most of a client worker's time and memory and is why rot, testonly and orphans take hours. It lives in the ts-morph common patch and the native occurrence index (1045). Found by 1133.

## Why

A reference search quadratic in name frequency cannot fit the CI runner and blocks the export cleanup (989) and every equivalence run (965).

## Done when

References are built by one symbol-grouped pass per name under the occurrence-index design, qualified against 1045 and 955's readers with identical reference output on scoped runs, and rot over one package completes in measured minutes under 16 GB.

## Evidence

Filled at landing: what ran and where its output is.
