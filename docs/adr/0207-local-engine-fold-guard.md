---
kind: adr
status: active
updated: 2026-09-23
---

# A local vLLM chat wire guards folded extraction to the cheap round

## Context

Split off [ADR 0112](0112-the-hosted-extraction-fold-amends-d108-s-delivery.md), whose local-engine fold-guard amendment pushed it over the 8 KiB ADR cap. The live three-case run (spike §4f-§4g) showed tool attachment silences a local vLLM chat wire's prose outright: `content: null` + `finish_reason: tool_calls` on 36/36 folded turns.

## Decision

**\[AMENDED, owner ruling — THE LOCAL-ENGINE FOLD GUARD]:** `folded` on a LOCAL vLLM chat wire runs the CHEAP post-commit round instead of mounting terminal tools. The original clause's reasoning ("no capability flag distinguishes hosted-strong from the local 8B — both advertise tools") is SUPERSEDED BY MEASUREMENT, not by a source branch: the live three-case run (spike §4f-§4g) shows tool ATTACHMENT silences that wire's prose outright — `content: null` + `finish_reason: tool_calls` on **36/36** folded turns, while the same model with no tools attached wrote 1497–2959 chars every turn — so the fold's premise (prose AND state in ONE completion) is FALSE there and the passenger crashes the vehicle. That is a CAPABILITY fact and it is declared as one: `ModelCapability.tools.silencesProse` (set by the ONE capability floor, `packages/inference/src/capability/floor.ts`; AMENDED — the provider-named `vllm` case it was born as is gone with that source axis, and the floor now closes the cell on ANY `auth: endpoint` connection that declares tools without declaring co-emission, which is the same measurement stated as a property of the endpoint rather than of a vendor), read through the contracts-homed `coEmitsProseWithTools` predicate — `domain/rpg` still never sees `credential.source` (the D112 ban holds). Threading: `resolveTrackersReadOnly` becomes `resolveStateDelivery` — ONE host connection resolve returning BOTH verdicts `{trackersReadOnly, foldGuarded}` (the resolve is the expensive part; a per-turn caller must never pay for it twice) — and the gather's PRE-COMMIT mount decision (2b) gates on `foldGuarded`, so the character turn is byte-identically tool-less (the mount's db reads never run). The chat pipeline's `attachTerminalTools` eligibility reads the same predicate, so the WIRE is the last word even if the turn routes somewhere the contributor's resolve did not predict. The fallback is the SAME cheap round the no-terminal-channel case uses (one home, `POST_COMMIT_ROUND`) and is equally LOUD: `rpg.extraction.path` WARN with `fallbackReason: "local-engine-fold-guard"` — the reason vocabulary is TOTAL (`no-terminal-channel` = no channel at all · `local-engine-fold-guard` = channel exists, mount withheld on purpose), derived at the flush from the TURN's own capability. An EXPLICIT host `cheap`/`reliable` is untouched — the guard governs only where FOLDED lands; hosted wires (openrouter chat-completions, the curated Claude shortlist) are unchanged. Freshness: NO new lie — the guarded case rides the SAME (4) KNOWN GAP as the agent-sdk case (it reads "Live" while rounding), pending EFF-3.

## Consequences

`folded` on a local vLLM chat wire runs the same cheap post-commit round the no-terminal-channel case uses, logged loud with `fallbackReason: "local-engine-fold-guard"`. An explicit host `cheap`/`reliable` is untouched. Freshness rides the same known gap as [ADR 0112](0112-the-hosted-extraction-fold-amends-d108-s-delivery.md) clause (4), pending EFF-3.

## Alternatives rejected

Keep the original clause's capability-flag reasoning that no flag distinguishes hosted-strong from the local 8B (rejected: superseded by the live measurement showing the fold's co-emission premise is false on that wire).
