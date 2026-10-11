---
kind: bug
status: doing
updated: 2026-10-10
priority: P2
area: client
lane: wt/agent-af33eeddd3db84319
---

# The chat composer fits and feels right on a phone

## What

Owner report: the chat composer area feels cramped on iPhone 14 Pro Max (Chrome). Check composer layout, alignment and spacing under --mobile.

## Why

The composer is the most-used control on a phone.

## Done when

Composer layout, alignment, spacing and touch targets are correct under --mobile with snap evidence before and after; affected CT passes.

## Evidence

Owner ruling after a SillyTavern side-by-side on iPhone: keep the two-row composer, tab bar (the recorded tab-bar ruling stands), button sizes and text margin. On phones, move the plugin badge and Plugin panels bar off the transcript foot, hide the Next reply line, and fix the sticky message header band that covers message text.

Later owner rulings: chat styles match Moonlit Echoes on phones (avatars kept, 40px chip, bubble 80 and tide 90 percent caps, ripple 100px portrait, whisper banner 50 percent centred, persona mirrored only in bubble, echo and tide; echo and whisper keep a chip beside their art); flat and document follow stock SillyTavern (document has no avatar, name or timestamp, buttons on the last row only, no width cap). The tab bar hides inside a chat on phones, the text margin is about 24px, and the Next reply line never names the model at any width. The composer keeps the owner's SillyTavern layout: plain glyph buttons, steer-capable buttons as filled Lucide glyphs without discs, a compact 32px send circle, round glyph-sized hover on every button including the menu, a 1px focus border.
