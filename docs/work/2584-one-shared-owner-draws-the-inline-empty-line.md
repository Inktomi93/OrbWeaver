---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# One shared owner draws the inline empty line of a list inside a surface

## What

The empty state of a list inside a surface is one shape, a muted sentence with an optional ghost action, spelled by QueryInlineState, by RpgDoorwayLine and by a bare Text across many sites, filter-miss lines included. One client-shared owner holds it and every site reads it. EmptyState stays the owner of a surface's own empty state. It is a wide rewrite over client Text sites, so it runs after the prose cap codemod. Sites: survey table 2b for item 1766 under reports/cb-survey-1766.

## Why

The same line reads differently per feature and nothing holds its voice.

## Done when

One client-shared component owns the line, every site in the survey table reads it (by codemod where the shape is mechanical), RpgDoorwayLine and the QueryInlineState empty case are gone or delegate to it, and the census lists the cohort.

## Evidence

Filled at landing: what ran and where its output is.
