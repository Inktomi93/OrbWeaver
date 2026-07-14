---
kind: spec
status: draft
updated: 2026-07-03
---

# Proposed: the descriptor-driven params panel + the `quality` dial mapping (client)

> **Status: proposed / unbuilt.** Salvaged from the gutted `domains/connection.md` (Part II §3/§5 +
> the "quality → axes" deferred decision). Everything else in that doc is carried by the code
> (`domain/connection/`, `@orb/contracts/connection`, the infra `resolve-chat` funnel, and their
> tests); these are the two genuinely-open designs, both blocked on client work that doesn't exist yet.

## The current state (built + tested)

- `ModelCapability` (`@orb/contracts/connection`) is the ONE descriptor per `(model, source)` —
  reasoning / sampling / verbosity / input / tools / output / context as distinct axes, per-knob
  `Range` bounds. Produced by `connection.resolveModelCapability`; consumed by the infra
  `resolve-chat` funnel (capability-gated knob translation, D41 warnings).
- The transport endpoint exists: `connection.getModelCapability` (tRPC router `connection.ts`) ships
  `ModelCapabilityView` to the client.
- `UserIntent.quality` (`@orb/contracts/preset`, `QUALITY_LEVELS` fast/balanced/deep) exists as a
  wire field but has **zero server-side consumers** — nothing maps it onto the descriptor axes yet.
- The client params panel does not exist (`packages/client/src/features/` has no sampler/params
  feature; nothing in the client imports `ModelCapability`).

## Proposal 1 — the panel renders BY ITERATING the descriptor

When the client params/samplers panel is built, it renders from `ModelCapabilityView` — never a
static knob list:

- **Sampling:** show ONLY the knobs present on `capability.sampling`, with slider min/max taken from
  each knob's `Range`. Agent-sdk models carry `sampling: {}` — the panel shows no sampling section
  for them (no disabled-slider theater).
- **Reasoning:** the control is keyed by `reasoning.mode` — off-toggle (`enabled` is its own axis;
  `effort:'none'` is not an off-switch and `EFFORT_LEVELS` has no `'none'`), an effort dropdown of
  the model's **actual** `effortLevels` (never the full enum), a budget slider from `budgetRange`
  when `mode === 'budget'`, an "adaptive" note when `mode === 'adaptive'`.
- **Verbosity:** rendered only when `capability.verbosity` is present.
- No hardcoded slider bounds, no model-name string matching, no static 6-slider stack. Bounds live
  once — in the descriptor's `Range`s (and the preset form's `generationKnobSchemas` for the intent
  side).
- Neo-tavern's `knob-availability.ts` (coarse source-level gating) is the build-on point; the
  orbweaver panel replaces it with model-granularity descriptor iteration.

**Gate candidate:** the panel component accepts only `ModelCapabilityView`; any import of a static
knob list from outside `@orb/contracts` is RED.

## Proposal 2 — the `quality` dial maps onto DISTINCT axes

`quality` ("fast/balanced/deep") stays the ergonomic dial 95% of presets use. The resolver maps it
onto the descriptor's axes — `reasoning.mode`/effort + a per-model sampling preset — as **distinct
fields, never a merged cascade** (the mechanism is settled; only the per-model numbers are open).

**Decision criterion (deferred, per-model build tuning):** the exact fast/balanced/deep numbers per
curated model are fixed when the Claude shortlist is verified against live model behavior. Same
deferral as the `DEFER(promotion)` notes in `domain/connection/catalog/chat-models.ts` and
`resolve-model-capability.ts` (the synthesized ranges/effort ladders).

## Constraints that survive either way

- One translation path: runners read the resolved descriptor handed in on the request; the funnel
  (`infra/providers/resolve-chat.ts`) never imports the factory (R9), and no second reasoning
  derivation from raw intent appears.
- A knob the descriptor doesn't list is not sent AND not shown — the two consumers (translator,
  panel) read the same descriptor so they cannot drift.
