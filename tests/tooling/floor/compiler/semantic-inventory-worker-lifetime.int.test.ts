// @subject tooling/src/floor/compiler/semantic-inventory-worker-run.ts
// @subject tooling/src/floor/process/niced-exec.ts
// A stopped controller must not leave its native inventory worker running. The worker is frozen with
// SIGSTOP once it appears: that holds it mid-extraction and makes it a worker that cannot honor TERM.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { pidAlive } from "../../../../tooling/src/floor/artifacts/run-retention.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { listProcesses, processGroupId } from "../../../../tooling/src/floor/host/platform.ts";
import { killPidGroup, spawnNicedTranscript } from "../../../../tooling/src/floor/process/proc.ts";
import { inheritedProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import { settle, TERM_GRACE_BASE_MS } from "../../../../tooling/src/floor/process/stop-escalation.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { copyNativeInventoryImplementation } from "./native-inventory-tree.ts";

const NODE_OPTIONS = "NODE_OPTIONS";
const WORKER_ENTRY = "semantic-inventory-worker.ts";
const LAUNCHER_ENTRY = "niced-exec.ts";
const CONTROLLER_LINE = /^controller (\d+)$/mu;
const WORKER_START_BASE_MS = 60_000;
const timeout = scaledBudget(180_000);
// TERM, the TERM grace, then KILL: a frozen worker is gone only after the whole escalation.
const ESCALATION_BASE_MS = TERM_GRACE_BASE_MS * 3;

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
  let started: readonly number[] = [];
  const frozen = await settle(() => {
    const table = new Map(listProcesses().map((entry) => [entry.pid, entry.cmdline]));
    const worker = descendantsOf(controller).find((pid) => {
      const cmdline = table.get(pid) ?? "";
      return cmdline.includes(WORKER_ENTRY) && !cmdline.includes(LAUNCHER_ENTRY);
    });
    if (worker === undefined) {
      return false;
    }
    process.kill(worker, "SIGSTOP");
    started = descendantsOf(controller);
    return true;
  }, WORKER_START_BASE_MS);
  if (!frozen) {
    throw new Error(`controller ${String(controller)} never started a native inventory worker`);
  }
  return started;
}

async function survivorsAfter(pids: readonly number[]): Promise<readonly number[]> {
  await settle(() => !pids.some(pidAlive), ESCALATION_BASE_MS);
  return pids.filter(pidAlive);
}

function reap(pids: readonly number[]): void {
  for (const pid of pids.filter(pidAlive)) {
    process.kill(pid, "SIGKILL");
  }
}

function groupMembers(group: number): readonly number[] {
  return listProcesses()
    .map((entry) => entry.pid)
    .filter((pid) => processGroupId(pid) === group);
}

// The worker's last argument is the request file inside the controller's scratch directory.
function requestScratchOf(started: readonly number[]): string {
  const worker = listProcesses().find(({ pid, cmdline }) => started.includes(pid) && cmdline.includes(WORKER_ENTRY) && !cmdline.includes(LAUNCHER_ENTRY));
  const request = worker?.cmdline.split(" ").at(-1);
  if (request === undefined) {
    throw new Error("the frozen worker names no request file");
  }
  return dirname(request);
}

test("SIGTERM to the controller ends and joins a worker that ignores TERM and removes its scratch", { timeout }, async ({ scratch, repoRoot }) => {
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
    const requestScratch = requestScratchOf(started);
    controller.kill("SIGTERM");
    expect(await survivorsAfter(started), "every process the stopped controller started").toEqual([]);
    expect(existsSync(requestScratch), "the stopped controller's worker scratch directory").toBe(false);
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
    expect(await survivorsAfter(started), "every process the timed-out controller started").toEqual([]);
  } finally {
    reap(started);
  }
});

// A caller that dies inside the launcher's boot leaves it already reparented when its module graph loads.
test("a supervised child never outlives a caller that dies while the launcher boots", { timeout }, async ({ scratch, repoRoot }) => {
  const caller = join(scratch, "caller.mjs");
  const proc = pathToFileURL(join(repoRoot, "tooling/src/floor/process/proc.ts")).href;
  // The watcher thread kills the caller the instant its sync child is forked; the blocked main thread cannot.
  writeFileSync(
    caller,
    `import {Worker} from 'node:worker_threads';
const {runNicedSync}=await import(${JSON.stringify(proc)});
const watcher=new Worker("const {readFileSync}=require('node:fs');const path='/proc/'+process.pid+'/task/'+process.pid+'/children';for(;;){if(readFileSync(path,'utf8').trim()!==''){process.kill(process.pid,'SIGKILL');}}",{eval:true});
await new Promise((resolve)=>watcher.once('online',resolve));
runNicedSync('sleep',['60'],{supervised:true});`,
  );
  const parent = spawn(process.execPath, [caller], { cwd: repoRoot, stdio: "ignore", detached: true });
  const group = parent.pid;
  if (group === undefined) {
    throw new Error("the caller never started");
  }
  try {
    const exit = await new Promise<NodeJS.Signals | null>((resolve) => parent.once("exit", (_code, signal) => resolve(signal)));
    expect(exit, "the caller must die after forking its sync child").toBe("SIGKILL");
    await settle(() => groupMembers(group).length === 0, ESCALATION_BASE_MS);
    expect(groupMembers(group), "every process the dead caller started").toEqual([]);
  } finally {
    killPidGroup(group, "SIGKILL");
  }
});
