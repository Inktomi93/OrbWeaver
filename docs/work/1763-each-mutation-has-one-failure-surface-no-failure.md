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

The rule (`docs/law/client-architecture-state-and-gates.md` §10, item 5 "Toasts"): every mutation hook keeps its `errorToast`, a consumer keeps its inline text, and a failure may show a toast and inline text together but never shows neither. A persistent mark that reads `error` carries state only.

Survey before the fixes, from the ui-facts feedback cohort: 318 entity-mutation hooks with 402 consumer sites. Failure surface per consumer: toast only 352, toast and an inline read 24, nothing 16, inline only 10.

### Claim tried and dropped

The attempt: let a consumer that renders a failure claim it, so the toast stands down for that failure. Three versions, each refuted by a failure that showed nowhere:

- A claim held for the consumer's mounted lifetime. A refusal after Cancel or after the name was edited, and an older write that failed after a newer one succeeded, showed nothing.
- A claim that also required the failing mutation to be the observer's newest and unreset. It made `mutate` unstable, which fired `refinery.schemaPlan` 2,461 times in one CT run, and the document picker's no-match arm and add-document after switching Source still showed nothing.

The claim needs per-consumer proof forever for a cosmetic gain, so it is deleted. The older `failureShownInline` option went with it: it suppressed the toast for six earlier users, so a failure could still show nothing. `createEntityMutation` takes no such option, every `errorToast` fires, and the earlier users keep their inline text beside the toast. `useAskSchemaPlan` has no `errorToast`, so its plan line stays the only surface for an advisory ask.

### Fixed

- Every hook keeps its `errorToast`, including `useAddCredentialOwned`. A consumer that renders the text keeps it.
- `form.handleSubmit().catch(...)` in the schedule, run-workload, create-user and https-certificate dialogs no longer adds a second message; the rethrow is swallowed on purpose, with the reason beside it.
- `AdminOverrideResetRow` says the real failure.
- The inline failure lines are `role="alert"`.
- `AddChatScriptDialog` refuses to close while an attach is in flight, as the book and document pickers do.
- The Links tab and the Overview card are keyed by character, so a failed read does not stick to the next character.
- Stale comments about the toast and the inline line were updated.

### Tests

Each asserts that the failure is visible at least once.

- A rule edit flushed by Close editor that then fails: `tests/client/features/automation/components/rule-editor-unmount-failure.ct.tsx` (red on the sources that dropped the toast).
- A refused schedule create, with no second message from the submit: `tests/client/features/workloads/components/schedule-create-failure.ct.tsx`.
- A script attach in flight keeps its picker open: `tests/client/features/chat/components/chat-attach-pickers.ct.tsx`.
- A name refusal after Cancel, after the name was edited, and while the dialog shows it: `tests/client/features/character/components/new-character-refusal.ct.tsx`.
- A write that fails after a newer write succeeded, and one whose error was cleared: `tests/client/data/superseded-writes.ct.tsx`.
- A failed read for one character does not stick on the next: `tests/client/features/character/components/platform-context-recovery.suite.ct.tsx`.
- No runaway: `tests/client/features/refinery/components/preview-result-lifetime.ct.tsx`.
- Scanner cases: `tests/tooling/ui-facts/composition.test.ts`.

### Scanner

The feedback scanner (`tooling/src/ui-facts/feedback.ts`) reads a state mark as state, a function-form toast whose returned value can be `null` as a split, a setter named for a failure or a `notify.error` in a `try/catch`, `.catch(...)` or `form.handleSubmit().catch(...)` on the mutation, and a per-call `onError`. A `handleSubmit` catch counts only when the same function fires the mutation. A setter such as `setOpen` is not a failure. A call that takes `null` as an argument is not a `null` return. The variant scanner reads a spread with a computed key or a getter as unresolved.

### Open

No test mounts the real add-connection dialog, so the key mint's `errorToast` is covered only by the hook declaring it and by the scanner.

The toast and inline sites that were never read are listed in item 1816.
