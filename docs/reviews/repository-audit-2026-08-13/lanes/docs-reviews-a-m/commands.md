# Commands — docs-reviews-a-m

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver`. No source, test, config, or
assigned review document was modified.

| Command | Result |
| - | - |
| assignment reconciliation (`wc -l`, `wc -c`, `sha256sum` for each OWNED row) | 14/14 exact line, byte, and SHA-256 matches; no assigned path was dirty. |
| `sed -n '1,4495p' scripts/codemods/ast.ts >/dev/null` | completed before AST use; repository AST runner read in full. |
| `pnpm ast` | exit 0; runner usage and audit-epilogue contract read. |
| `pnpm ast ident custom_parameters_dropped` | exit 0; 4,812 files scanned (`ts:3769`, `tsx:1041`, `dts:2`), 0 matches, complete. |
| `nl -ba packages/contracts/src/index.ts` | current line 1 reads `public barrel (placeholder; unused — every consumer imports contracts modules directly)`. |
| `nl -ba packages/server/src/domain/import/substrate/chat-input.ts` | current lines 23–80 retain both token axes and variant metadata; lines 98–158 retain converted author-note placement. |
| `nl -ba packages/kit/src/time/index.ts` | current lines 41–80 retain explicit wall-clock-zone conversion and `hostTimeZone()`. |
| `find .claude/agents -maxdepth 1 -type f -name '*.md'` | seven project-agent definitions: executor, forge, mech-executor, security-executor, side-eye, stickler, verifier. |
| `pnpm check:docs` | exit 0: `check:docs — 104 file(s) formatted`. |

## Tool failures

None. One broad multi-command AST invocation was abandoned after its first completed lens so that no partial
later output would be used as evidence; it contributes no finding.
