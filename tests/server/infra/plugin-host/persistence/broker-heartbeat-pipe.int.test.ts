// @subject packages/server/src/infra/plugin-host/broker-entry.ts
// The broker writes its heartbeats on its stderr, not the IPC channel, so a large frame queued on that channel never
// holds a beat back and the watchdog never reads a live broker as silent (D347). A broker spawned without its watchdog's
// IPC channel is not supervised from the start and exits. This test plays the watchdog's half directly, so it reads the
// raw pipe.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { jsonValueSchema } from "@orb/kit/json";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { PLUGIN_BROKER_LIVENESS_BOUND_MS } from "#server/infra/plugin-host/budgets.ts";
import { formatPluginBrokerArguments } from "#server/infra/plugin-host/process-argv.ts";
import { pluginBrokerExecArgv } from "#server/infra/plugin-host/process-permission.ts";
import { NATIVE_TIMEOUT_MS } from "../process-runtime.fixtures.ts";

const BROKER_ENTRY = fileURLToPath(new URL("../../../../../packages/server/src/infra/plugin-host/broker-entry.ts", import.meta.url));
const PRIVATE_DIRECTORY_MODE = 0o700;
// Read beats over two liveness bounds; several must arrive and no gap between them reaches the bound, or the watchdog
// would judge a beating broker as silent.
const BEATS_WINDOW_MS = 2 * PLUGIN_BROKER_LIVENESS_BOUND_MS;
const BEATS_MIN = 3;

async function brokerDir(name: string, ids: ReturnType<typeof createSeededIds>): Promise<string> {
  const directory = join(process.cwd(), ".plugin-broker-heartbeat", ids.uuid(), name);
  await mkdir(directory, { mode: PRIVATE_DIRECTORY_MODE, recursive: true });
  return directory;
}

function spawnBroker(directory: string, generation: string, withChannel: boolean): ReturnType<typeof spawn> {
  return spawn(
    process.execPath,
    [
      ...pluginBrokerExecArgv(),
      BROKER_ENTRY,
      ...formatPluginBrokerArguments({ directory, workerMaximum: 1, generation, nodeEnvironment: "test", logLevel: "silent" }),
    ],
    {
      cwd: directory,
      env: { ["NODE_ENV"]: "test" },
      // The watchdog pipes the broker's stderr for its beats and gives it the IPC channel; the second case drops the channel.
      stdio: withChannel ? ["ignore", "inherit", "pipe", "ipc"] : ["ignore", "inherit", "pipe"],
    },
  );
}

test("the broker's heartbeats arrive on its stderr, not the IPC channel, so a frame on that channel cannot hold them back", {
  tags: ["slow"],
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const ids = createSeededIds();
  const directory = await brokerDir("beats", ids);
  const generation = ids.uuid();
  const broker = spawnBroker(directory, generation, true);
  await using lifetime = new AsyncDisposableStack();
  const exited = once(broker, "exit");
  lifetime.defer(async () => {
    if (broker.exitCode === null && broker.signalCode === null) {
      broker.kill("SIGKILL");
    }
    await exited;
  });
  const beatPipe = broker.stderr;
  if (!(beatPipe instanceof Readable)) {
    throw new Error("the broker was spawned with its stderr piped");
  }
  // Only the broker's heartbeat writes this quiet broker's stderr, so every line is a beat. With the beat put back on the
  // IPC channel the pipe is silent and no beat arrives here, where a frame queued ahead of it on that channel could have
  // delayed it.
  // The gaps are read from each beat's own send time, as the watchdog judges them after draining the pipe, so a reader
  // that gets the CPU late under load still sees the cadence the broker kept.
  const sent: number[] = [];
  createInterface({ input: beatPipe }).on("line", (line) => {
    const beat = jsonValueSchema.parse(JSON.parse(line));
    const at = typeof beat === "object" && beat !== null && !Array.isArray(beat) ? beat["sentAtMs"] : undefined;
    if (typeof at === "number") {
      sent.push(at);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, BEATS_WINDOW_MS));
  expect(sent.length).toBeGreaterThanOrEqual(BEATS_MIN);
  const gaps = sent.slice(1).map((at, index) => at - (sent[index] ?? at));
  expect(Math.max(...gaps)).toBeLessThan(PLUGIN_BROKER_LIVENESS_BOUND_MS);
});

test("a broker spawned without its watchdog's IPC channel exits at once instead of running as a live broker", {
  tags: ["slow"],
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const ids = createSeededIds();
  const directory = await brokerDir("no-channel", ids);
  const broker = spawnBroker(directory, ids.uuid(), false);
  await once(broker, "exit");
  // A broker that refused to start leaves a non-zero exit code or a kill signal; either way it is not a live broker.
  expect(broker.exitCode === 0 && broker.signalCode === null).toBe(false);
});
