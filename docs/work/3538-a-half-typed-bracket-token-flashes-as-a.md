---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# A half-typed bracket token flashes as a link while a reply streams

## What

While a reply streams, a display script trigger written in square brackets shows for one chunk as a link-coloured fragment before the rest arrives.

## Why

A reader sees a flicker of link colour on text that is never a link.

## Done when

The streaming tail holds an unfinished bracket token as plain text, and a component test drives the stream through the harness with no timing assertion.

## Evidence

Filled at landing: what ran and where its output is.
