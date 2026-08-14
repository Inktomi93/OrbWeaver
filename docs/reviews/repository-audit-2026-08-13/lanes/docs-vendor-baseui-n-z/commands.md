# Command receipts

Working-tree snapshot at lane start: `906d7aa125130e1c4691a7097c6725d8d31d113d`; dispatch snapshot in `assignment.txt`: `41e18afe74afa570b67a3e670a1a38863c486a00`.

| Command | Result |
| --- | --- |
| `sed -n '1,$p'` over all 18 owned Markdown files | Completed before analysis; 18/18 paths read. |
| `sed -n '1,$p' scripts/codemods/ast.ts` | Completed before structural scans. |
| `pnpm ast` | Exit 0; read instrument usage and its audit epilogue contract. |
| `pnpm ast importers @base-ui/react/number-field --max 200` | Exit 0; 2 imports in 1 file; `dts:2, ts:3769, tsx:1041`, 4,812 scanned, complete. |
| `pnpm ast importers @base-ui/react/popover --max 200` | Exit 0; 4 imports in 3 files; `dts:2, ts:3769, tsx:1041`, 4,812 scanned, complete. |
| `pnpm ast importers @base-ui/react/{navigation-menu,otp-field,preview-card} --max 200` | Each exit 0 with zero imports; each scan covered `dts:2, ts:3769, tsx:1041` / 4,812 files, complete. |
| `rg -n --glob '*.{ts,tsx}' '@base-ui/react/(navigation-menu|otp-field|preview-card)' packages tests` | Exit 1 (no matches); literal cross-check covered 4,602 TypeScript/TSX files. This is only absence of a direct Base UI submodule import, not absence of an Orbweaver feature. |
| Node Markdown-link scan of every owned file | Exit 0; 144 route-absolute `/react/...` links across 18 files. `react/` is absent at repository root. Counts are in `report.md`. |
| `rg -n -i '^(version|updated|snapshot|source|fetched|retrieved):' <18 owned paths>` | Exit 1 (no matches); all 18 files have only title/subtitle/description front matter, so the fetched-source URL, snapshot/version, and retrieval date are not locally recorded. |
| `pnpm check:docs` | Exit 0: `check:docs — 104 file(s) formatted`. Formatting only; it does not validate vendor freshness or links. |
| `wc -l -c`, `sha256sum` for all owned paths | 18 files, 27,713 lines, 1,341,243 bytes; all hashes equal `assignment.txt`. Rechecked before report completion. |
| `git diff --name-only` and `git diff --cached --name-only` restricted to all 18 owned paths | No dirty assigned paths. |

No tool failures. The intentionally broad 18-module importer loop was allowed to finish, but its streamed output was incomplete; only the individually captured commands above support findings.
