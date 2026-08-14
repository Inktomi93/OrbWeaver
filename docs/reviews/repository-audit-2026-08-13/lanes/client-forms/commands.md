# Client forms command ledger

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` on 2026-08-14 MDT.

| Command | Exit / duration | Scope and result |
| - | - | - |
| assignment reconciliation: `wc -l`, `wc -c`, `sha256sum` for every `OWNED` row | 0 / 1.0s | 43/43 files, 3,544/3,544 lines, and 184,092/184,092 bytes matched the frozen assignment hashes. |
| `pnpm exec vitest run --project unit` with six assigned form unit/suite paths | 0 / 1.06s | 6 files passed; 24 tests passed. |
| `pnpm test:ct` with all eight assigned CT paths | 0 / 20.4s | CT summary: 34 passed, 0 failed, 0 flaky, 0 skipped. Captured `reports/ct-report.json` immediately; it names exactly the eight requested paths. The normal CT build emitted non-fatal `es2025` target warnings. |
| `pnpm ast importers @orb/client/forms --files` | 0 / <30s | 17 resolved imports in 11 files, including the owned CT stories/tests. |
| `pnpm ast importers '#forms' --files` | 0 / <30s | 101 resolved imports in 78 files, establishing feature-level consumers outside this lane. |
| `pnpm ast orphans packages/client/src/forms --files` | 0 / 24.5s | 0 orphan hits. This result lacks a scan-count receipt, so it supports no negative claim. |

## Exclusions and tool state

- Only this lane's durable artifacts were written. No source, test, configuration, or shared report artifact was changed.
- The CT runner necessarily builds its shared graph. This did not broaden source inspection or a finding beyond the assigned bytes.
- The shared `reports/ct-report.json` was subsequently overwritten by another concurrent lane (it contained 13 expected results on the final recheck). The 34/34 receipt above is from the immediate command summary and immediate JSON read, whose argv named the eight assigned paths; the overwritten file is not attributed to this lane.
- No official command exited nonzero; therefore no failed-command canonical-artifact reconciliation was required.
