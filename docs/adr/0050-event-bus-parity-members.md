---
kind: adr
status: active
updated: 2026-09-23
---

# Event bus parity members

## Context

SillyTavern scripts and extensions hook its `event_types` set. Automation triggers and the plugin host subscribe to `ChatBusEvent` and `DomainEvent`, so those unions must cover what these layers need. Both unions are closed and carry ids only. A subscriber re-reads canon by id. Some SillyTavern hooks are not events: they receive the prompt, then rewrite it or abort the turn before send.

## Decision

Event-bus parity: the `ChatBusEvent` union includes `chatOpened` (subscription-synthesized per-viewer, never logged), `worldInfoActivated {entryIds}` (emitted by assembly), and `turnStarted.speakerCharacterId`. ST macros are NOT event-driven — macro parity is entirely `kit/macro`. NO deletion events: derived-row eviction is FK `ON DELETE CASCADE` physics, never a racy bus duplicate. **Prompt mutation is NOT a bus event:** anything that rewrites/aborts a turn (ST's interceptors) belongs to `kit/injection` + the assembly pipeline + D46 actions; a synchronous transform would be an ordered `PromptTransform` pipeline step — never a subscription.

## Consequences

The bus-payload allowlist makes a mutable prompt buffer unrepresentable on the bus. Automation and plugins change a draft only through the transform registry (`packages/server/src/domain/chat/substrate/prompt-transforms.ts`, applied in the assembly pipeline at the points named in `PROMPT_TRANSFORM_POINTS`). Chat owns the order and the deadline. A transform that throws or times out is skipped with a warning, and the draft passes through unchanged. Homes: `packages/contracts/src/chat/bus.ts` and `packages/server/src/domain/chat/substrate/prompt-transforms.ts`.

## Alternatives rejected

- Interceptor events with a mutable payload. A bus subscriber runs after the prompt ships, and a fire-and-forget subscriber cannot block or rewrite a turn.
- `character.deleted` and `asset.deleted` events. The FK cascade already removes derived rows, so an event would be a racy duplicate.
