---
kind: reference
status: active
updated: 2026-08-13
---

# Repository audit protocol

Cold-start audit of the current Orbweaver working tree. The audit establishes what is implemented, wired, tested, enforced, and operationally proven without inheriting prior report conclusions.

## Truth snapshot

`MANIFEST.json` records the audited commit, dirty paths, file assignments, exclusions, and content hashes. Findings apply to that snapshot only. A dirty-path finding states whether it was verified against working-tree bytes, `HEAD`, or both.

## Phase barrier

Every lane executes these phases in order:

1. Read the constitution, lane brief, rubric, and assigned law files in full.
2. Read every assigned file in full, including comments and tests. Chunking is permitted; omission is not.
3. Write `read-receipt.tsv` with every assigned path, line count, byte count, and SHA-256. File coverage must equal 100% before analysis begins.
4. Read `scripts/codemods/ast.ts` in full and run bare `pnpm ast` to learn the repository instrument.
5. Use `pnpm ast` for structural questions. Give broad lenses at least five minutes initially and poll a yielded process to completion. A timeout is a tool failure, never evidence of absence. Direct `ast-grep` is permitted only when the repository tool lacks the required lens; the report names the missing lens and includes scan-count receipts.
6. Write the lane report using `REPORT-TEMPLATE.md`. Do not modify production code, tests, gates, law, or another lane's artifacts.

A lane that cannot complete its read set reports the exact unread files and stops. It does not issue partial codebase conclusions.

Binary files are a deliberate carve-out owned by `binary-assets`. That lane reads every byte through the checksum receipt, validates format/metadata with appropriate parsers, and traces consumers. Binary newline counts are `N/A`; dumping encoded bytes through a text pager is not semantic review.

## Scope rules

- Every in-scope tracked file is owned by exactly one lane.
- Shared prerequisites may be read by every lane but have one analysis owner.
- Generated outputs, vendored code, binary assets, historical archives, and parked proposals are excluded only by an explicit manifest rule with a reason.
- Source and its mirrored tests belong to the same semantic lane where practical. Cross-package harnesses belong to the tooling or integration lane.
- Path existence is never credited as implementation. Findings climb the evidence ladder in `RUBRIC.md`.
- Literal search is allowed for exact strings and config keys. Structural code claims use `pnpm ast` or a validated structural fallback.
- Negative claims require non-zero scan coverage, a second method, and the full-read receipt for the claimed scope.

## Durable outputs

Each lane owns one directory under `lanes/` containing:

- `assignment.txt` — exact paths and shared prerequisites.
- `read-receipt.tsv` — complete-read checksum receipt.
- `report.md` — findings and scorecards.
- `commands.md` — commands, scan counts, exclusions, and tool failures.

The synthesis lane reads every completed lane artifact in full and writes `SYNTHESIS.md`. Transcript summaries are not evidence.

The cold Sol reader follows `SYNTHESIS-TEMPLATE.md`; it cannot begin until the full manifest and every required lane artifact pass coverage reconciliation.
