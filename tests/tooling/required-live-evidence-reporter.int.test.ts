// Actual-runner proof for #730: a required live front door cannot report green when Playwright collected
// tests but executed none. The fixture imports the real reporter configuration while removing the app stack.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { afterEach } from "vitest";
import { expect, test } from "../support/tool-fixtures.ts";

const scratches: string[] = [];

afterEach(() => {
  for (const scratch of scratches.splice(0)) {
    rmSync(scratch, { recursive: true, force: true });
  }
});

function runFixture(body: string): { readonly status: number | null; readonly output: string } {
  const root = process.cwd();
  const scratch = mkdtempSync(join(root, "reports/__g_required-live-"));
  scratches.push(scratch);
  writeFileSync(join(scratch, "evidence.spec.ts"), `import { test } from "@playwright/test";\n${body}\n`);
  const baseConfig = pathToFileURL(join(root, "playwright.config.ts")).href;
  writeFileSync(
    join(scratch, "playwright.config.ts"),
    `import { defineConfig } from "@playwright/test";\nimport base from ${JSON.stringify(baseConfig)};\n` +
      `export default defineConfig({ ...base, testDir: ${JSON.stringify(scratch)}, globalSetup: undefined, webServer: undefined, projects: [{ name: "evidence" }], reporter: base.reporter });\n`,
  );
  // biome-ignore lint/style/noProcessEnv: the child needs the ambient PATH plus the two reporter-front-door flags; this is runner-harness plumbing, not app config.
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  childEnv["E2E_LIVE"] = "1";
  childEnv["E2E_REQUIRE_EVIDENCE"] = "1";
  childEnv["NO_COLOR"] = "1";
  const result = spawnSync(join(root, "node_modules/.bin/playwright"), ["test", "-c", join(scratch, "playwright.config.ts")], {
    cwd: root,
    encoding: "utf8",
    env: childEnv,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test("required live evidence: an all-skipped runner result is INSTRUMENT ERROR and nonzero", () => {
  const result = runFixture('test("unavailable", () => { test.skip(true, "fixture backend unavailable"); });');
  expect(result.status).not.toBe(0);
  expect(result.output).toContain("INSTRUMENT ERROR");
});

test("required live evidence: one executed pass satisfies the population beside an honest skip", () => {
  const result = runFixture('test("evidence", () => {});\ntest("optional unavailable arm", () => { test.skip(true, "optional fixture unavailable"); });');
  expect(result.status).toBe(0);
  expect(result.output).not.toContain("INSTRUMENT ERROR");
});
