---
kind: adr
status: active
updated: 2026-09-23
---

# User-macro input values are per chat, and draws are a generation record

## Context

User macros need per-turn input values and random draws that a swipe must replay. Three homes were possible for each, and the macro registry had to reach both prompt assembly and the engine's receive side.

## Decision

Input values live per chat in `chats.variableValues`, written by the member-gated `setVariables` verb that already stores choice-block picks. The draws a generation used live in `message_variants.macro_draws`, a typed column with a zod read schema; a swipe re-persists the replayed draws plus any fresh ones, and reads target the selected variant. The turn's macro registry is built once in `buildTurnContext` and passed explicitly through the turn plumbing, defaulting to the global registry. The volatile-name cache is per registry, so a volatile user macro busts the static-section cache.

## Consequences

`ForeignInputs` carries no user-macro values field. User macros in user-authored text resolve at commit through the freeze registry; identity macros stay raw.

## Alternatives rejected

- Per-user values in user settings through `ForeignInputs`: loses per-room values and adds a second pick store.
- Fold draws into `variable_delta`: that column is an operation log with its own parser and fold.
- Fold draws into variant `metadata`: an open blob with no typed read.
- A column on `messages`: generation inputs belong to the variant, not the slot.
- The registry on `AssembleContext`: that shape is serializable and client-imported.
- A module-level current registry: unsafe across interleaved turns.
- A `WeakMap` side channel: invisible to the type system.
