---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# A display script's template names a persona in code as written

## What

A display script's own template resolves a name escaped even inside Markdown code, because where the template's code lands in the final text is not known when the template resolves. A name with an apostrophe or an ampersand shows its escapes there.

## Why

A preset that puts the user macro in a code block inside a script template shows the reader's name wrong. The outside user's reference preset does not do this.

## Done when

A template's code block naming the user shows the name as written, and a hostile name still draws no element; the pass order change is ruled before it is built.

## Evidence

Filled at landing: what ran and where its output is.
