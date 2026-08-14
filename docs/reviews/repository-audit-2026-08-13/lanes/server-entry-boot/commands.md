# Commands — server-entry-boot

Scope: the 30 paths in `assignment.txt`; source, data fixtures, and their paired tests only. Timestamps MDT.

| Time | Command / method | Exit | Duration | Scope / result |
| - | - | -: | -: | - |
| 23:06–23:17 | Numbered `awk` full-file reads | 0 | 11m | All 30 owned files, with the largest JSONL files split into non-overlapping line ranges; receipt records each method. |
| 23:17 | `wc -l -c` + `sha256sum` over the exact 30 paths | 0 | <1s | `2306` lines, `285802` bytes; all 30 hashes equal `assignment.txt`. No owned-byte drift. |
| 23:17 | `pnpm ast --help` | 0 | 2.2s | Repository AST instrument examined. |
| 23:19 | `pnpm ast callers runBootMigrations --in packages/server/src --max 50` | 0 | 5.0s | One caller: `packages/server/src/entry/lifecycle.ts:176`. |
| 23:20 | `pnpm ast callers {seedOwner,reclaimLocksOnBoot,seedDemoChats,seedCredentialFromEnv} --in packages/server/src --max 30` | 0 | 25.6s | One caller each, all in `packages/server/src/entry/lifecycle.ts:195,295,291,267`. |
| 23:18 | `pnpm ast orphans packages/server/src/entry/boot --max 200` | unobservable | >30s | Process ran beyond the terminal yield and its final stdout was unavailable. This is a tool-receipt failure, not an absence result; no orphan conclusion is reported. |
| 23:21 | `pnpm vitest run tests/server/entry/boot/{migrate.int,reclaim-locks.int,seed-avatars.suite.int,seed-cas-schedules,seed-credential,seed-default-characters,seed-default-persona.int,seed-default-preset.int,seed-demo-chats.int,seed-owner.int}.test.ts` | 0 | 16.61s | Fresh focused behavioral run: 10 files / 55 tests passed; 6 integration, 3 unit, 1 integration-serial file; Type Errors: none. Full output retained at `/tmp/orb-server-entry-boot-vitest.log` during the audit. |

No official `verify` command was run, so its pre-existing artifacts (`reports/verify.json` at 23:15 MDT and `reports/test-report.json` at 23:05 MDT) were not attributed to this lane. The focused Vitest runner did not create a fresh canonical test-report artifact; its captured stdout is the receipt.

Structural coverage: caller lenses are resolution-aware and each completed with one live caller. No structural negative claim is made. The direct `rg` audit only supported literal/test-inventory receipts, not a negative code conclusion.
