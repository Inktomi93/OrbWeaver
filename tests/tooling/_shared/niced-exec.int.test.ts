// Leg 3's real-subprocess proof: `runTool` no longer lowers the CALLER's own priority (a full-priority
// door's child must stay at the caller's real priority, never a niced door's leftover — the defect
// `lowerToolingPriority()` in `runTool` caused, since an unprivileged process cannot raise its priority
// back once lowered), while a niced door's child is ALWAYS lowered through `niced-exec.ts` regardless of
// who called it (the depcruise defect: a script that never goes through `runTool` still needs the floor).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { TOOLING_PRIORITY } from "@orb/tooling/_shared/process-priority";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const REPO_ROOT = new URL("../../../", import.meta.url);
const NICED_EXEC_PATH = `${REPO_ROOT.pathname}tooling/src/_shared/niced-exec.ts`;

/** `/proc/<pid>/stat` field 5 (1-indexed) is the process's own group id — the one POSIX fact that proves
 *  or disproves a shared group directly, without inferring it from signal side effects. */
function pgrpOf(pid: number): number {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const afterComm = stat.slice(stat.lastIndexOf(")") + 2);
  const fields = afterComm.split(" ");
  return Number(fields[2]);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("under runTool, a full-priority child stays at the caller's priority while a niced child is lowered", () => {
  const script = [
    "import { pathToFileURL } from 'node:url';",
    "import os from 'node:os';",
    `const runToolMod = await import(pathToFileURL(${JSON.stringify(`${REPO_ROOT.pathname}tooling/src/_shared/run-tool.ts`)}).href);`,
    `const procMod = await import(pathToFileURL(${JSON.stringify(`${REPO_ROOT.pathname}tooling/src/_shared/proc.ts`)}).href);`,
    "const readPriorityArgs = ['-e', \"process.stdout.write(String(require('node:os').getPriority(process.pid)))\"];",
    "await runToolMod.runTool(async () => {",
    "  const full = procMod.spawnFullPriorityChild(process.execPath, readPriorityArgs, { stdio: 'pipe-stdout' });",
    "  let fullOut = '';",
    "  full.stdout.on('data', (d) => { fullOut += d; });",
    "  await full.wait();",
    "  const niced = await procMod.spawnNiced(process.execPath, readPriorityArgs);",
    "  process.stdout.write(JSON.stringify({ full: fullOut, niced: niced.stdout, callerPriority: os.getPriority() }));",
    "  return 0;",
    "});",
  ].join("\n");

  // The AMBIENT priority this very test runs at is itself unpredictable (0 under a bare vitest run, 10
  // under `pnpm test:scoped`, which now routes through niced-exec too) — read it fresh rather than
  // assuming 0, and compare the subprocess's OWN pre-runTool priority to it, so the assertion holds either
  // way while still catching the defect (`runTool` unconditionally forcing 10 regardless of the ambient).
  const ambientPriority = execFileSync(process.execPath, ["-e", "process.stdout.write(String(require('node:os').getPriority(process.pid)))"], {
    encoding: "utf8",
  });

  const result = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  const parsed = JSON.parse(result) as { full: string; niced: string; callerPriority: number };

  expect(String(parsed.callerPriority), "runTool must never touch the caller's own priority").toBe(ambientPriority);
  expect(parsed.full, "a full-priority child inherits the CALLER's own priority, never a niced leftover").toBe(ambientPriority);
  expect(Number(parsed.niced), "a niced door's child is lowered regardless of the caller's own priority").toBe(TOOLING_PRIORITY);
});

test("pnpm depcruise's cruiser (via runNicedSync, outside runTool) reads the lowered priority", () => {
  const readPriority = runNicedSync(process.execPath, ["-e", "process.stdout.write(String(require('node:os').getPriority(process.pid)))"]);

  expect(readPriority.status, readPriority.stderr).toBe(0);
  expect(Number(readPriority.stdout), "a script that never enters runTool must still get the floor — the depcruise defect").toBe(TOOLING_PRIORITY);
});

test("SIGHUP to the launcher ends its real child, so a closed terminal never orphans it", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "orb-niced-exec-sighup-"));
  const pidFile = path.join(home, "child.pid");
  const childScript = [
    "const { writeFileSync } = require('node:fs');",
    `writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
    "setInterval(() => undefined, 1e9);",
  ].join("\n");
  const launcher = spawn(process.execPath, [NICED_EXEC_PATH, process.execPath, "-e", childScript], { stdio: "ignore" });
  try {
    for (let i = 0; i < 100 && !existsSync(pidFile); i += 1) {
      await sleep(50);
    }
    expect(existsSync(pidFile), "the planted child never published its pid — the fixture, not the launcher, is broken").toBe(true);
    const childPid = Number(readFileSync(pidFile, "utf8"));
    expect(isAlive(childPid), "the child must be running before the signal proves anything").toBe(true);

    launcher.kill("SIGHUP");

    // @orb-waive test-determinism(Date.now): the SUBJECT is real wall-clock time — polling a real OS process's liveness after a real signal has no injectable clock.
    const deadline = Date.now() + scaledBudget(20_000);
    // @orb-waive test-determinism(Date.now): see the waiver above; the same real-time polling loop.
    while (isAlive(childPid) && Date.now() < deadline) {
      await sleep(50);
    }
    expect(isAlive(childPid), "SIGHUP to the launcher must end its real child, not just itself").toBe(false);
  } finally {
    if (launcher.exitCode === null && launcher.pid !== undefined) {
      try {
        process.kill(launcher.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
    rmSync(home, { recursive: true, force: true });
  }
});

test("the real child leads its OWN process group, never the launcher's, so a signal is never delivered twice (#4, leg 4)", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "orb-niced-exec-group-"));
  const pidFile = path.join(home, "child.pid");
  const childScript = [
    "const { writeFileSync } = require('node:fs');",
    `writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
    "setInterval(() => undefined, 1e9);",
  ].join("\n");
  // NOT detached: this launcher shares ITS OWN process group with the test runner, matching the
  // package.json-script shape the defect was measured in (a terminal's foreground group).
  const launcher = spawn(process.execPath, [NICED_EXEC_PATH, process.execPath, "-e", childScript], { stdio: "ignore" });
  try {
    for (let i = 0; i < 100 && !existsSync(pidFile); i += 1) {
      await sleep(50);
    }
    expect(existsSync(pidFile)).toBe(true);
    const childPid = Number(readFileSync(pidFile, "utf8"));
    expect(launcher.pid, "the launcher must have a real pid to compare groups against").not.toBeUndefined();
    const launcherPgrp = pgrpOf(launcher.pid as number);
    const childPgrp = pgrpOf(childPid);
    expect(childPgrp, "the child's group must be its OWN pid, not the launcher's group").toBe(childPid);
    expect(childPgrp, "the child must NOT share the launcher's group, or a terminal signal reaches it twice").not.toBe(launcherPgrp);
  } finally {
    if (launcher.exitCode === null && launcher.pid !== undefined) {
      try {
        process.kill(launcher.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
    rmSync(home, { recursive: true, force: true });
  }
});
