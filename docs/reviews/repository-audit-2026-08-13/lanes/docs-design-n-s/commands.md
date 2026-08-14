# Command receipts

All commands ran from the repository root against working-tree bytes. This lane wrote only its three durable artifacts.

| Command / check | Result | Audit use |
| - | - | - |
| Full `sed -n '1,999999p'` traversal of every `OWNED` and `SHARED` row in `assignment.txt`, then the same traversal of `scripts/codemods/ast.ts` | 27/27 owned documents, 9/9 shared prerequisites, and the AST instrument traversed before source search. | Full-read barrier. |
| Current `wc -l`, `wc -c`, and `sha256sum` for all owned paths | 27/27 current line, byte, and SHA-256 values equal the assignment rows. | Receipt reconciliation. |
| `git status --short -- <owned paths>` and `git diff --name-only 41e18afe... -- <owned paths>` | No output from either command. The concurrent dirty `docs/design/chat-creation-draft-mode-replacement.md` is outside this assignment. | Owned working-tree basis. |
| Bare `pnpm ast` | Exit 0; printed the supported symbol and graph lenses. | Required instrument familiarization. |
| `pnpm ast ident withResolvers --in packages --files` | Completed: 7 hits in 7 files. | Current W4.5 conversion reach. |
| `pnpm ast ident toSorted --in packages --files` | Completed: 27 hits in 25 files. | Current W4.2 conversion reach. |
| `pnpm ast ident createRevealPlugin --in packages/ui --files` | Completed in 18.8 s: 3 hits in 2 files (`markdown.tsx`, `reveal-plugin.ts`). | Current streaming-reveal composition (R3). |
| `pnpm ast ident turnRung --in packages/server/src/domain/rpg --files` | Completed in 22.9 s: 5 hits in `persistence/snapshots.ts`. | Current RPG rewind ladder reach (R3). |
| Repository file inventory for AST scopes | `packages`: 2,133 TS + 605 TSX; `packages/ui`: 208 TS + 102 TSX; RPG scope: 74 TS + 0 TSX. No generated/binary files were included. | Structural-scan scope receipt; no absence conclusion is drawn from these inventories. |
| Full traversal of five specifically cited current tests | 2 unit, 2 integration, and 1 CT file examined (3,045 lines total): OpenRouter runner, platform gate harness, RPG snapshots, reveal-plugin unit, Markdown CT. | Source/test reconciliation; no test execution claimed. |
| `pnpm check:docs` | Exit 0: `check:docs — 104 file(s) formatted`. | Safe docs-format check only; not a path-reference validator. |
| Repository-relative Markdown-link resolver over owned docs (excluding fenced blocks and inline-code samples) | 6 real repository-relative destinations across 27 files; 0 broken destinations. | Markdown link check. Raw inline-code paths were checked separately. |
| Extension-qualified raw-path literal inventory | 42 missing-path candidates across 27 docs. Most are deliberately planned/deleted probes or omit a `.tsx` suffix; the report limits findings to records that simultaneously claim landing/current operation. | Broken-reference lead generation; not a blanket absence claim. |

## Incomplete runs / tool failures

1. A grouped `pnpm ast ident withResolvers ...; pnpm ast ident toSorted ...` call reached the 30-second tool limit after the completed `withResolvers` result and before `toSorted` returned. The latter was rerun alone and completed in 27.9 s; only the completed individual result is credited. No other tool failure occurred.

## Scope and exclusions

- This is a documentation-design lane. Current source and tests were read only where an assigned document specifically claimed a shipped surface; no production behavior was re-run, and no live/probe command was authorized or needed for the two stale-document findings.
- No negative code claim is made. The raw-path inventory reports candidates only and distinguishes planned paths from stale references.
- `pnpm check:docs` touches the repository documentation corpus by design but writes nothing; it is formatting evidence, not semantic or behavioral evidence.
