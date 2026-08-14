# Command log — docs-vendor-baseui-rest

Working-tree basis: `906d7aa125130e1c4691a7097c6725d8d31d113d`; assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`.

| Command | Result / coverage |
| --- | --- |
| `wc -l -c` on all 12 owned paths | 12 files, 7,796 lines, 255,776 bytes: exactly the assignment denominator. |
| `sha256sum` on all 12 owned paths | All current hashes equal `assignment.txt`; recorded in `read-receipt.tsv`. |
| `git diff --name-only -- <12 paths>` | Empty: zero owned paths were dirty. The audit control/artifact directory is untracked, but it is outside the owned corpus. |
| `sed -n '1,$p'` for each owned document | Full-read pass completed before analysis: 12/12 text documents, including the 4,586-line Forms handbook. |
| `sed -n '1,$p' scripts/codemods/ast.ts`; `pnpm ast` | Current AST instrument read; bare command completed in 0.6s and printed supported lenses plus its scan-ledger contract. Shared prerequisite drifted after assignment: current 4,495 lines / SHA `7f8dd900e44392ef66f4482bc9de6ad0412a1b2cea82ad7ab71bd910f7d69bef`, assignment 4,099 lines. |
| `pnpm ast importers @base-ui/react/field` | Complete targeted consumer check: 9 imports in 6 files, 4,812 typed files scanned (`dts:2`, `ts:3,769`, `tsx:1,041`), 0 skipped. This is a package-substring lens, so direct exact-specifier literals were used before describing Field consumers. |
| `rg -n 'from "@base-ui/react/field";' packages/ui/src` | Seven exact current Field imports in five local UI source files; independent literal consumer cross-check. |
| `rg -n -c '\\]\\(/react/(?:components|handbook|utils|releases)/' <12 paths>` | 13 root-relative Base UI-site links: Forms 2, Styling 2, Customization 1, CSP Provider 1, Direction Provider 1, mergeProps 3, useRender 3. The individual locations are in the next command. |
| `rg -n '\\]\\(/react/(?:components|handbook|utils|releases)/[^)]*\\)' <12 paths>`; `test -e docs/vendor/base-ui/react` | The 13 links all target a nonexistent repository-local `docs/vendor/base-ui/react` subtree; this establishes failed offline navigation, not external-host behavior. |
| `nl -ba docs/vendor/base-ui/INDEX.md`; targeted `rg` / `nl` of release, Forms, utility pages | Index gives corpus-level provenance: verbatim `base-ui.com/react/**.md` snapshot, fetched 2026-08-07 against 1.7.0. Release page identifies v1.7.0 / 2026-08-04; handbook and utility pages consistently specify the renamed package. |
| `rg -n 'docs/vendor/base-ui|base-ui\\.com/react|re-fetch|fetch.*Base UI|Base UI docs mirror' scripts tests package.json pnpm-lock.yaml`; root `package.json` scripts inspection | No current re-fetch command or script was identified in the searched executable/config surfaces; the mirror index itself says only that the fetch-script shape is in git history. This is bounded to current runnable/documented surfaces, not a claim about all git history. |
| `pnpm check:docs` | Passed: `check:docs — 104 file(s) formatted`. It proves markdown formatting only; it does not check upstream freshness, external links, or repository-local link targets. |
| Post-write receipt reconciliation | 12 valid rows, zero line/byte/hash mismatches; totals remain 7,796 lines and 255,776 bytes. |

No command tool failed. One multi-module `pnpm ast importers` batch yielded after its first completed query and was not used as evidence; the single Field query above completed. No long-running AST command was started. Searches excluded `node_modules`, generated outputs, remote URL availability, and sibling-owned semantic source/test review except the targeted local consumer/configuration edges described above.
