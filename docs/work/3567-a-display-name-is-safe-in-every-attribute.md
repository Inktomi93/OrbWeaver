---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# A display name is safe in every attribute context a card can put it in

## What

The display escape covers text and quoted attribute values. In an unquoted attribute a name's spaces start new attributes, an escaped name in a nested document attribute decodes into that document, and a link target keeps a script-scheme name because the frame keeps such links.

## Why

Where a card author or a display script puts the user or persona macro in one of these spots, a member's persona text becomes script at the interactive step in every viewer's frame.

## Done when

Display macros in an unquoted attribute, a nested document attribute or a URL attribute resolve to a safe form or stay literal, the frame's Markdown drops script-scheme links, and kit and frame cases cover each.

## Evidence

Filled at landing: what ran and where its output is.
