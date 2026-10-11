---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: client
lane: wt/agent-a60f3647a45bd36a0
---

# Phone chat navigation closes cleanly and returns where you came from

## What

Phone nav audit (~/Archives/orbweaver-reviews/mobile-nav-oct11.md): the topbar Back with the details sheet open closes the chat but leaves the sheet showing 'No chat open' over the list (goToLanding in state/active-chat-store.ts:176-181 does not close the sheet, selectChatFromList at :226-229 does); a chat opened from Home tiles returns to Chats instead of Home (home-recents-tile-body.tsx:50-53, home-also-open-tile-body.tsx:36); after Back, focus does not return to the opened row and the row is not highlighted.

## Why

Chat-app back semantics: back undoes the last step and returns you where you were. Platform back stays SillyTavern-like (owner ruling: no history entries).

## Done when

Back closes an open sheet first, then the chat; a chat opened from Home returns to Home; focus returns to and highlights the row the chat was opened from; CTs at phone width cover each case.

## Evidence

Filled at landing: what ran and where its output is.

Owner ruling: platform back matches SillyTavern, so no browser-history entries are added; only the in-app back semantics here are owed.
