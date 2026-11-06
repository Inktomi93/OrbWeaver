---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: contracts
plan: type-law
---

# T10 Format-named z.string fields use zod format types after stored data is checked; trial z.codec on one stored JSON column; try strict-void-return

## What

Type the format-named z.string fields with zod format types after the stored data is checked, trial z.codec on one stored JSON column, and try strict-void-return.

## Why

A field named for a format, such as an id, a url or an email, is validated as an arbitrary string, so a malformed value passes the schema.

## Done when

Format-named fields use zod format types and stored rows still parse. The z.codec trial and the strict-void-return trial each have a recorded outcome, adopted or declined with a reason.

## Evidence

Filled at landing: what ran and where its output is.
