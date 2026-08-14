# Command receipt — lower-kit

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` against the current dirty working tree. No command intentionally modified product, test, configuration, or sibling-lane files.

| Command | Exit / result | Scope and notes |
| - | - | - |
| `sed -n '1,$p'` for each assignment-owned path (driven from `assignment.txt`) | 0 | Full-read coverage pass of all 107 owned paths before structural analysis. |
| `sha256sum` + `wc -l -c` for each OWNED/SHARED assignment row | 0 | Generated `read-receipt.tsv`; 107 owned and 9 shared rows; zero checksum drift. |
| `sed -n '1,4099p' scripts/codemods/ast.ts > /dev/null` | 0 | Read the mandated repository AST wrapper after owned-file coverage. |
| `pnpm ast` | 0 | Printed the supported structural lenses and their semantics. |
| `time pnpm ast apisurface kit --public --max 200` | 0 in 2m11.338s | Scanned 4,903 source files. Classified 342 own exports: 262 PUBLIC, 77 INTERNAL, 1 TEST-ONLY, 2 UNUSED. The `--max 200` detail output was capped at 200 rows across 52 files; the summary counts cover all 342 exports. This is a candidate lens: INTERNAL/UNUSED require owner verification before a deletion or visibility change. |
| `pnpm ast importers @orb/kit/macro --max 200` | 0 | Resolved 128 imports in 96 files, including client, contracts, db, server, and tests. This is positive R3 wiring evidence for the macro public module only; it is not a claim about every kit export. |
| `pnpm test -- tests/kit` | incomplete at the 30 s tool deadline | The package script ignored the path as a filter and began its broad node suite plus CT command. Output contained unrelated current-tree failures in server/tooling suites. This run is not a kit verdict. |
| `pnpm exec vitest run --project unit tests/kit` | 0 | Current working tree; 49 test files, 743 tests passed in 5.04 s. This is a focused unit-lane receipt only; it did not run integration, type, contract, CT, e2e, or enforcement gates. |
| `git -C /home/inktomi/inktomi-stack/development/orbweaver status --short -- packages/kit tests/kit` | 0, no output | No dirty tracked paths in the owned source/test scope at observation time. |

## Structural scan coverage

- `apisurface kit --public --max 200`: 4,903 source files scanned; the detailed result covers 52 kit files and is capped to 200 printed rows, while its 262/77/1/2 public/internal/test-only/unused summary covers 342 exports. It is a structural, alias-resolved package-surface scan.
- `importers @orb/kit/macro`: 96 resolved importer files / 128 import sites. The wrapper output mixes `.ts`, `.tsx`, and test files; this lane does not make a negative claim that would require separate TS/TSX zero-count scans and a literal cross-check.
- Excluded from structural claims: sibling packages' implementation internals, server/client composition roots, gates, and browser runtime. They were intentionally not read because they are outside this lane's assignment.
