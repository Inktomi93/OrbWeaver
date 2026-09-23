---
kind: adr
status: active
updated: 2026-09-23
---

# Seven SillyTavern gaps are committed

## Context

Not recorded in the ledger row.

## Decision

Seven ST gaps COMMITTED: in-chat image generation, agent-sdk tool calling, reasoning render + `<think>` auto-parse, direct model providers (anthropic/openai/google keys), translate (chat-role request-shaper), standalone caption, welcome screen. **Out by design (do NOT build):** text-completion backends (Horde/NAI/Kobold/instruct/CFG/sampler-ordering), tokenizer zoo, local SD backends, chat-completions tool loop, TTS/STT (deferred-heavy). Data Bank was the one open call — closed by D49 (build, additive).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
