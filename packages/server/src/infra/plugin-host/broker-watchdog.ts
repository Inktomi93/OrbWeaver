// infra/plugin-host/broker-watchdog — out-of-process RSS and liveness supervisor for the plugin broker.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parsePluginBrokerWatchdogArguments } from "./process-argv.ts";
import { PluginIpcSender, parsePluginIpcMessage } from "./process-channel.ts";
import { pluginBrokerExecArgv } from "./process-permission.ts";
import { rpcError } from "./process-protocol.ts";
import { brokerWatchdogFailure, PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS } from "./watchdog-policy.ts";

const BROKER_ENTRY = fileURLToPath(new URL("./broker-entry.ts", import.meta.url));
const BROKER_RESTART_DELAY_MS = 1000;
const { directory, workerMaximum, memoryLimitBytes, nodeEnvironment } = parsePluginBrokerWatchdogArguments(process.argv.slice(2));
const stop = Promise.withResolvers<void>();
let activeBroker: ChildProcess | undefined;
let activeGeneration: string | undefined;
let brokerSender: PluginIpcSender | undefined;
if (process.send === undefined) {
  throw new Error("plugin watchdog: refusing to run without the app IPC channel");
}
const appSender = new PluginIpcSender(
  (message, callback) => {
    process.send?.(message, callback);
  },
  () => stopBroker(),
);
process.on("message", (value: unknown) => {
  const message = parsePluginIpcMessage(value);
  if (message === null || message.kind !== "frame") {
    stopBroker();
    return;
  }
  if (message.generation !== activeGeneration || brokerSender === undefined) {
    return;
  }
  // @orb-waive caught-failure-ownership(catch): relay failure kills the broker, whose exit rejects the app's pending work. Ends if broker exit stops rejecting app commands.
  try {
    brokerSender.send(message);
  } catch {
    activeBroker?.kill("SIGKILL");
  }
});

interface BrokerHeartbeat {
  readonly kind: "plugin-broker-memory";
  readonly rssBytes: number;
  readonly peakPhysicalWorkers: number;
  readonly execArgv: readonly string[];
  readonly nodeOptions: null;
}

function parseHeartbeat(message: unknown): BrokerHeartbeat | null {
  if (typeof message !== "object" || message === null) {
    return null;
  }
  const kind = Reflect.get(message, "kind");
  const rssBytes = Reflect.get(message, "rssBytes");
  const peakPhysicalWorkers = Reflect.get(message, "peakPhysicalWorkers");
  const execArgv = Reflect.get(message, "execArgv");
  const nodeOptions = Reflect.get(message, "nodeOptions");
  return kind === "plugin-broker-memory" &&
    typeof rssBytes === "number" &&
    Number.isSafeInteger(rssBytes) &&
    rssBytes >= 0 &&
    typeof peakPhysicalWorkers === "number" &&
    Number.isSafeInteger(peakPhysicalWorkers) &&
    peakPhysicalWorkers >= 0 &&
    Array.isArray(execArgv) &&
    execArgv.every((value) => typeof value === "string") &&
    nodeOptions === null
    ? { kind, rssBytes, peakPhysicalWorkers, execArgv, nodeOptions }
    : null;
}

function forwardBrokerFrame(value: unknown, generation: string, broker: ChildProcess): boolean {
  const message = parsePluginIpcMessage(value);
  if (message === null) {
    return false;
  }
  if (message.generation !== generation || message.kind === "stopped") {
    broker.kill("SIGKILL");
    return true;
  }
  // @orb-waive caught-failure-ownership(catch): an unusable app channel stops supervision and terminates the broker. Ends if stopBroker no longer terminates the broker.
  try {
    appSender.send(message);
  } catch {
    stopBroker();
  }
  return true;
}

async function superviseOneBroker(): Promise<string> {
  const generation = randomUUID();
  const startedAt = performance.now();
  let lastHeartbeatAt: number | undefined;
  let rssBytes: number | undefined;
  let failure: string | undefined;
  let runtimeReported = false;
  let reportedPeakPhysicalWorkers = -1;
  const broker = spawn(process.execPath, [...pluginBrokerExecArgv(), BROKER_ENTRY, directory, String(workerMaximum), generation, nodeEnvironment], {
    env: { ["NODE_ENV"]: nodeEnvironment },
    // A guest Worker can read the broker's working directory whatever the grants say; keep it the private one.
    cwd: directory,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  activeBroker = broker;
  activeGeneration = generation;
  const sender = new PluginIpcSender(
    (message, callback) => {
      broker.send(message, callback);
    },
    () => broker.kill("SIGKILL"),
  );
  brokerSender = sender;

  const result = await new Promise<string>((resolve) => {
    let settled = false;
    const settle = (reason: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(reason);
    };
    broker.on("message", (message: unknown) => {
      if (forwardBrokerFrame(message, generation, broker)) {
        return;
      }
      const heartbeat = parseHeartbeat(message);
      if (heartbeat === null) {
        failure = "plugin broker watchdog: broker sent a malformed memory heartbeat";
        broker.kill("SIGKILL");
        return;
      }
      lastHeartbeatAt = performance.now();
      rssBytes = heartbeat.rssBytes;
      if (heartbeat.peakPhysicalWorkers > reportedPeakPhysicalWorkers) {
        reportedPeakPhysicalWorkers = heartbeat.peakPhysicalWorkers;
        process.stderr.write(`plugin broker watchdog: residency ${JSON.stringify({ peakPhysicalWorkers: heartbeat.peakPhysicalWorkers, workerMaximum })}\n`);
      }
      if (!runtimeReported) {
        runtimeReported = true;
        process.stderr.write(
          `plugin broker watchdog: runtime ${JSON.stringify({ execArgv: heartbeat.execArgv, nodeOptions: heartbeat.nodeOptions, rssLimitBytes: memoryLimitBytes })}\n`,
        );
      }
    });
    broker.once("error", (error) => settle(`plugin broker watchdog: failed to start broker: ${error.message}`));
    broker.once("exit", (code, signal) => settle(failure ?? `plugin broker watchdog: broker exited (${signal ?? code ?? "unknown"})`));

    const monitor = setInterval(() => {
      const reason = brokerWatchdogFailure(performance.now(), memoryLimitBytes, {
        startedAt,
        ...(lastHeartbeatAt === undefined ? {} : { lastHeartbeatAt }),
        ...(rssBytes === undefined ? {} : { rssBytes }),
      });
      if (reason !== null) {
        failure = reason;
        broker.kill("SIGKILL");
      }
    }, PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS);
    monitor.unref();
    broker.once("close", () => clearInterval(monitor));
  });

  sender.close();
  if (activeBroker === broker) {
    activeBroker = undefined;
    activeGeneration = undefined;
    brokerSender = undefined;
  }
  if (process.connected) {
    // @orb-waive caught-failure-ownership(catch): failed lifecycle delivery stops the watchdog instead of leaving its broker orphaned. Ends if stopBroker no longer terminates the broker.
    try {
      appSender.send({ kind: "stopped", generation, error: rpcError(new Error(result)) });
    } catch {
      stopBroker();
    }
  }
  return result;
}

function stopBroker(): void {
  stop.resolve();
  brokerSender?.close();
  activeBroker?.kill("SIGTERM");
}
process.on("SIGINT", stopBroker);
process.on("SIGTERM", stopBroker);
process.on("disconnect", stopBroker);

for (;;) {
  const outcome = await Promise.race([
    superviseOneBroker().then((failure) => ({ kind: "failure", failure }) as const),
    stop.promise.then(() => ({ kind: "stop" }) as const),
  ]);
  if (outcome.kind === "stop") {
    break;
  }
  process.stderr.write(`${outcome.failure}; restarting in ${BROKER_RESTART_DELAY_MS}ms\n`);
  const restart = await Promise.race([sleep(BROKER_RESTART_DELAY_MS).then(() => true), stop.promise.then(() => false)]);
  if (!restart) {
    break;
  }
}
