---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: ui
plan: css-system
---

# Phone tab bar labels overprint at 200% and 300% text

## What

On a phone at 200% and 300% text, the bottom tab bar labels overprint each other.

## Why

Pre-existing; side-eye found it in the shell overflow review (`reports/side-eye/2026-10-30-shell-overflow.md`).

## Done when

At 390x844 and 320 wide, at 200% and 300% text, every tab label is legible with no overlap (or the bar switches to an icon-plus-accessible-name form the law allows), pinned in the text-scale suite on Chromium and WebKit.

## Evidence

`QUALIFIED.phoneTabs` in `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx` covers 390x844 and 320x568 at 200% text and 300% layout; green on Chromium and WebKit. Red before on Chromium in all four. Below the narrowest container step (`cq-20`, 20rem of bar width, which scales with the enlarged root) the bar drops its labels and keeps the icon plus the button's `aria-label`, the form the desktop rail already uses. Law: `docs/law/UI-Primitives-and-Reuse.md` N1 allows `aria-label` where there is no visible label (an icon-only control). At 100% text a phone 320px wide or wider keeps its labels. The case asserts that each shown label lies whole inside its own tab and does not overlap its neighbour, and that every tab keeps a non-empty accessible name.
