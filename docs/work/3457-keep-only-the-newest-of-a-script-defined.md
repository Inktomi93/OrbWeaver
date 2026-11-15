---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Keep only the newest of a script-defined block in context without one script per tag

## What

An imported preset can trim tracker blocks from older messages with one prompt-only regex script per tag, each with a minimum depth. Cards already have a built-in keep-last rule for how many stay in context. There is no built-in way to say that a tag an author defines is kept only in the newest messages.

## Why

An author needs many scripts for one idea, and a mistake in any one of them bloats the context unseen.

## Done when

The owner has ruled whether a keep-newest option for author-defined blocks belongs in the product, and where it lives. If yes, an author states the tag and the depth once, the prompt pass applies it, and a test shows the block present in recent messages and absent in older ones.

## Evidence

Filled at landing: what ran and where its output is.
