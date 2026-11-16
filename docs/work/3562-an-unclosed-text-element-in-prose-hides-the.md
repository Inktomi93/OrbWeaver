---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: ui
plan: chat-html-and-presets
---

# An unclosed text element in prose hides the rest of an untrusted reply

## What

The raw-text strip removes an unclosed title, textarea or iframe through the end of the text.

## Why

A reply that names such a tag outside a code sample loses its tail on untrusted surfaces.

## Done when

A ruling that HTML's reading stands, or the unclosed case keeps its words, with a kit row.

## Evidence

Filled at landing: what ran and where its output is.
