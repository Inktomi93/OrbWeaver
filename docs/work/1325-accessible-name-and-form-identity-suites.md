---
kind: work
status: doing
updated: 2026-10-25
priority: P1
area: client
lane: closeout/rendered
plan: css-system
---

# Accessible-name and form-identity suites run, and controls are named

## What

`docs/law/UI-Primitives-and-Reuse.md` §13.10 names `accessible-name-quality.suite.ct.tsx` and `form-identity.suite.ct.tsx`; neither exists, and `tests/support/browser/accessible-names.ts` is used only by its own self-test. Fourteen `<form>` elements carry no accessible name (for example `features/auth/components/login-local-form.tsx:48`). The `touch-target-floor` design-audit probe the package law names does not exist.

## Why

An unnamed control or landmark is unusable by assistive tech; these are the user-visible defects the law exists to stop.

## Done when

The two suites exist over the production section and modal registries (every registered surface mounted through the CT door, every interactive control and landmark asserted for a non-empty, unique, label-in-name accessible name), the existing violations are fixed, a planted unnamed control fails, and the touch floor is asserted for every interactive primitive at a coarse pointer (or the law names the CT that already does).

## Evidence

Suites, all under `tests/client/features/app-shell/` and run with `pnpm test:ct <path>`:

- `accessible-name-quality.suite.ct.tsx` mounts every id in `SECTION_IDS`, `MODAL_SLOT_IDS` and `CONFIG_GROUP_IDS` through the production shell and settings content, and fails on a nameless control, a label missing from its name, an unnamed or duplicate landmark, and a duplicate control name. A duplicate name is dropped only when every duplicated control sits in a row and the whole row sentence is identical in each.
- `form-identity.suite.ct.tsx` fails on a native field with no `id` or `name`, or no label, on the same rosters. It also mounts every field primitive bare and inside a `Field`, and requires both `id` and `name` of the primitive's own controls.
- `touch-target-floor.suite.ct.tsx` runs under `hasTouch` and fails when an interactive `@orb/ui` primitive answers a finger over less than `--spacing-touch-target`.
- Each suite plants its defect class (unnamed button, duplicate landmark, unnamed form, field without `id` or `name`, 16px control) and a clean control.

Fixes the suites forced: one `useFieldIdentity` hook in `packages/ui/src/primitives/field` supplies `id` and `name` to every field primitive, and a control inside a `Field` mints a name only when neither the Field nor the control has one, and a name the caller gave is never replaced (the form suite reads the submitted `FormData` keys); the slider thumb carries the touch-target pseudo; the shelf face, notification Dismiss and prompt-form names follow N2 and N5; every other unnamed form takes its name from the `form-aria-label` codemod and the prompt form from its dialog title.

Loaded-state acceptance:

- The name suite waits for the loaded Admin field, the actual server build identity and the opened preset's heading before auditing. The form suite also audits loaded preset detail.
- [The surface harness](../../tests/client/features/app-shell/_surface-harness.ts) combines exact-input captured reads with `serveCorpusProcedures`. Version and preset reads come from the actual corpus root; Admin settings use the captured first-boot production answer. An undeclared procedure still fails.
- Native ESLint guards unnamed forms and empty ARIA names. [The follow-up](1339-a11y-suite-gaps-after-1325.md) names their static controls.

Scope remains bounded: signed-out authentication, payload-dependent dialogs and loaded corpus-indexing states outside these mounts are not covered by the registry roster alone. [Rendered closeout](../reviews/rendered-closeout.md) records current commands, artifacts and verification status.
