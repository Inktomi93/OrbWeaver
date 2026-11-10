---
kind: bug
status: doing
updated: 2026-11-10
priority: P3
area: client
lane: wt/agent-a866f791d38520b05
plan: type-law
---

# The verdict banner shows an authored schema value as a raw word

## What

The payload-view heading paints the word a schema author wrote, which is an open vocabulary the typed chip table cannot reach.

## Why

A raw value reaches a user, and the type guard on closed vocabularies does not cover it.

## Done when

A ruling on whether an authored enum needs a display word, applied at the site.

## Evidence

Filled at landing: what ran and where its output is.
