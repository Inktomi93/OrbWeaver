# Command receipt — server-entry-edge

- 2026-08-14T05:25:04Z — parsed `assignment.txt`; 57 owned paths, 13,572 lines, 663,006 bytes. For every owned path, compared `wc -l`, `wc -c`, and `sha256sum` to its assignment row: zero mismatches; `git diff --name-only -- <owned paths>` and untracked check: zero owned drift.
- 2026-08-14T05:25:44Z — fully traversed every owned file and all 10 shared audit/law prerequisites with `sed -n '1,$p'`; source/test read set completed before AST use. No command failure.
- 2026-08-14T05:25:44Z — `pnpm ast` (bare): exit 0, 0.7s. Read repository instrument (`scripts/codemods/ast.ts`, 4,099 lines) before this use. It exposes alias-resolved import/liveness and tRPC structural lenses.
- `pnpm ast orphans server --in packages/server/src/entry --max 200`: exit 0, 22.31s, result `no results` (instrument scope: entry source, resolution-based; no exclusion reported by tool).
- `pnpm ast testonly server --in packages/server/src/entry --max 200`: exit 0, 21.60s, result `no results` (same scope).
- `pnpm ast unwired --max 200`: exit 0, 9.29s; 369 procedures enumerated, 33 candidates in 11 transport-router files. Those files are sibling-owned; recorded as cross-lane handoff only.
- 2026-08-14T05:28Z — `pnpm exec vitest run --project unit` over 21 explicitly named owned test files: exit 0, 11.20s, 21 files / 326 tests passed.
- 2026-08-14T05:28Z — `pnpm exec vitest run --project integration --project integration-serial` over five explicitly named owned integration suites: exit 0, 3.73s, 5 files / 48 tests passed.
- 2026-08-14T05:28Z — same integration runner over `portability-routes.suite.int.test.ts` and `bundle-round-trip.suite.int.test.ts`: exit 0, 7.64s, 2 files / 4 tests passed.

Structural-negative cross-check: `pnpm ast` is the repository-required resolution-aware instrument. Direct ast-grep was not needed because the repository tool provides the required liveness/unwired lenses. Literal `rg` is not a valid independent confirmation of alias-resolved no-orphan/no-test-only claims and is therefore not represented as one. No source absence finding is issued from these zeroes.

Exclusions: no sibling-owned source/test files inspected semantically; no CT/e2e/live-runtime command was run because this lane's asserted behavior is covered by current integration tests and it does not own an entry into the browser/live harness.
