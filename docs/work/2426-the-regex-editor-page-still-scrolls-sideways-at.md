---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# The regex editor page still scrolls sideways at enlarged text

## What

After CodeEditor turned on line wrapping, the walk at 200 and 300 percent text no longer reports the CodeMirror scroller, but config-content still scrolls sideways on config/regex-editor-and-real-testers, and the Stream and Macros in the find pattern buttons cut their value.

## Why

The page still fails reflow at enlarged text even though the editor now wraps.

## Done when

The cause is named, config-content no longer scrolls sideways on the regex checkpoints at 200 and 300 percent text, and the two buttons keep their whole value, proved by a CT and the walk.

## Evidence

Filled at landing: what ran and where its output is.
