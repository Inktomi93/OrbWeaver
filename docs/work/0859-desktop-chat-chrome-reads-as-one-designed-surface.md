---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Desktop chat chrome reads as one designed surface

## What

Owner screenshot of the desktop chat with both panels open (~/Archives/orbweaver-reviews/desktop-chrome-strip.png): the top-right toolbar mixes a boxed Cmd-K jump pill with five ungrouped bare icons and shows the Mac shortcut glyph on Linux; 'Chats 1040' sets an unlabelled mono count beside the sans title; filter avatars are rounded squares while the toolbar avatar is round; the transcript's top line is half-cut under the toolbar with a weak fade; the Pocket Arcade flank card sits flush on the header divider, its 'New game' button wraps to two lines, and an unstyled native scrollbar shows inside the card.

## Why

Owner: lots of crunchy things in the desktop chat chrome.

## Done when

Toolbar actions are grouped with one control style and the shortcut hint shows Ctrl+K off Mac; the list count has a label or matching type; avatar shape is one rule app-wide; the transcript's top edge masks under the toolbar without a half-cut line; flank cards get the column's top gap, buttons never wrap mid-label, and scrollbars inside plugin frames use the app's scrollbar styling; snaps at 1280 and 1920 with both panels open.

## Evidence

Filled at landing: what ran and where its output is.
