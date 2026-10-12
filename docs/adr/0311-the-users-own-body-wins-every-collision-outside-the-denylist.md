---
kind: adr
status: active
updated: 2026-10-11
supersedes: docs/adr/0156-customparameters-passthrough-exists-for-endpoints-we-cannot-model.md
---

# The user's own request body wins every collision outside the denylist

## Context

D143 clause (b) and D156 said the modelled param wins when a connection's extras key collides with it. Tier-3b section 10 and the body shaper said the user's body wins. A preset temperature of 0.8 with a custom body temperature of 1.2 had two recorded answers. The owner ruled that the user's custom body wins.

## Decision

This ADR supersedes D156 and amends D143 clause (b); D143 clauses (a) and (c), with (c) as D292 amends it, carry forward unchanged. On a connection that exposes the custom body fields (Custom and the other own-server rows on the openai-compatible transport), the user's body merges last and wins every collision outside the denylist: a modelled param, a preset knob, and every key the body shaper computes. A preset temperature of 0.8 with a custom body temperature of 1.2 sends 1.2. The body is opaque: the app never parses it or maps its keys into app behavior. The denylist BELT_OWNED_BODY_KEYS in packages/contracts/src/inference/features.ts still drops its infra-owned keys with custom_parameters_ignored. Rows with no custom body field keep a fixed extras allowlist that holds no modelled key, so a modelled knob stays the turn's: the openrouter dialect reads only OPENROUTER_EXTRAS_KEYS in backends/openai-compat/body.ts and drops every other key loudly, and the anthropic-messages and google wires read only their own allowlists. Passthrough exists for endpoints we cannot model, never as a second sampling surface for a hosted row. The homes are backends/openai-compat/body.ts (rules 1 and 2) and ollama-native.ts for the native route. The guard is tests/legacy/inference/backends/openai-compat/body.test.ts.

## Consequences

A user who sets a sampler in the custom body gets that value on the wire, even when the preset sets the same knob. The preset editor can show a value the wire does not send for that connection. OpenRouter, Anthropic and Gemini connections keep their modelled sampling surface, and no extras key can take a knob from the turn there.

## Alternatives rejected

Modelled wins on every transport: a user's own server is the user's config, and a key the user typed into its body must reach that server. A body override for the hosted rows: those rows show no body field, and a second sampling surface there is what D156 refused.
