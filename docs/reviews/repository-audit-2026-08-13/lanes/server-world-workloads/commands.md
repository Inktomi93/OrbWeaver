# Commands — server-world-workloads

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` against working-tree bytes on 2026-08-13.

| Command | Exit | Elapsed | Scope / result |
| - | -: | -: | - |
| `while …; sed -n '1,$p' "$path" > /dev/null; done < assignment.txt` | 0 | 253.811ms | **Full-read replay:** every one of 213 `OWNED` paths was read from first to last byte; started `2026-08-13T23:11:19.211948868-06:00`, ended `2026-08-13T23:11:19.465516666-06:00` |
| post-read `wc -l -c` + `sha256sum` reconciliation from `assignment.txt` | 0 | 0.8s | 213 paths; 14,453 lines; 673,260 bytes; zero hash, byte, or line drift |
| inventory + SHA-256 reconciliation from `assignment.txt` | 0 | 1.2s | 213 owned paths; 14,453 lines; 673,260 bytes; zero hash, byte, or line drift |
| `pnpm ast --help` | 0 | 1.5s | Read repository structural instrument usage and lenses |
| `pnpm ast orphans packages/server/src/domain/tag --max 200` | 0 | 23.521s | **Post-read rerun**, `2026-08-13T23:13:36.654778601-06:00`–`23:14:00.177876767-06:00`: resolution-based symbol liveness returned `no results` |
| `pnpm ast testonly packages/server/src/domain/tag --max 200` | 0 | 26.144s | **Post-read rerun**, `2026-08-13T23:14:03.350897977-06:00`–`23:14:29.496732870-06:00`: resolution-based test-only lens returned `no results` |
| `pnpm ast prodonly packages/server/src/domain/tag --max 200` | 0 | 12.202s | **Post-read rerun**, `2026-08-13T23:14:32.514926820-06:00`–`23:14:44.719310023-06:00`: entry-closure file lens returned `no results` |
| `pnpm vitest run --project integration tests/server/domain/tag tests/server/domain/workloads tests/server/domain/world-info` | 0 | 24.031s | 73 files / 301 tests passed |
| `pnpm vitest run --project unit tests/server/domain/tool-use tests/server/domain/workloads` | 0 | 2.534s | 8 files / 27 tests passed |
| `pnpm check:orphan-ratchet` | 0 | scoped gate | Current gate output: 0 unexempted orphans and 0 stale public markers; its canonical log pre-dates this audit and was not used as a current receipt |
| `pnpm check:tests-execution-membership` | 0 | scoped gate | Current gate output: 1,689 runner-suffixed tests in three runner views; each view nonempty and every test covered |

## Nonzero command reconciliation

`pnpm verify --help` exited 3 because `verify` deliberately has no `--help` option. This was a command-usage error, not a repository failure. The required canonical artifacts were inspected: `reports/verify.json` is a stale 2026-08-10 static-green receipt; `reports/verify/*.log` are likewise stale; `reports/test-report.json` and `reports/check-structure.json` are newer (2026-08-13) but whole-tree artifacts, outside this lane's direct test scope. Their stale or whole-tree state was not attributed to this lane.

## Structural-tool bounds

`pnpm ast` is the repository's ts-morph workspace instrument; it resolves aliases, re-exports, static/dynamic imports, and its liveness keys on declaration identity. The narrow tag lenses loaded the workspace and reported the post-read results above. No negative claim is made for the remaining three domains from direct AST absence results. Direct `ast-grep` was not required because the repository lens covered the liveness question.

Excluded from this lane: transport/router composition, entry assembly, client typed-proxy consumers, shared laws, and sibling audit artifacts. They are cross-lane edges, not evidence of a defect here.

## Read-barrier ordering correction

The original command record did not retain a full-read command before the earlier AST work. The complete `sed -n '1,$p'` replay therefore occurred **after** those original AST commands, not before them. The three tag commands above were then rerun after that replay and supersede their pre-read receipts. The post-read checksum reconciliation proves the replayed bytes still match the snapshot. All report claims based on tag AST output use the post-read reruns; the pre-read outputs are retained only as superseded history.
