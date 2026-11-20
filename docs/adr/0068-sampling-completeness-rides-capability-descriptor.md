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

- `statesKnob` in `packages/contracts/src/inference/capability/reads.ts` is the one answer to "can this control apply". `CAPABILITY_KNOBS` in the same file lists the controls it answers for.
- A section with no control left is not rendered. No empty-state line replaces it, and no surface lists stored values the model ignores.
- A stored value for a hidden control stays stored and is not sent. A connection whose model takes it shows it again.
- A chat turn names a dropped control only where the descriptor states it (`announcesWarning` in `packages/contracts/src/inference/warnings.ts`). Conflict, clamp and downgrade warnings are always announced.
- With no chat connection, no model-fed control renders. The no-model notice and its Connections door stand in their place.
- A fact the route decides rather than the model is stamped onto the descriptor after synthesis (`markRouteFacts` in `packages/inference/src/capability/floor.ts`): `reasoning.seedable`, `contextCompression` and the agent-sdk wire's missing parallel tool control.

The anth-direct clause shares D67's purge, noted with D121: `ANTH_DIRECT_SAMPLING` has zero declarations on the tree. Treat it as design-of-record, not built. Direct-transport per-model Claude sampling is fail-closed: the `ANTH_DIRECT_SAMPLING` table ships empty until a live probe validates each model's honored set. Absence means the knob does not render; never guess a default.

## Consequences

- A new preset control joins `CAPABILITY_KNOBS` and names its descriptor fact, or `tsc` fails at `statesKnob`.
- A preset shared across connections keeps every value, and each connection shows only what it can apply.

## Alternatives rejected

- Show an unsupported control with a marker or a "not honored" list: the owner ruled it confuses users.
- Disable an unsupported control in place: a disabled control still says the setting exists for this model.
