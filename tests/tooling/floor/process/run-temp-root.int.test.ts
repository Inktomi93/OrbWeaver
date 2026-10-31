// The run-owned temp root (tooling/src/floor/process/run-temp-root.ts), proven with real processes: a run
// that ends removes its folder, a run that is SIGKILLed leaves one the next start sweeps, and a live
// owner's folder is never touched.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { RUN_TEMP_BASE_ENV, sweepAbandonedRunRoots } from "@orb/tooling/floor/process/run-temp-root";

const HOLD_MS = 60_000;

/** A child that acquires a run folder under `base`, prints `<path>\t<TMPDIR>` and either exits or holds. */
function runOwner(
  repoRoot: string,
  base: string,
  hold: boolean,
): Promise<{ pid: number; path: string; tmpdir: string; exit: Promise<void>; kill: () => void }> {
  const module = pathToFileURL(join(repoRoot, "tooling/src/floor/process/run-temp-root.ts")).href;
  const source = `const { acquireRunTempRoot } = await import(${JSON.stringify(module)});
    const root = acquireRunTempRoot();
    process.stdout.write(root.path + "\\t" + process.env["TMPDIR"] + "\\n");
    ${hold ? `setTimeout(() => {}, ${String(HOLD_MS)});` : ""}`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
    env: inheritedProcessEnv({ [RUN_TEMP_BASE_ENV]: base }),
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exit = new Promise<void>((resolve) => child.once("close", () => resolve()));
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.stdout.once("data", (chunk: Buffer) => {
      const [path = "", tmpdir = ""] = chunk.toString().trim().split("\t");
      resolve({ pid: child.pid ?? 0, path, tmpdir, exit, kill: () => child.kill("SIGKILL") });
    });
  });
}

test("a run that ends removes its folder, and its temp variables pointed at it", async ({ scratch, repoRoot }) => {
  const owner = await runOwner(repoRoot, scratch, false);
  await owner.exit;
  expect(owner.tmpdir, "TMPDIR is the run folder while the run lives").toBe(owner.path);
  expect(owner.path.startsWith(scratch), "the run folder sits in the base").toBe(true);
  expect(existsSync(owner.path), "the exit hook removed it").toBe(false);
});

test("a SIGKILLed run's folder is swept at the next start, and a live owner's folder is left alone", async ({ scratch, repoRoot }) => {
  const killed = await runOwner(repoRoot, scratch, true);
  const live = await runOwner(repoRoot, scratch, true);
  try {
    killed.kill();
    await killed.exit;
    expect(existsSync(killed.path), "SIGKILL runs no exit hook, so the folder is still there").toBe(true);

    const removed = sweepAbandonedRunRoots(scratch);

    expect(removed).toEqual([killed.path]);
    expect(existsSync(killed.path)).toBe(false);
    expect(existsSync(live.path), "the live owner's folder survives the sweep").toBe(true);
  } finally {
    live.kill();
    await live.exit;
  }
});

test("a folder whose pid is alive but started at another time is a reused pid and is swept", async ({ scratch, repoRoot }) => {
  const reused = await runOwner(repoRoot, scratch, true);
  try {
    writeFileSync(join(reused.path, ".owner"), JSON.stringify({ pid: reused.pid, startTicks: "recorded-by-an-earlier-process" }));

    expect(sweepAbandonedRunRoots(scratch)).toEqual([reused.path]);
    expect(existsSync(reused.path)).toBe(false);
  } finally {
    reused.kill();
    await reused.exit;
  }
});

test("the sweep ignores everything that is not a run folder", ({ scratch }) => {
  const stranger = join(scratch, "orb-plugin-broker-abc");
  const lookalike = join(scratch, "orb-run-notapid");
  mkdirSync(stranger);
  mkdirSync(lookalike);

  expect(sweepAbandonedRunRoots(scratch)).toEqual([]);
  expect(existsSync(stranger) && existsSync(lookalike)).toBe(true);
});
