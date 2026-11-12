---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: surface-walk
---

# Text-over-art engine follow-ups from the cover-model review

## What

From the final cb-art review in reports/code-reviewer: the two in-view art-row control fixtures keep an opaque cover, so they read unseenInFrame whether or not the art layer vetoes and can no longer fail; an overflow fade or svg chevron over a cut caption now withholds as unreadCover and leaves the case without a verdict; on the CSS path, gray-on-color under a translucent cover judges the raw authored colours and nothing states that choice.

## Why

A control that cannot fail proves nothing, and a cut caption under its own overflow cue should not keep a whole case without a verdict.

## Done when

The in-view art-row controls use uncovered ink and fail when the veto is removed; a cut caption under its own overflow cue is judged or excluded under a named reason rather than withheld; the gray-on-color choice is stated in the rule's TSDoc; a rail and chat evidence case reaches a verdict.

## Evidence

Filled at landing: what ran and where its output is.
