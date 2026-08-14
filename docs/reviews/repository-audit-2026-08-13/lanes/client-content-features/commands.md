# Command receipt

Snapshot input: `MANIFEST-ALL.json`, lane `client-content-features`; 133 assigned paths.

| Command | Result |
| --- | --- |
| SHA-256 reconciliation against manifest | 133/133 matched; no assigned working-tree hash drift at receipt time. |
| `wc -cl` over assigned paths | 13,804 text lines; 666,239 bytes. |
| `pnpm ast` | Native structural instrument usage read; its full source is 4,099 lines. |
| `pnpm ast importers packages/client/src/features/discovery --in packages/client/src --files` | 58 import edges in 14 client files, including `packages/client/src/main.tsx`. |
| `pnpm ast importers packages/client/src/features/workloads --in packages/client/src --files` | 78 import edges in 25 client files, including `packages/client/src/main.tsx`. |
| `pnpm ast importers packages/client/src/features/world-info --in packages/client/src --files` | 28 import edges in 12 client files, including `packages/client/src/main.tsx`. |
| `pnpm exec vitest run --project unit …` (the seven assigned unit files) | PASS: 7 files, 58 tests, 272 ms. |
| `pnpm test:ct -- tests/client/features/databank tests/client/features/discovery tests/client/features/workloads tests/client/features/world-info` | Started 2026-08-14T06:02:53Z. Playwright CT builds all story modules before filtering and remained in progress while this lane artifact was written; `reports/ct-report.json` then reported 288 expected, 0 unexpected, 0 flaky. This is not a passing result until the process exits and the final report is reread. |

No direct `ast-grep` negative was used; therefore this lane makes no clean-negative claim needing an ast-grep scanned-file denominator.

The first attempted `pnpm ast imports …` was rejected as command misuse (the native verb is `importers`); it produced only usage text and receives no evidentiary credit.

## Assignment and CT coordinator corrections

- A formal rolling `assignment.txt` was subsequently staged at `41e18afe`; its 133 files, 13,804 lines, and 666,239 bytes match the lane receipt/manifest denominator.
- `pnpm test:ct <the 22 OWNED .ct.tsx paths from assignment.txt>` exited 0 with `115 passed · 0 failed · 0 flaky · 0 skipped`.
- Fresh `reports/ct-report.json` recorded `expected=115`, `unexpected=0`, `flaky=0`, `skipped=0`, duration 54.913s, and named exactly the 22 assigned databank/discovery/workloads/world-info CT files.
- This supersedes the original in-flight CT state; no extra `--` separator was used.
