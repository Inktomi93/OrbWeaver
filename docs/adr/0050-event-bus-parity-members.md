---
kind: adr
status: active
updated: 2026-09-23
---

# Event bus parity members

## Context

Not recorded in the ledger row.

## Decision

Event-bus parity: the `ChatBusEvent` union includes `chatOpened` (subscription-synthesized per-viewer, never logged), `worldInfoActivated {entryIds}` (emitted by assembly), and `turnStarted.speakerCharacterId`. ST macros are NOT event-driven — macro parity is entirely `kit/macro`. NO deletion events: derived-row eviction is FK `ON DELETE CASCADE` physics, never a racy bus duplicate. **Prompt mutation is NOT a bus event:** anything that rewrites/aborts a turn (ST's interceptors) belongs to `kit/injection` + the assembly pipeline + D46 actions; a synchronous transform would be an ordered `PromptTransform` pipeline step — never a subscription.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
