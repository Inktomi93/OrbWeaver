---
kind: adr
status: active
updated: 2026-10-03
---

# OpenRouter Claude stays on chat completions (amends D174)

## Context

OpenRouter chat completions refuses every reasoning-off spelling for Claude Sonnet 5.5, so an off turn clamps to low. OpenRouter's Anthropic-compatible Messages endpoint accepts between_tools. A per-model flag could serve flagged Claude ids on an OpenRouter connection over that endpoint through the anthropic-messages backend.

## Decision

No flag. An OpenRouter connection serves every Claude id over chat completions, and the measured mandatory row for Sonnet 5.5 keeps the clamp to low. This amends D174's rejected alternative: the endpoint itself keeps routing, the models fallback, the billed cost and the gen- id. OR-15 in scripts/probes/openrouter/RESULTS.md measured each one: provider.only gen-1790995406-Ixi7md8QRf4VSLGsZnHF, gen-1790995407-8coSGnWC3YnNLJ2XmkOu and gen-1790995408-thtfBV9bTz21FspqRHfk; models fallback gen-1790995410-oXotUhb763enUVvDQC80; backend between_tools gen-1790995414-Ih1ruhYeJkV9zopiCePA. The rejection rests on what our backend drops. Routing: the backend sends no provider block, so the Anthropic pin and the provider and models extras are lost. Measured cost: measuredCostOf reads only the openrouter provider metadata, so the turn records no billed cost. Diagnostics: they dispatch on the resolved wire, and the anthropic-messages backend has no credits, generation-cost, inspect or verify-auth method. Each fix is adapter code for this route alone. Homes: packages/inference/src/capability/sources/measured/openrouter.ts, packages/inference/src/resolve/resolve-task.ts.

## Consequences

An OpenRouter Sonnet 5.5 turn cannot turn reasoning off; it reasons at low and warns with reasoning_mandatory_clamp. Revisit when OpenRouter chat completions accepts reasoning off for Sonnet 5.5: rerun PROBES=or14 and drop the measured mandatory row. The refusal is server-side, so a provider-package bump alone does not change it.

## Alternatives rejected

A capability cell that moves flagged Claude ids on an OpenRouter connection to the anthropic-messages wire at resolve. It works for the turn itself, but it needs a routing body injector, a second cost reader and a split between the serving wire and the diagnostic wire.
