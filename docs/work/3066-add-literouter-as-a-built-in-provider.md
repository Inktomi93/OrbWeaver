---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: connection
---

# Add LiteRouter as a built-in provider

## What

Find LiteRouter's API base URL and confirm it speaks the OpenAI chat format through a Custom OpenAI-compatible connection. Then add a row to `packages/contracts/src/inference/builtin-providers.ts` with the same checks as the NanoGPT row.

## Why

Users arriving from SillyTavern name it as one of their two usual services.

## Done when

LiteRouter is a named provider that lists models and chats with only a key entered, and the provider table test covers the row.

## Evidence

Filled at landing: what ran and where its output is.
