---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: chat
plan: chat-html-and-presets
---

# A reply's provider record shows in its message info and in Stats

## What

Each reply stores providerMetadata in the variant metadata column (packages/contracts/src/chat/messages.ts namedProviderMetadataSchema, written at packages/server/src/domain/chat/persistence/canon-write.ts): the upstream vendor and upstream cost on an OpenRouter turn, the cache-write split by TTL, web search calls, served model and model-call count on a Claude subscription turn. Only fork and edit copy it; nothing reads it for a person.

## Why

The record exists so the vendor that billed and the cost split are recoverable, and no screen shows them.

## Done when

The message info shows the served vendor, model and cost split where the record has them, and Stats groups spend by upstream vendor; each field the schema stores has a named reader or is removed from the schema with the reason; CTs cover an OpenRouter and a Claude subscription reply.

## Evidence

Filled at landing: what ran and where its output is.
