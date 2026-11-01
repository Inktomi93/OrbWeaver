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

The rule (`docs/law/client-architecture-state-and-gates.md` §10, item 5 "Toasts"): the factory `errorToast` is always the fallback. A consumer that renders a failure in its own text claims it with `failureShownInline`, and the toast stands down only if the failing mutation is the observer's newest, the observer was not reset since, and the claim holds. Every other failure toasts. A failure shown twice is cosmetic; a failure shown nowhere is a defect.

The mechanism: `createEntityMutation` records the newest `mutate` on its observer and clears it on `clearError`, and the global handler in `packages/client/src/data/query-client.ts` asks `failureClaimed(error, mutation)` at failure time. The claim is `true` or a predicate over the error. A hook that outlives its surface passes an open-state predicate: the New-character dialog, the schema editor and the book and document pickers.

Survey before the fixes, from the ui-facts feedback cohort: 318 entity-mutation hooks with 402 consumer sites. Failure surface per consumer: toast only 352, toast and an inline read 24, nothing 16, inline only 10.

### Fixed

Every factory keeps its `errorToast`. These consumers render the failure text and claim it:

| hook | consumer that claims |
| - | - |
| useUpdateAppOverrides (six sections) | AdminOverrideResetRow, which now says the real message |
| useCreateUser, useLinkSsoIdentity, useResetPassword | the admin dialogs |
| useStartWorkload, useCreateSchedule, useUpdateSchedule | the run and schedule dialogs |
| useCreateRefinerySchema, useUpdateRefinerySchema | the schema editor |
| useAttachDocumentToCharacter, useDetachDocumentFromCharacter | the attachments row |
| useDraftCatalogModels | the model picker and the add-connection form |
| useAttachBookToChat, useAttachDocumentToChat, useAttachScriptToChat | the attach pickers |
| useCreateRule, useUpdateRule | the rule editor |
| useCreateCharacter | the New-character dialog, claiming only a coded refusal (a predicate) |
| useCreatePersona, useUpdatePersona, useSetPersonaSeed | the first-run dialog |

Also fixed:

- `form.handleSubmit().catch(...)` in the schedule, run-workload, create-user and https-certificate dialogs no longer adds a second message.
- The inline failure lines are `role="alert"`.
- `AddChatScriptDialog` refuses to close while an attach is in flight, as the book and document pickers do.
- The Links tab and the Overview card are keyed by character, so a failed read does not stick to the next character.

Red-first, on the sources before these fixes:

- A rule edit flushed by Close editor that then fails is toasted: `tests/client/features/automation/components/rule-editor-unmount-failure.ct.tsx`.
- A refused schedule create is said once: `tests/client/features/workloads/components/schedule-create-failure.ct.tsx`.
- A script attach in flight keeps its picker open and says its failure once: `tests/client/features/chat/components/chat-attach-pickers.ct.tsx`.
- A failed read for one character does not stick on the next: `tests/client/features/character/components/platform-context-recovery.suite.ct.tsx`.
- Scanner cases: `tests/tooling/ui-facts/composition.test.ts`.

### Scanner

The feedback scanner (`tooling/src/ui-facts/feedback.ts`) reads a state mark as state, a function-form toast whose returned value can be `null` as a split, a setter that names a failure or a `notify.error` in a `try/catch`, `.catch(...)` or `form.handleSubmit().catch(...)` on the mutation, and a per-call `onError`. A setter such as `setOpen` is not a failure. A call that takes `null` as an argument is not a `null` return. The variant scanner reads a spread with a computed key or a getter as unresolved.

### Open

The new claim also governs the earlier users of `failureShownInline`. `first-model-setup.tsx` and `add-connection-dialog.tsx` hand-roll a notice after close for the Chat binding. That binding is the dialog's own mutation, so the dialog's claim covers it while it is mounted. No test closes either dialog with a write in flight.

The toast and inline sites that were never read are listed in item 1816.
