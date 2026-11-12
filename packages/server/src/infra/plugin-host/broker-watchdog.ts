// infra/plugin-host/broker-watchdog — out-of-process RSS and liveness supervisor for the plugin broker.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS, pluginIpcShareBytes } from "./budgets.ts";
import { formatPluginBrokerArguments, parsePluginBrokerWatchdogArguments } from "./process-argv.ts";
import { PluginIpcSender, parsePluginIpcMessage, relayFrame } from "./process-channel.ts";
import { pluginBrokerExecArgv } from "./process-permission.ts";
import { PLUGIN_BROKER_BEAT_MAX_BYTES, rpcError } from "./process-protocol.ts";
import { brokerWatchdogFailure } from "./watchdog-policy.ts";

const BROKER_ENTRY = fileURLToPath(new URL("./broker-entry.ts", import.meta.url));
const BROKER_RESTART_DELAY_MS = 1000;
const { directory, workerMaximum, memoryLimitBytes, nodeEnvironment, logLevel } = parsePluginBrokerWatchdogArguments(process.argv.slice(2));
const stop = Promise.withResolvers<void>();
// Set once the watchdog is told to stop: from then on it closes its relay to the broker and ends it.
let stopping = false;
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
  pluginIpcShareBytes(workerMaximum),
);
process.on("message", (value: unknown) => {
  const message = parsePluginIpcMessage(value);
  if (message === null || message.kind !== "frame") {
    stopBroker();
    return;
  }
  // A frame for a stopped generation, or one the app sent while this watchdog stops its broker, is part of a
  // replacement or a shutdown: the broker it was for is ending, so it is dropped, not reported as a broken relay.
  if (message.generation !== activeGeneration || brokerSender === undefined || stopping) {
    return;
  }
  // Any relay failure SIGKILLs the broker, whatever its class: its exit settles superviseOneBroker, which sends the
  // app a stopped frame, and process-runtime's onDisconnect rejects pending work.
  try {
    relayFrame(message, brokerSender, appSender);
  } catch (error) {
    reportChannelFailure("the app-to-broker relay", error);
    activeBroker?.kill("SIGKILL");
  }
});

// The watchdog's one report channel is its stderr, which the app inherits; a channel failure is written there before
// the teardown it causes, so the restart line that follows has its cause beside it.
function reportChannelFailure(channel: string, error: unknown): void {
  const { name, message } = rpcError(error);
  process.stderr.write(`plugin broker watchdog: ${channel} failed (${name}: ${message})\n`);
}

interface BrokerHeartbeat {
  /** The broker's own monotonic clock at send; compared only with that broker's earlier heartbeats. */
  readonly sentAtMs: number;
  readonly rssBytes: number;
  readonly peakPhysicalWorkers: number;
  readonly execArgv: readonly string[];
  readonly nodeOptions: null;
}

const HEARTBEAT_KIND = "plugin-broker-memory";

// A stderr line's JSON, or null for a line that is not JSON or is too long to be a beat. `JSON.parse` throws only
// `SyntaxError`; any other fault is a defect and stays loud.
function parseBeatLine(line: string): unknown {
  if (Buffer.byteLength(line, "utf8") > PLUGIN_BROKER_BEAT_MAX_BYTES) {
    return null;
  }
  try {
    return JSON.parse(line);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

// Whether a stderr line claims to be a heartbeat. Any other line is the broker's or Node's own text.
function claimsHeartbeat(message: unknown): message is object {
  return typeof message === "object" && message !== null && Reflect.get(message, "kind") === HEARTBEAT_KIND;
}

function parseHeartbeat(message: object): BrokerHeartbeat | null {
  const sentAtMs: unknown = Reflect.get(message, "sentAtMs");
  const rssBytes: unknown = Reflect.get(message, "rssBytes");
  const peakPhysicalWorkers: unknown = Reflect.get(message, "peakPhysicalWorkers");
  const execArgv: unknown = Reflect.get(message, "execArgv");
  const nodeOptions: unknown = Reflect.get(message, "nodeOptions");
  return typeof sentAtMs === "number" &&
    Number.isFinite(sentAtMs) &&
    typeof rssBytes === "number" &&
    Number.isSafeInteger(rssBytes) &&
    rssBytes >= 0 &&
    typeof peakPhysicalWorkers === "number" &&
    Number.isSafeInteger(peakPhysicalWorkers) &&
    peakPhysicalWorkers >= 0 &&
    Array.isArray(execArgv) &&
    execArgv.every((value) => typeof value === "string") &&
    nodeOptions === null
    ? { sentAtMs, rssBytes, peakPhysicalWorkers, execArgv, nodeOptions }
    : null;
}

function forwardBrokerFrame(value: unknown, generation: string, broker: ChildProcess, sender: PluginIpcSender): boolean {
  const message = parsePluginIpcMessage(value);
  if (message === null) {
    return false;
  }
  if (message.generation !== generation || message.kind === "stopped") {
    broker.kill("SIGKILL");
    return true;
  }
  // Any failure of the app channel calls stopBroker, which ends the watchdog; the app's child exit handler
  // (onWatchdogGone) runs onDisconnect and rejects pending work.
  try {
    if (message.kind === "frame") {
      relayFrame(message, appSender, sender);
    } else {
      appSender.send(message);
    }
  } catch (error) {
    reportChannelFailure("the broker-to-app relay", error);
    stopBroker();
  }
  return true;
}

async function superviseOneBroker(): Promise<string> {
  const generation = randomUUID();
  const startedAt = performance.now();
  let newestSentAtMs: number | undefined;
  let heardSinceJudged = false;
  let misses = 0;
  let rssBytes: number | undefined;
  let failure: string | undefined;
  let runtimeReported = false;
  let reportedPeakPhysicalWorkers = -1;
  const broker = spawn(
    process.execPath,
    [...pluginBrokerExecArgv(), BROKER_ENTRY, ...formatPluginBrokerArguments({ directory, workerMaximum, generation, nodeEnvironment, logLevel })],
    {
      env: { ["NODE_ENV"]: nodeEnvironment },
      // A guest Worker can read the broker's working directory whatever the grants say; keep it the private one.
      cwd: directory,
      // The broker's stderr carries its heartbeats; the IPC channel carries frames only.
      stdio: ["ignore", "inherit", "pipe", "ipc"],
    },
  );
  activeBroker = broker;
  activeGeneration = generation;
  const sender = new PluginIpcSender(
    (message, callback) => {
      broker.send(message, callback);
    },
    () => broker.kill("SIGKILL"),
    pluginIpcShareBytes(workerMaximum),
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
    const report = (heartbeat: BrokerHeartbeat): void => {
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
    };
    const malformed = (reason: string): void => {
      failure = `plugin broker watchdog: ${reason}`;
      broker.kill("SIGKILL");
    };
    broker.on("message", (message: unknown) => {
      if (!forwardBrokerFrame(message, generation, broker, sender)) {
        malformed("broker sent a malformed IPC message");
      }
    });
    const beatPipe = broker.stderr;
    if (!(beatPipe instanceof Readable)) {
      malformed("broker has no heartbeat pipe");
    } else {
      // The broker's host code writes one JSON beat per line here; a line that claims to be a beat and is not one ends
      // the broker. Every other line is the broker's report or Node's own, passed on to the stderr the app reads.
      createInterface({ input: beatPipe, crlfDelay: Number.POSITIVE_INFINITY }).on("line", (line) => {
        const claimed = parseBeatLine(line);
        if (!claimsHeartbeat(claimed)) {
          process.stderr.write(`${line}\n`);
          return;
        }
        const heartbeat = parseHeartbeat(claimed);
        if (heartbeat === null) {
          malformed("broker sent a malformed memory heartbeat");
          return;
        }
        if (newestSentAtMs === undefined || heartbeat.sentAtMs > newestSentAtMs) {
          newestSentAtMs = heartbeat.sentAtMs;
          heardSinceJudged = true;
        }
        rssBytes = heartbeat.rssBytes;
        report(heartbeat);
      });
    }
    broker.once("error", (error) => settle(`plugin broker watchdog: failed to start broker: ${error.message}`));
    broker.once("exit", (code, signal) => settle(failure ?? `plugin broker watchdog: broker exited (${signal ?? code ?? "unknown"})`));

    // Node runs timers before it reads the pipe, so a judgement made in the timer would see a watchdog stall as broker
    // silence. Each judgement waits for the check phase, after the beats waiting in the pipe were read, and one late
    // tick after a stall counts as one interval at most: only consecutive intervals with no newer beat end the broker
    // (D347).
    const judge = (): void => {
      misses = heardSinceJudged ? 0 : misses + 1;
      heardSinceJudged = false;
      const reason = brokerWatchdogFailure(performance.now(), memoryLimitBytes, {
        startedAt,
        heard: newestSentAtMs !== undefined,
        misses,
        ...(rssBytes === undefined ? {} : { rssBytes }),
      });
      if (reason !== null) {
        failure = reason;
        // A stop reports no failure of its own, so a broker that had to be ended is named here.
        if (stopping) {
          process.stderr.write(`${reason}; the broker did not exit on its stop\n`);
        }
        broker.kill("SIGKILL");
      }
    };
    const monitor = setInterval(() => {
      setImmediate(judge);
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
    // Any failed stopped-frame delivery calls stopBroker, which ends the watchdog and its broker; the app's child
    // exit handler (onWatchdogGone) runs onDisconnect and rejects pending work.
    try {
      appSender.send({ kind: "stopped", generation, error: rpcError(new Error(result)) });
    } catch (error) {
      reportChannelFailure("the stopped-frame delivery", error);
      stopBroker();
    }
  }
  return result;
}

function stopBroker(): void {
  stopping = true;
  stop.resolve();
  brokerSender?.close();
  // The broker ends when its channel closes. One that does not stops beating, since it beats only while connected, and
  // the liveness check below ends it with `kill()` within PLUGIN_BROKER_LIVENESS_BOUND_MS.
  if (activeBroker?.connected === true) {
    activeBroker.disconnect();
  }
}
// The app stops this watchdog by closing the channel (process-runtime.ts `stopWatchdog`); a dead app closes it too.
process.on("disconnect", stopBroker);

for (;;) {
  const brokerLifetime = superviseOneBroker();
  const outcome = await Promise.race([
    brokerLifetime.then((failure) => ({ kind: "failure", failure }) as const),
    stop.promise.then(() => ({ kind: "stop" }) as const),
  ]);
  if (outcome.kind === "stop") {
    await brokerLifetime;
    break;
  }
  process.stderr.write(`${outcome.failure}; restarting in ${BROKER_RESTART_DELAY_MS}ms\n`);
  const restart = await Promise.race([sleep(BROKER_RESTART_DELAY_MS).then(() => true), stop.promise.then(() => false)]);
  if (!restart) {
    break;
  }
}

appSender.close();
if (process.connected) {
  process.disconnect?.();
}
