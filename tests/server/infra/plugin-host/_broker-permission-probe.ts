// Preloaded into a real plugin broker by broker-permission.test.ts. It runs in the broker process, under the broker's
// own permission flags, before the broker code: it tries each read and a spawn, and reports what each attempt got.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

function attempt(action: () => unknown): string {
  try {
    action();
    return "allowed";
  } catch (error) {
    return error instanceof Error && "code" in error ? String(error.code) : "thrown";
  }
}

// biome-ignore lint/style/noProcessEnv: the test hands this probe its paths through the broker's spawn env.
const reads = JSON.parse(process.env["ORB_BROKER_PROBE_READS"] ?? "[]") as readonly string[];
process.send?.({
  kind: "permission-probe",
  reads: Object.fromEntries(reads.map((path) => [path, attempt(() => readFileSync(path))])),
  spawn: attempt(() => {
    const run = spawnSync("true");
    if (run.error !== undefined) {
      throw run.error;
    }
  }),
});
