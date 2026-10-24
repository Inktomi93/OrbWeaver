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

Filled at landing: what ran and where its output is.
