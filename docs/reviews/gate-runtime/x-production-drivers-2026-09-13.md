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
| 1 | `tooling/src/doc-catalog/ops/attest.ts:169-171` — the reader-sameness claim | The header says the driver judges each row "through `lib/receipt-rules.ts` — the same reader `check:doc-catalog` uses, so a row this verb accepts is a row that stage accepts". It is NOT the same predicate: `resolveEvidenceErrors` calls `receiptEvidenceErrors` unconditionally, while `validateReceiptEntry` (`lib/receipt-rules.ts:251`) returns EARLY for `disposition: "pending"`. attest is strictly stricter on pending rows | measured 2026-09-13 over the whole corpus at `fb2deeb98`: `resolveEvidenceErrors` reports an error for **24 of 919** catalogued rows, and **all 24 are `pending`/`unclassified`/`claims: undefined`** — total pending rows in the corpus is also 24, i.e. the population is exactly "every pending row". Harmless today (a pending row is refused by `rowRefusals` anyway) but the header claim is false, and the new `attest.int` arm now DEPENDS on that population | drifted header / predicate divergence | OPEN (no board row; filed by this report) |
| 2 | `tooling/src/doc-catalog/ops/attest.ts` + `ops/tree.ts:26` — the driver has no isolated corpus | `root = REPO_ROOT` (`_shared/artifacts.ts:17`, `import.meta.dirname`) is module-derived, so every read AND the write at `attest.ts:248` are bound to the checkout. The SUCCESS/write half of the driver is unprovable without mutating tracked receipts in a suite — #2238's remaining half | attempted and refused 2026-09-13; the refusal half landed instead at `9f4559234` | untestable production door | OPEN (owed lane: thread a root through `ops/tree.ts`) |

ledger rows OWED: 2

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
