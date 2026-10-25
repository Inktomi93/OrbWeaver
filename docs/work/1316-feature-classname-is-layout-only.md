---
kind: work
status: doing
updated: 2026-10-25
priority: P2
area: client
lane: closeout/css
plan: css-system
---

# Feature className is layout-only, and class strings are never built

## What

In `packages/client/src/features/**`, `className` on an `@orb/ui` primitive paints colour, type, border, radius and shadow (about 236 hits in 148 files: `text-accolade tracking-micro`, `selected ? "text-primary" : "text-muted-foreground"`, `Skeleton className="size-avatar-md rounded-full"`, `Text className="text-transparent"` as a spacer). Class strings are also built: template-literal and concatenated `className` (about 46 sites in 35 files) and exported class constants or fragment builders (`DEF_ROW_CLASS`, `cellWidthClass` returning `" w-…"`).

## Why

The paint law gives features zero CSS: skins come from `tv()` variants and primitive props. A painted className and a built class string hide state styling from the variant system and from lint.

## Owner ruling

2026-10-24: build both rules, with planted controls, and migrate the existing sites.

## Done when

An ESLint rule allows only layout utilities in a feature `className` (the allow-list derived from Tailwind's layout namespaces, not hand-typed); a second refuses template-literal, concatenated and imported class-string `className` values in features; every existing site moves to a primitive prop or variant; planted controls fail and a layout-only class passes.

## Evidence

Both feature className rules are enabled at error. The feature-className controls and the full UI/client lint census pass. The drain uses existing primitive props, including the chat row skin table.

See [CSS closeout](../reviews/css-closeout.md) for exact check selections, artifacts and remaining limits.
