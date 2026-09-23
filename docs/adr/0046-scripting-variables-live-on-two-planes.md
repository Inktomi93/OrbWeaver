---
kind: adr
status: active
updated: 2026-09-23
---

# Scripting variables live on two planes

## Context

Not recorded in the ledger row.

## Decision

Scripting/automation/variables (design set parked in `../architecture/proposed/` (see `../architecture/proposed/INDEX.md`)): variables have TWO planes — config = ChoiceBlock picks (preset-declared, per-chat, fork-carried) and runtime = script `setvar`/`incvar` stored as **per-variant deltas folded over the selected message chain** (derive-don't-stamp — kills swipe-clobber and fork-copy special-cases by construction); per-user globals = a `fetchOwned` KV table. Macro engine = `kit/macro` (injected clock/PRNG, DoS-bounded) + CEL (`@marcbachmann/cel-js`) as the predicate layer over the same `MacroEnv`. Tiers: 1 = declarative `on <event> where <predicate> do <closed action union>` (`domain/automation`); 2 = QuickJS-ng WASM sandbox behind a Figma-style membrane (frozen versioned `@orb/contracts/plugin` host surface, capability-manifest → `can()`, injected clock/PRNG) serving plugins AND inline snippets. Rejected permanently: `isolated-vm`, SES/Compartments, ST's `getContext()` god-object + dynamic-import extensions. v1 automation authority = owner/host-authored only; autonomous hosted-cred turns carry a per-rule/per-chat rate cap independent of D17 consent. *(Amended 2026-07-24, owner ruling — retro #15: the $/spend-ceiling half of the originally-sanctioned "rate + $ budget" was RETIRED as single-user overbuild; the rate half stays (`budget-gate.ts` cooldown/per-rule-hour/per-chat-hour; `budget_refused` = the rate-cap fire terminal). Cost VISIBILITY (stats domain, `costUsd` metering) is untouched — enforcement died, not measurement. The plugin spend tier (PLUGIN-SPEND: `plugin_budgets`, `PluginSpendGate`, and the bridge `runExclusive` serializer that existed for its check-then-accumulate) was removed whole; the plugin-host DoS caps and the transport member turn budget are loop-safety, not spend, and remain.)*

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
