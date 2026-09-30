// Preloaded into a real plugin broker by process-permission.test.ts. It runs in the broker process, under the broker's
// own permission flags, before the broker code: from the main thread and from a Worker it tries each fs read and a
// `node:sqlite` open of each path, tries a spawn, and reports what each attempt got.

import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import process from "node:process";
import { Worker } from "node:worker_threads";

function errorCode(error: unknown): string {
  if (error instanceof Error && "code" in error && error.code !== undefined) {
    return String(error.code);
  }
  return error instanceof Error ? error.message.slice(0, 40) : "thrown";
}

function attemptRead(path: string): string {
  try {
    readFileSync(path);
    return "allowed";
  } catch (error) {
    return errorCode(error);
  }
}

type SqliteModule = Record<"DatabaseSync", new (path: string, options: { readonly readOnly: boolean }) => { close: () => void }>;

// `node:sqlite` is not gated by the permission model's fs door, so a guest reaching it could open the app's database
// outside every read grant. Removing the builtin makes the open throw before it touches a path.
function attemptSqlite(path: string): string {
  try {
    const sqlite = process.getBuiltinModule("node:sqlite") as SqliteModule;
    new sqlite.DatabaseSync(path, { readOnly: true }).close();
    return "allowed";
  } catch (error) {
    return errorCode(error);
  }
}

interface ProbeResult {
  readonly reads: Readonly<Record<string, string>>;
  readonly sqlite: Readonly<Record<string, string>>;
}

// A Worker under the permission model can start a Worker with `execArgv: []`, which runs with no model and reads
// anything the OS user can. This starts one that reads `target`, and reports whether it succeeded.
function nestedWorkerReads(target: string): Promise<string> {
  return new Promise((resolve) => {
    let child: Worker;
    try {
      child = new Worker(`require("node:worker_threads").parentPort.postMessage(require("node:fs").readFileSync(${JSON.stringify(target)}, "utf8").length)`, {
        eval: true,
        execArgv: [],
      });
    } catch (error) {
      resolve(`denied:${errorCode(error)}`);
      return;
    }
    child.once("message", (length: number) => {
      child.terminate().catch(() => undefined);
      resolve(`read:${String(length)}`);
    });
    child.once("error", (error) => resolve(`error:${errorCode(error)}`));
  });
}

function probeMainThread(targets: readonly string[]): ProbeResult {
  return {
    reads: Object.fromEntries(targets.map((path) => [path, attemptRead(path)])),
    sqlite: Object.fromEntries(targets.map((path) => [path, attemptSqlite(path)])),
  };
}

// A guest Worker inherits the broker's permission model and its flags; this one repeats the attempts there. It also
// starts a nested Worker before and after dropping the `worker` permission, the guard `worker-runtime.ts` applies.
const WORKER_PROBE = `
const { readFileSync } = require("node:fs");
const { Worker, parentPort, workerData } = require("node:worker_threads");
const attemptRead = (path) => { try { readFileSync(path); return "allowed"; } catch (e) { return String(e.code ?? "thrown"); } };
const attemptSqlite = (path) => {
  try { const { DatabaseSync } = process.getBuiltinModule("node:sqlite"); new DatabaseSync(path, { readOnly: true }).close(); return "allowed"; }
  catch (e) { return String(e.code ?? e.message?.slice(0, 40) ?? "thrown"); }
};
const nested = (target) => new Promise((resolve) => {
  let child;
  try { child = new Worker("require('node:worker_threads').parentPort.postMessage(require('node:fs').readFileSync(process.env.CBS_TARGET, 'utf8').length)", { eval: true, execArgv: [], env: { CBS_TARGET: target } }); }
  catch (e) { resolve("denied:" + String(e.code ?? "thrown")); return; }
  child.once("message", (length) => { child.terminate(); resolve("read:" + String(length)); });
  child.once("error", (e) => resolve("error:" + String(e.code ?? "thrown")));
});
(async () => {
  const target = workerData[0];
  const nestedBeforeDrop = await nested(target);
  try { process.permission.drop("worker"); } catch (e) { /* older Node without drop */ }
  const nestedAfterDrop = await nested(target);
  parentPort.postMessage({
    reads: Object.fromEntries(workerData.map((p) => [p, attemptRead(p)])),
    sqlite: Object.fromEntries(workerData.map((p) => [p, attemptSqlite(p)])),
    nestedBeforeDrop,
    nestedAfterDrop,
  });
})();`;

function attemptSpawn(): string {
  try {
    const run = spawnSync("true");
    if (run.error !== undefined) {
      throw run.error;
    }
    return "allowed";
  } catch (error) {
    return errorCode(error);
  }
}

interface WorkerProbeResult extends ProbeResult {
  readonly nestedBeforeDrop: string;
  readonly nestedAfterDrop: string;
}

// biome-ignore lint/style/noProcessEnv: the test hands this probe its paths through the broker's spawn env.
const paths = JSON.parse(process.env["ORB_BROKER_PROBE_READS"] ?? "[]") as readonly string[];
const worker = new Worker(WORKER_PROBE, { eval: true, workerData: paths });
const [workerResult] = (await once(worker, "message")) as [WorkerProbeResult];
await worker.terminate();
const mainResult = probeMainThread(paths);
// The broker's main thread keeps the permission to start Workers, so its own guest Workers still launch.
const mainNested = await nestedWorkerReads(paths[0] ?? "");
process.send?.({
  kind: "permission-probe",
  reads: mainResult.reads,
  sqlite: mainResult.sqlite,
  workerReads: workerResult.reads,
  workerSqlite: workerResult.sqlite,
  spawn: attemptSpawn(),
  mainNested,
  workerNestedBeforeDrop: workerResult.nestedBeforeDrop,
  workerNestedAfterDrop: workerResult.nestedAfterDrop,
});
