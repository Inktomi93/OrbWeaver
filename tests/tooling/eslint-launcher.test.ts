import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { expect, test } from "../support/tool-fixtures.ts";

const PRELOAD = `
const childProcess = require("node:child_process");
childProcess.spawnSync = () => {
  const outcome = process.env.ORB_ESLINT_TEST_OUTCOME;
  if (outcome === "spawn-error") return { status: null, signal: null, error: new Error("planted spawn failure") };
  if (outcome === "signal") return { status: null, signal: "SIGTERM" };
  return { status: Number(outcome), signal: null };
};
`;

function runLauncher(outcome: "0" | "1" | "2" | "signal" | "spawn-error", dedicatedBox?: string): { readonly status: number | null; readonly stderr: string } {
  const scratch = mkdtempSync(join(tmpdir(), "orb-eslint-launcher-"));
  const preload = join(scratch, "spawn.cjs");
  writeFileSync(preload, PRELOAD);
  const result = spawnSync(process.execPath, ["--require", preload, join(process.cwd(), "scripts/eslint.ts"), "--version"], {
    cwd: process.cwd(),
    env: inheritedProcessEnv(
      Object.fromEntries([["ORB_ESLINT_TEST_OUTCOME", outcome], ...(dedicatedBox === undefined ? [] : [["ORB_DEDICATED_BOX", dedicatedBox]])]),
    ),
    encoding: "utf8",
  });
  rmSync(scratch, { recursive: true, force: true });
  return { status: result.status, stderr: result.stderr };
}

test("eslint launcher preserves native exits and makes abnormal child outcomes loud tool errors", () => {
  expect(runLauncher("0").status).toBe(0);
  expect(runLauncher("1").status).toBe(1);
  expect(runLauncher("2").status).toBe(2);

  const signalled = runLauncher("signal");
  expect(signalled.status).toBe(2);
  expect(signalled.stderr).toContain("ESLint terminated by signal SIGTERM");

  const failed = runLauncher("spawn-error");
  expect(failed.status).toBe(2);
  expect(failed.stderr).toContain("failed to start ESLint: planted spawn failure");

  const refused = runLauncher("0", "true");
  expect(refused.status).toBe(2);
  expect(refused.stderr).toContain("launcher configuration refused the run");
  expect(refused.stderr).toContain('ORB_DEDICATED_BOX="true"');
});
