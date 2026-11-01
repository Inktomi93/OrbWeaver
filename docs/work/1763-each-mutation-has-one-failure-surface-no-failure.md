---
kind: bug
status: open
updated: 2026-11-01
priority: P2
area: client
plan: cross-surface-consistency
---

# Each mutation has one failure surface: no failure shown twice, none shown nowhere

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

The rule (`docs/law/client-architecture-state-and-gates.md` §10, item 5 "Toasts"): the factory toast is a mutation's one failure message. A persistent mark that reads `error` carries state only. A consumer that renders its own text drops `meta.errorToast`.

Survey before the fixes, from the ui-facts feedback cohort: 318 entity-mutation hooks with 402 consumer sites. Failure surface per consumer: toast only 352, toast and an inline read 24, nothing 16, inline only 10.

### Fixed

| hook | consumer that renders the text | change |
| - | - | - |
| useUpdateAppOverrides (six sections) | AdminOverrideResetRow | factory toast dropped |
| useCreateUser, useLinkSsoIdentity, useResetPassword | the admin dialogs | factory toast dropped |
| useStartWorkload, useCreateSchedule, useUpdateSchedule | the run and schedule dialogs | factory toast dropped |
| useCreateRefinerySchema, useUpdateRefinerySchema | the schema editor's RefusalNote | factory toast dropped |
| useAttachDocumentToCharacter, useDetachDocumentFromCharacter | the attachments row with its retry | factory toast dropped |
| useDraftCatalogModels | the model picker's listing | factory toast dropped |
| useAttachBookToChat, useAttachDocumentToChat, useAttachScriptToChat | the attach pickers | factory toast dropped |
| useCreateRule, useUpdateRule | the rule editor beside the autosave status | factory toast dropped |
| useCreateCharacter | the New-character dialog, for a coded refusal | the toast answers `null` for a coded refusal and still toasts any other failure |
| useCreatePersona, useUpdatePersona, useSetPersonaSeed | the first-run dialog's own `notify.error` | the dialog passes `failureShownInline: true` |

Already one surface, so unchanged: useUpdateLibrary and useSetMemoryEnabled (the save-status mark carries state, the toast carries the message), and useSetUserMacroValues, useRecomputeStats, useStartSharing and useEnableIpCertificate (the toast answers `null` for the coded failure the consumer says).

Red-first samples, one per shape:

- Consumer text plus a factory toast: `tests/client/features/chat/components/chat-attach-pickers.ct.tsx`, "a refused attach is said once" (three matches on the old source, one after).
- Consumer toast plus a factory toast: `tests/client/features/persona/anchors/first-run-persona-dialog.ct.tsx`, "a refused create says so once" (two toasts on the old source, one after).
- Scanner shapes (state mark, a toast that answers `null`, a catch that sets local state): `tests/tooling/ui-facts/composition.test.ts`.

### Scanner

The feedback scanner (`tooling/src/ui-facts/feedback.ts`) now reads a state mark (`saveStateOf`, `useReportSaveStatus`) as state, a function-form toast that can answer `null` as a split, and a `try/catch` or `.catch(...)` or per-call `onError` on the mutation's own call that sets local state or toasts as the consumer's surface. It still cannot follow a failure that reaches the screen through another function.

After the fixes the cohort reads: toast only 336, inline 38, toast and inline 14, nothing 14.

### Still open

Toast and inline, 14 sites the sharper scanner now shows. Several are scanner false positives (the persona-list create catch does nothing by its own comment); none is read yet: useAbortMutation, useImportRegexScriptFile, useCancelWorkload, useImportWorldBookFile, useConfirmSuggestion and useDismissSuggestion, useUpdateCharacter in character-hero-band, useImportThemeFile, useImportPersonaFile, useCreatePreset, labels-suggestions (three), useEmbedCharacterCard.

Nothing, 14 sites. Documented as deliberate in the hook or its consumer: useReapHuskMutation, useReapTemporaryChats (janitor, never retried), useReportUiCrash (telemetry), useMarkAllNotificationsRead (the unread dot stays lit), useAddToGallery (two) and useRemoveFromGallery, usePreviewInvite, usePruneUnusedTags and useRemoveTag (the confirm dialog shows a failure line), useRollDice (the consumer toasts in a catch the scanner counts only partly). Scanner misses: useCreateRule and useUpdateRule (the failure reaches the rule editor through a queue), useDraftCatalogModels in add-connection-form-body (the listing carries it).
Filled at landing: what ran and where its output is.

- Rule (claude-b, under the owner's delegated direction, on the lane's recommendation): the toast is the one message, a persistent mark is state only, and a consumer that renders its own text drops the factory toast. The law line cites this item.
