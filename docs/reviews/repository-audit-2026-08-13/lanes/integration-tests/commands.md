# Command log — integration-tests

All commands ran from the repository root on the working tree. Commands that produced a non-zero result: none. `reports/` is generated and excluded from the audit assignment.

## Read and reconciliation

```text
awk assignment rows → sed -n '1,999999p' for each OWNED path
exit=0; 89 OWNED files; 15,291 lines; 796,602 bytes
```

Current owned-file reconciliation found 0 drifted OWNED rows. Full assigned-row reconciliation in `read-receipt.tsv` found 2 changed SHARED audit controls: `README.md` (48→51 lines, 2,763→3,365 bytes) and `RUBRIC.md` (4,439→4,542 bytes). All 89 OWNED test/support paths still match the frozen assignment SHA-256 values.

```text
sed -n '1,999999p' scripts/codemods/ast.ts >/dev/null
exit=0; 4,099 lines; 223,111 bytes

pnpm ast --help
exit=0; confirmed repository-owned ts-morph instrument and supported verbs.
```

## Structural lenses

```text
pnpm ast exports tests/e2e --max 500
exit=0; 149 exported symbols in 11 files.

pnpm ast callers trpcQuery --in tests/e2e --max 500
exit=0; 23 calls in 3 files.

pnpm ast callers trpcMutation --in tests/e2e --max 500
exit=0; 42 calls in 4 files.

pnpm ast callers startChat --in tests/e2e --max 500
exit=0; 11 calls in 10 files.

pnpm ast callers sendTurn --in tests/e2e --max 500
exit=0; 11 calls in 4 files.

pnpm ast callers openOrCreateChat --in tests/e2e --max 500
exit=0; 9 calls in 6 files.

pnpm ast callers collectChatRoomFrames --in tests/e2e --max 500
exit=0; 10 calls in 3 files.
```

## Behavioral scopes

```text
pnpm exec vitest run --project integration --project integration-serial \
  tests/server/db/db-batch-atomicity.suite.int.test.ts \
  tests/support/chat/scenario.int.test.ts tests/support/db.int.test.ts \
  tests/support/factories/factories.int.test.ts tests/support/fixtures.int.test.ts \
  --reporter=default --reporter=json --outputFile.json=reports/test-report.json
exit=0; 5 files / 28 tests passed; 10.35s.
Canonical reports/test-report.json was read before the later unit command replaced it.

pnpm test:ct --retries=0 tests/client/a11y/accessible-name-quality.suite.ct.tsx
exit=0; canonical reports/ct-report.json: expected=13, unexpected=0, flaky=0; 18.96s.
An unrelated concurrent CT run later overwrote that shared report; this exact scope was rerun and the
canonical report reread at close with the same 13/0/0 result.

pnpm e2e --project=single-user tests/e2e/smoke.spec.ts
exit=0; canonical reports/e2e-report.json: expected=5, skipped=0, unexpected=0, flaky=0; 104.61s.
The runner's configured web-server array provisioned all mode stacks, but Playwright selected only the
single-user smoke file. No credit is claimed for other mode stacks or specs.

pnpm exec vitest run --project unit tests/e2e/support/target-guard.test.ts tests/support/matchers.test.ts \
  --reporter=default --reporter=json --outputFile.json=reports/test-report.json
exit=0; 2 files / 18 tests passed; 2.10s.

pnpm test:types -- tests/e2e/support/mirror-parity.test-d.ts
exit=0 but escaped the requested file scope: the configured types project ran 16 files / 65 tests.
Logged only; it receives no scoped-verification credit.
```

The CT build emitted repeated `Unrecognized target environment "es2025"` warnings from Playwright's Vite/esbuild path, but it completed with 13/13 passing and `errors: []`; no report classification is drawn from warning text alone.
