---
kind: adr
status: active
updated: 2026-10-11
supersedes: docs/adr/0296-ollama-chat-rides-its-native-route.md
---

# Ollama chat and the connection test ride the native route

## Context

D7 keeps every local server a provider row on the openai-compat wire, with its quirks as features. Ollama's /v1/chat/completions drops num_ctx, top_k, min_p, typical_p, repeat_penalty and logit_bias, and it injects temperature and top_p of 1.0 when a request leaves them out. The native /api/chat route takes all of these in options. A connection test that posts a hand-built body to /v1 can pass while the chat turn on /api/chat fails, so a green test did not mean chat works.

## Decision

This ADR supersedes D296 and narrows D7 for one route. A provider row's features.nativeChat names a server's own chat route, and the openai-compat backend sends that row's chat, summarize and structured calls there. The value ollama sends POST /api/chat. The row stays on the openai-compat wire and dialect. The same SDK builds the request and parses the reply, and one translator (backends/openai-compat/ollama-native.ts) converts the body to the native shape and the NDJSON reply back to OpenAI chunks. The translator sends the resolved window as options.num_ctx, and resolve clamps that window to the trained maximum the server states. The connection test (Send a test request) is one 1-token chat call through the same model factory, languageModelFor in backends/openai-compat/model.ts. On an own-server row it takes the chat route and the openai-compat body shaper: the extras, the include and exclude pair and the row's feature rules. It does not exercise dialect placement (the openrouter extras that openRouterShape in backends/openai-compat/chat.ts places) or shaping derived from a turn (preset samplers, reasoning, prefill, tools, structured output and cache markers). It is ok only when the chat path reads the reply. Embeddings, image embeddings, reranking, the credential probe and the model list stay on /v1. The built-in ollama row sets nativeChat to ollama, and a connection can override it to none to return to /v1. The guard: the openai-compat diagnostics case, a [restoration register](../plans/restoration-register/design.md) entry, pins the test request and the chat turn to one route for a native row and an OpenAI-compatible row.

## Consequences

An Ollama connection runs the window its capability states, so a declared window raises the context without a Modelfile or OLLAMA_CONTEXT_LENGTH. The sampler seam can send Ollama's native knobs, and the injected 1.0 defaults no longer apply. The wire capture holds the native body. A row whose server answers no /api/chat keeps working with nativeChat set to none. A green connection test on an own-server row means a chat call on its route reaches the server and reads back; it says nothing about a turn's own settings. The test sends num_ctx, so Ollama loads the model at the chat window, as the first chat turn would.

## Alternatives rejected

A new WIRES member or dialect: the provider_rows table holds a check constraint over both tuples, so either needs a migration. A community AI SDK provider for Ollama: a dependency for one server, and it bypasses the shared body shaping and capture. Keep /v1 and pin the window with a Modelfile copy: it creates models on the user's server and still drops the samplers. Keep the connection test on /v1 and label it a compatibility probe: the label is true, but a green result still does not say chat works.
