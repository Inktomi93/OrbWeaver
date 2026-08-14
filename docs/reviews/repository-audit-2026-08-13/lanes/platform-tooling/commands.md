# platform-tooling command receipt

All commands ran from the repository root on 2026-08-14. Assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`; current HEAD at start: `906d7aa125130e1c4691a7097c6725d8d31d113d`. The working tree contains pre-existing untracked audit artifacts; none of the 22 assigned paths was dirty and all current hashes match the assignment.

| Command / purpose | Duration | Scope / denominator | Exit / result | Artifact inspection / note |
| --- | ---: | --- | --- | --- |
| `git status --short; git rev-parse HEAD; sha256sum <22 owned>` | 0.4s | 22 assigned files, 50,683 bytes, 990 text lines | 0 | Hashes matched assignment; no assigned dirty path. |
| Full reads of assignment, audit README/rubric/template/snapshot policy, 22 owned files, direct mirrored unit test, required shared law files, and `scripts/codemods/ast.ts` | n/a | 22/22 owned | 0 | Receipt is `read-receipt.tsv`; shared sources are prerequisites, not owned report rows. |
| `pnpm ast` | 0.7s | instrument usage | 0 | Bare command printed supported lenses and audit-epilogue contract. |
| `pnpm ast callers buildClaudeSdkEnv --in packages/server/src --max 200` | 5.3s | TS 1,314; TSX 0; 3,498 excluded by `--in` | 0, complete | Two resolved callers: `catalog.ts:57`, `translate.ts:52`; epilogue inspected. |
| `pnpm ast refs HOST_SECRET_ENV_KEYS --in packages/server/src --max 200` | 30.4s | unresolved | yielded before result | Tool invocation produced no canonical epilogue before host yield; not evidence. |
| `pnpm ast reaches agent-sdk --max 200` background attempt | n/a | whole workspace | tool failure | Background child was terminated when command host exited; no output/result artifact. |
| `rg` exact literal test cross-check | 1.0s | 1,291 `*.test.ts`, 647 `*.int.test.ts`, 75 contract, 355 CT, 29 spec, 16 type-test paths | 0 | `init-firewall`: 0 matching test files; `docker/entrypoint.sh`: 1 (`tests/server/infra/providers/backends/agent-sdk/env.test.ts`). |
| `pnpm exec vitest run --project unit tests/server/infra/providers/backends/agent-sdk/env.test.ts` | 5.1s | 1 unit file / 20 tests | 0 | Console result inspected: 1 passed, 20 passed. |
| shell entrypoint positive/negative probe | 0.3s | `docker/entrypoint.sh` | 0 | File secret imported; explicit env prevailed; unreadable `_FILE` refused boot (stderr inspected). |
| selected CT command | 0.0s | 3 direct CT consumers | tool failure | Host guard prepended the sanctioned cache clear then rejected it as an `rm -f` operation; Playwright never started, so no CT result/artifact exists. |

No scope escaped the assigned platform surface except declared cross-lane source/test edges used solely to establish wiring. No official nonzero repository command completed; the two listed failures are harness/tool failures, not clean results.
