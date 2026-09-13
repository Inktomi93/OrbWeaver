---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-production-drivers — two proofs re-pointed at the PRODUCTION driver (#2225 half b, #2238)

Lane `cb-x-production-drivers`, worktree `.claude/worktrees/agent-adee520ef5eeac7f9`, based on
`fb2deeb98`. Two commits, one per row, no push, no rebase. Both rows had a pin that exercised a
hand-built or injected path beside the door production takes; both now drive the door.

## A — #2225 half (b): the `childExit` producer at `ops/run.ts:320`

**The production path driven.** `tooling/src/verify/ops/run.ts:320` (`childExit: result.code`) — the
ONLY producer of the field — reached through the real `runVerify` (`run.ts:413`), via
`runOneStage`'s unresolvable-command settle at `run.ts:272-275`
(`resolved.kind === "unresolvable" ? { code: null, … }`) and the registry's `lint:hook-syntax` row
(`lib/registry.ts:69`, the tree's only `bash` `argv[0]`). Consumers exercised end to end:
`producedNoVerdict` / `noVerdictStages` (`lib/exit-classifiers.ts:84,93`), the NO-VERDICT block
(`lib/run-render.ts:110-129`) and `VerifyReport.noVerdict` in `reports/verify.json`.

**The drive.** `tests/tooling/verify/ops/run.int.test.ts` — the `fakeBin` + real-`runVerify` shape of
`:120-175`, with one change that fixture cannot express: the child's PATH is REPLACED, not prepended
(a prepend can never make a system program unresolvable). The isolated bin dir carries a fake `pnpm`
(exit 0, printing `Checked 3 files in 0s.` so `lint:biome`'s output audit reads a measurement instead
of refusing — otherwise a SECOND stage lands in the no-verdict list and the arm stops discriminating)
and a symlink to the real `nice`. `HOST_POOL_ROOT_ENV` is redirected into scratch, so the run never
takes the real host-wide whole-run slot.

**Assertions (both directions in one invocation).** ARM 1 (`bash` absent): run exit 2 ·
`[verify] NO VERDICT: 1 stage(s) RAN AND MEASURED NOTHING` on the process's own stdout ·
`‼ lint:hook-syntax — child reported NO exit (killed, timed out, or never spawned)` ·
`report.noVerdict === ["lint:hook-syntax"]` · `Object.is(row.childExit, null)` (null, not absent, not
0\) · the refusal text `its argv[0] "bash" resolves to nothing runnable` in the row's
`failureExcerpt` · **every other stage that RAN carries `childExit: 0`** — the arm that kills a
constant-`null` stub. ARM 2 (negative control, `bash` planted in the same bin dir): exit 0 · no
NO-VERDICT block at all · `noVerdict === []` · `lint:hook-syntax.childExit === 0`.

**Deviation with receipt.** The brief and the fix spec expected the REFUSAL TEXT on stdout. It is not
there: compact mode prints one glyph line per stage and the transcript goes to
`reports/runs/verify/<slot>/stages/<stage>.log` (`run.ts:293`). The assertion therefore reads the
artifact's `failureExcerpt`, which is the route #2225 actually claims ("a refusal that lived only in
the console summary would be invisible to a bot reading the artifact", `lib/stage-command.ts:87-90`).

### Red-first receipts (cp-backed, one command per call, `git status --short` clean after each)

| cut at `run.ts:320` | the new arm | the four pre-existing #2225 arms |
| - | - | - |
| `childExit: 0,` | **RED** — `expected … to contain '‼ lint:hook-syntax — child reported NO exit …'`; the block printed `child exit 0` instead | **all GREEN** (`--list` refusal · TOOL-ERRORS-first · `producedNoVerdict` · `noVerdictStages` · `printSummary`) |
| `childExit: null,` | **RED** — `NO VERDICT: 19 stage(s)`; expected `1 stage(s)` | **all GREEN** (5 passed / 1 failed) |
| restored (`childExit: result.code`) | **GREEN** | GREEN |

That table IS the false clean the row named: the producer can be replaced by either constant and every
committed #2225 assertion stays green.

**Floor.** `pnpm test:scoped tests/tooling/verify/ops/run.int.test.ts` **alone** → exit 0, 81/81,
66.57s (the file's load-sensitive arms, #2308, were not run beside anything else) ·
`pnpm exec biome check tests/tooling/verify/ops/run.int.test.ts --diagnostic-level=error` → 0 ·
`pnpm exec eslint tests/tooling/verify/ops/run.int.test.ts` → 0 ·
`pnpm typecheck --config tsconfig.json` → PASS (the only program the planner named:
`typecheck-plan --primary --file --json` → `{"programs":["tsconfig.json"]}`).

**Seam:** none. No production file changed.

## B — #2238: `runAttest`'s DEFAULT evidence resolver

**The production path driven.** `tooling/src/doc-catalog/ops/attest.ts:226`'s default parameter
(`resolveEvidence: AttestEvidenceResolver = resolveEvidenceErrors`) reached by calling
`runAttest([subject])` with ONE argument — the shape `tooling/src/doc-catalog/cli.ts:62`
(`return runAttest(paths);`) uses, and the only caller in the repo that supplies no resolver.

**Why the two existing arms miss it.** Arm 1 injects its own resolver (proves the driver CONSULTS what
it is handed); arm 2 calls `resolveEvidenceErrors` directly (proves the reader BEHAVES). Neither
touches the binding, which is why v-wave-9a's default cut left the directory green.

**The drive and the no-writes proof.** The subject is taken FROM the production reader, never
hand-pinned: catalogued rows are scanned in sorted batches of 64 through
`resolveEvidenceErrors` and the first row it objects to becomes the subject (today
`docs/design/gate-config-system.md`, index 231 of 919). `runAttest([subject])` then runs with the
default, and the arm asserts exit `EXIT.violations`, the evidence-refusal sentence that exists on no
other path (`attest.ts:90`, "the row's evidence no longer resolves…"), the reader's OWN message inside
it, `NOTHING WRITTEN`, and — the disk fact — `receiptBytes()` byte-identical before and after across
every file in `docs/catalog/receipts`. A corpus that can supply no such row THROWS with instructions
rather than skipping (the file's existing `subjectDocument()` idiom at `:45`).

**Red-first receipt.** Cut `attest.ts:226` to `= () => new Map()`:
`pnpm test:scoped tests/tooling/doc-catalog` → **exit 1, 1 failed / 67 passed across 8 files** — ONLY
the new arm, and for the exact reason: the warning text keeps
`the row is PENDING — it has never been reviewed…` and LOSES
`the row's evidence no longer resolves…`. Arms 1 and 2 stayed green. Restored (`git status --short`
showed only the test file); the same command post-restore → exit 0, 68/68.

**Owed half, REFUSED here with its receipt (approved by the orchestrator mid-run).** The brief's
"isolated corpus" and the success/write arm are not constructible: `ops/tree.ts:26` is
`export const root = REPO_ROOT` and `_shared/artifacts.ts:17` derives `REPO_ROOT` from
`import.meta.dirname` — no env, no parameter. `runAttest` reads `json(LANES_PATH)`, `documents()`,
`loadReceipts(config)`, `headCommit()` through that const (`attest.ts:227-232`) and writes with
`writeFileSync(join(root, write.path), …)` (`attest.ts:248`). A success arm would therefore have to
mutate this checkout's tracked `docs/catalog/receipts/*.json` inside a suite. **Owed to a separate
lane: thread a root through `ops/tree.ts` (every reader plus the writer), then the write arm becomes a
tmp-corpus test.** No seam was added here.

**Also repaired in the same file:** its header claimed the arms red when "the default swapped" — false
before this commit, and the reason nobody looked. Corrected in place with the date and the receipt
rather than deleted.

**Floor.** `pnpm test:scoped tests/tooling/doc-catalog` → exit 0, 8 files / 68 tests (the new arm
11.6s; the batched scan is ~9s to the first refusing row against ~28s for a whole-corpus call —
measured, and the reason the scan is batched) ·
`pnpm exec biome check tests/tooling/doc-catalog/ops/attest.int.test.ts --diagnostic-level=error` → 0 ·
`pnpm exec eslint <same>` → 0 · `pnpm typecheck --config tsconfig.json` → PASS (planner:
`{"programs":["tsconfig.json"]}`).

## LEDGER ROWS (2 rows)

| # | module / file | defect | evidence | class | state |
| -: | - | - | - | - | - |
| 1 | `tooling/src/doc-catalog/ops/attest.ts:169-171` — the reader-sameness claim | The header says the driver judges each row "through `lib/receipt-rules.ts` — the same reader `check:doc-catalog` uses, so a row this verb accepts is a row that stage accepts". It is NOT the same predicate: `resolveEvidenceErrors` calls `receiptEvidenceErrors` unconditionally, while `validateReceiptEntry` (`lib/receipt-rules.ts:251`) returns EARLY for `disposition: "pending"`. attest is strictly stricter on pending rows | measured 2026-09-13 over the whole corpus at `fb2deeb98`: `resolveEvidenceErrors` reports an error for **24 of 919** catalogued rows, and **all 24 are `pending`/`unclassified`/`claims: undefined`** — total pending rows in the corpus is also 24, i.e. the population is exactly "every pending row". Harmless today (a pending row is refused by `rowRefusals` anyway) but the header claim is false, and the new `attest.int` arm now DEPENDS on that population | drifted header / predicate divergence | CLOSED — #2238; 846818115 + 7c63968db; independent acceptance and integrated main receipts below |
| 2 | `tooling/src/doc-catalog/ops/attest.ts` + `ops/tree.ts:26` — the driver has no isolated corpus | `root = REPO_ROOT` (`_shared/artifacts.ts:17`, `import.meta.dirname`) is module-derived, so every read AND the write at `attest.ts:248` are bound to the checkout. The SUCCESS/write half of the driver is unprovable without mutating tracked receipts in a suite — #2238's remaining half | attempted and refused 2026-09-13; the refusal half landed instead at `9f4559234` | untestable production door | CLOSED — #2238; 846818115 + 7c63968db; independent acceptance and integrated main receipts below |

ledger rows OWED: 0 — both findings folded into the refutation ledger with the integrated #2238 disposition.

## Proposed lessons (report text — the orchestrator owns the memory write)

- **A `--repeat`-style "hand-built row" pin and its producer are two different subjects, and the
  producer is usually the one nobody drives.** The tell is a test-local factory (`ranStage`,
  `failedStage`) feeding every arm of a feature: the predicate/list/renderer can all be green while the
  ONE line that computes the field is deletable. Ask "who WRITES this field in production, and does any
  test reach that line" before reading a green pin as coverage. (`childExit`, #2225, 2026-09-13.)
- **An INJECTED seam moves the hole to the default parameter.** Injecting a resolver to make wiring
  provable creates a second, unpinned binding — and the default is the arm production takes
  (`runAttest(paths)`). A seam's pin set is complete only when one arm calls the door with the
  production ARITY. (#2238, twice in two days.)
- **A tool whose root is `import.meta.dirname`-derived cannot be tested in isolation, and no amount of
  fixture cleverness changes that** — the honest move is to land the read-only half, state the missing
  seam by path:line, and file the write half as a lane. (`doc-catalog` `tree.ts:26`.)

## Receipts

```
git show --stat 9d1a4b939 → tests/tooling/verify/ops/run.int.test.ts | 139 +++-  (136 insertions, 3 deletions)
git show --stat 9f4559234 → tests/tooling/doc-catalog/ops/attest.int.test.ts | 98 ++-  (95 insertions, 3 deletions)
git rev-list --left-right --count main...HEAD → 10   2
git status --short → clean apart from this untracked report
```

`main` has moved 10 commits ahead of this lane's base (`fb2deeb98`) while the lane ran; per the brief
the lane did NOT rebase — root integrates.

## Corrective integration leg — #2238 hermetic production default

Independent review refuted the first #2238 pin as a durable floor: it selected a row whose evidence was
already invalid in the mutable live corpus, so repairing the final invalid receipt would make the test fail
while production remained correct. It also exercised only refusal because the tree module bound every read
and write to `REPO_ROOT`.

`runAttestAtRoot` is now the single lexical owner of the attestation operation. Production exports
`runAttestAtRoot(REPO_ROOT)`. An isolated invocation differs only by root and clears inherited Git routing
variables for its scratch repository; its default resolver still calls the real `resolveEvidenceErrors`, and
all document, receipt, evidence, index, ancestry and write operations use that same bound root. The existing
injected-resolver arm remains.

The replacement regression builds two controlled Git repositories. Their reviewed receipt, changed staged
document and code citation are identical. The broken twin removes the cited code: one-argument attestation
must return violations, name the actual typed-evidence error and preserve exact receipt bytes. The healthy
twin keeps the citation: the same one-argument operation must return clean and update the scratch receipt's
hash and commit. No test writes the repository's tracked receipts.

The `resolveEvidenceErrors` header now states the actual relationship: it uses the catalog's typed evidence
grammar, while re-attestation also diagnoses stale evidence on pending rows even though the independent
pending refusal still prevents a write.

### Evidence

- Red-first default cut: replacing the factory's default resolver with an empty map made only the new
  hermetic arm fail; the broken twin incorrectly returned clean and wrote. The injected and direct-reader
  arms remained green. Exact source bytes were restored immediately.
- `pnpm test:scoped tests/tooling/doc-catalog`: 8 tooling files / 68 tests and 3 native type assertions
  passed. Artifact:
  `reports/runs/test/agent-adee520ef5eeac7f9-870770-2026-09-13T08-31-18-833Z/test-report.json`.
- Scoped Biome and ESLint passed for the four touched implementation/test files.
- `pnpm typecheck --config tsconfig.json`: one runnable native program passed.
- `git diff --check`: passed.

No broad structure, whole verification, real-tree catalog write, lifecycle transition or push was run.

## Corrective integration leg — #2225 child lifecycle

Independent review found that the first real-run proof bypassed the repository's process owner: its bespoke
`spawn` created a detached group, listened only for `exit`, and had no error, deadline or teardown path.
A failed spawn could leave the promise unsettled, while a timed-out test could leave the child group alive.

`runIsolatedStatic` now delegates to `_shared/proc.ts#spawnNiced`. The test still passes the isolated PATH as
the child's complete environment and still executes the same generated runner and real `runVerify`; the
shared helper only replaces lifecycle plumbing. Its existing focused controls prove that timeout kills the
whole detached process group and no descendant remains, spawn errors reject, close settles, and a child that
beats the deadline preserves its own exit code. The #2225 test retains the registered missing/resolvable
`bash` arms, exact `childExit` null/zero values, no-verdict rendering and artifact assertions.

### Evidence

- `pnpm test:scoped tests/tooling/_shared/proc.int.test.ts tests/tooling/verify/ops/run.int.test.ts`:
  93/93 passed, including the helper's deadline/group-kill controls and the real runner arm. Artifact
  `reports/runs/test/agent-adee520ef5eeac7f9-890858-2026-09-13T08-35-51-359Z/test-report.json`.
- After the environment type correction, `pnpm typecheck --config tsconfig.json` passed and the complete
  `run.int.test.ts` rerun passed 81/81. Artifact
  `reports/runs/test/agent-adee520ef5eeac7f9-924864-2026-09-13T08-40-09-808Z/test-report.json`.
- One intervening full-file run passed the repaired #2225 arm and 79 other tests but timed out in the
  unrelated `browser:ct scopedArgv` case at its existing 20s budget under load; the immediate complete rerun
  passed that case in 1.087s. This was contention, not a verdict on the repair.
- Scoped Biome and ESLint passed for `run.int.test.ts`; `git diff --check` passed before commit.

No new lifecycle test duplicates the shared helper's existing process-group proof. No runtime source,
timeout value, broad battery, lifecycle state or real verification artifact contract changed.

## Current integration disposition

The historical initial acceptance and refusal above describe the first attempts. Main `0276b6a57` now includes the complete #2225 and #2238 corrective series, including the separate fixture Git-isolation report. Both final independent reviews below accept the aggregate. Main verification passed as recorded in the integrated receipts below.

# #2238 aggregate final review — 2026-09-13

## Verdict

**ACCEPT** commits `9f4559234`, `30836343f`, and `344d1cf7a` as the complete #2238 repair. I found no correctness defect in the production default-reader seam, isolated Git behavior, fixture construction, or the claimed invalid/healthy outcomes.

## Confirmed findings

1. **Production and the test use the same default binding.** `runAttestAtRoot` creates `defaultResolver` by closing over `repoRoot` and `isolateGitEnvironment`, and the returned operation defaults its second argument to that resolver (`tooling/src/doc-catalog/ops/attest.ts:236-255`). `runAttest` is instantiated once as `runAttestAtRoot(root)` and the CLI's existing one-argument call therefore takes this binding. The invalid/healthy regression calls `runAttestAtRoot(fixtureRoot)([FIXTURE_DOC])` with one argument (`attest.int.test.ts:197-213`); it does not inject or recreate an evidence map.

2. **The controlled invalid and healthy repositories exercise actual Git evidence outcomes.** Both fixtures initialize and commit real repositories, commit the original receipt, then stage changed document bytes (`attest.int.test.ts:128-179`). The invalid twin removes the cited tracked code file from the worktree, so the production evidence reader returns the named resolution error; the test requires exit 1 and byte-identical receipt content. The healthy twin retains the code target, requires exit 0, and verifies the written receipt against the changed document SHA-256 and actual fixture `HEAD` (`:197-213`). This proves both refusal/no-write and successful write rather than an unconditional refusal.

3. **All attestation reads and writes are rooted consistently.** Configuration, tracked documents, `HEAD`, index/worktree comparison, receipts, evidence sources, receipt facts, temporary formatter input, and final receipt writes receive `repoRoot` (`attest.ts:185-225,236-263`; `tree.ts:28-63,101-129,184-228,271-322`). `stableJson` takes the formatter binary from the canonical checkout but sets its working directory and temporary file below the supplied root; that is a tool dependency and does not read or write canonical catalog data. The only root-bound helper left in `tree.ts` is `pathsForLane`; attestation does not call `laneAssignments` or that helper.

4. **The test cannot write the main catalog.** Both outcome calls receive scratch roots, every receipt path is joined below that root, and the formatter temporary file is likewise below the scratch root. The invalid twin asserts exact scratch-receipt preservation. The focused run left the reviewed worktree clean in tracked files. No production receipt or catalog writer was invoked against the main root by this review.

5. **Isolated production Git calls clear all routing variables.** When `repoRoot !== root`, `gitOutput`, `gitBlob`, `localEvidenceLines`, and `trackedDocs` invoke `env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git ...`; dependent helpers such as `headCommit`, `headAncestors`, and index comparisons flow through those functions (`tree.ts:66-129,145-181,195-228,271-286`). This covers the Git reads reached by `runAttestAtRoot`.

6. **Fixture Git setup is isolated before production code runs.** The single test helper used for fixture init, config, add, commit, and `HEAD` clears `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE`, disables hooks with `core.hooksPath=/dev/null`, and disables signing (`attest.int.test.ts:118-125,141-175`). There is no alternate fixture Git command except creation of the owned sentinel index itself.

7. **The sentinel is an owned, meaningful red/green control.** The test creates an empty index belonging to a separate scratch repository, records its bytes, exposes it as inherited `GIT_INDEX_FILE`, constructs a complete attestation fixture, and requires byte equality afterward (`attest.int.test.ts:182-195`). The report records the pre-fix red: fixture `git add` replaced the sentinel with five fixture paths. The corrected helper makes the same operation green. Hooks are controlled structurally on every helper invocation; executing an actual hook is unnecessary and would add side effects.

## Verification

- Independent focused run: `pnpm test:scoped tests/tooling/doc-catalog/ops/attest.int.test.ts` passed 4/4 in 2.01s. Artifact: `reports/runs/test/agent-adee520ef5eeac7f9-944167-2026-09-13T08-43-19-354Z/test-report.json`.
- Reviewed the prior aggregate floor receipt: 69/69 runtime tests plus 3/3 native type assertions passed. I did not repeat that full directory floor.
- Reviewed all touched production/test files in full, both lane reports, the three commit diffs, and the root seam review. `git status --short` was clean before and after the focused run.

## Limitations

- The runtime sentinel directly falsifies inherited `GIT_INDEX_FILE`. Clearing `GIT_DIR`, `GIT_WORK_TREE`, and hooks is confirmed from the single helper's command construction and complete call-site census, rather than separate destructive runtime sentinels for each variable.
- The end-to-end arm uses typed `code` evidence. Other evidence kinds remain owned by the shared evidence-reader tests; this aggregate establishes that the default production binding reaches that reader, not a new end-to-end matrix for every evidence kind.

# #2225 production childExit final review

**Verdict: ACCEPT.** Reviewed aggregate commits `9d1a4b939` and `164aabb42c8884268a184c01144aa1b5f82ed3ef`, the complete changed `run.int.test.ts`, the production `runOneStage` path, the shared process helper and its lifecycle tests, and the corrected report. I did not repeat the 81-test real-run file because the committed final artifact already records 81/81 after the correction and source review found no new uncertainty requiring another minute-long floor.

## Production proof

`runIsolatedStatic` still generates a runner that imports the production parser and `runVerify`, selects `--static`, and roots the verification run in scratch. Its child environment replaces PATH with the fixture bin and redirects the host-wide slot root into scratch. `spawnNiced` receives that complete environment; Node resolves its own `nice` wrapper through the supplied PATH, where the test planted a symlink to the real system program. Stage children inherit the same PATH.

With no `bash` in that bin, the real registry's `lint:hook-syntax` row becomes unresolvable at `runOneStage`. Production settles that command as `{ code: null, transcript: ... }`, classifies it, and writes `childExit: result.code` into the stage row. The test requires run exit 2, the exact one-stage no-verdict console block and artifact list, the command-resolution failure excerpt, `childExit` present as null, and zero for every other stage that actually ran. After planting `bash`, the same production route must return clean, print no no-verdict block, carry an empty artifact list, and record `childExit: 0`. These directions distinguish both constant-zero and constant-null producer substitutions while retaining the published report contract.

## Lifecycle correction

The corrective commit removes the bespoke detached `spawn` and delegates to `spawnNiced`. That shared door creates one detached process group, captures both pipes, rejects on `error`, resolves only on `close` after pipe drainage, arms a load-scaled default deadline, and kills the whole process group on expiry (`tooling/src/_shared/proc.ts:362-399`). The existing focused process tests exercise a parent with a descendant through timeout and require both gone, plus the healthy child that exits before deadline with its own code and stdout (`tests/tooling/_shared/proc.int.test.ts:141-164`). The combined builder artifact records those helper tests together with the run test: 93/93.

The run test's scaled 180-second budget exceeds the helper's scaled 120-second default on the same load policy, so the helper owns timeout and group teardown before the Vitest case expires. A spawn failure rejects rather than leaving an unsettled local promise. A normal close returns the complete stdout/stderr used by the same assertions as before. The correction changes test lifecycle plumbing only; production `runVerify`, registry, no-verdict classification and artifact code are untouched.

## Receipts and limits

- Combined helper plus run artifact: `reports/runs/test/agent-adee520ef5eeac7f9-890858-2026-09-13T08-35-51-359Z/test-report.json`, 93/93 passed.
- Final complete run-file artifact after the environment type correction: `reports/runs/test/agent-adee520ef5eeac7f9-924864-2026-09-13T08-40-09-808Z/test-report.json`, 81/81 passed.
- The report discloses one intervening loaded run whose unrelated browser scoped-argv case hit its existing 20-second budget; the immediate final run passed that case. I did not treat that timeout as a verdict on this lane.

The test does not induce a real spawned child with `code: null`; its null arm is the production command-resolution refusal before spawn. Process timeout/group-kill and spawn-error behavior are owned by the shared helper's separate controls. This is the correct separation for the claimed producer: the run arm proves `result.code` reaches the artifact for both unspawned and normally exited registered stages, while the helper corpus proves lifecycle ownership.

No confirmed blocker found.

## Integrated main receipts

At `0276b6a57`, `pnpm test:scoped tests/tooling/doc-catalog` passed 72 runtime tests and 3 native type assertions. Artifact: `reports/runs/test/main-962655-2026-09-13T08-47-42-842Z/test-report.json`. The main population includes three tests beyond the builder worktree; no tests were dropped.

`pnpm test:scoped tests/tooling/verify/ops/run.int.test.ts` passed 81/81. The repaired real producer arm passed in 767ms; artifact `reports/runs/test/main-966834-2026-09-13T08-48-10-638Z/test-report.json`. Both `tooling/tsconfig.json` and `tsconfig.json` passed through the native executor. Scoped Biome and ESLint passed all eight changed TypeScript files across the production-driver and ESLint repair train. No broad program verdict is inferred from these scoped floors.
