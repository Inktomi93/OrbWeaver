---
kind: bug
status: doing
updated: 2026-10-19
priority: P2
area: server
lane: wt/agent-a2e888bf73456f7ae
---

# Fork and duplicate copy message asset links

## What

forkChat and duplicateMessage copy message bodies but not their message_assets link rows.

## Why

Room members lose render access to the copied image, and an inline-reply picture loses its replay to the model.

## Done when

Both verbs copy the links under the fork strip rules, with a test per verb.

## Evidence

Filled at landing: what ran and where its output is.
