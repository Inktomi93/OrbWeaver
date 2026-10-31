---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Step 3 and 1448 rendered polish bundle

## What

From the shell-edges and carried-tones side-eye report under reports/side-eye/: the narrower NumberField truncates the placeholder 300 (provider default) further (F9); 28px chips in the 32px combobox have a 2px vertical inset against 10px horizontal (F10); on a mid-grey custom theme the primary text-on-tint resolves to pure black with no hue while warning and success inks keep about C 0.03 (F8).

## Why

Small visible regressions from the control scale and the carried tone solve.

## Done when

The placeholder fits or wraps by design, combobox chips have a balanced inset from tokens, and primary text-on-tint keeps its hue where the floor allows, each pinned by a CT or the tone-knobs suite.

## Evidence

- F9: the replay lifetime placeholder reads "300 (default)"; the field description names the provider default. `tests/client/features/preset/components/platform-replay-placeholder.suite.ct.tsx` measures the placeholder in the field's own font on the real preset editor. On the old copy it needed 152px of 136 at a fine pointer and 162px of 112 at a coarse one; it fits after, on Chromium and WebKit.
- F10: a combobox chip's height is its step less the border and the field inset on both sides (`--size-combobox-chip-<step>` in `packages/ui/src/tokens/tokens.json`); the chip step's field takes the tight inset. `tests/ui/primitives/combobox/platform-combobox-chips.suite.ct.tsx` reads the chip's top and start insets and the field height at every step and both pointers. On the old source the `sm` chip sat 1px from the top against 6px inline, and the chip-step field grew to 30px; both match after, on Chromium and WebKit.
- F8: primary `text-on-tint` already keeps its hue on the mid-grey page: the clamp emits L0.174 C0.071 H29, after the tint solve that fixed F7 lightened the primary tint. `tests/ui/content/theme-scope/tone-knobs.test.ts` now pins `text-on-tint` in its mid-grey hue case; it passes on the current source, because the defect no longer reproduces.
