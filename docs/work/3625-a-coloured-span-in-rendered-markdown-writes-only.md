---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: chat-html-and-presets
---

# A coloured span in rendered markdown writes only its colour

## What

Rendered markdown keeps a span's style when the value passes a colour pattern in the sanitize schema, so on a span that pattern is the only thing between author CSS and the main page, while D294 and UI-Theming-and-Content §12.0 still say rendering never relies on a regex sanitize. The font element is already drawn by a component that writes only its colour. Draw the coloured span the same way, writing only the parsed colour, and amend D294 and §12.0 to state the rule in the same change.

## Why

A colour-only component makes a future loosening of the pattern harmless, and the law should say what the code does.

## Done when

A coloured span renders through a component that writes only a colour property; D294 and §12.0 state the rule; a test shows a crafted style value yields no other property.

## Evidence

Filled at landing: what ran and where its output is.
