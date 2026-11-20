---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: chat
plan: source-parts-storage
---

# A continued reply keeps every source it cited at offsets into the whole message

## What

On a continue, the turn's cited sources are written with spans counted from the start of the continuation while the variant's stored content is the parent text plus the continuation, and the parent's own sources are dropped: packages/server/src/domain/chat/engine/engine.ts states the continuation sidecar replaces its parent's, and packages/server/src/domain/chat/substrate/content-signatures.ts shifts tool offsets by the parent length but does nothing for sources. A parent citing a span and a continuation citing its own span stores only the continuation span, pointing at the wrong text.

## Why

Stored citations that point at the wrong words break the source-parts contract the moment a reader exists, and a continue silently loses the parent's citations.

## Done when

A continue stores the parent's sources unchanged plus the continuation's sources shifted by the parent length, the same way tool offsets are shifted; the engine header says so; an integration case continues a cited reply through the real verb and reads every stored span back against the stored content.

## Evidence

Filled at landing: what ran and where its output is.
