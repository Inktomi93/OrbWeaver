---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: client
---

# Accessibility suite gaps after 1325

## What

- Forms the registries cannot mount (auth and dialog forms) have no static guard against an unnamed `<form>`; the 1325 suites reach only registered surfaces.
- The accessible-name suite holds `settings.getAppSettingsWithOverrides`, `settings.getVersion` and `preset.get` pending, so the loaded Admin, About and preset-detail states are not audited.
- The package law names a `touch-target-floor` design-audit probe; `tests/client/features/app-shell/touch-target-floor.suite.ct.tsx` is its CT equivalent.

## Done when

A native ESLint rule or `no-restricted-syntax` selector refuses an unnamed `<form>` in `packages/client` with a planted control; the three loaded states mount from corpus reads and pass the suite; the law cites the touch-floor suite instead of the absent probe.

## Evidence

`eslint.config.ts` adds an unnamed-`<form>` selector to the client `no-restricted-syntax` block, next to `INVISIBLE_CONTROL_SYNTAX` and the queryKey selector. `tests/tooling/eslint-unnamed-form.test.ts` (6 tests): the two unnamed-form controls failed before the selector (2 failed) and pass after, with named-form, `form.Subscribe` and shared-block controls. No client form is unnamed: the lint run over `packages/client/src` adds no errors. `TIMING=all`: `no-restricted-syntax` 15 ms, 0.0%. The accessible-name suite now mounts the loaded Admin and About groups and the preset detail (new `PresetDetailShellStory`) from corpus reads (`_surface-harness.ts`): the overrides, share, preset detail, usage and effective reads come from the corpus. `settings.getVersion` has no corpus capture and cannot have one (its output follows the commit under test), so the harness parses a fixed identity with the production schema. Before the harness change the same mounts failed on uncaptured reads; `accessible-name-quality.suite.ct.tsx` now passes 37 of 37 (CT_PORT 5391). `docs/law/ui-package-design.md` and the `size.touch-target` description in `tokens.json` cite `touch-target-floor.suite.ct.tsx`.
