---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: contracts
plan: unwired-code
---

# Result and view types drop the fields no reader takes

## What

No production reader takes GenerationUsageProjection.knownSubtotal, WireSchemaCheck.fits (derivable from violations), RollDiceResult.notation, modifier and total (the client reads stamp and rolls), MemberCardView\.avatarAssetId (the viewer reads avatarHash), GenerationProvenance.generationId and assetId, RuleView\.chatId, OwnerStatsView\.computedAt (the overview reads StatsFreshness), QueuedIngest.workloadId, the group-level character of rpgRevealViewSchema.standingLies, refinerySchemaSummarySchema.stage, GalleryItemView assetId and subjectCharacterId, ActionTemplatesPreview identity.char and its schema twin, importedCardSchema.importHash, promoteActorResultSchema.issues, invitePreviewSchema.chatId, inviteViewSchema.chatId, messageWindowSchema.endMessageId, UnmatchedStrikeView\.tier and its schema twin, FireView\.chatId, ViolationOrigin.shape and RenderStat.lastMs.

## Why

Unread fields read as promises, and tests that read them prove nothing about the product.

## Done when

Each field leaves its type, schema, writers and comments after ast-grep in both TypeScript languages finds no reader; tests that read a removed field read the production source instead; affected suites and typecheck worlds pass.

## Evidence

Filled at landing: what ran and where its output is.
