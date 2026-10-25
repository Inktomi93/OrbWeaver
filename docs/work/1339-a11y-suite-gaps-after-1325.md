---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: client
lane: closeout/rendered
---

# Accessibility suite gaps after 1325

## What

- Forms the registries cannot mount (auth and dialog forms) have no static guard against an unnamed `<form>`; the 1325 suites reach only registered surfaces.
- The accessible-name suite holds `settings.getAppSettingsWithOverrides`, `settings.getVersion` and `preset.get` pending, so the loaded Admin, About and preset-detail states are not audited.
- The package law names a `touch-target-floor` design-audit probe; `tests/client/features/app-shell/touch-target-floor.suite.ct.tsx` is its CT equivalent.

## Done when

A native ESLint rule or `no-restricted-syntax` selector refuses an unnamed `<form>` in `packages/client` with a planted control; the three loaded states mount from corpus reads and pass the suite; the law cites the touch-floor suite instead of the absent probe.

## Evidence

Native `no-restricted-syntax` entries refuse unnamed forms and empty ARIA names. [Unnamed-form controls](../../tests/tooling/eslint-unnamed-form.test.ts) and [empty-name controls](../../tests/tooling/eslint-empty-aria-name.test.ts) own those static refusal paths.

[The name suite](../../tests/client/features/app-shell/accessible-name-quality.suite.ct.tsx) requires a rendered Admin field, the actual server version and the opened preset's heading before auditing those loaded states. [The form suite](../../tests/client/features/app-shell/form-identity.suite.ct.tsx) also checks the opened preset. The harness serves `settings.getVersion` and preset reads from the actual corpus root; it does not fabricate a fixed build identity. Admin settings use the captured first-boot production answer.

`docs/law/ui-package-design.md` and the `size.touch-target` description in `tokens.json` name [the coarse-pointer touch-floor suite](../../tests/client/features/app-shell/touch-target-floor.suite.ct.tsx), not an absent design-audit probe.

[Rendered closeout](../reviews/rendered-closeout.md) records current commands, artifacts, verification status and the remaining mount-scope limits.
