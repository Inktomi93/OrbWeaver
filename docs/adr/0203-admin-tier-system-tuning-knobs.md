---
kind: adr
status: active
updated: 2026-09-23
---

# The admin tier wires eight AppSettings system-tuning knobs

## Context

Split off [ADR 0107](0107-declared-knob-wired-or-cited-as-dormant.md), whose Phase B admin-tier record pushed it over the 8 KiB ADR cap.

## Decision

**The ADMIN TIER WIRED (Phase B ⑩) — eight AppSettings admin knobs through the `admin`-anchored `system-tuning` section (the stint-2 floor-vs-override pattern: env/born-in-DB floor ⊕ nullable override, section Reset, bounds from the schema home, clamp-on-write):** ① `agentSdkConcurrency.summarize` (Q6 — the agent-sdk summarize worker count, env floor `AGENT_SDK_SUMMARIZE_CONCURRENCY=4` byte-identical to the former hardcoded SUMMARIZE_CONCURRENCY; a live getter threaded through `createAgentSdkBackend` → `summarize()`, DISTINCT from the vLLM engine's summarize floor 32); ② `promptTransformDeadlineMs` (born-in-DB floor 250 — `createPromptTransformRegistry`'s `deadlineMs` became a live getter, read per apply); ③ `maxDatabankBytes` (the databank-upload cap — **TIGHTEN-ONLY**: the schema max IS the `@orb/contracts/uploads` route control so an over-control value drops at parse, `resolveUploadCaps` gained the case mirroring `maxImageBytes`'s `min()`, the served `UploadCaps.databankUpload` reflects the effective min, and the databank route rejects an over-cap `file.size` per-request); ④ `nonOwnerLocalComputeBudgetWindowMs` (the member-budget WINDOW — was hardcoded `MEMBER_BUDGET_WINDOW_MS=24h` in compose; `createMemberBudget`'s `windowMs` became a live getter matching the per-debit-live cap); ⑤ `catalogRefreshIntervalMs` (the model-catalog success-refresh cadence — was REFRESH_EVERY_MS in the scheduler, now a live `refreshEveryMs` getter dep); ⑥ `imageVariantQuality` (the lossy-encoder quality, 1–100 — **CACHE-KEY CAVEAT honored**: the quality value is FOLDED INTO the variant cache filename `…-q<quality>.webp` so a change yields a fresh key → regeneration, pinned by a variant-cache int test; threaded through `AssetsContext.imageVariantQuality` → `resolveVariant` key + `imageTransform`); ⑦ `engineLaunch.genPresencePenalty` (the vLLM per-request presence-penalty default — env floor `VLLM_GEN_PRESENCE_PENALTY=1.5` byte-identical to the former silent CARD_DEFAULT_PRESENCE_PENALTY that hit ANY served model incl. role/side-gen; `genRepetitionPenalty` is the exact precedent, but consumed PER-REQUEST via a live getter into the vLLM chat surface's `buildBody`, so it lives in the live `system-tuning` section not the restart-gated engineLaunch editor; a preset's explicit `presencePenalty` still wins; **verified by WIRE-BODY snapshots ONLY — never a live vLLM request**, the engineLaunch test idiom). AppSettings schema bumped v3→v4 (additive lift, `schemaVersion` stamped on write). Two stint-5 control tests owed also landed: an `autoContinueRounds=2` loop-stop (mirrors the `maxRetries=2` idiom) and a `compute-cooccurrence` `maxPairs`/`hubFraction` threading assertion (the stint-4 wire, now tested). `EffectiveAppConfig` grew from 16 to 22 resolved fields; `layer.ts`'s floor table grew in lockstep. No `knob-wire-coverage` registry entries to prune (all ⑩ knobs are new — the STALE fixture's `B:profile` subject was untouched and survives).

## Consequences

`EffectiveAppConfig` grew from 16 to 22 resolved fields; `layer.ts`'s floor table grew in lockstep. AppSettings schema bumped v3→v4 (additive lift, `schemaVersion` stamped on write). No `knob-wire-coverage` registry entries to prune: all eight knobs are new.

## Alternatives rejected

Leave the eight admin knobs hardcoded or env-only (rejected: an owner cannot tune them without a redeploy, and the stint-2 floor-vs-override pattern already exists for exactly this shape).
