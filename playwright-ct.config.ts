import process from "node:process";
import { defineConfig, devices } from "@playwright/experimental-ct-react";

// Component tests — `.ct.tsx` at the tests/client mirror, in a real chromium via Playwright CT (the
// vitest browser project was never adopted — it hangs cold-cache; spine/testing.md §7). Client
// pure-logic stays node `.test.ts`. Separate runner, NOT in `pnpm check` (`pnpm test:ct`).
//
// SKELETON (Phase 0): `ctViteConfig` — the client's `#` subpath aliases (Vite needs them EXPLICIT for
// the in-browser bundle; unlike Node it doesn't read package.json `imports`) + react()/tailwind()
// plugins — lands with the @orb/client package (Phase 6). Until then this config parses + locates specs.

const CT_PORT = 3100;

export default defineConfig({
  testDir: "tests/client",
  testMatch: "**/*.ct.tsx",
  outputDir: "reports/ct-results",
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [["html", { outputFolder: "reports/ct-report", open: "never" }]],
  use: {
    trace: "on-first-retry",
    // Parameterized so parallel CI port-shards don't collide on the CT dev server.
    ctPort: Number(process.env.CT_PORT ?? CT_PORT),
    // ctViteConfig: { resolve.alias for #kit/#contracts/#client, dedupe react, plugins: [react(),
    //   tailwindcss()] } — Phase 6, when the client package + its Vite resolution exist.
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
