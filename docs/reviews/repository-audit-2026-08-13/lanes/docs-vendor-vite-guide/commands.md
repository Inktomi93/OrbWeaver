# Command log — docs-vendor-vite-guide

Working-tree basis: `906d7aa125130e1c4691a7097c6725d8d31d113d`; assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`.

| Command | Result / coverage |
| --- | --- |
| `sed -n '1,$p'` for each owned guide page | Full-read pass completed before searches: 23 / 23 text documents, 6,994 lines, 310,753 bytes. |
| Current-file reconciliation script (line/byte/SHA-256) | 23 valid rows, 0 drifts: every owned current hash equals `assignment.txt`; `read-receipt.tsv` records all rows. |
| `git diff --name-only -- docs/vendor/vite/guide` | Empty: no owned path was dirty. |
| `sed -n '1,$p' scripts/codemods/ast.ts` and bare `pnpm ast` | Current instrument was read and bare invocation completed in 1.4s. It declares `importers` but has no markdown/link/provenance lens. Shared instrument drifted from its assignment row: current 4,495 lines / 246,175 bytes / `7f8dd900…`; assigned 4,099 lines / 223,111 bytes / `3fb78753…`. |
| `pnpm ast importers vite` | Completed: 974 syntactic hits in 956 files, 4,812 scanned typed files (`dts:2`, `ts:3,769`, `tsx:1,041`), zero skipped. Its broad `vite` argument also matches Vitest-related module names, so it is not evidence of an exact Vite consumer. |
| Exact-specifier `rg` and full read of `packages/client/vite.config.ts` / `packages/client/package.json` | Exact Vite imports occur in `packages/client/vite.config.ts:5-6`; the client declares `vite: catalog:` at `packages/client/package.json:48`; root catalog resolves `^8.1.2` at `pnpm-workspace.yaml:252`, lockfile resolves 8.1.2. This is a targeted relevance edge, not a review of the client config. |
| Markdown-target script across all owned pages | 100 root-relative Vite-site links and 68 relative targets. Of those relative targets, 35 do not name an existing repository file verbatim (e.g. `./api-javascript` at `api-plugin.md:261` while the local file is `.md`); 100 root-relative targets likewise require a Vite-site router. This is a local-reference usability check, not an external-host availability check. |
| Metadata scan: `rg -n '^(url|source|version|snapshot|retrieved|updated):|^> (Source|Version|Snapshot|Retrieved):' docs/vendor/vite/guide/*.md` | Every page has only `url: /guide/...` front matter; no owned page states source revision, Vite release, snapshot, retrieval date, or update date. Full reads are the second basis for absence. |
| `pnpm check:docs` | Passed in 12.4s: `node scripts/docs/format-md.ts --check`, 104 files formatted. It checks formatting only, not local target reachability, mirror provenance, or installed-Vite compatibility. |

No command tool failed and no long-running AST command was started. Searches exclude external URL availability, non-owned Vite corpus pages, generated output, and sibling-owned source/test semantics. `.Codex/rules/orchestration.md` was not present in this checkout (filesystem search under the repository found no such path); the missing instruction path is logged as a dispatch-environment issue, not a source finding.
