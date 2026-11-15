---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# A custom tag line directly under prose is not held while a reply forms

## What

A lone tag line cannot interrupt a CommonMark paragraph, so '\<director_notes>' on the line right after prose stays in the paragraph and its body prints while streaming. The row 'a lone tag line inside a paragraph stays in the paragraph' pins today's shape.

## Why

Presets put spoiler blocks right after the model's prose with no blank line; the hold should treat them as blocks.

## Done when

The hold opens an element block on a lone tag line under prose, the existing row is amended under D354, and a stream CT shows no spoiler text.

## Evidence

Filled at landing: what ran and where its output is.
