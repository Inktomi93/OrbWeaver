---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: server
lane: wt/agent-a17fbff7022b3eefb
plan: unwired-code
---

# No-reader comments match the code and cite their rulings

## What

A classification of the no-reader comments in packages found stale ones: packages/kit/src/macro/types.ts:351 says frozenMacros is not yet wired though edit.ts:504 passes it on variant selection; packages/db/src/schema/imagery.ts:63 says identityHash is reserved though the reuse gate filters on it; packages/db/src/schema/embeddings.ts:256 and search/verbs/images.ts:7 may be stale on hub_score. Deliberate keeps cite no ruling: the audit table (audit.ts), provider raw metadata (provider-metadata.ts, chat/messages.ts), card assets (character/index.ts:622). packages/client/src/routes/\_\_root.tsx:9 cites a task number.

## Why

A stale comment says code is unwired when it is wired, and an uncited keep cannot be told from a forgotten one.

## Done when

Each stale comment is corrected or deleted; each deliberate keep cites its ruling and the published or forensic homes gain entries in tooling/src/unwired/deliberate.ts; the task-number cite is gone.

## Evidence

Filled at landing: what ran and where its output is.
