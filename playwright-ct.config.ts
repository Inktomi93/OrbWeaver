import process from "node:process";
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import tailwindcss from "@tailwindcss/vite";

// Component tests — `.ct.tsx` at the tests/{ui,client} mirrors, in a real chromium via Playwright CT
// (the vitest browser project was never adopted — it hangs cold-cache; core/Spine-Testing.md §7).
// Client/ui pure-logic stays node `.test.ts`. Separate runner, NOT in `pnpm check` (`pnpm test:ct`).
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
  // `CT_GATE=1` (set by the lefthook pre-push CT step) enables retries so parallelism flakes — the
  // drawer/chart/lightbox focus/ResizeObserver timing artifacts that only surface after 500+ tests in
  // one page context — don't block the gate. Ad-hoc `pnpm test:ct` keeps retries:0 so a real flake stays
  // visible while debugging; `trace: on-first-retry` (below) then captures the failing gate run.
  retries: process.env.CT_GATE !== undefined ? 2 : 0,
  reporter: [["html", { outputFolder: "reports/ct-report", open: "never" }]],
  use: {
    trace: "on-first-retry",
    // Parameterized so parallel CI port-shards don't collide on the CT dev server.
    ctPort: Number(process.env.CT_PORT ?? CT_PORT),
    ctViteConfig: {
      // CT applies its OWN @vitejs/plugin-react internally — adding a second one double-transforms.
      plugins: [tailwindcss()],
      resolve: { dedupe: ["react", "react-dom"] },
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
