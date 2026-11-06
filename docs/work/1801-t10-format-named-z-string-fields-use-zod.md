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

Type the ten format-named z.string fields in packages/contracts/src (url, uri, email, baseUrl, sourceUrl and provenanceUrl in diagnostics/client-error, theme/background, providers, settings/appearance, plugin/frame, plugin/view, character, inference/connection and chat/card-frame) with zod format types after the stored rows are checked, trial z.codec on one stored JSON column, and try strict-void-return. Id-named fields are already branded, so they are out of scope.

## Why

A field named for a format is validated as an arbitrary string, so a malformed value passes the schema. Seven fields already use zod format types, which shows the pattern works; ten still use a bare string. Neither z.codec nor strict-void-return appears anywhere in the repository yet.

## Done when

Format-named fields use zod format types and stored rows still parse. The z.codec trial and the strict-void-return trial each have a recorded outcome, adopted or declined with a reason.

## Evidence

Filled at landing: what ran and where its output is.
