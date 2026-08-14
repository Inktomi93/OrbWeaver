# Commands — server-chat-verbs

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` against the working tree.

| Command | Outcome | Receipt / limits |
| - | - | - |
| `git -C /home/inktomi/inktomi-stack/development/orbweaver status --short` | completed | The tree is dirty, but none of the 44 assigned paths appeared in the status output. |
| assignment-driven `wc -l -c` + `sha256sum` | completed | 44 paths; every current SHA-256 matched `assignment.txt`; 22,384 text lines; 1,206,827 bytes. |
| assignment-driven `sed -n '1,$p'` pass | completed | Exit 0 over all 44 assigned text files; receipt reconciled after the read pass. |
| `sed -n '1,$p' scripts/codemods/ast.ts` | completed | Exit 0; 4,099-line AST instrument read before structural use. |
| `pnpm ast` | completed | 0.7 s wall time; bare usage confirmed the repo-native resolution/liveness lenses. |
| `pnpm ast exports packages/server/src/domain/chat/verbs --max 300` | completed | 22 exported declarations in 20 source files. |
| `pnpm ast importers domain/chat/verbs --max 300` | completed | 56 resolved imports in 32 files, including `packages/server/src/domain/chat/service.ts` and the paired tests. |
| `pnpm ast orphans packages/server/src/domain/chat/verbs --max 300` | completed | 23.725 s; no results. Scope is the 20 assigned source files, not a repository-global claim. |
| `pnpm ast testonly packages/server/src/domain/chat/verbs --max 300` | completed | 30.001 s initial poll + 8.306 s completion; no results. |
| `pnpm ast callers createTurn --max 100`; `pnpm ast callers createRequestTurn --max 100` | completed | 4 and 2 calls respectively; production calls are at `packages/server/src/domain/chat/service.ts:128-129`. |
| literal cross-check with `rg ... --stats` over chat/test/known consumer paths | completed | 552 matches, 548 matching lines, 52 files, 163 files searched, 2,509,014 bytes. Exact-name corroboration only; it was not used as structural evidence. |
| `pnpm exec vitest run --project integration tests/server/domain/chat/verbs` | completed | 24/24 files and 540/540 tests passed; Vitest duration 15.82 s, command wall time 18.194 s. No snapshots updated. |

Tool failures: none. Long-running AST commands completed; no timeout was interpreted as absence. The direct Vitest command was path-scoped to `tests/server/domain/chat/verbs` and the `integration` project; it did not invoke `pnpm test` or a repository wrapper.
