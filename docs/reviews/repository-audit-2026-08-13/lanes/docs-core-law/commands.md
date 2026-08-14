# docs-core-law command receipt

Working directory: `/home/inktomi/inktomi-stack/development/orbweaver`.

| Command / method | Result | Scope / notes |
| - | - | - |
| `git rev-parse HEAD` | `41cc037359769f79f9eaef94f16a2ff8011d6d8a` | Working tree HEAD; assignment snapshot is `41e18afe74afa570b67a3e670a1a38863c486a00`. |
| Assignment reconciliation shell loop (`wc -l`, `wc -c`, `sha256sum`) | 17/17 paths match assignment lines, bytes, and SHA-256 | 2,817 lines; 594,666 bytes; no owned-byte drift before analysis. |
| Full-read barrier (`sed -n '1,$p'` for every owned path) | completed | 17 owned documents, 2,817 lines, 594,666 bytes. |
| Full-read prerequisite (`scripts/codemods/ast.ts`) | completed | 4,099-line repository AST instrument read before AST work. |
| `pnpm ast` | exit 0 | Printed supported structural lenses and their contracts. |
| `pnpm check:docs` | exit 0: `104 file(s) formatted` | Current formatter check; formatting only, not link/content correctness. |
| Relative-link target scan (read-only Node script) | 35 core docs; 48 relative targets checked; 2 apparent targets were code-example placeholders (`asset:<id>`, `url`) | File-target existence only; fragment anchors and non-core docs were not validated. |
| `pnpm ast ident loadChatCastProducer --in packages/server/src --max 20` | 19 hits in 8 files, including declaration and chat-engine/read call paths | R3 wiring receipt for the cast-producer claim; 30.2 s. |
| `pnpm ast ident resolveRowMacros --in packages --max 30` | 8 hits in 5 files, including kit declaration plus client and server consumers | R3 wiring receipt for the shared-resolver claim; 19.4 s. |
| Literal reconciliation (`rg`) of ledger ranges, D137, debt rider/clean section, docs taxonomy, and docs formatting script registration | matches recorded in report receipts | Exact-string cross-check; not used for structural absence claims. |
| `git ls-files docs | awk -F/ 'NF==2'` | six tracked `docs/` top-level files | Context for the taxonomy contradiction; includes `docs/Mission.md` and `docs/retro-workboard.md`. |
| Owned-size extraction from assignment | `Core-Audits-and-Debt.md` 70,328 B; `Core-Enforcement-Active-Gates.md` 138,664 B; registry 228,033 B | Compared to Documentation-Law's ~40 KB rule and its stated sole exception. |

## Tool failures and limits

- None. Two earlier chained `pnpm ast ident` attempts reached the command yield boundary before every chained subcommand printed; their partial output was not used as evidence. The two single-lens commands above completed and are the only AST receipts cited.
- No behavioral tests were run or read: this documentation lane changed no behavior, and its findings concern direct document contradictions. The source-test lanes own the named test suites.
