// The SDK still owns Query and protocol decoding; this adapter replaces only its physical executable.

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { SeededIds } from "../iso/ids.ts";
import { createSeededIds } from "../iso/ids.ts";
import type { SdkScriptInput, SdkScriptSpawn } from "./contract/sdk-process.ts";
import { SDK_SCRIPT_FRAME_NAMES, SDK_SCRIPT_IDENTITY_TYPE, sdkScriptIdentitySchema } from "./contract/sdk-process.ts";

export type { SdkPrivateDiagnosticInput, SdkPrivateDiagnosticResult } from "./contract/sdk-private-diagnostics.ts";
export { SDK_PRIVATE_DIAGNOSTIC_SINKS, sdkPrivateDiagnosticResultSchema } from "./contract/sdk-private-diagnostics.ts";
export type { SdkScriptSpawn } from "./contract/sdk-process.ts";
export { SDK_SCRIPT_IDENTITY_TYPE } from "./contract/sdk-process.ts";

/** Supply fixture-only identity before native Query writes its first physical protocol record. */
export function createSdkProcessIdentity(ids: SeededIds = createSeededIds()): (child: ChildProcessWithoutNullStreams) => void {
  return (child): void => {
    const identity = sdkScriptIdentitySchema.parse({
      type: SDK_SCRIPT_IDENTITY_TYPE,
      sessionId: ids.uuid(),
      frames: Object.fromEntries(SDK_SCRIPT_FRAME_NAMES.map((name) => [name, ids.uuid()])),
    });
    child.stdin.write(`${JSON.stringify(identity)}\n`);
  };
}

/** Execute a trusted proof script with the SDK's actual environment, working directory and cancellation. */
export function createSdkProcessSpawner(scriptModule: URL, args: readonly string[] = []): SdkScriptSpawn {
  const script = fileURLToPath(scriptModule);
  const identify = createSdkProcessIdentity();
  return (options) => {
    const child = spawn(process.execPath, [script, ...args, ...options.args], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env: options.env,
      signal: options.signal,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    identify(child);
    return child;
  };
}

/** Consume the private parent edge record; only subsequent records belong to native Query. */
export async function readSdkProcessInput(): Promise<SdkScriptInput> {
  const input = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
  const first = await input.next();
  if (first.done) {
    throw new Error("the physical SDK edge received no parent identity");
  }
  const identity = sdkScriptIdentitySchema.parse(JSON.parse(first.value));
  const resume = process.argv.find((argument) => argument.startsWith("--resume="))?.slice("--resume=".length);
  const available = new Map(Object.entries(identity.frames));
  return {
    lines: input,
    sessionId: resume ?? identity.sessionId,
    frameId: (name: string): string => {
      const uuid = available.get(name);
      if (uuid === undefined) {
        throw new Error(`the physical SDK edge exhausted its parent frame identity: ${name}`);
      }
      available.delete(name);
      return uuid;
    },
  };
}
