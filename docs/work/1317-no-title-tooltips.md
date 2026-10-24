---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: client
---

# No `title` attribute carries meaning in the client

## What

About 300 `title=` props across `packages/client/src` (Button, Badge, ListRow and others), many carrying the only explanation of a control, such as the rpg tracker write-axis toggle. `.claude/rules/ui-and-client.md` already says essential copy never lives only in `title`, but no lint enforces it.

## Why

`title` is invisible on touch and is not the accessible name.

## Owner ruling

2026-10-24: build the rule and migrate the sites.

## Done when

An ESLint rule refuses `title` on JSX in the client (a named exception only where a primitive owns a native `title` semantic, with its reason); every site moves to the Tooltip primitive with `aria-describedby`, visible copy, or is deleted when it duplicates the accessible name; planted controls fail.

## Evidence

Filled at landing: what ran and where its output is.
