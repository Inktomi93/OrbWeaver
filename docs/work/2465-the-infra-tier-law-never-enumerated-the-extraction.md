---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: docs
---

# The infra tier law never enumerated the extraction and media adapters

## What

docs/law/Tier-3-Infra.md titles and enumerates only auth, crypto, network, storage and image. infra/extraction (sealed text-extraction adapter, first committed months before this item, injected as one op at entry/compose/services.ts:632) and infra/media (ffmpeg video normalizer, wired at services.ts:1044) appear nowhere in it, nor in the Constitution domain map or the Core-0 partitioning (concept-searched). The law was edited in its newest commit without enumerating them. A cold author learns the extraction contract only from the file header. Source: reports/codebase-review/units/server-infra-io.md F1.

## Why

The tier law is the always-read map of what infra owns and what may never live there; an omitted adapter is an unmapped domain where the next placement decision is made blind — the stale-prose thesis by omission, which no name-resolution door can catch because no sentence ever claimed the list was complete.

## Done when

What-this-tier-owns carries a bullet per adapter (sealed-executor contract, NOT-owned boundaries) and the handle table gains the createExtractText and createVideoPreparer rows with their compose sites; details stay in the adapters file headers.

## Evidence

Filled at landing: what ran and where its output is.
