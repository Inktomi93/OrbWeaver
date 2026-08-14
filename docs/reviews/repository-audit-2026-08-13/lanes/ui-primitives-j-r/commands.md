# Command receipt

| Command | Result | Elapsed / scope notes |
| - | - | - |
| `pnpm ast` | exit 0 | 2.0s; instrument usage read. |
| `pnpm ast orphans ui --max 200` | exit 0 | Coordinator terminal rerun completed in 22.7s: 308 typed UI files scanned, 4,614 out-of-scope files skipped, 6 candidates in 6 files. Two are lane-owned public handle types: `MenuHandle` and `PopoverHandle`; candidate output is not promoted to a defect without public-API intent evidence. The two earlier 30s shell-yield attempts are superseded, not treated as timeouts. |
| `pnpm test:ct <13 owned .ct.tsx paths>` | exit 0 | 13.7s; 177 passed, 0 failed/flaky/skipped. Canonical `reports/ct-report.json` read immediately: run duration 12.391s, 177 expected, 0 unexpected; `reports/ct-flaky.json` reports 0 flaky. The runner deleted `playwright/.cache` itself; no manual deletion was performed. |
| `pnpm test <two owned unit paths>` | scope escape / no verdict | the package script ignored its positional paths and began the whole node suite, then its chained CT invocation; execution window ended at 30.3s. Not counted as owned-scope verification. |
| `pnpm exec vitest run --project unit <two owned unit paths>` | exit 0 | 3.2s; 2 files / 22 tests passed. Used only after the package-script scope escape. |
| `wc -l -c` + `sha256sum` over assignment entries | exit 0 | 1.6s; 63 owned files reconcile exactly to assignment snapshot: 7,150 text lines / 344,742 bytes. |

Structural coverage: `pnpm ast` was available. The terminal coordinator rerun of `orphans ui` scanned 308 typed UI files, skipped 4,614 out-of-scope files, and returned 6 candidates, including the lane-owned `MenuHandle` and `PopoverHandle`. This is positive candidate output, not an absence claim or automatic defect; direct ast-grep was unnecessary.

Excluded from production findings: all sibling lanes, generated CT output, shared global test reports, and repository-wide node-suite output after the scope escape.
