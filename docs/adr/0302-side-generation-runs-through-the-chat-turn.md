---
kind: adr
status: active
updated: 2026-10-04
---

# Side generation runs through the chat turn

## Context

Summaries, structured calls and other side generation ran on separate batch runners per wire. Each runner carried its own copy of the reasoning spellers, sampling gate and output-cap clamp, so a fix to the chat path missed side generation, and the two paths sent different bodies to the same model.

## Decision

A side-generation item is one non-delivered chat turn on the connection's own wire: the role preset's params, the item's system prompt and one user row, the caller's response format, no tools. One loop in packages/inference/src/roles/side-gen.ts maps summarize and structured requests onto chat requests, runs them under features.concurrency.summarize, and folds each chat result into a result item. The posture is an argument of the one reasoning resolver, resolveChat in packages/inference/src/funnel/resolve-chat.ts: the side-gen posture turns reasoning off unless the role preset states an effort or a budget, through the same mandatory clamp. The reasoning spellers and the mandatory-reasoning pattern live in packages/inference/src/backends/openai-compat/reasoning.ts, read by the chat path only. Where a row's thinking switch is chat_template_kwargs, an off turn sends the kwarg alone; reasoning_effort none rides only where the row spells no kwarg switch. A budget with no effort turns reasoning on at the level that covers it. features.requestTimeoutMs is the idle ceiling for chat and side generation alike. The agent-sdk wire runs a batch item as the runner's chat turn with the planned outputFormat.

## Consequences

A fix to the chat request path reaches side generation with no second edit. A side item streams like a chat turn, so the idle ceiling, the pre-commit retry and the truncated-stream check apply to it. The per-wire batch runners, resolveSideGenReasoning, resolveTaskSampling and the think-block strip are gone; the chat reducer and the reasoningTags middleware separate reasoning. A side item resolves no reasoning display, and the role preset's own reasoningParse pair does not reach side generation.

## Alternatives rejected

A second reasoning resolver for side generation (two resolvers drift, which is the defect this removes). Keeping the batch runners and sharing only the spellers (the sampling gate, output-cap clamp, retries and usage fold would still diverge). Sending reasoning_effort none beside enable_thinking false (the two switches contradict each other on a default-on row).
