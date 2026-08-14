# Commands and current artifacts

| Command | Result | Scope / evidence |
|---|---:|---|
| `pnpm ast` | 0, 0.384 s | Native AST CLI usage printed; its full implementation was read after the owned-file phase barrier. |
| `pnpm check:structure` | 0, 71.4 s | `scripts/check/report.ts` ran all Q-Z active descriptors; output ended `single-pass: clean`. Current `reports/check-structure.json`: 2026-08-13 22:37:42 -0600, 319025 bytes. |
| `pnpm test -- tests/tooling/check-gates.int.test.ts` | 1, 484.49 s | Package script ran the whole test suite (not just selector): 3,290 suites, 11,340 tests. Q-Z gate registry/conformance tests passed. Four failures belong to `tests/server/infra/providers/vllm/engine/build-argv.test.ts`; see current `reports/test-report.json`. |
| `pnpm ast ident createInvalidation --in packages/client/src --files` | 0 | 4 hits in 3 files: `data/use-invalidation.ts`, `data/index.ts`, `data/invalidation.ts`. |
| `pnpm ast ident reconcileBusCoverage --in scripts/check --files` | 0 | 6 hits in 3 files: `bus-coverage.ts`, `rpg-bus-coverage.ts`, `user-bus-coverage.ts`. |
| `pnpm ast ident createHiddenSpanStreamScrubber --in packages --files` | 0 | 4 hits in 2 files: server `member-visibility.ts`, kit `content/index.ts`; three native lenses together took 42.9 s. |

Artifact reconciliation after the nonzero test run:

- `reports/test-report.json` is current (2026-08-13 22:38:17 -0600, 4,201,832 bytes). It records `check-gates.int.test.ts` passed (3 assertions) and `gate-conformance.int.test.ts` passed (2 assertions, including every contract-form gate's `mustFlag`/`mustPass` proof). Its only relevant failure entry is unrelated `build-argv.test.ts` (four assertions, VLLM argv snapshots/device placement).
- `reports/check-structure.json` is current and clean, produced by the structural command above.
- `reports/verify.json` is stale (2026-08-10 07:14:52 -0600, 3,805 bytes); no `verify` command was run in this lane, so it was not used as evidence. No `reports/verify/<stage>.log` was current/required.
- No baseline or source file was mutated.
