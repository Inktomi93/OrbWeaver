---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: client
lane: wt/agent-a753be51eef96b9c6
---

# Desktop chat chrome reads as one designed surface

## What

Owner screenshot of the desktop chat with both panels open (~/Archives/orbweaver-reviews/desktop-chrome-strip.png): the top-right toolbar mixes a boxed Cmd-K jump pill with five ungrouped bare icons and shows the Mac shortcut glyph on Linux; 'Chats 1040' sets an unlabelled mono count beside the sans title; filter avatars are rounded squares while the toolbar avatar is round; the transcript's top line is half-cut under the toolbar with a weak fade; the Pocket Arcade flank card sits flush on the header divider, its 'New game' button wraps to two lines, and an unstyled native scrollbar shows inside the card. Surfaces disagree: list and right body (11,9,7), center (14,12,11), flank (18,16,15), right header slab (20,18,16), rail (21,15,9), a stray orange right-panel top line (128,79,33), and arcade tiles (52,40,35).

## Why

Owner: lots of crunchy things in the desktop chat chrome.

## Done when

Toolbar actions are grouped with one control style and the shortcut hint shows Ctrl+K off Mac; the list count has a label or matching type; avatar shape is one rule app-wide; the transcript's top edge masks under the toolbar without a half-cut line; flank cards get the column's top gap, buttons never wrap mid-label, and scrollbars inside plugin frames use the app's scrollbar styling; snaps at 1280 and 1920 with both panels open. Column surfaces use one deliberate elevation scale from theme tokens (each pane one token, no second shade inside a pane), verified by sampling the snaps.

## Evidence

Filled at landing: what ran and where its output is.
