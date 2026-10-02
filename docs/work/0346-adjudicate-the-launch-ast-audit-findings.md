---
kind: work
status: open
updated: 2026-10-02
priority: P2
area: audit
---

# Adjudicate the launch AST audit findings

## What

Run the current pnpm ast audit commands over the product tree. Validate candidates against live consumers, tests, repository rulings and the board. Record command scopes, complete outputs and dispositions in the session audit report. Evaluate unused future-facing code instead of accepting a future marker as justification. Keep explicitly owner-parked programs held.

## Why

Prelaunch cleanup needs confirmed findings, not unreviewed tool output or speculative retention.

## Done when

Every audit command has a complete result or a precise instrument limitation. Every candidate has an evidence-backed disposition. Confirmed defects are filed with complete acceptance criteria. Existing work is linked rather than duplicated. Symbol and flow queries support the dispositions. No finding is dismissed solely by a future marker.

## Evidence

Command coverage and candidate dispositions live in `reports/launch-ast-audit-2026-10-01/coverage.json` and `reports/launch-ast-audit-2026-10-01/adjudications.json`. Complete command output does not establish completed adjudication. Each result keeps its scope metadata and the source revision it examined.

Start recovery at `reports/launch-ast-audit-2026-10-01/README.md`. It maps command coverage, source adjudication, skeptical reviews, retractions, boarded findings and outstanding native captures.

The reports directory is Git-ignored. A durable local snapshot is kept outside the checkout and temporary directories in the sibling directory named orbweaver-audit-handoff. Its dated snapshot includes the delegated reports, raw reviews, board snapshot and root session handoff. Preserve it during worktree cleanup and history preparation. The archive inventory records source paths and capture time; consult current Git and board state before resuming.

The owner stopped new audit batches. Source-only reviews and pending native captures remain distinguished; neither unfinished commands nor queued repairs are claimed complete. The privacy inventory has been delivered and archived. Its implementation is tracked separately; the inventory is not proof that the scrub is complete.
