import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { CtCorpusOptions } from "@orb/testkit/node/ct-corpus.ts";
import {
  SELECT_BUILD_DIAGNOSTIC_ENV,
  SELECT_BUILD_DIAGNOSTIC_FILE,
  SELECT_BUILD_REGISTRY_FILE,
  SELECT_CPU_DIAGNOSTIC_ENV,
  SELECT_CPU_PROFILING_ENV,
  SELECT_NATIVE_TRACE_ENV,
} from "@orb/testkit/node/select-native-sources.ts";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { CT_VITE_PORT } from "@orb/tooling/floor/host/ports";
import { exportProcessEnv } from "@orb/tooling/floor/process/process-env";
import { currentRunLease, inheritedRunMarker, runLeaseArg, runMarkerArg } from "@orb/tooling/floor/process/run-marker";
import { CT_CACHE_DIR_ENV } from "@orb/tooling/floor/testing/ct-cache";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/floor/testing/test-kinds";
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import tailwindcss from "@tailwindcss/vite";
import type { InlineConfig as CtViteConfig, Plugin as CtVitePlugin } from "vite-ct";

// Native Playwright component tests mount real product providers and styles in Chromium.
// Node tests run separately through `pnpm test`.
//
// The harness page imports the client's REAL production stylesheet front door — shell.css, then
// @orb/ui/styles/globals.css (tailwind v4 + the GENERATED @theme), then client globals — so token
// utilities AND the client styles tier resolve in-browser exactly as in the client build. The pre-plugin
// below appends only the tests/ source root to that production Tailwind root; playwright/index.css owns no
// product import/source. Moving a product import changes one shared cascade contract (#114/#959).
// `#` subpath imports resolve via package.json `imports` (vite ≥6 reads them); cross-package
// imports resolve through the workspace — no aliases needed.

// THE CT WALL CLOCKS, LOAD-SCALED (#1232 section 7.1). All three
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
// Component suffixes share the maintained test-kind vocabulary.
const CT_TEST_MATCH = TEST_KIND_DEFINITIONS.filter(({ family }) => family === "component").map(({ suffix }) => `**/*${suffix}`);
// SPELLED WHOLE, DELIBERATELY. `tests/tooling/playwright-ct-css-front-door.test.ts` proves that the
// source-extension transform targets CLIENT GLOBALS by finding that exact repo-relative path in this file's
// code tokens; it cannot evaluate `path.resolve`. `path.resolve` folds this identically to a composed form.
const CLIENT_GLOBALS_CSS = path.resolve(import.meta.dirname, "packages/client/src/styles/globals.css");
const CT_CSS_EXTENSION = path.resolve(import.meta.dirname, "playwright/index.css");
type CtRollupOptions = NonNullable<NonNullable<CtViteConfig["build"]>["rollupOptions"]>;
type CtTransformHook = Extract<NonNullable<CtVitePlugin["transform"]>, (...args: never[]) => unknown>;
type CtOnWarn = Extract<NonNullable<CtRollupOptions["onwarn"]>, (...args: never[]) => unknown>;
type CtConfigResolvedHook = Extract<NonNullable<CtVitePlugin["configResolved"]>, (...args: never[]) => void>;
type CtWriteBundleHook = Extract<NonNullable<CtVitePlugin["writeBundle"]>, (...args: never[]) => void>;

const SELECT_BUILD_DIAGNOSTIC_MODES = ["baseline", "esbuild"] as const;

function selectBuildDiagnosticPlugins(): CtVitePlugin[] {
  const requested = process.env[SELECT_BUILD_DIAGNOSTIC_ENV];
  if (requested === undefined) {
    return [];
  }
  const mode = SELECT_BUILD_DIAGNOSTIC_MODES.find((candidate) => candidate === requested);
  if (
    mode === undefined ||
    process.env[SELECT_CPU_DIAGNOSTIC_ENV] !== "1" ||
    process.env[SELECT_CPU_PROFILING_ENV] !== "0" ||
    process.env[SELECT_NATIVE_TRACE_ENV] !== "0"
  ) {
    throw new Error("Select build diagnostics require baseline/esbuild mode and diagnostic-only capture with CPU profiling and native qualification disabled");
  }
  let resolved: Parameters<CtConfigResolvedHook>[0] | null = null;
  return [
    {
      name: "orb:select-build-diagnostic",
      apply: "build",
      enforce: "post",
      // Playwright merges its forced build settings before Vite invokes user config hooks.
      config: () => ({ build: { minify: mode === "esbuild" ? "esbuild" : false, cssMinify: false } }),
      configResolved(config: Parameters<CtConfigResolvedHook>[0]): void {
        if (
          config.build.minify !== (mode === "esbuild" ? "esbuild" : false) ||
          config.build.cssMinify !== false ||
          config.build.rollupOptions.treeshake !== false ||
          config.build.target !== "esnext" ||
          config.build.sourcemap !== true ||
          !config.isProduction
        ) {
          throw new Error("Select build diagnostic settings differ from the approved representation comparison");
        }
        resolved = config;
      },
      async writeBundle(...[_options, bundle]: Parameters<CtWriteBundleHook>): Promise<void> {
        if (resolved === null) {
          throw new Error("Select build diagnostic has no resolved configuration");
        }
        const config = resolved;
        const emitted = await Promise.all(
          Object.values(bundle)
            .filter((entry) => entry.type === "chunk" || entry.fileName.endsWith(".css"))
            .map(async (entry) => {
              const bytes = await readFile(path.join(config.build.outDir, entry.fileName));
              return {
                fileName: entry.fileName,
                bytes: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex"),
                ...(entry.type === "chunk"
                  ? { imports: entry.imports, dynamicImports: entry.dynamicImports, exports: entry.exports, modules: Object.keys(entry.modules) }
                  : { cssBase64: bytes.toString("base64") }),
              };
            }),
        );
        await writeFile(
          path.join(config.build.outDir, SELECT_BUILD_DIAGNOSTIC_FILE),
          JSON.stringify({
            diagnosticOnly: true,
            qualification: false,
            mode,
            resolved: {
              minify: config.build.minify,
              cssMinify: config.build.cssMinify,
              rollupTreeshake: config.build.rollupOptions.treeshake,
              target: config.build.target,
              sourcemap: config.build.sourcemap,
              mode: config.mode,
              isProduction: config.isProduction,
              esbuild: config.esbuild,
              workerFormat: config.worker.format,
              dedupe: config.resolve.dedupe,
              plugins: config.plugins.map(({ name }) => name),
            },
            // Vite's stock esbuild renderChunk enables local tree shaking even when Rollup's is off.
            esbuildChunkTreeShaking: config.build.minify === "esbuild",
            registryFile: SELECT_BUILD_REGISTRY_FILE,
            emitted,
          }),
        );
      },
    },
  ];
}

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

// Zod's prose mentions the annotation spelling; these are not misplaced call annotations. Keep the
// exact comment and module paired so new dependency warnings and authored annotations remain visible.
const CT_ZOD_PROSE_ANNOTATIONS = [
  [
    "/node_modules/zod/v4/core/util.js",
    "// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.",
  ],
  [
    "/node_modules/zod/v4/core/regexes.js",
    "/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */",
  ],
] as const;

const CT_ROLLUP_ONWARN: CtOnWarn = (...[warning, defaultHandler]: Parameters<CtOnWarn>): void => {
  if (
    warning.code === "INVALID_ANNOTATION" &&
    CT_ZOD_PROSE_ANNOTATIONS.some(([moduleId, comment]) => warning.id?.endsWith(moduleId) === true && warning.message.includes(`"${comment}"`))
  ) {
    return;
  }
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

const cacheOverride = process.env[CT_CACHE_DIR_ENV];
const cacheDir = path.resolve(import.meta.dirname, cacheOverride === undefined || cacheOverride.length === 0 ? "playwright/.cache" : cacheOverride);
// Native CT builds and Node-side media servers must serve the same frontend directory.
exportProcessEnv(CT_CACHE_DIR_ENV, cacheDir);
export default defineConfig<CtCorpusOptions>({
  testDir: "tests",
  // The native Node server graph uses erasable TypeScript that Playwright's Babel class transform rejects.
  build: { external: ["**/packages/server/src/**"] },
  // docs/work/0062 — the working-tree guard: captures `git status` + a content hash of every dirty path
  // before the first component mounts, and its returned teardown reds the run (naming the path) if a CT
  // wrote into the real checkout instead of its own harness/temp state.
  globalSetup: "./tooling/src/floor/testing/working-tree-guard.ts",
  testMatch: CT_TEST_MATCH,
  outputDir: "reports/ct-results",
  fullyParallel: true,
  // Shared-host caps prevent native Playwright from starting one browser per pair of CPUs.
  workers: CONCURRENCY.ctWorkers,
  timeout: budget(BASE_TEST_TIMEOUT_MS),
  expect: { timeout: budget(BASE_EXPECT_TIMEOUT_MS) },
  forbidOnly: process.env["CI"] !== undefined,
  // Keep failures visible locally; CI can explicitly request retries.
  retries: 0,
  reporter: [
    ...(process.env["GITHUB_ACTIONS"] ? [["github"] as const] : []),
    ["json", { outputFile: "reports/ct-report.json" }],
    ["html", { outputFolder: "reports/ct-report", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    corpusDirectory: process.env["CT_CORPUS_FIXTURE"],
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

    // Preserve optional caller ownership on browser processes, which run in their own sessions.
    ...(CT_IDENTITY_ARGS.length === 0 ? {} : { launchOptions: { args: CT_IDENTITY_ARGS } }),
    // Parameterized so parallel CI port-shards don't collide on the CT dev server.
    ctPort: Number(process.env["CT_PORT"] ?? CT_VITE_PORT),
    ctCacheDir: cacheDir,
    ctViteConfig: {
      // CT applies its OWN @vitejs/plugin-react internally — adding a second one double-transforms.
      // Cast: @tailwindcss/vite resolves vite@8 types; CT viteConfig expects vite@6 — structurally compatible.
      plugins: [CT_CSS_SOURCE_PLUGIN, tailwindcss() as never, ...selectBuildDiagnosticPlugins()],
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
      // stale-node_modules esbuild@0.28.1 until a clean install re-resolved to 0.25.12 — 741002bb36's
      // "green without the override" was a false green; a dep-override removal owes a CLEAN-INSTALL CT run.)
      esbuild: { target: CT_ESBUILD_TARGET, tsconfigRaw: { compilerOptions: { target: CT_ESBUILD_TARGET } } },
      optimizeDeps: { esbuildOptions: { target: CT_ESBUILD_TARGET } },
      resolve: { dedupe: ["react", "react-dom"] },
      // MODULE WORKERS. vite's default `worker.format` is `iife`, and an iife worker
      // bundle CANNOT CODE-SPLIT — the Tier-C plugin guest's QuickJS variant dynamically imports its own FFI
      // module, so the CT build failed outright: "Invalid value 'iife' for option 'worker.format' — UMD and
      // IIFE output formats are not supported for code-splitting builds". `es` is also what the runtime already
      // requires: the worker is constructed `{ type: "module" }`, which every browser this app supports
      // understands. The app's own build (vite 8 / rolldown) defaults differently and never hit this; the CT
      // harness pins vite 6, so the format has to be said out loud HERE or a Tier-C CT can never build.
      worker: { format: "es" },
      build: {
        // Keep the native build cache reusable, including explicit directories outside the template root.
        emptyOutDir: false,
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
  projects: [
    { name: "chromium", testIgnore: ["**/tests/tooling/**"] },
    { name: "tooling", testDir: "tests/tooling" },
  ],
});
