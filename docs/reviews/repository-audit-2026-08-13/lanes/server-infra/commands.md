# Server-infra lane command log

## Read barrier (completed before AST work)

The owned corpus was read in the `assignment.txt` order (all `OWNED` records only) with the following full-file method:

```bash
awk -F '\t' '$1=="OWNED" {print $5}' docs/reviews/repository-audit-2026-08-13/lanes/server-infra/assignment.txt > /tmp/server-infra-files.txt
sed -n '<first>,<last>p' /tmp/server-infra-files.txt | xargs awk '{printf "%s:%d:%s\\n", FILENAME, FNR, $0}'
```

The reader used sequential batches in this order: `1–15`, `16–30`, `31–95`; every invocation emitted each input file from FNR 1 through EOF, including blank lines, with path and line number. `packages/server/src/infra/network/egress.ts` was additionally emitted alone by the same `awk` method. This log entry and `read-receipt.tsv` were created before `pnpm ast` or direct `ast-grep` use.

Snapshot reconciliation command (working-tree bytes):

```bash
while IFS= read -r f; do wc -l < "$f"; wc -c < "$f"; sha256sum "$f"; done < /tmp/server-infra-files.txt
```

Result: 95/95 owned files, 12,127/12,127 text lines, and 595,707/595,707 bytes. The first comparison printed false DRIFT diagnostics because the shell variable contained literal `\\t`; the displayed numeric/hash values matched their assignment records.

Closing coordinator validation independently read each assigned path with Node, recomputed line count, byte count, and SHA-256, and compared them to `assignment.txt`: 95 files, 12,127 lines, 595,707 bytes, zero mismatches. This supersedes the malformed shell comparison's false diagnostics.

## AST and structural trace

`scripts/codemods/ast.ts` was fully emitted from line 1 through 4,099 before invoking the repository instrument. `pnpm ast` exited 0 and printed its supported resolution-aware lenses. Focused completed lenses (all exit 0):

```bash
pnpm ast importers packages/server/src/infra/network/egress.ts --in packages/server --max 100
# 4 imports in 3 server files: packages/server/src/infra/network/index.ts:10,
# packages/server/src/infra/network/openai-models.ts:3, and
# packages/server/src/infra/plugin-host/membrane.ts:32-33.

pnpm ast callers safeFetch --in packages/server --max 100
# 4 calls in 3 server files: packages/server/src/infra/network/egress.ts:392,414;
# packages/server/src/infra/network/openai-models.ts:59; packages/server/src/infra/plugin-host/membrane.ts:567.

pnpm ast importers packages/server/src/infra/plugin-host --in packages/server --max 100
# 20 imports in 6 server files; live composition at packages/server/src/entry/compose/automation-plugin.ts:53.
```

The code-aware instrument uses ts-morph resolution for importers (including relative and dynamic imports), so no direct `ast-grep` negative was needed or claimed. The structural scope was the workspace projects loaded by `scripts/codemods/ast.ts`; lane findings make no absence claim beyond that positive evidence.

## Behavioral checks

An initial `pnpm test <paths>` command was malformed for scoping: the package script ignores those positional paths and launched the repository-wide test command in background (PID recorded during the later check). It was not used as lane evidence. Its then-current `reports/test-report.json` was a partial/stale artifact for the unrelated provider surface (648 total/642 passed, 0 failed); it was inspected and excluded rather than attributed to this lane.

The intended direct command completed with exit 0 in 18.41s:

```bash
pnpm exec vitest run --project unit --project integration --project integration-serial \
  tests/server/infra/auth tests/server/infra/crypto tests/server/infra/extraction \
  tests/server/infra/image tests/server/infra/network tests/server/infra/plugin-host \
  tests/server/infra/storage
```

Result: 44 files passed, 435 tests passed. This includes 7 integration files / 66 tests (extraction, image, network, storage) and 37 unit files / 369 tests. No contract, CT, or e2e tests are owned by this lane. The direct command did not create a JSON artifact; its reporter stdout is the canonical receipt. `reports/test-report.json` was not reused after the malformed official command.

Closing process reconciliation used `ps -eo pid,ppid,etimes,stat,args` filtered for pnpm/Vitest/Playwright processes and found no surviving runner. The accidentally broad process had exited before coordinator review; no process was killed.
