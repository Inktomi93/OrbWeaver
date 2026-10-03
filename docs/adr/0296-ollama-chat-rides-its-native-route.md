---
kind: adr
status: active
updated: 2026-10-03
---

# Ollama chat rides its native route

## Context

Tier-3b section 1 and D7 keep every local server a provider row on the openai-compat wire, with its quirks as features. Ollama's /v1/chat/completions drops num_ctx, top_k, min_p, typical_p, repeat_penalty and logit_bias, because its Go decoder has no field for them, and it injects temperature and top_p of 1.0 when a request leaves them out. The source study is .prep/local-server-surfaces.md in the wiki repository, section 2.3. The native /api/chat route takes all of these in options, and the rig shows /v1 drops the oldest messages past the server default window.

## Decision

This ADR narrows D7 for one route. A provider row's features.nativeChat names a server's own chat route, and the openai-compat backend then sends that row's chat, summarize and structured calls there. The value ollama sends POST /api/chat. The row stays on the openai-compat wire and dialect. The same SDK builds the request and parses the reply, and one translator (backends/openai-compat/ollama-native.ts) converts the body to the native shape and the NDJSON reply back to OpenAI chunks. The translator sends the resolved window as options.num_ctx, and resolve clamps that window to the trained maximum the server states. Embeddings, image embeddings, reranking and diagnostics stay on /v1. The built-in ollama row sets nativeChat to ollama, and a connection can override it to none to return to /v1.

## Consequences

An Ollama connection runs the window its capability states, so a declared window raises the context without a Modelfile or OLLAMA_CONTEXT_LENGTH. The sampler seam can send Ollama's native knobs, and the injected 1.0 defaults no longer apply. The wire capture holds the native body. A row whose server answers no /api/chat keeps working with nativeChat set to none.

## Alternatives rejected

A new WIRES member or dialect: the provider_rows table holds a check constraint over both tuples, so either needs a migration, and a second backend would duplicate the embed, rerank and diagnostics paths that stay on /v1. A community AI SDK provider for Ollama: a dependency for one server, and it would bypass the shared body shaping and capture. Keep /v1 and pin the window with a Modelfile copy: it creates models on the user's server and still drops the samplers.
