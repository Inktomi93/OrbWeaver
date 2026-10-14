// The SDK still owns Query and protocol decoding; this adapter replaces only its physical executable.

import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { SdkScriptSpawn } from "./contract/sdk-process.ts";

export type { SdkPrivateDiagnosticInput, SdkPrivateDiagnosticResult } from "./contract/sdk-private-diagnostics.ts";
export { SDK_PRIVATE_DIAGNOSTIC_SINKS, sdkPrivateDiagnosticResultSchema } from "./contract/sdk-private-diagnostics.ts";
export type { SdkScriptSpawn } from "./contract/sdk-process.ts";

/** Execute a trusted proof script with the SDK's actual environment, working directory and cancellation. */
export function createSdkProcessSpawner(scriptModule: URL, args: readonly string[] = []): SdkScriptSpawn {
  const script = fileURLToPath(scriptModule);
  return (options) =>
    spawn(process.execPath, [script, ...args], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env: options.env,
      signal: options.signal,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
}
