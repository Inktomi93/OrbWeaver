import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { adoptRunSlot } from "@orb/tooling/_shared/artifact-out";
import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { CT_CACHE_DIR_ENV, CT_RUN_RACING_ENV, CT_RUN_SLOT_ENV } from "@orb/tooling/_shared/ct-run-slot";
import { budget } from "@orb/tooling/_shared/load-budget";
import { CT_VITE_PORT } from "@orb/tooling/_shared/ports";
import { currentRunLease, inheritedRunMarker, runLeaseArg, runMarkerArg } from "@orb/tooling/_shared/run-marker";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import type { PlaywrightTestConfig } from "@playwright/experimental-ct-react";
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import tailwindcss from "@tailwindcss/vite";

// Component tests — `.ct.tsx` at the tests/{ui,client} mirrors, in a real chromium via Playwright CT
// (the vitest browser project was never adopted — it hangs cold-cache; core/Spine-Testing.md §7).
// Client/ui pure-logic stays node `.test.ts`. Separate RUNNER, but the same lane: `pnpm test` composes
// `pnpm test:ct --retries=2` after the vitest projects (merged 2026-07-17 — the split existed only for the
// old single-thread constraint). Still NOT in `pnpm check` (browser suites never gate the static tier).
//
// The harness page imports the client's REAL production stylesheet front door — shell.css, then
// @orb/ui/styles/globals.css (tailwind v4 + the GENERATED @theme), then client globals — so token
// utilities AND the client styles tier resolve in-browser exactly as in the client build. The pre-plugin
// below appends only the tests/ source root to that production Tailwind root; playwright/index.css owns no
// product import/source. Moving a product import changes one shared cascade contract (#114/#959).
// `#` subpath imports resolve via package.json `imports` (vite ≥6 reads them); cross-package
// imports resolve through the workspace — no aliases needed.

// THE CT WALL CLOCKS, LOAD-SCALED (#1232, docs/design/1208-instrument-substrate.md section 7.1). All three
// were Playwright DEFAULTS this config pinned NOWHERE — which is how "at loadavg 170 the CT default times
// out every test at `mount()` on pure contention, ZERO signal, indistinguishable from a real red"
// (.claude/rules/browser-tests.md) became a standing fact instead of a fixed defect. The literals
// are the QUIET-BOX bases (Playwright's own numbers), so a quiet run is byte-identical to before; a
// contended one stretches by the box's per-core contention through the ONE policy, capped at
// ORB_BUDGET_CEILING_MS so a genuinely wedged mount still surfaces. Read ONCE at config load.
// The box profile in force (tooling/concurrency-profile.json — the ONE home for every worker cap in the
// fleet, #1835). Read ONCE at config load, like the wall-clock bases below.
const CONCURRENCY = readConcurrencyProfile();
/** The run this CT invocation belongs to, if its launcher named one — read ONCE, like the caps above. */
const CT_RUN_MARKER = inheritedRunMarker();
/** …and the LEASE its launcher minted for this one invocation (#2504), which is what `release()` sweeps. */
const CT_RUN_LEASE = currentRunLease();
/** Every identity the launcher named, as chromium switches. Empty ⇒ no `launchOptions` at all, which is a
 *  bare `npx playwright test` and gets exactly the stock behaviour. */
const CT_IDENTITY_ARGS = [...(CT_RUN_MARKER === null ? [] : [runMarkerArg(CT_RUN_MARKER)]), ...(CT_RUN_LEASE === null ? [] : [runLeaseArg(CT_RUN_LEASE)])];

const BASE_TEST_TIMEOUT_MS = 30_000;
const BASE_EXPECT_TIMEOUT_MS = 5000;
const BASE_ACTION_TIMEOUT_MS = 15_000;
const CT_ESBUILD_TARGET = "es2024";
const CLIENT_PACKAGE_ROOT = path.resolve(import.meta.dirname, "packages/client");
const CT_TEST_MATCH = TEST_KIND_DEFINITIONS.filter(({ family }) => family === "component").map(({ suffix }) => `**/*${suffix}`);
// SPELLED WHOLE, DELIBERATELY (#2183). `playwright-css-topology` proves that the source-extension transform
// targets CLIENT GLOBALS by finding that exact repo-relative path in this file's text — it has no compiler
// program for a root config and cannot evaluate `path.resolve`. Composed from `CLIENT_PACKAGE_ROOT` the path
// appeared here in two halves and the gate's fourth clause fired against a config that was CORRECT: a live
// `hard` red on `main`, invisible under the standing whole-tree red because the legacy fence fused its four
// clauses into one sentence (found 2026-09-13 by the conversion that split them; the same class as #2106).
// `path.resolve` folds this identically to the composed form.
const CLIENT_GLOBALS_CSS = path.resolve(import.meta.dirname, "packages/client/src/styles/globals.css");
const CT_CSS_EXTENSION = path.resolve(import.meta.dirname, "playwright/index.css");
type CtViteConfig = Exclude<NonNullable<NonNullable<PlaywrightTestConfig["use"]>["ctViteConfig"]>, () => Promise<unknown>>;
type CtVitePlugin = Extract<Awaited<NonNullable<CtViteConfig["plugins"]>[number]>, { readonly name?: string }>;
type CtRollupOptions = NonNullable<NonNullable<CtViteConfig["build"]>["rollupOptions"]>;
type CtTransformHook = Extract<NonNullable<CtVitePlugin["transform"]>, (...args: never[]) => unknown>;
type CtOnWarn = Extract<NonNullable<CtRollupOptions["onwarn"]>, (...args: never[]) => unknown>;

const CT_CSS_TRANSFORM: CtTransformHook = async function (this: ThisParameterType<CtTransformHook>, ...[code, id]: Parameters<CtTransformHook>) {
  if (path.resolve(id.split("?", 1)[0] ?? id) !== CLIENT_GLOBALS_CSS) {
    return;
  }
  this.addWatchFile(CT_CSS_EXTENSION);
  return `${code}\n${await readFile(CT_CSS_EXTENSION, "utf8")}`;
};

const CT_CSS_SOURCE_PLUGIN: CtVitePlugin = {
  name: "orb:ct-css-source-extension",
  enforce: "pre",
  transform: CT_CSS_TRANSFORM,
};

const CT_ROLLUP_ONWARN: CtOnWarn = (...[warning, defaultHandler]: Parameters<CtOnWarn>): void => {
  if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
    return;
  }
  if (warning.message.includes("dynamic import will not move module into another chunk")) {
    return;
  }
  if (warning.code === "SOURCEMAP_ERROR" && warning.id?.includes("/node_modules/") === true) {
    return;
  }
  defaultHandler(warning);
};

// The one-per-invocation launcher opens the slot. Config evaluation is deliberately adoption-only:
// Playwright can load this file in several processes, so minting here creates orphan sibling slots.
const ctSlotDir = process.env[CT_RUN_SLOT_ENV];
const ctSlot =
  ctSlotDir === undefined
    ? null
    : {
        ...adoptRunSlot(process.cwd(), "ct", ctSlotDir),
        racing: (process.env[CT_RUN_RACING_ENV] ?? "").split("\n").filter((label) => label.length > 0),
      };

export default defineConfig({
  testDir: "tests",
  testMatch: CT_TEST_MATCH,
  outputDir: "reports/ct-results",
  fullyParallel: true,
  // WORKERS ARE PINNED, and the value IS the load-safety rule — not a tuning preference (#766).
  // Playwright's DEFAULT is CPU/2 = 12 workers on this 24-core box, each one a Chromium. The safe value
  // used to live ONLY as a hand-typed `--workers=2` in a lane rule file, so one
  // forgotten flag reproduced the very failure that fact documents: at high load the CT default times out
  // every test at `mount()` on pure contention — ZERO signal, indistinguishable from a real red — while
  // the capped run came back green in 53s. `pnpm test` composes `pnpm test:ct --retries=2` with no worker
  // flag, so the uncapped default reached `pnpm verify --push` too. Same defect class as the Stryker
  // `concurrency` default fixed in 387ff771e: the shipped value was not the one the operating discipline
  // assumed.
  // TRUTH REPAIR (#1835, 2026-09-06): the paragraph above ended "4 rather than 2 because the box is
  // otherwise quiet at the gate" — and the box is NOT otherwise quiet. Six lanes across two accounts run
  // concurrently, node_load1 peaked at 105.8, and the standing facts still told every lane to hand-type
  // `--workers=2`, which is that same defect one more time. The number now comes from the ONE profile
  // (tooling/concurrency-profile.json): 2 on a SHARED host, 4 under `ORB_DEDICATED_BOX=1` — where "the box
  // is otherwise quiet" is TRUE by construction rather than by hope. A CLI `--workers=N` still overrides.
  // The co-hosted homelab shares this machine — a 2026-08-21 uncapped run drove load-avg to 103 and
  // errored Authentik for the owner.
  workers: CONCURRENCY.ctWorkers,
  timeout: budget(BASE_TEST_TIMEOUT_MS),
  expect: { timeout: budget(BASE_EXPECT_TIMEOUT_MS) },
  forbidOnly: process.env["CI"] !== undefined,
  // retries:0 is the DEFAULT (ad-hoc `pnpm test:ct` / scoped verify runs show a real flake raw while
  // debugging). The GATE lane retries instead of blocking — the drawer/chart/lightbox focus/ResizeObserver
  // parallelism artifacts that only surface after 500+ tests in one page context — but the gate context is
  // a VISIBLE CLI flag in the `pnpm test` composition (`pnpm test:ct --retries=2`), not an env var this
  // config decodes (the CT_GATE env retired 2026-07-17 with the lefthook-step era that needed it).
  // `trace: on-first-retry` (below) still captures a failing retried run.
  retries: 0,
  // The flake announcer (tooling/src/verify/ops/ct-flaky-reporter.ts): the gate runs with `--retries=2`, so a
  // failed-then-passed test scores green and hides. This reporter surfaces every retry-masked pass — a loud
  // end-of-run block + reports/ct-flaky.json. DEFAULT = WARN (suite stays green on transient infra);
  // `CT_NO_FLAKES=1` (this config owns env-decode) flips it STRICT → nonzero exit on any retried test, for
  // the orchestrator's flake-hunt passes.
  reporter: [
    // json = machine-readable results — extracting the 2 failing names from a 1211-test run without it
    // cost two full re-runs (2026-07-24); the custom flake announcer stays the human-facing summary.
    ["json", { outputFile: "reports/ct-report.json" }],
    ["html", { outputFolder: "reports/ct-report", open: "never" }],
    [
      "./tooling/src/verify/ops/ct-flaky-reporter.ts",
      { strict: process.env["CT_NO_FLAKES"] === "1", ...(ctSlot === null ? {} : { slotDir: ctSlot.dir, racing: ctSlot.racing }) },
    ],
  ],
  use: {
    // trace stays on-first-retry for CTs (NOT retain-on-failure): always-on trace RECORDING (retention is
    // the only conditional part) instruments network enough to change component behavior — repro:
    // message-content.ct "external image LOADS" renders its media slot only while a dead-domain request
    // PENDS; under tracing the error fires first and the test reds (2026-07-24 bisect). Failure
    // diagnosis for CTs rides the screenshot + a fast re-run; e2e (no such pattern, serial, slow to
    // re-run) keeps retain-on-failure in its own config.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: budget(BASE_ACTION_TIMEOUT_MS),
    // Determinism: component date/locale rendering must not depend on the host machine (bisect-cleared
    // of the trace interaction above).
    timezoneId: "UTC",
    locale: "en-US",

    // EVERY CT BROWSER CARRIES THE RUN MARKER (#1848). This is where the 72 orphaned `chrome-headless-shell`
    // processes came from: playwright starts each browser in its OWN session, so a killed CT run's process
    // group kill never reaches them. The launcher (`cli.ts scoped-test ct`) exports the marker into this
    // config's environment; the ARG channel is what a chromium actually keeps (it wipes its own environ —
    // `_shared/run-marker.ts` RUN_MARKER_ARG_PREFIX), and the runner's sweeps read it back from
    // `/proc/<pid>/cmdline`. No marker (a bare `npx playwright test`) ⇒ no arg, exactly as before.
    // THE LEASE RIDES BESIDE IT (#2504) — the marker says which RUN may kill this browser, the lease says
    // which INVOCATION started it, and `release()` sweeps only the second. One switch could not say both.
    ...(CT_IDENTITY_ARGS.length === 0 ? {} : { launchOptions: { args: CT_IDENTITY_ARGS } }),
    // Parameterized so parallel CI port-shards don't collide on the CT dev server.
    ctPort: Number(process.env["CT_PORT"] ?? CT_VITE_PORT),
    // THE BUILD CACHE IS PER INVOCATION when the launcher says so (#1581). playwright-ct resolves this
    // against the config dir and otherwise defaults to `playwright/.cache` — ONE directory per worktree,
    // which is what two concurrent `test:ct` runners were clearing and rebuilding under each other
    // (measured: 201/2 with two reds in a file the run never touched, then 203/203 for the same set alone).
    // `cli.ts scoped-test ct` mints `.cache/ct/build-<pid>-<ms>` and removes it on exit; a bare
    // `npx playwright test -c playwright-ct.config.ts` with no env still gets the stock default.
    ...(process.env[CT_CACHE_DIR_ENV] === undefined ? {} : { ctCacheDir: process.env[CT_CACHE_DIR_ENV] }),
    ctViteConfig: {
      // CT applies its OWN @vitejs/plugin-react internally — adding a second one double-transforms.
      // Cast: @tailwindcss/vite resolves vite@8 types; CT viteConfig expects vite@6 — structurally compatible.
      plugins: [CT_CSS_SOURCE_PLUGIN, tailwindcss() as never],
      // The client's static assets, served at the same absolute paths the stylesheets author. Without
      // this the CT harness resolves `/grain.svg` (client globals.css's film-grain tile) to a 404, so the
      // grain overlay computes exactly as production while painting NOTHING — a computed-style assertion
      // stays green and a framebuffer one can never see the film (#435 hit this: the pixel receipt read
      // zero noise on both arms). Vite's default publicDir is `<root>/public`, and CT's root is its own
      // generated cache dir, so the default is always empty here — and for the same reason the path must
      // be ABSOLUTE (vite resolves a relative publicDir against that cache root, not against this file).
      publicDir: path.resolve(CLIENT_PACKAGE_ROOT, "public"),
      // The esbuild pinned for the CT vite transform (vite@6 → esbuild 0.25.12) maxes at target es2024.
      // vite:esbuild reads tsconfig.base's `target: "es2025"` and passes it as
      // `tsconfigRaw.compilerOptions.target` to esbuild.transform PER FILE — SEPARATE from the `esbuild`
      // output-target option — so es2025 reaches esbuild regardless of `esbuild.target` and throws
      // `Unrecognized target environment "es2025"` (~1300/build across a spread). The override is the
      // tsconfigRaw one: vite spreads OUR compilerOptions over the loaded ones (vite dep-*.js
      // transformWithEsbuild), so this pins ONLY target — jsx/verbatimModuleSyntax/etc. still flow from
      // tsconfig. es2024 transform output runs identically in the CT chromium (CT needs a WORKING
      // transform, not es2025 semantics). `esbuild.target` + optimizeDeps.esbuildOptions.target belt the
      // output/prebundle paths too. The client PRODUCTION build lowers es2025 via OXC/Rolldown
      // (packages/client/vite.config.ts — a different, es2025-capable path, untouched here). (Masked by a
      // stale-node_modules esbuild@0.28.1 until a clean install re-resolved to 0.25.12 — 67d7805d0's
      // "green without the override" was a false green; a dep-override removal owes a CLEAN-INSTALL CT run.)
      esbuild: { target: CT_ESBUILD_TARGET, tsconfigRaw: { compilerOptions: { target: CT_ESBUILD_TARGET } } },
      optimizeDeps: { esbuildOptions: { target: CT_ESBUILD_TARGET } },
      resolve: { dedupe: ["react", "react-dom"] },
      // MODULE WORKERS (plugin-ui-plane #679 U4). vite's default `worker.format` is `iife`, and an iife worker
      // bundle CANNOT CODE-SPLIT — the Tier-C plugin guest's QuickJS variant dynamically imports its own FFI
      // module, so the CT build failed outright: "Invalid value 'iife' for option 'worker.format' — UMD and
      // IIFE output formats are not supported for code-splitting builds". `es` is also what the runtime already
      // requires: the worker is constructed `{ type: "module" }`, which every browser this app supports
      // understands. The app's own build (vite 8 / rolldown) defaults differently and never hit this; the CT
      // harness pins vite 6, so the format has to be said out loud HERE or a Tier-C CT can never build.
      worker: { format: "es" },
      build: {
        rollupOptions: {
          // Silence the advisory floods that drown the CT build output (~dozens of lines each): react-query's
          // "use client" module-level directives (meaningless in a CT bundle), the playwright/index.tsx
          // dynamic-vs-static chunk advisories (the harness dynamically imports what fixtures statically
          // import — inherent to CT), and prebuilt-dep sourcemap-trace failures (see the SOURCEMAP_ERROR arm).
          // Prebuilt dependency sourcemap failures and inherent CT bundle advisories are intentionally
          // filtered; authored sourcemap failures still reach Rollup's public default handler.
          onwarn: CT_ROLLUP_ONWARN,
        },
      },
    } satisfies CtViteConfig,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
