---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# A short dialog's sticky header takes the glass fill of its popup instead of a second opaque fill

## What

With dialog glass on, a landscape-phone dialog paints its sticky header in the solid popover ground over a translucent popup, so the header reads as a heavier slab, most visibly over a light backdrop. The header ground is set in `packages/ui/src/primitives/dialog/variants.ts`. The pinned footer lets the popup's glass show through, in the appearance layer of `packages/client/src/styles/globals.css`.

## Why

A header that is a different material from the sheet under it looks like a separate plate laid on the dialog.

## Done when

A component test in `tests/client/components/` mounts a form dialog at 844px by 390px with glass surfaces on and a light backdrop. It asserts that the header has no opaque fill of its own and carries the same backdrop blur as the footer, and that body text scrolled under the header does not show through its text. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
