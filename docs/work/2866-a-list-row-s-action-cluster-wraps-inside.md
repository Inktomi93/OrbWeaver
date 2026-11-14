---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# A list row's action cluster wraps inside the row at enlarged text

## What

On Settings, Admin (Approvals and neighbouring sections), Settings, Personas, and the chat Context regex list, a row's action cluster of more than one control stays on one line and ends past the row on a phone at enlarged text. The slot in `packages/ui/src/primitives/list-row/variants.ts` is clamped to the row, but the cluster inside it is a plain Row that never wraps. The chat regex tier row wraps its own cluster by hand, and the cluster in `packages/client/src/features/chat/components/regex-on-screen-group.tsx` and the Approve and Deny cluster in `packages/client/src/features/user-admin/components/admin-approvals-section.tsx` do not.

## Why

A control cut at the row's edge cannot be pressed, and a row wider than its page scrolls the page sideways.

## Done when

A component test in `tests/ui/primitives/list-row/` mounts a ListRow whose actions hold more than one control in a 390px pane at 200% and 300% text. It asserts that the pane does not scroll sideways and every control lies inside the row without a class from the call site. A client test in `tests/client/features/chat/components/` covers the on-screen regex row. Both are red before the change and green after, and the hand-written wrap on the regex tier row is removed.

## Evidence

Filled at landing: what ran and where its output is.
