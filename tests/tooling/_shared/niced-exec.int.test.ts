// Leg 3's real-subprocess proof: `runTool` no longer lowers the CALLER's own priority (a full-priority
// door's child must stay at the caller's real priority, never a niced door's leftover — the defect
// `lowerToolingPriority()` in `runTool` caused, since an unprivileged process cannot raise its priority
// back once lowered), while a niced door's child is ALWAYS lowered through `niced-exec.ts` regardless of
// who called it (the depcruise defect: a script that never goes through `runTool` still needs the floor).
//
// Leg 5's proof (owner-ruled, refuting leg 4's `detached` shape): the real child now shares the LAUNCHER's
// own process group, never a group of its own — a caller that group-kills the launcher (the
// scripts/vitest-supervised.ts wedge watchdog and Ctrl-C) must reach the real command too, or it orphans.
// SIGINT/SIGQUIT/SIGHUP reach the shared group directly and the launcher only ignores them; SIGTERM,
// typically aimed at one pid, is relayed directly to the child.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The one direct child of `pid`, read from `/proc` rather than inferred from signal side effects — the
 *  Linux fact a niced launcher's real command is discoverable by, since niced-exec exposes no pid of its
 *  own for it. */
async function firstChildOf(pid: number): Promise<number> {
  const childrenFile = `/proc/${pid}/task/${pid}/children`;
  for (let i = 0; i < 100; i += 1) {
    if (existsSync(childrenFile)) {
      const text = readFileSync(childrenFile, "utf8").trim();
      if (text !== "") {
        return Number(text.split(" ")[0]);
      }
    }
    await sleep(50);
  }
  throw new Error(`niced-exec (pid ${pid}) never published a real child in /proc — the fixture, not the launcher, is broken`);
}

/** `/proc/<pid>/stat` field 5 (1-indexed) is the process's own group id. */
function pgrpOf(pid: number): number {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[2]);
}

async function waitGone(pid: number, budgetMs: number): Promise<boolean> {
  // @orb-waive test-determinism(Date.now): the SUBJECT is real wall-clock time — polling a real OS process's liveness after a real signal has no injectable clock.
  const deadline = Date.now() + budgetMs;
  // @orb-waive test-determinism(Date.now): see the waiver above; the same real-time polling loop.
  while (isAlive(pid) && Date.now() < deadline) {
    await sleep(50);
  }
  return !isAlive(pid);
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

test("the real child shares the LAUNCHER's own process group, never a group of its own", async () => {
  const launcher = spawn(process.execPath, [NICED_EXEC_PATH, "sh", "-c", "sleep 60"], { stdio: "ignore", detached: true });
  try {
    expect(launcher.pid, "the launcher must have a real pid").not.toBeUndefined();
    const launcherPid = launcher.pid as number;
    const childPid = await firstChildOf(launcherPid);
    expect(pgrpOf(childPid), "the child must share the launcher's OWN group, not lead one of its own").toBe(pgrpOf(launcherPid));
  } finally {
    if (launcher.pid !== undefined) {
      try {
        process.kill(-launcher.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
});

test("a group SIGKILL of the launcher leaves no survivor — the verifier's repro", async () => {
  const launcher = spawn(process.execPath, [NICED_EXEC_PATH, "sh", "-c", "sleep 60"], { stdio: "ignore", detached: true });
  const launcherPid = launcher.pid as number;
  expect(launcherPid, "the launcher must have a real pid").not.toBeUndefined();
  const childPid = await firstChildOf(launcherPid);
  expect(isAlive(childPid), "the child must be running before the group kill proves anything").toBe(true);

  process.kill(-launcherPid, "SIGKILL");

  expect(await waitGone(launcherPid, scaledBudget(20_000)), "the launcher must die").toBe(true);
  expect(await waitGone(childPid, scaledBudget(20_000)), "a group SIGKILL must take the real child too — no orphan").toBe(true);
});

test("SIGTERM to the launcher's own pid (not a group signal) ends the child", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "orb-niced-exec-sigterm-"));
  try {
    const launcher = spawn(process.execPath, [NICED_EXEC_PATH, "sh", "-c", "sleep 60"], { stdio: "ignore" });
    const launcherPid = launcher.pid as number;
    expect(launcherPid, "the launcher must have a real pid").not.toBeUndefined();
    const childPid = await firstChildOf(launcherPid);
    expect(isAlive(childPid), "the child must be running before the signal proves anything").toBe(true);

    launcher.kill("SIGTERM");

    expect(await waitGone(childPid, scaledBudget(20_000)), "SIGTERM to the launcher's pid must end its real child").toBe(true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("SIGHUP to the launcher's GROUP ends its real child, so a closed terminal never orphans it", async () => {
  const launcher = spawn(process.execPath, [NICED_EXEC_PATH, "sh", "-c", "sleep 60"], { stdio: "ignore", detached: true });
  const launcherPid = launcher.pid as number;
  expect(launcherPid, "the launcher must have a real pid").not.toBeUndefined();
  const childPid = await firstChildOf(launcherPid);
  expect(isAlive(childPid), "the child must be running before the signal proves anything").toBe(true);

  // A real terminal hangup reaches every member of the foreground group directly — this is the group
  // delivery, not a single-pid signal, since the launcher no longer relays SIGHUP itself.
  process.kill(-launcherPid, "SIGHUP");

  expect(await waitGone(childPid, scaledBudget(20_000)), "SIGHUP to the group must end the real child").toBe(true);
});

test("a pty Ctrl-C reaches the real child exactly once, never twice", () => {
  const home = mkdtempSync(path.join(tmpdir(), "orb-niced-exec-pty-"));
  const countFile = path.join(home, "sigint.count");
  const pyScript = path.join(home, "pty_ctrl_c.py");
  writeFileSync(
    pyScript,
    [
      "import os, sys, time, signal",
      "pid, fd = os.forkpty()",
      "if pid == 0:",
      "    os.execvp(sys.argv[1], sys.argv[1:])",
      "else:",
      "    time.sleep(1.0)",
      "    os.write(fd, b'\\x03')", // Ctrl-C -> the tty driver's INTR -> a real SIGINT to the foreground group.
      "    time.sleep(1.0)",
      "    os.kill(pid, signal.SIGKILL)",
      "    sys.exit(0)",
    ].join("\n"),
  );
  // The trap counts every SIGINT delivery this shell sees to a file — the launcher's own copy (ignored,
  // never relayed) must not add a second line to it.
  const childScript = `trap 'echo x >> ${JSON.stringify(countFile)}' INT; while true; do sleep 0.1; done`;
  try {
    execFileSync("python3", [pyScript, process.execPath, NICED_EXEC_PATH, "sh", "-c", childScript], {
      stdio: "ignore",
      timeout: scaledBudget(15_000),
    });
  } catch {
    // The pty session is force-killed at the end of the python script by design — a nonzero/timeout exit
    // here is expected and irrelevant; the count file is the actual observable.
  }
  const count = existsSync(countFile)
    ? readFileSync(countFile, "utf8")
        .split("\n")
        .filter((line) => line === "x").length
    : 0;
  expect(count, "the pty's Ctrl-C must reach the real child exactly once").toBe(1);
  rmSync(home, { recursive: true, force: true });
});
