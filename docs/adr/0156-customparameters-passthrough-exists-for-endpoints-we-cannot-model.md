---
kind: adr
status: active
updated: 2026-09-23
---

# `customParameters` passthrough exists for endpoints we cannot model, never as a second sampling surface for one we own

## Context

Not recorded in the ledger row.

## Decision

Owner ruling: *"people should not be able to custom set openrouter shit, that was never an intent."* The unified modeled sampling surface (ONE `ResolvedSampling` resolved once, each backend projecting it onto its own wire) is the deliberate answer to per-provider param sprawl, so every real knob already has a first-class home. Per `../design/orbweaver-inference-package.md` §8.1c/F21, the three per-backend surfaces this entry enumerated collapse to ONE wire with two transports, and the passthrough is a property of the CONNECTION (`extras`), so all three cases are decided in one body shaper, `packages/inference/src/backends/openai-compat/body.ts`. What survives, per transport: the **openrouter** dialect reads only its two modelled keys (`provider`, `models`) off `extras` and drops every other key loudly — the "never a second sampling surface" case holds; the **openai-compatible** transport (a user's own endpoint, vLLM included) admits `extras` behind the denylist `BELT_OWNED_BODY_KEYS`, with the modelled param winning every collision, per \[\[D143]]\(b). The custom-BYO your-endpoint-your-risk inverse, where passthrough beat owned `model`/`messages`, is gone along with that backend (F21): no transport lets a user's key overwrite a modelled one, and `transport.excludeBody` is the door for an endpoint that rejects a modelled key. Enforcer: `tests/inference/backends/openai-compat/body.test.ts` pins dropped-vs-admitted per transport.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
