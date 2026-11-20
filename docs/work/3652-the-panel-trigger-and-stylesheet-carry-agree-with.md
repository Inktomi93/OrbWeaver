---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: kit
plan: chat-html-and-presets
---

# The panel trigger and stylesheet carry agree with the renderer's tokenizer handoff

## What

rehype-raw keeps the HTML tokenizer in its text or raw-text state until the next Markdown-built element closes, so an unclosed inline textarea swallows a later style or svg or not depending on emphasis and code spans. The kit readers cannot follow that, which leaves panel-trigger and stylesheet-carry disagreements with the frame (mostly unclosed textareas, a few from the lift joining paragraphs around an inline stylesheet). The strip readers are safe because they strip through doubt. The kit and renderer differential test therefore covers four axes, without these two.

## Why

A model panel or a carried stylesheet can differ between what the kit decides and what the frame draws.

## Done when

The panel and style-carry axes join the differential test at zero with a planted red each, either by modelling the handoff in the kit or by a recorded ruling to read those two decisions through the renderer parser.

## Evidence

Filled at landing: what ran and where its output is.
