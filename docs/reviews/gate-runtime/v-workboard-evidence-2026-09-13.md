---
kind: review
status: active
updated: 2026-09-13
---

# Independent verification: #1906 / #1920

**Verdict: REFUTED.** The UTF-8 byte-budget implementation itself is coherent and the supplied scoped/live receipts exercise the main write path, but two user-facing workboard instructions still state the superseded character-limit behavior. The change is therefore not complete as claimed.

## Initial findings (2026-09-13)

1. **`pnpm work:item --help` still describes the Project text-field cap as characters.** `tooling/src/workboard/ops/report.ts:275` prints `--evidence over 1024 chars auto-splits`, and `tests/tooling/workboard/cli.test.ts:392` positively locks that stale wording. Exact counterexample: a receipt of 513 `é` characters is only 513 JavaScript characters but 1026 UTF-8 bytes. The help says it is not over the threshold; the confirmed GitHub matrix in `/tmp/catalog-20e3/live-field-probe.json` shows 513 `é` is over the threshold and GitHub rejects it. Expected: help says `1024 UTF-8 bytes`. Actual: help says `1024 chars`.

2. **The orchestrator runbook still claims #1920 has not landed and prescribes the obsolete workaround.** `.claude/skills/orchestrator-runbook/SKILL.md:268` says `--evidence stays under 1024 characters until #1920 lands` and says the promised auto-split exits 2. `/tmp/catalog-20e3/live-cli-after.json` records the corrected CLI successfully verifying and retrying 1025-byte ASCII evidence, reverifying 1200-byte multibyte evidence, and landing it to Closed/Done, all with exit 0. Expected: retire or rewrite the temporary #1920 warning when this fix lands. Actual: the governing operator skill still tells callers the fixed path is broken.

## Evidence checked

- Read all five changed files in full and inspected the production lifecycle, field-write, report/help, parse, and GitHub transport seams.
- Structural search found every `evidenceText(...)` production call in `tooling/src/workboard/ops/lifecycle.ts`: write, retry comparison, done comparison, and done comment all use the same pure transform. `capEvidenceHard(...)` remains wired through all evidence-bearing parser verbs.
- The implementation measures the identity boundary and pointer with `Buffer.byteLength(..., "utf8")`, iterates input by Unicode code point, and slices only at an accumulated complete-code-point boundary. The full original receipt is copied unchanged into the overflow comment, and the SHA-256-derived eight-hex pointer is deterministic.
- Pre-existing Verify rows that contain an accepted unsplit value at or below 1024 UTF-8 bytes remain compatible because the new transform is the identity there. The old over-cap transform produced a 1026-byte ASCII field and could not have successfully persisted through GitHub; `/tmp/catalog-20e3/live-cli-before.json` records that exact exit-2 rejection.
- The fake GitHub field mutation now enforces the measured byte rule, matching `/tmp/catalog-20e3/live-field-probe.json`: ASCII 1024 passes/1025 fails, 512 `é` passes/513 fails, and 256 emoji passes/257 fails.
- Supplied green artifact `reports/runs/test/orbweaver-2389811-2026-09-13T12-55-58-064Z/test-report.json` reports 2/2 files and 73/73 tests passed. The supplied red log records 5 failures/68 passes against the old implementation, including the 1026-byte pointer and CLI rejection. I did not rerun tests, native typecheck, ESLint, or a board call because the lane brief explicitly held them.
- `git diff --check` was clean. No repository files or board state were modified by this review.

## Limitations

The live GitHub and green/red suite artifacts were produced by the parent lane and inspected here; they are corroborating receipts rather than independently executed runs in this verifier lane. The authorized live matrix did not probe arbitrary mixed-width strings at every byte remainder, though the production loop's per-code-point accounting covers that class directly. Fixture isolation and security holds #2333/Q06 were explicitly excluded.

## LEDGER ROWS (2 rows)

| ID | class | module | finding | state |
| - | - | - | - | - |
| WB-EVIDENCE-1 | other (operator guidance) | workboard help | Help and its assertion describe the byte cap as characters. | Repaired and warm-confirmed 2026-09-13: both now say 1024 UTF-8 bytes. |
| WB-EVIDENCE-2 | other (operator guidance) | orchestrator-runbook | The skill retains the superseded #1920 workaround. | Repaired and warm-confirmed 2026-09-13: dated truth-repair retires the workaround and states the verified split behavior. |

Scratch #2336 is protocol evidence, not an additional production defect. The original refutation above is preserved; the closing review is appended below.

## Warm closing verdict (2026-09-13)

**CONFIRMED.** Both ledger rows are repaired in the reviewed tree.

- `tooling/src/workboard/ops/report.ts:275` now describes the threshold as `1024 UTF-8 bytes`, and `tests/tooling/workboard/cli.test.ts:392` asserts that exact operator-visible wording. This resolves WB-EVIDENCE-1 without changing the surrounding help contract.
- `.claude/skills/orchestrator-runbook/SKILL.md:268` now carries a dated #1920 truth-repair: it retires the temporary character-count workaround, names the byte-budgeted head-plus-pointer behavior, preserves the full receipt in the issue comment, and tells the operator to pass the same complete receipt through verification and closure. Commit `377e2ce77c4946704120a6f487a4366a86de99f5` exists in the reviewed repository and matches the cited workboard fix. This resolves WB-EVIDENCE-2.
- A targeted literal sweep found no remaining live `1024 chars`/`1024 characters`, `until #1920 lands`, or `auto-split ... exits 2` workboard guidance outside the preserved historical refutation in this report. The unrelated plugin-contract fixture comment uses `1024 chars` to contrast its own 3072-byte CJK input and is not stale workboard guidance.

The warm pass remained source-only in this verifier lane under the coordinator's hold: I did not rerun tests, native typecheck, ESLint, or board calls. The parent-owned scoped help assertion completed at `reports/runs/test/orbweaver-2443013-2026-09-13T13-04-50-924Z/test-report.json` with success true, one passed, zero failed, and 68 skipped; its scoped docs checks for the runbook/report and the skill validator also exited 0. Those are supplied receipts rather than independently executed verifier runs. The initial 73-test green and scratch #2336 live receipts remain the behavioral evidence for the underlying UTF-8 split.
