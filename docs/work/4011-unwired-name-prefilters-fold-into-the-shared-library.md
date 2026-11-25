---
kind: tooling
status: open
updated: 2026-11-25
priority: P3
area: tooling
plan: unwired-code
---

# Unwired name prefilters fold into the shared library-names verdict

## What

Several unwired readers keep their own name prefilters before a per-site declaration check (urls request and builder names, procedures Hono verbs, others), beside tooling/src/unwired/graph/library-names.ts, which settles zod and platform declarations once per world.

## Why

Two prefilter homes can disagree on which sites a library check even asks about, and each new reader adds a third.

## Done when

library-names.ts takes a package argument (hono, pino, @trpc/ and the others the readers ask) and the readers' prefilters read it, with the per-site verdict still resolving each site's own symbol, and the unwired suites pass.

## Evidence

Filled at landing: what ran and where its output is.
