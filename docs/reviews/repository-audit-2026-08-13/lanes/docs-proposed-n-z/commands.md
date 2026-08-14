# Commands and receipts

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` on the working tree. The lane assignment snapshot is `41e18afe74afa570b67a3e670a1a38863c486a00`.

| Command / action | Result |
| - | - |
| Full text read of all 32 OWNED files named in `assignment.txt`; full read of all shared prerequisites, including `scripts/codemods/ast.ts` | Completed before analysis. |
| Recomputed line count, byte count, and SHA-256 for every OWNED row | 32/32 match the assignment snapshot; 7,374 text lines and 541,210 bytes. |
| `pnpm ast` | Exit 0; repository structural-search usage read. No code-implementation claim in this report relies on an AST result. |
| `pnpm check:docs` (after writing lane artifacts) | Exit 0: `check:docs — 104 file(s) formatted`. This is a formatter check only, not a current-state or behavioral proof. |
| Local relative-link checker over precisely the 32 OWNED markdown files | 39 local-file links checked; 0 broken. URI targets and same-document anchors were intentionally excluded. The initial version treated `asset:<id>` as a local path; it was corrected to exclude all URI schemes, then rerun. |
| Assigned-only frontmatter scan | 30/32 OWNED files have `status: active` at line 3. `INDEX.md` and no other owned file lacking it are the remaining 2. |
| `git -C /home/inktomi/inktomi-stack/development/orbweaver status --short -- docs/architecture/proposed docs/reviews/repository-audit-2026-08-13/lanes/docs-proposed-n-z` | The 32 assigned source documents were clean; this lane directory was untracked before its three durable artifacts were created. |
| Receipt reconciliation after artifact creation | `assignment_rows=32 receipt_rows=32 receipt_mismatches=0`; all source-document hashes remained current. |

## Scope deviation

An early literal status-word command mistakenly searched all of `docs/architecture/proposed`, which includes sibling-owned files. It was stopped and discarded as evidence. The assigned-only rerun above is the sole status-scan evidence used by `report.md`.

## Exclusions

- No production source, test, configuration, law, or sibling lane artifact was modified.
- No code behavior or historical implementation claim was promoted beyond R0/R1 without a current, scoped code/test receipt.
- No external URLs were fetched; the local-link check cannot validate them.
