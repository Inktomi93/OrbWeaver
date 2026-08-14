# dependency-lock command receipt

All commands ran in `/home/inktomi/inktomi-stack/development/orbweaver`. Times are wall-clock receipts from the command runner or `/usr/bin/time`; `—` means the runner did not emit a separate elapsed value. No command wrote a production file, test, gate, law, lockfile, or another lane artifact.

| ID | Command | Exit | Elapsed | Result / coverage |
| - | - | -: | - | - |
| C01 | `sed -n` full reads of `AGENTS.md`, the constitution, audit protocol/rubric/template/snapshot policy, assignment, mission, Core-0, TypeScript spine, and testing spine | 0 | <0.3s each | All assigned shared laws and audit instructions read. |
| C02 | `sed -n '1,500p'` through `sed -n '4001,4500p' scripts/codemods/ast.ts` | 0 | <0.3s each | Current `ast.ts` fully read in nine contiguous ranges, 4,495 lines / 246,175 bytes. |
| C03 | `LC_ALL=C sed -n '1,14341p' pnpm-lock.yaml >/dev/null; awk … pnpm-lock.yaml` | 0 | <0.1s | Full owned-file byte/line pass: 14,341 lines (11,487 nonblank; 2,854 blank), longest line 436 bytes. |
| C04 | `node --input-type=module … import { parseDocument } from 'yaml'` | 1 | <0.1s | Tool failure: root-level ESM resolution could not find `yaml`; no lockfile conclusion taken from this failed parser. |
| C05 | `sha256sum …; wc -l -c …; git -C … rev-parse HEAD; git -C … status --short …` | 0 | <0.1s | Owned lock hash matched assignment; current `ast.ts` did not (recorded in report). HEAD `189f2c71e76e16f947f6de7dd35634d7bffc9c0c`. |
| C06 | `pnpm ast` | 0 | 0.58s | Bare repository-native structural instrument usage read; it prints supported lenses and scan-ledger rules. No query/negative claim was made. |
| C07 | `pnpm install --offline --frozen-lockfile --ignore-scripts` | 0 | 1.10s | Package-manager behavioral integrity check: all seven workspaces already up to date; no lockfile mutation. |
| C08 | `find node_modules/.pnpm …; pnpm store status; pnpm store path; pnpm --version; pnpm list --depth -1` | mixed (overall 0) | 18.9s | Located installed YAML parser. `pnpm store status` returned 1: local store mutations in `@stryker-mutator/core@9.6.1` (patched instance) and esbuild 0.18.20/0.25.12/0.28.1; this is machine-local and excluded from the lockfile verdict. `pnpm list` showed root plus six package workspaces. |
| C09 | `node -e … YAML.parseDocument(pnpm-lock.yaml,{uniqueKeys:true,strict:true}) …` | 0 | 0.3s | Strict parse succeeds: lockfile v9; 7 importers; 161 importer dependency entries; 1,419 package entries; 1,421 snapshots; every package resolution has SHA-512 integrity; 0 tarball/git/local resolutions. |
| C10 | `node -e … lock metadata summary; pnpm dedupe --check --offline` | 1 | 6.11s | Metadata parser succeeds (106 default catalog entries, 2 overrides, 1 patch). `dedupe --check` reports a pending `enhanced-resolve` 5.24.2 → 5.24.3 change under `tsconfig-paths-webpack-plugin@4.2.0`; also warns of peer issues. |
| C11 | `pnpm peers check` | 1 | 0.44s | Two unmet peer sets: `eslint-plugin-jsx-a11y@6.10.2` accepts ESLint ≤9 but the lock resolves ESLint 10.7.0; four `@typescript-eslint/*@8.56.1` packages accept TypeScript <6 but lock resolves 6.0.3. |
| C12 | `pnpm audit --offline` | 1 | 1.41s | Official cached advisory result: 32 vulnerabilities (12 high, 17 moderate, 3 low). Output had no on-disk canonical report artifact. |
| C13 | `node -e … spawnSync('pnpm',['audit','--offline','--json']) …` | 1 | 1.3s | Parsed the full official JSON result: 32 advisories; 0 critical / 12 high / 17 moderate / 3 low. No output truncation used for the counts. |
| C14 | `node -e … full high-advisory finding details …` | 1 | 0.7s | Parsed every high advisory's title, resolved version, and dependency path; the high records include production-reachable server paths for `sharp`, `pdfjs-dist`, `adm-zip`, and `ip-address`. |
| C15 | `rg -n -C … pnpm-lock.yaml; sha256sum pnpm-lock.yaml; git -C … status --short …` | 0 | <0.3s | Exact lockfile line receipts collected; final owned-lock hash remained `561939039fe1be2908269d5407e5185fbd9e5943febfd6ae9d06d5a0f61a7036`. |
| C16 | `sed -n` full reads of the three owned artifacts; `wc`, `sha256sum`, receipt/report invariant checks, and `git -C … status` | 0 | <0.1s | Re-read 132 output lines / 17,393 bytes; the receipt row exactly matches the current owned lock; owned lock hash stayed assigned; only this untracked lane directory changed. |
| Coordinator security validation | online `pnpm audit --json`; full source-path review; focused PDF/upload/image integration tests | mixed: audit 1, tests 0 | Online audit matched 32 total / 12 high, collapsing to 7 package families / 10 GHSAs. Source review established bounded sharp and PDF.js input candidates; 24/24 focused integrations passed normal behavior. See `../../SECURITY-VALIDATION.md`. |

## Structural scan accounting

- `pnpm ast` was run bare as required (C06). No source-code structural query was needed for this lockfile-only lane; therefore no structural negative claim, scan denominator, or direct `ast-grep` fallback exists.
- Lockfile data was parsed strictly in C09 over all 14,341 lines (C03). Exact-key line lookup in C15 was a literal-data corroboration, not a source-code structural claim.
- Scope escapes: 0. The only `node_modules` inspection (C08) located an installed parser and recorded local store status; it did not inspect a sibling-owned source, test, gate, or law file.

## Artifacts and failures

- Generated/modified canonical verification artifacts inspected: none. `pnpm install`, `dedupe --check`, `peers check`, and `audit` did not create repository report files.
- Tool failures/nonzero exits: C04 parser resolution failure; C08 local pnpm store mutation; C10 dedupe drift; C11 peer incompatibilities; C12/C13/C14 official audit findings. C04 and C08 are excluded from code/lockfile correctness claims as stated above; C10–C14 are current lockfile outcomes.
- Behavioral checks, not static substitutes: C07 (offline immutable install), C10 (dedupe), C11 (peer contract), and C12–C14 (package-manager audit).
