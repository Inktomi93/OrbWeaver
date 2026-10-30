---
kind: work
status: open
updated: 2026-10-30
priority: P1
area: ui
plan: surface-walk
---

# Make every text size come from the governed type ramp and scale with the font-size setting

## What

Owner ruling when removing the D11 2:1 ratio finding: surfaces must pick sizes from the governed font ramp like a real design system, never raw sizes, and the font-size setting must scale all of it. Audit where components size text outside the ramp tokens and where the font-size setting fails to reach, then fix adoption at the shared components.

## Why

Codex removed the crude ratio check but never did the ramp adoption the owner asked for in the same answer; 1411 only covers sandboxed card and plugin frames.

## Done when

No authored text size outside the ramp tokens except documented exceptions; the font-size setting scales every in-app surface; a production-mounted check proves both and fails on a raw size.

## Evidence

- Census: authored text sizes in `packages/` TS, TSX and CSS are already ramp steps or Text voices. The bypass routes were open in the checks, not used in the code. The one exception is the container-sized art initials.
- Font-scale reach: `--appearance-font-scale` on `<html>` sets the root size every rem step multiplies, and charts re-resolve on root style changes. The shell's unmount cleanup dropped the scale, so the pending, error and login surfaces that replace the shell painted at 1.0. The root now keeps every boot axis after unmount.
- Checks: the Stylelint `font-size`, `font` and tier type-slot allow-lists; the ESLint arbitrary-text pattern and `RAW_FONT_SIZE_SYNTAX`. Both run at zero findings over `packages/**/*.css` and `packages/{ui,client}/src`.
- Proof: `tests/client/features/app-shell/type-ramp-census.suite.ct.tsx` mounts every section, modal and settings group at font scale 1.15 and requires each text run on a scaled step. A planted `text-[13px]` on the label voice fails it. `app-shell-appearance.ct.tsx` proves the scale survives the handover to the pending mark (red before the fix). `tests/tooling/stylelint-rules.test.ts`, `native-token-scales.test.ts` and `eslint-raw-font-size.test.ts` prove a raw size fails each rule (red against the old configs).
- Out of scope: sandboxed card and plugin frames (1411), including the showcase pocket-arcade bundle's px sizes.
