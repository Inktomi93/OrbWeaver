---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Keep the depth To field from saving a maximum below the minimum while typing

## What

The depth To field in `packages/client/src/features/regex/components/regex-editor-fields.tsx` autosaves on each keystroke, so while the user types a maximum it can briefly store one below the minimum.

## Why

A stored max below the min matches no depth, so the script stops drawing or applying until the typing ends. The reviewer found this by reading and did not probe it.

## Done when

No autosave stores a maximum below the minimum, and a CT types such a value and then reads the stored row.

## Evidence

Filled at landing: what ran and where its output is.
