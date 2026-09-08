import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { budget } from "@orb/tooling/_shared/load-budget";
import { defineConfig } from "vitest/config";

// ONE config, lanes by SUFFIX via test.projects (the modern "workspace" — vitest.workspace.ts was
// deprecated in 3.2). NODE lanes only; BROWSER is Playwright (vitest browser-mode hangs — Spine-Testing.md §7).
// `test` (the fast lane) = unit + integration + contract; the two `types-*` lanes are opt-in (own script).
//
// CRITICAL: shared defaults live in the root `test` block, and EVERY project sets `extends: true` to
// inherit them. Per-runner options (cleanup/determinism/expect) do NOT reach a project without it —
// that's the latent trap neo-tavern fell into (its root isolate/restoreMocks/etc. are dead config
// because its projects omit `extends: true`). `coverage` + `reporters` are root-only (process-global)
// and apply regardless. Authority: core/Spine-Testing.md + DECISIONS-LEDGER §6.
//
// Kept at vitest/node DEFAULTS deliberately: `isolate: true` (fresh module graph per test file → the
// single-tenant globalMacroRegistry resets for free; do NOT copy neo's `isolate: false`) and
// `pool: 'forks'` (process isolation is safe for the libSQL native binding in the integration lane).

// `**/__g_*` — the check-gates self-test's reserved throwaway-fixture sentinel (tsconfig.base.json's
// exclude note). Some fixtures are `.test.ts`, so a CONCURRENT `vitest` lane could try to collect one
// mid-lifecycle (it's written then rm'd inside check-gates.int); ignore keeps every lane hermetic.
const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.stryker-tmp/**", "reports/**", "**/__g_*"];

// The box profile in force (tooling/concurrency-profile.json — the ONE home for every worker cap in the
// fleet, #1835). Read ONCE at config load: a config is a fresh process, so a caller that wants the
// dedicated-box numbers exports `ORB_DEDICATED_BOX=1` in the shell that launches the run.
const CONCURRENCY = readConcurrencyProfile();
const inCI = process.env["CI"] !== undefined;

// The QUIET-BOX bases every wall clock below is derived from (`budget()` stretches them by the box's
// per-core contention and caps the stretch at ORB_BUDGET_CEILING_MS). They are BASES, never ceilings a
// suite may read: a file that needs longer says so with its own `vi.setConfig(scaledBudget(...))`.
const BASE_TEST_TIMEOUT_MS = 5000;
const BASE_HOOK_TIMEOUT_MS = 10_000;
// integration-serial + tooling-serial: whole-tree scanners + heavy full-`createServices` composition files.
const BASE_SERIAL_TIMEOUT_MS = 30_000;
// SERIAL_INT_TOOLING — the `tests/tooling/**` half of the serial set: instrument self-tests that CANNOT run
// in the parallel `tooling` lane, routed by EXPLICIT PATH (not a filename suffix — a `*.serial.int.test.ts`
// rename trips the test-layout / test-presence structure gates, which only recognize `.int.test.ts`). The
// `tooling-serial` project globs EXACTLY this set and every other project subtracts it, so a file runs in
// one lane or none. #1842 MOVED these out of `integration-serial`: while they sat in a PRODUCT lane,
// `verify --push` kept paying for them through `tests:node` no matter what the diff touched — the exact
// cost #1523 split off, leaking back through the contention lanes. Two reasons a file is here:
//   1. TREE-WRITERS — tooling self-tests that write fixtures into / shell whole-tree tools against the
//      REAL package tree at fixed paths (they clobber each other in parallel).
//   2. WHOLE-TREE SCANNERS that flaked (5s-timeout, NOT wrong value; pass in isolation) under fork
//      contention. Serial + the lane's 30s testTimeout fixes them.
// TO ADD one: append its path here (keep the name `.int.test.ts`) if it writes into the real tree at a
// fixed path, binds a fixed port/file, or scans the whole tree. Everything else stays in the parallel
// `tooling` lane.
const SERIAL_INT_TOOLING = [
  // 1. tree-writers
  "tests/tooling/check-gates.int.test.ts",
  // Plants `__g_` fixtures at fixed real-tree paths AND reaps every `__g_*` on teardown — the same
  // sentinel space check-gates.int owns, so the two MUST never run concurrently.
  "tests/tooling/gate-ignore-grammar.int.test.ts",
  // #968's pin drives `stableJson`, the doc-catalog's ONE canonical serializer, which round-trips a value
  // through the biome BINARY via a temp file at the FIXED path docs/catalog/catalog.tmp.json — two
  // concurrent callers clobber each other's tmp, so it is a class-1 tree-writer.
  "tests/tooling/doc-catalog/ops/catalog.int.test.ts",
  // #949 compiler parity: whole UI/client source graph → #961 provenance → Oxide → Tailwind compile.
  "tests/tooling/css-merge-parity.int.test.ts",
  // 2. whole-tree scanners (flaked on the parallel 5s timeout under fork contention)
  "tests/tooling/gate-conformance.int.test.ts",
  // #751 — loads the WHOLE gate corpus and runs it over the WHOLE workspace, because `gate-ignore-inventory`
  // reaches a verdict on a marker only when a sibling gate was offered it in the SAME pass. Cold ts-morph
  // workspace load + a 233-gate single pass (~6 min), over the same tree `check-gates.int` writes fixtures
  // into. (#775's arm is pinned by tests/tooling/verify/gates/dangling-refs.int.test.ts, which runs its ONE
  // self-contained gate in ~21s and stays in the parallel lane.)
  "tests/tooling/verify/gates/caught-failure-ownership.int.test.ts",
  // The `pnpm ast` audit-epilogue proof: every row SPAWNS the real CLI, which loads the whole workspace
  // into ts-morph (~11s each). Five of those in the parallel lane is a load bomb, and no parallel-lane
  // timeout covers them — the rows carry explicit 120s timeouts (300s for the two typed whole-workspace
  // rows) and run one at a time here. PATH REPOINTED 2026-09-01 (#1012): this row read
  // `tests/tooling/ast-observability.int.test.ts` for months after 8931a886c moved the file to
  // `tests/tooling/ast/cli.int.test.ts` WITHOUT touching this config — so the row matched nothing and the
  // file silently ran in the PARALLEL lane, i.e. exactly the load bomb this entry exists to prevent.
  // Measured on the stale config: 1,057,996 ms (17.6 min) in `|integration|`, one row failing, and ZERO
  // output for the whole stretch — which is what the `pnpm test` hang watchdog was killing at 300s.
  "tests/tooling/ast/cli.int.test.ts",
  // test-presence: a whole-tree scanner (same class as gate-conformance above) that flaked on the parallel
  // 5s timeout under verify --push's full-suite load — the plugin train grew the tree past the edge (it
  // passes alone ~3.4s but exceeds 5s under fork contention). Serial + 30s covers the scan weight.
  "tests/tooling/verify/gates/test-presence.int.test.ts",
  // The run-completeness planted controls (#410): every case SPAWNS the real `verify structure` CLI over a
  // planted root and its abnormal arms are TIMING-SHAPED — the SIGKILL control gives the child 4s to boot
  // node, load the CLI and write its in-flight stub, then kills it. Under parallel fork contention the
  // child does not always reach the stub write inside that window, and the read of
  // `<root>/reports/check-structure.json` throws ENOENT — a contention flake, NOT a wrong verdict (passes
  // 6/6 isolated, 2026-08-22). Serial removes the contention; the roots themselves are mkdtemp-isolated
  // (tests/support/tool-fixtures.ts `plantedTree`), so this is class 2, not a shared-state tree-writer.
  "tests/tooling/verify/ops/structure.int.test.ts",
];

// SERIAL_INT_PRODUCT — the PRODUCT half of the serial set (`tests/server/**`, `tests/support/**`): the
// `.int.test.ts` files that cannot run in the parallel `integration` lane. The `integration` project globs
// all `.int.test.ts` and EXCLUDES this set; `integration-serial` globs EXACTLY this set — so a file runs in
// one lane or the other, never both, never neither. Two reasons a file is here:
//   1. FIXED-RESOURCE BOOT — lifecycle binds a fixed port 18788 + a fixed db file, so it assumes serial.
//   2. Heavy full-`createServices` composition files that flaked (5s-timeout, NOT wrong value; pass in
//      isolation) under fork contention. Serial + the lane's 30s testTimeout fixes them. This does NOT
//      weaken chat.int's D53 ReDoS tripwire — the guard fires in ~50ms and an UNWIRED watchdog hangs for
//      MINUTES, so 30s still trips red on a regression (~400× margin).
// TO ADD a new serial test: append its path here (keep the name `.int.test.ts`). Put a file here if it
// binds a fixed port/file or is a heavy full-composition file that times out under parallel contention.
// Everything else is assumed `:memory:`-isolated + light enough for the parallel lane (proven 0-fail at 14
// workers, report §3).
const SERIAL_INT_PRODUCT = [
  "tests/server/entry/lifecycle.int.test.ts",
  "tests/support/fixtures.int.test.ts",
  "tests/server/transport/cross-tenant-sweep.suite.int.test.ts",
  "tests/server/entry/compose/chat.int.test.ts",
  // The DB6 databank settings wire (Phase B ④): a full-`createServices` composed-real file — the first
  // test pays the cold whole-server-graph import + createServices cost, which flakes a parallel 5s timeout.
  "tests/server/entry/compose/databank.int.test.ts",
  // The P6 agent-seat wire round-trips (D60): full-`createServices` app-fixture files — cold import of the
  // whole server graph on the first test flakes a parallel 5s timeout.
  "tests/server/transport/trpc/routers/chat.int.test.ts",
  // rpg compose wire: repeatedly flaked with 5s/20s timeouts under fork contention (heavy full-composition
  // file, same class as chat.int/databank.int above).
  "tests/server/entry/compose/rpg.int.test.ts",
  // The saved-party apply, composed-real (#26): full-`createServices` app-fixture file — the first test
  // pays the cold whole-server-graph import + createServices cost (the databank.int/chat.int class).
  "tests/server/entry/compose/roster-preset.int.test.ts",
  // The multi-human persona-resolution suite: full-`createServices` app-fixture file whose first test pays
  // the cold whole-server-graph import (measured 3.4s isolated → 5s-timeout flake under fork contention).
  "tests/server/entry/compose/persona-multihuman.suite.int.test.ts",
  // The composed first-run persona posture: same class (full-`createServices` app fixture, cold import on
  // the first test).
  "tests/server/entry/compose/assets-character.int.test.ts",
  // The demo-pack virgin-boot proof: same class again — it boots the REAL composition root with vLLM
  // disabled and replays six transcript fixtures + the rpg board, so its first test pays the cold graph
  // import plus the seed work. Thrice-sighted 5s-timeout flake under full-battery fork contention;
  // passes 7/7 isolated (2026-08-03).
  "tests/server/entry/boot/seed-demo-chats.int.test.ts",
  // The `run_tool` compose wire (#691): a full-`createServices` app-fixture file whose first test pays the
  // cold whole-server-graph import + compose (measured 5.2s in the parallel lane — the same 5s-timeout flake
  // class as databank.int/persona-multihuman above).
  "tests/server/entry/compose/automation-plugin.int.test.ts",
];

// Instrument tests form one subject population; scheduling exceptions are revalidated separately.
const TOOLING = ["tests/tooling/**/*.test.ts"];

// TYPES_BROWSER — every `.test-d.ts` file the DOM-less root graph (`tsconfig.json`) does NOT root, so
// checking it there is a WRONG-LIB double-report (or, for the two `tests/client`/`tests/e2e` trees below,
// simply UNCHECKED — `ignoreSourceErrors` swallowed both classes identically). #1313's own issue body named
// six (the ones whose subject imports `@orb/ui`/`@orb/client` directly); a full `ts7 --showConfig` diff of
// `tsconfig.json` against the whole `.test-d.ts` census found TWO more riding the same mask, both with
// their OWN header already saying so: `tests/client/lib/collection-contracts.test-d.ts` ("that green is
// VACUOUS (its program excludes `tests/client` wholesale)") and `tests/e2e/support/mirror-parity.test-d.ts`
// ("that green is VACUOUS: that lane's program is `tsconfig.json`, which excludes `tests/e2e` entirely").
// Fixing 6 of 8 would leave the exact defect class alive for the other 2, so all 8 land here. Explicit
// list, not a directory glob — a `.test-d.ts` is added here deliberately, the same doctrine as
// `tsconfig.tests-dom.json`'s own per-file `include` (its header). All eight already sit under
// `tests/client/**/*.ts`, `tests/ui/**/*.ts` or `tests/e2e/**/*.ts`, which that config's `include` sweeps
// wholesale — so no tsconfig edit is needed here, only re-routing WHICH vitest project checks them. Pinned
// TOTAL by `tests/tooling/testd-lane-program-coverage.int.test.ts`.
const TYPES_BROWSER = [
  "tests/client/state/durable-local.test-d.ts",
  "tests/client/state/create-gated-store.test-d.ts",
  "tests/client/forms/create-autosave-entity-form-model.test-d.ts",
  "tests/client/lib/registry.test-d.ts",
  "tests/client/lib/collection-contracts.test-d.ts",
  "tests/ui/primitives/input/index.test-d.ts",
  "tests/ui/primitives/button/index.test-d.ts",
  "tests/e2e/support/mirror-parity.test-d.ts",
];

export default defineConfig({
  // NO `esbuild` key ON PURPOSE (2026-08-03): vitest 4 resolves the rolldown vite 8, which configures
  // oxc and IGNORES esbuild options — the old `esbuild: { target: "es2025" }` was a silent no-op that
  // ALSO printed "Both esbuild and oxc options were set…" once per lane, every run. No replacement
  // needed: oxc's default output runs untouched on node ≥26 (es2025-native), so there is nothing to
  // downlevel. (The pnpm esbuild-0.28 override in pnpm-workspace.yaml stays — other consumers.)
  test: {
    exclude: IGNORE,

    // WALL CLOCKS ARE LOAD-SCALED (#1232, docs/design/1208-instrument-substrate.md section 7.1). These two
    // used to be vitest's own DEFAULTS (5s test / 10s hook) — invisible numbers written for an idle box,
    // and the single largest source of "reds" that were really contention: the parallel integration lane
    // took five timeouts at loadavg 41 on 2026-09-02 with nothing wrong in the code, and a hook timeout
    // reads IDENTICALLY to a real assertion failure in a batch report. Stated out loud here and stretched
    // by the box's per-core contention through the ONE policy, so a quiet run is byte-identical to the old
    // default (factor 1) and a contended one finishes instead of dying as an opaque red. Evaluated ONCE at
    // config load, which is also when the supervisor decides the shard order.
    testTimeout: budget(BASE_TEST_TIMEOUT_MS),
    hookTimeout: budget(BASE_HOOK_TIMEOUT_MS),

    // Tests default the search-corpus auto-index OFF (the production env floor is ON). With the no-GPU
    // derive-role fallback live, an ON indexer would turn every `character.create` in a test into a real
    // local-light jina embed (multi-GB model load) on the fire-and-forget bus. OFF keeps unit/integration
    // boots clean + deterministic; the compose-gate test flips it ON via a per-test AppSettings override.
    // We also silence the application logger (Pino) to prevent raw JSON logs from destroying the TTY
    // reporter console or blowing up CI/Agent logs. VLLM_DISABLED is pinned "true" so the suite is
    // ambient-env-proof: the env floor is a strict z.enum(["true","false"]) and a stray host/container
    // value (the dev-container once shipped "1") otherwise kills every server suite at module load.
    // ORB_ENV_NO_FILE pins the SAME ambient-proofing one level up: without it the env loader reads the repo
    // `.env` and fills every key the test did not set, so a suite silently asserts against the OPERATOR'S
    // DEPLOY CONFIG. Measured: a live box running `AUTH_MODE=oidc` + `OIDC_ISSUER` turned 3 correct tests red
    // (auth-mode projection, the `/join/:token` 404, the fail-closed jwksAllowlist) with nothing wrong in the
    // code, and `WIRE_CAPTURE=on` for a debugging session turned a 4th. A red that is not a regression trains
    // everyone to discount reds, and it makes the battery's verdict differ between a clean checkout and a
    // working machine. Tests now see ONLY what they set. The env loader's OWN tests are unaffected: their
    // `reimportEnvIn` helper wipes `process.env` before re-importing, which clears this too, so they still
    // exercise the real file-load + override arms against their crafted fixtures.
    env: { CORPUS_AUTOINDEX: "false", LOG_LEVEL: "silent", ORB_ENV_NO_FILE: "1", VLLM_DISABLED: "true" },

    // Fork budget for the parallel lanes (inherited by every `extends:true` forked project — unit,
    // integration, contract). THE VALUE COMES FROM THE ONE PROFILE (tooling/concurrency-profile.json,
    // #1835) and is 4 on a SHARED host, 14 under `ORB_DEDICATED_BOX=1`.
    // TRUTH REPAIR (2026-09-06): 14 sat here as the shipped default, described as "pinned to ~14 on this
    // 24-core shared dev box". 14 is the DEDICATED-box number — reports/tooling/VITEST-INTEGRATION-SPEEDUP.md
    // §2's measured 6.7× sweet spot on a QUIET machine, where the integration lane is IMPORT-bound rather
    // than CPU-bound so workers past ~14 buy no speed. On the real box it is never quiet: six lanes across
    // two accounts each took 14 forks, and 14h of Prometheus measured node_load1 at 105.8 with the
    // co-hosted homelab starved. The standing facts already told every lane to hand-type `--maxWorkers=4`,
    // which is the tell that the SHIPPED value was not the one the operating discipline assumed — the same
    // defect class as the CT `workers` pin below. A CLI `--maxWorkers=N` still overrides in both directions.
    // NOTE: Vitest 4 REMOVED `poolOptions.forks.maxForks` — the cap is now the TOP-LEVEL `maxWorkers`
    // (number of forks, since pool:"forks"). `integration-serial` sets fileParallelism:false, which
    // vitest forces to maxWorkers=1 — so this cap is a no-op there (one file at a time regardless).
    // (`minWorkers` was ALSO removed in v4 — a `minWorkers: 14` sat here as dead config until the
    // 2026-08-03 installed-surface audit; workers now ramp on demand up to the cap, which is fine.)
    pool: "forks",
    maxWorkers: CONCURRENCY.vitestMaxWorkers,

    // --- rigor defaults (inherited via `extends: true`) ---
    restoreMocks: true, // spies → original impl between tests (fake-at-edges, never-mock-internals doctrine)
    clearMocks: true, // clear mock call history each test
    unstubGlobals: true, // auto-undo vi.stubGlobal — no leaked globals across tests
    unstubEnvs: true, // auto-undo vi.stubEnv — no leaked env across tests
    allowOnly: false, // a stray `.only` FAILS the run (not just in CI)
    expect: { requireAssertions: true }, // every test must assert ≥1 — kills silent no-op tests
    chaiConfig: { truncateThreshold: 0 }, // full, untruncated diffs (branded ids / large frozen objects)
    // false (PD-115): every lane (unit/integration/contract/types) has matching files now, so a
    // lane whose include glob matches NOTHING (a typo'd pattern, a moved tree) FAILS instead of passing.
    passWithNoTests: false,

    // --- coverage: REPORT-ONLY (no `thresholds` → never gates; runs only via `pnpm test:coverage`) ---
    coverage: {
      provider: "v8", // AST-aware remap (Istanbul-accurate, v8-fast) — the v4 default
      // v4 removed coverage.all/extensions — include is explicit. Keep every shipped TS dialect plus the
      // tooling control plane in the measured corpus; omitting either makes a partial report read as total.
      include: ["packages/*/src/**/*.{ts,tsx}", "tooling/src/**/*.ts"],
      exclude: ["**/index.ts", "**/*.d.ts", "**/*.test-d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      reportOnFailure: true,
    },

    // --- reporters: CI-aware (junit for CI ingestion; default locally) ---
    reporters: inCI ? ["default", "github-actions", ["junit", { outputFile: "reports/junit.xml" }]] : ["default"],

    projects: [
      {
        // unit: `.test.ts` — pure logic, no db. EXCLUDE the other suffixes (they also end in .test.ts).
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: [...IGNORE, "tests/**/*.{int,contract}.test.ts", ...TOOLING],
        },
      },
      {
        // integration: `.int.test.ts` — real libSQL :memory:, real I/O. Runs PARALLEL (default
        // fileParallelism, capped at maxWorkers:14). Every file here is `:memory:`-isolated
        // (freshDb-per-test, tests/support/db.ts) so there is ZERO cross-file state; `pool:'forks'`
        // (inherited) keeps process isolation for the native binding. Measured 6.7× vs serial, 0 failures
        // across 346 domain files (reports/tooling/VITEST-INTEGRATION-SPEEDUP.md). EXCLUDES both serial
        // halves below; instrument tests are selected by the separate tooling population.
        // Do NOT switch `pool` to threads and do NOT set `isolate:false`.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.int.test.ts"],
          exclude: [...IGNORE, ...SERIAL_INT_PRODUCT, ...SERIAL_INT_TOOLING, ...TOOLING],
        },
      },
      {
        // integration-serial: exactly the `SERIAL_INT_PRODUCT` files (see the const above for the WHY +
        // how to add one). fileParallelism:false runs them ONE AT A TIME; testTimeout:30s covers their
        // scan/import weight on a contended box (chat.int's D53 ReDoS tripwire keeps a ~400× margin).
        // PRODUCT ONLY since #1842 — the instrument half is `tooling-serial` below, off the push bar.
        extends: true,
        test: {
          name: "integration-serial",
          include: SERIAL_INT_PRODUCT,
          exclude: [...IGNORE],
          fileParallelism: false,
          testTimeout: budget(BASE_SERIAL_TIMEOUT_MS),
        },
      },
      {
        // tooling-serial: exactly the `SERIAL_INT_TOOLING` files — `integration-serial`'s instrument twin,
        // same contention semantics (fileParallelism:false, the 30s serial budget) and a DIFFERENT TIER.
        // #1842 (owner: "take tooling out of the verify push and into full"): these ten files are the
        // heaviest suites in the repo, and while they rode a PRODUCT project every `verify --push` paid
        // for them through `tests:node` — #1523's split moved the parallel instrument battery to
        // `tests:tooling` and left this tail behind. `pnpm test:tooling` runs this project after the
        // parallel `tooling` shard; `pnpm test` no longer names it at all.
        extends: true,
        test: {
          name: "tooling-serial",
          include: SERIAL_INT_TOOLING,
          exclude: [...IGNORE],
          fileParallelism: false,
          testTimeout: budget(BASE_SERIAL_TIMEOUT_MS),
        },
      },
      {
        // tooling: EVERY `tests/tooling/**` runtime file — the INSTRUMENT battery, in a lane of its own
        // (#1523). Not a suffix lane: it is the one part of the battery that recertifies our TOOLS rather
        // than the product, and measured 2026-09-04 it was 71.1 CPU-min over 284 files against 9.0 for
        // tests/server's 1,185 — the owner's "about 30 minutes of tooling recertification, which makes it
        // tedious to run tests". Splitting it out is what lets `verify --push` stop paying for it on a
        // diff that never touched an instrument; the `tests:tooling` stage row (verify/lib/registry.ts)
        // owns WHEN it runs, and this project owns WHAT it is.
        //
        // The remaining serial instrument population is separate pending resource revalidation.
        // Both projects ride `pnpm test:tooling`, so the split is complete by TIER as well as by
        // subject. A file is in one lane or none — the `tests-execution-membership` gate proves it.
        extends: true,
        test: {
          name: "tooling",
          include: TOOLING,
          exclude: [...IGNORE, ...SERIAL_INT_TOOLING],
        },
      },
      {
        // contract: `.contract.test.ts` — zod round-trips / golden surface.
        extends: true,
        test: { name: "contract", include: ["tests/**/*.contract.test.ts"] },
      },
      {
        // types-node: `.test-d.ts` — typecheck-ONLY (no runtime pass) over the DOM-less root tsconfig.
        // Every `.test-d.ts` file EXCEPT `TYPES_BROWSER` (#1313 — those are checked under the correct
        // libs by `types-browser` below, so there is no wrong-lib double-report left for
        // `ignoreSourceErrors` to swallow: SOURCE-file errors here now fail the lane like any other).
        extends: true,
        test: {
          name: "types-node",
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: ["tests/**/*.test-d.ts"],
            exclude: TYPES_BROWSER,
            tsconfig: "tsconfig.json",
            // TS7 native checker (byte-identical diagnostics to tsc6, ~5x faster) — the CLI type lanes moved
            // off tsc6. ts-morph/typescript-eslint keep the TS6 API; this lane is CLI-only, so it's safe.
            checker: "node_modules/ts7/bin/tsc",
          },
        },
      },
      {
        // types-browser: exactly `TYPES_BROWSER` — the `.test-d.ts` files whose subject is a browser
        // package, checked under `tsconfig.tests-dom.json` (dom + node), the same program
        // `typecheck:tests-dom` runs standalone. Both this project and `types-node` share the DOM-less/
        // DOM-having split every other type program already draws; splitting the ONE vitest `types`
        // project the same way removes the last place a suppression flag hid a known-wrong program
        // (#1313) rather than recording a decision.
        extends: true,
        test: {
          name: "types-browser",
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: TYPES_BROWSER,
            tsconfig: "tsconfig.tests-dom.json",
            checker: "node_modules/ts7/bin/tsc",
          },
        },
      },
    ],
  },
});
