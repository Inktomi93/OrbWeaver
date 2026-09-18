---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-eslint-grant-pin — scoped pin for the eslint-grant-liveness positional re-pointing hazard (#2302)

Lane `cb-x-eslint-grant-pin`, worktree `agent-a32c0cc71feff44ee`, based on main tip `c85b35322`. Repair
only, no conversion, no other gate touched.

## The row

Board #2302 (P2, filed from `cb-v-wave-12a` on `9ad17fb5a`): `eslint-grant-liveness`'s positional
re-pointing hazard had NO scoped pin — both floor suites stayed 7/7 green under an index-0 insert that
re-points every RATIFIED row, while the real-tree `runPolicyPass` gave 15 findings.

## Mechanism (re-derived, not assumed)

`RATIFIED` (`tooling/src/verify/gates/eslint-grant-liveness.ts:21-71`) is keyed by POSITIONAL INDEX
(`config[0].ignores[N]`), documented explicitly in the module's own comment at line 53-60 and in
`docs/design/gate-runtime-standardization.md` §12.7 ("AND THE `RATIFIED` TABLES ARE KEYED BY POSITIONAL
INDEX … an entry inserted ABOVE an existing key silently re-points every row beneath it"). Neither
`tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts` (the permanent pin) nor
`tests/tooling/verify/gates/grant-liveness-family.suite.test.ts` (the family conformance net, which drives
`verifyPolicyProofs` over every gate's own declared `mustFlag`/`mustPass` rows) had a row exercising this
shape before this lane.

## RED-FIRST receipt (false clean, on the UNMODIFIED gate)

Before touching the gate, a scratch test (`tests/tooling/verify/gates/__scratch-cbxeslint-probe.int.test.ts`,
untracked, deleted before commit — never staged) proved two things against the tree as it stood at
`c85b35322`:

1. `verifyPolicyProofs([gate])` returned `[]` on the UNMODIFIED module — i.e. today's family test is
   structurally blind to the hazard, because it only drives the rows a module already declares, and this
   scenario was declared nowhere.
2. Driving `runPolicyPass` directly (real dispatcher, `mode: "resource"` fixture matching the module's own
   `mustPass` shape) with one new zero-member `ignores` entry inserted at **index 0** produced **exactly 15
   findings** — the same count the row cites from the real-tree measurement. Driving the identical fixture
   with the new entry **appended at the end instead** produced **exactly 1 finding** (the appended row's
   own dead-selector finding, nothing re-pointed).

Log excerpt (full run in `/tmp/cbx-eslint-scratch-run3.log` at dispatch time, not committed):

```
INDEX0 findings: 15 [...]
APPEND findings: 1 [ 'config[0].ignores[8]: an evaluated ESLint files/ignores selector has ZERO members ...' ]
```

## The fix

Two `mustFlag` rows added to `eslint-grant-liveness.ts` (`gate.mustFlag`), run automatically by
`grant-liveness-family.suite.test.ts`'s `verifyPolicyProofs(policies)` — no new test file needed; the row is
exactly what `mustFlag` exists to express (constitution/gates-and-tooling.md: "A committed family test is
owed only for what a ROW CANNOT EXPRESS").

### Arm (a) — the hazard itself: index-0 insert re-points every RATIFIED row

Fixture: the `mustPass` config's exact `ignores` array with one new zero-member entry
(`"__probe_index0_insert/**"`) prepended.

```
expect: { count: 15, token: "config[0].ignores[1]", messageIncludes: "no longer names the same zero-member selector" }
```

`config[0].ignores[1]` is chosen as the discriminating token because it is a clean example of "a RATIFIED
key resolving to the wrong selector": the key is ratified as `**/dist/**` but, after the shift, the real
selector living there is `**/node_modules/**` — a different by-construction-absent selector, not the one
the row's `cite`/`why` describe.

Count derivation (matches the measured real-tree 15 exactly): 15 = 8 dead-selector findings + 7 stale
findings. `RATIFIED` names SEVEN keys — indices 0, 1, 3, 4, 5, 6, 7 (index 2 and the tail position are not
ratified). Of those seven: six land on ANOTHER zero-member selector after the shift, each contributing one
`reportDeadSelectors` MESSAGE plus one `reportRatifiedArms` MSG_STALE (2 findings each = 12); one
(`config[0].ignores[3]`, ratified as `**/__g_*`) lands on the shifted-in `reports/**`, which now has
members, so only the STALE arm fires (1 finding). That is 7 stale findings total (6 + 1) and 6 of the 8
dead-selector findings. The remaining 2 dead-selector findings are the two positions the shift pushes
OUTSIDE the RATIFIED table entirely — the real `**/dist/**` landing in the previously-unratified
`ignores[2]` slot, and the tail entry pushed past the roster into `ignores[8]` — each an ordinary
unratified dead selector with no stale twin. 8 dead + 7 stale = 15.

### Arm (b) — the green twin

Already present: the gate's existing `mustPass` row (unmodified `ignores` array, identical non-config
files) is the same substrate with no insert. Verified it still passes (0 findings) both by the RED-FIRST
scratch probe and by the full family-test run below — no duplicate row was added since it is byte-identical
in shape to what already exists.

### Arm (c) — the control for the control: append at the end re-points nothing

Fixture: the same `ignores` array with `"__probe_append_end/**"` appended at the END instead of prepended.

```
expect: { count: 1, token: "config[0].ignores[8]", messageIncludes: "ZERO members in its native scope" }
```

Every existing RATIFIED index keeps its own value (nothing shifts), so only the appended row's own
ordinary dead-selector finding appears. This discriminates "an edit that re-points" from "any edit finds
something" — a pure append is safe by construction, matching `gate-runtime-standardization.md` §12.7's
"land new fences at the first indices after the last ratified key" guidance (append is the wrong
placement for a NEW ratified row, but it does not corrupt existing ones).

## Discrimination proof (the pin actually catches a regression)

Probed the real fixed file: `cp` backup, temporarily changed arm (a)'s `expect.count` from `15` to `14`
(a wrong value, one command per Bash call, `mv` restore), re-ran `grant-liveness-family.suite.test.ts`:

```
AssertionError: expected [ { policyId: 'eslint-grant-liveness', arm: 'mustFlag', exampleIndex: 3,
  why: 'an index-0 insert re-points every RATIFIED row beneath it — this is the hazard itself, not a
  coupled-site symptom of it', detail: 'expected effective finding count=14 but got 15' } ] to deeply equal []
```

Restored via `mv eslint-grant-liveness.ts.cbxbak eslint-grant-liveness.ts`; `git status --short` showed
only the intended modified file afterward (the probe never touched `git status` as a tracked diff — it
was restored before the working tree was inspected).

## Floor (all green, in order)

- `pnpm test:scoped tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts tests/tooling/verify/gates/grant-liveness-family.suite.test.ts` — 2 files, 7 tests passed (both before adding the rows at 7/7, and after at 7/7 — the row count did not change because rows attach inside `verifyPolicyProofs`'s single test, not as new `test()` blocks).
- `pnpm check:structure --check eslint-grant-liveness` — real tree, before AND after: `raw 0 = waived 0 + granted 0 + effective 0`, 0 tool errors, 0 alarms, 1/1 selected gate ran. No change on the real corpus (expected — the fix only adds fixture rows, never touches `evaluate()` or the real `RATIFIED` table).
- `pnpm exec biome check tooling/src/verify/gates/eslint-grant-liveness.ts --diagnostic-level=error` — clean.
- `pnpm exec eslint tooling/src/verify/gates/eslint-grant-liveness.ts` — clean, no output.
- `pnpm exec node tooling/src/verify/cli.ts typecheck-plan --primary --file --json -- tooling/src/verify/gates/eslint-grant-liveness.ts` → `tooling/tsconfig.json`; `pnpm typecheck --config tooling/tsconfig.json` — `PASS tooling/tsconfig.json` (11 discovered, 1 runnable).

## Deviations from the brief

- **Substrate is FIXTURE, not the real repoRoot.** The brief allowed either, "say which and why": the
  permanent int test's real-root arm (`eslint-grant-liveness.int.test.ts:54-68`) explicitly stopped
  asserting `effectiveFindings` at #1584 ("the real-tree VERDICT moved to the front door" — `pnpm
  check:structure` owns it now), so there is no committed harness seam that asserts findings against the
  live `eslint.config.js`, and mutating the tracked config file itself to plant a re-pointing insert would
  be editing a real, shared-vocabulary config for a test — exactly the class of probe
  `.claude/rules/gates-and-tooling.md` says to avoid ("prefer a throwaway violation at a scratch path...
  over editing the gate \[or, by the same reasoning, its config] itself"). The `mode: "resource"` fixture
  path is what every other row in this gate's own `mustFlag`/`mustPass` arrays already uses, and it
  reproduced the real-tree's exact measured count (15), so it is both safer and sufficient.
- **No new test FILE.** Per `.claude/rules/gates-and-tooling.md`, "a committed family test is owed only for
  what a ROW CANNOT EXPRESS" — this property is fully expressible as `mustFlag` rows, which
  `grant-liveness-family.suite.test.ts` already drives through the real dispatcher. Adding a bespoke `.int.test.ts`
  would have duplicated that harness for no additional coverage.

## LEDGER ROWS (0 rows)

No additional instrument defect was measured beyond #2302 itself during this repair.

`ledger rows OWED: 0`

## Proposed lessons (text only, not written to memory)

- **A positional `ExemptionTable`'s regression proof belongs INSIDE the gate's own `mustFlag` array, not a
  bespoke test file** — `verifyPolicyProofs` already drives every declared row through the real dispatcher
  via the family test, so a fixture demonstrating a hazard (like an index-shift) is a `mustFlag` row with a
  `count` derived by hand-tracing the fence's own branches, never a new suite.
- **When a hazard's "real tree" verdict has been retired from a permanent pin (moved to a front-door
  check), the discriminating fixture for a NEW proof of that same hazard class still has to be a
  `mode: "resource"` fixture, not the real root** — the real-root arm in this family only proves the policy
  RUNS, not what it finds; count-sensitive proofs live in `mustFlag`/`mustPass`.

## Receipts

Commit and `git show --stat` / `rev-list` receipts are in the final message of this lane's report, taken
after this file was written (this file itself is left untracked per brief instruction, so it is not part
of the commit).

## Integration provenance (2026-09-13)

The proof repair `d106e7f98` and its accounting correction `284875a4c` landed as `335629e2e` and
`61fb1b8ef`; both rebased patches are identical. Independent source review accepted the proof behavior
and required the seven-key correction now recorded above. The integrated two-file floor passed 7/7:
`reports/runs/test/main-4091105-2026-09-13T05-38-36-673Z/test-report.json`.
This receipt covers the positional regression proof, not final gate-program acceptance.
