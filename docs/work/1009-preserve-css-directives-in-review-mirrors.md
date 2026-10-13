---
kind: tooling
status: doing
updated: 2026-10-13
priority: P2
area: tooling
lane: codex/css-mirror-1009
plan: test-foundation
---

# Preserve CSS directives in review mirrors

## What

Preserve directive comments in the CSS and SCSS review-mirror branch using its existing quote-aware scanner and directive vocabulary. Ordinary prose still disappears; source strings, declarations and line positions remain unchanged.

## Why

The mirror removes actual CSS suppression directives while retaining the exempted code, hiding exception ownership from reviewers.

## Done when

A bounded red-first CSS control distinguishes directives from prose and quoted comment text. CSS and SCSS preserve directive ranges, declarations and line counts. Existing TS mirror controls remain unchanged; affected lint and types pass.

## Evidence

Filled at landing: what ran and where its output is.
