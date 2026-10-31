---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: server
plan: unwired-code
---

# Unwired 1567-1584 review leftovers: revokeUserSessions count, six stale comments, dead state (AutoModeStopReason, hubDropped, themes owners, relinkCarriedBooks skipped, ImageGenerateRequest owner/systemPrompt, PluginEventBus subscriberSlug, PlaneDiffRenderer plane), rebuildFromTree wire-or-delete, refreshCatalog cancellation

## What

Close the leftovers the 1567-1584 field review found.

- Test the audit row's `{ revoked: N }` for `revokeUserSessions`.
- Fix the stale comments at `packages/server/src/domain/chat/verbs/turn.ts` (the arbitration stop), `packages/server/src/domain/chat/engine/auto-mode.ts` (the stop reason), `packages/server/src/domain/automation/contract/analysis.ts` (`RuleStateRead`), `packages/server/src/domain/discovery/persistence/message-reads.ts` (the selected columns), `packages/server/src/domain/chat/contract/memory.ts` (`MemoryPassCounts`) and `packages/server/src/domain/assets/contract/maintenance.ts` (an empty section header).
- Remove the dead state: `AutoModeStopReason`, `hubDropped` in `cooccurrence/generate.ts`, `owners` in `themes/generate.ts`, `skipped` from `relinkCarriedBooks`, `ImageGenerateRequest.owner`, `PluginEventBus.register.subscriberSlug` and `PlaneDiffRenderer.plane`.
- Decide `ImageGenerateRequest.systemPrompt`, `rebuildFromTree`, `refreshCatalog` cancellation, `SuggestionCardDetail.kind` and `ConfirmSuggestionResult`.

## Why

Each removed value is written and never read, and each comment describes code that changed. The audit count is the only record of how many sessions an admin kick ended, and no test pins it.

## Done when

The dead state is gone and the typecheck passes on every world. The stale comments match the code. A test fails when the audit row's count is wrong. Each decision above is recorded in Evidence.

## Evidence

Applied:

- `AutoModeStopReason` and its tuple are gone. `step` returns `done: true`, because the loop only tested `"done" in r` and never read the reason.
- `normalizeOwner` returns the digests alone; `hubDropped` had no reader. `buildDrafts` returns the drafts alone; `owners` had no reader.
- `relinkCarriedBooks` returns the linked count; `skipped` had no reader (the world-info op still returns it).
- `ImageGenerateRequest.owner` is gone. `PluginEventBus.register` no longer takes `subscriberSlug`; the bus factory never read it. `PlaneDiffRenderer.plane` and its ten literals are gone.
- The new test in `tests/server/domain/admin/persistence/revoke-sessions-audit.int.test.ts` reads the `admin.revokeUserSessions` audit rows after two kicks and expects `{ revoked: 2 }` then `{ revoked: 0 }`. It pins existing behaviour, so it passes on the old code. With the verb temporarily writing `revoked + 1` it fails (1 failed); with the verb restored it passes.

Decided:

- `ImageGenerateRequest.systemPrompt` stays. The OpenAI-compatible and Google image backends read it. Nothing in the server writes it, so a caller that wants a system prompt for image generation would have to add the write; no one has asked for one.
- `rebuildFromTree` stays. Item 1525 (`docs/work/1525-add-the-admin-rebuild-asset-index-action.md`, open) wires it to an admin action.
- `refreshCatalog` cancellation is not built. The verb never honoured a signal, and no user asked for cancellation.
- `SuggestionCardDetail.kind` stays. Nothing reads it, but it is a bus-event field with a single member kept as a union seam, and only a code comment records that decision. It needs an owner call.
- `ConfirmSuggestionResult.ran` and `.outcome` stay. Only test files read them (`tests/server/domain/automation/engine/dispatch.int.test.ts:106`, `tests/support/node/factories/execution-outputs.int.test.ts:170`, `:219`, and the contract test), and they are how those tests tell the stashed-arm run from a fresh run. Making the verb void means rewriting those assertions to read the fire rows. It needs an owner call.
