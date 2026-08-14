# Client shell features — command receipt

Snapshot assignment: `c93253a3f907fb7fd93d411c511a98ed378505db`.

## Read and hash barrier

```text
assignment reconciliation: 143 OK, 0 DRIFT
assignment totals: 143 files, 14,943 lines, 807,696 bytes
full-read pass: sed -n '1,$p' over all 143 owned paths completed
owned dirty paths: 0
```

`scripts/codemods/ast.ts` was read through its 4,099 lines / 223,111 bytes; bare `pnpm ast` and `pnpm ast --help` completed. The tool supports resolved importers, production reachability, cycles, and export liveness; this lane used those lenses below.

## Structural receipts

```text
pnpm ast cycles client
RESULT: 0 cycles

pnpm ast orphans packages/client/src/features/app-shell --files
RESULT: 0 hit(s) in 0 file(s)

pnpm ast prodonly packages/client/src/features/{app-shell,auth,config,home,notifications,tag} --files
RESULT for each scope: 0 hit(s) in 0 file(s) from the package.json/knip production-entry closure

pnpm ast importers #features/app-shell  -> main.tsx:28, routes/app-root.tsx:13
pnpm ast importers #features/auth       -> main.tsx:38, routes/login-page.tsx:7, routes/router.tsx:2
pnpm ast importers #features/config     -> main.tsx:59
pnpm ast importers #features/home       -> main.tsx:63
pnpm ast importers #features/notifications -> main.tsx:64
pnpm ast importers #features/tag        -> main.tsx:72
```

The exact feature-directory inventory is 98 tracked files, 97 TypeScript/TSX and one CSS file. `pnpm ast` does not emit a scanned-file denominator; therefore the zero-hit statements above are bounded repository-instrument output, not a whole-client clean claim. Independent literal cross-check: `rg -n 'from "#features/(app-shell|auth|config|home|notifications|tag)"' packages/client/src` found all nine direct importer edges, including the six composition-root edges and auth’s three route edges.

## Behavioral receipts

```text
pnpm exec vitest run --project unit \
  tests/client/features/app-shell/lib/resolve-theme-background.test.ts \
  tests/client/features/app-shell/lib/resolve-theme-scope-tokens.test.ts \
  tests/client/features/auth/lib/auth-error.test.ts \
  tests/client/features/auth/lib/route-guards.test.ts \
  tests/client/features/auth/lib/sso-redirect.test.ts \
  tests/client/features/home/lib/order-home-tiles.test.ts
RESULT: 6 files passed, 40 tests passed, 1.29s.

node node_modules/.pnpm/@playwright+test@1.61.1/node_modules/@playwright/test/cli.js test \
  -c playwright-ct.config.ts tests/client/features/{app-shell,auth,config,home,notifications,tag} --retries=0
RESULT from reports/ct-report.json: 288 expected, 0 skipped, 0 unexpected, 0 flaky, 58,873ms.
RESULT from reports/ct-flaky.json: generatedAt 2026-08-14T06:03:52.307Z, flakyCount 0.
```

One initial `pnpm exec playwright test …` invocation was rejected before execution because tool-guard prepended the package script’s cache-clearing `rm -rf playwright/.cache`, which the execution sandbox forbids. This is an invocation/sandbox limitation, not a product failure; the direct Playwright CLI command above then completed and refreshed the canonical CT artifacts. No official behavioral command exited non-zero.

## Long-running / tool failures

`pnpm ast cycles client` completed in 1.6s. Individual `prodonly` calls completed in under 30s; no AST command reached the five-minute threshold. Tool failures: 1 pre-execution sandbox rejection described above; product defects inferred from it: 0.
