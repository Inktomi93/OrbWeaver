---
kind: decision
status: open
updated: 2026-11-16
priority: P1
area: kit
plan: chat-html-and-presets
---

# Research whether the kit's Markdown reading can come from the renderer's own parser

## What

The kit content module keeps its own reading of Markdown code spans, code blocks, HTML blocks, containers and comments, so that decisions made on raw text before render agree with what the renderer draws: the style strip, the model panel trigger, the block hold and whether a name sits in code. The renderer reads through its own parser stack, which is already installed. Each place the two readings differ is a defect: an escaped tick read as a code span, comments closed differently from HTML, a held block ending its list item, and the disagreements the seeded differential found.

## Why

Two readings of one grammar have to agree forever, and the disagreements land on the trust boundary: text read as code is filled in unescaped, and markup read as inert is left live.

## Done when

A written finding says whether the renderer's parser can give exact positions for code, HTML blocks and containers on committed text and on partial streaming text, whether its reading matches what the renderer draws after its own repair of unterminated Markdown, and what it costs per row and per streamed chunk. It ends with a recommendation: replace the kit reading, keep it behind a differential test against the real parser, or leave it. The owner rules before anything is built.

## Evidence

Filled at landing: what ran and where its output is.
