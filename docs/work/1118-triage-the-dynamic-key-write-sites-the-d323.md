---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# Triage the dynamic-key write sites the D323 prototype census reports

## What

The D323 prototype-exposure census over the server program reports dynamic-key write sites in contracts, kit and server, including packages/contracts/src/inference/wire-subset.ts:605, packages/kit/src/macro/parser.ts:169, packages/kit/src/macro/registry.ts:551, packages/contracts/src/rpg/structured-patch.ts:328, 379 and 392, packages/contracts/src/refinery/schema-forge.ts:372, 399 and 469, and packages/server/src/foundation/env/index.ts:131 and 813. Because of them the zod-origin env parser AUTH_MODE case in tests/tooling/floor/code-facts/zod-origin.test.ts refuses (the open half of 1081). wire-subset.ts:605 rewrites an existing own key and is benign; the others are not traced. structured-patch may receive keys from model output. Security: route to security-executor.

## Why

A dynamic-key write whose key can come from untrusted input is a prototype-pollution path; a benign one only blocks the own-data proof. The two need different fixes, and the test cannot be re-pinned until they are told apart.

## Done when

Each reported site is classified with evidence as untrusted-key or proven own-key. Untrusted-key sites use a null-prototype object or a Map with a red-first test. The zod-origin AUTH_MODE case then passes, or pins the census refusal by name with the remaining benign sites recorded. No census scope cut (D328).

## Evidence

Filled at landing: what ran and where its output is.
