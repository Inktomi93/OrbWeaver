---
kind: adr
status: active
updated: 2026-11-20
---

# Sampling completeness rides the capability descriptor

## Context

A control that cannot apply to the connected provider confuses the user. The owner ruled that such a control is not displayed at all.

## Decision

Sampling completeness rides the capability descriptor, never model-name sniffing. `minP` is a first-class preset param end-to-end (`UserIntent` → resolve → the chat-completions wire); the ST importer maps `min_p` and never drops it. `verbosity` lives on the openai-responses wire (`text.verbosity`) with a `verbosity_dropped` warning where unsupported.

A preset, generation or sampling control renders only where the descriptor of the active connection's model states it. This holds on every surface: the params deck, the readouts and every other editor section.

- `statesKnob` in `packages/contracts/src/inference/capability/reads.ts` is the one answer to "can this control apply". `CAPABILITY_KNOBS` in the same file lists the controls it answers for. Every editor gate reads it.
- A section with no control left is not rendered. No empty-state line replaces it, and no surface lists stored values the model ignores.
- A stored value for a hidden control stays stored and never affects a generation. A connection whose model takes it shows it again.
- `statedIntent` in `packages/contracts/src/preset/index.ts` removes every hidden value where a generation forms its params: the chat pipeline's fold, quiet generation and side generation. The readout (`preset.resolveEffective`) previews the turn through the same projection. No reader after it sees the value, so no body field, clamp, warning or recorded param comes from it.
- With no chat connection, no model-fed control renders. The no-model notice and its Connections door stand in their place.
- A fact the route decides rather than the model is stamped onto the descriptor after synthesis (`markRouteFacts` in `packages/inference/src/capability/floor.ts`): `reasoning.seedable`, `contextCompression` and the agent-sdk wire's missing parallel tool control.

The anth-direct clause shares D67's purge, noted with D121: `ANTH_DIRECT_SAMPLING` has zero declarations on the tree. Treat it as design-of-record, not built. Direct-transport per-model Claude sampling is fail-closed: the `ANTH_DIRECT_SAMPLING` table ships empty until a live probe validates each model's honored set. Absence means the knob does not render; never guess a default.

## Consequences

- A new preset control joins `CAPABILITY_KNOBS` and names its descriptor fact, or `tsc` fails at `statesKnob`. A new `UserIntent` field names its control in `statedIntent`, or `tsc` fails there.
- A preset shared across connections keeps every value, and each connection shows only what it can apply.

## Alternatives rejected

- Show an unsupported control with a marker or a "not honored" list: the owner ruled it confuses users.
- Disable an unsupported control in place: a disabled control still says the setting exists for this model.
- Gate each funnel reader on the descriptor, or filter its warnings: a reader that is missed acts on a value the user cannot see.
