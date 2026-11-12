// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// The plugin host's watchdog and broker start with an environment of their own, never the server's: NODE_ENV alone. So
// no reserved Claude key, app secret or credential the server holds reaches a plugin process, whatever the server's
// environment carries (D8).

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { PluginHostSeamDeps } from "@orb/server/infra/plugin-host";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { BASE_GRANTS, installGuest, NATIVE_TIMEOUT_MS, NOOP_COMMAND } from "./process-runtime.fixtures.ts";

// NODE_ENV, plus the two names Node itself adds to every child it gives an IPC channel.
const OWN_ENVIRONMENT = ["NODE_CHANNEL_FD", "NODE_CHANNEL_SERIALIZATION_MODE", "NODE_ENV"];

// The names in a running process's initial environment, from its Linux process entry.
function environmentNames(pid: number): readonly string[] {
  return readFileSync(`/proc/${String(pid)}/environ`, "utf8")
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.slice(0, entry.indexOf("=")))
    .toSorted();
}

test("the plugin watchdog and its broker start with NODE_ENV and their IPC channel alone, never the server's environment", {
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const watchdogs: ChildProcess[] = [];
  const capture: NonNullable<PluginHostSeamDeps["spawn"]> = (command, args, options): ChildProcess => {
    const child = spawn(command, args, options);
    watchdogs.push(child);
    return child;
  };
  await using root = await createServerHarness({ pluginSpawn: capture });
  const guest = await installGuest(root, "child-env", `const h=orb.host(1);${NOOP_COMMAND}`, BASE_GRANTS);
  expect((await guest.enable()).status).toBe("enabled");
  await guest.invoke("noop");

  const [watchdog] = watchdogs;
  if (watchdog?.pid === undefined) {
    throw new Error("the production host did not spawn its watchdog");
  }
  // The broker is the watchdog's one child process, and no production surface names its pid.
  const broker = Number(
    readFileSync(`/proc/${String(watchdog.pid)}/task/${String(watchdog.pid)}/children`, "utf8")
      .trim()
      .split(" ")[0],
  );
  expect(environmentNames(watchdog.pid)).toEqual(OWN_ENVIRONMENT);
  expect(environmentNames(broker)).toEqual(OWN_ENVIRONMENT);
});
