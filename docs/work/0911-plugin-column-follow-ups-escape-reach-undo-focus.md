---
kind: bug
status: open
updated: 2026-10-11
priority: P3
area: client
---

# Plugin column follow-ups: Escape reach, Undo focus, entry glide, exact-pixel CTs

## What

From the verifier pass on items 842 and 874 (plugin column, overlay, phone Plugin panels). Suspected from code, not reproduced: (1) Escape closes the overlay only when document.activeElement is inside the column or its control (packages/client/src/features/chat/hooks/use-flank-presentation.ts, useOverlayDismiss), so it does nothing for a key press inside a plugin iframe, after a mouse click in Safari, or after a click on a non-focusable part. (2) With two plugins, pressing Undo in the hide toast counts as an outside press, closes the overlay and leaves the column inert (features/chat/components/room-flank.tsx), so the restore focus in features/plugin/components/plugin-anchored-surfaces.tsx lands on body. (3) On room entry with the column collapsed, the first commit has host panels off, so a flank FLIP stamps out with the full column distance while the thread only narrowed by the control reserve; rows may glide the wrong way at mid widths (use-flank-track-flip.ts, shell.css flank track delta). Test debt: tests/legacy/client/features/plugin/lib/chat-anchors.ct.tsx uses exact toBe on fractional coordinates near lines 685 and 794, which flaked on a loaded box (use toBeCloseTo); the plugin story registry in tests/client/features/plugin/\_ct-stories.tsx is a hand-picked list rather than the production chatSurfaceContributors from compose/authed-app.tsx (Spine-Testing section 10).

## Why

Keyboard exits and focus return are accessibility contracts; the CT flake and the hand-picked registry let regressions pass or fail at random.

## Done when

Each of the three suspicions is reproduced and fixed or shown not to occur, the two exact-pixel assertions tolerate subpixel layout, and the plugin stories build their registry from the production list.

## Evidence

Filled at landing: what ran and where its output is.

Also: packages/showcase-plugins/bundles/oracle-deck/main.ts:469 still says its commands open from "the composer or the Plugins wand menu"; since 853 they open only from the composer wand. Fix the comment with a manifest version bump and regenerated release entries. Owner intent: the top-bar launcher is an extension slot for third-party unplaced commands, never a home for our own plugins.
