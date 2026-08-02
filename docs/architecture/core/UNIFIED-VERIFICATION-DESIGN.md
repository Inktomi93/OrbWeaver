---
kind: law
status: active
updated: 2026-07-17
---

<!-- RETRO DRIFT NOTE (2026-07-24): carried from main at promotion. Verified against retro's as-built
     harness (scripts/verify/{run,registry,selection}.ts) — the stage set, tier ladder, exit contract, and
     the CT-merged-into-`tests:node` lane all still match. ONE stale reference: §2.2's membership resolver
     is `tsgo --listFilesOnly` in this text, but retro moved the CLI type lanes off tsgo/tsc6 to `ts7`
     (`scripts/ts7.cjs`; ts-morph/typescript-eslint keep the TS6 API). Read `ts7` for `tsgo` at that line;
     annotated inline below. No other drift found. -->

# Unified Verification Design

> The ONE verification surface. `pnpm verify` is the single entry that runs every check the repo can run —
> lint, types, structure, imports, deps, docs, tests, browser, quality — over four tiers, one scope
> convention, one exit contract, one summary artifact, generalized over a self-describing stage registry.
> AGENTS.md §4 states the doctrine ("iterate on `--changed`, claim done only after `pnpm check`, pre-push is
> `--push`, the works is `--full`"); this doc is its as-built spec. The CODE is truth on any conflict:
> `scripts/verify/{run,registry,selection,tests-type-membership,tests-execution-membership}.ts`,
> `scripts/check/{report,scoped}.ts`, `scripts/check/gates/verify-registry-parity.ts`, `lefthook.yml`,
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
built around these gaps. `scripts/verify/selection.ts` is the code home for §2.1–§2.2.

### 2.1 The editor blind spot

An editor (and a naive file-scoped `tsc`) type-checks a file against its NEAREST ancestor tsconfig. But a
file can be OWNED by a NON-ancestor config that reaches back into it — the browser `.tsx` reach-back trees
(`tests/ui/**`, `tests/client/**`, `tests/support/ct/**`, `playwright/**`) are claimed WITH dom by the
`ui`/`client` configs, not by any ancestor. File-scoped tsc is therefore unsound (it never sees consumers);
the honest per-tool floor is the OWNING PACKAGE, not the file (`selection.ts` header). The `types:packages`
stage runs `tsc -p <owning-config>`, never a file-scoped check.

### 2.2 A file in TWO programs

A NODE package's src (`kit`/`server`/`db`/`contracts`) belongs to TWO type programs at once: its own
package config, AND the DOM-less root graph (`tsconfig.json` `include: packages/*/src` sweeps every package
except the two BROWSER packages `ui`/`client`, which are graph-EXCLUDED and dom-typed by their own config).
On top of the static membership sits the **import-pull overlay** (rule 5): a package-src file the DOM-less
graph transitively imports belongs to the graph program too — the TS2584 class (a graph consumer of a
dom-typed export). `selection.ts` resolves this via a `tsgo --listFilesOnly` <!-- RETRO 2026-07-24: retro reads `ts7 --listFilesOnly` (scripts/ts7.cjs) --> membership set cached on
HEAD+dirty; a cache-cold miss falls back to "any package-src touch runs the graph" so `types:graph` is never
UNDER-run. This is why editing one `ui` file can legitimately require running the DOM-less graph stage.

### 2.4 Stage GROUPS

Stages are presented in groups (`lint`/`types`/`structure`/`imports`/`deps`/`docs`/`tests`/`browser`/
`quality` — the `StageGroup` union in `registry.ts`). Two groups carry more than one stage on purpose:

- **lint** = biome + eslint. Biome is the whole-repo fast linter; eslint carries the type-aware rules
  (`no-deprecated`, `tsdoc/syntax`, the react-surface gates) over the typed-API packages + the react test
  trees. Each catches a class the other cannot.
- **types** = three-plus tsc programs, each catching a class the others miss: `types:packages` (the honest
  per-package floor), `types:graph` (the DOM-less root graph — the §2.2 TS2584 class), `types:testd` (the
  vitest `.test-d.ts` typecheck lane), `types:tests-dom` (the DOM-coupled NON-`.tsx` test home), and
  `types:tests-membership` (the reconciliation floor, §3.7).

## 3. The harness

`scripts/verify/run.ts` is the entry; `registry.ts` is the stage ledger; `selection.ts` is the scope
resolver. `pnpm check` = `pnpm verify --static` (byte-compatible with the retired 8-stage check).

### 3.1 The stage registry

`scripts/verify/registry.ts` — every verification surface in the repo, self-described as a `StageDef`:

- `name` (kebab, unique) · `group` (§2.4) · `tiers` (§3.2 membership) · `argv` (the whole-scope
  `pnpm <script>` form, spawned `shell:false`) · optional `env` (child env; no current consumer) ·
  optional `scopedArgv` (§3.4 — ABSENT ⇒ whole-only) · `classify` (§3.3 — the native-exit adapter) ·
  optional `manualReason` (rendered by `verify --list`).
- **The classifiers, written ONCE** (§3.1/§3.3): `asViolations` (foreign tools — any non-zero = violation 1,
  a signal-kill null = tool-error 2; tsc's own 2 = type errors = a VIOLATION), `eslintScheme` (eslint's
  2 IS a tool-error — the opposite of tsc's 2), `ownScheme` (our 0/1/2/3-speaking tsx scripts pass through;
  an unexpected code is itself a tool-error).
- Adding a stage is a registry row; `stagesForTier` / `manualStages` derive the run + the list from it.
  `verify --list` prints every row with its tiers + scope + manual reason. `tests/tooling/verify-run.int.test.ts`
  pins the classifiers, the tier composition, and the scope derivations.

### 3.2 Tier composition (the ladder)

Four runnable tiers + a `manual` bucket. The WHOLE-TREE ladder strictly nests: **static ⊂ push ⊂ full** —
each tier ADDS stages, never drops one. `changed` is the SCOPED inner loop and is deliberately NOT ⊆ static:
it carries related-tests (`tests:node` over vitest's changed-file graph) that static omits by doctrine —
static is the born-compliant TEST-FREE commit gate. The honest containment for the inner loop is
**changed ⊆ push**.

| tier | what it runs | role |
| - | - | - |
| `changed` | the scoped inner loop: lint/types(per-owner)/structure/imports/docs over the changed set + vitest `--changed` related tests | fast iteration; `verify --changed` |
| `static` | biome + eslint + tsc×5 (`types:packages`/`graph`/`testd`/`tests-dom`/`tests-membership`) + `tests:execution-membership` + `structure:db-baseline` + `structure:full` + `imports:depcruise` + `deps:knip` + `docs:format` — no behavioral suite | `pnpm check` = `verify --static`; the commit gate |
| `push` | static + `tests:node` (vitest projects AND the CT suite) + `browser:e2e-smoke` + `deps:orphan-ratchet` (the export-rot ratchet — whole-graph liveness, too slow for the commit bar) | pre-push bar; `verify --push` |
| `full` | push + `quality:cpd` + `browser:e2e` + `tests:parity` + `quality:mutation-gate` + `deps:knip-prod` (the production-strict kept-alive-only-by-tests lens — full-tier during the buildout, promotes post-buildout) | the "nothing omitted" bar; `verify --full` (CI `workflow_dispatch`) |

The static tier is EXACTLY the ordered set `lint:biome, lint:eslint, types:packages, types:graph,
types:testd, types:tests-dom, types:tests-membership, tests:execution-membership, structure:db-baseline,
structure:full, imports:depcruise, deps:knip, docs:format` (pinned in the int test) — so `pnpm check` stays
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

### 3.4 The scope model

`scripts/verify/selection.ts` is the ONE resolver: a `--changed`/`--file`/`--package`/`--scope` request
resolves ONCE into a `Selection`, the superset every stage's `scopedArgv` reads from. Each stage decides how
(if at all) it runs over that selection:

- **The honest per-tool floor:** biome/eslint/docs = the file; tsc = the OWNING PACKAGE (file-scoped tsc is
  unsound, §2.1); depcruise = the file; structure = the walk scoped via `scripts/check/scoped.ts`.
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
- **Deletions:** a git-changed set KEEPS deleted paths — the structure walk + the deleted file's owning
  per-package tsc legitimately reason about a deletion — but the per-tool file-list views (eslint/depcruise/
  docs, which hand CONCRETE file args to a child that hard-errors on a gone path) DROP them.
- **`--strict-scope`:** a whole-only stage at a scoped tier REFUSES (exit 3) instead of deferring — for a
  caller who wants a scoped run to fail loudly rather than silently skip the whole-project gates.
- **A SCOPED green is NOT done.** It defers every whole-project gate (the exact gates that catch
  half-registration across maps). The whole `pnpm check` (= `--static`) is the verdict — AGENTS.md §4.

### 3.6 The parity gates

Two live parity gates keep the registry and the scripts honest, both directions:

- **`verify-registry-parity`** (`scripts/check/gates/verify-registry-parity.ts`, docRow cites §3.6):
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

- **`tests:node`** (tiers `changed`/`push`/`full`) — `pnpm test` = the vitest projects
  (`unit`/`integration`/`integration-serial`/`contract`) AND `pnpm test:ct --retries=2` (the Playwright
  component-test suite). **CT rides this merged lane (2026-07-17)** — the CT split existed only for the old
  single-thread constraint; merging it means the green-to-commit ritual (`pnpm check` + `pnpm test`)
  exercises the CT suite too, and the visible `--retries=2` makes parallelism flakes RETRY instead of blocking (the CT\_GATE env it replaced retired 2026-07-17). At
  `changed` scope: vitest's own related-test graph over the unit+integration lanes (serial + contract are
  whole-tree-shaped, deferred to push).
- **`browser:ct`** (tiers `changed`/`manual`) — at `manual` it is the CT-ONLY whole-suite iteration lane
  (`pnpm test:ct`, `retries:0`), kept as a named stage so it surfaces in `verify --list` and satisfies
  parity arm 1; a `push`/`full` row would run the suite TWICE (it already rides `tests:node`). At `changed`
  it runs the SCOPED CT view (§3.4 — the mirror map + declared sweeps, LANDED 2026-07-17) via a DIRECT
  `playwright test -c playwright-ct.config.ts <targets>` — TWO deliberate divergences from the `pnpm test:ct`
  script: (1) NO `rm -rf playwright/.cache` (inner-loop speed; the gate lanes keep the nuke for stale-bundle
  correctness — the scoped run's residual stale-cache risk is acceptable because scoped green is never the
  verdict, §3.4), and (2) NO retries flag (the retries:0 config default — small scoped runs don't hit the 500-test
  parallelism flakes, so the inner loop wants raw signal, not a retry-masked green). It is deliberately NOT
  at push/full: the WHOLE suite runs there inside `tests:node`, so the push CT coverage verdict rides that
  lane, not a same-named `browser:ct` row.
- **`browser:e2e-smoke`** (`push`/`full`) — the fast `@smoke` model-free subset; the only automated
  per-push browser surface. **`browser:e2e`** (`full`), **`browser:e2e-live`** (`manual` — costs model
  credits), **`tests:parity`** (`full`), **`quality:mutation-gate`** (`full`), **`quality:mutation-report`**
  - **`tests:coverage`** (`manual` — report-only, no thresholds gate).
- **`tests:execution-membership`** (`static`/`push`/`full`, #22 — `scripts/verify/tests-execution-membership.ts`)
  — `types:tests-membership`'s EXECUTION-lane sibling: BOTH directions of "a test file is run by SOME
  runner, and a runner glob matches SOME file". Asks each runner its own `--list` view (`vitest list --filesOnly --json` for all six node projects; `playwright test --list --reporter=json` for
  `playwright.config.ts` — run with `E2E_LIVE=1` so `@live`-tagged specs, structurally matched but grep-
  skipped at routine run time, still count — and `playwright-ct.config.ts`), never re-parses glob strings
  (drift-proof). A `tests/**` runner-suffixed file in NO view REDs (never executed); a runner view matching
  ZERO files REDs (the marinara silent-no-op disease — its server `pnpm test` globs matched nothing).
- **`structure:db-baseline`** (`static`/`push`/`full` — `scripts/verify/db-baseline-parity.ts`) — the
  committed squashed migration (`packages/db/src/migrations/0000_baseline.sql`) vs what the live
  `@orb/db/schema` generates, statement-set equal after whitespace/semicolon normalization
  (order-insensitive — FK order is proven applicable elsewhere). Pre-launch, schema changes SQUASH into that
  baseline and `freshDb` PUSHES schema-derived DDL, so every per-table `.int` test passes while the
  committed file rots: TWICE a bump shipped without a regen and sat \~10 hours until `verify --push` caught
  it (latest: the `schema_version` DEFAULT 5→6 drift). The comparison is in-process via `drizzle-kit/api`
  (\~1s, no stack, no db file) — it was wired too LATE, not too heavy — and it is the SAME comparator
  `tests/tooling/schema-baseline-parity.int.test.ts` calls (one home, two callers).
- **`deps:orphan-ratchet`** (`push`/`full` — `scripts/verify/orphan-export-ratchet.ts`) — the export-rot
  lens as a standing verdict: every export of `kit`/`contracts`/`db`/`server`/`client` that NOTHING reaches
  (prod or test) and that is unused in its own file, judged against a checked-in baseline
  (`scripts/verify/orphan-export-ratchet.baseline.json` — the tree the 2026-08-03 sweep left, one row per
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
  (incl. CT) + `e2e-smoke`. Replaces the old 4-command piped pipe (run-all-report-all, max-severity exit).
- **CI → `pnpm verify --full`** (`.github/workflows/ci.yml`), `workflow_dispatch`-only (auto-triggers
  disabled 2026-07-05 — the real automated gate is the hooks).

### 4.3 Full-static-at-commit

Pre-commit runs the whole STATIC tier, NOT `--changed`. `--changed` + related-tests would be faster but
weakens the born-compliant doctrine ("won't pass `pnpm check` ⇒ won't commit"): a scoped commit gate defers
every whole-project reconciliation, so a half-registration across maps could commit clean. Full-static-at-
commit is the deliberate cost — the inner loop (`--changed`) is for iteration, the commit gate is the whole
static verdict. Browser suites never gate the static tier (vitest-browser hangs, `Spine-Testing.md` §7): CT
rides the `pnpm test` lane at push, e2e-smoke gates at push.
