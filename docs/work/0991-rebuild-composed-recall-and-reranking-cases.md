---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: inference
plan: restoration-register
---

# Rebuild composed recall and reranking cases

## What

Rebuild recall and reranking cases through composed search, databank and chat operations. Seed through production generation and corpus writes. Script the provider embedding edge; keep actual model calls opt-in.

## Why

Copied search and chat contexts cannot establish production ownership, scoping or vector behavior.

## Done when

Preserve text and late-closing recall, Smart and databank cuts, omnibox targets, speaker cuts, reach, seed upgrade, user choice, reboot, cold and token cases. A deterministic composed test fails on a production scoping or rerank defect. Keep live engine calls opt-in.

## Evidence

Use maintained Node tests and existing production composition. Do not recreate a standalone probe or its copied contexts.
