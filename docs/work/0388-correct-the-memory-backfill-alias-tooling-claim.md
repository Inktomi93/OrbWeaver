---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: chat
---

# Correct the memory backfill alias tooling claim

## What

Correct the comment claiming the private MemoryBackfillCounts alias is read by the respell command.

## Why

The command enumerates exported shapes and skips the exported intersection that consumes this private alias.

## Done when

The comment states the actual derivation purpose without inventing a tooling dependency. Preserve the result contract.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.
