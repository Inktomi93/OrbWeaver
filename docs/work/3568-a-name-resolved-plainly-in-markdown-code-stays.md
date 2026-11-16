---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# A name resolved plainly in Markdown code stays text when a display script lifts it out

## What

A name inside a Markdown code span resolves as written. A host display script that captures the span and splices it into its template turns the name into markup outside code, in the frame.

## Why

The plain-in-code rule assumes code stays code until it renders, and a display script breaks that.

## Done when

Names resolve escaped in code when a display script applies to the row, or a capture that came from a plainly resolved name is escaped again; a test with a code-unwrapping display script and a markup-holding persona name sees text, red on the parent.

## Evidence

Filled at landing: what ran and where its output is.
