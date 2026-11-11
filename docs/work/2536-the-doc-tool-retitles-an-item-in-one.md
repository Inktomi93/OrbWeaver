---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
---

# The doc tool retitles an item in one commit and names the citers of a superseded ruling

## What

Two doc tool gaps cost work in the review-fix program. Retitling an item renames its file and the verb cannot commit, so a retitle committed as a delete and a separate add makes the doc check read two items holding one id. And when a ruling is superseded, the comments and law text that cite it are not told: two sweeps found twenty-odd sites crediting superseded rulings, while a fixed rule is impossible because a successor may keep a clause the old cite still rightly names.

## Why

The first is a trap in the tool's own verb. The second cannot be a gate, so the moment to act is when the status changes.

## Done when

The retitle verb accepts the commit flag and commits the rename as one change, or stages both paths so one commit carries them. Setting a ruling's status to superseded prints every comment and doc line that cites it by either spelling, with its path and line, so the author re-points or keeps each one knowingly.

## Evidence

Filled at landing: what ran and where its output is.
