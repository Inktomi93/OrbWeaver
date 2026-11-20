---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: chat-html-and-presets
---

# An in-message anchor link scrolls to its target

## What

In-message fragment links and footnote references go through the renderer link button, which treats a fragment as an external link: it asks to open an external link and then opens a new tab instead of scrolling. The footnote back-reference has no target because the link button drops the id it points at.

## Why

Footnotes and tables of contents in styled replies do not work.

## Done when

A fragment link scrolls to its prefixed target in the same message, and a footnote back-reference returns to its reference, proven by a component test.

## Evidence

Filled at landing: what ran and where its output is.
