---
kind: bug
status: blocked
updated: 2026-10-21
priority: P3
area: security
blocked: owner
---

# Owner-term and env-walker spellings from the 1172-1174 review

## What

The env and egress walker drops an assignment expression's own value: const p = (x = process), read(x = process), (x ||= process).env and the egress analog; the fix adds the assignment node to aliases in the flowOf AssignmentExpression branch of eslint.config.js. isOwnerTerm (tenancy-read.ts) acquits eq(T.ownerId, sql template) because raw sql has no declared columns. A re-exported eq and inArray(T.ownerId, \[id]) are falsely accused.

## Why

Each spelling passes or fails a security rule wrongly.

## Done when

Assignment values flow to aliases with the ambient suite and a live census unchanged; a drizzle sql template or sql.raw value is never an owner term; the re-exported eq and single-element inArray judge correctly; each with a red-first row.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
