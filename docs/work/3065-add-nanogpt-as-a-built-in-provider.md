---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: connection
---

# Add NanoGPT as a built-in provider

## What

Add a NanoGPT row to `packages/contracts/src/inference/builtin-providers.ts`, modelled on the OpenRouter row: openai-compat wire, apiKey auth, catalog by URL, metered. A user confirmed `https://api.nano-gpt.com` works as the Server URL. Check with a real key: the model list shape, whether it reports context and output limits, streamed tool calls, reasoning arriving as `delta.reasoning`, the `<NanoGPT>…</NanoGPT>` metadata blocks in the stream, and whether JSON-schema structured output is accepted. Do not adopt `@nanogpt/ai-sdk-provider`: it needs AI SDK 5 and does not surface tool calls.

## Why

Users arriving from SillyTavern use NanoGPT and have to look up its URL and type its limits by hand.

## Done when

NanoGPT is a named provider that lists models, chats, calls tools and shows reasoning with only a key entered, and the provider table test covers the row.

## Evidence

Filled at landing: what ran and where its output is.
