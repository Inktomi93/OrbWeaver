// Stop a real caller while the child it launched is frozen, and report what outlived it. Linux only: the
// in-caller watcher reads /proc, because a caller blocked in a sync spawn cannot observe its own child.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { pidAlive } from "../../../../tooling/src/floor/artifacts/run-retention.ts";
import { listProcesses } from "../../../../tooling/src/floor/host/platform.ts";
import { killPidGroup } from "../../../../tooling/src/floor/process/proc.ts";
import { settle, TERM_GRACE_BASE_MS } from "../../../../tooling/src/floor/process/stop-escalation.ts";

const FROZEN_LINE = /^frozen (\d+)$/mu;
// TERM, the TERM grace, then KILL: a frozen child is gone only after the whole escalation.
const ESCALATION_BASE_MS = TERM_GRACE_BASE_MS * 3;

const WATCH_YIELD_MS = 1;
const WATCH_POLLS = 120_000;
const FREEZE_BASE_MS = 120_000;

// Runs on a worker thread in the caller: freeze the first descendant whose script argument ends with
// `target`, the instant it has exec'd, then print its pid straight to fd 1. Each poll yields briefly so
// the watcher does not hold a core, and it gives up after a bounded number of polls.
const WATCHER = `const {readdirSync,readFileSync,writeSync}=require('node:fs');
const {workerData}=require('node:worker_threads');
const pause=new Int32Array(new SharedArrayBuffer(4));
const read=(path)=>{try{return readFileSync(path,'utf8');}catch{return '';}};
const children=(pid)=>{let tids=[];try{tids=readdirSync('/proc/'+pid+'/task');}catch{}return tids.flatMap((tid)=>read('/proc/'+pid+'/task/'+tid+'/children').split(' ').filter(Boolean).map(Number));};
const watch=()=>{for(let poll=0;poll<${String(WATCH_POLLS)};poll++){const queue=children(process.pid);for(const pid of queue){if((read('/proc/'+pid+'/cmdline').split('\\0')[1]??'').endsWith(workerData.target)){process.kill(pid,'SIGSTOP');writeSync(1,'frozen '+pid+'\\n');return;}queue.push(...children(pid));}Atomics.wait(pause,0,0,${String(WATCH_YIELD_MS)});}};
watch();`;

/** Write a caller module that starts the freezing watcher, then runs `body` (ES module source). */
export function writeFreezingCaller(path: string, target: string, body: string): void {
  writeFileSync(
    path,
    `import {Worker} from 'node:worker_threads';
const watcher=new Worker(${JSON.stringify(WATCHER)},{eval:true,workerData:{target:${JSON.stringify(target)}}});
await new Promise((resolve)=>watcher.once('online',resolve));
${body}`,
  );
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

export interface StoppedCaller {
  /** Every process the caller started that is still alive after the whole escalation. */
  readonly survivors: readonly number[];
  /** The frozen child's argv, read before the stop. */
  readonly frozenArgv: readonly string[];
}

/** Run `caller`, SIGTERM it once its child is frozen, and report what outlived it. */
export async function stopFrozenCaller(caller: string, cwd: string): Promise<StoppedCaller> {
  const child = spawn(process.execPath, [caller], { cwd, stdio: ["ignore", "pipe", "ignore"], detached: true });
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("the caller never started");
  }
  let started: readonly number[] = [];
  try {
    let output = "";
    let exited: string | undefined;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("exit", (code, signal) => {
      exited = String(code ?? signal);
    });
    // Bounded, so the cleanup below runs even when the caller hangs before its child appears.
    await settle(() => FROZEN_LINE.test(output) || exited !== undefined, FREEZE_BASE_MS);
    const match = FROZEN_LINE.exec(output)?.[1];
    if (match === undefined) {
      throw new Error(exited === undefined ? "the caller's child never appeared" : `the caller exited (${exited}) before its child was frozen`);
    }
    const frozen = Number(match);
    const frozenArgv = readFileSync(`/proc/${String(frozen)}/cmdline`, "utf8").split("\0");
    started = descendantsOf(pid);
    child.kill("SIGTERM");
    await settle(() => !started.some(pidAlive), ESCALATION_BASE_MS);
    return { survivors: started.filter(pidAlive), frozenArgv };
  } finally {
    // The caller's own group holds its sync children even when nothing was frozen or recorded.
    killPidGroup(pid, "SIGKILL");
    for (const survivor of started.filter(pidAlive)) {
      process.kill(survivor, "SIGKILL");
    }
  }
}
