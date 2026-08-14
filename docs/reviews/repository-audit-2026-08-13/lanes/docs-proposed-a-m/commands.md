# Commands — docs-proposed-a-m

Ran from `/home/inktomi/inktomi-stack/development/orbweaver`. No production, test, config, or shared-audit file was modified.

| Command / method | Result |
| - | - |
| Assignment row / `wc` / SHA-256 reconciliation | 73/73 exact: 64 OWNED (13,570 lines, 937,068 bytes), 9 SHARED (5,234 lines, 318,852 bytes); zero drift. |
| Sequential full-file read (`sed -n '1,100000p'`) | Complete: 18,804 lines, 1,255,920 bytes. |
| `pnpm ast` | Exit 0; repository-native structural instrument available and its usage read. |
| `pnpm ast ident provisionAgentPrincipal --max 20` | No results; paired with literal `rg` cross-check, which found only dormant comments / current human-only kind tuple. |
| `pnpm ast exports packages/server/src/domain/{buddy,crew,hub} --max 1` plus `git ls-files` path count | No results / zero tracked files for each path. |
| `pnpm ast exports packages/server/src/domain/{automation,databank,imagery} --max 12` | 125 hits/42 files; 84/35; 55/18. Declaration/export surface only (R2). |
| Local Markdown-reference script over all 64 OWNED docs | 64 scanned, zero broken local links. No positive control; no clean-strength credit. |
| `pnpm check:docs` | Exit 0: `check:docs — 104 file(s) formatted`. |
| Front-matter classifier | 54 front-matter docs: 45 active, 8 draft; 11 none. 51 documents contain a COMMITTED banner. |
| Ledger reconciliation: D46/D49/D59/D60/D61/D78 | D59 says crew is dead design-only; D60 says AP0–AP2 were purged; D61 says the hub wave is not yet built. |

## Scope limits

No behavioral suite applies to this no-change documentation lane. Formatting is not behavioral proof. The exact negative claims above have a second literal/tracked-file check because `pnpm ast ident` does not provide language scan counts.

