---
kind: law
status: active
updated: 2026-10-08
---

# Unified Verification Design

> The ONE verification surface. `pnpm verify` is the single entry that runs every check the repo can run —
> lint, types, structure, imports, deps, docs, tests, browser, quality — over named tiers, one scope
> convention, one exit contract, one summary artifact, generalized over a self-describing stage registry.
> Root `AGENTS.md` "Verification tiers" states the completion policy. This document defines the harness and local/CI division.
> The code is truth on any conflict:
> `tooling/src/verify/ops/{run,scoped,tests-type-membership,tests-execution-membership}.ts`,
> `tooling/src/verify/lib/{registry,selection,run-render}.ts`,
> `tooling/src/verify/gates/verify-registry-parity.ts`, `lefthook.yml`,
> `.github/workflows/ci.yml`.

## 1. Run every stage, report every failure

A tier runs EVERY stage and reports EVERY failure at once, then exits at max severity — strictly more
informative than a pipe that stops at the first red. Every verification-shaped `package.json` script is
reachable from the registry or dies to a parity gate (§3.6): a forgotten script is structurally
impossible. Output survives truncation — a reader who sees only the first or last few lines can still
read PASS/FAIL and learn that `reports/verify.json` is authoritative. Compact console is the default;
full stage output goes to `reports/verify/<stage>.log` plus the json, never scrolled off by a live
stream (`--verbose` / a TTY opts into the live stream).

## 2. The blind spots the design exists to catch

The tsc/editor model is unsound for a monorepo verifier; the registry's stage set + the scope resolver
are built around these gaps. `tooling/src/verify/lib/selection.ts` is the code home for §2.1–§2.2.

### 2.1 The editor blind spot

An editor (and a naive file-scoped `tsc`) type-checks a file against its NEAREST ancestor tsconfig. But a
file can be OWNED by a NON-ancestor config that reaches back into it. File-scoped tsc is therefore unsound:
it never sees every owning or consuming program. `pnpm typecheck` discovers runnable native programs through
the shared compiler reader; scoped verification passes the complete affected set as repeated `--config`
arguments to the same executor.

### 2.2 A file in TWO programs

A source may belong to multiple compiler programs through authored roots, project references, imported
closures or ambient ownership. `planTypecheckPrograms(..., "affected")` resolves that complete native set;
the Selection carries the resulting config paths rather than separate graph/DOM booleans. Each selected
runnable program executes once, so editing one source can legitimately run several configs without a
hand-maintained package, graph or DOM command roster.

### 2.4 Stage groups

Stages are presented in groups (`lint`/`types`/`structure`/`imports`/`deps`/`docs`/`tests`/`browser`/
`quality` — the `StageGroup` union in `contract/stage.ts`). Two groups carry more than one stage:

- **lint** = biome + eslint. Biome is the whole-repo fast linter; eslint carries the type-aware rules
  (`no-deprecated`, `tsdoc/syntax`, the react-surface gates) over the typed-API packages + the react test
  trees. Each catches a class the other cannot.
- **types** = `types:native` (the one discovered-program executor), `types:testd` (Vitest `.test-d.ts`
  assertions), and `types:ownership` (the independent ownership reconciliation floor, §3.7).

## 3. The harness

`tooling/src/verify/ops/run.ts` is the entry; `registry.ts` is the stage ledger; `selection.ts` is the scope
resolver. `pnpm check` = `pnpm verify --static` (byte-compatible with the original 8-stage check).

### 3.1 The stage registry

`tooling/src/verify/lib/registry.ts` — every verification surface in the repo, self-described as a `StageDef`:

- `name` (kebab, unique) · `group` (§2.4) · `tiers` (§3.2 membership) · `argv` (the whole-scope
  `pnpm <script>` form, spawned `shell:false`) · optional `tierArgv` (native population variants, printed in the list and artifact notices) · optional `env` (child env; no current consumer) ·
  optional `scopedArgv` (§3.4 — ABSENT ⇒ whole-only) · `classify` (§3.3 — the native-exit adapter) ·
  optional `manualReason` (rendered by `verify --list`) · optional `tierPrecondition` (§3.2 — conditional
  membership at a named WHOLE tier, where `scopedArgv` cannot reach because a whole-tier run carries no
  Selection; its `satisfied` is tri-state and `null` means RUN).
- **The classifiers, written ONCE**: `asViolations` (foreign tools — any non-zero = violation 1, a
  signal-kill null = tool-error 2; tsc's own 2 = type errors = a VIOLATION), `eslintScheme` (eslint's 2 IS
  a tool-error — the opposite of tsc's 2), `ownScheme` (our own 0/1/2/3-speaking tsx scripts pass through;
  an unexpected code is itself a tool-error).
- Adding a stage is a registry row; `stagesForTier` / `manualStages` derive the run + the list from it.
  `verify --list` prints every row with its tiers + scope + manual reason. `tests/tooling/verify/ops/run.int.test.ts`
  pins the classifiers, the tier composition, and the scope derivations.
- **Tier membership is data, and this doc never re-spells it.** `pnpm verify --list` is the only roster;
  the §3.2 table characterizes what each tier is FOR and cites the rationale a row cannot carry, never
  which rows are in it. A prose copy of the registry cannot be reconciled against it by any gate, so it
  rots the moment a row moves — the registry-parity suite pins the ORDER instead, which is the
  enforcement this sentence leans on rather than replacing.

### 3.2 Tier composition (the ladder)

Runnable tiers and the `manual` bucket separate application qualification from weekly checker proof under D307.
Tier membership remains registry data. Application subject admission is a separate axis, not a file-scope selector.
`--application` requests the complete application subject; it cannot narrow files or run with the weekly tier.
Whole push, full and product qualification use application subjects. Local index checks retain author integrity.
`changed` selects related application behavior without invoking exhaustive checker proof. Explicit named tooling tests remain available.

| tier | what it runs | role |
| - | - | - |
| `changed` | scoped structural checks over the changed set plus related behavioral tests | fast iteration; `verify --changed` |
| `static` | structural checks without checker recertification; `--application` admits complete application subjects. Membership is `pnpm verify --list` | `pnpm check` = `verify --static`; index checks retain author integrity (§4.3) |
| `push` | application static checks, product behavior, component tests, browser smoke and bounded quality/build checks. Membership is `pnpm verify --list` | product CI; `verify --push` |
| `product` | complete application checks, CT and model-free E2E; excludes tooling-only subjects, checker proof and mutation. Membership is `pnpm verify --list` | application verification; `verify --product`; scope selectors are refused |
| `full` | exhaustive application verification, browser coverage, mutation quality and dependency analysis; excludes checker recertification. Membership is `pnpm verify --list` | nightly and explicit application verification; `verify --full` |
| `weekly` | complete checker proof and global implementation checks with native corpus partitions. Membership is `pnpm verify --list` | independent scheduled or explicit weekly proof; `verify --weekly` |

**Checker recertification belongs only to weekly execution.** Automatic ordinary tiers cannot select affected or exhaustive tooling proof, including conservative fallback.
`pnpm test:tooling` enters explicit weekly ownership. The affected selector requires `--weekly --affected`.
Named `pnpm test:scoped` calls remain available for meaningful local tooling checks.
Application checks remain blocking when their implementation lives in tooling. Classify the evaluated subject, not its directory.

**Conditional tier membership, the mechanism.** One step of the ladder CAN be narrowed by a fact about the
RUN, declared as registry DATA beside the tiers list (`StageDef.tierPrecondition`) and rendered by
`verify --list` on the tier it narrows. No row declares one today — the field, the runner's plan/notice
path (`lib/stage-plan.ts`) and their producer-driven proof (`tests/tooling/verify/ops/run.int.test.ts` against a
synthetic row) are kept for the next expensive stage that needs a conditional step, and
`tests/tooling/verify/lib/registry.test.ts` reds if a row grows one without this text moving.

**If a precondition ever comes back, its UNKNOWN answer is RUN, not skip.** `satisfied` returns
`boolean | null`, and `null` (no usable base ref, a failed VCS read, a checkout that is not a repo) makes
the runner run the stage. An expensive gate that goes quiet on a question it could not answer is a false
clean wearing a tier's clothes. That polarity is the contract's (`contract/stage.ts`), not one row's.

The static tier's exact membership and order live in `registry.ts`, are rendered by `pnpm verify --list`,
and are pinned by the registry/run integration tests. This keeps `pnpm check`'s compatibility contract
machine-checked instead of copying its roster here.
`.github/workflows/ci.yml` runs product checks for main and PRs, full application verification nightly, and independent weekly checker proof.
Manual product, full and weekly requests preserve those ownership boundaries. Weekly success cannot authorize release.

### 3.3 The exit contract

A HARD contract, spoken by every stage and by the run:

| code | meaning |
| - | - |
| 0 | clean |
| 1 | violations (a checker found problems — a real verdict) |
| 2 | tool error (a checker BROKE — the run is NOT a verdict) |
| 3 | misuse (bad args — the run never happened) |

- **The run's exit = the highest-SEVERITY stage exit**, ranked 2 > 3 > 1 > 0 (`aggregateExit`): a broken
  checker (2) dominates a misuse (3) dominates a violation (1). A single failed spawn never hides behind a
  green.
- **A signal-kill (`status === null`) is ALWAYS a tool-error (2)**, never a verdict — a stage whose child
  fails to spawn (ENOENT) surfaces as 2 at the run's aggregated exit, never a silent 0.
- **A foreign tool's digit is never trusted to mean the scheme's 2/3.** `asViolations` collapses any
  foreign non-zero to 1; only `ownScheme` (our own tsx scripts) passes 2/3 through, and an out-of-scheme
  code there is itself a 2.
- **Presentation matches the contract.** The tail failure block renders a tool-error with a distinct glyph +
  `TOOL-ERROR` label — never dressed as a violation (`failReason` / the int test).
- ARGV is parsed by `node:util` `parseArgs` under a strict schema: an unknown flag, a value option with no
  value, more than one scope selector, or more than one tier are all misuse (3), never a silent-ignore.

### 3.3b The `reports/` layout — one run, one slot, one pointer

**This section is the ONE home for the artifact layout.** Every other doc, rule and header cites it
rather than restating it: every instrument writes to its own run slot, and the well-known paths a lane
knows by heart (`reports/verify.json`, `reports/test-report.json`, …) are `latest` POINTERS into that
slot, published only at completion, atomically. Two runs on one checkout — two lanes, a lane and the
orchestrator — never clobber each other's artifact.

**Run identity.** `<checkout>-<pid>-<timestamp>`, minted ONCE per invocation
(`tooling/src/_shared/artifacts.ts` `runId`). `<checkout>` is `main` for the primary checkout and the
worktree directory's basename for a lane, derived from the KIND of the `.git` entry — a linked worktree's
is a FILE, the primary checkout's a DIRECTORY — so it costs one `stat` and never shells out to git.

**The layout.**

```
reports/
  runs/<instrument>/<runId>/…      ← every byte a run writes, and the ONLY place it writes
  runs/<instrument>/<runId>/.inflight   the marker: dropped at open, deleted at successful finish
  verify.json          → symlink into runs/verify/<runId>/verify.json
  verify/              → symlink into runs/verify/<runId>/stages/   (per-stage `<stage>.log`)
  check-structure.json → symlink into runs/structure/<runId>/check-structure.json
  test-report.json     → symlink into runs/test/<runId>/test-report.json
  test-shards/         → symlink into runs/test/<runId>/test-shards/
  ct-flaky.json        → symlink into runs/ct/<runId>/ct-flaky.json
  snaps/<name>.png     → symlink into runs/snap/<runId>/snaps/<name>.png   (one pointer per ARTIFACT)
  design-audit/…       → symlink into runs/ui-audit/<runId>/design-audit/…
  traces/ recordings/ perf-meter/ motion-audit/  → the same, per artifact, from their instrument's slot
  baselines/             NOT slotted — a persistent CORPUS one run writes and a later run reads (below)
  verify-history.jsonl   NOT slotted — an append-only multi-writer ledger (below)
```

The structure record's shape: `run / gates / toolErrors / scanAlarms / populationAlarms / total / ok`
plus `timing: { totalMs, gateMs }`, and each `gates[]` entry carries
`timing: { totalMs, phaseMs: { begin, visit, visitFile, run, finalize } }` beside `scan` — measured inside
the one `guard()` wrapper every hook call passes through, charged even when a gate throws, per-phase
values floored and the pass total ceiled so `Σ phaseMs === totalMs` and `totalMs ≥ Σ gates` hold
arithmetically. The console prints the pass cost and the five slowest gates; a gate-cost claim cites the
artifact, never a scratch profiler.

- **The well-known paths keep their spelling and become `latest` POINTERS.** Every reader in the repo —
  `pnpm check:show`, `verify --json`, `debt`, the docs, the rules, a lane's `cat` — opens the same path it
  always did; it now resolves to a run that FINISHED.
- **Published at COMPLETION ONLY, atomically**: a relative symlink is created at a temp name in the same
  directory and `rename`d over the alias (POSIX rename is atomic). A concurrent reader sees the old
  complete run or the new one, never a torn or in-flight artifact. An artifact the run never wrote is not
  published at all — a dangling pointer would read as "missing" to everyone, which is worse than leaving
  the previous complete run's.
- **A launcher that knows its own run id reads its OWN slot** (`runFile`), never the pointer.
- **A racing writer is NAMED, never silently last-write-wins**: opening a slot censuses the other slots of
  that instrument whose `.inflight` marker names a LIVE pid, and the list lands on stderr AND in the
  artifact (`run.concurrent` / `runManifest.concurrent`).
- **Retention** is a bounded ring — the 10 newest slots per instrument, pruned at publish — and it is
  REFERENCE-AWARE: an in-flight slot, the just-published one, and any slot a published pointer still
  resolves into are never pruned, so `latest` can never point at a removed run. The reference half is what
  the `--out`-keyed families need (below): each run publishes one pointer per artifact NAME, so pointers
  from many runs are live at once and age alone would delete evidence a live pointer names. Each slot
  records the aliases it published in its own `.published` file, so the check is a readlink per alias, not
  a walk of `reports/`.

**The in-flight stub.** A stub is written before the walk, still says `complete: false`, and is refused
by every reader; it lands in the run's slot instead of a shared path (writing an in-flight stub to a
shared path is precisely what a concurrent sibling would clobber). The "this run DIED" tell reaches a
fixed-path reader through `abandonedRuns()` — a slot whose in-flight marker outlived its pid — and
`check:show` refuses when one is NEWER than the run the pointer resolves to. That is strictly finer than
a bare fixed-path signal, which cannot tell "my run died" from "a sibling lane is mid-run". A LIVE
sibling is deliberately not a refusal.

**`verify-history.jsonl` is deliberately NOT slotted.** It is a per-checkout ledger of every run, not one
run's verdict: appends are append-mode single-line writes that the kernel does not interleave at this
size, and slotting it would give each run a one-line history to compare against — destroying the only
thing it exists for. Each line carries its `runId`, so a reader can still attribute a row.

**The RENDERED instruments.** `snap` and `design-audit` (`ui-audit`) are the surviving rendered browser
instruments. `record` (`screen-record`), `motion-audit`, and `perf-meter` (`cpu-profile`) are loud
compatibility redirects into Snap and open no browser. A caller NAMES an artifact with `--out`; a
verdict instrument publishes a FIXED alias set known before the run, while a rendered instrument's
alias set is whatever it wrote — so `finishInstrumentRun` ENUMERATES the slot and publishes one pointer
PER ARTIFACT FILE. `reports/snaps/` therefore stays a real DIRECTORY of per-artifact pointers rather than
one directory symlink, which is required and not cosmetic: CT and e2e specs write PNGs straight into it
with Playwright, and file headers across `packages/` cite individual shots as durable evidence.

**The STATEFUL SESSION.** A `pnpm snap --session <name> …` call is still ONE run with ONE slot — the CLIENT opens it (`withInstrumentRun("snap")`)
and the session DAEMON adopts it for the call's artifacts through the explicit-slot form
`beginInstrumentRun(instrument, root, { slotDir })` (`_shared/artifact-out.ts`): an adopted slot gets no
marker and is never published by the adopter; the owner publishes at its own finish, so a killed call
leaves the client's `.inflight` marker and `reports/snaps/<name>.png` keeps naming the previous COMPLETE
run. The session itself is a run slot too, instrument `snap-session`
(`reports/runs/snap-session/<runId>/`), opened by the daemon so its `.inflight` marker carries the DAEMON's
pid — `abandonedRuns(root, "snap-session")` therefore lists exactly the sessions whose daemon died, with no
new marker machinery, and every `--session` call, `--session-status` and `--stage-status` reads it first
and prints `SESSION DEAD …` (exit 2 on a call). The slot is settled (published with no aliases) when the
session closes or a sweep reaps it. Session-lifetime evidence (the console/page-error/request rings) lives
with the daemon and reaches `reports/` only through `--session-export <name>`, which writes
`sessions/<name>/*.json` into the EXPORTING call's slot — published as `reports/sessions/<name>/…`
pointers. The daemon's own stdout is `<main>/.cache/snap-session/<name>.log` beside its socket and row,
deliberately NOT inside its slot (the enumerating finish would publish it as a pointer).

- **The door is `withInstrumentRun(instrument, main)`** (`tooling/src/_shared/artifacts.ts`), called by the
  instrument's `cli.ts` around its RUN leg only — the help/misuse legs write nothing and must not mint an
  empty slot. It NAMES the slot on stdout at the start (`run slot reports/runs/<instrument>/<runId>`) plus
  the racing census; the publish is silent so the `RESULT` line stays last.
- **Enforcer: policy `tooling-artifact-run-slot`** (family `tooling-artifact`) — a tool that calls
  `artifactDir`/`artifactFile` and whose `cli.ts` does not open a run slot is RED, so the next instrument
  cannot regress into the shared dir.
- **A RED run publishes normally** (a failing verdict is still a complete artifact, and the failure shot is
  the evidence the reviewer came for); a CRASHED one publishes nothing and leaves the `.inflight` marker —
  the `abandonedRuns` tell.
- **`baselines/` is deliberately NOT slotted**: it is a persistent corpus `snap --baseline` writes and a
  LATER `snap --diff` reads, so filing it in a pruning ring would turn the next diff into NO-BASELINE.

**Still not slotted** (docs/work/0124): the artifact paths named by `playwright-ct.config.ts`
(`ct-report.json`, `ct-report/`, `ct-results/`) and `playwright.config.ts` (`e2e-report*`, `e2e-results/`),
and `mutation-probe/`, `cpd/`, `coverage/` — runner-owned or tool-owned output directories whose writer is
not one of ours.

### 3.4 The scope model

`tooling/src/verify/lib/selection.ts` is the ONE resolver: a `--changed`/`--file`/`--package`/`--scope` request
resolves ONCE into a `Selection`, the superset every stage's `scopedArgv` reads from. Each stage decides how
(if at all) it runs over that selection:

- **The honest per-tool floor:** biome/eslint/docs = the file; tsc = every affected native compiler program (file-scoped tsc is
  unsound, §2.1); depcruise = the file; structure = the walk scoped via `tooling/src/verify/ops/scoped.ts`.
- **CT (Playwright component tests) = mirror + declared sweeps — the ONE deliberately-open edge.**
  A changed `packages/{ui,client}/src/<p>.<ext>` selects its test-layout
  mirror `tests/{ui,client}/<p>.ct.tsx` IFF it exists on disk (no mirror ⇒ no contribution); a changed
  `tests/**/*.ct.tsx` selects itself (a `.suite.ct.tsx` cross-cutting suite never — it mirrors no single
  module, so it rides sweeps only). On top of the mirror map sits a SMALL, honest table of DECLARED
  BLAST-RADIUS SWEEPS — the classes that make mirror-only a LYING green (a token/skin-fragment change
  surfaces in computed-style assertions everywhere; a client registry/provider/factory throws in every
  story; the CT harness/config; a shared ui GROUP CORE like `charts/chart/**` or `markdown/**` internals):
  any changed path matching a trigger escalates to running that trigger's mirror DIR(s), a superset of the
  individual mirrors. This is UNDER-selecting by design — honest ONLY because a scoped green is NEVER the
  coverage verdict (§3.7): a whole run remains the coverage verdict. The sweep table lives in `lib/ct-view.ts`
  (`CT_SWEEP_TRIGGERS`), each row carrying its incident class. No CT-relevant change ⇒ the stage no-ops.
- **`scopedArgv` returns the concrete scoped argv, OR a sentinel:**
  - `"whole-only"` ⇒ **DEFER** at a scoped tier (a cross-file reconciliation — registry/coverage/parity/
    membership — has no honest partial form). A deferred stage prints a named notice ("runs at
    `verify --static`/`--push`/`--full`/`--weekly`") and is recorded in the artifact; it is NOT a failure.
  - `"skip-empty"` ⇒ the scope resolves to zero relevant paths for this tool (e.g. eslint with no file in
    its surface); the stage is a no-op this run.
  - ABSENT `scopedArgv` ⇒ the stage is whole-only (deferred at a scoped tier) by default.
- **Browser-test type consumers:** production package source, tooling source, and shared test helpers can
  enter browser-test compiler programs through imports without being roots. The affected planner reads
  native compiler import closures and selects every program containing each changed source. Package and
  folder scopes expand to authored files before using the same planner.
- **Deletions:** a git-changed set KEEPS deleted paths — the structure walk retains the deletion and native typechecking
  conservatively selects every runnable program — but the per-tool file-list views (eslint/depcruise/
  docs, which hand CONCRETE file args to a child that hard-errors on a gone path) DROP them.
- **`--strict-scope`:** a whole-only stage at a scoped tier REFUSES (exit 3) instead of deferring — for a
  caller who wants a scoped run to fail loudly rather than silently skip the whole-project gates.
- **A scoped green is not whole-tree qualification.** Deferred cross-file checks remain owed at the orchestrator's merged-tree boundary and in CI. The `lane` skill defines assignment completion and matching evidence reuse.

### 3.6 The parity gates

Two live parity gates keep the registry and the scripts honest, both directions:

- **`verify-registry-parity`** (`tooling/src/verify/gates/verify-registry-parity.ts`, docRow cites §3.6):
  - Case 1 — every `package.json` script matching the verification shape
    (`check*`/`test*`/`lint*`/`typecheck*`/`depcruise*`/`e2e*`/`cpd*`/`format*`/`knip*`) must be a registry stage's
    `pnpm <script>` argv, OR on the small `NON_STAGE_ALLOWLIST` (the verify host + its check alias, the
    WRITERS `lint:fix`/`format`/`format:docs`, the depcruise mermaid ARTIFACT generators, `cpd:report`,
    the `check:show` inspector, `depcruise:affected`). A forgotten script is RED.
  - Case 2 (the mirror) — every registry stage's whole-scope `pnpm <script>` argv must name a REAL
    `package.json` script (a dead row is RED). Guarded on the presence of the `verify` script so a synthetic
    example `package.json` doesn't flag every registered stage.

### 3.7 The test lanes as ONE concept

The behavioral suites are ONE `tests` concept expressed as stages with tier + scope, not a folklore list:

- **`tests:tooling`** runs the complete instrument battery through the native Vitest execution groups. `tooling/src/_shared/test-kinds.ts` owns test-kind and repository-resource registration; `vitest.config.ts` derives group selectors from it rather than maintaining a filename roster. Normal execution groups use `sequence.groupOrder: 0`; the `repository` group uses order 1 and `fileParallelism: false`, so repository-resource files run afterward and serially within that group. `tests:execution-membership` reconciles collection. Vitest's API calls these execution groups projects; they are unrelated to pnpm workspace packages. Its current tier membership is registry data rendered by `pnpm verify --list`.
- **`tests:node`** — `pnpm test:node` = the PRODUCT vitest projects
  (`unit`/`integration`/`repository`/`contract`; NOT `tooling`). The CT suite is `browser:ct`, on its own
  hang ceiling DERIVED from `tooling/concurrency-profile.json` (§3.7b) rather than sharing `tests:node`'s.
  `pnpm test` still COMPOSES both halves as the explicit product-test command and the
  `tests:product-composite` registry row; the registry owns its exclusion from runnable tiers so nothing
  double-runs.
  Scoped execution uses Vitest's configured projects without a copied project roster, and the
  node selector chooses its CONFIG MODE from what the runner said it would SELECT — vitest's own per-file
  `projectName` attribution, never a filename, so a directory operand holding a `.test-d.ts` is classified
  by the authority that would run it. A caller's own `--project` is authoritative and the door adds nothing;
  `--related` is `--runtime-only` (source operands; the type-assertion door is `pnpm test:types`); an
  attribution with no `types-*` — including the empty one a bare `--grep` produces — is `--runtime-only`
  (the thin runtime config omits the typecheck projects BEFORE any `--project` filter applies, which is why
  `--project=!types-*` is not the same thing: vitest unions a negative selector with the positives and
  widens the run); anything else narrows to the UNION of the attributed projects.
  **Source diagnostics and type assertions have separate owners.** Project selection alone cannot
  isolate source diagnostics: a claimed typecheck project reads its whole tsconfig program, while a project
  with zero matched type tests never runs the checker. Both typecheck projects therefore set
  `typecheck.ignoreSourceErrors: true` in `vitest.config.ts`. The assertion lane still judges the caller's
  `.test-d.ts` assertions; `types:native` owns source diagnostics. A scoped assertion pass never
  substitutes for the native compiler verdict.
  Git-derived changes
  use native `--changed`; explicit test paths pass native collection preflight; explicit source or mixed
  inputs use native `related`. Folder inputs expand to current authored files from Git's tracked and
  exclude-standard untracked views, omitting deleted files; a package request selects its test mirror.
  All node runs enter `test:scoped` and retain watchdog supervision and the owned 0/1/2/3 exit contract.

  **Asserted and derived empty selections differ.** A missing direct test path is misuse (3), and an
  existing direct test path contributing no collected tests is a tool error (2). Related sources may have
  zero runtime dependents; that derived empty is explicitly printed and exits cleanly through a local
  `--passWithNoTests` flag. The default config and whole-suite commands retain `passWithNoTests: false`.
  Direct `test:scoped --related` requires source files before runner flags; directories are refused with
  guidance to use `verify --scope` for authored-folder expansion. **The vitest run is wrapped by
  `scripts/vitest-supervised.ts`:** literal project selections run sequentially with private reports; native filter selections remain together.
  The supervisor observes output and recursive process-tree CPU activity. It kills an idle tree after `ORB_TEST_HANG_TIMEOUT_MS`.
  `ORB_TEST_HANG_MAX_MS` bounds silence even when the tree consumes CPU; its default comes from `tooling/concurrency-profile.json`.
  CPU activity does not reset that separate output deadline. A kill establishes an incomplete run, not a particular stalled phase.

  Semantic-corpus workers disable Vitest's console interception because synchronous policy batches cannot flush its microtask-buffered messages.
  Corpus progress names baseline and batch boundaries. Completed batches retain their existing timing evidence.
  The weekly executor adds `tooling/src/verify/ops/vitest-progress-reporter.ts` for native module and test lifecycle events.
  These messages describe actual work; periodic output without a completed unit or phase transition must not substitute for progress.
  The supervisor retains bounded recent output beside process diagnostics in each attempt's wedge dump.
  A started baseline or batch without completion identifies unfinished work, not a successful proof.

  A killed attempt with an incomplete report is retried once. Assertion failures are not retried.
  A killed final attempt exits as a tool error, even if it wrote a passing report before stalling.
  Reports record contained retries; a missing final report is not announced as published.
  A verdict from a completed retry does not establish that the interrupted attempt passed.
  Controls live in `tests/tooling/vitest-supervised.test.ts` and `tests/tooling/verify/ops/vitest-progress-reporter.suite.int.test.ts`.
- **`browser:ct`** — its whole form is the complete CT suite (`pnpm test:ct --retries=2`, the visible
  retries flag so parallelism flakes RETRY instead of blocking the whole-run verdict). It carries
  `hangCeilingBaseMs` DERIVED from the
  profile (§3.7b): the CT wall clock is a function of `ctWorkers`, which is exactly what a shared constant
  could not express. Its scoped form (§3.4) runs through `test:ct`: native collection preflight, an exclusive
  runner lease, and a private cold build directory. It does not reuse or clear another invocation's build
  directory. Scoped calls keep the config's zero-retry default; whole-suite retries remain explicit.

#### 3.7b The per-stage hang ceiling is DATA

A stage's ceiling is not a performance budget — it is the line past which the stage is WEDGED, after which
its process group is killed and the classifier scores a TOOL ERROR. The ceilings are DERIVED from
`tooling/concurrency-profile.json`'s `stageBudgets` row (the same file that owns every worker cap), through
`lib/stage-budget.ts`:

- `defaultMinutes` — every stage that does not declare its own.
- the CT suite — `ceil(ctSuiteWorkerMinutes / ctWorkers × ctCeilingFactor) + ctHostSlotWaitMinutes`, floored
  at the default. `ctSuiteWorkerMinutes` is measured for the current suite size; the host-slot wait is in
  the sum because a queued CT run spends it inside the stage's own wall clock, and the CT host pool
  (`ctHostSlotPool` in `tooling/src/_shared/host-slots.ts`) reads that same number for the wait it grants.

Change `ctWorkers` and every dependent ceiling moves with it. The runner still passes the result through
`budget()`, so a contended box stretches it further, never shrinks it.

- **`browser:e2e-smoke`** is the fast `@smoke` model-free subset; **`browser:e2e`** is the exhaustive
  browser sweep; **`browser:e2e-live`** costs model credits; **`quality:mutation-gate`** carries the mutation
  verdict; **`quality:mutation-report`** and **`tests:coverage`** are report-only. Their current assignments
  are registry data rendered by `pnpm verify --list`.
- **`tests:execution-membership`** (`tooling/src/verify/ops/tests-execution-membership.ts`)
  — `types:ownership`'s EXECUTION-lane sibling: THREE directions of "a test file is run by SOME
  runner, a runner glob matches SOME file, and no file is run by MORE than one runner". Asks each runner its
  own `--list` view (`vitest list --filesOnly --json` for every configured Vitest project — each entry carries a
  `projectName`, which direction 3 reads; `playwright test --list --reporter=json` for `playwright.config.ts`
  — run with `E2E_LIVE=1` so `@live`-tagged specs, structurally matched but grep-skipped at routine run time,
  still count — and `playwright-ct.config.ts`), never re-parses glob strings (drift-proof). A `tests/**`
  runner-suffixed file in NO view REDs (never executed, direction 2); a runner view matching ZERO files REDs
  (a server `pnpm test` glob matching nothing, direction 1); a file
  claimed by TWO OR MORE runtime views REDs naming every colliding view (direction 3) — one-lane-ness
  is a checked invariant, not a construction property of the include/exclude sets. Direction 3's runtime-view
  set is every Vitest runtime project plus the two Playwright configs, each counted separately. The
  `types-node`/`types-browser` projects are typecheck-only (`test.include: []`), so neither is a runtime
  executor.
- **`structure:db-baseline`** (`tooling/src/verify/ops/db-baseline-parity.ts`) — the committed migration
  CHAIN (`packages/db/src/migrations`) vs what the live `@orb/db/schema` declares: it generates from the
  chain TIP's `meta/<n>_snapshot.json` to the live schema and requires the result to be EMPTY, each
  statement whitespace/semicolon-normalized. Points at the chain now that the baseline is frozen (`Tier-1-DB.md`
  §"Regime 2"): `freshDb` PUSHES schema-derived DDL, so every per-table `.int` test passes while the
  committed migrations could silently rot without this check. The comparison is in-process via
  `drizzle-kit/api` (no stack, no db file) — it is the SAME comparator
  `tests/tooling/verify/ops/db-baseline-parity.int.test.ts` calls (one home, two callers).
- **`ledgers:fresh`** (`tooling/src/verify/ops/ledgers-fresh.ts`) — every
  committed SINGLE-WRITER output vs a fresh derivation of itself: the caught-failure census
  (`tooling/src/verify/gates/caught-failure-ownership.population.json`, keyed by `siteId`, so a line move
  is not drift), the snap-flags index, the type-configs, and the active-gates index. It runs the SAME
  derivations the regenerators run (one home each; GATE-AUTHORING §4.8's single-writer door keeps the
  WRITE) and writes nothing, printing the exact differing rows and the repair action last, so the fix
  survives into `failureExcerpt`. Generated outputs name their baseline writer; authored parity rows name
  the hand correction instead. WHOLE-ONLY BY ABSENCE: no `scopedArgv`, so a scoped tier DEFERS it — a
  census derived from a scoped fileset is a census of a different tree and would call every row it did not
  walk stale. An EMPTY derivation is exit 2 (blindness), never a clean ledger. The `--check` case is also
  reachable per-ledger: `cli.ts baseline <kind> --check`.
- **`structure:drizzle-kit`** (`pnpm --filter @orb/db exec drizzle-kit check --config=drizzle.config.ts`) — drizzle-kit's OWN migration-chain validator, the ORTHOGONAL half of its
  sibling above: `structure:db-baseline` compares the schema to the baseline's CONTENT, this one validates
  the `migrations/meta` CHAIN (every `_journal.json` entry has its snapshot; no two snapshots claim the
  same parent — the forked-chain collision two concurrently-generated migrations produce). Whole-only (one
  migrations dir). The post-baseline procedure it guards is `Tier-1-DB.md` §"When we migrate for real".
- **`quality:boot-chunk`** (`tooling/src/verify/ops/boot-chunk-ratchet.ts`) — builds
  `@orb/client` for production and REDs when the BOOT PAYLOAD exceeds a committed byte ceiling. The measured
  quantity is the entry chunk (`packages/client/dist/assets/index-<hash>.js`) PLUS every
  `dist/assets/*.js` the emitted `dist/index.html` references (the module `<script src>` and every
  `<link rel="modulepreload" href>`), because the browser fetches a preloaded sibling on the same boot path.
  Summing is not a refinement, it is what stops the instrument LYING: moving bytes out of the entry chunk
  into a modulepreloaded sibling would score as a win under an entry-file-only read while the real payload
  the browser fetches on boot does not shrink. It defends a class of win nothing else on the ladder can
  see: the regression mechanism is typically one new barrel import inside `main.tsx`'s static graph, while
  every other stage stays green as it re-pays the whole cost. A byte ceiling catches every mechanism (a
  barrel, a fat dep, a lost `import type`, a route that stopped being lazy) instead of enumerating the ones
  already seen. The ceiling lives in `boot-chunk-ratchet.ts` (`BOOT_CHUNK_CEILING_BYTES`), with its own
  calibration discipline in its header: measured value, headroom arithmetic, re-calibrate conditions.
  UNMEASURABLE IS EXIT 2, never a pass — zero matching entry chunks or more than one, an unreadable
  `index.html`, a module script that is not the entry chunk, a referenced asset absent from disk, or an
  `/assets/*.js` referenced in a shape the boot-ref parser does not recognize (an under-count is the same
  lie with a smaller number) is "I could not measure", so a blind `0 bytes` can never read as under
  budget. Whole-only: the boot payload is a property of the entire static graph reachable from the entry,
  so no changed-file subset is an honest partial. Pinned by
  `tests/tooling/verify/ops/boot-chunk-ratchet.test.ts` (the summing case over a planted split-dist fixture,
  the split-is-not-a-win symmetry, over/under, and every unmeasurable case) — the registry pin in
  `run.int.test.ts`.
- **`deps:orphan-ratchet`** (`tooling/src/verify/ops/orphan-export-ratchet.ts`) — the export-rot
  view as a standing verdict: every export of `kit`/`contracts`/`db`/`server`/`client` that NOTHING reaches
  (prod or test) and that is unused in its own file, judged against a checked-in baseline
  (`tooling/src/verify/ops/orphan-export-ratchet.baseline.json` — one row per deliberately-undecided
  export). Both directions RED: a NEW orphan, and a baseline row that is no longer one (consumed / tagged
  / deleted ⇒ remove the row). It shares the `pnpm ast orphans` substrate
  (`collectOrphanCandidates`) rather than re-deriving liveness. **It cannot lean on `deps:knip`** — the
  package `exports` maps already make these subpaths public API to knip, so knip flags none of
  them and its `tags: ["-@public"]` exemption never fires; this stage therefore reads
  `/** @public <reason> */` itself (a bare tag with no reason does NOT exempt). `packages/ui` is exempt as a
  whole (`ui-package-design.md` R2 — a sealed surface exists to be available), and star-suppressed
  candidates are reported but never ratcheted (an `export *` chain may hide a namespace consumer).

## 4. Hook + CI wiring

`lefthook.yml` defines local integrity checks. CI owns whole-tree verification before release.
`pnpm verify --product` is explicit operator qualification, not an automatic local push hook.

- **pre-commit and pre-merge-commit → `pnpm verify --static --changed staged`.** A type, lint, boundary or file-local structure red in the staged change ⇒ cannot commit (§4.3).
- **pre-push → the GitHub sync guard only.** Whole-tree static and behavioral checks run in CI, not again during local push.
- **CI → application qualification** (`.github/workflows/ci.yml`) on every push to main and every PR: `pnpm check --application`, the
  push tier's whole-only checks, `test:node` and the CT suite sharded across runners, and `e2e:smoke`. Its
  `ci-ok` job is the required check, and `pnpm release` refuses a commit whose run is not green. Nightly,
  `pnpm verify --full` runs on main when main changed since its last successful full qualification.

### 4.3 Scoped static at commit

Pre-commit runs the stages that narrow to the staged change, not the whole tree: `--changed staged`
selects the index against `HEAD`, so an unstaged or untracked file stays out of the commit's scope. `--changed`
beside an explicit tier is only the selector, so the related tests of the `changed` tier stay out of the
commit gate. A scoped run takes no host-wide whole-run slot, so a commit never waits behind another
checkout's run.

- The type check runs every native program whose import closure contains a changed file.
- The structure walk runs the file-local policies. It defers and prints the cross-file policies.
- A whole-only stage defers when its path trigger matches and skips when it does not
  (`tooling/src/verify/lib/registry-triggers.ts`). Other scoped selections run a triggered whole command.

CI runs complete application static verification before a revision can promote to release. World, import, schema and membership enforcement remain required.
Local scoped green does not establish whole-tree green. Applicable local completion checks follow the `lane` skill and `AGENTS.md`.
The merge-train barrier remains separate from the local pre-push hook. Browser suites never gate the static tier (`Spine-Testing.md` §7).

### 4.4 Verification ownership

Lanes own meaningful affected behavior, compiler, lint, gate and rendered checks. Reuse completed checks while their inputs, scope and execution population match.
The staged commit and merge hooks are index checks, not whole-tree or behavioral qualification. Fast-forward merges create no commit hook.
The orchestrator freezes a drained batch and records its starting and ending commits. Reconcile the combined tree once, including `pnpm test:ratchets` and affected integration.
Credit broader evidence only when its actual population includes the owed checks. Return concrete failures together and recheck invalidated evidence after corrections.
`pnpm verify --product` qualifies application behavior. Weekly proof independently recertifies checker implementation; its result does not veto valid product evidence.

`ORB_VERIFY_BASE` and `ORB_VERIFY_HEAD` supply paired nonzero Git commit IDs for qualification measurement.
The base must be an ancestor of the tested HEAD. The boundary requires a clean checkout and a nonempty commit range.
The changes job records the actual PR target, push before SHA, or manual input separately from the measurement base.
`scripts/ci-qualification.ts` selects the nearest current-generation qualified ancestor by Git topology.
Inherited authority requires exact-SHA main-push product success and successful generation-marked static and `ci-ok` steps from that attempt.
Every required product job and shard must succeed in runtime mode. Inherited mode admits only the recorded application skips.
Partial reruns cannot borrow previous-attempt product results. Missing, duplicate, failed, cancelled or unexpectedly skipped product jobs refuse authority.
The workflow owns the generation marker. Release callers read its canonical value, not a caller-supplied environment override.
Incomplete, old-generation, PR, schedule and manual runs cannot authorize inherited qualification. Independent tooling failure does not veto successful required product jobs.
Attempt-specific job pagination must complete. Metadata failures and bounded-search exhaustion refuse qualification because newer version authority remains ambiguous.
Inspect the complete ancestry before admitting publication bootstrap. Historical workflow sources without the current generation cannot grant inherited qualification.
After positively establishing no qualified ancestor, use the workflow's explicitly admitted publication source for version comparison.
This bootstrap requires complete current application proof. It credits neither publication tests nor weekly tooling success.
Refuse qualification when the admitted publication source cannot resolve as an ancestor of the tested HEAD.
Application skip decisions and showcase release comparisons use the cumulative measurement range.
This preserves defects and version debt from failed predecessors. Policy inventory identity keeps its existing semantics.

The orchestrator records train start/end. Use the start incrementally only when matching qualified evidence establishes its state.
Otherwise use an established qualified ancestor, or prove none exists before admitting publication bootstrap. Refuse ambiguous local version authority.
Do not substitute accumulated unpublished remote history. Other callers retain ordinary nearest-base and local-publication semantics.
`ORB_VERIFY_INSTRUMENT_COMPONENT` partitions weekly execution into `all`, `non-corpus` or `corpus`; it does not change product authority.
Weekly freezes main before launching native corpus shards and the non-corpus implementation/proof leg.
Its independent result requires every partition. Neither required product jobs nor `ci-ok` depend on weekly proof.
Native shard collection must prove complete, disjoint views through the configured sequencer before execution.
Weekly retains conservative full proof and native partition controls. Named changed tooling tests use their explicit local executor, not automatic product tiers.

Nightly full and manual product qualification use separate exact-SHA success markers. Red, no-verdict and cancelled runs cannot save success.
The bounded hosted-runner job limit does not prove the full tier completes on that runner. Read the completed run before claiming qualification.
Release promotion requires successful push-event CI for the exact HEAD after synchronization. A sync-created merge needs its own qualification.
