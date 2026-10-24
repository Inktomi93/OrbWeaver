---
kind: work
status: open
updated: 2026-10-24
priority: P1
area: client
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

- `accessible-name-quality.suite.ct.tsx` mounts every id in `SECTION_IDS`, `MODAL_SLOT_IDS` and `CONFIG_GROUP_IDS` through the production shell and settings content, and fails on a nameless control, a label missing from its name, an unnamed or duplicate landmark, and a duplicate control name. A duplicate name is dropped only when the data repeats the record it names.
- `form-identity.suite.ct.tsx` fails on a native field with no `id` or `name`, or no label, on the same rosters. It also mounts every field primitive bare and inside a `Field`, and requires both `id` and `name` of the primitive's own controls.
- `touch-target-floor.suite.ct.tsx` runs under `hasTouch` and fails when an interactive `@orb/ui` primitive answers a finger over less than `--spacing-touch-target`.
- Each suite plants its defect class (unnamed button, duplicate landmark, unnamed form, field without `id` or `name`, 16px control) and a clean control.

Fixes the suites forced: one `useFieldIdentity` hook in `packages/ui/src/primitives/field` supplies `id` and `name` to every field primitive, and `Field` mints a name when the caller gives none; the slider thumb carries the touch-target pseudo; the shelf face, notification Dismiss and prompt-form names follow N2 and N5; every other unnamed form takes its name from the `form-aria-label` codemod and the prompt form from its dialog title.

Open:

- Forms in dialogs and auth states outside the registries are not mounted by the name suite. The pending-join form is checked in `tests/client/features/auth/components/login-pending-join.ct.tsx`; a native lint rule for an unnamed `<form>` would cover the rest.
- `settings.getAppSettingsWithOverrides`, `settings.getVersion` and `preset.get` stay pending in the surface harness, so the loaded admin, About and preset-detail states are not audited.
- The corpus has no `serveCorpusProcedures`; the harness routes `createShellAmbientReads` plus first-capture responders (`tests/client/features/app-shell/_surface-harness.tsx`).
