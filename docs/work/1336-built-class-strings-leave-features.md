---
kind: work
status: doing
updated: 2026-10-25
priority: P2
area: client
lane: closeout/css
plan: css-system
---

# Built class strings leave features

## What

131 built `className` values remain in features: 46 templates, 46 imported constants (`HIDE_AT_COARSE`, `ROW_ACTION_*`, `RECEDED_INK`, `CHAT_TRACK`, `PIN_REVEAL`, `SWIPE_COUNTER`, `MESSAGE_ACTION_ICON_CLASS`, `DEF_ROW_CLASS`, `*_AT_COARSE`), 19 member reads, 16 function builders, 4 concatenations. `orb/no-built-class-string` is registered but not enabled.

## Why

A built class string hides state styling from the variant system and from lint.

## Done when

The imported constants become primitive props or variants; templates and builders become props; `orb/no-built-class-string` and `orb/feature-classname-layout-only` are enabled at zero; this closes item 1316.

## Evidence

The enabled no-built-class-string and feature-classname-layout-only rules pass their controls and the full UI/client lint census. Imported fragments and skin-table strings are represented by primitive props.

See [CSS closeout](../reviews/css-closeout.md) for exact check selections, artifacts and remaining limits.
