// The SDK still owns Query and protocol decoding; this adapter replaces only its physical executable.

import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { SdkScriptSpawn } from "./contract/sdk-process.ts";

export type { SdkScriptSpawn } from "./contract/sdk-process.ts";

/** Execute a trusted proof script with the SDK's actual environment, working directory and cancellation. */
export function createSdkProcessSpawner(scriptModule: URL): SdkScriptSpawn {
  const script = fileURLToPath(scriptModule);
  return (options) =>
    spawn(process.execPath, [script], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env: options.env,
      signal: options.signal,
      stdio: ["pipe", "pipe", "pipe"],
    });
}
