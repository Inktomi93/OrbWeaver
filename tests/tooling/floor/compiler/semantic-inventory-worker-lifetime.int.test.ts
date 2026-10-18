// @subject tooling/src/floor/compiler/semantic-inventory-worker-run.ts
// @subject tooling/src/floor/process/niced-exec.ts
// A stopped controller must not leave its native inventory worker running. The worker is frozen with
// SIGSTOP once it appears: that holds it mid-extraction and makes it a worker that cannot honor TERM.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { pidAlive } from "../../../../tooling/src/floor/artifacts/run-retention.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { listProcesses } from "../../../../tooling/src/floor/host/platform.ts";
import { spawnNicedTranscript } from "../../../../tooling/src/floor/process/proc.ts";
import { inheritedProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import { TERM_GRACE_BASE_MS } from "../../../../tooling/src/floor/process/stop-escalation.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { copyNativeInventoryImplementation } from "./native-inventory-tree.ts";

const NODE_OPTIONS = "NODE_OPTIONS";
const WORKER_ENTRY = "semantic-inventory-worker.ts";
const LAUNCHER_ENTRY = "niced-exec.ts";
const CONTROLLER_LINE = /^controller (\d+)$/mu;
const POLL_MS = 50;
const timeout = scaledBudget(180_000);
// TERM, the TERM grace, then KILL: a frozen worker is gone only after the whole escalation.
const escalationBound = scaledBudget(TERM_GRACE_BASE_MS * 3);

interface Controller {
  readonly bootstrap: string;
  readonly entry: string;
  readonly cwd: string;
}

/** A real controller over a tiny subject; it prints its pid first so a caller without one can find it. */
function plantController(scratch: string, repoRoot: string): Controller {
  const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
  cpSync(join(repoRoot, "pnpm-workspace.yaml"), join(implementation, "pnpm-workspace.yaml"));
  const subject = join(scratch, "subject");
  mkdirSync(subject);
  writeFileSync(join(subject, "tsconfig.json"), JSON.stringify({ files: ["tiny.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(subject, "tiny.ts"), "export const tiny=1;\n");
  writeFileSync(join(subject, ".gitignore"), ".cache/\n");
  execFixtureGit(subject, ["init", "-q"]);
  const entry = join(implementation, "controller.mjs");
  writeFileSync(
    entry,
    `process.stdout.write('controller '+process.pid+'\\n');
const {createSemanticInventory}=await import('./tooling/src/floor/code-facts/semantic-inventory.ts');
using inventory=createSemanticInventory({root:${JSON.stringify(subject)},families:['exports']});`,
  );
  return { bootstrap: join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts"), entry, cwd: implementation };
}

function descendantsOf(root: number): number[] {
  const table = listProcesses();
  const found: number[] = [];
  const queue = [root];
  for (const parent of queue) {
    for (const entry of table) {
      if (entry.ppid === parent) {
        found.push(entry.pid);
        queue.push(entry.pid);
      }
    }
  }
  return found;
}

/** Wait for the real worker under `controller`, freeze it, and return every process the controller started. */
async function freezeWorker(controller: number): Promise<readonly number[]> {
  // @orb-waive test-determinism(Date.now): the subject is a real OS process tree; its spawn has no injectable clock.
  const deadline = Date.now() + scaledBudget(60_000);
  // @orb-waive test-determinism(Date.now): see the waiver above; the same real-time polling loop.
  while (Date.now() < deadline) {
    const tree = descendantsOf(controller);
    const table = new Map(listProcesses().map((entry) => [entry.pid, entry.cmdline]));
    const worker = tree.find((pid) => {
      const cmdline = table.get(pid) ?? "";
      return cmdline.includes(WORKER_ENTRY) && !cmdline.includes(LAUNCHER_ENTRY);
    });
    if (worker !== undefined) {
      process.kill(worker, "SIGSTOP");
      return descendantsOf(controller);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`controller ${String(controller)} never started a native inventory worker`);
}

async function survivorsAfter(pids: readonly number[], budgetMs: number): Promise<readonly number[]> {
  // @orb-waive test-determinism(Date.now): liveness after a real signal is real wall-clock time.
  const deadline = Date.now() + budgetMs;
  // @orb-waive test-determinism(Date.now): see the waiver above; the same real-time polling loop.
  while (pids.some(pidAlive) && Date.now() < deadline) {
    await sleep(POLL_MS);
  }
  return pids.filter(pidAlive);
}

function reap(pids: readonly number[]): void {
  for (const pid of pids.filter(pidAlive)) {
    process.kill(pid, "SIGKILL");
  }
}

test("SIGTERM to the controller ends and joins a worker that ignores TERM", { timeout }, async ({ scratch, repoRoot }) => {
  const planted = plantController(scratch, repoRoot);
  const controller = spawn(process.execPath, ["--import", planted.bootstrap, planted.entry], {
    cwd: planted.cwd,
    env: inheritedProcessEnv({ [NODE_OPTIONS]: "" }),
    stdio: "ignore",
    detached: true,
  });
  const pid = controller.pid;
  if (pid === undefined) {
    throw new Error("the controller never started");
  }
  let started: readonly number[] = [];
  try {
    started = await freezeWorker(pid);
    controller.kill("SIGTERM");
    expect(await survivorsAfter(started, escalationBound), "every process the stopped controller started").toEqual([]);
  } finally {
    reap([pid, ...started]);
  }
});

test("the verify stage timeout ends a controller mid-extraction with no surviving worker", { timeout }, async ({ scratch, repoRoot }) => {
  const planted = plantController(scratch, repoRoot);
  let output = "";
  let frozen: Promise<readonly number[]> | undefined;
  const run = spawnNicedTranscript(process.execPath, ["--import", planted.bootstrap, planted.entry], {
    cwd: planted.cwd,
    env: inheritedProcessEnv({ [NODE_OPTIONS]: "" }),
    timeoutMs: scaledBudget(30_000),
    onChunk: (chunk) => {
      output += chunk;
      const pid = CONTROLLER_LINE.exec(output)?.[1];
      frozen ??= pid === undefined ? undefined : freezeWorker(Number(pid));
    },
  });
  const result = await run;
  const started = (await frozen) ?? [];
  try {
    expect(result.code, result.transcript).toBeNull();
    expect(started.length, "the timeout must land after the worker started").toBeGreaterThan(0);
    expect(await survivorsAfter(started, escalationBound), "every process the timed-out controller started").toEqual([]);
  } finally {
    reap(started);
  }
});
