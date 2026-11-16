---
kind: bug
status: open
updated: 2026-11-16
priority: P1
area: chat
plan: chat-html-and-presets
---

# A plain row drops a panel's text with its element

## What

On a row that renders untrusted, the Markdown allowlist drops an element it does not allow together with its children. A panel written with bold, italic, font or custom tags loses its words, and on the Tide style that leaves an empty bubble. Only the notice says why.

## Why

A reader who turns trust down gets a blank message where the panel's words should be.

## Done when

The plain path keeps a dropped element's visible text. Style, script and other raw-text bodies are stripped first, so no CSS or script text prints. No empty Tide bubble remains. A component test covers a panel on the plain path in the Tide style.

## Evidence

Filled at landing: what ran and where its output is.
