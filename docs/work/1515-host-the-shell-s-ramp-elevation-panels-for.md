---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: ui
plan: css-system
---

# Host the shell's ramp-elevation panels for tone tints

## What

Item 1449 made tone tints mix over their host surface through --tone-host, set by the surface primitives. The shell panels in packages/client/src/features/app-shell/surfaces/shell/grid.css that paint card or raised fills under the ramp elevation set no --tone-host, so a soft badge inside a ramp panel still mixes over the page background.

## Why

D336 as amended by 1449: a tint stays distinct from the host it sits on.

## Done when

Each ramp-elevation panel sets its host through the tone-host utility; tests/ui/content/theme-scope/platform-tone-host.suite.ct.tsx covers a soft badge inside a ramp panel in each seed, red first.

## Evidence

Landed: the ramp list and context panes wear `tone-host-surface-raised` and `.shell-main` and `.shell-topbar` wear `tone-host-card` in `grid.css`. `tests/client/features/app-shell/surfaces/platform-ramp-tone-host.suite.ct.tsx` mounts the production shell under ramp elevation in each seed and reads that a probe painting `var(--tone-host)` inside each surface resolves to the surface fill; red on the old stylesheet (transparent against the pane fill) in the WebKit project, green in WebKit and Chromium. The wallpaper arm lands with it: `.shell-main` over a wallpaper in a non-chat section paints the card fill under any elevation and wears `tone-host-card`. The same suite reads it in each seed; red on the old stylesheet (transparent against the card fill), green in WebKit and Chromium. The suite also portals a soft badge in every colored tone into each ramp surface and asserts its tint sits `TONE_TINT_SEPARATION` off the surface's bare fill, in each seed and a custom ThemeScope. That separation check passes on the old stylesheet as well, because the tints are strong enough over the page; the host-resolution cases are the ones that fail without the fix.
