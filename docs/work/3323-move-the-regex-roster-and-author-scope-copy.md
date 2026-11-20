---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Move the regex roster and author-scope copy into names modules

## What

Move these strings into the features' names modules: `STOPPED_MARK`, `STOPPED_REASON`, the gloss strings and the empty line in `packages/client/src/features/chat/components/regex-on-screen-group.tsx`, and the `GONE_*` and `LOADING_*` strings in packages/client/src/features/regex/components/regex-author-scope-fields.tsx (on its branch).

## Why

User-facing copy lives in zero-import names modules so that a test can import it. Today a test that drives the Stopped mark has nowhere to import the mark from.

## Done when

Those strings live in names modules, both components import them from there, and neither component keeps a local copy string.

## Evidence

Filled at landing: what ran and where its output is.
