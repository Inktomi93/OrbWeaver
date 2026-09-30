// Preloaded into a real plugin broker by process-permission.test.ts. It runs in the broker process, under the broker's
// own permission flags, before the broker code: it tries each read from the main thread and from a Worker, tries a
// spawn, and reports what each attempt got.

import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import process from "node:process";
import { Worker } from "node:worker_threads";

function attempt(action: () => unknown): string {
  try {
    action();
    return "allowed";
  } catch (error) {
    return error instanceof Error && "code" in error ? String(error.code) : "thrown";
  }
}

// A guest Worker inherits the broker's permission model; this one repeats the reads there.
const WORKER_READS = `
const { readFileSync } = require("node:fs");
const { parentPort, workerData } = require("node:worker_threads");
parentPort.postMessage(Object.fromEntries(workerData.map((path) => {
  try { readFileSync(path); return [path, "allowed"]; } catch (error) { return [path, String(error.code ?? "thrown")]; }
})));`;

// biome-ignore lint/style/noProcessEnv: the test hands this probe its paths through the broker's spawn env.
const reads = JSON.parse(process.env["ORB_BROKER_PROBE_READS"] ?? "[]") as readonly string[];
const worker = new Worker(WORKER_READS, { eval: true, workerData: reads });
const [workerReads] = (await once(worker, "message")) as [Readonly<Record<string, string>>];
await worker.terminate();
process.send?.({
  kind: "permission-probe",
  reads: Object.fromEntries(reads.map((path) => [path, attempt(() => readFileSync(path))])),
  workerReads,
  spawn: attempt(() => {
    const run = spawnSync("true");
    if (run.error !== undefined) {
      throw run.error;
    }
  }),
});
