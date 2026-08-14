# Command log — docs-vendor-baseui-a-m

Working-tree basis: `de133f16c45c0a3dcf6194fbee5c7804b72f8104`; the lane assignment was staged at `41e18afe74afa570b67a3e670a1a38863c486a00`.

| Command | Result / coverage |
| --- | --- |
| `wc -l -c docs/vendor/base-ui/components/{accordion,...,meter}.md` | 19 owned files, 40,103 lines, 1,792,303 bytes; exactly the assignment denominator. |
| `sha256sum docs/vendor/base-ui/components/{accordion,...,meter}.md` | Every one of the 19 current hashes equals `assignment.txt`; see `read-receipt.tsv`. |
| Post-write receipt reconciliation | 19 valid, 0 invalid hashes/line/byte rows; totals remain 40,103 lines and 1,792,303 bytes. |
| `git diff --name-only -- docs/vendor/base-ui/components/{accordion,...,meter}.md` | Empty: no owned working-tree path was dirty. |
| `sed -n '1,$p'` for each owned path | Full-read pass completed before searches; 19/19 text documents. |
| `sed -n '1,$p' scripts/codemods/ast.ts` and `pnpm ast` | Current instrument read; bare command completed in 0.7s. Its supported lenses and epilogue contract were printed. The shared prerequisite drifted from assignment (current: 4,495 lines, SHA `7f8dd900e44392ef66f4482bc9de6ad0412a1b2cea82ad7ab71bd910f7d69bef`; assigned: 4,099 lines). |
| `pnpm ast importers @base-ui/react/accordion` | Complete: 2 imports in `packages/ui/src/primitives/accordion/accordion.tsx:1,8`; scanned 4,812 (`dts:2`, `ts:3,769`, `tsx:1,041`), skipped 0. |
| `pnpm ast importers @base-ui/react/form` | Complete negative: 0 results; same 4,812-file corpus, skipped 0. Literal import search is the independent cross-check for exact module specifiers. |
| `rg -n '@base-ui/react(?:/[a-z-]+)?' packages tests scripts package.json pnpm-lock.yaml` | Literal consumer/provenance cross-check. It finds live import spelling, the `@orb/ui` dependency, surface-manifest/gate tooling, and lockfile version. It is not used as proof of call-path behavior. |
| `rg -c '\\]\\(/react/(?:components|handbook)/...' <19 paths>` | 171 root-relative Base UI-site links across all 19 files (per-file counts retained in terminal transcript); all resolve outside the vendored repository tree. |
| `test -e react` and `test -e docs/vendor/base-ui/react` | Both roots are absent, independently confirming the `/react/...` targets cannot resolve as repository-local pages. |
| `rg -n '^(source|version|snapshot|retrieved|updated):|^> (Source|Version|Snapshot|Retrieved):' <19 paths>` | No matches across all 19 files. Together with full reads, this is the second basis for absent embedded provenance/version metadata. |
| `pnpm check:docs` | Passed: `node scripts/docs/format-md.ts --check`; `104 file(s) formatted`. It checks formatting, not link reachability or upstream-version freshness. |

No command tool failed. No long-running AST process was started. Searches excluded `node_modules`, generated output, and sibling-owned source analysis except targeted consumer/import evidence; no negative claim about runtime behavior is made from those exclusions.
