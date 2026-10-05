---
kind: adr
status: active
updated: 2026-10-05
supersedes: docs/adr/0302-side-generation-runs-through-the-chat-turn.md
---

# Side generation runs through the chat turn and splits with the role's tag pair

## Context

Summaries, structured calls and other side generation ran on separate batch runners per wire, each with its own reasoning spellers, sampling gate and output-cap clamp, so a fix to the chat path missed side generation. A model that wraps its reasoning in custom tags then leaked them into summaries, because side generation split only on the house think pair.

## Decision

A side-generation item is one non-delivered chat turn on the connection's own wire: the role preset's params, the item's system prompt and one user row, the caller's response format, no tools. One loop in packages/inference/src/roles/side-gen.ts maps summarize and structured requests onto chat requests, runs them under features.concurrency.summarize, and folds each chat result into a result item. The posture is an argument of the one reasoning resolver, resolveChat in packages/inference/src/funnel/resolve-chat.ts: the side-gen posture turns reasoning off unless the role preset states an effort or a budget, through the same mandatory clamp. The reasoning spellers and the mandatory-reasoning pattern live in packages/inference/src/backends/openai-compat/reasoning.ts, read by the chat path only. Where a row's thinking switch is chat_template_kwargs, an off turn sends the kwarg alone; reasoning_effort none rides only where the row spells no kwarg switch. A budget with no effort turns reasoning on at the level that covers it. features.requestTimeoutMs is the idle ceiling for chat and side generation alike, and an idle trip is a retryable server failure on every wire. A prose item splits reasoning with the Utility preset's reasoningParse pair when its auto-parse is on; splittableTagPair in @orb/contracts/preset trims the pair and keeps it only when it has the XML shape the splitter maps, and any other pair falls back to the house think pair. The agent-sdk wire runs a batch item as the runner's chat turn with the planned outputFormat.

## Consequences

A fix to the chat request path reaches side generation with no second edit. A side item streams like a chat turn, so the idle ceiling, the pre-commit retry and the truncated-stream check apply to it. The per-wire batch runners, resolveSideGenReasoning, resolveTaskSampling and the think-block strip are gone; the chat reducer and the reasoningTags middleware separate reasoning. A side item resolves no reasoning display. Every preset tag pair either splits on its own trimmed form or on the house pair, so no shape leaves reasoning in a summary.

## Alternatives rejected

A second reasoning resolver for side generation (two resolvers drift, which is the defect this removes). Keeping the batch runners and sharing only the spellers (the sampling gate, output-cap clamp, retries and usage fold would still diverge). Sending reasoning_effort none beside enable_thinking false (the two switches contradict each other on a default-on row). Keeping side generation on the house pair only (a model with custom reasoning tags leaks them into every summary).
