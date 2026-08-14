# Server transport-kit audit command receipt

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` on 2026-08-13 MDT. Scope was only the 131 `OWNED` rows in this lane's `assignment.txt`; shared prerequisites were read but not assessed. The worktree already had untracked audit/control artifacts; no assigned source or test path was dirty at the initial snapshot check.

## Snapshot reconciliation — 2026-08-13T23:29:07-06:00

```sh
awk -F '\t' '$1=="OWNED" {print $5}' assignment.txt | while IFS= read -r p; do
  lines=$(wc -l < "$p"); bytes=$(wc -c < "$p"); hash=$(sha256sum "$p" | awk '{print $1}')
  printf '%s\t%s\t%s\t%s\n' "$p" "$lines" "$bytes" "$hash"
done
```

Exit 0; duration 1.7s. Reconciled 131 files, 21,111 text lines, and 1,086,543 bytes against `assignment.txt`: 0 mismatches. `git rev-parse HEAD` was `c93253a3f907fb7fd93d411c511a98ed378505db`, whereas the declared snapshot is `e777c47e5860a105c114e061dcf98bcab1baa952`; assigned bytes nevertheless exactly match the declared manifest. The full row output (path, line count, byte count, SHA-256) was captured before analysis; assignment.txt contains the same 131 canonical rows in `lines, bytes, sha256, path` order.

## Full-read and instrument protocol

Read in full: audit README/RUBRIC/REPORT-TEMPLATE/WORKFLOW; lane assignment; AGENTS, Mission, Core-0, Spine-TypeScript-and-Patterns, Spine-Testing; assigned files and their mirrored tests; and `scripts/codemods/ast.ts`. A full semantic replay ran *before the retained AST evidence* at 2026-08-13T23:32:59-06:00:

```sh
awk -F '\t' '$1=="OWNED" {print $5}' assignment.txt | while IFS= read -r p; do
  sed -n '1,$p' "$p" > /dev/null
  read_status=$?
  read_finished=$(date --iso-8601=seconds)
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$p" "$(wc -l < "$p")" "$(wc -c < "$p")" \
    "$(sha256sum "$p" | awk '{print $1}')" "$read_finished" "$read_status"
done
```

Exit 0; duration 1,482ms; 131/131 per-path reads exited 0. `read-receipt.tsv` records each path's first-to-last read completion timestamp, line count, byte count, and SHA-256. No binary file required a text read; only the 0-byte `.gitkeep` was in scope.

Post-read `pnpm ast` — started 2026-08-13T23:33:08-06:00; exit 0; 1,301ms — reconfirmed the repository's resolution-aware reference/consumer instrument and its `unwired` provider-minus-client procedure lens.

Post-read `pnpm ast unwired` — started 2026-08-13T23:33:09-06:00; exit 0; 10,211ms — enumerated 369 procedures and returned 33 candidate procedures in 11 assigned router files. This is a positive candidate lens, not proof of a shipped client gap; client consumption is owned by another lane. No structural absence claim is made from it.

`pnpm ast orphans packages/server/src/kit` — did not produce a completion/exit receipt through the 30-second desktop command yield. Logged as a tool-run completion failure, not evidence of absence. No orphan conclusion relies on it.

## Direct behavioral runs

```sh
pnpm exec vitest run --project unit \
  tests/server/kit/{custom-parameters,image-matte,post-process,reasoning,regex}.test.ts \
  tests/server/transport/trpc/router.test.ts \
  tests/server/transport/trpc/routers/{assets,automation}.test.ts --reporter=default
```

Exit 0; 5.7s; 8 files / 60 tests passed.

```sh
pnpm exec vitest run --project unit \
  tests/server/kit/serde/{card,chat}/index.test.ts \
  tests/server/transport/trpc/stream/{socket,sources/chat}.test.ts --reporter=default
```

Exit 0; 4.5s; 4 files / 98 tests passed.

```sh
pnpm exec vitest run --project integration \
  tests/server/transport/rate-limit.int.test.ts \
  tests/server/transport/trpc/routers/{chat,plugin}.int.test.ts --reporter=default
```

Exit 0; 7.8s; matched 2 files / 12 tests passed (the chat integration file belongs to the serial project).

```sh
pnpm exec vitest run --project integration-serial \
  tests/server/transport/trpc/routers/chat.int.test.ts \
  tests/server/transport/cross-tenant-sweep.suite.int.test.ts --reporter=default
```

Exit 0; 10.5s; 2 files / 4 tests passed.

```sh
pnpm check:tests-membership && pnpm check:tests-execution-membership
```

Exit 0; 5.6s. The type-membership gate accepted all 1,858 test files across four type programs; execution-membership accepted all 1,689 runner-suffixed test files across three runner views. These are current positive controls for test registration, not behavioral proof for every assigned source file.

## Exclusions and drift

No client source, entry composition source, shared gate implementation, or sibling-lane source was examined as an audit subject. `pnpm ast unwired` necessarily inspected the repo's indexed consumer surface internally; its results are reported only as cross-lane candidates. No official command returned nonzero, so canonical official-report inspection was not triggered. Final assigned-file hash refresh is required before synthesis because sibling work may continue.

Closing owned-file refresh — 2026-08-13T23:35:00-06:00: 0 of 131 rows differed from the assignment lines/bytes/SHA-256; receipt totals are 21,111 lines and 1,086,543 bytes. `read-receipt.tsv` has 132 lines (header plus every owned row), with zero incomplete or failed replay rows.
