---
kind: bug
status: open
updated: 2026-10-19
priority: P3
---

# Security review small findings from batch part one

## What

From the cb-security independent review: (1) packages/server/src/domain/rpg/tools/apply.ts lines 172 and 179 write tracker entries under model-chosen keys (z.string), so a **proto** key re-parents a fresh copy and the write is lost; use an own-key define, a Map, or refuse keys outside the defs, with a red-first **proto** and constructor test. (2) payload-view\.tsx lines 142, 369, 422 and 442 read a field named constructor through a plain read (cosmetic). (3) The zod-origin AUTH_MODE case runs near its 5 s default under load; give it a scaledBudget. (4) The composed-probe entry list is a hand list; derive it from importers. Security: route (1) to security-executor.

## Why

Each is a small correctness gap the review confirmed; (1) silently drops a model tool write.

## Done when

Each finding is fixed with its test, or recorded with the reason it stays.

## Evidence

Filled at landing: what ran and where its output is.
