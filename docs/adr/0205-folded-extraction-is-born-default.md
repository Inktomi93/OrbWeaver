---
kind: adr
status: active
updated: 2026-09-23
---

# Folded extraction mode is the born default

## Context

Split off [ADR 0112](0112-the-hosted-extraction-fold-amends-d108-s-delivery.md), whose owner-ruled default-mode amendment pushed it over the 8 KiB ADR cap.

## Decision

**\[AMENDED, owner ruling + EXT-4]: `folded` is the BORN DEFAULT** (`config.extractionMode` defaults `"folded"`; `game-mint.ts` no longer re-spells the mode) — `reliable`/`cheap` are the opt-OUTS; D108's "default `reliable`" and D109-1's "`reliable (default)`" are superseded on this point. Known consequence: the agent-sdk wire (which an OpenRouter-keyed Claude-runtime skin ALSO ran at the time; that skin was deleted under F18, so the wire is the subscription's alone) has no terminal channel, so folded rooms there run the LOUD fallback round every turn — the D112 (4) freshness-lie KNOWN GAP is now the default-path experience on those rooms; EFF-3 (effective-delivery surface) is correspondingly urgent, and teaching the agent-sdk runner terminal tools is the queued real fix.

## Consequences

A room minted with no explicit `extractionMode` runs folded. The agent-sdk wire's terminal-channel gap (closed by [ADR 0206](0206-agent-sdk-terminal-tool-channel.md)) is on the default path the moment this lands.

## Alternatives rejected

Keep `reliable` as the default (rejected by owner ruling, superseded by measurement in [ADR 0208](0208-reliable-extraction-mode-deleted.md)).
