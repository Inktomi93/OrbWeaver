# Unit: tooling-floor

Band M. Path: `tooling/src/floor/` (103 files, 13.0K TS + 117 JSON lines, 14 sublayers). This is
the shared machinery under testkit/snap/ui-audit: browser harness, process doors, host slots,
artifacts, variant matrix, the CLI entry contract, and the writing-charter prose checker.
Governing law read in full: `.claude/rules/tooling.md`.

## Sweeps

- Import direction: floor imports `@orb/kit` (17), `@orb/contracts` (1 — the appearance schema),
  and its own package self-path; ZERO relative imports escaping a sublayer, zero sideways tooling
  imports. The floor is a floor. Dep-cruise backs it: `tooling-no-testkit`, `testkit-tooling-doors`
  (tests reach tooling only through per-tool `index.ts` or `floor/`).
- `test-kinds.ts` (the AGENTS.md-named law file) is the enum-tuples door shape, shipped: one
  `as const` table with compiler-enforced totality (`satisfies Record<TestFamily, …>` on runtime
  and timing maps), longest-suffix sort so registry order is not load-bearing, duplicate-suffix
  throw at module load. Crucially the coupled homes are DERIVED, not cited: `vitest.config.ts` and
  `playwright-ct.config.ts` build their include globs FROM `TEST_KIND_DEFINITIONS`, and
  `tests/tooling/floor/testing/test-kinds.test.ts` cross-checks the live vitest config against the
  registry — including refusing project shapes it cannot read and pinning a floor of founding
  suffixes so a derived set cannot narrow unnoticed. A new suffix cannot silently skip a runner.
- `run-tool.ts` header claim "every tool cli enters through it": verified 17/17 `tooling/src/*/cli.ts`.
- `load-budget.ts` header claim (one reading of the box, readable by instruments + configs +
  launcher): live consumers confirmed across `playwright*.config.ts`, `vitest`, `scripts/`,
  `floor/instrument/nav.ts`, `floor/testing/test-tags.ts`. Its "previous home"
  `tests/tooling/_load-budget.ts` is not a stale duplicate — it is the documented vitest seam
  (labels + child runners stay; policy moved down), 11 suites import through it.
- `host-slots.ts`: host-wide (not per-worktree) slot pools under `$XDG_RUNTIME_DIR`, FIFO ticket
  queue, queues-never-refuses with the merge-train cost reasoning on the record. The load number
  behind it (load1 105.8 on a 24-core box) is measured prose with its receipt.
- `variant-matrix`: greedy set-cover over pair obligations, deterministic ordering (sorted
  candidate pool), bounded by pair population — and fail-closed: the engine ends with
  `matrix left N reachable pairs uncovered` → refusal. Generate-and-verify for a combinatorial
  engine.
- `dir-lock.ts`: mkdir mutex with pid + kernel start-ticks holder identity (pid-reuse closed),
  `.reaping` rename guard, wait-budget throw never beside-running-entry.
- `run-marker.ts`: the dual-module-identity trap (vitest reaches the same module by two specifiers
  → two module instances) is closed by memoizing in the ENVIRONMENT, not a module variable — a
  measured fix with the failure story told.
- `prose-rules.ts`/`prose-references.ts` is the D141/writing-charter checker for markdown (dates,
  issue numbers, "used to"/"retired", inventory counts, banned house words with the AGENTS.md
  Glossary as the allow-list, link/backtick path existence). It is LIVE: wired into
  `pnpm doc check` (`doc/ops/check.ts`), exercised by `tests/tooling/floor/prose/*`, and mint
  refuses what check would red. It does not cover code comments — which is why the code corpus
  carries the cites and the markdown corpus does not.
- Escape hatches: 5 biome-ignore suppressions in 13K lines, each with a real reason (POSIX mode
  bitfield, protocol-cadence `waitForTimeout` ×3, ambient env inherit). Zero `any`, zero `@ts-`,
  zero TODO/FIXME.
- Error hygiene: 122 `catch` sites, ZERO empty bodies (multiline scan, positive control = the 122).
- Process-control law: zero raw `process.kill(-pgid)`; `killPidGroup` is the door, and
  `eslint.config.ts` PORTABLE_PROCESS_SYNTAX natively refuses shell `kill`/`bash -c`/`rm`-via-spawn
  outside the three named adapter homes.
- Tests: 70 files under `tests/tooling/floor/`; weak-assertion hits = 3 (sampled, not chased).
- `tests/legacy` cites: 0.

## Findings

- [P2] `tooling/src/floor/prose/prose-rules.ts:3` — the placement justification names importer
  "the instruction-layer walk in `agent-sync/ops/instructions.ts`": file deleted in 821e8f8dff
  (the verify-CLI removal), never re-pointed. Live importers are three modules in `doc/`
  (`lib/rules.ts`, `lib/due.ts`, `ops/check.ts`). Dead-door class, fourth distinct instance — and
  the same false sentence sits in `prose-references.ts:4` ("the instruction-layer walk … are its
  two importers"). The walk's death was RULED: ADR 0333 names agent-sync for deletion explicitly,
  so `.claude/**` markdown losing its charter checker was the decision, not an accident (the
  instruction-files unit's P2 header-budget pair stays open regardless). Suggested direction:
  re-point the headers at the doc-walk importers and say the instruction walk was retired by D333.
- [P2] Nine dead gate-names cited as live policy across the floor — 821e8f8dff deleted the
  `defineGate` custom-gate system (the names' origin; introduced `fb0119058d`, confirmed via
  `git log -S`), but the comments still say "(policy `X`)" as an enforcement claim:
  `tooling-artifact-path-home` (`artifacts/artifact-pointer.ts:230`, `artifacts/artifacts.ts:40`),
  `tooling-artifact-run-slot` (`artifacts/artifact-out.ts:274`), `tooling-browser-door`
  (`browser/debugging-endpoint.ts:4`, `browser/browser.ts:312`), `tooling-cli-entry` +
  `tooling-process-exit-home` (`cli/run-tool.ts:1`, `cli/entrypoint.ts:30`), `tooling-clock-budget`
  (`process/run-marker.ts:74`), `tooling-os-neutral` (`git/git.ts:4`), `tooling-port-registry`
  (`host/ports.ts:39`), `tooling-size` (`variant-matrix/variant-matrix-engine.ts:3`,
  `variant-matrix-sampling.ts:2`). Only `tooling-subprocess-import-owner` resolves (it was re-homed
  as dep-cruiser rule, `.dependency-cruiser.ts:1797`). Some constraints DO have native successors
  under other spellings (os-neutral → PORTABLE_PROCESS_SYNTAX in `eslint.config.ts:370`; the
  entry-identity gates → native hard lint per 6d99e20989), so this is stale-enforcement-prose, not
  necessarily lost enforcement — but each sentence is a false promise to the next cold author, and
  the size cap (`tooling-size`, the 450-line split law cited in `proc.ts` and across ui-audit) has
  NO successor, proved empirically: planted files of 481 and 601 clean lines draw zero Biome
  diagnostics (only a naming complaint on the first), eslint has no `max-lines` in config or any
  policy table, and the policy's only numeric thresholds are complexity 15 / max-params 4. Authors
  still split at the cap by faith (`ui-audit/contract/samples.ts:6` "the cap had already been paid
  in"). DECISION provenance (transcript sweep, 2026-11-10): the deletion was RULED, not forgotten —
  ADR 0333 names the custom Verify framework, agent-sync, baseline ledgers, probes and generated
  reports for deletion, orders "their dedicated tests, dependencies, patches, commands and board
  obligations" removed together, and rules checks "run directly without Verify, check aliases or
  EQUIVALENT REPLACEMENTS for removed analysis reports" + "do not build another policy framework."
  So a native `max-lines` successor is ledger-BANNED unless the owner amends D333; the defect is the
  prose and the ghost-tax splits, not the missing gate. Fix: rewrite the cites to past tense or
  drop them, and the triage integrity item must still refuse a `policy \`X\`` cite that resolves
  nowhere.
- [P3] `tooling/src/floor/http/session-cookie.ts:11` — the two session cookie names are hand-spelled
  a second time in this regex; the owning constants are
  `packages/server/src/infra/auth/modes/cookie-session.ts:23,31`. No translatable door (tooling
  cannot import server, tier direction) and no test pins the two homes together (grep
  `SESSION_COOKIE_MINTED` in `tests/`: zero). A server rename breaks snap/seed logins LOUD (mint
  check goes false),
  so hygiene not correctness; fix = a repo-level int test reading both files, or a contracts-home
  constant both import.
- [P3] D141 archaeology cluster (extends the cross-cutting count): 20 files carry date-stamps
  ("owner addition 2026-09-02", "measured 2026-09-06", the `browser.ts:5` header even narrates a
  dead reason "died with the 2026-08-03 tsx shed"), 156 lines cite issue numbers. Lowest-density
  prose-rot of the code units outside eslint's zero, but present at every sublayer.

## Verdict

reviewed (2 P2, 2 P3, zero fixed in-unit — log-only kept). Mechanically this is the strongest unit
after db: import direction pristine, the one AGENTS.md-named law file (test-kinds) is itself a
generate-and-diff door with derived coupled configs, all header claims I could verify came TRUE
(17/17 clis, load-budget consumers, matrix fail-closed, zero empty catches, kill-law honored). Its
rot is the same phase-wide crime in fresh dress: the gate-system deletion left behind a comment
dialect — "(policy `tooling-*`)" — that names a dead institution nine different ways, plus one
placement header justified by a module that no longer exists. The floor checks everyone else's
doors; nobody checked the sentences about its own.
