// Preloaded with `--import` into a real `worker-runtime.ts` Worker to test the product's own permission drop. The
// preload runs before the entry module, so it defers with `setImmediate` until `worker-runtime.ts` has evaluated its
// synchronous top-level (where the drop runs), then reports whether the `worker` permission is gone and whether a
// nested `execArgv: []` Worker can still read a secret. The Worker shares its `parentPort` with `worker-runtime.ts`,
// which posts nothing unless commanded, so the tagged message below is the only one the caller sees.

import process from "node:process";
import { parentPort, Worker } from "node:worker_threads";

function nestedRead(target: string): string {
  try {
    const child = new Worker(`require("node:worker_threads").parentPort.postMessage(require("node:fs").readFileSync(process.env.CBS_TARGET, "utf8").length)`, {
      eval: true,
      execArgv: [],
      env: { ["CBS_TARGET"]: target },
    });
    child.unref();
    return "started";
  } catch (error) {
    return `denied:${error instanceof Error && "code" in error ? String(error.code) : "thrown"}`;
  }
}

setImmediate(() => {
  const hasWorker = process.permission === undefined || process.permission.has("worker");
  // biome-ignore lint/style/noProcessEnv: the caller hands the preload its target path through the Worker env.
  const target = process.env["CBS_TARGET"] ?? "";
  parentPort?.postMessage({ __cbsDropProbe: true, hasWorker, nested: nestedRead(target) });
});
