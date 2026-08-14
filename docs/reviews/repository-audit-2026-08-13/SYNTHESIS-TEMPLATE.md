---
kind: template
status: active
updated: 2026-08-13
---

# Cold synthesis protocol

The synthesis reader uses `gpt-5.6-sol` at high effort with no inherited conversation. Its inputs are the frozen full manifest, audit controls, and every completed lane artifact. Agent chat summaries are not inputs.

## Phase barrier

1. Read `README.md`, `RUBRIC.md`, `REPORT-TEMPLATE.md`, `MANIFEST-ALL.json`, and `LANES-ALL.json` in full.
2. Inventory every manifest lane and require `assignment.txt`, `read-receipt.tsv`, `commands.md`, and `report.md` for each non-excluded lane.
3. Read every artifact in full before ranking, deduplicating, or issuing a repository-level conclusion.
4. Reject or downgrade lane claims whose receipts do not support their rung, whose denominators are missing, or whose current hashes do not reconcile with the frozen manifest.
5. Reconcile cross-lane edges. Two reports repeating one defect count as one defect with two receipts; contradictory reports remain explicit until the code or command evidence resolves them.
6. Write `SYNTHESIS.md`. Do not modify production code, tests, gates, law, or lane reports.

## Required synthesis sections

- Snapshot and exact coverage: lanes, files, text lines, bytes, binary files, dirty paths, excluded paths, incomplete lanes.
- System map: package cake, composition roots, runtime paths, test tiers, gate registry, operator paths.
- Independent scorecards: implementation, wiring, verification, enforcement, operability by subsystem; never one averaged repo grade.
- Findings by P0–P3, deduplicated and sorted by impact, then confidence.
- Declared versus proven: historical/board claims, R1/R2 scaffolds, R3 wired paths, R4 behavior, R5 current integration or positive-controlled enforcement.
- Proven strengths: only R4/R5 findings with current receipts.
- Gate-to-behavior matrix: what each enforcement family prevents, its scanned denominator, positive control, and blind spots.
- Test reality: current scoped passes/failures, escaped-scope commands, unexecuted tiers, assertion-quality defects.
- Cross-lane contradictions and unresolved uncertainties.
- Right-sized action order: smallest fixes that remove the most real risk; proposals separated from facts.

## Synthesis evidence law

- Every repository-level sentence cites one or more lane finding IDs and their underlying `path:line` or command receipts.
- Severity and confidence remain separate.
- No-matches, green gates without positive controls, stale board rows, and old reports never graduate evidence.
- A dirty-path conclusion states whether it applies to working-tree bytes, `HEAD`, or both.
- The final verdict states what is demonstrably complete, demonstrably incomplete, and not yet knowable.
