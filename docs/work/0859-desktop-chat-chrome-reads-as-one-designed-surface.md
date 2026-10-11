---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Desktop chat chrome reads as one designed surface

## What

Owner screenshot of the desktop chat with both panels open (~/Archives/orbweaver-reviews/desktop-chrome-strip.png): the top-right toolbar mixes a boxed Cmd-K jump pill with five ungrouped bare icons and shows the Mac shortcut glyph on Linux; 'Chats 1040' sets an unlabelled mono count beside the sans title; filter avatars are rounded squares while the toolbar avatar is round; the transcript's top line is half-cut under the toolbar with a weak fade; the Pocket Arcade flank card sits flush on the header divider, its 'New game' button wraps to two lines, and an unstyled native scrollbar shows inside the card. Surfaces disagree: list and right body (11,9,7), center (14,12,11), flank (18,16,15), right header slab (20,18,16), rail (21,15,9), a stray orange right-panel top line (128,79,33), and arcade tiles (52,40,35).

## Why

Owner: lots of crunchy things in the desktop chat chrome.

## Done when

Toolbar actions are grouped with one control style and the shortcut hint shows Ctrl+K off Mac; the list count has a label or matching type; avatar shape is one rule app-wide; the transcript's top edge masks under the toolbar without a half-cut line; flank cards get the column's top gap, buttons never wrap mid-label, and scrollbars inside plugin frames use the app's scrollbar styling; snaps at 1280 and 1920 with both panels open. Column surfaces use one deliberate elevation scale from theme tokens (each pane one token, no second shade inside a pane), verified by sampling the snaps.

## Evidence

Re-derived first. The merged context pane work already fixed the right header slab, the foot rail and the second shade in the pane (`docs/adr/0313-the-context-panes-tabs-live-in-its-header-row.md`).

Surfaces, sampled from snaps at 1280 and 1920 with both panels open, before and after: rail (9, 7, 6), list and context panes (12, 9, 7), content and topbar (15, 12, 10). One step per column and no second shade inside a pane, so the elevation item needed no change.

Fixed, each with a test that failed on the old source first:

- Toolbar. The palette chip is a ghost control like the others and the icon actions are one cluster (`topbar-trail.tsx`, `shell.css`). The hint is `Ctrl+K` off Apple platforms (`command-shortcut-label.ts`). Tests: `command-shortcut-label.test.ts`, `app-shell.ct.tsx`.
- List count. It wears the title's family with tabular figures (`list-pane-header.tsx`). Test: `list-pane-header.ct.tsx`.
- Avatar shape. `docs/law/UI-Density-Law.md` 2.1 gives avatars the full radius, so the faces strip, character picker, library row and refinery row are circles. Portrait slots keep `rounded`. The overflow tile stays distinct by its dashed outline on no fill. Tests: `face-strip.ct.tsx`, `character-picker.ct.tsx`, `character-card.ct.tsx`.
- Transcript top edge. Both edge bands ease in, so the cut line reads as gone (`globals.css`). Test: `message-list-surface.ct.tsx`, a framebuffer sample.
- Flank. The column keeps a top gap under the divider (`chat-room-surface.tsx`). Pocket Arcade puts New game on its own line in the 194px frame (1.0.2, artifacts rebuilt). Frames get the thin themed scrollbar (`card-frame/index.ts`). Tests: `chat-room-surface.ct.tsx`, `pocket-arcade.suite.ct.tsx`, `sandbox-frame.ct.tsx`.

Kept: the 2px ember edge atop the context pane is the content-to-context binding line, not a surface shade. The hero portrait uploader keeps `square` so its button ring traces the avatar's corner.
