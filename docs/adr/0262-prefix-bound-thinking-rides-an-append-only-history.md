---
kind: adr
status: active
updated: 2026-09-25
---

# prefix-bound thinking rides an append-only history

## Context

Claude Opus 5.5 and Fable 5.1 bind each carried thinking block to the system prompt, the tools and every message before it. SHAPE adds a speaker cue for one call and drops it on the next, so with the conversation carry on every later reply's thinking is refused (the error behavior) or dropped with a cache read of zero (drop_block). OR-10 in scripts/probes/openrouter/RESULTS.md measured every layout: a cue kept as a user row between replies (S2c) and a turn-scoped system cue after a user row (S2) stay clean with the cache growing; a system cue right after a reply is a 400 (S2b).

## Decision

On a model whose capability states reasoning.prefixBound, a turn whose carry resolves to conversation keeps every cue. The commit stamps the exact cue SHAPE delivered ahead of a reply on message_variants.cue, and every later turn replays that text before the reply, never re-derived from the current prose or roster. The replayed cue and the live cue take one role rule: a turn-scoped system row (clearAt next_user_message) when a user row precedes it and the model takes a clear-at row, a tail system row and a history system row at the turn's level, else a user row. Any carry above off on a prefix-bound model sends thinking.block_binding.prefix_mismatch_behavior drop_block, so a missed edit costs the block, not the turn. Every prefix_binding_mismatch in input_transformations is counted on the variant's provider sidecar (thinkingDropped) and logged at error as provider.thinking_dropped. Continue, impersonate and Response nudges stay outside the replay until a probe measures them. Homes: packages/server/src/domain/chat/substrate/cue-replay.ts, packages/server/src/domain/chat/assembly/shape.ts, packages/inference/src/backends/anthropic-messages/chat.ts, packages/inference/src/backends/kit/provider-metadata.ts. Enforcers: tests/server/domain/chat/assembly/shape.test.ts, tests/server/domain/chat/engine/round.int.test.ts, tests/inference/backends/anthropic-messages/chat.test.ts.

## Consequences

A replayed user-row cue stays visible to the model on later turns; a turn-scoped cue clears at the next user message. The cue is prompt material, so a fork to a non-host forker drops it with the prompt snapshot, and that fork's first carried turn loses the thinking it bound. Editing the cue prose changes only new replies. A history edit the replay does not cover, such as a moved depth note or a relabel when a second character first speaks, still drops the thinking after it, and the alarm names it.

## Alternatives rejected

Rebuild the cue at replay from the next row's author: a prose override or a roster change yields different bytes and drops the block. Keep the error behavior: any missed edit fails the turn. Send every cue turn-scoped: a system row right after a reply is a 400 (S2b).
