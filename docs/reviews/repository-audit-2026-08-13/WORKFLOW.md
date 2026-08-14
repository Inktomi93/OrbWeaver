---
kind: runbook
status: active
updated: 2026-08-13
---

# Full-repository audit workflow

This is a bounded map/reduce audit, not an open-ended swarm.

## Map stage — Terra/high readers

- `LANES-ALL.json` is the semantic partition; `MANIFEST-ALL.json` proves that every in-scope working-tree file has exactly one owner.
- Each lane uses `gpt-5.6-terra` at high effort and owns one output directory. Three reader agents run concurrently because Orb's current orchestration law caps audit fan-out at three.
- Package source is paired with its mirrored `tests/` path. Cross-cutting e2e, support, tooling, accessibility, and multi-domain tests have an explicit integration owner.
- Readers complete the full-read barrier before AST exploration. Broad `pnpm ast` lenses receive at least five minutes and are polled to completion.
- A lane is not complete until it has a 100% receipt, command log, rubric-conformant report, current scoped behavioral result or an explicit reason none can run, and coordinator review.

## Priority order

1. Executable package code plus mirrored tests.
2. Gate implementations, verification harnesses, integration tests, root/runtime tooling, and operator paths.
3. Active law, current status, and current design/architecture documents.
4. Proposed, historical, review, and vendored reference corpora.
5. Binary asset integrity and consumer reach.

Priority changes scheduling only. Lower-priority lanes remain in the denominator and cannot be silently omitted from the final full-repository verdict.

## Lane invalidation

- Owned-file hash drift before report completion requires rereading the changed file and updating the receipt.
- Owned-file drift after completion marks the lane stale; it must be refreshed before synthesis.
- Audit-control drift requires rereading the changed control but does not invalidate unchanged owned-source receipts.
- A command that escapes intended scope is stopped, logged, and rerun through the narrow underlying runner. Its partial output receives no lane verdict credit.
- Any official command exiting non-zero requires reading its canonical artifacts before assigning cause: `reports/verify.json`, `reports/verify/<stage>.log`, `reports/test-report.json`, `reports/check-structure.json`, or the command-specific report. The lane reconciles artifact status/tool errors with stdout/stderr, records absent or stale artifacts, and reproduces the narrow underlying stage when needed. A bare exit code is not a finding.

## Coordinator review

The primary session reads each returned report and command log in full. It checks denominators, rung inflation, false absence claims, escaped test scope, gate positive controls, score evidence, and cross-lane handoffs. Failed review goes back to the same warm Terra reader.

## Reduce stage — cold Sol/high synthesis

After every required lane is complete and current, one cold `gpt-5.6-sol` high-effort reader follows `SYNTHESIS-TEMPLATE.md`. It reads every durable artifact in full, reconciles duplicate and contradictory findings, and writes `SYNTHESIS.md`. It does not inherit agent chat summaries or the primary session's conclusions.

## Graduation

The audit graduates only when:

- manifest coverage is exact with zero unassigned and zero multiply assigned files;
- every required lane has all four artifacts;
- all completed receipts reconcile with current owned-file hashes;
- every coordinator rejection is resolved or listed as an explicit incomplete lane;
- Sol's synthesis cites underlying lane and source/command receipts;
- the primary session independently checks the synthesis coverage totals and highest-severity claims.
