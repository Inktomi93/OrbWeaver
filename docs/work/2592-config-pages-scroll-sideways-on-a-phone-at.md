---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: surface-walk
---

# Config pages scroll sideways on a phone at enlarged text outside the regex editor

## What

config-content scrolls sideways on About, Admin, Chat behavior, Personas, Workloads, World Info, Backup, Plugins and the appearance fold (kind K4). Evidence: the enlarged-text verdict table under reports/cb-walk-text. Folded in, "The regex editor page still scrolls sideways at enlarged text": After CodeEditor turned on line wrapping, the walk at 200 and 300 percent text no longer reports the CodeMirror scroller, but config-content still scrolls sideways on config/regex-editor-and-real-testers, and the Stream and Macros in the find pattern buttons cut their value. Its done line was: The cause is named, config-content no longer scrolls sideways on the regex checkpoints at 200 and 300 percent text, and the two buttons keep their whole value, proved by a CT and the walk.

## Why

The settings column stops reflowing.

## Done when

The rerun names the cause per page, each reflows, and the walk lists no config-content sideways finding.

## Evidence

Filled at landing: what ran and where its output is.
