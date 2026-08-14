# Commands — docs-design-g-m

All commands ran from the repository root. Read commands are listed as receipts; no source, test, or configuration files were modified by this lane.

| Command | Result | Purpose |
| --- | --- | --- |
| `git rev-parse HEAD` | `875ec3b087b3775876093bc6cc0e08a3e973eacd` | Receipt baseline (the audit snapshot is `41e18afe74afa570b67a3e670a1a38863c486a00`). |
| `wc -l -c` + `sha256sum` on the five assigned documents | pass | Produced the 2,234-line / 192,108-byte receipt in `read-receipt.tsv`; rechecked at close. |
| `sed -n` chunked full-file reads of all five assigned documents | pass | Required complete pre-search reading. |
| `sed -n` full-file reads of relevant gate, HOME, character/chat, RPG, login/weave sources and their named tests | pass | Reconciled shipped behavior only where the design documents made a current-code claim. |
| `pnpm ast` | pass | Confirmed the repository-native AST tool was available before structural queries. |
| `pnpm ast ident ChatsWithCharacterPane` | pass — 7 hits in 4 files | Proved definition/export/composition/test-provider reachability for the shipped character-chat pane. |
| `pnpm ast ident WebWeave` | pass — 8 hits in 5 files | Proved `WebWeave` export and boot/login consumers. |
| `rg -n` / `rg --files` scoped to cited source, test, and doc paths | pass | Literal cross-checks, file inventory, and stale/broken-path checks. |
| `pnpm check:docs` | pass — `104 file(s) formatted` | Safe repository documentation-format check. |
| `pnpm vitest run tests/server/domain/rpg/verbs/game/create-game.int.test.ts tests/server/domain/rpg/swipe-consistency.suite.int.test.ts` | pass — 2 files, 8 tests; type errors none | Fresh behavioral evidence for the Lite creation/full-PHASE boundary and swipe consistency. |

Notes:

- Additional shared `pnpm ast` requests were concurrently running in other audit lanes. This lane did not terminate them or rely on unfinished output.
- The gate-ignore real-tree test deliberately plants and removes `__g_*` directories under shared roots. It was read as evidence but not executed in this shared-worktree audit lane.
