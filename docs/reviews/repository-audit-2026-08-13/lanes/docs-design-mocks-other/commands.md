# Commands — docs-design-mocks-other

Working-tree audit basis: `dab3c8440f23ee23883897e446fe80e3838c9b29`; lane assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`.

| Command / action | Result | Audit use |
| --- | --- | --- |
| Full reads of the 26 `OWNED` paths in `assignment.txt`, including markup, comments, SVG, and `DESIGN.md` | complete | Read barrier cleared before structural checks. |
| `wc -l -c` + `sha256sum` for every assigned path | 26 files; 9,610 logical lines; 679,597 bytes; assignment hash diff exit 0 | Receipt reconciliation. `wc -l` is 9,608 because the two 9-logical-line SVGs have no final newline; `awk END{print NR}` is 9 for each and matches the assignment. |
| `sed -n '1,$p' scripts/codemods/ast.ts`; `pnpm ast` | complete; instrument usage displayed | Required instrument read and bare runner receipt. |
| `pnpm ast refs CompareBlocks --max 100` | complete; `scanned=4908`, `matches=11` | Current structural reach: client production import at `packages/client/src/features/refinery/components/accept-review.tsx:14` and JSX consumer at `:107`. |
| `pnpm ast refs RpgTurnConnection --max 100` | complete; `scanned=4908`, no declaration/matches | Narrow historic-name check only; not used for a negative code conclusion. |
| `pnpm ast refs RpgTurnContext --max 100` | complete; `scanned=4908`, `matches=20` | Confirms the crunchy design's named successor is currently declared in chat and used by chat/rpg/tests. |
| `rg --files packages tests` for the referenced refinery/RPG names; full reads of the resulting accept-review component and its CT test plus CompareBlocks implementation/CT test | complete | Interpreted structural results; no claim is based on mock markup functioning as product UI. |
| Exact target existence checks for README references; `rg --files docs/design` + literal `rg` cross-check | 146 `docs/design` files scanned; `docs/design/home-section-spec.md` absent, while historical references name `docs/history/design/home-section-spec.md` | Broken-reference finding. |
| `pnpm check:docs` | exit 0: `check:docs — 104 file(s) formatted` | Current safe documentation check. |
| `git -C /home/inktomi/inktomi-stack/development/orbweaver diff --name-only HEAD -- docs/design/mocks` | no output | No dirty assigned source paths at audit. |

One preliminary broad file-read command traversed `docs/design/mocks` and therefore included sibling-owned `panel-redesign/` files. It was stopped before analysis and contributes no evidence or conclusion in this lane.

Tool failures: none. Long-running AST commands: none; individual `refs` runs completed within the terminal polling window (the largest observed wall receipt was about 30 seconds).
