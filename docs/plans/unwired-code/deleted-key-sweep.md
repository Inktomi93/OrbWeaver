---
kind: plan
status: done
updated: 2026-10-31
---

# Deleted-key sweep

Result: no live sender of a deleted input key, no restores. The inputs are lenient, so a deleted key would strip silently; none was deleted.

## What was scanned

- Ranges: merges 671f628c46 (1567-1575), 55e62cd255 (1576-1584), 83743b343f (1498, 1502, 0501), 62cce76e51 (1426), 599a4df866 (1520), and branch `wt/agent-a18d2f5789fb50b41` against main (1556, 1572 wire deletes, 1699). 6 ranges, 185 non-test, non-`.d.ts` files under `packages/`.
- Key list: every `-` line shaped `key:` in those diffs, 182 unique names over 263 rows. A second pass listed every removed non-comment line under `packages/server/src/transport` and `packages/contracts` (22 files).
- Literal `rg -w` counts per key across `packages/client`, `packages/showcase-plugins`, `packages/plugin-sdk`, `tests/e2e`, `tests/client`, `packages/server`, `scripts` and `tooling`. Common names (`size`, `model`, `text`, `kind`, `query`) were narrowed by procedure, not trusted by count.
- Excluded: test files, `dist`, `.d.ts`, `node_modules`. Server-internal domain contracts (service params and results that no router returns) were only checked for a router edge, not for readers.

## Input schemas touched

| Procedure | Schema | Lenient or strict | Key removed |
| - | - | - | - |
| `admin.restart` | `z.object` | lenient | none: `confirm` stays in the input, only the service param lost it |
| `admin.revokeUserSessions` | `z.object` | lenient | none (its `.output` was removed) |
| `connection.refreshCatalog` | `z.object` | lenient | none (`signal` is a context value, not a key) |
| `plugin.previewFromUrl`, `previewFromGit` | `z.object` | lenient | none (`caller` is `ctx.auth`, not wire) |
| `provider` and manifest `serves` | `providerDefSchema` | lenient | `"agent"` removed from the task enum; stored rows and manifests parse through `storedProviderDefSchema` / `storedPluginManifestSchema` |

No router input schema lost a key in any range.

## Removed keys that cross the wire

| Key | Removed in | Live sender / reader | Action |
| - | - | - | - |
| `agent` task, `serves: ["agent"]` | 83743b343f | No. `rg` for the quoted literal across client, showcase-plugins, plugin-sdk, tests/e2e, tests/client, scripts: one hit, a comment in `packages/client/src/features/user-admin/components/admin-link-sso-section.tsx:48`. `serves` has zero hits in showcase-plugins, plugin-sdk, e2e | none; stored data keeps loading |
| `peekPrompt`, `previewSection`, `SectionPreview` (`rendered`, `half`, `trace`) | 83743b343f | No. The router comment says both were never exposed; zero hits in every scanned tree | none |
| `revokeUserSessions` output `revoked` | 671f628c46 | No. `packages/client/src/features/user-admin/hooks/use-admin-mutations.ts:61` types the result `unknown`; no read of `.revoked` | none |
| `ChatId` stream `memberBounds` gate (1520) | 599a4df866 | Server-only | none |
| `StoredAsset.size` | branch | No. `packages/client/src/data/upload-asset.ts:57` parses with `storedAssetSchema`; no `.size` read on a stored asset | none |
| `GalleryItemView.mime` | branch | No. `use-character-gallery.ts` and `character-gallery-dialog.tsx` have no `mime` or `updatedAt` | none |
| `GlobalVariableView.updatedAt` | branch | No. Zero client, plugin or e2e hits for the view | none |
| bulk tag failure `id`, `error.code` | branch | No. `packages/client/src/features/character/lib/character-refusal-notice.ts:84` reads `failed[0].error.message` only | none |
| `CharacterDetail.synthetic` | branch | No. No read off a character in client or e2e (the other `synthetic` hits are prose) | none |
| `CharacterSummary.forbidExternalMedia`, `trustHtml`, `backgroundOverride` | branch | No. The client reads them from `CharacterDetail` (`character-hero-band.tsx:44`, `character-appearance-tab.tsx:103`, `use-character-mutations.ts:49-57` patches the `character.get` cache, which still has them) | none |
| `GeneratedGreeting.costUsd` | branch | No. `greeting-studio.tsx` is the only reader; no `costUsd` there (the other client `costUsd` hits belong to stats, discovery and imagery results) | none |
| `SnapshotRef.characterId`, `createdAt` | branch | No. `context-tabs.tsx:360` sends `snapshotId` and `characterId` as input, which are unchanged | none |
| `ConnectionCapabilityView.cacheContext`, `warnings` | branch | No. Zero client, plugin or e2e hits | none |

The output schemas in these rows are strict objects (gallery, bulk tag failure, greeting, snapshot ref, capability view) or `z.object` parsed on the client (stored asset, character detail and summary). A stale server field fails a strict parse loudly; a client read of a removed key would be a type error, and the casts above were checked by hand.

## Not decided or not covered

- The remaining ~150 names are server-internal service params and results (import, embeddings, discovery, assets maintenance, search, rpg, imagery, automation). No router in the scoped ranges changed for them, and none appears in a router `.input` or `.output`. They were counted, not read per reader.
- 1426 moved `WARNING_CODES` and the auth example env rows to named constants; the 21 warning code strings match before and after.
- The branch is unmerged. Re-run this sweep if its contracts change before merge.

## Pre-merge sweep: client hook arguments and component props

Each branch was diffed against main with `git diff main...<branch>`. Its sender trees (`packages/client/src`, `packages/server/src`, `packages/showcase-plugins`, `packages/plugin-sdk`, `tests/e2e`, `tests/client`, `tests/support`, `tooling/src`, `scripts`) were extracted from the branch with `git archive` and scanned there, so the scan sees the branch's callers and not main's. Scans use `ast-grep scan` rules for an object pair or shorthand named `<key>` and for a JSX element named `<Component>` carrying the attribute or any spread; each run printed its scanned-file count for `ts` and `tsx` (about 890 ts and 1140 tsx files for client plus tests). A positive control per rule (a known present pair and a known present attribute) matched before any zero was trusted. Router input hunks were read in full.

### `wt/agent-a45e39633acdff17b` (1534-1544, 1585-1592)

Router input keys removed, all on lenient `z.object`:

| Procedure | Key | Live sender | Action |
| - | - | - | - |
| `chat.commitMessage` | `blocks` | No. `use-composer-utilities.ts` sends `{chatId, content, timeZone}`; every `commitMessage` call in `tests/e2e` omits it; `blocks` pair scan over chat, e2e and support: 0 of 648 ts and 197 tsx | none |
| `credentials.markRevokedByUser` | `reason` | No. `credential-key-row.tsx:151` sends `{credentialId}` only; `reason` pairs in credentials are UI sentences | none |
| `discovery.browseCharacters` | `q` | No. `corpus-browse-view.tsx:79-82` builds genre, tone, tag, sort; `q` pair scan 0 of 531 ts and 64 tsx | none |
| `discovery.cooccurringKeywords` | `limit` | No. `corpus-home-charts.tsx:146` sends `{keyword}`; the `limit` pairs in discovery belong to `characterKeywords` and `similarChats` | none |
| `imagery.editImage` | `size` | No. `image-edit-body.tsx:72` sends `{sourceAssetId, instruction, chatId}`; `tests/support/node/corpus-image-variants.ts:288` is typed by `TrpcInput<"imagery.editImage">` | none |
| `preset.update` | `kind` | No. `use-preset-autosave.ts:157-174` and `preset-editor-surface.tsx:234` send id, config, name, fork; the `kind: NEW_PRESET_KIND` pairs feed `preset.create`, which keeps `kind` | none |

Other removals: `RateLimitDecision.type`, `RoomArgs.multiHumanCapable` and `RunSocketArgs.multiHumanCapable` are server-internal and their only constructors are in the same diff. `sizePresetSchema` lost its export, with one router import also removed. About 35 client mutation hooks swap a hand-written `…Vars` interface for `inferInput<Trpc[…][…]>`; that cannot drop a key the router accepts.

Result: no live sender.

### `wt/agent-a4fe85caeff9b0766` (1545-1555)

No wire file changed. Removed members are client-internal. The shared bound-field props (`label`, `description`, `hint`, `disabled`) move into `BoundFieldShellProps` and each field props interface extends it. `RunWorkloadFormValues` and `CreateScheduleFormValues` extend `WorkloadRunValues`, which keeps `force`, `dryRun`, `k` and `source`. `DefaultPresetPatchVars` and the regex bulk argument types derive from router input. Pair scans for `listSearch`, `chatContextContributors`, `chatContextRegions`, `outputOver`, `inputOver`, `updateCallbackDone` found nothing live; the `listSearch: "required"` hits belong to `SectionContribution` in `state/section-registry.ts:101`, not the removed `CorpusModeContribution` member. `rewriteRunId` hits are mutation arguments that read `armedRewriteId` and `lanes.rewriteRun`, not the removed lane field.

Result: no live sender.

### `wt/agent-aa35e6225d896019a` (1593-1611)

No wire file changed. One input option is gone: `useSendMessage({ intent })` no longer forwards `intent` to `chat.send`. No caller passes it (`useSendMessage` is called at `chat-controls-band.tsx:399`, `choice-send-provider.tsx:33` and `composer.tsx:120`, none with `intent`; the one `intent: "send"` pair at `tests/client/.../_message-reasoning-and-move-stories.tsx:18` is a `beginTurn` argument). The router still accepts `intent` on `chat.send`, so the server input has no client sender after this merge; that is a deletion candidate, not a break.

JSX prop scan, `<Component key>` and spread, over 844 tsx files: `BackgroundSourceField.readOnly`, `CharacterPicker.leadingGroup`, `EntryListEditor.removeDescription` and `renderRowAction`, `FormSubmitButton.cancelLabel`, `TagPickerDialog.placeholder`, `TopbarIconButton.pressed`, `GhostMessageRow.renderContext` and `rowCharacterId`, `MessageEditTextarea.onSave`, `AdminOverrideSelect.disabled`, `ParamSelect.testId`. Zero carriers and zero spreads on every element. Controls: `TopbarIconButton label` matched 3, `MessageEditTextarea message` matched 1. Argument keys `imageUrlFor`, `readDefined`, `ariaLabel`, `exemptions`, `classified`, `framing`, `cap` have no live pair (the `cap` hits are test measurement objects).

Result: no live sender.

### `wt/agent-ad34dff486c0950c2` (1612+)

Wire-side files: `contracts/src/inference/wire-limits.ts` drops the `strictTools` parameter (default 0, no caller passed it), `contracts/src/rpg/actor.ts` drops the `maxLength` parameter of `clampActorCardName`, `contracts/src/rpg/extraction.ts` and `refinery/schema-forge.ts` drop internal parameters. `routers/automation.ts` changed comments only; `testRule` never exposed `sampleEvent`, and `sampleEvent` has no pair in 3155 ts and 871 tsx files. `GcOptions.graceMs` has no pair in 3872 ts and 945 tsx files.

One spread to note: `rpg/tools/rounds/round-connection.ts:38` and `chat/verbs/runtime-inference.ts:120` spread `onObservedResult` into a chat request and into role-client `structured` options. `onObservedResult` was removed from `StructuredChatInput` only. Both writers target types that keep it (`ChatRequest` at `inference/src/contract/chat.ts:148` and the role-client options at `contract/roles.ts:99`), and the two `runStructuredChat` callers pass no observer, so observation still rides the wrapped executor.

Result: no live sender.

### `wt/agent-a3ef409cf77e7c246` (1696)

Eight `ServicesResult` fields removed (`presence`, `eventBus`, `characterSeeder`, `personaSeeder`, `rpgChatOps`, `cas`, `crossFeatureOps`, `toolUse`). No router or wire change. Scan of server, tests, tooling and scripts (3118 ts and 397 tsx files) found no reader of the composed result; remaining hits are the compose graph's own internal wiring and unrelated `presence` names.

Result: no live sender.

### Not covered in this pass

- About 150 removed names in the four client branches were reviewed by hunk, not by per-name scan, where the removal was a type derivation or a prop hoisted into a shared interface.
- Typecheck and tests of these branches were not run here; the sweep reads callers only.
