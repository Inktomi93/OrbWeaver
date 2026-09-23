---
kind: adr
status: active
updated: 2026-09-23
---

# A refinery session is a workspace over an append-only run log

## Context

Refinery rewrites a character card through model-authored stages. The owner ruled how a session relates to the live card: users may empty fields, walk back through phases, rounds and card versions, save the result as a copy, and the live card is not written while they work.

## Decision

Every run of every stage is an immutable row; the latest run per stage is a read rule, not a pointer. Consuming verbs take an optional explicit run id, so stepping back means analyzing or applying against an earlier run, and `refinery_runs.source_run_id` records the run each run consumed. Emptying a field is an explicit `cleared: true` rewrite entry, never an empty string; clearing a greeting removes the slot, the verb remaps the session's greeting indexes, and the first greeting cannot be removed when it is the last one. The live card's authored content is written once, at the terminal act: `applyFields` (snapshot first) or `applyAsCopy`, which creates a new character on the duplicate chassis. Score and analysis signal stamps may update mid-session, because they are metadata about the card. A field that changed on the live card since the session pin is a conflict: apply drops it as `diverged_since_session` unless the user re-confirms it.

## Consequences

No run row is copied or deleted to revert. A cleared entry passes the same selection and applicability checks as a text entry, and its accept control says that it empties the field.

## Alternatives rejected

- An empty string as the clear signal: ambiguous with a model that emitted nothing, and it changes the projected wire grammar.
- A mutable current-run pointer or revert copies: both break append-only history.
- Write the card as the session goes: the session is a draft; the live card changes only at the terminal act.
- Defer signal stamps to the terminal act: score readouts would be stale during the sessions that produce scores.
- Silently overwrite a field edited on the live card: the pin makes divergence detectable, so the user decides.
