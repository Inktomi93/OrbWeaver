---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: server
plan: unwired-code
---

# Round nine cleanup: unread fields, never-set flags and test-only fields

## What

The hand review and the reconcile of items 1557 to 1561 and 1564 found fields with no production reader. Never set: WireMeta.cacheBreakpoint and its two backend branches, superseded by cacheBreakpointDepth. Unread: FoldResult.via, BackendDef.serves, EmbedOnceArgs.call, TurnStreamContext.resumed, TurnWriteInput.turn.variantId, ForkGameResult.cloned, WriteHubScoresResult.rowsUpdated, BarListItem.id, SelectOpeningRequest.event, CollectedCard.handle, GreetingText.characterId on the regex bound, ExtractedPrompt.mode, ExtractionPromptContext.refs, DeferredResult.deferred, ChartColors.area, ThemeCarrierObservable.lifecycle, ListRow subtitleDecorative, the empty CharacterDetail contribution seam, ChatSettingsSectionContribution.anchor, BulkImportPersonasResult.personasMerged, ParticipantView\.joinedAt, TurnOrigin.initiator, costDetailsSchema.totalUsd, and EffectiveRegexEntry, whose array the client reads only for its length. Test-only readers whose fact production already holds: EffectivePreset.presetId, EntryView\.worldBookId, RpgCheckpointView\.snapshotId, RpgTurnToolCallsView\.messageId, RpgGameView\.chatId, CreateGameResult.gameId, the redeem participant, ApplyFieldsResult.character, ContextFitPreview\.droppedCount, PruneUnusedResult.removed, refinery run sessionId, SandboxFrame complete. Test seams: CorpusHit.blockKeys, AuthedComposition.configGroups, MatchedKey.matchedLatestUserMessage, PortableEntity.ext, MediaGrid className. ResolvedEmbedKnobs.warnings is dropped at role-clients.ts. The reconcile reports in reports/unwired hold the per-row judgements of the uncovered October rows.

## Why

Unread fields read as live wiring, a never-set flag hides which cache mechanism runs, and a test that reads a field production ignores proves nothing about the product.

## Done when

Each listed field leaves its type, schema, writers and comments after the lane confirms no reader with ast-grep in both TypeScript languages; costDetails.totalUsd turns optional instead because rows store it; EffectiveRegexEntry becomes a count; each test that read a removed field reads the production source instead; the embed warning is logged by code; each uncovered October row in the reconcile reports is applied or recorded as kept; the typed fields scan reruns after 3746 before any uncovered delete lands; affected suites and CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
