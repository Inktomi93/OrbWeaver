---
kind: bug
status: open
updated: 2026-11-21
priority: P3
area: tag
plan: unwired-code
---

# A label made with New label records that the user created it

## What

The Labels New label action sends only the name (packages/client/src/features/tag/hooks/use-tag-library.ts), and packages/server/src/domain/tag/verbs/create.ts stores source as null, so the label's detail reads Origin not recorded. Attaching a tag by name already records manual.

## Why

A label the user just made says its origin is unknown, and the two ways of making a label disagree.

## Done when

A label created through create records manual, the detail pane says You created it, and the tag suite covers both creation paths.

## Evidence

Filled at landing: what ran and where its output is.
