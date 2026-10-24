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

Filled at landing: what ran and where its output is.
