---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: chat
lane: wt/agent-aecb78d3e3ce1089b
plan: unwired-code
---

# MessageWindowResolution derives its outcomes from CorpusSourceOutcome

## What

packages/server/src/domain/chat/contract/views.ts spells deleted, unavailable, resolved and moved by hand instead of an Extract of CorpusSourceOutcome (packages/contracts/src/search/source.ts).

## Why

A hand union is a second home for the vocabulary, and the unions scan cannot see it build those members.

## Done when

The hand literals are gone and unions reports no CORPUS_SOURCE_OUTCOMES rows.

## Evidence

Filled at landing: what ran and where its output is.
