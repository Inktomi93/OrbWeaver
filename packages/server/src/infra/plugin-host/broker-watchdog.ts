// infra/plugin-host/broker-watchdog — out-of-process RSS and liveness supervisor for the plugin broker.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parsePluginBrokerWatchdogArguments } from "./process-argv.ts";
import { brokerWatchdogFailure, PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS } from "./watchdog-policy.ts";

const BROKER_ENTRY = fileURLToPath(new URL("./broker-entry.ts", import.meta.url));
const BROKER_RESTART_DELAY_MS = 1000;
const { socketPath, tokenPath, workerMaximum, memoryLimitBytes, nodeEnvironment } = parsePluginBrokerWatchdogArguments(process.argv.slice(2));
const stop = Promise.withResolvers<void>();
let activeBroker: ChildProcess | undefined;

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

async function superviseOneBroker(): Promise<string> {
  const startedAt = performance.now();
  let lastHeartbeatAt: number | undefined;
  let rssBytes: number | undefined;
  let failure: string | undefined;
  let runtimeReported = false;
  let reportedPeakPhysicalWorkers = -1;
  const broker = spawn(process.execPath, [BROKER_ENTRY, socketPath, tokenPath, String(workerMaximum), nodeEnvironment], {
    env: { ["NODE_ENV"]: nodeEnvironment },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  activeBroker = broker;

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

  if (activeBroker === broker) {
    activeBroker = undefined;
  }
  return result;
}

function stopBroker(): void {
  stop.resolve();
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
