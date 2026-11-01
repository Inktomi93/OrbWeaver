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

Survey, from the ui-facts feedback cohort: 318 entity-mutation hooks with 402 consumer sites. Failure surface per consumer: toast only 352, toast and an inline read 24, nothing 16, inline only 10.

### Twice: 24 consumer sites on 20 hooks

The repeated sites are in character-create-actions, library-settings-section, macro-picks-section, memory-settings-section, draft-models-check, databank-character-attachments (two), schema-editor-dialog (two), analytics-overview-surface, the admin dialogs and sections (`useUpdateAppOverrides` across six sections), share-card, share-ip-certificate, create-schedule-dialog (two) and run-workload-dialog. In the six `useUpdateAppOverrides` sections the inline read is `save.error !== null`, which feeds a save-status mark (`useReportSaveStatus`) and an `errored` flag, while the factory toasts "Couldn't save the setting." That is a state mark beside a message, not two messages.

This needs a design call before any fix: when a surface keeps a persistent failed-state mark, does the toast stay as the message, or does the mark carry the message and the factory lose its toast? The answer decides all 24 sites, and `useUpdateAppOverrides` has six consumers sharing one factory.

### Nothing: 16 consumer sites

The scanner reads `.error`, `isError` and `onError` in the consumer. It does not read a `catch` that sets local state, so some of the 16 have a surface it cannot see. Read so far: `useAddToGallery` and `useRemoveFromGallery` state that each caller shows the failure inline or in the confirm dialog; `useReapHuskMutation` and `useCreateInvite` and `usePreviewInvite` document an inline or deliberately silent surface. Not read: useReapTemporaryChats, useMarkAllNotificationsRead, usePreviewPluginFromGit and FromUrl, useReportUiCrash, useRollDice (two), usePruneUnusedTags, useRemoveTag, useRestartServer.

No code changed for this item.
