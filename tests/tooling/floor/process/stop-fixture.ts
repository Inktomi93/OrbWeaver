// Stop a real caller while the child it launched is frozen, and report what outlived it. Linux only: the
// in-caller watcher reads /proc, because a caller blocked in a sync spawn cannot observe its own child.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import process from "node:process";
import { pidAlive } from "../../../../tooling/src/floor/artifacts/run-retention.ts";
import { listProcesses } from "../../../../tooling/src/floor/host/platform.ts";
import { settle, TERM_GRACE_BASE_MS } from "../../../../tooling/src/floor/process/stop-escalation.ts";

const FROZEN_LINE = /^frozen (\d+)$/mu;
// TERM, the TERM grace, then KILL: a frozen child is gone only after the whole escalation.
const ESCALATION_BASE_MS = TERM_GRACE_BASE_MS * 3;

// Runs on a worker thread in the caller: freeze the first descendant whose script argument ends with
// `target`, the instant it has exec'd, then print its pid straight to fd 1.
const WATCHER = `const {readdirSync,readFileSync,writeSync}=require('node:fs');
const {workerData}=require('node:worker_threads');
const read=(path)=>{try{return readFileSync(path,'utf8');}catch{return '';}};
const children=(pid)=>{let tids=[];try{tids=readdirSync('/proc/'+pid+'/task');}catch{}return tids.flatMap((tid)=>read('/proc/'+pid+'/task/'+tid+'/children').split(' ').filter(Boolean).map(Number));};
const watch=()=>{for(;;){const queue=children(process.pid);for(const pid of queue){if((read('/proc/'+pid+'/cmdline').split('\\0')[1]??'').endsWith(workerData.target)){process.kill(pid,'SIGSTOP');writeSync(1,'frozen '+pid+'\\n');return;}queue.push(...children(pid));}}};
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

/** Run `caller`, SIGTERM it once its child is frozen, and return every process it started that survives. */
export async function survivorsOfStoppedCaller(caller: string, cwd: string): Promise<readonly number[]> {
  const child = spawn(process.execPath, [caller], { cwd, stdio: ["ignore", "pipe", "ignore"], detached: true });
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("the caller never started");
  }
  let started: readonly number[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (FROZEN_LINE.test(output)) {
          resolve();
        }
      });
      child.once("exit", (code, signal) => reject(new Error(`the caller exited (${String(code ?? signal)}) before its child was frozen`)));
    });
    started = descendantsOf(pid);
    child.kill("SIGTERM");
    await settle(() => !started.some(pidAlive), ESCALATION_BASE_MS);
    return started.filter(pidAlive);
  } finally {
    for (const survivor of [pid, ...started].filter(pidAlive)) {
      process.kill(survivor, "SIGKILL");
    }
  }
}
