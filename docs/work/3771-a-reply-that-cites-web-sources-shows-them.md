---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: chat
plan: chat-html-and-presets
---

# A reply that cites web sources shows them

## What

OpenRouter and v4 wires return citations, the turn engine stores them as TurnEconomics.sources (packages/server/src/domain/chat/engine/engine.ts:214, which says they have no reader) and ChatSource on the message (packages/contracts/src/chat/messages.ts) keeps url, title and cited text. No screen shows them.

## Why

A reply built from a web search cannot be checked against its sources.

## Done when

A reply with sources shows them under the message as linked titles with the cited text on demand, on every chat style, and the engine comment is corrected; a CT drives a reply with sources.

## Evidence

Filled at landing: what ran and where its output is.
