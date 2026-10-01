import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { expect, test } from "../support/tool-fixtures.ts";

function runLauncher(
  args: readonly string[],
  dedicatedBox?: string,
  cwd = process.cwd(),
): { readonly status: number | null; readonly stderr: string; readonly stdout: string } {
  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/eslint.ts"), ...args], {
    cwd,
    env: inheritedProcessEnv(Object.fromEntries(dedicatedBox === undefined ? [] : [["ORB_DEDICATED_BOX", dedicatedBox]])),
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

test("ESLint argument-file transport carries an over-limit population into the unchanged native CLI", ({ scratch }) => {
  const source = join(scratch, "source with spaces.js");
  const config = join(scratch, "eslint.config.mjs");
  const payload = join(scratch, "arguments.json");
  writeFileSync(source, "debugger;\n");
  writeFileSync(config, 'export default [{ rules: { "no-debugger": "error" } }];\n');
  const files = Array.from({ length: 1500 }, () => source);
  const args = ["--no-config-lookup", "--config", config, "--concurrency", "off", ...files];
  expect(JSON.stringify(args).length).toBeGreaterThan(32_767);
  writeFileSync(payload, JSON.stringify(args));
  const violation = runLauncher(["--args-file", payload], undefined, scratch);
  expect(violation.status).toBe(1);
  expect(violation.stdout).toContain("no-debugger");
  writeFileSync(source, "const answer = 42;\n");
  expect(runLauncher(["--args-file", payload], undefined, scratch).status).toBe(0);
  expect(runLauncher(["--this-option-does-not-exist"]).status).toBe(2);
});

test("ESLint refuses malformed argument transport and invalid launcher configuration", ({ scratch }) => {
  const payload = join(scratch, "arguments.json");
  writeFileSync(payload, "[]");
  expect(runLauncher(["--args-file", payload]).status).toBe(2);
  writeFileSync(payload, "{ malformed");
  const malformed = runLauncher(["--args-file", payload], undefined, scratch);
  expect(malformed.status).toBe(2);
  expect(malformed.stderr).toContain("launcher configuration refused the run");
  expect(runLauncher(["--args-file", payload, "extra"]).status).toBe(2);
  const refused = runLauncher(["--version"], "true");
  expect(refused.status).toBe(2);
  expect(refused.stderr).toContain('ORB_DEDICATED_BOX="true"');
});
