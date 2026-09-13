---
kind: law
status: active
updated: 2026-09-10
---

# Unified Verification Design

> The ONE verification surface. `pnpm verify` is the single entry that runs every check the repo can run —
> lint, types, structure, imports, deps, docs, tests, browser, quality — over four tiers, one scope
> convention, one exit contract, one summary artifact, generalized over a self-describing stage registry.
> AGENTS.md §4 states the doctrine ("iterate on `--changed`, claim done only after `pnpm check`, pre-push is
> `--push`, the works is `--full`"); this doc is its as-built spec. The CODE is truth on any conflict:
> `tooling/src/verify/{run,registry,selection,tests-type-membership,tests-execution-membership}.ts`,
> `tooling/src/verify/{report,scoped}.ts`, `tooling/src/verify/gates/verify-registry-parity.ts`, `lefthook.yml`,
> `.github/workflows/ci.yml`.

## 1. Why ONE surface

- **The failure this closes:** a bot runs a partial battery, sees green, and misses a class the partial
  battery never ran (the 2026-06-28 incident — test-FILE type errors rode \~10 commits because pre-commit
  ran only Biome on staged files; `test:types` fired only at a pre-push that a long no-push session never
  reached — `lefthook.yml`). One entry with named tiers makes "which command do I run" a lookup, not
  folklore.
- **Run-all-report-all, not piped early-abort.** A tier runs EVERY stage and reports EVERY failure at once,
  then exits max-severity — strictly more informative than a `A && B && C && D` pipe that stops at the first
  red. The old pre-push 4-command pipe is retired (`lefthook.yml`).
- **A forgotten script is structurally impossible.** Every verification-shaped `package.json` script is
  reachable from the registry or dies to a parity gate (§3.6). No verification surface exists off the ladder.
- **Truncation-robust output.** A reader who sees only the first \~15 lines (head banner) OR only the last
  \~15 (tail block) can still read PASS/FAIL and learn that `reports/verify.json` is authoritative. Compact
  console is the default; full stage output goes to `reports/verify/<stage>.log` + the json, never scrolled
  off by a live stream (`--verbose` / a TTY opts into the live stream).

## 2. The blind spots the design exists to catch

The tsc/editor model is unsound for a monorepo verifier; the registry's stage set + the scope resolver are
built around these gaps. `tooling/src/verify/lib/selection.ts` is the code home for §2.1–§2.2.

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

### 2.4 Stage GROUPS

Stages are presented in groups (`lint`/`types`/`structure`/`imports`/`deps`/`docs`/`tests`/`browser`/
`quality` — the `StageGroup` union in `registry.ts`). Two groups carry more than one stage on purpose:

- **lint** = biome + eslint. Biome is the whole-repo fast linter; eslint carries the type-aware rules
  (`no-deprecated`, `tsdoc/syntax`, the react-surface gates) over the typed-API packages + the react test
  trees. Each catches a class the other cannot.
- **types** = `types:native` (the one discovered-program executor), `types:testd` (Vitest `.test-d.ts`
  assertions), and `types:ownership` (the independent ownership reconciliation floor, §3.7).

## 3. The harness

`tooling/src/verify/ops/run.ts` is the entry; `registry.ts` is the stage ledger; `selection.ts` is the scope
resolver. `pnpm check` = `pnpm verify --static` (byte-compatible with the retired 8-stage check).

### 3.1 The stage registry

`tooling/src/verify/lib/registry.ts` — every verification surface in the repo, self-described as a `StageDef`:

- `name` (kebab, unique) · `group` (§2.4) · `tiers` (§3.2 membership) · `argv` (the whole-scope
  `pnpm <script>` form, spawned `shell:false`) · optional `env` (child env; no current consumer) ·
  optional `scopedArgv` (§3.4 — ABSENT ⇒ whole-only) · `classify` (§3.3 — the native-exit adapter) ·
  optional `manualReason` (rendered by `verify --list`) · optional `tierPrecondition` (§3.2 — conditional
  membership at a named WHOLE tier, where `scopedArgv` cannot reach because a whole-tier run carries no
  Selection; its `satisfied` is tri-state and `null` means RUN).
- **The classifiers, written ONCE** (§3.1/§3.3): `asViolations` (foreign tools — any non-zero = violation 1,
  a signal-kill null = tool-error 2; tsc's own 2 = type errors = a VIOLATION), `eslintScheme` (eslint's
  2 IS a tool-error — the opposite of tsc's 2), `ownScheme` (our 0/1/2/3-speaking tsx scripts pass through;
  an unexpected code is itself a tool-error).
- Adding a stage is a registry row; `stagesForTier` / `manualStages` derive the run + the list from it.
  `verify --list` prints every row with its tiers + scope + manual reason. `tests/tooling/verify/ops/run.int.test.ts`
  pins the classifiers, the tier composition, and the scope derivations.
- **TIER MEMBERSHIP IS DATA AND THIS DOC NEVER RE-SPELLS IT.** `pnpm verify --list` is the only roster;
  the §3.2 table characterizes what each tier is FOR and cites the rationale a row cannot carry, never
  which rows are in it. #1949 is why: the `static` cell enumerated 13 stages against a 19-stage tier, and
  the drift was invisible because prose cannot be reconciled against a registry by any gate. The suite
  above pins the ORDER, so a row that joins a tier reds there — which is the enforcement this sentence
  leans on rather than replacing.

### 3.2 Tier composition (the ladder)

Four runnable tiers + a `manual` bucket. The WHOLE-TREE ladder nests by MEMBERSHIP: **static ⊂ push ⊂ full**
— each tier ADDS stages, never drops one, and since #1842 every rung's membership is UNCONDITIONAL data
(the `tierPrecondition` mechanism survives for the next row that needs it — see the note under the table —
but no row declares one). `changed` is the SCOPED inner loop and is deliberately NOT ⊆ static:
it carries related-tests (`tests:node` over vitest's changed-file graph) that static omits by doctrine —
static is the born-compliant TEST-FREE commit gate. The honest containment for the inner loop is
**changed ⊆ push**.

| tier | what it runs | role |
| - | - | - |
| `changed` | the scoped inner loop: lint/types(per-owner)/structure/imports/docs over the changed set + vitest `--changed` related tests | fast iteration; `verify --changed` |
| `static` | every STRUCTURAL surface — lint, the type programs, the structure/registry/ledger reconciliations, imports, deps, docs — and **no behavioral suite**. That characterization is the doctrine; the MEMBERSHIP is data (`pnpm verify --list`) and is never enumerated here (#1949: this cell named 13 stages while the tier carried 19, missing `lint:hook-syntax`, `structure:asset-refs`, `structure:agent-config`, `structure:policy-conformance`, `config:biome-rule-liveness` and `docs:catalog` — a prose copy of a registry rots on the next row) | `pnpm check` = `verify --static`; the commit gate |
| `push` | static + the BEHAVIORAL surfaces a commit gate cannot afford: the PRODUCT vitest projects (never the instrument battery, #1842), the WHOLE CT suite (its own stage again since #1848 so it carries its own profile-derived hang ceiling), e2e-smoke, the tool-guard suite, the export-rot ratchet (whole-graph liveness), `quality:cpd` (promoted here from `full` 2026-08-03 — measured 0.86s) and the client boot-chunk byte ratchet (§3.7 — it runs a real vite build, so never the structural-fast commit bar). Membership is `pnpm verify --list` | pre-push bar; `verify --push` |
| `full` | push + the surfaces no cheaper tier can afford: the WHOLE instrument battery (both tooling vitest projects — `--full`-only since #1842, see the note under this table), the exhaustive browser e2e sweep beside push's smoke arm, the mutation-quality gate, and the production-strict dependency lens whose delta over the ordinary one is the kept-alive-only-by-tests rot (full-tier during the buildout; its registry row carries the promotion condition). Membership is `pnpm verify --list` | the "nothing omitted" bar; `verify --full` (CI `workflow_dispatch`) |

**THE INSTRUMENT BATTERY IS `--full`-ONLY (#1523 split it, #1842 cut it loose).** `tests:tooling` runs at
`full` and at NO other tier. #1523's first cut kept a CONDITIONAL `push` rung — run the battery when the
branch diff touched `tooling/**` or `tests/tooling/**` — and #1842 deleted that rung on the owner's word
(2026-09-06: *"take tooling out of the verify push and into full"*). A lane iterating on an instrument
still gets its RELATED tests through native configured-project selection at `changed` and can run the
whole battery by hand with `pnpm test:tooling`; the whole-battery verdict is `verify --full`.

**CONDITIONAL TIER MEMBERSHIP, the mechanism (#1523).** One rung of the ladder CAN be narrowed by a fact
about the RUN, declared as registry DATA beside the tiers list (`StageDef.tierPrecondition`) and rendered
by `verify --list` on the tier it narrows. **NO ROW DECLARES ONE TODAY** — the field, the runner's
plan/notice path (`ops/run.ts`) and their producer-driven proof (`tests/tooling/verify/ops/run.int.test.ts`
against a synthetic row) are kept for the next expensive stage that needs a conditional rung, and
`tests/tooling/verify/lib/registry.test.ts` reds if a row grows one without this text moving. The
predicate #1523 hung on (`lib/registry-preconditions.ts` + `branchChangedPaths`) went with the rung.

MEASURED 2026-09-04 (`reports/runs/test/main-4188220-2026-09-04T10-13-43-073Z/test-report.json`, 1,867
files / 17,818 tests): `tests/tooling` was **71.1 CPU-min over 284 files** against **9.0 min over 1,185**
for `tests/server` and 1.3 min for everything else — 82% of the node battery, all of it recertifying our
own instruments, and bounded by single files that drive a real browser (`ast/cli.int` 7.5 min,
`snap/ops/session-daemon.int` 5.0, `verify/gates/dangling-refs.int` 3.5). Owner, same day: *"about 30
minutes of tooling recertification, which makes it tedious to run tests… move that to verify --full."*
A push cannot regress an instrument test that a `--full` run certified on the same code, and the diff that
DOES touch an instrument pays for it at `--full` (or by hand) rather than on every lane's push.

**If a precondition ever comes back, its UNKNOWN answer is RUN, not skip.** `satisfied` returns
`boolean | null`, and `null` (no usable base ref, a failed VCS read, a checkout that is not a repo) makes
the runner run the stage. An expensive gate that goes quiet on a question it could not answer is a false
clean wearing a tier's clothes. That polarity is the contract's (`contract/stage.ts`), not one row's.

The static tier is EXACTLY the ordered set `lint:biome, lint:eslint, types:native, types:testd,
types:ownership, tests:execution-membership, structure:db-baseline,
structure:drizzle-kit, structure:agent-config, structure:full, ledgers:fresh, imports:depcruise, deps:knip, docs:format,
docs:catalog` (pinned in the int test) — so `pnpm check` stays
byte-compatible with the retired orchestrator, modulo the two membership-floor additions and the
db-baseline promotion.
`.github/workflows/ci.yml` runs the full tier (§3.2, V4 — the "nothing omitted" bar).

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
  value, >1 scope selector, or >1 tier are all misuse (3), never a silent-ignore.

### 3.3b The `reports/` layout — one run, one slot, one pointer (#1029)

**This section is the ONE home for the artifact layout.** Every other doc, rule and header cites it rather
than restating it. Owner ruling 2026-09-01, verbatim: *"all reports need to be able to be ran
concurrently"* and *"unique markers inherit the worktree name"*.

**The defect it closes.** Every instrument wrote its artifact to one FIXED path, so two runs on one
checkout — two lanes, a lane and the orchestrator, a `pnpm check` and a sibling's `check:structure` —
clobbered each other. Measured live that day: three concurrent `check:structure` runs on main, and
`reports/check-structure.json` flipped from a complete 248-gate verdict to another run's in-flight stub
inside 30s. The read-the-artifact-never-the-pipe law (AGENTS.md §4) assumes the artifact is YOURS; under
multi-lane load it silently was not.

**Run identity.** `<checkout>-<pid>-<timestamp>`, minted ONCE per invocation
(`tooling/src/_shared/artifacts.ts` `runId`). `<checkout>` is `main` for the primary checkout and the
worktree directory's basename for a lane (`agent-ac04b6aea89a434f7`), derived from the KIND of the `.git`
entry — a linked worktree's is a FILE, the primary checkout's a DIRECTORY — so it costs one `stat` and
never shells out to git.

**The layout.**

```
reports/
  runs/<instrument>/<runId>/…      ← every byte a run writes, and the ONLY place it writes
  runs/<instrument>/<runId>/.inflight   the marker: dropped at open, deleted at publish
  verify.json          → symlink into runs/verify/<runId>/verify.json
  verify/              → symlink into runs/verify/<runId>/stages/   (per-stage `<stage>.log`)
  check-structure.json → symlink into runs/structure/<runId>/check-structure.json

The structure record's shape (since #1107, 2026-09-02): `run / gates / toolErrors / scanAlarms /
populationAlarms / total / ok` **plus `timing: { totalMs, gateMs }`**, and each `gates[]` entry carries
`timing: { totalMs, phaseMs: { begin, visit, visitFile, run, finalize } }` beside `scan` — measured inside
the one `guard()` wrapper every hook call passes through, charged even when a gate throws, per-phase
values floored and the pass total ceiled so `Σ phaseMs === totalMs` and `totalMs ≥ Σ gates` hold
arithmetically. The console prints the pass cost and the five slowest gates; a gate-cost claim cites the
artifact, never a scratch profiler.
  test-report.json     → symlink into runs/test/<runId>/test-report.json
  test-shards/         → symlink into runs/test/<runId>/test-shards/
  ct-flaky.json        → symlink into runs/ct/<runId>/ct-flaky.json
  snaps/<name>.png     → symlink into runs/snap/<runId>/snaps/<name>.png   (one pointer per ARTIFACT)
  design-audit/…       → symlink into runs/ui-audit/<runId>/design-audit/…
  traces/ recordings/ perf-meter/ motion-audit/  → the same, per artifact, from their instrument's slot
  baselines/             NOT slotted — a persistent CORPUS one run writes and a later run reads (below)
  verify-history.jsonl   NOT slotted — an append-only multi-writer ledger (below)
```

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

**What this does to the #410 in-flight stub.** The ruling survives — its INPUT changed. The stub is still
written before the walk, still says `complete: false`, and is still refused by every reader; it now lands
in the run's slot instead of over the published path (writing an in-flight stub to a shared path is
precisely what a concurrent sibling clobbered). The "this run DIED" tell reaches a fixed-path reader
through `abandonedRuns()` — a slot whose in-flight marker outlived its pid — and `check:show` refuses when
one is NEWER than the run the pointer resolves to. That is strictly finer than the old signal, which could
not tell "my run died" from "a sibling lane is mid-run". A LIVE sibling is deliberately not a refusal.

**`verify-history.jsonl` is deliberately NOT slotted.** It is a per-checkout ledger of every run, not one
run's verdict: appends are append-mode single-line writes that the kernel does not interleave at this size,
and slotting it would give each run a one-line history to compare against — destroying the only thing it
exists for. Each line carries its `runId`, so a reader can still attribute a row.

**The RENDERED instruments (#1164).** `snap` and `design-audit` (`ui-audit`) are the surviving rendered
browser instruments. `record` (`screen-record`), `motion-audit`, and `perf-meter` (`cpu-profile`) are
loud compatibility redirects into Snap and open no browser. These commands were the leftovers #1029 deferred, on the reasoning that a
caller NAMES those artifacts with `--out`. That reasoning did not survive contact: lane-unique `--out`
names are a BRIEF CONVENTION, not a mechanism, and on 2026-09-02 two side-eye lanes on one checkout both
took the default name and produced a `root.png` neither could claim (a third read a sibling's
`design-audit` report as its own, #1114 R-3). They are now slotted, with ONE difference the `--out` keying
forces: a verdict instrument publishes a FIXED alias set known before the run, while a rendered
instrument's alias set is whatever it wrote — so `finishInstrumentRun` ENUMERATES the slot and publishes
one pointer PER ARTIFACT FILE. `reports/snaps/` therefore stays a real DIRECTORY of per-artifact pointers
rather than one directory symlink, which is required and not cosmetic: CT and e2e specs write PNGs
straight into it with Playwright, and file headers across `packages/` cite individual shots as durable
evidence.

**The STATEFUL SESSION (#1231, `docs/design/1208-instrument-substrate.md` §3.7–§3.8).** A `pnpm snap --session <name> …` call is still ONE run with ONE slot — the CLIENT opens it (`withInstrumentRun("snap")`)
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
- **Enforcer: policy `tooling-artifact-run-slot`** (family `tooling-artifact`; the arm-G successor of the retired `tooling-shared-plumbing`) — a tool that calls `artifactDir`/`artifactFile` and
  whose `cli.ts` does not open a run slot is RED, so the next instrument cannot regress into the shared dir.
- **A RED run publishes normally** (a failing verdict is still a complete artifact, and the failure shot is
  the receipt the reviewer came for); a CRASHED one publishes nothing and leaves the `.inflight` marker —
  the `abandonedRuns` tell.
- **`baselines/` is deliberately NOT slotted**: it is a persistent corpus `snap --baseline` writes and a
  LATER `snap --diff` reads, so filing it in a pruning ring would turn the next diff into NO-BASELINE.

**Still not slotted (tracked on #1029):** the artifact paths named by `playwright-ct.config.ts`
(`ct-report.json`, `ct-report/`, `ct-results/`) and `playwright.config.ts` (`e2e-report*`, `e2e-results/`),
and `mutation-probe/`, `cpd/`, `coverage/` — runner-owned or tool-owned output directories whose writer is
not one of ours.

### 3.4 The scope model

`tooling/src/verify/lib/selection.ts` is the ONE resolver: a `--changed`/`--file`/`--package`/`--scope` request
resolves ONCE into a `Selection`, the superset every stage's `scopedArgv` reads from. Each stage decides how
(if at all) it runs over that selection:

- **The honest per-tool floor:** biome/eslint/docs = the file; tsc = the OWNING PACKAGE (file-scoped tsc is
  unsound, §2.1); depcruise = the file; structure = the walk scoped via `tooling/src/verify/ops/scoped.ts`.
- **CT (Playwright component tests) = mirror + declared sweeps — the ONE deliberately-open edge**
  (owner-ratified 2026-07-17). A changed `packages/{ui,client}/src/<p>.<ext>` selects its test-layout
  mirror `tests/{ui,client}/<p>.ct.tsx` IFF it exists on disk (no mirror ⇒ no contribution); a changed
  `tests/**/*.ct.tsx` selects itself (a `.suite.ct.tsx` cross-cutting suite never — it mirrors no single
  module, so it rides sweeps only). On top of the mirror map sits a SMALL, honest table of DECLARED
  BLAST-RADIUS SWEEPS — the classes that make mirror-only a LYING green (a token/skin-fragment change
  surfaces in computed-style assertions everywhere; a client registry/provider/factory throws in every
  story; the CT harness/config; a shared ui GROUP CORE like `charts/chart/**` or `markdown/**` internals):
  any changed path matching a trigger escalates to running that trigger's mirror DIR(s), a superset of the
  individual mirrors. This is UNDER-selecting by design — honest ONLY because a scoped green is NEVER the
  coverage verdict (§3.7): the push bar runs the WHOLE CT suite. The sweep table lives in `selection.ts`
  (`CT_SWEEP_TRIGGERS`), each row carrying its incident class. No CT-relevant change ⇒ the stage no-ops.
- **`scopedArgv` returns the concrete scoped argv, OR a sentinel:**
  - `"whole-only"` ⇒ **DEFER** at a scoped tier (a cross-file reconciliation — registry/coverage/parity/
    membership — has no honest partial form). A deferred stage prints a named notice ("runs at
    `verify --static`/`--push`/`--full`") and is recorded in the artifact; it is NOT a failure.
  - `"skip-empty"` ⇒ the scope resolves to zero relevant paths for this tool (e.g. eslint with no file in
    its surface); the stage is a no-op this run.
  - ABSENT `scopedArgv` ⇒ the stage is whole-only (deferred at a scoped tier) by default.
- **Browser-test type consumers:** production package source, tooling source, and shared test helpers can
  enter `tsconfig.tests-dom.json` through imports without being roots. Their edits conservatively run that
  program, as do package scopes, until the complete closure router can narrow the population honestly.
- **Deletions:** a git-changed set KEEPS deleted paths — the structure walk + the deleted file's owning
  per-package tsc legitimately reason about a deletion — but the per-tool file-list views (eslint/depcruise/
  docs, which hand CONCRETE file args to a child that hard-errors on a gone path) DROP them.
- **`--strict-scope`:** a whole-only stage at a scoped tier REFUSES (exit 3) instead of deferring — for a
  caller who wants a scoped run to fail loudly rather than silently skip the whole-project gates.
- **A SCOPED green is NOT done.** It defers every whole-project gate (the exact gates that catch
  half-registration across maps). The whole `pnpm check` (= `--static`) is the verdict — AGENTS.md §4.

### 3.6 The parity gates

Two live parity gates keep the registry and the scripts honest, both directions:

- **`verify-registry-parity`** (`tooling/src/verify/gates/verify-registry-parity.ts`, docRow cites §3.6):
  - Arm 1 — every `package.json` script matching the verification shape
    (`check*`/`test*`/`lint*`/`typecheck*`/`depcruise*`/`e2e*`/`cpd*`/`format*`) must be a registry stage's
    `pnpm <script>` argv, OR on the small `NON_STAGE_ALLOWLIST` (the verify host + its check alias, the
    WRITERS `lint:fix`/`format`/`format:docs`, the depcruise mermaid ARTIFACT generators, `cpd:report`,
    the `check:show` inspector, `depcruise:affected`). A forgotten script is RED.
  - Arm 2 (the mirror) — every registry stage's whole-scope `pnpm <script>` argv must name a REAL
    `package.json` script (a dead row is RED). Guarded on the presence of the `verify` script so a synthetic
    example `package.json` doesn't flag every registered stage.
- **`enforcement-registry-parity`** — the sibling per-table pattern (reconciles the Active-Gates catalog
  against `loadGates()`); the copy-this precedent for any future docs↔code table.

### 3.7 The test lanes as ONE concept

The behavioral suites are ONE `tests` concept expressed as stages with tier + scope, not a folklore list:

- **`tests:tooling`** (tier `full` only) runs the complete instrument battery through the native Vitest execution groups. `tooling/src/_shared/test-kinds.ts` owns test-kind and repository-resource registration; `vitest.config.ts` derives group selectors from it rather than maintaining a filename roster. Normal execution groups use `sequence.groupOrder: 0`; the `repository` group uses order 1 and `fileParallelism: false`, so repository-resource files run afterward and serially within that group. `tests:execution-membership` reconciles collection. The former browser-drive shard is retired after its two structural suites passed concurrent execution. Measured-rate metadata remains available independently of group membership. Vitest's API calls these execution groups projects; they are unrelated to pnpm workspace packages.
- **`tests:node`** (tiers `changed`/`push`/`full`) — `pnpm test:node` = the PRODUCT vitest projects
  (`unit`/`integration`/`repository`/`contract`; since #1523 NOT `tooling`). **THE CT HALF LEFT THIS STAGE IN #1848** — it rode here from
  2026-07-17, and the merged stage's ONE 45-minute hang ceiling stopped covering the pair once #1835 put CT
  on the shared profile's worker cap: `verify --full` on 2026-09-06 reported `[tool-error] TIMED OUT` on a
  QUIET box for a stage that was still working, which under the exit contract means the run is not a
  verdict. The CT suite is `browser:ct` again, with a ceiling DERIVED from `tooling/concurrency-profile.json`
  (§3.7b). `pnpm test` still COMPOSES both halves as the explicit product-test command and the manual
  `tests:product-composite` registry row; it is not a separate commit ritual, so no tier runs it and
  nothing double-runs.
  Scoped execution uses Vitest's configured projects without a copied project roster, and since #2232 the
  node arm chooses its CONFIG MODE from what the runner said it would select, never from a filename:
  a selection carrying no `types-*` project runs `--runtime-only` (the thin runtime config, which omits the
  typecheck projects BEFORE any `--project` filter applies); a selection that is entirely `types-*` passes
  those project names and no `--runtime-only`, the two being mutually exclusive by construction; a MIXED
  selection narrows neither, because the caller named both halves. `--related` is runtime-only whatever the
  attribution says — its operands are source files, and the type-assertion door is `pnpm test:types`.
  Before it, every scoped node run carried the typecheck projects, so a parse error anywhere in the
  `tsconfig.json` or `tsconfig.tests-dom.json` program exited the run 1 with every named test green
  (measured: a `.test-d.ts` claim reddened by a planted parse error in the BROWSER program, which its own
  file is not in). Git-derived changes
  use native `--changed`; explicit test paths pass native collection preflight; explicit source or mixed
  inputs use native `related`. Folder inputs expand to current authored files from Git's tracked and
  exclude-standard untracked views, omitting deleted files; a package request selects its test mirror.
  All node runs enter `test:scoped` and retain watchdog supervision and the owned 0/1/2/3 exit contract.

  **Asserted and derived empty selections differ.** A missing direct test path is misuse (3), and an
  existing direct test path contributing no collected tests is a tool error (2). Related sources may have
  zero runtime dependents; that derived empty is explicitly printed and exits cleanly through a local
  `--passWithNoTests` flag. The default config and whole-suite commands retain `passWithNoTests: false`.
  Direct `test:scoped --related` requires source files before runner flags; directories are refused with
  guidance to use `verify --scope` for authored-folder expansion. **The vitest run is wrapped by `scripts/vitest-supervised.mjs`
  (#345, re-rooted #1012):** vitest 4.1.11's run path has exactly ONE unbounded await — `Pool.run`'s
  `await testFinish.promise`, settled only by a worker's `testfileFinished` message or a runner error/exit
  event — and the CLI reaches `ctx.exit()` (which arms vitest's own unref'd `teardownTimeout` force-exit)
  only AFTER that run promise resolves. So a worker that dies without settling its task resolver hangs the
  parent FOREVER, before any backstop is armed: every per-file line prints and the summary never does.
  There is no upstream remedy to import (re-derived 2026-09-01: no release above 4.1.11; vitest#10057 was
  closed by its own author as premature and targets a spurious FAILURE, not a hang; vitest#10162 was
  withdrawn for lack of a repro and reproduced on `threads` too), so the remedy is external and must
  CONTAIN the wedge, not merely detect it. The supervisor therefore runs **one vitest process per
  `--project`, sequentially** (`reports/test-shards/<project>.json`, merged into the one
  `reports/test-report.json` contract) and tees each shard's output. **The kill signal is absence of
  PROGRESS, not silence** — a truth repair paid for on 2026-09-01, when the old silence-only rule was
  measured to be the PRIMARY defect: vitest's default reporter prints nothing while a single file runs, and
  `tests/tooling/ast/cli.repo.int.test.ts` (every row spawns the real `pnpm ast` CLI over the whole ts-morph
  workspace, on 120s/300s budgets) held a healthy battery silent for 7+ minutes with a grandchild burning
  \~4.5 cores; that run finished naturally 36 minutes later having spent 1,057,996 ms inside that one file.
  So the watchdog samples the CPU jiffies of the shard's parent AND every descendant via `/proc` on each
  tick; CPU burned anywhere in the tree counts as activity exactly like output. A shard's process group is
  SIGKILLed only when it has been silent for `ORB_TEST_HANG_TIMEOUT_MS` (default 5 min) **AND** the whole
  tree burned no CPU across that window — which is precisely the true wedge, every process idle in
  `ep_poll` at zero CPU. `ORB_TEST_HANG_MAX_MS` (default 30 min) is the absolute silence ceiling, and it
  runs on its OWN clock: CPU progress pushes the no-CPU timer forward but never the ceiling's, or a busy
  tree would postpone the backstop forever. (The same capture found `vitest.config.ts`'s now-retired serial-lane row (then one list, split into
  the now-retired ~~`SERIAL_INT_PRODUCT`~~ + ~~`SERIAL_INT_TOOLING`~~ registries by #1842)
  for that suite still spelling its pre-`8931a886c` path, so the heaviest whole-workspace file had been
  running in the PARALLEL lane — repointed in the same commit.) Before
  the kill it writes `<run slot>/test-wedge-<project>-attempt<n>-<ts>.txt` (§3.3b — the shards, the merged
  report and the wedge dumps all live in the run's own slot; `reports/test-report.json` and
  `reports/test-shards/` are the published pointers)
  — the wedged pid's `/proc` state/wchan/fds, the surviving worker tree, and the SUSPECT list (files the
  shard's previous report named that this run never announced as finished). A shard the watchdog killed is
  re-run **exactly once**, and only when its own fresh report is not a complete pass: a wedge is a tool
  error, a red is a verdict, so a shard that FAILS TESTS is never re-run. The verdict predicate is
  unchanged — exit 0 ONLY for a COMPLETE pass, a missing report or a vanished test (the crashed-worker
  signature) is exit 1, never a false green — and a contained wedge is announced on stderr and recorded in
  the merged report's `orbShards[].wedges` so a green never hides one. Guard:
  `tests/tooling/vitest-supervised.test.ts`.
- **`browser:ct`** (tiers `changed`/`push`/`full`) — at `push`/`full` it is the WHOLE CT suite
  (`pnpm test:ct --retries=2`, the visible retries flag so parallelism flakes RETRY instead of blocking a
  push), and it is the push tier's CT coverage verdict. It carries `hangCeilingBaseMs` DERIVED from the
  profile (§3.7b): the CT wall clock is a function of `ctWorkers`, which is exactly what a shared constant
  could not express. At `changed`
  it runs the scoped CT view (§3.4) through `test:ct`: native collection preflight, an exclusive
  runner lease, and a private cold build directory. It does not reuse or clear another invocation's build
  directory. Scoped calls keep the config's zero-retry default; whole-suite retries remain explicit.

#### 3.7b The per-stage hang ceiling is DATA (#1848)

A stage's ceiling is not a performance budget — it is the line past which the stage is WEDGED, after which
its process group is killed and the classifier scores a TOOL ERROR. `ops/run.ts` carried one hand-typed 45
minutes for every stage, and that number stopped being true the moment a stage's runtime became a function
of a worker cap: on 2026-09-06 `pnpm verify --full` killed `tests:node` at 2,700,284 ms on a box at load
6-8/24 (slot `reports/runs/verify/main-3786947-2026-09-06T18-22-36-535Z`, `stages/tests-node.log:2473`) —
a false tool error for a suite that was merely still running.

So the ceilings are DERIVED from `tooling/concurrency-profile.json`'s `stageBudgets` row (the same file
that owns every worker cap, #1835), through `lib/stage-budget.ts`:

- `defaultMinutes` — every stage that does not declare its own.
- the CT suite — `ceil(ctSuiteWorkerMinutes / ctWorkers × ctCeilingFactor) + ctHostSlotWaitMinutes`, floored
  at the default. `ctSuiteWorkerMinutes` is MEASURED (2026-09-06: 488 files / 5,121 cases; a 25-file
  systematic sample cost 1,004 worker-seconds ⇒ \~160 worker-minutes for the suite); the host-slot wait is
  in the sum because a queued CT run spends it inside the stage's own wall clock, and `ct-runner-lock.ts`
  reads that same number for the wait it grants.

Change `ctWorkers` and every dependent ceiling moves with it. The runner still passes the result through
`budget()`, so a contended box stretches it further, never shrinks it.

- **`browser:e2e-smoke`** (`push`/`full`) — the fast `@smoke` model-free subset; the only automated
  per-push browser surface. **`browser:e2e`** (`full`), **`browser:e2e-live`** (`manual` — costs model
  credits), **`quality:mutation-gate`** (`full`), **`quality:mutation-report`**
  - **`tests:coverage`** (`manual` — report-only, no thresholds gate).
- **`tests:execution-membership`** (`static`/`push`/`full`, #22 — `tooling/src/verify/ops/tests-execution-membership.ts`)
  — `types:ownership`'s EXECUTION-lane sibling: THREE directions of "a test file is run by SOME
  runner, a runner glob matches SOME file, and no file is run by MORE than one runner". Asks each runner its
  own `--list` view (`vitest list --filesOnly --json` for all six node projects — each entry carries a
  `projectName`, which direction 3 reads; `playwright test --list --reporter=json` for `playwright.config.ts`
  — run with `E2E_LIVE=1` so `@live`-tagged specs, structurally matched but grep-skipped at routine run time,
  still count — and `playwright-ct.config.ts`), never re-parses glob strings (drift-proof). A `tests/**`
  runner-suffixed file in NO view REDs (never executed, direction 2); a runner view matching ZERO files REDs
  (the marinara silent-no-op disease — its server `pnpm test` globs matched nothing, direction 1); a file
  claimed by TWO OR MORE runtime views REDs naming every colliding view (direction 3, #1096) — one-lane-ness
  used to be an unverified construction property of the include/exclude sets (read by hand off `vitest
  list --json`'s per-entry `projectName`), now a checked invariant. Direction 3's runtime-view set is every
  vitest project EXCEPT `types` (typecheck-only, `test.include: []` — no runtime pass, so it cannot be a
  second EXECUTOR of anything) plus the two playwright configs, each counted separately.
- **`structure:db-baseline`** (`static`/`push`/`full` — `tooling/src/verify/ops/db-baseline-parity.ts`) — the
  committed squashed migration (`packages/db/src/migrations/0000_baseline.sql`) vs what the live
  `@orb/db/schema` generates, statement-set equal after whitespace/semicolon normalization
  (order-insensitive — FK order is proven applicable elsewhere). Pre-launch, schema changes SQUASH into that
  baseline and `freshDb` PUSHES schema-derived DDL, so every per-table `.int` test passes while the
  committed file rots: TWICE a bump shipped without a regen and sat ~10 hours until `verify --push` caught
  it (latest: the `schema_version` DEFAULT 5→6 drift). The comparison is in-process via `drizzle-kit/api`
  (~1s, no stack, no db file) — it was wired too LATE, not too heavy — and it is the SAME comparator
  `tests/tooling/verify/ops/db-baseline-parity.int.test.ts` calls (one home, two callers).
- **`ledgers:fresh`** (`static`/`push`/`full`, #817 — `tooling/src/verify/ops/ledgers-fresh.ts`) — every
  committed SINGLE-WRITER output vs a fresh derivation of itself, the oldest being
  `docs/reviews/caught-failure-ownership/population.json` (the caught-failure census — every row carries the
  `line`/`markerLine` of a site, so ANY merge that inserts lines above one re-stales it). The test-baseline
  manifest was the second and was DELETED with `monotonic-tests` (#2217). The census already had a freshness
  check, but it was a
  VITEST suite, so `pnpm check` stayed GREEN while main sat red on the next whole node run and regeneration
  was an unscheduled orchestrator barrier ritual — three re-lines in one night (2026-08-30: the #799 merge
  shifted `plugin-frame.ts` +5 and re-staled the census twenty minutes after the first regen). It runs the
  SAME derivations the regenerators run (one home each; GATE-AUTHORING §4.8's single-writer door keeps the
  WRITE) and writes nothing, printing the exact differing rows (`line 111 → 106`) and the regen command last,
  so the fix survives into `failureExcerpt`. Consequence for a lane: a newly TRACKED spec now needs a manifest
  regen before its commit (`git add` it first — the derivation reads `git ls-files`). Cost: the manifest half
  is milliseconds; the census half builds the whole-repo ts-morph project, measured 19.7s wall on the
  reference box — the same project `structure:full` already builds in the same tier, and the price of the
  derivation itself rather than of this stage. WHOLE-ONLY BY ABSENCE: no `scopedArgv`, so a scoped tier
  DEFERS it — a census derived from a scoped fileset is a census of a different tree and would call every row
  it did not walk stale. An EMPTY derivation is exit 2 (blindness), never a clean ledger. The `--check` arm is
  also reachable per-ledger: `cli.ts baseline <kind> --check`.
- **`structure:drizzle-kit`** (`static`/`push`/`full` — `pnpm --filter @orb/db exec drizzle-kit check --config=drizzle.config.ts`) — drizzle-kit's OWN migration-chain validator, the ORTHOGONAL half of its
  sibling above: `structure:db-baseline` compares the schema to the baseline's CONTENT, this one validates
  the `migrations/meta` CHAIN (every `_journal.json` entry has its snapshot; no two snapshots claim the
  same parent — the forked-chain collision two concurrently-generated migrations produce, probe-verified
  to exit 1). Against today's single squashed baseline it is a near-no-op (~1s) and that is the POINT
  (owner ruling): the guardrail is built BEFORE the need, so the first post-launch incremental migration
  lands into an armed one rather than minting it under pressure. Whole-only (one migrations dir). The
  post-baseline procedure it guards is `Tier-1-DB.md` §"When we migrate for real".
- **`quality:boot-chunk`** (`push`/`full`, #460, re-scoped by #591 — `tooling/src/verify/ops/boot-chunk-ratchet.ts`) — builds
  `@orb/client` for production and REDs when the BOOT PAYLOAD exceeds a committed byte ceiling. The measured
  quantity is the entry chunk (`packages/client/dist/assets/index-<hash>.js`) PLUS every
  `dist/assets/*.js` the emitted `dist/index.html` references (the module `<script src>` and every
  `<link rel="modulepreload" href>`), because the browser fetches a preloaded sibling on the same boot path.
  Summing is not a refinement, it is what stops the instrument LYING: commit 2b87a0d7c moved 36,584 B out of
  the entry chunk into a modulepreloaded `jsx-runtime-<hash>.js`, which the entry-file-only read scored as a
  −36,491 B win while the real payload moved +93 B — and the same blindness scores pushing 300 KB into a
  preloaded sibling as a win while boot gets no cheaper. It defends a win nothing
  else on the ladder can see: #433 (−20.4%) and #448 (−19.0%) took the boot chunk 1,146,760 → 740,339 B, and
  the regression mechanism is ONE new barrel import inside `main.tsx`'s static graph — every other stage
  stays green while it re-pays the whole cost. A byte ceiling catches every mechanism (a barrel, a fat dep,
  a lost `import type`, a route that stopped being lazy) instead of enumerating the ones already seen. PUSH,
  not static: the build is 15.45s warm (measured 2026-08-22) — cheap by build standards, but a bundler
  invocation is not the structural-fast commit bar. The ceiling (859,000 B = the measured 818,188 + 4.99%,
  re-derived 2026-09-01 after #995 separated production readiness from dev instrumentation)
  carries the `docs/reviews/mutation-config-calibration.md` calibration discipline in its own header:
  measured value, headroom arithmetic, re-calibrate conditions. UNMEASURABLE IS EXIT 2, never a pass — zero
  matching entry chunks or more than one, an unreadable `index.html`, a module script that is not the entry
  chunk, a referenced asset absent from disk, or an `/assets/*.js` referenced in a shape the boot-ref parser
  does not recognize (an under-count is the same lie with a smaller number) is "I could
  not measure", so a blind `0 bytes` can never read as under budget (#409 zero-hygiene). Whole-only: the
  boot payload is a property of the entire static graph reachable from the entry, so no changed-file subset is
  an honest partial. Pinned by `tests/tooling/verify/ops/boot-chunk-ratchet.test.ts` (the summing arm over a
  planted 2b87a0d7c-shaped dist, the split-is-not-a-win symmetry, over/under, and every unmeasurable arm)
  - the registry pin in `run.int.test.ts`.
- **`deps:orphan-ratchet`** (`push`/`full` — `tooling/src/verify/ops/orphan-export-ratchet.ts`) — the export-rot
  lens as a standing verdict: every export of `kit`/`contracts`/`db`/`server`/`client` that NOTHING reaches
  (prod or test) and that is unused in its own file, judged against a checked-in baseline
  (`tooling/src/verify/ops/orphan-export-ratchet.baseline.json` — the tree the 2026-08-03 sweep left, one row per
  deliberately-undecided export). Both directions RED: a NEW orphan, and a baseline row that is no longer
  one (consumed / tagged / deleted ⇒ remove the row). It shares the `pnpm ast orphans` substrate
  (`collectOrphanCandidates`) rather than re-deriving liveness. **It cannot lean on `deps:knip`** — probe-
  verified: the package `exports` maps already make these subpaths public API to knip, so knip flags none of
  them and its `tags: ["-@public"]` exemption never fires; this stage therefore reads
  `/** @public <reason> */` itself (a bare tag with no reason does NOT exempt). `packages/ui` is exempt as a
  whole (`ui-package-design.md` R2 — a sealed surface exists to be available), and star-suppressed
  candidates are reported but never ratcheted (an `export *` chain may hide a namespace consumer).

## 4. Hook + CI wiring

**The tiers ARE the hook wiring (§3):** "run everything" is a named tier, not a folklore N-command pipe
(`lefthook.yml`).

- **pre-commit → `pnpm check` (= `verify --static`).** Type/structure/lint/boundary red ⇒ cannot commit.
- **pre-push → `pnpm verify --push`.** ONE command, ONE summary, ONE exit, ONE json — static + `tests:node`
  - `browser:ct` (the two halves of `pnpm test`, split into their own stages by #1848) + `e2e-smoke`. Replaces the old 4-command piped pipe (run-all-report-all, max-severity exit).
- **CI → `pnpm verify --full`** (`.github/workflows/ci.yml`), `workflow_dispatch`-only (auto-triggers
  disabled 2026-07-05 — the real automated gate is the hooks).

### 4.3 Full-static-at-commit

Pre-commit runs the whole STATIC tier, NOT `--changed`. `--changed` + related-tests would be faster but
weakens the born-compliant doctrine ("won't pass `pnpm check` ⇒ won't commit"): a scoped commit gate defers
every whole-project reconciliation, so a half-registration across maps could commit clean. Full-static-at-
commit is the deliberate cost — the inner loop (`--changed`) is for iteration, the commit gate is the whole
static verdict. Browser suites never gate the static tier (vitest-browser hangs, `Spine-Testing.md` §7): CT
rides the `pnpm test` lane at push, e2e-smoke gates at push.
