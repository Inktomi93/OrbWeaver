---
kind: bug
status: open
updated: 2026-11-16
priority: P1
area: chat
plan: chat-html-and-presets
---

# A persona name or description is data, never markup, in a framed reply

## What

The display names pass fills the user, persona and character macros unescaped before a reply frames. On a character's row they resolve to the anchor persona's name and description, which a member can own, so that text becomes markup or script in every viewer's frame of a panel that names the macro.

## Why

A member gets a card author's sandbox reach over rows they did not write.

## Done when

On a row that frames and in a card block, substituted names are HTML-escaped outside raw-text elements, and the macro stays literal inside style and script bodies and event-handler attributes; the display-script template pass follows the same rule on the display call. Tests show a persona name holding markup renders as visible text in the minted frame document, red on the parent.

## Evidence

Filled at landing: what ran and where its output is.
