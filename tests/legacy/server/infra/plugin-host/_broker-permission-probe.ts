// Preloaded into a real plugin broker by process-permission.test.ts. It runs in the broker process, under the broker's
// own permission flags, before the broker code: from the main thread and from a guest Worker it tries each fs read and
// a `node:sqlite` open of each path, tries a spawn, and starts the real `worker-runtime.ts` to confirm that its own
// permission drop leaves a guest Worker unable to start a Worker or read a secret.

import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
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
  readonly network?: string;
}

function probeMainThread(targets: readonly string[]): ProbeResult {
  return {
    reads: Object.fromEntries(targets.map((path) => [path, attemptRead(path)])),
    sqlite: Object.fromEntries(targets.map((path) => [path, attemptSqlite(path)])),
  };
}

// A guest Worker inherits the broker's permission model and its flags; this one repeats the fs and sqlite attempts.
const WORKER_PROBE = `
const { readFileSync } = require("node:fs");
const { connect } = require("node:net");
const { parentPort, workerData } = require("node:worker_threads");
const attemptRead = (path) => { try { readFileSync(path); return "allowed"; } catch (e) { return String(e.code ?? "thrown"); } };
const attemptSqlite = (path) => {
  try { const { DatabaseSync } = process.getBuiltinModule("node:sqlite"); new DatabaseSync(path, { readOnly: true }).close(); return "allowed"; }
  catch (e) { return String(e.code ?? e.message?.slice(0, 40) ?? "thrown"); }
};
const network = new Promise((resolve) => {
  if (!Number.isFinite(workerData.port)) { resolve("not-requested"); return; }
  try {
    const socket = connect({ host: "127.0.0.1", port: workerData.port });
    socket.once("connect", () => { socket.destroy(); resolve("allowed"); });
    socket.once("error", (error) => resolve(String(error.code ?? "thrown")));
  } catch (error) { resolve(String(error.code ?? "thrown")); }
});
network.then((network) => parentPort.postMessage({
  reads: Object.fromEntries(workerData.paths.map((p) => [p, attemptRead(p)])),
  sqlite: Object.fromEntries(workerData.paths.map((p) => [p, attemptSqlite(p)])),
  network,
}));`;

interface DropProbeMessage {
  readonly __cbsDropProbe: true;
  readonly hasWorker: boolean;
  readonly nested: string;
}

function isDropProbe(message: unknown): message is DropProbeMessage {
  return typeof message === "object" && message !== null && Reflect.get(message, "__cbsDropProbe") === true;
}

// Start the real `worker-runtime.ts` as a Worker under the broker's flags, with the drop preload imported. The preload
// reports whether `worker-runtime.ts`'s own drop removed the `worker` permission and blocked a nested Worker. Runs
// only when the caller supplies the two paths; the container proof and the unit test both do.
async function probeWorkerRuntimeDrop(target: string): Promise<{ hasWorker: boolean; nested: string } | null> {
  // biome-ignore lint/style/noProcessEnv: the caller passes the runtime and preload paths through the broker env.
  const runtimePath = process.env["ORB_WORKER_RUNTIME_PATH"];
  // biome-ignore lint/style/noProcessEnv: the caller passes the runtime and preload paths through the broker env.
  const preloadPath = process.env["ORB_WORKER_DROP_PRELOAD"];
  if (runtimePath === undefined || preloadPath === undefined) {
    return null;
  }
  const child = new Worker(runtimePath, {
    execArgv: [...process.execArgv, `--allow-fs-read=${preloadPath}`, `--import=${preloadPath}`],
    env: { ["NODE_ENV"]: "production", ["CBS_TARGET"]: target },
    workerData: { runtimeId: "drop-probe" },
  });
  try {
    return await new Promise<{ hasWorker: boolean; nested: string }>((resolve) => {
      child.on("message", (message: unknown) => {
        if (isDropProbe(message)) {
          resolve({ hasWorker: message.hasWorker, nested: message.nested });
        }
      });
      // worker-runtime that fails to drop throws at load, before the preload posts; report that as a failure, not a hang.
      child.once("error", (error) => resolve({ hasWorker: true, nested: `worker-runtime-error:${errorCode(error)}` }));
      child.once("exit", (code) => resolve({ hasWorker: true, nested: `worker-runtime-exit:${String(code)}` }));
    });
  } finally {
    await child.terminate();
  }
}

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

// biome-ignore lint/style/noProcessEnv: the test hands this probe its paths through the broker's spawn env.
const paths = JSON.parse(process.env["ORB_BROKER_PROBE_READS"] ?? "[]") as readonly string[];
// biome-ignore lint/style/noProcessEnv: the test supplies a listening loopback target.
const networkPort = Number(process.env["ORB_BROKER_PROBE_PORT"]);
const worker = new Worker(WORKER_PROBE, { eval: true, workerData: { paths, port: networkPort } });
const [workerResult] = (await once(worker, "message")) as [ProbeResult];
await worker.terminate();
const mainResult = probeMainThread(paths);
const drop = await probeWorkerRuntimeDrop(paths[0] ?? "");
const network = await new Promise<string>((resolve) => {
  if (!Number.isFinite(networkPort)) {
    resolve("not-requested");
    return;
  }
  try {
    const socket = connect({ host: "127.0.0.1", port: networkPort });
    socket.once("connect", () => {
      socket.destroy();
      resolve("allowed");
    });
    socket.once("error", (error) => resolve(errorCode(error)));
  } catch (error) {
    resolve(errorCode(error));
  }
});
process.send?.({
  kind: "permission-probe",
  reads: mainResult.reads,
  sqlite: mainResult.sqlite,
  workerReads: workerResult.reads,
  workerSqlite: workerResult.sqlite,
  spawn: attemptSpawn(),
  dropHasWorker: drop?.hasWorker,
  dropNested: drop?.nested,
  network,
  workerNetwork: workerResult.network,
});
