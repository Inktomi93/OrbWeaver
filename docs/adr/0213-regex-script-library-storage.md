---
kind: adr
status: active
updated: 2026-09-23
---

# The regex script library is a first-class scoped store

## Context

Split off [ADR 0121](0121-the-close-out-ruling-for-the-preset-and.md), the close-out ruling for the preset and actor-state programs, whose seven independent clauses (A–G) pushed it over the 8 KiB ADR cap. This clause stands alone, as the original states. It amends D53's storage clause; D53's authority, tier, and ReDoS clauses are preserved verbatim there.

## Decision

**(E) D53's STORAGE clause is AMENDED; its authority, tier, and ReDoS clauses are PRESERVED verbatim.** The regex SCRIPT LIBRARY is a first-class scoped store — a top-level owner-stamped entity plus per-type FK junctions (D23/D24), the world-info pattern `Core-0-Architecture-and-Structure.md` §6 already ruled ("regex reuses it") — and the three embed-by-value carriers (`UserSettings.regex.scripts`, `PromptConfig.regexScripts`, `characters.regexScripts`) die in that wave, NO-LEGACY, on one regenerated baseline. What does NOT change: the host-owned shared-prompt legs and their resolution order, the per-user `markdownOnly` DISPLAY tier (the flags ARE the tier discriminant), and the kit/server-kit ReDoS split (`@orb/kit/regex` heuristics client-side, the `@orb/server/kit/regex` `node:vm` watchdog server-side). **The inter-engine ORDER is law and gets a home:** macros resolve BEFORE regex executes on a leg, a regex template gets its own macro pass, captured text splices verbatim (never macro-evaluated), and CEL never sees regex output (it runs inside the macro pass) — per-leg order is SEND (freeze volatile → `promptTransforms("user_input")` → USER_INPUT regex), per WI entry (macro → WORLD_INFO regex → wiFormat), RECEIVE (think-demux → AI_OUTPUT regex → postProcess → per-speaker clean → REASONING regex), DISPLAY (row macros → DISPLAY regex → fixMarkdown). Order-as-prose rots: each leg carries a pin test.

## Consequences

The regex script library is a top-level owner-stamped entity plus per-type FK junctions. The three embed-by-value carriers (`UserSettings.regex.scripts`, `PromptConfig.regexScripts`, `characters.regexScripts`) die in one wave, no-legacy, on one regenerated baseline. The inter-engine order (macros before regex, captured text splices verbatim, CEL never sees regex output) is law with a pin test per leg.

## Alternatives rejected

Keep the three embed-by-value carriers and add a fourth for a new consumer (rejected: the world-info pattern already ruled that regex reuses the scoped-store shape).
