import process from "node:process";
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import tailwindcss from "@tailwindcss/vite";

// Component tests — `.ct.tsx` at the tests/{ui,client} mirrors, in a real chromium via Playwright CT
// (the vitest browser project was never adopted — it hangs cold-cache; core/Spine-Testing.md §7).
// Client/ui pure-logic stays node `.test.ts`. Separate RUNNER, but the same lane: `pnpm test` composes
// `pnpm test:ct --retries=2` after the vitest projects (merged 2026-07-17 — the split existed only for the
// old single-thread constraint). Still NOT in `pnpm check` (browser suites never gate the static tier).
//
// The harness page (playwright/index.{html,tsx}) imports @orb/ui/styles/globals.css — tailwind v4 +
// the GENERATED @theme — so token utilities resolve in-browser exactly as in the client build.
// `#` subpath imports resolve via package.json `imports` (vite ≥6 reads them); cross-package
// imports resolve through the workspace — no aliases needed.

const CT_PORT = 3100;

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.ct.tsx",
  outputDir: "reports/ct-results",
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  // retries:0 is the DEFAULT (ad-hoc `pnpm test:ct` / scoped verify runs show a real flake raw while
  // debugging). The GATE lane retries instead of blocking — the drawer/chart/lightbox focus/ResizeObserver
  // parallelism artifacts that only surface after 500+ tests in one page context — but the gate context is
  // a VISIBLE CLI flag in the `pnpm test` composition (`pnpm test:ct --retries=2`), not an env var this
  // config decodes (the CT_GATE env retired 2026-07-17 with the lefthook-step era that needed it).
  // `trace: on-first-retry` (below) still captures a failing retried run.
  retries: 0,
  // The flake announcer (scripts/verify/ct-flaky-reporter.ts): the gate runs with `--retries=2`, so a
  // failed-then-passed test scores green and hides. This reporter surfaces every retry-masked pass — a loud
  // end-of-run block + reports/ct-flaky.json. DEFAULT = WARN (suite stays green on transient infra);
  // `CT_NO_FLAKES=1` (this config owns env-decode) flips it STRICT → nonzero exit on any retried test, for
  // the orchestrator's flake-hunt passes.
  reporter: [
    // json = machine-readable results — extracting the 2 failing names from a 1211-test run without it
    // cost two full re-runs (2026-07-24); the custom flake announcer stays the human-facing summary.
    ["json", { outputFile: "reports/ct-report.json" }],
    ["html", { outputFolder: "reports/ct-report", open: "never" }],
    ["./scripts/verify/ct-flaky-reporter.ts", { strict: process.env.CT_NO_FLAKES === "1" }],
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
    // Determinism: component date/locale rendering must not depend on the host machine (bisect-cleared
    // of the trace interaction above).
    timezoneId: "UTC",
    locale: "en-US",

    // Parameterized so parallel CI port-shards don't collide on the CT dev server.
    ctPort: Number(process.env.CT_PORT ?? CT_PORT),
    ctViteConfig: {
      // CT applies its OWN @vitejs/plugin-react internally — adding a second one double-transforms.
      // Cast: @tailwindcss/vite resolves vite@8 types; CT viteConfig expects vite@6 — structurally compatible.
      plugins: [tailwindcss() as never],
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
      esbuild: { target: "es2024", tsconfigRaw: { compilerOptions: { target: "es2024" } } },
      optimizeDeps: { esbuildOptions: { target: "es2024" } },
      resolve: { dedupe: ["react", "react-dom"] },
      build: {
        rollupOptions: {
          // Silence the advisory floods that drown the CT build output (~dozens of lines each): react-query's
          // "use client" module-level directives (meaningless in a CT bundle), the playwright/index.tsx
          // dynamic-vs-static chunk advisories (the harness dynamically imports what fixtures statically
          // import — inherent to CT), and prebuilt-dep sourcemap-trace failures (see the SOURCEMAP_ERROR arm).
          onwarn(warning, defaultHandler): void {
            if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
              return;
            }
            if (warning.message.includes("dynamic import will not move module into another chunk")) {
              return;
            }
            // Prebuilt deps (@base-ui/react, @tanstack/*) ship .mjs whose bundled sourcemaps rollup can't
            // trace back to source when it wants to REPORT another advisory — SOURCEMAP_ERROR "Can't resolve
            // original location of error" (~dozens/build, 2026-07-20). Benign (their code, their maps, not a
            // real defect) and it once buried the real cause of a transient CT exit-1. Scoped to node_modules
            // ids ONLY — our own SOURCEMAP_ERROR (a genuinely broken map we authored) still surfaces.
            if (warning.code === "SOURCEMAP_ERROR" && warning.id?.includes("/node_modules/") === true) {
              return;
            }
            defaultHandler(warning);
          },
        },
      },
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
