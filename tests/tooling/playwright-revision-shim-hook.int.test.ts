// The remote-session Playwright revision shim (.claude/hooks/playwright-revision-shim.mjs), driven across the
// real process boundary over a planted browsers root whose only Chromium is an older revision in an older layout.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const HOOK = fileURLToPath(new URL("../../.claude/hooks/playwright-revision-shim.mjs", import.meta.url));
const CASE_BUDGET_MS = scaledBudget(60_000);
const OLD_SHELL = join("chromium_headless_shell-1194", "chrome-linux", "headless_shell");
const PINNED_SHELL = join("chromium_headless_shell-1228", "chrome-headless-shell-linux64", "chrome-headless-shell");
const SHIM_REL = join(".cache", "orb-playwright-shim");

/** The hook's environment, keyed by its own env-var spellings. */
function hookEnv(scratch: string, root: string, envFile: string, remote: boolean): Record<string, string> {
  const env = new Map([
    // biome-ignore lint/style/noProcessEnv: the child needs the ambient PATH to find node; nothing else is inherited.
    ["PATH", process.env["PATH"] ?? ""],
    ["HOME", scratch],
    ["PLAYWRIGHT_BROWSERS_PATH", root],
    ["CLAUDE_ENV_FILE", envFile],
  ]);
  if (remote) {
    env.set("CLAUDE_CODE_REMOTE", "true");
  }
  return Object.fromEntries(env);
}

function runHook(env: Readonly<Record<string, string>>): string {
  // The hook imports Playwright from the repository, so it runs with the repository as its cwd.
  const run = spawnSync(process.execPath, [HOOK], { cwd: fileURLToPath(new URL("../..", import.meta.url)), env, encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  return run.stdout;
}

test("a remote session maps a missing pinned executable onto the older installed revision", { timeout: CASE_BUDGET_MS }, async ({ plantedTree, scratch }) => {
  const root = await plantedTree({ [OLD_SHELL]: "#!/bin/sh\n", "ffmpeg-1011/ffmpeg-linux": "" });
  const envFile = join(scratch, "env");
  writeFileSync(envFile, "");
  const stdout = runHook(hookEnv(scratch, root, envFile, true));

  expect(stdout).toContain("pinned chromium_headless_shell r1228 is not installed; mapped it to installed r1194");
  expect(stdout, "a browser with no other revision is named, not guessed").toContain("pinned chromium r1228 is not installed and no other revision is");
  const shim = join(scratch, SHIM_REL);
  expect(readFileSync(envFile, "utf8")).toBe(`export PLAYWRIGHT_BROWSERS_PATH='${shim}'\n`);
  expect(realpathSync(join(shim, PINNED_SHELL))).toBe(realpathSync(join(root, OLD_SHELL)));
  expect(readlinkSync(join(shim, "ffmpeg-1011")), "every other installed browser stays reachable").toBe(join(root, "ffmpeg-1011"));
});

test("a local session gets no output and no environment change", { timeout: CASE_BUDGET_MS }, async ({ plantedTree, scratch }) => {
  const root = await plantedTree({ [OLD_SHELL]: "#!/bin/sh\n" });
  const envFile = join(scratch, "env");
  writeFileSync(envFile, "");
  expect(runHook(hookEnv(scratch, root, envFile, false))).toBe("");
  expect(readFileSync(envFile, "utf8")).toBe("");
  expect(existsSync(join(scratch, SHIM_REL))).toBe(false);
});
