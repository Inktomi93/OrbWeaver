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
import type { PluginIpcMessage } from "./contract/process-protocol.ts";
import { formatPluginBrokerArguments, parsePluginBrokerWatchdogArguments } from "./process-argv.ts";
import { PluginIpcSender, parsePluginIpcMessage, relayFrame } from "./process-channel.ts";
import { pluginBrokerExecArgv } from "./process-permission.ts";
import { rpcError } from "./process-protocol.ts";
import type { BrokerHeartbeat } from "./watchdog-policy.ts";
import { brokerWatchdogFailure, readBrokerStderrLine } from "./watchdog-policy.ts";

const BROKER_ENTRY = fileURLToPath(new URL("./broker-entry.ts", import.meta.url));
const BROKER_RESTART_DELAY_MS = 1000;
const { directory, workerMaximum, memoryLimitBytes, nodeEnvironment, logLevel } = parsePluginBrokerWatchdogArguments(process.argv.slice(2));
const stop = Promise.withResolvers<void>();
// Set once the watchdog is told to stop: from then on it closes its relay to the broker and ends it.
let stopping = false;
// When the watchdog was told to stop, on the judgement clock.
let stoppedAt: number | undefined;
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
  // A relay throws only after the failing sender's own failure owner ran, which closes the channel it failed (the
  // broker's channel is retired in superviseOneBroker; the app's stops this watchdog), or on a sender already closed for
  // that reason. The broker's exit settles superviseOneBroker, which sends the app a stopped frame.
  try {
    relayFrame(message, brokerSender, appSender);
  } catch (error) {
    reportChannelFailure("the app-to-broker relay", error);
  }
});

// The watchdog's one report channel is its stderr, which the app inherits; a channel failure is written there before
// the teardown it causes, so the restart line that follows has its cause beside it.
function reportChannelFailure(channel: string, error: unknown): void {
  const { name, message } = rpcError(error);
  process.stderr.write(`plugin broker watchdog: ${channel} failed (${name}: ${message})\n`);
}

// A broker that sends what its host code never sends, a malformed message, another generation's frame or a stopped
// frame, is not trusted to act on a closed channel, so it is ended at once. `kill()` is the forced end that behaves the
// same on every platform; no handler in the broker is meant to run (`.claude/rules/server.md`, Windows, macOS and Linux).
function forwardBrokerFrame(message: PluginIpcMessage | null, generation: string, broker: ChildProcess, sender: PluginIpcSender): boolean {
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

interface BeatReader {
  /** The key the broker sent with its readiness, once read. */
  readonly key: () => string | undefined;
  readonly beat: (heartbeat: BrokerHeartbeat) => void;
  readonly malformed: () => void;
}

// The broker's host code writes one keyed JSON beat per line on its stderr; a keyed line that is not a beat ends the
// broker. A beat-shaped line without the key is the broker's own beat read before its readiness, or a line a Worker
// forged; it is neither a beat nor text the app needs, so it is dropped. Every other line is the broker's report, Node's
// own or a Worker's, passed on to the stderr the app reads.
function readBeats(beatPipe: Readable, reader: BeatReader): void {
  createInterface({ input: beatPipe, crlfDelay: Number.POSITIVE_INFINITY }).on("line", (line) => {
    const read = readBrokerStderrLine(line, reader.key());
    if (read.kind === "text") {
      process.stderr.write(`${line}\n`);
    } else if (read.kind === "malformed") {
      reader.malformed();
    } else if (read.kind === "beat") {
      reader.beat(read.heartbeat);
    }
  });
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
  // The key the broker's beats carry, read from its readiness (watchdog-policy.ts).
  let beatKey: string | undefined;
  // When this broker's channel was closed for a failure, on the judgement clock.
  let retiredAt: number | undefined;
  // A failed channel to the broker is closed, which an honest broker answers by exiting; the judgement ends one that
  // has not after the liveness bound, as it ends a broker that ignores a stop.
  const retire = (reason: string): void => {
    failure ??= `plugin broker watchdog: ${reason}`;
    retiredAt ??= performance.now();
    if (brokerSender === sender) {
      brokerSender = undefined;
    }
    if (broker.connected) {
      broker.disconnect();
    }
  };
  const sender = new PluginIpcSender(
    (message, callback) => {
      broker.send(message, callback);
    },
    () => retire("the watchdog-to-broker channel failed"),
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
      // The two lines below are diagnostics, not failures, so a silent log level keeps them off stderr.
      if (logLevel === "silent") {
        return;
      }
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
    // Bytes the broker's host code never writes: it is ended at once, as `forwardBrokerFrame` says why.
    const malformed = (reason: string): void => {
      failure = `plugin broker watchdog: ${reason}`;
      broker.kill("SIGKILL");
    };
    broker.on("message", (value: unknown) => {
      const message = parsePluginIpcMessage(value);
      if (message?.kind === "ready" && message.generation === generation) {
        // A broker gives its key once, with its readiness, and the app's readiness never carries it.
        if (message.beatKey === undefined || beatKey !== undefined) {
          malformed("broker sent a readiness without its one beat key");
          return;
        }
        beatKey = message.beatKey;
        forwardBrokerFrame({ kind: "ready", generation }, generation, broker, sender);
        return;
      }
      if (!forwardBrokerFrame(message, generation, broker, sender)) {
        malformed("broker sent a malformed IPC message");
      }
    });
    const beatPipe = broker.stderr;
    if (!(beatPipe instanceof Readable)) {
      malformed("broker has no heartbeat pipe");
    } else {
      readBeats(beatPipe, {
        key: () => beatKey,
        malformed: () => malformed("broker sent a malformed memory heartbeat"),
        beat: (heartbeat) => {
          if (newestSentAtMs === undefined || heartbeat.sentAtMs > newestSentAtMs) {
            newestSentAtMs = heartbeat.sentAtMs;
            heardSinceJudged = true;
          }
          rssBytes = heartbeat.rssBytes;
          report(heartbeat);
        },
      });
    }
    broker.once("error", (error) => settle(`plugin broker watchdog: failed to start broker: ${error.message}`));
    broker.once("exit", (code, signal) => settle(failure ?? `plugin broker watchdog: broker exited (${signal ?? code ?? "unknown"})`));

    // Node runs timers before it reads the pipe, so a judgement made in the timer would see a watchdog stall as broker
    // silence. Each judgement waits for the check phase, after the beats waiting in the pipe were read, and one late
    // tick after a stall counts as one interval at most: only consecutive intervals with no newer beat end the broker
    // (D347).
    //
    // Each end below is a `kill()`, never a closed channel first. A broker past its heartbeat bound has a main thread
    // that runs no handler, so it would never read the close (D347); one past its RSS ceiling must stop growing now,
    // not after its own shutdown; and one still running a bound after its stop or its retirement has already ignored a
    // closed channel. `kill()` is the forced end that behaves the same on every platform (`.claude/rules/server.md`,
    // Windows, macOS and Linux).
    const judge = (): void => {
      misses = heardSinceJudged ? 0 : misses + 1;
      heardSinceJudged = false;
      const endingSince = Math.min(stoppedAt ?? Number.POSITIVE_INFINITY, retiredAt ?? Number.POSITIVE_INFINITY);
      const reason = brokerWatchdogFailure(performance.now(), memoryLimitBytes, {
        startedAt,
        heard: newestSentAtMs !== undefined,
        misses,
        ...(rssBytes === undefined ? {} : { rssBytes }),
        ...(Number.isFinite(endingSince) ? { stoppedAt: endingSince } : {}),
      });
      if (reason !== null) {
        // A stop reports no failure of its own, so a broker that had to be ended is named here.
        if (stopping || retiredAt !== undefined) {
          process.stderr.write(`${reason}; the broker did not exit on its stop\n`);
        }
        failure ??= reason;
        broker.kill("SIGKILL");
      }
    };
    const monitor = setInterval(() => {
      setImmediate(judge);
    }, PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS);
    monitor.unref();
    broker.once("exit", () => clearInterval(monitor));
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
  stoppedAt ??= performance.now();
  stop.resolve();
  brokerSender?.close();
  // The broker ends when its channel closes. One that does not is ended by the judgement with `kill()` once
  // PLUGIN_BROKER_LIVENESS_BOUND_MS of wall time has passed since this stop (watchdog-policy.ts).
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
