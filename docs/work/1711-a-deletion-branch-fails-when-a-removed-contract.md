---
kind: tooling
status: doing
updated: 2026-11-09
priority: P3
area: tooling
lane: wt/agent-a35900a98110deadf
plan: unwired-code
---

# A deletion branch fails when a removed contract key still has literal hits in the client, plugins or e2e

## What

Add a check on a deletion branch that fails when a removed contract key still has a literal hit in the client, the plugins or the e2e tests.

## Why

A deleted tRPC input key strips silently under z.object, so a sender that still passes it keeps working until the value is needed. The Evidence below holds the manual sweep this check automates.

## Done when

The check runs on a branch that removes a contract key. It fails on a planted literal hit in each of the client, the showcase plugins and the e2e tests, and passes on a branch with none.

## Evidence

Sweep of the landed deletions that this check automates, run before the check exists:

- Scope: every removed `key:` line in the merges that deleted contract keys (items 1426, 1498, 1502, 0501, 1520, 1567 to 1584), plus the unmerged branch that deleted the wire keys of items 1556, 1572 and 1699, and every removed non-comment line under `packages/server/src/transport` and `packages/contracts`.
- Method: a literal `rg -w` per key across `packages/client`, `packages/showcase-plugins`, `packages/plugin-sdk`, `tests/e2e`, `tests/client`, `packages/server`, `scripts` and `tooling`. Common names (`size`, `model`, `text`, `kind`, `query`) were narrowed by reading the procedure, not by count.
- Result: no router input schema lost a key. Every removed output key and task-enum member has no live reader or sender. The `agent` provider task left the enum, and stored rows and manifests still parse through `storedProviderDefSchema` and `storedPluginManifestSchema`. No restore was needed.
- Not read per reader: server-internal service params and results that no router `.input` or `.output` names.
- The branch was unmerged at the sweep. Re-run the sweep if its contracts change before merge.

Pre-merge sweep of client hook arguments and component props:

Each branch was diffed against main with `git diff main...<branch>`. Its sender trees (`packages/client/src`, `packages/server/src`, `packages/showcase-plugins`, `packages/plugin-sdk`, `tests/e2e`, `tests/client`, `tests/support`, `tooling/src`, `scripts`) were extracted from the branch with `git archive` and scanned there, so the scan sees the branch's callers and not main's. Scans use `ast-grep scan` rules for an object pair or shorthand named `<key>` and for a JSX element named `<Component>` carrying the attribute or any spread; each run printed its scanned-file count for `ts` and `tsx` (about 890 ts and 1140 tsx files for client plus tests). A positive control per rule (a known present pair and a known present attribute) matched before any zero was trusted. Router input hunks were read in full.

#### `wt/agent-a45e39633acdff17b` (1534-1544, 1585-1592)

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

#### `wt/agent-a4fe85caeff9b0766` (1545-1555)

No wire file changed. Removed members are client-internal. The shared bound-field props (`label`, `description`, `hint`, `disabled`) move into `BoundFieldShellProps` and each field props interface extends it. `RunWorkloadFormValues` and `CreateScheduleFormValues` extend `WorkloadRunValues`, which keeps `force`, `dryRun`, `k` and `source`. `DefaultPresetPatchVars` and the regex bulk argument types derive from router input. Pair scans for `listSearch`, `chatContextContributors`, `chatContextRegions`, `outputOver`, `inputOver`, `updateCallbackDone` found nothing live; the `listSearch: "required"` hits belong to `SectionContribution` in `state/section-registry.ts:101`, not the removed `CorpusModeContribution` member. `rewriteRunId` hits are mutation arguments that read `armedRewriteId` and `lanes.rewriteRun`, not the removed lane field.

Result: no live sender.

#### `wt/agent-aa35e6225d896019a` (1593-1611)

No wire file changed. One input option is gone: `useSendMessage({ intent })` no longer forwards `intent` to `chat.send`. No caller passes it (`useSendMessage` is called at `chat-controls-band.tsx:399`, `choice-send-provider.tsx:33` and `composer.tsx:120`, none with `intent`; the one `intent: "send"` pair at `tests/client/.../_message-reasoning-and-move-stories.tsx:18` is a `beginTurn` argument). The router still accepts `intent` on `chat.send`, so the server input has no client sender after this merge; that is a deletion candidate, not a break.

JSX prop scan, `<Component key>` and spread, over 844 tsx files: `BackgroundSourceField.readOnly`, `CharacterPicker.leadingGroup`, `EntryListEditor.removeDescription` and `renderRowAction`, `FormSubmitButton.cancelLabel`, `TagPickerDialog.placeholder`, `TopbarIconButton.pressed`, `GhostMessageRow.renderContext` and `rowCharacterId`, `MessageEditTextarea.onSave`, `AdminOverrideSelect.disabled`, `ParamSelect.testId`. Zero carriers and zero spreads on every element. Controls: `TopbarIconButton label` matched 3, `MessageEditTextarea message` matched 1. Argument keys `imageUrlFor`, `readDefined`, `ariaLabel`, `exemptions`, `classified`, `framing`, `cap` have no live pair (the `cap` hits are test measurement objects).

Result: no live sender.

#### `wt/agent-ad34dff486c0950c2` (1612+)

Wire-side files: `contracts/src/inference/wire-limits.ts` drops the `strictTools` parameter (default 0, no caller passed it), `contracts/src/rpg/actor.ts` drops the `maxLength` parameter of `clampActorCardName`, `contracts/src/rpg/extraction.ts` and `refinery/schema-forge.ts` drop internal parameters. `routers/automation.ts` changed comments only; `testRule` never exposed `sampleEvent`, and `sampleEvent` has no pair in 3155 ts and 871 tsx files. `GcOptions.graceMs` has no pair in 3872 ts and 945 tsx files.

One spread to note: `rpg/tools/rounds/round-connection.ts:38` and `chat/verbs/runtime-inference.ts:120` spread `onObservedResult` into a chat request and into role-client `structured` options. `onObservedResult` was removed from `StructuredChatInput` only. Both writers target types that keep it (`ChatRequest` at `inference/src/contract/chat.ts:148` and the role-client options at `contract/roles.ts:99`), and the two `runStructuredChat` callers pass no observer, so observation still rides the wrapped executor.

Result: no live sender.

#### `wt/agent-a3ef409cf77e7c246` (1696)

Eight `ServicesResult` fields removed (`presence`, `eventBus`, `characterSeeder`, `personaSeeder`, `rpgChatOps`, `cas`, `crossFeatureOps`, `toolUse`). No router or wire change. Scan of server, tests, tooling and scripts (3118 ts and 397 tsx files) found no reader of the composed result; remaining hits are the compose graph's own internal wiring and unrelated `presence` names.

Result: no live sender.

#### Not covered in this pass

- About 150 removed names in the four client branches were reviewed by hunk, not by per-name scan, where the removal was a type derivation or a prop hoisted into a shared interface.
- Typecheck and tests of these branches were not run here; the sweep reads callers only.

Landing evidence: filled at landing.
