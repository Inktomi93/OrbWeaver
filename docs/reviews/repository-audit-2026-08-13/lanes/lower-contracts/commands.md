# lower-contracts command receipt

All commands used the current dirty working tree at `e777c47e5860a105c114e061dcf98bcab1baa952`.

| Command | Result | Scope / notes |
| - | - | - |
| `sed -n '1,$p' <each assigned file> > /dev/null` | exit 0 | Full byte-stream read of all 175 owned files and all 9 shared prerequisite files. `scripts/codemods/ast.ts` was deferred until the owned read barrier, then streamed in full. |
| `wc -l`, `wc -c`, `sha256sum` for every assignment row | exit 0 | Receipt reports 175/175 owned, 33,797/33,797 lines, 1,949,074/1,949,074 bytes; 9/9 shared, 5,231 lines, 318,147 bytes; every current SHA-256 equals the manifest. |
| `pnpm ast` | exit 0 | Repository-native instrument read after the phase barrier. |
| `pnpm ast exports contracts --files` | exit 0 | 1,442 exports in 94 `packages/contracts/src` files. This command's package-scope output also includes unrelated client registry files, so it is an export inventory, not a contracts-only total without that caveat. |
| `pnpm ast orphans contracts --files` | exit 0 (100s) | Resolution-based liveness: 27 orphan candidates in 15 contracts files; 5 additional candidates star-suppressed in 2 refinery files. The tool intentionally reports these as candidates, not dead-code verdicts. |
| `pnpm ast apisurface contracts --files` | exit 0 (141s) | Resolution-based package boundary lens scanned 4,903 source files: 1,392 own exports, classified as 1,015 public, 315 internal, 30 test-only, 32 unused, with 5 unused candidates star-suppressed. `INTERNAL` and `UNUSED` are candidate classifications, not removal proofs. |
| `pnpm ast testonly contracts --files` | exit 0 (82s) | Resolution-based liveness found 30 exports reached only from tests in 19 contracts files. Candidate list, not an absence or deletion conclusion. |
| `pnpm test -- --project contract` | aborted, exit 1 | The root script ignored the intended scoping and launched all node projects (then CT). It was interrupted after ~30s; it had already shown one failure outside this lane's selected contracts tests. This is not a contracts-test verdict. The command wrote the normal shared `reports/test-report.json` harness output; no source/test/config file was changed by this lane. |
| `pnpm exec vitest run --project contract tests/contracts` | exit 0 (3.90s) | Current working tree; exactly 69 contract test files and 807 tests passed. Direct Vitest intentionally avoids the root wrapper after the wrapper demonstrated scope escape. It does not run the 7 assigned `.test-d.ts` files or the 2 `.suite.test.ts` files. |
| `git -C /home/inktomi/inktomi-stack/development/orbweaver status --short -- packages/contracts tests/contracts docs/reviews/repository-audit-2026-08-13/lanes/lower-contracts` | exit 0 | No owned source or mirrored-test path was dirty at audit time; only this new lane directory is untracked. |

Structural-negative limitation: the resolution-based `orphans` lens has package-level module-resolution coverage, but its zero-free result is not used to claim any absence. Its explicit star-re-export suppression is retained above; no literal fallback was needed because this report makes no negative code claim.
