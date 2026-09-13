---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-instruments-batch — six instrument-debt rows (#2226 · #2228 · #2218 · #2192 · #2193 · #2194)

One lane, one cold read of the instrument tree, six rows. Every floor below is a real exit code from this
worktree (`.claude/worktrees/agent-a3c5638d77b4b7cf7`) at base `badc14944`. Logs live in the lane
scratchpad (`xib-*.log`) and are quoted where they carry the receipt.

## #2226 — the corpus CT left four tRPC pipelines inert

**Fix.** `tests/client/features/discovery/components/corpus-search-results.ct.tsx`'s
`CORPUS_AMBIENT_ROUTES` now feeds the four reads the home dossier makes below the fold —
`workloads.list`, `discovery.topKeywords`, `discovery.unusedCharacters`, `discovery.modelRouting` — each
with the `[]` the whole-app census mount already uses (`tests/client/routes/app-root.ct.tsx:637-640`). No
waiver, no baseline row, no allowance widening.

**The mechanism the row did not name, and it matters.** These four are a CASCADE behind a suspense
boundary: `CorpusContent` → `CorpusHomeSurface` → `QueryBoundary` → `CorpusHomeBody`, and the four
`useQuery` calls are non-suspending reads that cannot be issued until the four SUSPENDING reads above them
(`discovery.home`/`catalog`/`visualArchetypes`/`forgottenGems`, already fed) settle. Only
`CorpusSearchToDossierStory` mounts `CorpusContent`; the file's one test using it clicks through to a
dossier. So on a quiet box the click navigated away before the reads landed and **a scoped
`pnpm test:ct <this file>` reported a clean census** — 18 passed, ratchet silent — while the whole-tree
`browser:ct` run reported all four. The ambient block's own header claimed
`CorpusListSurfaceNavStory` mounts "the CONTENT pane's home dossier beside it"; it does not (it mounts the
LIST surface plus a nav readout), and that drifted sentence is repaired in the same commit.

**Why an in-file pin, not just the four keys.** A defect that is invisible to the lane-scoped instrument
comes back. The file now carries `#2226 the ambient fixture FEEDS every pipeline the mounted section
requests`: it mounts `CorpusSearchToDossierStory`, barriers on the dossier's **settled rendered arm**
(`Nothing in your library yet` — the zero-coverage library's `EmptyState`, which only renders once `CorpusHomeBody`
has rendered and therefore once all four reads have been issued), then polls `trpc.unstubbed()` to `[]`.
The barrier is a settled state, never an in-flight one.

**Red-first receipt** (pin added, fixture unchanged — `xib-ct-red.log`):

```
UNFED-READ RATCHET — 4 violation(s) · 0 refusal(s)
  ✗ … requests `discovery.modelRouting` and never stubs it …
  ✗ … `discovery.topKeywords` …  ✗ … `discovery.unusedCharacters` …  ✗ … `workloads.list` …
CT SUMMARY — FAILED · 18 passed · 1 failed
AssertionError: expected [] but received ["workloads.list","discovery.topKeywords","discovery.unusedCharacters","discovery.modelRouting"]
```

That is the whole-tree run's exact four violations, reproduced at lane scope by the new pin.

**Floor.** `pnpm test:ct tests/client/features/discovery/components/corpus-search-results.ct.tsx` →
**EXIT 0**, `CT SUMMARY — PASS · 19 passed · 0 failed · 0 flaky`, ratchet silent (`xib-ct-green.log`).

## #2228 — `deps:knip` red on unused exports across `tooling/src/verify/contract/**`

**PREMISE CORRECTION (reported mid-run, ruled by the orchestrator).** The row named `pnpm knip:prod`. That
command **EXITS 0** here and on main. The red stage is `deps:knip`, whose argv is the bare `pnpm knip`
(`tooling/src/verify/lib/registry.ts:247-250`), and main's own `reports/verify/deps-knip.log` agrees. The
red is also not a handful: **80 unused exports + 62 unused exported types = 142 rows**, ~75 of them inside
this lane's fence. The orchestrator ruled the fence stays at `contract/**` (three other live lanes own
`verify/lib/**` and `verify/ops/**` tonight), so **`pnpm knip` still exits 1 after this commit** and #2228
does not close here.

**What was done, per export, by reading.**

| Outcome | Count | Rule applied |
| - | -: | - |
| `@public` tag | 57 | The shape is reachable ONLY STRUCTURALLY — a field of an exported shape, an arm of an exported union, or the one-home tuple/alias of an exported vocabulary. This is the house idiom for exactly this class (`contract/config-read.ts`, `lib/css-rules.ts`, `lib/over-art-plate.ts`), and `knip.ts`'s own header calls it "the honest way to keep a real public surface, instead of ignores nobody re-audits". Every tag NAMES the site it is reachable from, so a tag whose reason stops being true reads as stale. |
| deleted | 15 names in 1 block | `contract/readers.ts`'s `export type { BusAnchor, … } from "./bus-fact.ts"` — fourteen names — plus `contract/policy-pass.ts`'s `SelectedGateFact = GateFact`. |

The `readers.ts` deletion is the file's own header enforced: it opens *"Legacy bus-coverage descriptor …
The final shared fact contract lives in bus-fact.ts and has no dependency on this migration residue"*, and
the re-export block was that dependency, forwarded and imported by nobody — every consumer already reaches
`bus-fact.ts` directly. `BusCoverageSpec` (the one thing the file owns, and `lib/bus-coverage.ts`'s only
import from it) stays. `SelectedGateFact` was a bare alias of `GateFact` saying nothing the base type does
not, with no consumer anywhere.

**Why not un-export the vocabulary tuples instead.** A `contract/` tuple is the ONE importable spelling of
its axis (`Spine-TypeScript-and-Patterns.md` §5.5). Un-exporting it is precisely the invitation to the
re-spell `no-inline-union-redecl` exists to stop, so a tuple whose union is exported keeps its export and
states why.

**Floor.** `pnpm knip` before → EXIT 1, 80 + 62. After → EXIT 1, **65 + 3**, and *"Unused exported types"*
is down to three rows, **all outside this fence**. Exactly ONE `contract/**` row survives (below).
RE-RUN AFTER THE REBASE onto main (8 commits): EXIT 1, 65 + **4** — the fourth type row is
`lib/show-artifact.ts:46 LegacyGateView`, introduced by main's own `structure-report`/`show` work and
outside this fence; the `contract/**` count is still exactly the one deliberate row.

**RESIDUAL for the follow-up row** — 68 rows, none in this lane's fence, each with this lane's read:

- `tooling/src/verify/contract/resource-declaration.ts:93 isGateResourceDemandKind` — *delete candidate*. A
  dead type guard: its twin `isGateResourceUnpopulatedKind` has callers, this one has none. Left because it
  is a FUNCTION and this row's subject (and this lane's fence) is the type surface; deleting it cascades
  onto `GATE_RESOURCE_DEMAND_KINDS`, which is a vocabulary judgement, not hygiene.
- `tooling/src/verify/lib/config-static-read.ts:17 ExtractRequest` · `RowExtraction` — *consumer knip cannot
  see*: both are re-exports of `contract/config-read.ts` types that already carry `@public` at their
  declaration; the tag does not travel through the re-export. The fix is a tag on the re-export line or the
  removal of the re-export.
- `tooling/src/verify/ops/eslint-discovery.ts:60 EslintDiscoveryWire` — needs a read of the discovery wire's
  consumer (the ESLint discovery pass writes JSON; the shape may be structural).
- 64 further `Unused exports` rows in `verify/lib/**`, `verify/ops/**`, `verify/gates/_proof/**` and one in
  `tests/tooling/_support.ts` (`ctxAt`). The `_proof/**` block (~15 `*_HOME` / `*_PATH` constants) is one
  family and should be judged as one.

## #2218 — four of five `eslint-tests-coverage.int` tests had no load scaling

Each of the four walks a sequential `calculateConfigForFile` census (the `tests/**` walk is ~2700 files)
inside vitest's raw 5000 ms default, while their one sibling already carried `scaledBudget(15_000)`. All
four now take `{ timeout: scaledBudget(CENSUS_BASE_MS) }`. **`CENSUS_BASE_MS` is 5_000 deliberately** — the
exact ceiling they already ran under, so the change is the SCALING and nothing else. Measured quiet on this
box (`xib-eslint-base.log`): the `tests/**` walk 1453 ms, the package walk 325 ms, the other two below the
reporter's print threshold.

**Floor.** `pnpm test:scoped tests/tooling/eslint-tests-coverage.int.test.ts` → EXIT 0 · 5 passed (before
and after).

## #2192 — the D53 ReDoS watchdog rode a flat 10 s budget

`tests/server/entry/compose/chat.int.test.ts`: the tripwire is now
`{ timeout: budget(REDOS_TRIPWIRE_BASE_MS) }` with the base unchanged at 10_000. The `tests/server`
spelling of the one policy is the bare `budget()` from `@orb/tooling/_shared/load-budget` — the
`scaledBudget` the row named lives in `tests/tooling/_load-budget.ts`, the vitest-tooling seam; the
precedent for a server suite is `tests/server/infra/plugin-host/sandbox.test.ts:31`. Same formula, one
policy.

**One thing the row did not ask for, and why it is in scope.** The same test asserts an ELAPSED ceiling
(`expect(seconds).toBeLessThan(1)`), which is a second flat wall clock over a call that does real db work —
the identical class, one assertion below the one being fixed, and leaving it would be half the fix. It is
now `expect(elapsedMs).toBeLessThan(budget(REDOS_ELAPSED_BASE_MS))` with the base unchanged at 1_000 and
the measurement taken in ms rather than whole seconds. The refutation survives at every factor: the
watchdog throws at ~52 ms and an UNWIRED guard hangs for minutes.

## #2193 — `scripts/ts7.cjs`'s freshness guarantee had no committed pin

New: `tests/tooling/ts7-freshness.int.test.ts`.

**The half that already had a pin is not re-asserted.** `tests/tooling/_shared/concurrency-profile.test.ts`
already pins the ARGV half of §12.7 row 14 — every spelling of `--incremental` / `-i` / `--tsBuildInfoFile`
stripped before spawn, malformed spellings refused before spawn, unrelated argv and the checker cap
preserved — through a `spawnSync` capture preload. The new file pins the BEHAVIOUR that stripping buys.

**The shape.** A two-file temp program in the suite's `scratch` fixture, driven with Vitest's own forced
incremental argv, run three times through the real wrapper: clean → **exit 0**; the error planted in
`dep.ts` → **non-zero, and the diagnostic is `sentinel.ts`'s TS2322 in a file that did not change** (the
\#1892 shape: a retained verdict for an unchanged consumer); source restored → **exit 0**. Nothing is
deleted between the runs — the same `--tsBuildInfoFile` path is handed to all three, and the closing
assertion is that it was never written.

**Planted-break receipt** (`withoutIncremental` reduced to the identity in a `cp`/`mv` scratch copy of the
wrapper — restored, `git status --short` clean afterwards):

```
AssertionError: the wrapper strips --tsBuildInfoFile, so the requested cache must never appear on disk:
expected true to be false
```

The green/red/green triple stayed green under the break, because a DIRECT edit to a root file is an
invalidation warm TS7 does get right — which is exactly why the build-info assertion is in the file and is
stated as load-bearing in its header.

**Floor.** `pnpm test:scoped tests/tooling/ts7-freshness.int.test.ts` → EXIT 0 · 1 passed (1381 ms).

## #2194 — `zod-error-issues-home`'s fail-closed arm was unreachable

**The finding is confirmed on the tree.** `UNREADABLE` was declared and handed to
`reportReviewedGrantCandidates`, but no candidate ever carried `unreadable: true`: `isIssuesMemberRead`
returned `false` for an unplaceable origin, so the read was silently PASSED and the message was unreachable
by any row and by any tree — the #1990 dead-arm shape.

**Chosen arm: make it reachable** (not delete). A read spelled `issues` whose origin the shared readers
cannot place is the exact case the fail-closed doctrine is about, and the sibling exemplars
(`no-inline-invalidate-outside-seam`, `persistence-boundary`) already carry the three-verdict shape. The two
boolean predicates become one `IssuesVerdict` classifier (`"zod" | "other" | "unreadable"`), the visitor
carries `unreadable: verdict === "unreadable"`, and `mustFlag[4]` reaches it with
`expect: { count: 1, messageIncludes: "CANNOT be established" }` over an opaque (`any`) receiver. The two
messages stay disjoint, which is the whole point: both arms emit exactly ONE finding, so a bare `count: 1`
would pass whether the arm fires or is dead.

The header records the DECLARED LIMIT that survives: a destructure with no `VariableDeclaration`
initializer (a parameter pattern) is not a candidate at all — there is no receiver expression to take a
type from — and it never was.

**Red-first receipt** (row added, classifier unchanged):

```
1 conformance failure(s)  ·  arm mustFlag, exampleIndex 4
"detail": "expected at least one effective finding but got 0"
```

**Floors.** Scoped conformance over this policy (`verifyPolicyProofs([gate])`) → 0 failures, EXIT 0.
Real tree, before AND after (`pnpm check:structure --check zod-error-issues-home`): **identical** —
`population 3386 source · granted 8 · raw 8 = waived 0 + granted 8 + effective 0 · 0 alarm(s) · 0 tool
error(s) · 0 withheld`, EXIT 0. The widening therefore costs zero new real-tree findings: no `issues` read
in `packages/**` has an unplaceable origin today.

## After the rebase onto main

The lane rebased cleanly onto main (`main...HEAD` = 0/3). Main's 8 commits touch one file this lane also
touched — `tooling/src/verify/contract/structure-report.ts` — so the two type-sensitive floors were re-run
on the rebased tree: `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json --config
tsconfig.tests-dom.json` → **EXIT 0** (3 runnable programs, all PASS) and `pnpm knip` → the counts above.
The CT was not re-run: main's diff touches `tests/e2e/**` and `tests/support/node/open-context-sections.ts`,
neither of which is in the corpus CT's import graph.

## What this lane did NOT do

- Did not touch `verify/lib/**` or `verify/ops/**` knip rows (fence; three sibling lanes).
- Did not delete `isGateResourceDemandKind` (a dead FUNCTION whose deletion cascades onto a vocabulary).
- Did not re-assert the TS7 argv half that `concurrency-profile.test.ts` already owns.
- Did not run a whole-tree `check`/`verify`/`check:structure` (the `--check <id>` door is a SELECTED run and
  publishes no pointer).
